import { supabase } from '../lib/supabase'
import { siteUrl } from '../lib/siteUrl'

// ═══════════════════════════════════════════════════════════════
// FORMATAÇÃO DE VALORES
// ═══════════════════════════════════════════════════════════════

export function formatMoney(valor) {
  if (!valor && valor !== 0) return ''
  const num = typeof valor === 'number' ? valor : parseFloat(valor)
  if (isNaN(num)) return ''
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function parseMoney(str) {
  if (!str) return null
  const num = parseFloat(String(str).replace(/\./g, '').replace(',', '.'))
  return isNaN(num) ? null : num
}

/**
 * Peso da peça em gramas, como o campo da planilha devolve.
 * Vazio volta null (e não 0): null é "não informado", e o frete cai para o
 * peso da categoria; 0 seria um peso de verdade, zerado.
 */
function parsePeso(valor) {
  if (valor === null || valor === undefined || String(valor).trim() === '') return null
  const num = parseInt(String(valor).replace(/\D/g, ''), 10)
  return Number.isNaN(num) || num <= 0 ? null : num
}

// ═══════════════════════════════════════════════════════════════
// BUSCAR PRODUTOS
// ═══════════════════════════════════════════════════════════════

export async function getProdutos(tenantId, filtros = {}) {
  try {
    // A contagem exata varre a tabela inteira: só vale a pena quando a tela mostra paginação
    const contar = filtros.contar !== false

    let countQuery = contar
      ? supabase
          .from('produtos')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
      : null

    // Query para buscar dados
    let query = supabase
      .from('produtos')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })

    // Filtro por ativo/inativo
    if (filtros.ativo !== undefined) {
      query = query.eq('ativo', filtros.ativo)
      if (countQuery) countQuery = countQuery.eq('ativo', filtros.ativo)
    }

    // Filtro por busca de texto (produto, modelo, cor, marca, código)
    if (filtros.busca) {
      const termos = filtros.busca.toLowerCase().split(',').map(t => t.trim()).filter(Boolean)

      // Para cada termo, busca em múltiplos campos
      termos.forEach(termo => {
        const orCondition = `produto.ilike.%${termo}%,modelo.ilike.%${termo}%,cor.ilike.%${termo}%,marca.ilike.%${termo}%,codigo.ilike.%${termo}%,tamanho.ilike.%${termo}%`
        query = query.or(orCondition)
        if (countQuery) countQuery = countQuery.or(orCondition)
      })
    }

    // Filtro por estoque. gte descarta quantidade nula, zerada e negativa
    if (filtros.comEstoque) {
      query = query.gte('quantidade', 1)
      if (countQuery) countQuery = countQuery.gte('quantidade', 1)
    }

    // Só as peças que estão no ar na loja pública
    if (filtros.publicadosLoja) {
      query = query.eq('publicado_loja', true)
      if (countQuery) countQuery = countQuery.eq('publicado_loja', true)
    }

    // Filtro por data de cadastro
    if (filtros.dataInicio) {
      const dataInicioObj = new Date(filtros.dataInicio + 'T00:00:00')
      query = query.gte('created_at', dataInicioObj.toISOString())
      if (countQuery) countQuery = countQuery.gte('created_at', dataInicioObj.toISOString())
    }

    if (filtros.dataFim) {
      const dataFimObj = new Date(filtros.dataFim + 'T23:59:59')
      query = query.lte('created_at', dataFimObj.toISOString())
      if (countQuery) countQuery = countQuery.lte('created_at', dataFimObj.toISOString())
    }

    // Paginação
    const page = filtros.page || 1
    const limit = filtros.limit || 100
    const from = (page - 1) * limit
    const to = from + limit - 1

    query = query.range(from, to)

    // Permite abortar a requisição quando o usuário continua digitando
    if (filtros.signal) {
      query = query.abortSignal(filtros.signal)
      if (countQuery) countQuery = countQuery.abortSignal(filtros.signal)
    }

    // Executa as queries
    const [{ data, error }, countResult] = await Promise.all([
      query,
      countQuery || Promise.resolve({ count: null, error: null })
    ])

    if (error) throw error
    if (countResult.error) throw countResult.error

    const total = countResult.count ?? (data?.length || 0)

    return {
      data: data || [],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  } catch (err) {
    console.error('❌ Erro ao buscar produtos:', err)
    throw err
  }
}

// ═══════════════════════════════════════════════════════════════
// CRIAR PRODUTO
// ═══════════════════════════════════════════════════════════════

export async function criarProduto(tenantId, produto) {
  try {
    const novoProduto = {
      tenant_id: tenantId,
      codigo: produto.codigo || '',
      produto: produto.produto || '',
      modelo: produto.modelo || '',
      cor: produto.cor || '',
      marca: produto.marca || '',
      tamanho: produto.tamanho || '',
      genero: produto.genero || '',
      condicao: produto.condicao || 'Novo',
      custo: parseFloat(produto.custo) || 0,
      preco: parseFloat(produto.preco) || 0,
      preco_promocional: parseFloat(produto.preco_promocional) || 0,
      quantidade: parseInt(produto.quantidade) || 0,
      peso_gramas: parsePeso(produto.peso_gramas),
      ativo: true,
    }

    const { data, error } = await supabase
      .from('produtos')
      .insert([novoProduto])
      .select()
      .single()

    if (error) throw error
    return data
  } catch (err) {
    console.error('❌ Erro ao criar produto:', err)
    throw err
  }
}

// ═══════════════════════════════════════════════════════════════
// ATUALIZAR PRODUTO
// ═══════════════════════════════════════════════════════════════

export async function atualizarProduto(id, produto) {
  try {
    const produtoAtualizado = {
      codigo: produto.codigo || '',
      produto: produto.produto || '',
      modelo: produto.modelo || '',
      cor: produto.cor || '',
      marca: produto.marca || '',
      tamanho: produto.tamanho || '',
      genero: produto.genero || '',
      condicao: produto.condicao || 'Novo',
      custo: parseFloat(produto.custo) || 0,
      preco: parseFloat(produto.preco) || 0,
      preco_promocional: parseFloat(produto.preco_promocional) || 0,
      quantidade: parseInt(produto.quantidade) || 0,
      peso_gramas: parsePeso(produto.peso_gramas),
      ativo: produto.ativo !== undefined ? produto.ativo : true,
    }
    // publicado_loja NÃO entra aqui de propósito: quem liga e desliga é
    // definirPublicadoLoja, que valida foto, preço e estoque antes. Se
    // entrasse, o auto-save da planilha despublicaria a peça sem querer
    // sempre que a linha em memória estivesse sem o campo.

    const { data, error } = await supabase
      .from('produtos')
      .update(produtoAtualizado)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  } catch (err) {
    console.error('❌ Erro ao atualizar produto:', err)
    throw err
  }
}

// ═══════════════════════════════════════════════════════════════
// DESATIVAR PRODUTO (não deleta, só marca como inativo)
// ═══════════════════════════════════════════════════════════════

export async function desativarProduto(id) {
  try {
    const { data, error } = await supabase
      .from('produtos')
      .update({ ativo: false })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  } catch (err) {
    console.error('❌ Erro ao desativar produto:', err)
    throw err
  }
}

// ═══════════════════════════════════════════════════════════════
// REATIVAR PRODUTO
// ═══════════════════════════════════════════════════════════════

export async function reativarProduto(id) {
  try {
    const { data, error } = await supabase
      .from('produtos')
      .update({ ativo: true })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  } catch (err) {
    console.error('❌ Erro ao reativar produto:', err)
    throw err
  }
}

// ═══════════════════════════════════════════════════════════════
// DEDUZIR QUANTIDADE (ao vender)
// ═══════════════════════════════════════════════════════════════

export async function deduzirQuantidade(id, qtd = 1) {
  try {
    // A conta roda dentro do UPDATE (ver AJUSTAR_ESTOQUE.sql): duas baixas
    // simultâneas no mesmo produto não se sobrescrevem
    const { data, error } = await supabase.rpc('ajustar_estoque', {
      p_id: id,
      p_delta: -qtd
    })

    if (error) throw error
    return { id, quantidade: data }
  } catch (err) {
    console.error('❌ Erro ao deduzir quantidade:', err)
    throw err
  }
}

// ═══════════════════════════════════════════════════════════════
// DEVOLVER QUANTIDADE (ao estornar)
// ═══════════════════════════════════════════════════════════════

export async function devolverQuantidade(id, qtd = 1) {
  try {
    const { data, error } = await supabase.rpc('ajustar_estoque', {
      p_id: id,
      p_delta: qtd
    })

    if (error) throw error
    return { id, quantidade: data }
  } catch (err) {
    console.error('❌ Erro ao devolver quantidade:', err)
    throw err
  }
}

// ═══════════════════════════════════════════════════════════════
// VERIFICAR SE CÓDIGO JÁ EXISTE
// ═══════════════════════════════════════════════════════════════

export async function verificarCodigoExiste(tenantId, codigo, excluirId = null) {
  try {
    let query = supabase
      .from('produtos')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('codigo', codigo)

    // Exclui o próprio produto ao editar
    if (excluirId) {
      query = query.neq('id', excluirId)
    }

    const { data, error } = await query

    if (error) throw error
    return data && data.length > 0
  } catch (err) {
    console.error('❌ Erro ao verificar código:', err)
    throw err
  }
}

// ═══════════════════════════════════════════════════════════════
// LOJA PÚBLICA — publicar e despublicar peça
// ═══════════════════════════════════════════════════════════════

/**
 * Por que esta peça não pode ir ao ar. Devolve null quando ela pode.
 *
 * As mesmas cinco condições do plano da loja. Elas são conferidas de novo no
 * banco na hora de reservar (loja_reservar_peca): aqui é para a tela avisar
 * antes, com o motivo em texto.
 */
export function motivoNaoPublicavel(produto) {
  if (!produto?.id)                                  return 'Salve a peça antes de publicar'
  if (produto.ativo === false)                       return 'Peça inativa não vai para a loja'
  if (!(parseInt(produto.quantidade) > 0))           return 'Sem estoque: a peça já foi vendida'
  if (!(numeroDe(produto.preco) > 0))                return 'Defina o preço antes de publicar'
  if (!(produto.imagens?.length > 0))                return 'Peça sem foto não vende: adicione ao menos uma'
  if (!String(produto.codigo || '').trim())          return 'A peça precisa de código: é o link dela na loja'
  return null
}

// O preço chega da planilha como "139,90" e do banco como 139.9
function numeroDe(valor) {
  if (typeof valor === 'number') return valor
  return parseMoney(valor) || 0
}

/**
 * Liga ou desliga a peça no catálogo público.
 *
 * Update isolado, fora do auto-save: a flag é uma decisão de uma clique, e
 * não pode depender do debounce da planilha nem arrastar outros campos.
 */
export async function definirPublicadoLoja(id, publicar) {
  const { data, error } = await supabase
    .from('produtos')
    .update({ publicado_loja: !!publicar })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    // idx_produtos_codigo_publicado: o link da peça é o código, então duas
    // peças publicadas com o mesmo código apontariam para a mesma página
    if (error.code === '23505') {
      throw new Error('Já existe outra peça publicada com este código. Troque o código de uma delas.')
    }
    console.error('❌ Erro ao publicar na loja:', error)
    throw error
  }
  return data
}

/** Link da peça para divulgar: sellcontrol.app/loja/<slug>/p/<codigo> */
export function linkPecaLoja(slug, codigo) {
  const s = String(slug || '').trim()
  const c = String(codigo || '').trim()
  if (!s || !c) return ''
  return siteUrl(`/loja/${s}/p/${encodeURIComponent(c)}`)
}

// ═══════════════════════════════════════════════════════════════
// BUSCAR PRÓXIMO CÓDIGO AUTOMÁTICO
// ═══════════════════════════════════════════════════════════════

export async function getProximoCodigo(tenantId) {
  try {
    // Busca o maior código numérico atual
    const { data, error } = await supabase
      .from('produtos')
      .select('codigo')
      .eq('tenant_id', tenantId)
      .order('codigo', { ascending: false })
      .limit(100) // Pega os últimos 100 para analisar

    if (error) throw error

    // Filtra apenas códigos numéricos e pega o maior
    const codigos = (data || [])
      .map(p => parseInt(p.codigo))
      .filter(c => !isNaN(c))
      .sort((a, b) => b - a)

    const maiorCodigo = codigos.length > 0 ? codigos[0] : 99
    return maiorCodigo + 1
  } catch (err) {
    console.error('❌ Erro ao buscar próximo código:', err)
    return 100 // Padrão caso erro
  }
}
