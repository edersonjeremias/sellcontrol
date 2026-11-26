import { exigirUsuario } from './_auth.js'

// O e-mail da conta do portal é montado com este domínio — é só identificador
// interno do Supabase Auth, mas trocar o valor invalida os logins já criados.
// O mesmo padrão está em src/lib/emailInterno.js (DOMINIO_EMAIL_PORTAL).
const DOMINIO_PORTAL = process.env.PORTAL_EMAIL_DOMINIO || 'portal.vmkids.com.br'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).json({ ok: true })
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' })

  // Quem prepara o acesso da cliente é a equipe da loja, na tela de Clientes.
  // Até nov/2026 esta rota era aberta e, para conta já existente, **trocava a
  // senha** — qualquer um redefinia o acesso de uma cliente sabendo só o @
  // dela e abria sacolinha, débitos e endereço.
  const { perfil, admin: supabase, erro } = await exigirUsuario(req, ['master', 'admin', 'usuario'])
  if (erro) return res.status(erro.status).json({ error: erro.error })

  const { instagram, whatsapp, nome_completo } = req.body || {}
  if (!instagram?.trim() || !whatsapp?.trim()) {
    return res.status(400).json({ error: 'instagram e whatsapp são obrigatórios' })
  }

  const phone = whatsapp.replace(/\D/g, '')
  if (phone.length < 6) {
    return res.status(400).json({ error: 'WhatsApp deve ter no mínimo 6 dígitos' })
  }

  const instaSlug   = instagram.trim().replace(/^@/, '').toLowerCase()
  const email       = `${instaSlug}@${DOMINIO_PORTAL}`
  const instaHandle = instaSlug // SEM @ - normalizado

  // A cliente tem que ser da empresa de quem está preparando o acesso. Sem
  // isto, a equipe de uma empresa mexeria no acesso da cliente de outra — as
  // contas do portal são identificadas só pelo @, sem tenant.
  const { data: clienteDaEmpresa } = await supabase
    .from('clientes')
    .select('id')
    .eq('tenant_id', perfil.tenant_id)
    .ilike('instagram', instaHandle)
    .maybeSingle()

  if (!clienteDaEmpresa) {
    return res.status(403).json({
      error: 'Esta cliente não está cadastrada na sua empresa. Cadastre primeiro em Clientes.',
    })
  }

  // Tenta criar o usuário no Auth
  let userId
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password: phone,
    email_confirm: true,
  })

  if (createErr) {
    // Se já existe, busca e atualiza a senha
    const jaExiste =
      createErr.message?.toLowerCase().includes('already') ||
      createErr.message?.toLowerCase().includes('exist')  ||
      createErr.status === 422

    if (!jaExiste) {
      return res.status(400).json({ error: 'Erro Auth: ' + createErr.message })
    }

    // Busca pelo email na lista de usuários
    let found = null
    let page  = 1
    while (!found) {
      const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers({
        page, perPage: 1000,
      })
      if (listErr || !users?.length) break
      found = users.find(u => u.email === email)
      if (found || users.length < 1000) break
      page++
    }

    if (!found) {
      return res.status(400).json({ error: 'Usuário não encontrado: ' + createErr.message })
    }

    // Atualiza a senha
    const { error: updErr } = await supabase.auth.admin.updateUserById(found.id, {
      password: phone,
      email_confirm: true,
    })
    if (updErr) return res.status(400).json({ error: 'Erro ao atualizar senha: ' + updErr.message })
    userId = found.id
  } else {
    userId = created.user.id
  }

  // portal_clientes tem unique em user_id E em instagram. Resolver o conflito
  // apenas por user_id quebrava quando já havia uma linha com esse instagram
  // apontando para outro usuário do Auth (cliente recadastrado, ou usuário
  // recriado): o insert batia em portal_clientes_instagram_key.
  // O instagram é a identidade do cliente no portal, então é por ele que a
  // linha é localizada; o user_id passa a ser o da conta recém-preparada.
  const { data: existente } = await supabase
    .from('portal_clientes')
    .select('id, nome_completo')
    .eq('instagram', instaHandle)
    .maybeSingle()

  const { error: profErr } = existente
    ? await supabase
        .from('portal_clientes')
        .update({
          user_id: userId,
          nome_completo: nome_completo || existente.nome_completo || '',
        })
        .eq('id', existente.id)
    : await supabase
        .from('portal_clientes')
        .upsert(
          { user_id: userId, instagram: instaHandle, nome_completo: nome_completo || '' },
          { onConflict: 'user_id' }
        )

  if (profErr) {
    const tableMissing =
      profErr.message?.includes('does not exist') ||
      profErr.code === '42P01' ||
      profErr.message?.includes('relation') ||
      profErr.message?.includes('schema cache')
    return res.status(503).json({
      error: profErr.message,
      tableMissing,
    })
  }

  return res.status(200).json({ ok: true, email, login: instaHandle, senha: phone })
}
