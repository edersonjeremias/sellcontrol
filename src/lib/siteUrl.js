// Base canônica dos links que saem do sistema (portal, recibo, rastreio,
// e-mails de senha).
//
// Usar window.location.origin direto faz o link herdar o domínio em que a loja
// está navegando. Quando isso é www.sellcontrol.app — que não tem certificado
// próprio — o navegador do cliente abre "Esta conexão não é privada" e a
// compra passa por golpe. Por isso o www é sempre removido, inclusive do
// fallback e de um VITE_SITE_URL mal configurado.
const CONFIGURADO = import.meta.env.VITE_SITE_URL?.trim().replace(/\/+$/, '')

function base() {
  const origem = CONFIGURADO
    || (typeof window !== 'undefined' ? window.location.origin : '')
  return origem.replace('://www.', '://')
}

export function siteUrl(caminho = '') {
  if (!caminho) return base()
  return `${base()}${caminho.startsWith('/') ? caminho : `/${caminho}`}`
}
