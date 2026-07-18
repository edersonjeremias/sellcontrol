import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).json({ ok: true })
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' })

  const { instagram, whatsapp, nome_completo } = req.body || {}
  if (!instagram?.trim() || !whatsapp?.trim()) {
    return res.status(400).json({ error: 'instagram e whatsapp são obrigatórios' })
  }

  const phone = whatsapp.replace(/\D/g, '')
  if (phone.length < 6) {
    return res.status(400).json({ error: 'WhatsApp deve ter no mínimo 6 dígitos' })
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const instaSlug   = instagram.trim().replace(/^@/, '').toLowerCase()
  const email       = `${instaSlug}@portal.vmkids.com.br`
  const instaHandle = instaSlug // SEM @ - normalizado

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

  // Upsert em portal_clientes
  const { error: profErr } = await supabase
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
