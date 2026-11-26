// ============================================================================
// Link da bio — a página pública de links (/bio/:slug)
// ============================================================================
// O painel (Configurações › Link da Bio) lê e grava direto nas tabelas, com a
// RLS do tenant. A página aberta não toca nas tabelas: chama bio_publica, que
// devolve só o que ela mostra.
// ============================================================================

import { supabase } from '../lib/supabase'
import { siteUrl } from '../lib/siteUrl'

const BUCKET = 'bio-imagens'
const MAX_LOGO = 5 * 1024 * 1024
const TIPOS_IMAGEM = ['image/jpeg', 'image/png', 'image/webp']

// ── Padrões de uma página que ainda não existe ──────────────────────────────
export const BIO_PADRAO = {
  slug: '',
  ativa: false,
  titulo: '',
  descricao: '',
  logo_url: '',
  logo_formato: 'circulo',
  fundo_tipo: 'cor',
  cor_fundo: '#121212',
  cor_fundo2: '#2a2a2a',
  cor_texto: '#ffffff',
  cor_botao: '#1e1e1e',
  cor_texto_botao: '#ffffff',
  botao_estilo: 'solido',
  botao_raio: 'arredondado',
  mostrar_compartilhar: true,
  mostrar_marca: true,
  mensagem_compartilhar: '',
}

/**
 * O endereço só existe como link: espaço, acento e maiúscula quebram a URL
 * na hora de colar no Instagram.
 */
export function normalizarSlug(texto) {
  return String(texto || '')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export const linkBio = (slug) => (slug ? siteUrl(`/bio/${slug}`) : '')

// ── Painel ──────────────────────────────────────────────────────────────────

export async function getBioPagina(tenantId) {
  const { data, error } = await supabase
    .from('bio_paginas')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function salvarBioPagina(tenantId, campos) {
  const { data, error } = await supabase
    .from('bio_paginas')
    .upsert({ tenant_id: tenantId, ...campos }, { onConflict: 'tenant_id' })
    .select()
    .maybeSingle()

  // 23505 é a unicidade do slug: outra empresa já está com este endereço.
  // A mensagem crua do Postgres não diz isso a quem está configurando.
  if (error) {
    if (error.code === '23505') {
      throw new Error('Este endereço já está em uso por outra loja. Escolha outro.')
    }
    throw error
  }
  return data
}

export async function getBioLinks(tenantId) {
  const { data, error } = await supabase
    .from('bio_links')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('grupo')
    .order('ordem')
    .order('created_at')
  if (error) throw error
  return data || []
}

/**
 * Grava a lista inteira de uma vez.
 *
 * A tela trabalha com um array em memória (incluir, reordenar, ligar e
 * desligar) e só aqui o banco fica sabendo. Salvar link a link enquanto a
 * pessoa arrasta deixaria o banco em estados que a tela nunca mostrou.
 */
export async function salvarBioLinks(tenantId, links, idsRemovidos = []) {
  if (idsRemovidos.length) {
    const { error } = await supabase
      .from('bio_links')
      .delete()
      .eq('tenant_id', tenantId)
      .in('id', idsRemovidos)
    if (error) throw error
  }

  if (!links.length) return []

  const linhas = links.map((l, i) => ({
    id: l.id,
    tenant_id: tenantId,
    grupo: l.grupo === 'social' ? 'social' : 'botao',
    tipo: l.tipo || 'link',
    titulo: (l.titulo || '').trim() || null,
    subtitulo: (l.subtitulo || '').trim() || null,
    url: (l.url || '').trim() || null,
    ativo: l.ativo !== false,
    destaque: l.destaque === true,
    ordem: i,
  }))

  const { data, error } = await supabase
    .from('bio_links')
    .upsert(linhas, { onConflict: 'id' })
    .select()
  if (error) throw error
  return data || []
}

// ── Logo ────────────────────────────────────────────────────────────────────

export async function uploadLogoBio(file, tenantId) {
  if (!TIPOS_IMAGEM.includes(file.type)) {
    throw new Error('Formato não suportado. Use JPG, PNG ou WEBP.')
  }
  if (file.size > MAX_LOGO) {
    throw new Error('Imagem muito grande. Máximo 5MB.')
  }

  // A extensão vem do tipo, não do nome: imagem colada da área de
  // transferência chega sem nome utilizável.
  const ext = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp'
  const caminho = `${tenantId}/logo-${Date.now()}.${ext}`

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(caminho, file, { cacheControl: '3600', upsert: false })
  if (error) throw new Error('Erro ao enviar a imagem: ' + error.message)

  const { data: publica } = supabase.storage.from(BUCKET).getPublicUrl(data.path)
  return publica.publicUrl
}

/** Apaga o arquivo antigo. Falhar aqui não pode travar o salvamento. */
export async function removerLogoBio(url) {
  try {
    const caminho = String(url || '').split(`/${BUCKET}/`)[1]
    if (!caminho) return
    await supabase.storage.from(BUCKET).remove([decodeURIComponent(caminho)])
  } catch {
    /* arquivo órfão no storage não atrapalha ninguém */
  }
}

// ── Página aberta ───────────────────────────────────────────────────────────

export async function buscarBioPublica(slug) {
  const { data, error } = await supabase.rpc('bio_publica', { p_slug: slug })
  if (error) throw error
  return data || { encontrada: false }
}

/** Aviso, não consulta: quem clicou não espera por isto. */
export function registrarCliqueBio(linkId) {
  supabase.rpc('bio_clique', { p_link_id: linkId }).then(
    () => {},
    () => {},
  )
}
