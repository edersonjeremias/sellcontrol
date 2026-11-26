// ============================================================================
// Prévia do link da bio — /bio/:slug
// ============================================================================
// Mesmo problema do link da peça: o sistema é uma SPA, e o robô do WhatsApp,
// do Instagram e do Telegram lê o HTML cru, sem rodar JavaScript. Sem isto, o
// link colado numa conversa aparece como "SellControl", e não como a loja.
//
// Serve o MESMO index.html do site, com as meta tags da página no lugar das
// genéricas: quem clica recebe o app de sempre, o robô recebe o logo e o nome.
// ============================================================================

const ESCAPAR = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/**
 * Nome e frase da página entram dentro de atributos HTML. São texto que a
 * loja digitou, então escapar aqui é o que impede uma aspa no nome de quebrar
 * a tag — ou de injetar outra.
 */
const escapar = (texto) => String(texto || '').replace(/[&<>"']/g, c => ESCAPAR[c])

export default async function handler(req, res) {
  const { slug = '' } = req.query

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
    return res.status(500).send('Erro ao abrir a página')
  }

  let pagina = null

  if (SUPABASE_URL && SUPABASE_KEY && slug) {
    try {
      const resposta = await fetch(`${SUPABASE_URL}/rest/v1/rpc/bio_publica`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({ p_slug: slug }),
      })
      const dados = await resposta.json()
      if (dados?.encontrada && dados?.ativa) pagina = dados.pagina || null
    } catch (err) {
      // Falha aqui não pode derrubar a página: quem clicou ainda tem de
      // conseguir abri-la, mesmo que o robô fique sem o logo.
      console.error('Não foi possível ler a página da bio:', err)
    }
  }

  const titulo = pagina?.titulo || 'Links'
  const descricao = pagina?.descricao || 'Todos os nossos links em um lugar só.'
  const url = `${origem}/bio/${encodeURIComponent(slug)}`

  const tags = [
    `<title>${escapar(titulo)}</title>`,
    `<meta name="description" content="${escapar(descricao)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapar(titulo)}" />`,
    `<meta property="og:title" content="${escapar(titulo)}" />`,
    `<meta property="og:description" content="${escapar(descricao)}" />`,
    `<meta property="og:url" content="${escapar(url)}" />`,
    pagina?.logo_url ? `<meta property="og:image" content="${escapar(pagina.logo_url)}" />` : '',
    // Logo costuma ser quadrado: o cartão pequeno é o que fica bem aqui.
    `<meta name="twitter:card" content="${pagina?.logo_url ? 'summary' : 'summary_large_image'}" />`,
    pagina?.logo_url ? `<meta name="twitter:image" content="${escapar(pagina.logo_url)}" />` : '',
    pagina?.cor_fundo ? `<meta name="theme-color" content="${escapar(pagina.cor_fundo)}" />` : '',
  ].filter(Boolean).join('\n    ')

  // Tira o título e as og: genéricas do esqueleto para não ficarem duas, que
  // é quando o robô escolhe a errada
  const limpo = html
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta\s+property="og:[^"]*"[^>]*>\s*/gi, '')

  const final = limpo.replace(/<head>/i, `<head>\n    ${tags}`)

  // A loja troca o logo e o nome quando quer: cinco minutos de cache é o que
  // deixa o cartão novo circular sem fazer esta função rodar a cada toque.
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600')
  return res.status(200).send(final)
}
