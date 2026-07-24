import { supabase } from '../lib/supabase'

function tid(tenantId) {
  return tenantId || import.meta.env.VITE_TENANT_ID
}

// ── Listar cupons ──
export async function getCupons(tenantId) {
  const { data, error } = await supabase
    .from('cupons')
    .select('*')
    .eq('tenant_id', tid(tenantId))
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

// ── Criar cupom ──
export async function criarCupom(tenantId, cupom) {
  const { data, error } = await supabase
    .from('cupons')
    .insert([{
      tenant_id: tid(tenantId),
      codigo: cupom.codigo.toUpperCase().trim(),
      percentual: Number(cupom.percentual),
      data_inicio: cupom.data_inicio,
      data_fim: cupom.data_fim,
      ativo: cupom.ativo ?? true,
    }])
    .select()
    .single()

  if (error) throw error
  return data
}

// ── Atualizar cupom ──
export async function atualizarCupom(id, campos) {
  const { data, error } = await supabase
    .from('cupons')
    .update(campos)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

// ── Excluir cupom ──
export async function excluirCupom(id) {
  const { error } = await supabase
    .from('cupons')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// ── Validar cupom (usado no recibo) ──
export async function validarCupom(tenantId, codigo) {
  const { data, error } = await supabase
    .from('cupons')
    .select('*')
    .eq('tenant_id', tid(tenantId))
    .ilike('codigo', codigo.trim())
    .eq('ativo', true)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error('Cupom não encontrado ou inválido')
    }
    throw error
  }

  // Verificar período de validade
  const hoje = new Date().toISOString().split('T')[0]
  if (hoje < data.data_inicio || hoje > data.data_fim) {
    throw new Error('Cupom fora do período de validade')
  }

  return data
}

// ── Calcular desconto ──
export function calcularDesconto(total, percentual) {
  const desconto = (Number(total) * Number(percentual)) / 100
  return {
    desconto: desconto.toFixed(2),
    totalFinal: (Number(total) - desconto).toFixed(2),
  }
}
