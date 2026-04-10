import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  // 1. Verifica a senha de segurança do ManyChat
  const secret = req.headers.get('x-webhook-secret')
  if (secret !== 'vmk_live_2024_xK9p') {
    return new Response(JSON.stringify({ erro: 'Acesso negado' }), { status: 401 })
  }

  // 2. Recebe os dados em JSON que o ManyChat enviou
  const body = await req.json()
  const instagram_username =
    body?.instagram_username ??
    body?.instagram ??
    body?.usuario ??
    body?.username ??
    body?.nome_cliente ??
    body?.manychat_user ??
    body?.contact?.instagram ??
    body?.user?.instagram ??
    ''

  const codigo_peca =
    body?.codigo_peca ??
    body?.codigo ??
    body?.codigo_da_peca ??
    body?.ultima_entrada_texto ??
    body?.ultima_interacao ??
    body?.last_input ??
    body?.message ??
    body?.user?.codigo_da_peca ??
    ''

  const usuario = String(instagram_username || '').trim()
  const codigoRaw = String(codigo_peca || '').trim()
  // Aceita comentario como "227", "227 ", "#227" ou "quero 227"
  const codigoNormalizado = codigoRaw
    .replace(/^#/, '')
    .trim()
    .split(/\s+/)
    .pop() || ''

  if (!usuario || !codigoNormalizado) {
    return new Response(
      JSON.stringify({
        ok: false,
        mensagem: 'Dados invalidos: usuario ou codigo ausente.',
        payload_keys: Object.keys(body || {}),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  }

  // 3. Conecta no seu banco de dados Supabase
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const supabase = createClient(supabaseUrl, supabaseKey)

  // 4. Atualiza a peca somente quando cliente estiver vazio/nulo
  // Busca por codigo com normalizacao simples para reduzir falhas de digitacao/espaco.
  const { data: candidatas, error: erroBusca } = await supabase
    .from('vendas')
    .select('id, codigo, cliente_nome, created_at')
    .or('cliente_nome.eq.,cliente_nome.is.null')
    .order('created_at', { ascending: true })

  if (erroBusca) {
    return new Response(
      JSON.stringify({ ok: false, mensagem: 'Erro interno ao buscar peca.' }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  }

  const candidata = (candidatas || []).find((v: any) =>
    String(v.codigo || '').trim().toLowerCase() === codigoNormalizado.toLowerCase()
  )

  if (!candidata) {
    return new Response(
      JSON.stringify({ ok: false, mensagem: `Poxa, a peça ${codigoNormalizado} esgotou ou o código é inválido! Fique de olho na próxima.` }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  }

  const { data, error } = await supabase
    .from('vendas')
    .update({ cliente_nome: usuario })
    .eq('id', candidata.id)
    .select()

  // 5. Verifica se deu erro interno (Status 200 forçado para o ManyChat ler)
  if (error) {
    return new Response(
      JSON.stringify({ ok: false, mensagem: "Erro interno no sistema da loja." }), 
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  }

  // 6. Se "data" voltar vazio: a peça não existe ou ALGUÉM PEGOU ANTES!
  if (!data || data.length === 0) {
    return new Response(
      JSON.stringify({ ok: false, mensagem: `Poxa, a peça ${codigoNormalizado} esgotou ou o código é inválido! Fique de olho na próxima.` }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  }

  // 7. Se passou por tudo, a peça é da cliente!
  return new Response(
    JSON.stringify({ ok: true, mensagem: `Uhuul! A peça ${codigoNormalizado} é sua! 🎉 Vou colocar na sua sacolinha.` }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  )
})