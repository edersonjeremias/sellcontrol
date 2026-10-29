import { portalSb } from '../lib/portalSupabase'


const STATUS_ENCERRADO = ['Pronto', 'Enviado', 'Entregue', 'Retirou', 'Repetido']
// Valores de status_entrega que indicam que o pedido já foi despachado
const STATUS_ENTREGA_FINALIZADA = ['Enviado', 'Entregue', 'Retirou', 'Retirada']

// Status que marcam peça como ENVIADA (finalizada)
// Deve corresponder aos status da página Expedição que indicam conclusão
export const STATUS_ENVIADO_PECA = ['enviado', 'entregue', 'retirou', 'retirada']

// Busca itens via RPC que lê diretamente da tabela vendas (SECURITY DEFINER)
export async function getProdutos(instagram) {
  const { data, error } = await portalSb.rpc('portal_get_minha_sacolinha')
  if (error) throw error
  return data || []
}

export async function getCobrancas(instagram) {
  const { data, error } = await portalSb
    .from('portal_cobrancas')
    .select('*')
    .eq('cliente_instagram', instagram)
  if (error) throw error
  return data || []
}

// Busca débitos pendentes do cliente da tabela principal de cobranças (SECURITY DEFINER)
export async function getMeusDebitos() {
  const { data, error } = await portalSb.rpc('portal_get_meus_debitos')
  if (error) throw error
  return data || []
}

export async function getUltimaProducao(instagram) {
  const { data, error } = await portalSb
    .from('portal_producao')
    .select('*')
    .eq('cliente_instagram', instagram)
    .order('data_solicitacao', { ascending: false })
    .limit(1)
  if (error) throw error
  return data?.[0] || null
}

// Produção "ativa" = ainda não foi despachada/encerrada
// status_entrega "Enviado/Entregue/Retirou" = pedido despachado → libera nova sacolinha
export function isProducaoAtiva(producao) {
  if (!producao) return false
  if (STATUS_ENTREGA_FINALIZADA.includes(producao.status_entrega)) return false
  return !STATUS_ENCERRADO.includes(producao.status_producao)
}

export async function encerrarSacolinha(instagram, tipoEntrega, obs) {
  // Usa RPC SECURITY DEFINER para criar pedidos em ambas as tabelas
  // (contorna restrições de RLS do portal)
  const { data, error } = await portalSb.rpc('portal_encerrar_sacolinha', {
    p_instagram: instagram,
    p_tipo_entrega: tipoEntrega,
    p_obs: obs || ''
  })

  if (error) throw error
  return data?.[0] || {}
}

// Resumo do que o cliente precisa resolver na aba Frete, para o aviso que
// aparece na Sacolinha. Consulta enxuta de propósito: quem carrega os
// romaneios completos, com itens e endereços, é a própria aba Frete.
export async function getFretePendente(tenantId, instagram) {
  if (!tenantId || !instagram) return null
  const ig = instagram.replace('@', '')

  const { data: roms, error } = await portalSb
    .from('romaneios')
    .select('numero, status, valor_frete')
    .eq('tenant_id', tenantId)
    .eq('cliente_instagram', ig)
    .in('status', ['pronto', 'frete_cotado'])
    .order('created_at', { ascending: false })

  if (error) throw error
  if (!roms?.length) return null

  // A aba Frete omite romaneios sem itens. O aviso segue a mesma regra, senão
  // mandaria o cliente para uma tela vazia.
  const numeroDe = r => parseInt(r.numero.replace(/\D/g, ''))
  const { data: vendas } = await portalSb
    .from('vendas')
    .select('numero_pedido')
    .eq('tenant_id', tenantId)
    .in('numero_pedido', roms.map(numeroDe))

  const comItens = new Set((vendas || []).map(v => v.numero_pedido))
  const validos = roms.filter(r => comItens.has(numeroDe(r)))
  if (!validos.length) return null

  // Pagamento tem precedência sobre cotação: é a ação mais urgente.
  const cotado = validos.find(r => r.status === 'frete_cotado')
  if (!cotado) return { tipo: 'cotar', quantidade: validos.length }

  const { data: cfg } = await portalSb
    .from('configuracoes_public')
    .select('margem_frete')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  const margem = Number(cfg?.margem_frete) || 0
  const valor = Number(cotado.valor_frete || 0) * (1 + margem / 100)
  return { tipo: 'pagar', valor }
}

// Espelha na tabela `clientes` o que o cliente preenche no portal. É dela que
// o painel lê (modal "Dados para Envio" e colunas de endereço da busca
// avançada); sem isso os dados só existiriam em portal_clientes/enderecos_clientes.
// Campos vazios são descartados para não apagar o que o lojista já cadastrou.
// Falha aqui não interrompe o fluxo do portal — apenas registra no console.
export async function sincronizarCliente(tenantId, instagram, campos) {
  const payload = {}
  for (const [chave, valor] of Object.entries(campos)) {
    const v = typeof valor === 'string' ? valor.trim() : valor
    if (v) payload[chave] = v
  }
  if (!tenantId || !instagram || Object.keys(payload).length === 0) return

  const { error } = await portalSb
    .from('clientes')
    .update(payload)
    .eq('tenant_id', tenantId)
    .eq('instagram', instagram.replace('@', ''))

  if (error) console.error('Erro ao sincronizar cliente:', error)
}

// Lê da view configuracoes_public, e não da tabela: nem anon nem o cliente do
// portal têm SELECT em configuracoes (ela guarda os tokens de pagamento e do
// Melhor Envio).
export async function getMensagemEncerramento(tenantId) {
  const { data, error } = await portalSb
    .from('configuracoes_public')
    .select('mensagem_encerramento_sacolinha')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error) throw error
  return data?.mensagem_encerramento_sacolinha?.trim() || ''
}

export async function uploadComprovante(instagram, file) {
  const ext = file.name.split('.').pop()
  const slug = instagram.replace(/[^a-z0-9]/gi, '')
  const path = `${slug}/${Date.now()}.${ext}`

  const { error: upErr } = await portalSb.storage
    .from('comprovantes')
    .upload(path, file, { upsert: true })
  if (upErr) throw upErr

  const { data } = portalSb.storage.from('comprovantes').getPublicUrl(path)
  return data.publicUrl
}

export async function salvarComprovante(producaoId, url) {
  const { error } = await portalSb
    .from('portal_producao')
    .update({ link_comprovante_frete: url, status_entrega: 'Conferir pg' })
    .eq('id', producaoId)
  if (error) throw error
}

export async function atualizarCadastro(userId, dados) {
  const { error } = await portalSb
    .from('portal_clientes')
    .update(dados)
    .eq('user_id', userId)
  if (error) throw error
}
