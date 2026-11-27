// ============================================================================
// Quem está olhando a loja — sem saber quem é
// ============================================================================
// Para o painel responder "de cada cem que entram, quantas compram", é preciso
// separar cem visitas de cem pessoas. Isso é feito com um número sorteado e
// guardado no navegador: ele não diz nome, telefone nem endereço, e some se a
// pessoa limpar o navegador.
//
// Não guardamos IP e não há script de rastreio de terceiro na página: quem
// conta é a própria Edge Function da loja, no servidor.
// ============================================================================

const CHAVE = 'sc_loja_visitante'

export function idVisitante() {
  try {
    const salvo = localStorage.getItem(CHAVE)
    if (salvo) return salvo

    const novo = (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .replace(/-/g, '')
      .slice(0, 32)

    localStorage.setItem(CHAVE, novo)
    return novo
  } catch {
    // Navegador com armazenamento bloqueado: a visita é contada como anônima,
    // e essa pessoa aparece como uma visita nova a cada vez
    return ''
  }
}

/**
 * De onde a pessoa veio.
 *
 * A fonte da campanha (utm_source) vem primeiro, porque é o que a loja
 * escreveu no link que divulgou; sem ela, vale o site que trouxe a visita.
 * O Instagram costuma mandar o utm, e o WhatsApp manda o referrer.
 */
export function origemDaVisita() {
  try {
    const utm = new URLSearchParams(window.location.search).get('utm_source')
    if (utm) return utm.slice(0, 60)

    const veio = document.referrer || ''
    if (!veio) return 'direto'
    if (veio.includes(window.location.host)) return 'direto' // navegação dentro da própria loja
    return new URL(veio).hostname.slice(0, 60)
  } catch {
    return 'direto'
  }
}
