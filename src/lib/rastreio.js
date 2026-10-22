/**
 * Link de acompanhamento do objeto.
 *
 * Os Correios têm página própria; para as demais transportadoras o rastreio
 * universal do Melhor Envio é o que funciona com o código que guardamos.
 */
export function linkRastreio(codigo, transportadora = '') {
  const cod = String(codigo || '').trim()
  if (!cod) return null

  return String(transportadora).toLowerCase().includes('correios')
    ? `https://rastreamento.correios.com.br/app/index.php?codigo=${cod}`
    : `https://www.melhorrastreio.com.br/rastreio/${cod}`
}

/** Dispara a busca do código no Melhor Envio; falha em silêncio de propósito */
export async function sincronizarRastreio(filtros = {}) {
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/sincronizar-rastreio`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(filtros),
    })

    if (!response.ok) return { atualizados: 0 }
    return await response.json()
  } catch {
    // Rastreio é informação acessória: nunca deve atrapalhar o carregamento
    return { atualizados: 0 }
  }
}
