// ============================================================================
// Link da peça com foto — /loja/:slug/p/:codigo
// ============================================================================
// O sistema é uma SPA: o HTML que sai do servidor é sempre o mesmo esqueleto,
// e a peça só aparece depois que o JavaScript roda. O robô do WhatsApp, do
// Instagram e do Facebook não roda JavaScript — ele lê o HTML cru e vai
// embora. Sem isto, o link da peça é colado sem foto, sem nome e sem preço,
// e link assim quase não recebe toque.
//
// Esta função serve o MESMO index.html do site, com as meta tags da peça
// injetadas no lugar das genéricas. A cliente recebe o app igual ao de
// sempre; o robô recebe a foto.
// ============================================================================

const ESCAPAR = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/**
 * Nome e descrição da peça entram dentro de atributos HTML. São texto que a
 * loja digitou no cadastro, então escapar aqui é o que impede uma aspa no
 * nome do produto de quebrar a tag — ou de injetar outra.
 */
const escapar = (texto) => String(texto || '').replace(/[&<>"']/g, c => ESCAPAR[c])

const moeda = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default async function handler(req, res) {
  const { slug = '', codigo = '' } = req.query

  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

  // O HTML do próprio site, com os nomes dos arquivos daquele build. Buscar
  // em vez de montar à mão é o que mantém esta página igual às outras depois
  // de cada deploy.
  const origem = `https://${req.headers['x-forwarded-host'] || req.headers.host}`
  let html = ''

  try {
    const r = await fetch(`${origem}/index.html`)
    html = await r.text()
  } catch (err) {
    console.error('Não foi possível ler o index.html:', err)
    return res.redirect(302, `/loja/${encodeURIComponent(slug)}`)
  }

  let peca = null
  let loja = null

  if (SUPABASE_URL && SUPABASE_KEY && slug && codigo) {
    try {
      const resposta = await fetch(`${SUPABASE_URL}/functions/v1/loja-publica`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({ acao: 'peca', slug, codigo }),
      })
      const dados = await resposta.json()
      peca = dados?.peca || null
      loja = dados?.loja || null
    } catch (err) {
      // Falha aqui não pode derrubar a página: a cliente ainda tem de
      // conseguir abrir a peça, mesmo que o robô fique sem a foto.
      console.error('Não foi possível ler a peça:', err)
    }
  }

  const nomeLoja = loja?.nome || 'Loja'
  const url = `${origem}/loja/${encodeURIComponent(slug)}/p/${encodeURIComponent(codigo)}`

  const titulo = peca
    ? [[peca.produto, peca.modelo, peca.cor].filter(Boolean).join(' '), moeda(peca.preco)]
        .filter(Boolean).join(' — ')
    : nomeLoja

  const descricao = peca
    ? [
        peca.marca && `Marca ${peca.marca}`,
        peca.tamanho && `tamanho ${peca.tamanho}`,
        'peça única',
      ].filter(Boolean).join(' · ')
    : 'Peças selecionadas, prontas para enviar.'

  const tags = [
    `<title>${escapar(titulo)} | ${escapar(nomeLoja)}</title>`,
    `<meta name="description" content="${escapar(descricao)}" />`,
    `<meta property="og:type" content="product" />`,
    `<meta property="og:site_name" content="${escapar(nomeLoja)}" />`,
    `<meta property="og:title" content="${escapar(titulo)}" />`,
    `<meta property="og:description" content="${escapar(descricao)}" />`,
    `<meta property="og:url" content="${escapar(url)}" />`,
    peca?.imagem ? `<meta property="og:image" content="${escapar(peca.imagem)}" />` : '',
    // O WhatsApp só monta o cartão grande quando sabe o tamanho da imagem;
    // sem isso ele costuma cair na miniatura quadrada.
    peca?.imagem ? `<meta property="og:image:width" content="1080" />` : '',
    peca?.imagem ? `<meta property="og:image:height" content="1350" />` : '',
    peca?.imagem ? `<meta name="twitter:card" content="summary_large_image" />` : '',
    peca?.imagem ? `<meta name="twitter:image" content="${escapar(peca.imagem)}" />` : '',
    peca ? `<meta property="product:price:amount" content="${Number(peca.preco || 0).toFixed(2)}" />` : '',
    peca ? `<meta property="product:price:currency" content="BRL" />` : '',
  ].filter(Boolean).join('\n    ')

  // Tira o título e as og: genéricas do esqueleto para não ficarem duas, que
  // é quando o robô escolhe a errada
  const limpo = html
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta\s+property="og:[^"]*"[^>]*>\s*/gi, '')

  const final = limpo.replace(/<head>/i, `<head>\n    ${tags}`)

  // Peça vendida sai do catálogo, e o link continua circulando: o cartão
  // antigo não pode ficar preso no cache do WhatsApp por horas.
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600')
  return res.status(200).send(final)
}
