import { supabase } from '../lib/supabase'
import { exigirTenant } from '../lib/tenant'

// ============================================================================
// FILA DE ESPERA — o que faltou peça
// ============================================================================
// Na live, quando duas clientes pedem a mesma peça, uma leva e as outras vão
// para fila1/fila2/fila3 da linha da venda. Cada nome nessas três colunas é
// uma venda que não aconteceu por falta de peça.
//
// É daí que sai o relatório: a fila deixa de ser um bilhete solto na linha da
// venda e passa a ser a lista de compras — quantas pessoas ficaram esperando
// cada peça, em que tamanho, em que cor, e quanto de venda ficou na mesa.
// ============================================================================

const tid = (tenantId) => exigirTenant(tenantId, 'filaEsperaService')

const TAMANHO_PAGINA = 1000

// Vendas nesses status não contam como vendidas: a peça voltou para a loja
const STATUS_SEM_VENDA = ['CANCELADO', 'DEVOLVIDO']

function toNum(val) {
  if (!val && val !== 0) return 0
  if (typeof val === 'string') {
    return parseFloat(String(val).replace(/\./g, '').replace(',', '.')) || 0
  }
  return Number(val) || 0
}

function precoFinal(venda) {
  const promocional = toNum(venda.preco_promocional)
  return promocional > 0 ? promocional : toNum(venda.preco)
}

export function fmtReal(val) {
  const n = toNum(val)
  return 'R$ ' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

// O mesmo @ aparece escrito de três jeitos (com arroba, sem, caixa alta).
// Sem normalizar, a mesma cliente conta como três pessoas na fila.
export function normalizarCliente(nome) {
  return String(nome || '').trim().replace(/^@+/, '').toLowerCase()
}

// Mostra o @ como a loja escreve: arroba na frente, sem repetir a que já veio
export function exibirCliente(nome) {
  const limpo = String(nome || '').trim().replace(/^@+/, '')
  return limpo ? '@' + limpo : ''
}

function texto(val) {
  return String(val || '').trim()
}

// Chave de agrupamento sem caixa nem espaço sobrando: "Rosa " e "rosa" são a
// mesma cor, e separá-las partiria a fila da mesma peça em duas linhas
function chave(partes) {
  return partes.map(p => texto(p).toLowerCase()).join('|')
}

function nomePeca(v) {
  return [texto(v.produto), texto(v.modelo), texto(v.marca)].filter(Boolean).join(' ') || '(sem nome)'
}

// ── Busca ───────────────────────────────────────────────────────────────────

// Período filtrado por data_live; linha sem data_live cai no created_at, senão
// a peça cadastrada e vendida fora da live ficaria de fora do relatório.
// Paginado porque o Supabase corta em 1000 linhas sem avisar.
export async function getVendasFilaEspera(tenantId, { dataInicio, dataFim } = {}) {
  const COLUNAS = 'id, produto, modelo, cor, marca, tamanho, preco, preco_promocional, codigo, ' +
    'cliente_nome, data_live, live_nome, status, fila1, fila2, fila3, created_at'

  function montarQuery(pagina) {
    let q = supabase
      .from('vendas')
      .select(COLUNAS)
      .eq('tenant_id', tid(tenantId))
      .eq('etapa', 'fechada')
      .order('data_live', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(pagina * TAMANHO_PAGINA, (pagina + 1) * TAMANHO_PAGINA - 1)

    if (dataInicio && dataFim) {
      q = q.or(`and(data_live.gte.${dataInicio},data_live.lte.${dataFim}),and(data_live.is.null,created_at.gte.${dataInicio}T00:00:00,created_at.lte.${dataFim}T23:59:59)`)
    } else if (dataInicio) {
      q = q.or(`data_live.gte.${dataInicio},and(data_live.is.null,created_at.gte.${dataInicio}T00:00:00)`)
    } else if (dataFim) {
      q = q.or(`data_live.lte.${dataFim},and(data_live.is.null,created_at.lte.${dataFim}T23:59:59)`)
    }

    return q
  }

  let todas = []
  for (let pagina = 0; ; pagina++) {
    const { data, error } = await montarQuery(pagina)
    if (error) throw error
    if (!data || data.length === 0) break
    todas = todas.concat(data)
    if (data.length < TAMANHO_PAGINA) break
  }
  return todas
}

// Marcas do período, para o filtro. Vem das próprias vendas carregadas.
export function marcasDasVendas(vendas) {
  const nomes = new Set()
  for (const v of vendas) {
    const marca = texto(v.marca)
    if (marca) nomes.add(marca)
  }
  return [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

// ── Agregação ───────────────────────────────────────────────────────────────

// Quebra cada linha de venda nos nomes da fila: um pedido não atendido por
// nome. Três colunas na mesma linha = três peças que faltaram.
export function pedidosEmFila(vendas) {
  const pedidos = []
  for (const v of vendas) {
    const valor = precoFinal(v)
    ;[v.fila1, v.fila2, v.fila3].forEach((nome, i) => {
      const cliente = texto(nome)
      if (!cliente) return
      pedidos.push({
        id: `${v.id}-${i + 1}`,
        vendaId: v.id,
        posicao: i + 1,
        cliente,
        clienteKey: normalizarCliente(cliente),
        levou: texto(v.cliente_nome),
        produto: texto(v.produto),
        modelo: texto(v.modelo),
        marca: texto(v.marca),
        cor: texto(v.cor),
        tamanho: texto(v.tamanho),
        codigo: texto(v.codigo),
        preco: valor,
        dataLive: v.data_live || (v.created_at || '').slice(0, 10),
        liveNome: texto(v.live_nome),
        status: texto(v.status).toUpperCase(),
      })
    })
  }
  return pedidos
}

// Quantas unidades de cada peça saíram no período. Sem isso o número da fila
// fica sem régua: 4 esperando numa peça que vendeu 2 é outra conversa de
// compra do que 4 esperando numa que vendeu 30.
function contarVendidas(vendas) {
  const porPeca = new Map()
  const porProduto = new Map()
  for (const v of vendas) {
    if (!texto(v.cliente_nome)) continue
    if (STATUS_SEM_VENDA.includes(texto(v.status).toUpperCase())) continue
    const kPeca = chave([v.produto, v.modelo, v.marca, v.cor, v.tamanho])
    const kProd = chave([v.produto, v.modelo, v.marca])
    porPeca.set(kPeca, (porPeca.get(kPeca) || 0) + 1)
    porProduto.set(kProd, (porProduto.get(kProd) || 0) + 1)
  }
  return { porPeca, porProduto }
}

// Tabela por peça exata (cor e tamanho incluídos): é essa a linha que vira
// pedido no fornecedor.
export function agruparPorPeca(vendas) {
  const pedidos = pedidosEmFila(vendas)
  const vendidas = contarVendidas(vendas)
  const grupos = new Map()

  for (const p of pedidos) {
    const k = chave([p.produto, p.modelo, p.marca, p.cor, p.tamanho])
    if (!grupos.has(k)) {
      grupos.set(k, {
        k,
        produto: p.produto, modelo: p.modelo, marca: p.marca,
        cor: p.cor, tamanho: p.tamanho, codigo: p.codigo,
        preco: p.preco,
        naFila: 0,
        clientes: new Map(),   // clienteKey → nome como escrito
        valorParado: 0,
        ultimaLive: p.dataLive || '',
        liveNome: p.liveNome,
      })
    }
    const g = grupos.get(k)
    g.naFila++
    g.valorParado += p.preco
    if (p.cliente) g.clientes.set(p.clienteKey, p.cliente)
    if (!g.codigo && p.codigo) g.codigo = p.codigo
    if (!g.preco && p.preco) g.preco = p.preco
    if ((p.dataLive || '') > (g.ultimaLive || '')) {
      g.ultimaLive = p.dataLive || ''
      g.liveNome = p.liveNome
    }
  }

  return [...grupos.values()]
    .map(g => ({
      ...g,
      nome: nomePeca(g),
      vendidas: vendidas.porPeca.get(g.k) || 0,
      pessoas: g.clientes.size,
      listaClientes: [...g.clientes.values()],
    }))
    .sort((a, b) => b.naFila - a.naFila || b.valorParado - a.valorParado)
}

// Mesma peça, visão de grade: produto/modelo/marca numa linha e a fila aberta
// por tamanho e por cor. É a leitura de quem vai escolher a grade da compra.
export function agruparPorProduto(vendas) {
  const pedidos = pedidosEmFila(vendas)
  const vendidas = contarVendidas(vendas)
  const grupos = new Map()

  for (const p of pedidos) {
    const k = chave([p.produto, p.modelo, p.marca])
    if (!grupos.has(k)) {
      grupos.set(k, {
        k,
        produto: p.produto, modelo: p.modelo, marca: p.marca,
        naFila: 0,
        valorParado: 0,
        clientes: new Set(),
        tamanhos: new Map(),
        cores: new Map(),
        ultimaLive: p.dataLive || '',
      })
    }
    const g = grupos.get(k)
    g.naFila++
    g.valorParado += p.preco
    if (p.clienteKey) g.clientes.add(p.clienteKey)
    const tam = p.tamanho || '—'
    const cor = p.cor || '—'
    g.tamanhos.set(tam, (g.tamanhos.get(tam) || 0) + 1)
    g.cores.set(cor, (g.cores.get(cor) || 0) + 1)
    if ((p.dataLive || '') > (g.ultimaLive || '')) g.ultimaLive = p.dataLive || ''
  }

  return [...grupos.values()]
    .map(g => ({
      ...g,
      nome: nomePeca(g),
      vendidas: vendidas.porProduto.get(g.k) || 0,
      pessoas: g.clientes.size,
      // Tamanho em ordem de quem pediu mais: a grade começa pelo que falta mais
      listaTamanhos: [...g.tamanhos.entries()].sort((a, b) => b[1] - a[1]),
      listaCores: [...g.cores.entries()].sort((a, b) => b[1] - a[1]),
    }))
    .sort((a, b) => b.naFila - a.naFila || b.valorParado - a.valorParado)
}

// Visão de atendimento: quem está esperando o quê. Serve para avisar as
// clientes quando a peça entra, em vez de só comprar e esperar que voltem.
export function agruparPorCliente(vendas) {
  const pedidos = pedidosEmFila(vendas)
  const grupos = new Map()

  for (const p of pedidos) {
    if (!p.clienteKey) continue
    if (!grupos.has(p.clienteKey)) {
      grupos.set(p.clienteKey, {
        k: p.clienteKey,
        cliente: p.cliente,
        pedidos: [],
        valorParado: 0,
        ultimaLive: p.dataLive || '',
      })
    }
    const g = grupos.get(p.clienteKey)
    g.pedidos.push(p)
    g.valorParado += p.preco
    if ((p.dataLive || '') > (g.ultimaLive || '')) g.ultimaLive = p.dataLive || ''
  }

  return [...grupos.values()]
    .map(g => ({ ...g, quantas: g.pedidos.length }))
    .sort((a, b) => b.quantas - a.quantas || b.valorParado - a.valorParado)
}

// Cartões do topo
export function resumoFila(vendas) {
  const pedidos = pedidosEmFila(vendas)
  const clientes = new Set(pedidos.map(p => p.clienteKey).filter(Boolean))
  const pecas = new Set(pedidos.map(p => chave([p.produto, p.modelo, p.marca, p.cor, p.tamanho])))
  const vendidasTotal = vendas.filter(v =>
    texto(v.cliente_nome) && !STATUS_SEM_VENDA.includes(texto(v.status).toUpperCase())
  ).length

  return {
    faltaram: pedidos.length,
    clientes: clientes.size,
    pecas: pecas.size,
    valorParado: pedidos.reduce((s, p) => s + p.preco, 0),
    vendidasTotal,
    // Quanto da demanda a loja não conseguiu atender
    perdaPct: vendidasTotal + pedidos.length > 0
      ? (pedidos.length / (vendidasTotal + pedidos.length)) * 100
      : 0,
  }
}
