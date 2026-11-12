import { createClient } from '@supabase/supabase-js'

// ============================================================================
// EXTRATO DO MERCADO PAGO — separa o que entrou de frete e o que entrou de venda
// ============================================================================
// A conta do MP é a mesma para os dois. Aqui a gente baixa os pagamentos
// aprovados do período e classifica cada um:
//
//   frete  — o id do pagamento está em pagamentos_frete (PIX do romaneio)
//   venda  — o id está em cobrancas.pix_payment_id, ou o external_reference
//            aponta para uma cobrança
//   outro  — não deu match; fica para o usuário classificar na tela
//
// O token do MP nunca vai para o navegador: ele é lido aqui com service role.
// ============================================================================

const MP_API = 'https://api.mercadopago.com'
const PAGINA = 100
const MAX_OFFSET = 1000 // limite de paginação da busca do MP

function fim(res, status, body) {
  return res.status(status).json(body)
}

// Soma as taxas que o MP cobrou no pagamento
function somaTaxas(pag) {
  if (!Array.isArray(pag?.fee_details)) return null
  return pag.fee_details.reduce((s, f) => s + (Number(f?.amount) || 0), 0)
}

function liquido(pag) {
  const net = pag?.transaction_details?.net_received_amount
  if (net !== null && net !== undefined && net !== '') return Number(net)
  const bruto = Number(pag?.transaction_amount) || 0
  const taxa = somaTaxas(pag)
  return taxa === null ? bruto : Number((bruto - taxa).toFixed(2))
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

// O MP devolve campos mascarados ("XXXXXXXXXXX") quando quem pagou não é
// cliente da conta. Isso não é nome nem e-mail: vale menos que vazio, porque a
// tela mostraria o lixo como se fosse dado. Serve quem tem alguma letra fora de
// X/x ou algum dígito.
function semMascara(valor) {
  const s = typeof valor === 'string' ? valor.trim() : ''
  if (!s) return null
  return /[A-WYZa-wyz0-9]/.test(s) ? s : null
}

// Quem pagou, na ordem em que o MP costuma trazer a informação boa:
// titular do cartão, titular da conta no PIX, nome do payer.
function nomeDoPagador(p) {
  const bank = p?.point_of_interaction?.transaction_data?.bank_info?.payer
  const nomePayer = [p?.payer?.first_name, p?.payer?.last_name].filter(Boolean).join(' ')
  return semMascara(p?.card?.cardholder?.name)
    || semMascara(bank?.long_name)
    || semMascara(bank?.account_holder_name)
    || semMascara(nomePayer)
}

function docDoPagador(p) {
  const bank = p?.point_of_interaction?.transaction_data?.bank_info?.payer
  const docPix = typeof bank?.identification === 'string'
    ? bank.identification
    : bank?.identification?.number
  return semMascara(p?.card?.cardholder?.identification?.number)
    || semMascara(docPix)
    || semMascara(p?.payer?.identification?.number)
}

function inteiro(v) {
  const n = parseInt(v, 10)
  return isNaN(n) ? null : n
}

function decimal(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).json({ ok: true })
  if (req.method !== 'POST') return fim(res, 405, { error: 'Método não permitido' })

  const { tenantId, dataIni, dataFim } = req.body || {}
  if (!tenantId || !dataIni || !dataFim) {
    return fim(res, 400, { error: 'Informe tenantId, dataIni e dataFim' })
  }

  const SUPABASE_URL = process.env.SUPABASE_URL
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return fim(res, 500, { error: 'Servidor sem configuração do Supabase' })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  // ── Quem está chamando ────────────────────────────────────────────────────
  const auth = req.headers.authorization || ''
  const accessToken = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!accessToken) return fim(res, 401, { error: 'Faça login novamente' })

  const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken)
  if (userErr || !userData?.user) return fim(res, 401, { error: 'Sessão inválida' })

  const { data: perfil } = await supabase
    .from('users_perfil')
    .select('tenant_id, role, ativo')
    .eq('id', userData.user.id)
    .maybeSingle()

  if (!perfil || perfil.ativo === false) return fim(res, 403, { error: 'Sem acesso' })
  if (perfil.role !== 'master' && perfil.tenant_id !== tenantId) {
    return fim(res, 403, { error: 'Sem acesso a esta empresa' })
  }

  // ── Token do Mercado Pago ─────────────────────────────────────────────────
  const { data: cfg } = await supabase
    .from('configuracoes')
    .select('mp_access_token')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  const mpToken = cfg?.mp_access_token?.trim() || process.env.MP_ACCESS_TOKEN || ''
  if (!mpToken) {
    return fim(res, 422, {
      error: 'Token do Mercado Pago não configurado. Vá em Configurações → Integrações.',
    })
  }

  // ── Baixa os pagamentos aprovados do período ──────────────────────────────
  // O MP espera data ISO com fuso; o Brasil é UTC-3.
  const inicio = dataIni + 'T00:00:00.000-03:00'
  const termino = dataFim + 'T23:59:59.999-03:00'

  const pagamentos = []
  let total = 0
  let truncado = false

  try {
    for (let offset = 0; offset <= MAX_OFFSET; offset += PAGINA) {
      const qs = new URLSearchParams({
        sort: 'date_approved',
        criteria: 'desc',
        range: 'date_approved',
        begin_date: inicio,
        end_date: termino,
        status: 'approved',
        limit: String(PAGINA),
        offset: String(offset),
      })

      const resp = await fetch(MP_API + '/v1/payments/search?' + qs, {
        headers: { Authorization: 'Bearer ' + mpToken },
      })

      if (!resp.ok) {
        const txt = await resp.text()
        return fim(res, 502, {
          error: 'Mercado Pago recusou a consulta (' + resp.status + '): ' + txt.slice(0, 300),
        })
      }

      const json = await resp.json()
      const results = json?.results || []
      total = json?.paging?.total ?? results.length
      pagamentos.push(...results)

      if (results.length < PAGINA || pagamentos.length >= total) break
      if (offset + PAGINA > MAX_OFFSET && pagamentos.length < total) truncado = true
    }
  } catch (e) {
    return fim(res, 502, { error: 'Falha ao consultar o Mercado Pago: ' + (e.message || e) })
  }

  if (pagamentos.length === 0) {
    return fim(res, 200, {
      ok: true, total: 0, frete: 0, venda: 0, outro: 0, truncado: false,
      total_frete: 0, total_venda: 0, total_outro: 0,
    })
  }

  const ids = pagamentos.map(p => String(p.id))

  // ── Quem é frete: pagamento criado pelo sistema para um romaneio ──────────
  const { data: pagsFrete } = await supabase
    .from('pagamentos_frete')
    .select('id, romaneio_id, gateway_transaction_id, romaneios!inner(tenant_id, numero)')
    .in('gateway_transaction_id', ids)
    .eq('romaneios.tenant_id', tenantId)

  const mapaFrete = new Map()
  for (const p of pagsFrete || []) {
    mapaFrete.set(String(p.gateway_transaction_id), p)
  }

  // ── Quem é venda: PIX ou preferência de cobrança ──────────────────────────
  const { data: cobsPix } = await supabase
    .from('cobrancas')
    .select('id, pix_payment_id')
    .eq('tenant_id', tenantId)
    .in('pix_payment_id', ids)

  const mapaVenda = new Map()
  for (const c of cobsPix || []) mapaVenda.set(String(c.pix_payment_id), c.id)

  // O external_reference das preferências é o id da cobrança (às vezes "<id>-P1")
  const refs = [...new Set(
    pagamentos
      .map(p => (String(p.external_reference || '').match(UUID_RE) || [])[0])
      .filter(Boolean)
  )]

  const refsValidas = new Set()
  if (refs.length) {
    const { data: cobsRef } = await supabase
      .from('cobrancas')
      .select('id')
      .eq('tenant_id', tenantId)
      .in('id', refs)
    for (const c of cobsRef || []) refsValidas.add(c.id)
  }

  // ── O que o usuário já classificou à mão não é sobrescrito ────────────────
  const { data: jaSalvos } = await supabase
    .from('mp_extrato')
    .select('mp_payment_id, origem, origem_auto, romaneio_id, cobranca_id')
    .eq('tenant_id', tenantId)
    .in('mp_payment_id', ids)

  const manuais = new Map()
  for (const r of jaSalvos || []) {
    if (r.origem_auto === false) manuais.set(String(r.mp_payment_id), r)
  }

  // ── Monta as linhas ───────────────────────────────────────────────────────
  const agora = new Date().toISOString()

  const linhas = pagamentos.map(p => {
    const id = String(p.id)
    const taxa = somaTaxas(p)
    const base = {
      tenant_id: tenantId,
      mp_payment_id: id,
      data_aprovacao: p.date_approved || p.date_created || null,
      valor: Number(p.transaction_amount) || 0,
      taxa: taxa === null ? null : Number(taxa.toFixed(2)),
      liquido: liquido(p),
      metodo: p.payment_method_id || null,
      tipo_pagamento: p.payment_type_id || null,
      parcelas: inteiro(p.installments),
      valor_parcela: decimal(p.transaction_details?.installment_amount),
      cartao_final: p.card?.last_four_digits || null,
      descricao: p.description || null,
      payer_email: semMascara(p.payer?.email),
      pagador_nome: nomeDoPagador(p),
      pagador_doc: docDoPagador(p),
      status: p.status || null,
      raw: p,
      updated_at: agora,
    }

    const manual = manuais.get(id)
    if (manual) {
      return {
        ...base,
        origem: manual.origem,
        origem_auto: false,
        romaneio_id: manual.romaneio_id,
        cobranca_id: manual.cobranca_id,
      }
    }

    const frete = mapaFrete.get(id)
    if (frete) {
      return { ...base, origem: 'frete', origem_auto: true, romaneio_id: frete.romaneio_id, cobranca_id: null }
    }

    const vendaId = mapaVenda.get(id)
    if (vendaId) {
      return { ...base, origem: 'venda', origem_auto: true, romaneio_id: null, cobranca_id: vendaId }
    }

    const ref = (String(p.external_reference || '').match(UUID_RE) || [])[0]
    if (ref && refsValidas.has(ref)) {
      return { ...base, origem: 'venda', origem_auto: true, romaneio_id: null, cobranca_id: ref }
    }

    // Último recurso: a descrição do PIX de frete diz "Romaneio"
    if (/romaneio|frete/i.test(base.descricao || '')) {
      return { ...base, origem: 'frete', origem_auto: true, romaneio_id: null, cobranca_id: null }
    }

    return { ...base, origem: 'outro', origem_auto: true, romaneio_id: null, cobranca_id: null }
  })

  const { error: upErr } = await supabase
    .from('mp_extrato')
    .upsert(linhas, { onConflict: 'tenant_id,mp_payment_id' })

  if (upErr) return fim(res, 500, { error: 'Erro ao gravar o extrato: ' + upErr.message })

  // ── Atualiza taxa e líquido dos pagamentos de frete ───────────────────────
  // É o valor que de fato caiu na conta — a base do que vai ser transferido.
  for (const l of linhas) {
    if (l.origem !== 'frete') continue
    const pf = mapaFrete.get(l.mp_payment_id)
    if (!pf) continue
    await supabase
      .from('pagamentos_frete')
      .update({ mp_taxa: l.taxa, valor_liquido: l.liquido })
      .eq('id', pf.id)
  }

  const doTipo = o => linhas.filter(l => l.origem === o)
  const soma = arr => Number(arr.reduce((s, l) => s + (Number(l.liquido) || 0), 0).toFixed(2))

  return fim(res, 200, {
    ok: true,
    total: linhas.length,
    truncado,
    frete: doTipo('frete').length,
    venda: doTipo('venda').length,
    outro: doTipo('outro').length,
    total_frete: soma(doTipo('frete')),
    total_venda: soma(doTipo('venda')),
    total_outro: soma(doTipo('outro')),
  })
}
