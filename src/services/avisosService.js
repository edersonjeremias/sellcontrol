import { supabase } from '../lib/supabase'
import { hojeISO } from '../lib/datas'

// Mesmo bucket das fotos de produto: já é público, já tem política por pasta
// do tenant e limite de 5 MB. Criar um bucket novo só para o mural seria
// repetir a configuração inteira sem ganho nenhum.
const BUCKET = 'produtos-imagens'
const TAMANHO_MAXIMO = 5 * 1024 * 1024
const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp']

export const CORES_AVISO = [
  { valor: 'blue',   label: 'Azul',     css: 'var(--blue)' },
  { valor: 'green',  label: 'Verde',    css: 'var(--green)' },
  { valor: 'yellow', label: 'Amarelo',  css: 'var(--yellow)' },
  { valor: 'red',    label: 'Vermelho', css: 'var(--red)' },
  { valor: 'purple', label: 'Roxo',     css: 'var(--purple)' },
]

export function corDoAviso(cor) {
  return (CORES_AVISO.find(c => c.valor === cor) || CORES_AVISO[0]).css
}

// ── Leitura ────────────────────────────────────────────────────────────────

// Todos os avisos do tenant, inclusive inativos e fora do prazo: é a lista da
// página de administração.
export async function getAvisos(tenantId) {
  const { data, error } = await supabase
    .from('avisos')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('fixado', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

// O que entra no mural do dashboard: ativo e dentro do período de exibição.
// O filtro de data sai daqui em vez de ir para o banco porque inicio_em e
// fim_em são nulos na maioria dos avisos e o .or() do Supabase com duas
// condições nulas fica ilegível para o ganho que dá nesse volume.
export async function getAvisosVigentes(tenantId) {
  const { data, error } = await supabase
    .from('avisos')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('ativo', true)
    .order('fixado', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw error

  const hoje = hojeISO()
  return (data || []).filter(a =>
    (!a.inicio_em || a.inicio_em <= hoje) &&
    (!a.fim_em || a.fim_em >= hoje)
  )
}

// IDs dos avisos que este usuário já abriu.
export async function getAvisosLidos(tenantId, userId) {
  if (!userId) return []
  const { data, error } = await supabase
    .from('avisos_leituras')
    .select('aviso_id')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)

  if (error) throw error
  return (data || []).map(l => l.aviso_id)
}

// Todas as leituras do tenant, para a página mostrar quem leu cada aviso.
export async function getLeiturasDoTenant(tenantId) {
  const { data, error } = await supabase
    .from('avisos_leituras')
    .select('aviso_id, user_id, usuario_nome, lido_em')
    .eq('tenant_id', tenantId)
    .order('lido_em', { ascending: false })

  if (error) throw error
  return data || []
}

// ── Escrita ────────────────────────────────────────────────────────────────

export async function criarAviso(tenantId, dados, autor) {
  const { data, error } = await supabase
    .from('avisos')
    .insert({
      tenant_id: tenantId,
      titulo: dados.titulo,
      corpo: dados.corpo,
      imagem_url: dados.imagem_url || null,
      cor: dados.cor || 'blue',
      fixado: !!dados.fixado,
      abrir_automatico: !!dados.abrir_automatico,
      ativo: dados.ativo !== false,
      inicio_em: dados.inicio_em || null,
      fim_em: dados.fim_em || null,
      criado_por: autor?.id || null,
      criado_por_nome: autor?.nome || '',
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function atualizarAviso(avisoId, dados) {
  const { error } = await supabase
    .from('avisos')
    .update(dados)
    .eq('id', avisoId)

  if (error) throw error
}

export async function excluirAviso(avisoId) {
  const { error } = await supabase
    .from('avisos')
    .delete()
    .eq('id', avisoId)

  if (error) throw error
}

// Registra a leitura. upsert porque abrir o mesmo aviso duas vezes não pode
// virar erro de chave duplicada na tela de quem só queria reler o recado.
export async function marcarAvisoLido(tenantId, avisoId, usuario) {
  if (!usuario?.id) return
  const { error } = await supabase
    .from('avisos_leituras')
    .upsert({
      aviso_id: avisoId,
      user_id: usuario.id,
      tenant_id: tenantId,
      usuario_nome: usuario.nome || '',
      lido_em: new Date().toISOString(),
    }, { onConflict: 'aviso_id,user_id' })

  if (error) throw error
}

// ── Imagens ────────────────────────────────────────────────────────────────

// Sobe para a pasta do tenant (exigência da política do bucket) numa subpasta
// avisos, para não se misturar com as fotos de produto.
export async function uploadImagemAviso(file, tenantId) {
  if (!TIPOS_ACEITOS.includes(file.type)) {
    throw new Error('Formato não suportado. Use JPG, PNG ou WEBP.')
  }
  if (file.size > TAMANHO_MAXIMO) {
    throw new Error('Imagem muito grande. Máximo 5MB.')
  }

  const extensao =
    file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp'
  const caminho = `${tenantId}/avisos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensao}`

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(caminho, file, { cacheControl: '3600', upsert: false })

  if (error) {
    console.error('Erro ao subir imagem do aviso:', error)
    throw new Error('Erro ao enviar a imagem')
  }

  const { data: publica } = supabase.storage.from(BUCKET).getPublicUrl(data.path)
  return publica.publicUrl
}
