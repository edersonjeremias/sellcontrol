import { supabase } from '../lib/supabase'
import { exigirTenant } from '../lib/tenant'

// ============================================================================
// Painel da Loja — números do canal público
// ============================================================================
// Tudo vem de uma função só no banco (loja_painel): a tela mostra o funil
// inteiro de uma vez, e sete consultas separadas fariam o painel montar aos
// pedaços na frente de quem abriu.
//
// A função confere no banco se quem pediu é da empresa — SECURITY DEFINER
// ignora RLS, então a checagem não pode ficar aqui no navegador.
// ============================================================================

/** Data de hoje no formato que o banco espera, no fuso de Brasília */
export function hojeISO(diasAtras = 0) {
  const agora = new Date(Date.now() - diasAtras * 24 * 60 * 60 * 1000)
  const brt = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const p = (n) => String(n).padStart(2, '0')
  return `${brt.getFullYear()}-${p(brt.getMonth() + 1)}-${p(brt.getDate())}`
}

export async function getPainelLoja(tenantId, desde, ate) {
  const tid = exigirTenant(tenantId, 'painel da loja')

  const { data, error } = await supabase.rpc('loja_painel', {
    p_tenant_id: tid,
    p_desde: desde || hojeISO(29),
    p_ate: ate || hojeISO(),
  })

  if (error) throw error
  return data || {}
}

/**
 * Quanto de uma etapa chegou na seguinte.
 *
 * Zero embaixo devolve null, não zero: "0%" diria que ninguém converteu,
 * quando na verdade ninguém chegou a passar por ali.
 */
export function taxa(parte, total) {
  const t = Number(total || 0)
  if (!t) return null
  return (Number(parte || 0) / t) * 100
}
