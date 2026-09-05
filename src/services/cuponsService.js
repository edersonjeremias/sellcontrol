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
      hora_inicio: cupom.hora_inicio || null,
      hora_fim: cupom.hora_fim || null,
      limite_usos: cupom.limite_usos || null,
      usos_realizados: 0,
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

  // Verificar período de validade (horário de Brasília)
  const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const [dataStr, horaStr] = agora.split(', ')
  const hoje = dataStr.split('/').reverse().join('-') // DD/MM/YYYY → YYYY-MM-DD
  const horaAtual = horaStr.substring(0, 5) // HH:MM (remove segundos)

  // Validar data
  if (hoje < data.data_inicio || hoje > data.data_fim) {
    throw new Error('Cupom expirado')
  }

  // Validar horário (se definido)
  if (data.hora_inicio || data.hora_fim) {
    const horaIni = data.hora_inicio || '00:00'
    const horaFin = data.hora_fim || '23:59'

    // Se é o dia de início, verificar se já passou da hora de início
    if (hoje === data.data_inicio && horaAtual < horaIni) {
      throw new Error('Cupom expirado')
    }

    // Se é o dia de fim, verificar se ainda não passou da hora de fim
    if (hoje === data.data_fim && horaAtual > horaFin) {
      throw new Error('Cupom expirado')
    }

    // Se é um dia entre início e fim, está válido
  }

  // Validar limite de usos
  if (data.limite_usos !== null && data.limite_usos !== undefined) {
    const usosRealizados = data.usos_realizados || 0
    if (usosRealizados >= data.limite_usos) {
      throw new Error('CUPONS ESGOTADO')
    }
  }

  return data
}

// ── Incrementar uso do cupom ──
export async function incrementarUsoCupom(cupomId) {
  // Busca o cupom atual
  const { data: cupom, error: fetchError } = await supabase
    .from('cupons')
    .select('usos_realizados')
    .eq('id', cupomId)
    .single()

  if (fetchError) {
    console.error('Erro ao buscar cupom:', fetchError)
    return null
  }

  // Incrementa +1
  const novosUsos = (cupom.usos_realizados || 0) + 1

  const { data, error } = await supabase
    .from('cupons')
    .update({ usos_realizados: novosUsos })
    .eq('id', cupomId)
    .select('usos_realizados')
    .single()

  if (error) {
    console.error('Erro ao incrementar uso do cupom:', error)
    // Não lança erro para não quebrar o fluxo do recibo
  }

  console.log(`✅ Cupom ${cupomId} incrementado: ${novosUsos} usos`)
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
