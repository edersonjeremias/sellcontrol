// ============================================================================
// Endereços dos links da bio
// ============================================================================
// Quem configura digita o que sabe de cor — o @ do Instagram, o número do
// WhatsApp, o endereço da loja física. Montar a URL é trabalho do sistema:
// pedir "https://wa.me/5511…" a quem está cadastrando é pedir link quebrado.
//
// O mesmo arquivo serve a tela de configuração e a página aberta, para as
// duas nunca discordarem sobre para onde o botão leva.
// ============================================================================

/** Tipos em que o que se digita não é uma URL, e sim um usuário/número */
const SO_DIGITOS = (texto) => String(texto || '').replace(/\D/g, '')
const SEM_ARROBA = (texto) => String(texto || '').trim().replace(/^@+/, '')

const ehUrl = (texto) => /^https?:\/\//i.test(String(texto || '').trim())
const ehCaminho = (texto) => String(texto || '').trim().startsWith('/')

/**
 * WhatsApp só aceita o número com código do país. Quem digita no Brasil
 * digita o DDD e o número: 10 ou 11 dígitos. Aí o 55 entra sozinho.
 */
function whatsapp(valor) {
  const n = SO_DIGITOS(valor)
  if (!n) return ''
  const completo = n.length <= 11 ? `55${n}` : n
  return `https://wa.me/${completo}`
}

/**
 * Transforma o que foi digitado no endereço final.
 * Uma URL completa colada sempre vence o palpite do tipo: quem colou o link
 * inteiro sabe para onde quer mandar.
 */
export function montarUrlBio(tipo, valor) {
  const texto = String(valor || '').trim()
  if (!texto) return ''

  switch (tipo) {
    case 'whatsapp':
      return ehUrl(texto) ? texto : whatsapp(texto)

    case 'instagram':
      return ehUrl(texto) ? texto : `https://instagram.com/${SEM_ARROBA(texto)}`

    case 'tiktok':
      return ehUrl(texto) ? texto : `https://tiktok.com/@${SEM_ARROBA(texto)}`

    case 'facebook':
      return ehUrl(texto) ? texto : `https://facebook.com/${SEM_ARROBA(texto)}`

    case 'youtube':
      return ehUrl(texto) ? texto : `https://youtube.com/@${SEM_ARROBA(texto)}`

    case 'email':
      return texto.startsWith('mailto:') ? texto : `mailto:${texto}`

    case 'telefone': {
      if (texto.startsWith('tel:')) return texto
      const n = SO_DIGITOS(texto)
      if (!n) return ''
      return `tel:+${n.length <= 11 ? `55${n}` : n}`
    }

    case 'endereco':
      return ehUrl(texto)
        ? texto
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(texto)}`

    case 'pix':
      // Link de cobrança abre; chave avulsa não vira URL — a página copia.
      return texto

    case 'loja':
    case 'portal':
      // Caminho de dentro do próprio sistema, guardado relativo de propósito:
      // o link continua certo se a empresa trocar de domínio.
      return ehUrl(texto) || ehCaminho(texto) ? texto : `/${texto.replace(/^\/+/, '')}`

    default:
      return ehUrl(texto) || ehCaminho(texto) || texto.startsWith('mailto:') || texto.startsWith('tel:')
        ? texto
        : `https://${texto}`
  }
}

/**
 * O caminho de volta: do endereço guardado para o que a tela de configuração
 * mostra no campo. Sem isso, reabrir a configuração mostraria
 * "https://wa.me/5511999998888" onde a pessoa digitou "11999998888".
 */
export function valorVisivelBio(tipo, url) {
  const texto = String(url || '').trim()
  if (!texto) return ''

  switch (tipo) {
    case 'whatsapp': {
      const m = texto.match(/wa\.me\/(\d+)/i)
      if (!m) return texto
      const n = m[1]
      return n.startsWith('55') && n.length > 11 ? n.slice(2) : n
    }
    case 'instagram':
      return texto.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/$/, '')
    case 'tiktok':
      return texto.replace(/^https?:\/\/(www\.)?tiktok\.com\/@?/i, '').replace(/\/$/, '')
    case 'facebook':
      return texto.replace(/^https?:\/\/(www\.)?facebook\.com\//i, '').replace(/\/$/, '')
    case 'youtube':
      return texto.replace(/^https?:\/\/(www\.)?youtube\.com\//i, '').replace(/\/$/, '')
    case 'email':
      return texto.replace(/^mailto:/i, '')
    case 'telefone':
      return texto.replace(/^tel:\+?/i, '')
    case 'endereco': {
      const m = texto.match(/[?&]query=([^&]+)/)
      return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : texto
    }
    default:
      return texto
  }
}

/** Clicar copia em vez de abrir: chave Pix não é endereço de nada. */
export const ehChavePix = (link) =>
  link?.tipo === 'pix' && !ehUrl(link?.url) && !ehCaminho(link?.url)

/**
 * O que pode virar href.
 *
 * montarUrlBio já prefixa https:// no que não reconhece, mas o endereço
 * também chega do banco, e um dia pode chegar de uma importação. "javascript:"
 * e "data:" dentro de um href são execução de código na página de quem
 * clicou — aqui eles simplesmente não viram link.
 */
export function hrefSeguro(url) {
  const texto = String(url || '').trim()
  if (!texto) return undefined
  if (/^(https?:|mailto:|tel:|\/)/i.test(texto)) return texto
  return undefined
}
