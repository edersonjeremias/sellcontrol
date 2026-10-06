import { supabase } from '../lib/supabase'

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

// ═══════════════════════════════════════════════════════════════
// BUSCAR PRODUTOS
// ═══════════════════════════════════════════════════════════════

export async function getProdutos(tenantId, filtros = {}) {
  try {
    // Query para contar total de registros (necessário para paginação)
    let countQuery = supabase
      .from('produtos')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)

    // Query para buscar dados
    let query = supabase
      .from('produtos')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })

    // Filtro por ativo/inativo
    if (filtros.ativo !== undefined) {
      query = query.eq('ativo', filtros.ativo)
      countQuery = countQuery.eq('ativo', filtros.ativo)
    }

    // Filtro por busca de texto (produto, modelo, cor, marca, código)
    if (filtros.busca) {
      const termos = filtros.busca.toLowerCase().split(',').map(t => t.trim()).filter(Boolean)

      // Para cada termo, busca em múltiplos campos
      termos.forEach(termo => {
        const orCondition = `produto.ilike.%${termo}%,modelo.ilike.%${termo}%,cor.ilike.%${termo}%,marca.ilike.%${termo}%,codigo.ilike.%${termo}%`
        query = query.or(orCondition)
        countQuery = countQuery.or(orCondition)
      })
    }

    // Filtro por data de cadastro
    if (filtros.dataInicio) {
      const dataInicioObj = new Date(filtros.dataInicio + 'T00:00:00')
      query = query.gte('created_at', dataInicioObj.toISOString())
      countQuery = countQuery.gte('created_at', dataInicioObj.toISOString())
    }

    if (filtros.dataFim) {
      const dataFimObj = new Date(filtros.dataFim + 'T23:59:59')
      query = query.lte('created_at', dataFimObj.toISOString())
      countQuery = countQuery.lte('created_at', dataFimObj.toISOString())
    }

    // Paginação
    const page = filtros.page || 1
    const limit = filtros.limit || 100
    const from = (page - 1) * limit
    const to = from + limit - 1

    query = query.range(from, to)

    // Executa as queries
    const [{ data, error }, { count, error: countError }] = await Promise.all([
      query,
      countQuery
    ])

    if (error) throw error
    if (countError) throw countError

    return {
      data: data || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit)
    }
  } catch (err) {
    console.error('❌ Erro ao buscar produtos:', err)
    throw err
  }
}

// ═══════════════════════════════════════════════════════════════
// BUSCAR PRODUTO POR ID
// ═══════════════════════════════════════════════════════════════

export async function getProdutoById(id) {
  try {
    const { data, error } = await supabase
      .from('produtos')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  } catch (err) {
    console.error('❌ Erro ao buscar produto:', err)
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
      ativo: produto.ativo !== undefined ? produto.ativo : true,
    }

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
    // Busca produto atual
    const produto = await getProdutoById(id)

    if (!produto) throw new Error('Produto não encontrado')

    // Calcula nova quantidade
    const novaQuantidade = Math.max(0, produto.quantidade - qtd)

    // Atualiza quantidade
    const { data, error } = await supabase
      .from('produtos')
      .update({ quantidade: novaQuantidade })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return {
      ...data,
      zerou: novaQuantidade === 0,
      quantidadeAnterior: produto.quantidade,
    }
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
    // Busca produto atual
    const produto = await getProdutoById(id)

    if (!produto) throw new Error('Produto não encontrado')

    // Calcula nova quantidade
    const novaQuantidade = produto.quantidade + qtd

    // Atualiza quantidade
    const { data, error } = await supabase
      .from('produtos')
      .update({ quantidade: novaQuantidade })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
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
