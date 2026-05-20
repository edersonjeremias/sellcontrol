import { portalSb } from '../lib/portalSupabase'

const STATUS_ENCERRADO = ['Pronto', 'Enviado', 'Entregue', 'Retirou', 'Repetido']
export const STATUS_ENVIADO_PECA = ['enviado', 'entregue', 'retirou', 'retirada']

export async function getProdutos(instagram) {
  const { data, error } = await portalSb
    .from('portal_produtos')
    .select('*')
    .eq('cliente_instagram', instagram)
    .order('data_insercao', { ascending: false })
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

// Produção "ativa" = não está em nenhum dos status de encerrado
export function isProducaoAtiva(producao) {
  if (!producao) return false
  return !STATUS_ENCERRADO.includes(producao.status_producao)
}

export async function encerrarSacolinha(instagram, tipoEntrega, obs) {
  const obsTexto = obs?.trim()
    ? `[${tipoEntrega}] ${obs.trim()}`
    : `[${tipoEntrega}]`

  const { data, error } = await portalSb
    .from('portal_producao')
    .insert({
      cliente_instagram: instagram,
      status_producao: 'Em fila',
      status_entrega: 'Aguardando',
      obs_cliente: obsTexto,
    })
    .select()
    .single()
  if (error) throw error
  return data
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
