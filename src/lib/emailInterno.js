// Usuários criados por username não têm e-mail real, mas o Supabase Auth exige
// um. O domínio antigo era @vmkids.local e o validador do Supabase passou a
// recusá-lo ("Unable to validate email address: invalid format"): .local é um
// TLD reservado e não tem registro MX. Por isso o domínio virou configurável.
export const DOMINIO_EMAIL_INTERNO =
  import.meta.env.VITE_EMAIL_DOMINIO_INTERNO || 'sellcontrol.app'

// Domínios já usados no passado: o login precisa continuar aceitando quem foi
// criado antes da mudança.
export const DOMINIOS_LEGADOS = ['vmkids.local']

export function emailDeUsername(username, dominio = DOMINIO_EMAIL_INTERNO) {
  return `${username}@${dominio}`
}

// Todos os e-mails que um username pode ter, na ordem em que o login deve tentar.
export function emailsPossiveis(username) {
  return [DOMINIO_EMAIL_INTERNO, ...DOMINIOS_LEGADOS].map(d => emailDeUsername(username, d))
}
