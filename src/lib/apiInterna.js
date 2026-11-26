// ============================================================================
// CHAMADAS ÀS ROTAS INTERNAS (api/) — sempre com a identidade de quem clicou
// ============================================================================
// As rotas de api/ que mexem em usuários e contas rodam com service role e
// agora exigem o token de quem está logado (ver api/_auth.js). Este ajudante
// garante que o token vai no cabeçalho — chamar com `fetch` cru esquece disso.
// ============================================================================

import { supabase } from './supabase'

export async function postApiInterna(rota, corpo = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token

  if (!token) throw new Error('Sessão expirada. Entre no sistema de novo.')

  const resposta = await fetch(rota, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(corpo),
  })

  const json = await resposta.json().catch(() => ({}))

  if (!resposta.ok) {
    const erro = new Error(json.error || `Erro ${resposta.status}`)
    erro.status = resposta.status
    erro.dados = json
    throw erro
  }

  return json
}
