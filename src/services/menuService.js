import { supabase } from '../lib/supabase'

export const CATEGORIA_PADRAO = 'Outros'

// Páginas do tenant na ordem em que aparecem no menu.
export async function getPaginasDoMenu(tenantId) {
  const { data, error } = await supabase
    .from('pages')
    .select('id, slug, label, category, icon, order_index')
    .eq('tenant_id', tenantId)
    .order('order_index', { ascending: true })

  if (error) throw error
  return data || []
}

// Agrupa as páginas em categorias, preservando a ordem do order_index.
export function agruparEmCategorias(paginas) {
  const porNome = new Map()
  for (const pagina of paginas) {
    const nome = (pagina.category || '').trim() || CATEGORIA_PADRAO
    if (!porNome.has(nome)) porNome.set(nome, { nome, paginas: [] })
    porNome.get(nome).paginas.push(pagina)
  }
  return [...porNome.values()]
}

// Numera as categorias em blocos de 100 e as páginas de 10 em 10 dentro de
// cada bloco, para o menu sair exatamente na ordem montada na tela.
export function numerarMenu(categorias) {
  const atualizacoes = []
  categorias.forEach((categoria, iCat) => {
    categoria.paginas.forEach((pagina, iPag) => {
      atualizacoes.push({
        id: pagina.id,
        category: categoria.nome.trim(),
        order_index: (iCat + 1) * 100 + iPag * 10,
      })
    })
  })
  return atualizacoes
}

export async function salvarMenu(categorias) {
  const atualizacoes = numerarMenu(categorias)

  const resultados = await Promise.all(
    atualizacoes.map(({ id, category, order_index }) =>
      supabase.from('pages').update({ category, order_index }).eq('id', id)
    )
  )

  const falha = resultados.find(r => r.error)
  if (falha) throw falha.error

  return atualizacoes.length
}
