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

// ── Status do cupom (VIGENTE | FUTURO | EXPIRADO | ESGOTADO) ──
// O Postgres devolve TIME como "HH:MM:SS"; o slice garante "HH:MM" ao montar o timestamp.
function hhmm(hora, padrao) {
  return hora ? String(hora).slice(0, 5) : padrao
}

export function statusCupom(cupom) {
  const agora = new Date()
  const inicio = new Date(`${cupom.data_inicio}T${hhmm(cupom.hora_inicio, '00:00')}:00-03:00`)
  const fim = new Date(`${cupom.data_fim}T${hhmm(cupom.hora_fim, '23:59')}:59-03:00`)

  const temLimite = cupom.limite_usos !== null && cupom.limite_usos !== undefined
  if (temLimite && (cupom.usos_realizados || 0) >= cupom.limite_usos) return 'ESGOTADO'

  if (agora < inicio) return 'FUTURO'
  if (agora > fim) return 'EXPIRADO'
  return 'VIGENTE'
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

  const status = statusCupom(data)
  if (status === 'ESGOTADO') throw new Error('CUPOM ESGOTADO')
  if (status === 'FUTURO') throw new Error('Cupom ainda não está válido')
  if (status === 'EXPIRADO') throw new Error('Cupom expirado')

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
