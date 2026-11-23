// ============================================================================
// LOJA PÚBLICA — catálogo aberto, carrinho e reserva
// ============================================================================
// A página /loja/:slug não tem login e NÃO lê as tabelas direto: produtos tem
// RLS só para authenticated, e expor o cadastro inteiro ao anon entregaria
// custo, estoque e peça despublicada. Tudo passa por aqui, igual ao
// frete-publico: o slug identifica a loja e o service role faz o resto.
//
// POST { acao, slug, ...payload }
//   acao = catalogo | peca | reservar | carrinho | liberar
// ============================================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,60}$/

// Quantas peças o catálogo manda por vez. O resto vem no "Ver mais": sem
// limite, um cadastro de mil peças viraria um payload de megabytes no 3G da
// cliente.
const POR_PAGINA = 60

/** Preço que a cliente paga: o promocional quando existir */
function precoDe(p: any) {
  const promo = Number(p.preco_promocional || 0)
  return promo > 0 ? promo : Number(p.preco || 0)
}

/** Só o que a vitrine precisa. Custo, estoque e datas não saem daqui. */
function paraVitrine(p: any) {
  const imagens: string[] = Array.isArray(p.imagens) ? p.imagens : []
  return {
    id: p.id,
    codigo: String(p.codigo || ''),
    produto: p.produto || '',
    modelo: p.modelo || '',
    cor: p.cor || '',
    marca: p.marca || '',
    tamanho: p.tamanho || '',
    genero: p.genero || '',
    condicao: p.condicao || '',
    preco: precoDe(p),
    preco_cheio: Number(p.preco_promocional || 0) > 0 ? Number(p.preco || 0) : null,
    imagem: imagens[0] || null,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { acao, slug, ...payload } = await req.json()

    if (!acao || !slug) return json({ error: 'Parâmetros obrigatórios: acao, slug' }, 400)

    const chave = String(slug).trim().toLowerCase()
    if (!SLUG_RE.test(chave)) return json({ error: 'Loja não encontrada' }, 404)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: config, error: cfgError } = await supabase
      .from('configuracoes')
      .select('tenant_id, nome_loja, slug, loja_ativa, loja_reserva_minutos, whatsapp')
      .eq('slug', chave)
      .maybeSingle()

    if (cfgError) {
      console.error('Erro ao buscar a loja:', cfgError)
      return json({ error: 'Erro ao abrir a loja' }, 500)
    }
    if (!config) return json({ error: 'Loja não encontrada' }, 404)

    const loja = {
      nome: config.nome_loja || 'Loja',
      slug: config.slug,
      ativa: config.loja_ativa === true,
      reserva_minutos: Number(config.loja_reserva_minutos ?? 15),
    }

    // Loja fechada: a página mostra o aviso em vez de uma vitrine vazia, que
    // pareceria estoque esgotado.
    if (!loja.ativa) return json({ loja, fechada: true, pecas: [], facetas: vazio() }, 200)

    const tenantId = config.tenant_id

    switch (acao) {
      case 'catalogo':  return await acaoCatalogo(supabase, tenantId, loja, payload)
      case 'peca':      return await acaoPeca(supabase, tenantId, loja, payload)
      case 'reservar':  return await acaoReservar(supabase, tenantId, loja, payload)
      case 'carrinho':  return await acaoCarrinho(supabase, tenantId, loja, payload)
      case 'liberar':   return await acaoLiberar(supabase, tenantId, loja, payload)
      default:          return json({ error: 'Ação desconhecida' }, 400)
    }
  } catch (error) {
    console.error('Erro geral:', error)
    return json({ error: (error as Error).message }, 500)
  }
})

const vazio = () => ({ tamanhos: [], categorias: [], marcas: [] })

/**
 * O carrinho de quem está olhando, quando a página manda o id.
 *
 * Serve só para não esconder dela a peça que ela mesma guardou. Não é
 * autenticação: nada do pedido é devolvido por aqui, e um id inventado no
 * máximo deixa de descontar uma reserva que não existe.
 */
function pedidoDoVisitante(payload: any) {
  const id = String(payload?.pedido_id || '')
  return UUID_RE.test(id) ? id : null
}

// ────────────────────────────────────────────────────────────────────────────
// Peças que de fato estão à venda
// ────────────────────────────────────────────────────────────────────────────
// A regra é a mesma do plano: publicada, ativa, com estoque, com foto e com
// preço. Foto e preço o banco não consegue exigir num filtro simples (imagens
// é jsonb), então vêm na peneira aqui.
//
// A reserva de quem está com a peça no carrinho é descontada do estoque: é o
// que impede duas clientes de comprarem a mesma peça única.
// `pedidoProprio` é o carrinho de quem está olhando: as reservas dele não
// descontam nada. Sem isso, a peça que a cliente acabou de guardar sairia da
// vitrine para ela mesma, e a página da peça diria que já foi vendida.
async function disponiveis(supabase: any, tenantId: string, pedidoProprio?: string | null) {
  // Devolve ao catálogo o que passou dos 15 minutos sem pagar
  const { error: expError } = await supabase.rpc('loja_expirar_pedidos', { p_tenant_id: tenantId })
  if (expError) console.error('Falha ao expirar reservas:', expError)

  const { data: produtos, error } = await supabase
    .from('produtos')
    .select('id, codigo, produto, modelo, cor, marca, tamanho, genero, condicao, descricao, preco, preco_promocional, quantidade, imagens, created_at')
    .eq('tenant_id', tenantId)
    .eq('publicado_loja', true)
    .eq('ativo', true)
    .gte('quantidade', 1)
    .order('created_at', { ascending: false })

  if (error) throw error

  const reservados = await contarReservados(supabase, tenantId, pedidoProprio)

  return (produtos || []).filter((p: any) => {
    const imagens = Array.isArray(p.imagens) ? p.imagens : []
    if (!imagens.length) return false
    if (!(precoDe(p) > 0)) return false
    return Number(p.quantidade) - (reservados.get(p.id) || 0) > 0
  })
}

/**
 * Quantas unidades de cada peça estão presas em carrinho ou em pedido pago
 * que ainda não virou venda.
 *
 * Mesma regra da função loja_disponivel, no banco (migration 20261121c): o
 * item pago só deixa de contar quando ganha venda_id, senão a peça voltaria à
 * vitrine entre confirmar o pagamento e gravar a venda.
 */
async function contarReservados(supabase: any, tenantId: string, pedidoProprio?: string | null) {
  const agora = new Date().toISOString()
  const contagem = new Map<string, number>()

  // Carrinho e pedido esperando pagamento: valem enquanto a reserva não vence
  const { data: abertos, error } = await supabase
    .from('loja_pedidos')
    .select('id, reserva_expira_em')
    .eq('tenant_id', tenantId)
    .in('status', ['carrinho', 'aguardando_pagamento'])
    .gt('reserva_expira_em', agora)

  if (error) console.error('Erro ao ler os carrinhos abertos:', error)

  // Pedido pago: a janela entre confirmar o pagamento e gravar a venda é de
  // segundos, então basta olhar os recentes. Mais antigo que isso já tem
  // venda_id, e quem segura a peça passa a ser o estoque.
  const doisDias = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
  const { data: pagos, error: pagosError } = await supabase
    .from('loja_pedidos')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('status', 'pago')
    .gte('created_at', doisDias)

  if (pagosError) console.error('Erro ao ler os pedidos pagos recentes:', pagosError)

  const idsPagos = new Set((pagos || []).map((d: any) => d.id))
  const ids = [...(abertos || []).map((d: any) => d.id), ...idsPagos]
    .filter(id => id !== pedidoProprio)

  if (!ids.length) return contagem

  const { data: itens, error: itensError } = await supabase
    .from('loja_pedido_itens')
    .select('produto_id, pedido_id, venda_id')
    .in('pedido_id', ids)

  if (itensError) {
    console.error('Erro ao ler os itens reservados:', itensError)
    return contagem
  }

  for (const i of itens || []) {
    // Pedido pago com a venda já gravada: quem segura a peça agora é o estoque
    if (idsPagos.has(i.pedido_id) && i.venda_id) continue
    contagem.set(i.produto_id, (contagem.get(i.produto_id) || 0) + 1)
  }
  return contagem
}

// ────────────────────────────────────────────────────────────────────────────
// CATÁLOGO
// ────────────────────────────────────────────────────────────────────────────
async function acaoCatalogo(supabase: any, tenantId: string, loja: any, payload: any) {
  const todas = await disponiveis(supabase, tenantId, pedidoDoVisitante(payload))

  // As opções dos filtros saem do catálogo inteiro, não da página mostrada:
  // um filtro que aparece e desaparece conforme a rolagem confunde.
  const facetas = {
    categorias: unicos(todas.map((p: any) => p.produto)),
    tamanhos: ordenaTamanhos(unicos(todas.map((p: any) => p.tamanho))),
    marcas: unicos(todas.map((p: any) => p.marca)),
    generos: ordenaGeneros(unicos(todas.map((p: any) => p.genero))),
  }

  const f = payload.filtros || {}
  const termos = termosDaBusca(payload.busca)

  // Cada filtro aceita várias opções ao mesmo tempo, como em qualquer loja:
  // quem procura tamanho 36 costuma aceitar 37 também. Dentro do mesmo filtro
  // vale OU; entre filtros diferentes vale E.
  const filtradas = todas.filter((p: any) =>
    casaFiltro(p.produto, f.categoria) &&
    casaFiltro(p.tamanho, f.tamanho) &&
    casaFiltro(p.marca, f.marca) &&
    casaFiltro(p.genero, f.genero) &&
    casaBusca(p, termos)
  )

  ordenar(filtradas, payload.ordem)

  const pagina = Math.max(1, parseInt(String(payload.pagina || 1), 10) || 1)
  const inicio = (pagina - 1) * POR_PAGINA
  const pecas = filtradas.slice(inicio, inicio + POR_PAGINA)

  return json({
    loja,
    facetas,
    pecas: pecas.map(paraVitrine),
    pagina,
    total: filtradas.length,
    tem_mais: inicio + pecas.length < filtradas.length,
  })
}

// ────────────────────────────────────────────────────────────────────────────
// PEÇA — a página própria dela, para divulgar uma peça específica
// ────────────────────────────────────────────────────────────────────────────
async function acaoPeca(supabase: any, tenantId: string, loja: any, payload: any) {
  const codigo = String(payload.codigo || '').trim()
  if (!codigo) return json({ error: 'Peça não encontrada' }, 404)

  const todas = await disponiveis(supabase, tenantId, pedidoDoVisitante(payload))
  const achada = todas.find((p: any) =>
    String(p.codigo || '').trim().toLowerCase() === codigo.toLowerCase()
  )

  if (!achada) {
    // Vendida ou tirada do ar. A página convida a ver o resto em vez de dar
    // erro seco: o link circula no Instagram muito depois da venda.
    return json({ loja, indisponivel: true }, 200)
  }

  const imagens = (Array.isArray(achada.imagens) ? achada.imagens : []).filter(Boolean)

  // Mais peças do mesmo tipo, para quem chegou pelo link de uma peça só
  const relacionadas = todas
    .filter((p: any) => p.id !== achada.id && igual(p.produto, achada.produto))
    .slice(0, 6)
    .map(paraVitrine)

  return json({
    loja,
    // A descrição só vai na página da peça: no catálogo ela não cabe no card
    // e multiplicaria o tamanho da resposta por nada
    peca: { ...paraVitrine(achada), imagens, descricao: String(achada.descricao || '').trim() },
    relacionadas,
  })
}

// ────────────────────────────────────────────────────────────────────────────
// RESERVAR — põe a peça no carrinho e segura por 15 minutos
// ────────────────────────────────────────────────────────────────────────────
async function acaoReservar(supabase: any, tenantId: string, loja: any, payload: any) {
  const produtoId = String(payload.produto_id || '')
  if (!UUID_RE.test(produtoId)) return json({ error: 'Peça inválida' }, 400)

  let pedido = await carrinhoAberto(supabase, tenantId, payload.pedido_id)

  if (!pedido) {
    const criado = await criarCarrinho(supabase, tenantId)
    if (!criado) return json({ error: 'Não foi possível abrir o carrinho. Tente de novo.' }, 500)
    pedido = criado
  }

  const { data: resultado, error } = await supabase.rpc('loja_reservar_peca', {
    p_tenant_id: tenantId,
    p_pedido_id: pedido.id,
    p_produto_id: produtoId,
  })

  if (error) {
    console.error('Erro ao reservar:', error)
    return json({ error: 'Não foi possível guardar a peça. Tente de novo.' }, 500)
  }
  if (!resultado?.ok) {
    return json({ error: resultado?.motivo || 'Esta peça não está mais disponível', pedido_id: pedido.id }, 409)
  }

  return await acaoCarrinho(supabase, tenantId, loja, { pedido_id: pedido.id })
}

// ────────────────────────────────────────────────────────────────────────────
// CARRINHO — o que a cliente separou e quanto tempo ainda tem
// ────────────────────────────────────────────────────────────────────────────
async function acaoCarrinho(supabase: any, tenantId: string, loja: any, payload: any) {
  const pedido = await carrinhoAberto(supabase, tenantId, payload.pedido_id)

  // Carrinho inexistente, expirado ou de outra loja: devolve vazio em vez de
  // erro. Para a cliente é o mesmo que não ter começado.
  if (!pedido) return json({ loja, carrinho: null })

  const { data: itens, error } = await supabase
    .from('loja_pedido_itens')
    .select('id, produto_id, codigo, produto, modelo, cor, marca, tamanho, imagem, preco, peso_gramas')
    .eq('pedido_id', pedido.id)
    .order('created_at')

  if (error) {
    console.error('Erro ao ler o carrinho:', error)
    return json({ error: 'Erro ao abrir o carrinho' }, 500)
  }

  const lista = itens || []

  // Carrinho que ficou sem item nenhum não deve manter reserva viva
  if (!lista.length) {
    await supabase
      .from('loja_pedidos')
      .update({ reserva_expira_em: null, valor_itens: 0, peso_gramas: 0 })
      .eq('id', pedido.id)
  }

  return json({
    loja,
    carrinho: {
      pedido_id: pedido.id,
      codigo: pedido.codigo,
      status: pedido.status,
      reserva_expira_em: lista.length ? pedido.reserva_expira_em : null,
      itens: lista,
      valor_itens: lista.reduce((s: number, i: any) => s + Number(i.preco || 0), 0),
      peso_gramas: lista.reduce((s: number, i: any) => s + Number(i.peso_gramas || 0), 0),
    },
  })
}

// ────────────────────────────────────────────────────────────────────────────
// LIBERAR — tira a peça do carrinho e devolve ao catálogo na hora
// ────────────────────────────────────────────────────────────────────────────
async function acaoLiberar(supabase: any, tenantId: string, loja: any, payload: any) {
  const produtoId = String(payload.produto_id || '')
  if (!UUID_RE.test(produtoId)) return json({ error: 'Peça inválida' }, 400)

  const pedido = await carrinhoAberto(supabase, tenantId, payload.pedido_id)
  if (!pedido) return json({ loja, carrinho: null })

  const { error } = await supabase.rpc('loja_liberar_peca', {
    p_tenant_id: tenantId,
    p_pedido_id: pedido.id,
    p_produto_id: produtoId,
  })

  if (error) {
    console.error('Erro ao liberar peça:', error)
    return json({ error: 'Não foi possível tirar a peça do carrinho' }, 500)
  }

  return await acaoCarrinho(supabase, tenantId, loja, { pedido_id: pedido.id })
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * O carrinho que ainda vale, se o id que a página mandou for de um.
 *
 * O id do pedido é a credencial do carrinho, como o token do link de frete:
 * quem tem o id mexe naquele carrinho e em nenhum outro. Por isso a consulta
 * exige o tenant e o status — id de outra loja, pedido pago ou reserva vencida
 * não abrem nada.
 */
async function carrinhoAberto(supabase: any, tenantId: string, pedidoId: any) {
  const id = String(pedidoId || '')
  if (!UUID_RE.test(id)) return null

  await supabase.rpc('loja_expirar_pedidos', { p_tenant_id: tenantId })

  const { data, error } = await supabase
    .from('loja_pedidos')
    .select('id, codigo, status, reserva_expira_em')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .eq('status', 'carrinho')
    .maybeSingle()

  if (error) {
    console.error('Erro ao buscar o carrinho:', error)
    return null
  }
  if (!data) return null

  // Sem item ainda não tem prazo: o prazo nasce com a primeira peça
  if (data.reserva_expira_em && new Date(data.reserva_expira_em) <= new Date()) return null

  return data
}

/** Carrinho novo, com um código curto para a loja achar o pedido no balcão */
async function criarCarrinho(supabase: any, tenantId: string) {
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const codigo = codigoCurto()
    const { data, error } = await supabase
      .from('loja_pedidos')
      .insert([{ tenant_id: tenantId, codigo, status: 'carrinho' }])
      .select('id, codigo, status, reserva_expira_em')
      .single()

    if (!error) return data
    // 23505 = código sorteado repetido; sorteia outro
    if (error.code !== '23505') {
      console.error('Erro ao criar carrinho:', error)
      return null
    }
  }
  console.error('Não foi possível gerar um código de pedido livre')
  return null
}

function codigoCurto() {
  const bytes = new Uint8Array(3)
  crypto.getRandomValues(bytes)
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
}

function unicos(valores: any[]) {
  const vistos = new Map<string, string>()
  for (const v of valores) {
    const texto = String(v || '').trim()
    if (!texto) continue
    const chave = texto.toLowerCase()
    if (!vistos.has(chave)) vistos.set(chave, texto)
  }
  return [...vistos.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

function igual(a: any, b: any) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()
}

/** Valor da peça contra o filtro, que pode vir vazio, como texto ou como lista */
function casaFiltro(valor: any, escolhido: any) {
  const lista = Array.isArray(escolhido) ? escolhido : escolhido ? [escolhido] : []
  if (!lista.length) return true
  return lista.some((e: any) => igual(valor, e))
}

/**
 * Ordem da vitrine. O padrão é a peça mais recente primeiro: em brechó o que
 * acabou de entrar é o que a cliente ainda não viu.
 */
function ordenar(pecas: any[], ordem: any) {
  if (ordem === 'menor') pecas.sort((a, b) => precoDe(a) - precoDe(b))
  else if (ordem === 'maior') pecas.sort((a, b) => precoDe(b) - precoDe(a))
  // 'recentes' já vem do banco, por created_at
}

/**
 * Busca multi-termo: a vírgula separa e vale E (todos os termos têm de bater),
 * como no resto do sistema. O espaço fica dentro do termo, senão "calça jeans"
 * viraria duas exigências soltas.
 *
 * A busca é feita aqui, e não no navegador, porque o catálogo chega paginado:
 * filtrar só as 60 peças já baixadas deixaria o resto do acervo invisível.
 */
function termosDaBusca(busca: any) {
  return String(busca || '')
    .toLowerCase()
    .split(',')
    .map(t => semAcento(t.trim()))
    .filter(Boolean)
}

function casaBusca(p: any, termos: string[]) {
  if (!termos.length) return true
  const linha = semAcento(
    [p.codigo, p.produto, p.modelo, p.cor, p.marca, p.tamanho].join(' ').toLowerCase()
  )
  return termos.every(t => linha.includes(t))
}

// "calca" acha "Calça": ninguém digita acento procurando no celular
function semAcento(texto: string) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Para quem a peça é, na ordem em que a vitrine mostra: infantil primeiro,
 * depois feminino e masculino, unissex por último. Alfabético deixaria a
 * ordem do filtro à mercê de como o cadastro abrevia cada um.
 */
const ORDEM_GENERO = ['inf', 'infantil', 'bb', 'bebe', 'bebê', 'f', 'feminino', 'm', 'masculino', 'u', 'unissex']

function ordenaGeneros(generos: string[]) {
  return [...generos].sort((a, b) => {
    const ia = ORDEM_GENERO.indexOf(String(a).trim().toLowerCase())
    const ib = ORDEM_GENERO.indexOf(String(b).trim().toLowerCase())
    if (ia >= 0 && ib >= 0) return ia - ib
    if (ia >= 0) return -1
    if (ib >= 0) return 1
    return String(a).localeCompare(String(b), 'pt-BR')
  })
}

/**
 * Tamanho é texto livre no cadastro: conviveriam "2", "10", "P", "GG" e "RN".
 * Número antes de letra, e as letras na ordem da arara — alfabético poria GG
 * antes de P, que é o contrário do que a cliente espera.
 */
const ORDEM_LETRAS = ['rn', 'pp', 'p', 'm', 'g', 'gg', 'xg', 'xgg', 'eg', 'u', 'un', 'único', 'unico']

function ordenaTamanhos(tamanhos: string[]) {
  return [...tamanhos].sort((a, b) => {
    const na = parseFloat(String(a).replace(',', '.'))
    const nb = parseFloat(String(b).replace(',', '.'))
    const aNum = !Number.isNaN(na)
    const bNum = !Number.isNaN(nb)

    if (aNum && bNum) return na - nb
    if (aNum) return -1
    if (bNum) return 1

    const ia = ORDEM_LETRAS.indexOf(String(a).trim().toLowerCase())
    const ib = ORDEM_LETRAS.indexOf(String(b).trim().toLowerCase())
    if (ia >= 0 && ib >= 0) return ia - ib
    if (ia >= 0) return -1
    if (ib >= 0) return 1
    return String(a).localeCompare(String(b), 'pt-BR')
  })
}
