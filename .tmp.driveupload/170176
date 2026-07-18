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
