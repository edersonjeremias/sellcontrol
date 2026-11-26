// Usuários criados por username não têm e-mail real, mas o Supabase Auth exige
// um. O domínio antigo era @vmkids.local e o validador do Supabase passou a
// recusá-lo ("Unable to validate email address: invalid format"): .local é um
// TLD reservado e não tem registro MX. Por isso o domínio virou configurável.
export const DOMINIO_EMAIL_INTERNO =
  import.meta.env.VITE_EMAIL_DOMINIO_INTERNO || 'sellcontrol.app'

// Domínios já usados no passado: o login precisa continuar aceitando quem foi
// criado antes da mudança.
export const DOMINIOS_LEGADOS = ['vmkids.local']

// A cliente entra no portal com o @ do Instagram, e o Supabase Auth também
// exige e-mail: o endereço é montado com este domínio. Ele é só identificador
// interno, mas **mudar o valor invalida todos os logins já criados** — a conta
// no Auth é localizada pelo e-mail. Por isso o padrão continua o de origem.
export const DOMINIO_EMAIL_PORTAL =
  import.meta.env.VITE_PORTAL_EMAIL_DOMINIO || 'portal.vmkids.com.br'

const soHandle = (instagram) =>
  String(instagram || '').trim().replace(/^@+/, '').toLowerCase()

/**
 * E-mail da conta do portal de uma cliente, dentro de uma empresa.
 *
 * O @ sozinho não identifica mais a conta: a @maria da empresa A e a @maria da
 * empresa B são pessoas diferentes, e dividiam a mesma conta (quem cadastrasse
 * depois trocava a senha da outra). Por isso o endereço leva um pedaço do
 * tenant_id — estável, diferente do slug da loja, que a empresa pode mudar.
 *
 * Sem tenantId devolve o formato antigo, que é o das contas já criadas.
 */
export function emailPortalDeInstagram(instagram, tenantId = '') {
  const handle = soHandle(instagram)
  const empresa = String(tenantId || '').replace(/-/g, '').slice(0, 8).toLowerCase()
  const sufixo = empresa ? `.${empresa}` : ''
  return `${handle}${sufixo}@${DOMINIO_EMAIL_PORTAL}`
}

/**
 * Os endereços que a conta de uma cliente pode ter, na ordem em que o login
 * deve tentar: primeiro o da empresa, depois o antigo (de quando a conta era
 * global). Conta antiga continua entrando com a mesma senha.
 */
export function emailsPortalPossiveis(instagram, tenantId = '') {
  const comEmpresa = emailPortalDeInstagram(instagram, tenantId)
  const legado = emailPortalDeInstagram(instagram)
  return comEmpresa === legado ? [legado] : [comEmpresa, legado]
}

export function emailDeUsername(username, dominio = DOMINIO_EMAIL_INTERNO) {
  return `${username}@${dominio}`
}

// Todos os e-mails que um username pode ter, na ordem em que o login deve tentar.
export function emailsPossiveis(username) {
  return [DOMINIO_EMAIL_INTERNO, ...DOMINIOS_LEGADOS].map(d => emailDeUsername(username, d))
}
