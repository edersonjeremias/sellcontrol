import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  // 1. Verifica a senha de segurança do ManyChat
  const secret = req.headers.get('x-webhook-secret')
  if (secret !== 'vmk_live_2024_xK9p') {
    return new Response(JSON.stringify({ erro: 'Acesso negado' }), { status: 401 })
  }

  // 2. Recebe os dados em JSON que o ManyChat enviou
  const { instagram_username, codigo_peca } = await req.json()

  // 3. Conecta no seu banco de dados Supabase
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const supabase = createClient(supabaseUrl, supabaseKey)

  // 4. A MÁGICA: Atualiza APENAS se o cliente_nome for VAZIO ('')
  const { data, error } = await supabase
    .from('vendas')
    .update({ cliente_nome: instagram_username })
    .eq('codigo', codigo_peca)
    .eq('cliente_nome', '') // Ajuste fundamental: o SellControl salva vazio, não nulo!
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
      JSON.stringify({ ok: false, mensagem: `Poxa, a peça ${codigo_peca} esgotou ou o código é inválido! Fique de olho na próxima.` }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  }

  // 7. Se passou por tudo, a peça é da cliente!
  return new Response(
    JSON.stringify({ ok: true, mensagem: `Uhuul! A peça ${codigo_peca} é sua! 🎉 Vou colocar na sua sacolinha.` }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  )
})