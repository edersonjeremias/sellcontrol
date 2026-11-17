// Limpeza do HTML que sai do editor do mural de avisos.
//
// O texto é escrito por gente da casa, mas é colado de WhatsApp, de e-mail e
// do Word — e vem com <script>, <style>, atributos de evento e lixo de
// formatação da Microsoft. Como o corpo é exibido com dangerouslySetInnerHTML
// em todas as telas do sistema, a limpeza acontece duas vezes: ao salvar e ao
// exibir. Assim um aviso gravado antes desta regra também entra limpo.

const TAGS_PERMITIDAS = new Set([
  'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'MARK', 'SMALL',
  'P', 'BR', 'DIV', 'SPAN', 'FONT',
  'UL', 'OL', 'LI', 'BLOCKQUOTE',
  'H1', 'H2', 'H3', 'H4',
  'A', 'IMG', 'HR',
])

const ATRIBUTOS_PERMITIDOS = {
  A:    ['href', 'target', 'rel'],
  IMG:  ['src', 'alt'],
  FONT: ['color', 'size'],
}

// Só o que o editor realmente produz. Qualquer outra propriedade (position,
// background-image, etc.) é descartada para o aviso não conseguir escapar do
// card e cobrir a tela.
const ESTILOS_PERMITIDOS = new Set([
  'color', 'background-color', 'font-size', 'font-weight', 'font-style',
  'text-align', 'text-decoration', 'width', 'max-width',
])

function filtrarEstilo(valor) {
  return String(valor)
    .split(';')
    .map(regra => regra.trim())
    .filter(Boolean)
    .filter(regra => {
      const [prop, ...resto] = regra.split(':')
      const conteudo = resto.join(':').toLowerCase()
      if (!prop || !conteudo) return false
      if (conteudo.includes('url(') || conteudo.includes('expression')) return false
      return ESTILOS_PERMITIDOS.has(prop.trim().toLowerCase())
    })
    .join('; ')
}

function urlSegura(valor, aceitaDados = false) {
  const url = String(valor || '').trim()
  if (/^https?:\/\//i.test(url)) return url
  if (aceitaDados && /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(url)) return url
  return ''
}

export function sanitizarHtml(html) {
  if (!html) return ''
  if (typeof window === 'undefined' || !window.DOMParser) return ''

  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const raiz = doc.body.firstElementChild
  if (!raiz) return ''

  // Percorre de trás para frente: remover um nó não desloca os que ainda
  // faltam visitar.
  const elementos = Array.from(raiz.querySelectorAll('*')).reverse()

  for (const el of elementos) {
    const tag = el.tagName.toUpperCase()

    if (!TAGS_PERMITIDAS.has(tag)) {
      // Script e style vão embora com o conteúdo junto; uma tag qualquer de
      // layout (table, section) perde a casca e mantém o texto.
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'IFRAME' || tag === 'OBJECT' || tag === 'EMBED') {
        el.remove()
      } else {
        el.replaceWith(...el.childNodes)
      }
      continue
    }

    for (const attr of Array.from(el.attributes)) {
      const nome = attr.name.toLowerCase()

      if (nome === 'style') {
        const limpo = filtrarEstilo(attr.value)
        if (limpo) el.setAttribute('style', limpo)
        else el.removeAttribute('style')
        continue
      }

      const permitidos = ATRIBUTOS_PERMITIDOS[tag] || []
      if (!permitidos.includes(nome)) {
        el.removeAttribute(attr.name)
        continue
      }

      if (nome === 'href') {
        const url = urlSegura(attr.value)
        if (!url) el.removeAttribute('href')
        else {
          el.setAttribute('href', url)
          el.setAttribute('target', '_blank')
          el.setAttribute('rel', 'noopener noreferrer')
        }
      }

      if (nome === 'src') {
        const url = urlSegura(attr.value, true)
        if (!url) el.remove()
        else el.setAttribute('src', url)
      }
    }
  }

  return raiz.innerHTML
}

// Prévia do card: o HTML vira texto puro para caber em três linhas sem levar
// junto o tamanho de fonte e a cor que o autor usou no corpo.
export function htmlParaTexto(html) {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(
    String(html).replace(/<(br|\/p|\/div|\/li|\/h[1-4])>/gi, ' '),
    'text/html'
  )
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim()
}
