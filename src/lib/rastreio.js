/**
 * Link de acompanhamento do objeto.
 *
 * Usamos o Melhor Rastreio em vez do site da transportadora: ele abre já
 * preenchido e sem captcha (o rastreamento dos Correios exige digitar um).
 * O formato é /app/<transportadora>/<codigo>.
 */

// Slug de cada transportadora no Melhor Rastreio
const SLUGS = {
  correios: 'correios',
  jadlog: 'jadlog',
  loggi: 'loggi',
  azul: 'azulcargo',
  latam: 'latamcargo',
  sequoia: 'sequoia',
  buslog: 'buslog',
}

function slugTransportadora(transportadora, codigo) {
  const nome = String(transportadora || '').toLowerCase()
  const conhecida = Object.keys(SLUGS).find(chave => nome.includes(chave))
  if (conhecida) return SLUGS[conhecida]

  if (nome) {
    // Transportadora nova: o padrão do site é o nome sem espaços nem pontuação
    return nome.replace(/[^a-z0-9]/g, '') || null
  }

  // Sem transportadora registrada, o formato do código entrega quem é
  const cod = String(codigo || '').toUpperCase()
  if (cod.startsWith('BLI')) return SLUGS.loggi
  if (/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(cod)) return SLUGS.correios
  if (/^\d{10,}$/.test(cod)) return SLUGS.jadlog
  return null
}

export function linkRastreio(codigo, transportadora = '') {
  const cod = String(codigo || '').trim()
  if (!cod) return null

  const slug = slugTransportadora(transportadora, cod)
  return slug
    ? `https://www.melhorrastreio.com.br/app/${slug}/${cod}`
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
