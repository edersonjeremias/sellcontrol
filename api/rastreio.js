import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).json({})
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' })

  const { r: romaneio, t: tenantId } = req.query
  if (!romaneio || !tenantId) return res.status(400).json({ error: 'Parâmetros inválidos' })

  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: 'Configuração inválida' })

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  // Rastreio Público é um módulo da assinatura: sem ele, a página não abre
  // para as clientes da empresa. Erro na pergunta deixa passar e fica no log —
  // tirar o rastreio do ar por engano gera ligação de cliente procurando
  // pedido que já saiu.
  const { data: temRastreio, error: erroModulo } = await supabase
    .rpc('tenant_tem_modulo', { p_tenant_id: tenantId, p_slug: 'rastreio' })

  if (erroModulo) {
    console.error('Não foi possível conferir o módulo Rastreio:', erroModulo)
  } else if (temRastreio !== true) {
    return res.status(404).json({ error: 'Rastreio não disponível' })
  }

  const [itemsRes, cfgRes] = await Promise.all([
    supabase
      .from('vendas')
      .select('produto, modelo, cor, marca, tamanho, preco, codigo, cliente_nome, data_live, status')
      .eq('tenant_id', tenantId)
      .eq('numero_pedido', Number(romaneio))
      .order('codigo'),
    supabase
      .from('configuracoes')
      .select('nome_loja')
      .eq('tenant_id', tenantId)
      .maybeSingle(),
  ])

  if (itemsRes.error) {
    console.error('Erro rastreio:', itemsRes.error)
    return res.status(500).json({ error: itemsRes.error.message })
  }

  return res.status(200).json({
    itens: itemsRes.data || [],
    romaneio: Number(romaneio),
    nomeLoja: cfgRes.data?.nome_loja || 'VM Kids',
  })
}
