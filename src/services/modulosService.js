// ============================================================================
// MÓDULOS POR EMPRESA — ler e gravar o que cada empresa contratou
// ============================================================================
// O catálogo do que existe para vender está em src/lib/modulos.js. Aqui é o
// acesso ao banco:
//
//   tenant_modulos  o que a empresa tem e quanto paga (só o master lê e grava)
//   meus_modulos()  o que a MINHA empresa tem, sem preço (todo usuário logado)
//   pages           consequência: habilitar módulo de página cria a linha,
//                   desabilitar remove — é ela que manda no menu e nas
//                   permissões de cada usuário
// ============================================================================

import { supabase } from '../lib/supabase'
import {
  MODULOS, MODULOS_PAGINA,
  moduloPorSlug, precoPadrao, SLUGS_ESSENCIAIS, SLUGS_FORA_DO_CATALOGO,
} from '../lib/modulos'

const SLUGS_PAGINA = new Set(MODULOS_PAGINA.map(m => m.slug))

// ── O que a minha empresa tem (qualquer usuário logado) ─────────────────────

/**
 * Slugs ligados para a empresa de quem está logado.
 *
 * Tabela nova: enquanto a migration não roda, devolvemos null em vez de lista
 * vazia. Lista vazia trancaria todo mundo fora do sistema entre o deploy e a
 * migration; null significa "não sei ainda" e o sistema segue pelo `pages`,
 * como era antes.
 */
export async function getMeusModulos() {
  const { data, error } = await supabase.rpc('meus_modulos')
  if (error) {
    console.warn('tenant_modulos ainda não existe ou não respondeu:', error.message)
    return null
  }
  return (data || []).map(linha => (typeof linha === 'string' ? linha : linha.slug))
}

// ── Tela do master ──────────────────────────────────────────────────────────

/** Linhas gravadas para a empresa, por slug. */
export async function getModulosDoTenant(tenantId) {
  const { data, error } = await supabase
    .from('tenant_modulos')
    .select('slug, ativo, preco_mensal, habilitado_em')
    .eq('tenant_id', tenantId)
  if (error) throw error
  return data || []
}

/**
 * O catálogo inteiro já casado com o que a empresa tem: é o que a tela mostra.
 * Módulo que nunca foi tocado aparece desligado, no preço padrão.
 */
export async function getCatalogoDoTenant(tenantId) {
  const gravados = await getModulosDoTenant(tenantId)
  const porSlug = new Map(gravados.map(l => [l.slug, l]))

  return MODULOS.map(m => {
    const linha = porSlug.get(m.slug)
    return {
      ...m,
      ativo: m.essencial ? true : linha?.ativo === true,
      preco_mensal: linha?.preco_mensal != null ? Number(linha.preco_mensal) : m.preco,
      habilitado_em: linha?.habilitado_em || null,
    }
  })
}

/**
 * Grava o contrato da empresa e põe o `pages` de acordo.
 *
 * Recebe a lista inteira da tela (um item por módulo do catálogo), não só o
 * que mudou: assim o estado gravado é exatamente o que o master está vendo.
 */
export async function salvarModulosDoTenant(tenantId, linhas) {
  if (!tenantId) throw new Error('Empresa não informada')

  const agora = new Date().toISOString()

  const registros = linhas
    .filter(l => moduloPorSlug(l.slug))
    .map(l => {
      const essencial = SLUGS_ESSENCIAIS.includes(l.slug)
      const ativo = essencial ? true : l.ativo === true
      return {
        tenant_id: tenantId,
        slug: l.slug,
        ativo,
        // Preço igual ao do catálogo vai como null: o dia em que o catálogo
        // mudar de preço, quem não negociou nada acompanha.
        preco_mensal: Number(l.preco_mensal) === Number(precoPadrao(l.slug))
          ? null
          : Number(l.preco_mensal) || 0,
        habilitado_em: ativo ? (l.habilitado_em || agora) : null,
        updated_at: agora,
      }
    })

  const { error } = await supabase
    .from('tenant_modulos')
    .upsert(registros, { onConflict: 'tenant_id,slug' })
  if (error) throw error

  const paginasAtivas = registros
    .filter(r => r.ativo && SLUGS_PAGINA.has(r.slug))
    .map(r => r.slug)

  await sincronizarPaginasDoTenant(tenantId, paginasAtivas)

  return registros
}

/**
 * Deixa `pages` com exatamente as páginas contratadas.
 *
 * As telas do dono do sistema (master/empresas, admin, debug) não são módulo
 * de venda e nunca são removidas daqui — elas não aparecem no catálogo, e sem
 * esta exceção um salvamento apagaria o acesso do próprio master.
 */
export async function sincronizarPaginasDoTenant(tenantId, slugsAtivos) {
  const ativos = new Set(slugsAtivos)

  const { data: atuais, error: erroLeitura } = await supabase
    .from('pages')
    .select('id, slug')
    .eq('tenant_id', tenantId)
  if (erroLeitura) throw erroLeitura

  const existentes = atuais || []
  const porSlug = new Map(existentes.map(p => [p.slug, p.id]))

  // Remove o que a empresa não tem mais — só o que é módulo de página.
  const remover = existentes.filter(p =>
    SLUGS_PAGINA.has(p.slug) &&
    !ativos.has(p.slug) &&
    !SLUGS_FORA_DO_CATALOGO.includes(p.slug)
  )

  if (remover.length) {
    const ids = remover.map(p => p.id)
    const { error: erroAcesso } = await supabase.from('pages_access').delete().in('page_id', ids)
    if (erroAcesso) throw erroAcesso
    const { error: erroPages } = await supabase.from('pages').delete().in('id', ids)
    if (erroPages) throw erroPages
  }

  // Cria o que foi habilitado agora.
  const criar = [...ativos].filter(slug => !porSlug.has(slug))
  if (criar.length) {
    const novas = criar.map(slug => {
      const m = moduloPorSlug(slug)
      return {
        tenant_id: tenantId,
        slug,
        label: m?.label || slug,
        category: m?.categoria || '',
        icon: m?.icon || '',
        order_index: m?.order_index || 999,
      }
    })
    const { data: inseridas, error } = await supabase.from('pages').insert(novas).select('id')
    if (error) throw error
    await liberarParaAdmins(tenantId, (inseridas || []).map(p => p.id))
  }

  return { criadas: criar.length, removidas: remover.length }
}

/**
 * Página nova já liberada para quem administra a empresa.
 *
 * Sem isto, o master do sistema habilita o módulo e o admin da empresa abre o
 * sistema sem ver nada de novo — ele teria que adivinhar que precisa ir em
 * Usuários e Permissões marcar a página para si mesmo.
 */
async function liberarParaAdmins(tenantId, pageIds) {
  if (!pageIds.length) return

  const { data: admins } = await supabase
    .from('users_perfil')
    .select('id')
    .eq('tenant_id', tenantId)
    .in('role', ['master', 'admin'])

  if (!admins?.length) return

  const linhas = []
  for (const admin of admins) {
    for (const page_id of pageIds) {
      linhas.push({ tenant_id: tenantId, user_id: admin.id, page_id })
    }
  }

  const { error } = await supabase.from('pages_access').insert(linhas)
  // Duplicidade aqui não é erro: a página já estava liberada para esse usuário.
  if (error && error.code !== '23505') console.warn('Erro ao liberar página para os admins:', error.message)
}
