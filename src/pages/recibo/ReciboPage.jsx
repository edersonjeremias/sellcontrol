import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { getCobrancaById, formatMoeda, dividirPagamento, gerarPreferenciaMp, getSaldoCliente } from '../../services/cobrancasService'
import { validarCupom, calcularDesconto, incrementarUsoCupom } from '../../services/cuponsService'
import { supabase } from '../../lib/supabase'

function fmtData(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

const STATUS_LABEL = { PAGO: 'Pago ✅', BAIXADO: 'Pago ✅', CANCELADO: 'Cancelado ❌', PENDENTE: 'Aguardando Pagamento', ENVIADO: 'Aguardando Pagamento', REENVIADO: 'Aguardando Pagamento', LEMBRETE: 'Aguardando Pagamento' }
const STATUS_COR   = { PAGO: '#81c995', BAIXADO: '#81c995', CANCELADO: '#f28b82', PENDENTE: '#fbbc04' }

async function chamarConfirmacao(cobrancaId, paymentId, externalReference) {
  try {
    const resp = await fetch('/api/confirmar-pagamento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cobrancaId, paymentId, externalReference }),
    })
    return await resp.json()
  } catch {
    return { ok: false }
  }
}

export default function ReciboPage() {
  const { id }       = useParams()
  const [cob, setCob] = useState(null)
  const [erro, setErro] = useState(false)
  const [verificando, setVerificando] = useState(false)
  const [verificado,  setVerificado]  = useState(false)
  const [nomeEmpresa, setNomeEmpresa] = useState('Loja')
  const [saldoCredito, setSaldoCredito] = useState({ saldoAtual: 0, saldoRestante: 0 })

  // Estados para divisão de pagamento
  const [showDividir, setShowDividir] = useState(false)
  const [valorP1, setValorP1] = useState('')
  const [dividindo, setDividindo] = useState(false)
  const [erroDivisao, setErroDivisao] = useState('')

  // Estados para cupom de desconto
  const [codigoCupom, setCodigoCupom] = useState('')
  const [aplicando, setAplicando] = useState(false)
  const [cupomAplicado, setCupomAplicado] = useState(null)
  const [erroCupom, setErroCupom] = useState('')

  const carregarCob = async () => {
    if (!id) { setErro(true); return }
    setErro(false)
    try {
      const res = await getCobrancaById(id)
      if (!res) { setErro(true); return }

      // ✅ Busca status ATUAL dos itens no banco (para detectar cancelamentos posteriores)
      if (res.itens && Array.isArray(res.itens) && res.itens.length > 0 && res.tenant_id) {
        try {
          // Extrai códigos únicos dos itens (assume formato: "1234 Produto...")
          const codigosStr = res.itens
            .map(item => {
              const match = item.descricao?.match(/^\d+/)
              return match ? match[0] : null
            })
            .filter(Boolean)

          // Converte para número E string (pois não sabemos o tipo do campo no banco)
          const codigosNum = codigosStr.map(c => parseInt(c, 10)).filter(c => !isNaN(c))

          if (codigosStr.length > 0 && codigosNum.length > 0) {
            // Busca por código numérico OU string
            const { data: vendasAtuais } = await supabase
              .from('vendas')
              .select('codigo, status')
              .eq('tenant_id', res.tenant_id)
              .or(`codigo.in.(${codigosNum.join(',')}),codigo.in.(${codigosStr.map(c => `"${c}"`).join(',')})`)

            console.log('🔍 Buscando itens cancelados:', {
              codigos: codigosNum,
              encontrados: vendasAtuais?.length || 0,
              itens: vendasAtuais
            })

            if (vendasAtuais && vendasAtuais.length > 0) {
              // Mapa código → status atual (normaliza para string)
              const statusMap = {}
              vendasAtuais.forEach(v => {
                const cod = String(v.codigo)
                statusMap[cod] = v.status
                console.log(`📌 Código ${cod} → status: ${v.status}`)
              })

              // Atualiza campo cancelado nos itens
              res.itens = res.itens.map(item => {
                const match = item.descricao?.match(/^\d+/)
                if (match) {
                  const codigo = match[0]
                  const statusAtual = statusMap[codigo]
                  // Marca como cancelado se status atual é "Cancelado"
                  if (statusAtual && String(statusAtual).toUpperCase().includes('CANCELADO')) {
                    console.log(`❌ Marcando como cancelado: ${item.descricao}`)
                    return { ...item, cancelado: true }
                  }
                }
                return item
              })
            }
          }
        } catch (err) {
          console.error('Erro ao buscar status dos itens:', err)
        }
      }

      setCob(res)

      // 💰 Buscar saldo de crédito do cliente
      if (res.cliente && res.tenant_id) {
        try {
          const { saldo } = await getSaldoCliente(res.tenant_id, res.cliente)

          // Calcular quanto de crédito foi usado nesta cobrança
          const creditoUsado = (res.itens || [])
            .filter(item => item.descricao?.includes('🎁') && item.valor < 0)
            .reduce((total, item) => total + Math.abs(item.valor), 0)

          // Saldo restante = saldo atual + crédito já usado
          const saldoRestante = saldo

          setSaldoCredito({
            saldoAtual: saldo + creditoUsado, // Saldo antes de aplicar este desconto
            saldoRestante: saldoRestante,      // Saldo disponível agora
          })
        } catch (err) {
          console.error('Erro ao buscar saldo de crédito:', err)
        }
      }

      // Restaurar cupom se já foi aplicado
      if (res.cupom_codigo && res.cupom_desconto_percentual && res.cupom_desconto_valor) {
        const totalOriginal = Number(res.total) + Number(res.cupom_desconto_valor)

        // ✅ Se JÁ ESTÁ PAGO, sempre mostra o cupom (mesmo que expirado!)
        if (res.status === 'PAGO' || res.status === 'BAIXADO') {
          setCupomAplicado({
            codigo: res.cupom_codigo,
            percentual: res.cupom_desconto_percentual,
            desconto: res.cupom_desconto_valor,
            totalOriginal,
            totalFinal: Number(res.total),
            data_inicio: null,
            data_fim: null,
            hora_inicio: null,
            hora_fim: null,
          })
        } else {
          // Status PENDENTE → validar se cupom ainda está vigente
          try {
            const cupom = await validarCupom(res.tenant_id, res.cupom_codigo)

            // Cupom ainda válido - restaurar
            setCupomAplicado({
              codigo: res.cupom_codigo,
              percentual: res.cupom_desconto_percentual,
              desconto: res.cupom_desconto_valor,
              totalOriginal,
              totalFinal: Number(res.total),
              data_inicio: cupom.data_inicio,
              data_fim: cupom.data_fim,
              hora_inicio: cupom.hora_inicio,
              hora_fim: cupom.hora_fim,
            })
          } catch (err) {
            // Cupom expirado - remover do banco (só se PENDENTE!)
            await supabase
              .from('cobrancas')
              .update({
                cupom_codigo: null,
                cupom_desconto_percentual: null,
                cupom_desconto_valor: null,
                total: totalOriginal
              })
              .eq('id', id)

            // Recarregar cobrança atualizada
            const { data: cobAtualizada } = await supabase
              .from('cobrancas')
              .select('*')
              .eq('id', id)
              .single()

            if (cobAtualizada) {
              setCob(cobAtualizada)
            }

            // Limpar estado local
            setCupomAplicado(null)
            setCodigoCupom('')
            setErroCupom('Cupom expirado! O desconto foi removido. Você pode inserir outro cupom válido.')
          }
        }
      }
    } catch {
      setErro(true)
    }
  }

  // Carregamento inicial
  useEffect(() => { carregarCob() }, [id])

  // Carregar nome da empresa (separado para evitar race condition)
  useEffect(() => {
    const carregarNomeEmpresa = async () => {
      if (!cob?.tenant_id) return

      try {
        // Tentar 1: Buscar de configuracoes.nome_loja
        const { data: config } = await supabase
          .from('configuracoes')
          .select('nome_loja')
          .eq('tenant_id', cob.tenant_id)
          .maybeSingle()

        if (config?.nome_loja?.trim()) {
          setNomeEmpresa(config.nome_loja)
          return
        }

        // Tentar 2: Buscar de tenants (nome ou slug)
        const { data: tenant } = await supabase
          .from('tenants')
          .select('nome, slug')
          .eq('id', cob.tenant_id)
          .maybeSingle()

        if (tenant?.nome?.trim()) {
          setNomeEmpresa(tenant.nome)
          return
        }

        if (tenant?.slug?.trim()) {
          // Formatar slug: "ea-second-hand" → "EA Second Hand"
          const nomeFormatado = tenant.slug
            .split('-')
            .map(palavra => palavra.charAt(0).toUpperCase() + palavra.slice(1))
            .join(' ')
          setNomeEmpresa(nomeFormatado)
        }
      } catch (err) {
        console.error('Erro ao buscar nome da empresa:', err)
      }
    }

    carregarNomeEmpresa()
  }, [cob?.tenant_id])

  // Auto-confirmação: MP redireciona de volta com params após pagamento
  useEffect(() => {
    if (!id) return
    const params = new URLSearchParams(window.location.search)
    const collectionStatus = params.get('collection_status') || params.get('status')
    const paymentId        = params.get('collection_id') || params.get('payment_id')
    const extRef           = params.get('external_reference')

    if (collectionStatus === 'approved' && paymentId) {
      setVerificando(true)
      chamarConfirmacao(id, paymentId, extRef).then(() => {
        setVerificando(false)
        setVerificado(true)
        carregarCob()
      })
    }
  }, [id])

  const handleVerificar = async () => {
    setVerificando(true)
    await chamarConfirmacao(id)
    setVerificando(false)
    setVerificado(true)
    carregarCob()
  }

  const handleAplicarCupom = async () => {
    setErroCupom('')

    if (!codigoCupom.trim()) {
      setErroCupom('Digite o código do cupom')
      return
    }

    setAplicando(true)
    try {
      // Validar cupom
      const cupom = await validarCupom(cob.tenant_id, codigoCupom)

      // Calcular desconto
      const totalAtual = cupomAplicado ? cupomAplicado.totalOriginal : Number(cob.total)
      const { desconto, totalFinal } = calcularDesconto(totalAtual, cupom.percentual)

      // ✅ Gerar NOVO link do Mercado Pago com valor atualizado
      let novoLink = cob.link_mp
      let novoIdMp = cob.id_mp

      if (Number(totalFinal) > 0 && cob.cliente && cob.data) {
        try {
          const mp = await gerarPreferenciaMp({
            cliente: cob.cliente,
            total: Number(totalFinal),
            whatsapp: cob.whatsapp || '',
            data: cob.data,
            live: cob.live || '',
            idCobranca: id,
            tenantId: cob.tenant_id
          })
          novoLink = mp.link
          novoIdMp = mp.id_mp
        } catch (err) {
          console.error('Erro ao gerar novo link MP:', err)
          setErroCupom('Cupom aplicado, mas erro ao gerar link de pagamento: ' + err.message)
        }
      }

      // Salvar cupom aplicado na cobrança + novo link via API (usa service_role para bypassar RLS)
      console.log('🎟️ Salvando cupom no banco via API:', {
        cobrancaId: id,
        cupom_codigo: cupom.codigo,
        cupom_desconto_percentual: cupom.percentual,
        cupom_desconto_valor: Number(desconto),
        total: Number(totalFinal)
      })

      const apiResponse = await fetch('/api/aplicar-cupom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cobrancaId: id,
          cupom_codigo: cupom.codigo,
          cupom_desconto_percentual: cupom.percentual,
          cupom_desconto_valor: Number(desconto),
          cupom_id: cupom.id,
          total: Number(totalFinal),
          link_mp: novoLink,
          id_mp: novoIdMp
        })
      })

      const apiResult = await apiResponse.json()
      console.log('✅ Resultado API aplicar-cupom:', apiResult)

      if (!apiResponse.ok || !apiResult.ok) {
        console.error('❌ ERRO ao salvar cupom via API:', apiResult)
        throw new Error(apiResult.error || 'Erro ao aplicar cupom')
      }

      // ⚠️ NÃO incrementa aqui! Só incrementa quando PAGAR de verdade
      // O incremento acontece no webhook do Mercado Pago ou ao baixar manualmente

      // Atualizar estado local
      setCupomAplicado({
        codigo: cupom.codigo,
        percentual: cupom.percentual,
        desconto: Number(desconto),
        totalOriginal: totalAtual,
        totalFinal: Number(totalFinal),
        data_inicio: cupom.data_inicio,
        data_fim: cupom.data_fim,
        hora_inicio: cupom.hora_inicio,
        hora_fim: cupom.hora_fim,
      })

      // Atualizar total, link E campos do cupom na cobrança
      setCob(prev => ({
        ...prev,
        total: Number(totalFinal),
        link_mp: novoLink,
        id_mp: novoIdMp,
        cupom_codigo: cupom.codigo,
        cupom_desconto_percentual: cupom.percentual,
        cupom_desconto_valor: Number(desconto),
        cupom_id: cupom.id
      }))

      setCodigoCupom('')
    } catch (err) {
      setErroCupom(err.message || 'Erro ao aplicar cupom')
    } finally {
      setAplicando(false)
    }
  }

  const handleRemoverCupom = async () => {
    try {
      // Remover cupom da cobrança
      const { error } = await supabase
        .from('cobrancas')
        .update({
          cupom_codigo: null,
          cupom_desconto_percentual: null,
          cupom_desconto_valor: null,
        })
        .eq('id', id)

      if (error) throw error

      // Restaurar total original
      setCob(prev => ({ ...prev, total: cupomAplicado.totalOriginal }))
      setCupomAplicado(null)
      setCodigoCupom('')
      setErroCupom('')
    } catch (err) {
      setErroCupom(err.message || 'Erro ao remover cupom')
    }
  }

  const handleDividir = async () => {
    setErroDivisao('')

    const v1 = parseFloat(String(valorP1).replace(',', '.'))
    const total = Number(cob.total)

    // Validações
    if (!valorP1 || isNaN(v1)) {
      setErroDivisao('Informe um valor válido.')
      return
    }
    if (v1 < 10) {
      setErroDivisao('Valor mínimo por parte: R$ 10,00')
      return
    }
    if (v1 >= total - 10) {
      setErroDivisao('A segunda parte deve ser no mínimo R$ 10,00')
      return
    }

    setDividindo(true)
    try {
      const { dados_divisao } = await dividirPagamento(cob, v1, cob.tenant_id)
      setCob(prev => ({ ...prev, dados_divisao }))
      setShowDividir(false)
      setValorP1('')
    } catch (err) {
      setErroDivisao(err.message || 'Erro ao dividir pagamento')
    } finally {
      setDividindo(false)
    }
  }

  if (erro) return (
    <div style={estilos.paginaErro}>
      <div style={estilos.cardErro}>
        <div style={{ fontSize: 48, marginBottom: 10 }}>🔍</div>
        <h2 style={{ color: '#e8eaed', margin: '0 0 8px' }}>Pedido não encontrado</h2>
        <p style={{ color: '#9aa0a6', margin: 0 }}>O link pode ter expirado ou ser inválido.</p>
      </div>
    </div>
  )

  if (!cob) return (
    <div style={estilos.paginaErro}>
      <div style={{ color: '#9aa0a6', fontSize: 16 }}>Carregando pedido…</div>
    </div>
  )

  const itens       = Array.isArray(cob.itens) ? cob.itens : []
  const statusCor   = STATUS_COR[cob.status]   || '#9aa0a6'
  const statusLabel = STATUS_LABEL[cob.status] || cob.status
  const pago        = cob.status === 'PAGO' || cob.status === 'BAIXADO'
  const div         = cob.dados_divisao || null
  const div_p1_pago = div?.status_p1 === 'PAGO'
  const div_p2_pago = div?.status_p2 === 'PAGO'

  return (
    <div style={estilos.pagina}>
      <div style={estilos.card}>

        {/* Cabeçalho */}
        <div style={estilos.header}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#e8eaed' }}>{nomeEmpresa}</div>
          <div style={{ fontSize: 13, color: '#9aa0a6', marginTop: 2 }}>Pedido #{id?.slice(0, 8).toUpperCase()}</div>
        </div>

        {/* Cliente e data */}
        <div style={estilos.section}>
          <div style={{ fontWeight: 700, fontSize: 18, color: '#e8eaed' }}>{cob.cliente}</div>
          <div style={{ color: '#9aa0a6', fontSize: 14, marginTop: 2 }}>
            {fmtData(cob.data)}{cob.live && ` · ${cob.live}`}
          </div>
        </div>

        {/* Status */}
        <div style={{ ...estilos.badge, color: statusCor, borderColor: statusCor }}>
          {statusLabel}
        </div>

        {/* Itens */}
        {itens.length > 0 && (
          <div style={estilos.section}>
            <div style={{ fontSize: 12, color: '#9aa0a6', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Itens do Pedido</div>
            {itens.map((item, i) => (
              <div key={i} style={{ ...estilos.itemRow, textDecoration: item.cancelado ? 'line-through' : 'none', opacity: item.cancelado ? 0.5 : 1 }}>
                <span style={{ flex: 1, color: '#e8eaed' }}>{item.descricao}</span>
                <span style={{ fontWeight: 700, whiteSpace: 'nowrap', color: item.valor < 0 ? '#81c995' : '#e8eaed' }}>
                  {item.valor < 0 ? '-' : ''}R$ {Math.abs(item.valor).toFixed(2).replace('.', ',')}
                </span>
              </div>
            ))}

            {/* Saldo de crédito restante */}
            {saldoCredito.saldoRestante > 0 && (
              <div style={{
                marginTop: 12,
                padding: '10px 12px',
                background: 'rgba(251,188,4,0.1)',
                border: '1px solid rgba(251,188,4,0.3)',
                borderRadius: 8,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <span style={{ fontSize: 13, color: '#fbbc04', fontWeight: 600 }}>
                  🪙 Saldo de crédito disponível
                </span>
                <span style={{ fontSize: 16, fontWeight: 800, color: '#fbbc04' }}>
                  R$ {saldoCredito.saldoRestante.toFixed(2).replace('.', ',')}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Total */}
        <div style={estilos.totalBox}>
          <span style={{ color: '#9aa0a6', fontSize: 14 }}>
            {cupomAplicado ? 'Subtotal' : 'Total'}
          </span>
          <span style={{ fontSize: 28, fontWeight: 800, color: '#81c995' }}>
            {formatMoeda(cupomAplicado ? cupomAplicado.totalOriginal : cob.total)}
          </span>
        </div>

        {/* Cupom aplicado */}
        {cupomAplicado && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#81c995', fontSize: 14, fontWeight: 600 }}>
                  🎟️ {cupomAplicado.codigo} ({cupomAplicado.percentual}%)
                </span>
                {/* Só mostra botão remover se NÃO estiver pago */}
                {!pago && (
                  <button
                    onClick={handleRemoverCupom}
                    style={{
                      padding: '2px 8px',
                      fontSize: 11,
                      background: 'rgba(242,139,130,0.1)',
                      color: '#f28b82',
                      border: '1px solid rgba(242,139,130,0.3)',
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                  >
                    Remover
                  </button>
                )}
              </div>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#81c995' }}>
                - {formatMoeda(cupomAplicado.desconto)}
              </span>
            </div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 0',
              marginBottom: 16,
              borderTop: '2px solid #81c995',
              borderBottom: '1px solid #3c4043',
            }}>
              <span style={{ color: '#e8eaed', fontSize: 16, fontWeight: 700 }}>Total com desconto</span>
              <span style={{ fontSize: 32, fontWeight: 800, color: '#81c995' }}>
                {formatMoeda(cupomAplicado.totalFinal)}
              </span>
            </div>
          </>
        )}

        {/* Pagamento dividido */}
        {div && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: '#9aa0a6', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              💳 Pagamento dividido em 2 partes
            </div>

            {/* Parte 1 */}
            {div_p1_pago || pago ? (
              <div style={{ textAlign: 'center', padding: '12px', background: 'rgba(129,201,149,0.12)', borderRadius: 8, border: '1px solid rgba(129,201,149,0.3)', color: '#81c995', fontWeight: 700, fontSize: 14 }}>
                ✅ Parte 1 — R$ {Number(div.valor_p1).toFixed(2).replace('.', ',')} — Pago
              </div>
            ) : (
              <a href={div.link_p1} target="_blank" rel="noopener noreferrer" style={{ ...estilos.btnPagar, background: '#009ee3', marginBottom: 0 }}>
                💳 Pagar Parte 1 — R$ {Number(div.valor_p1).toFixed(2).replace('.', ',')}
              </a>
            )}

            {/* Parte 2 */}
            {div_p2_pago || pago ? (
              <div style={{ textAlign: 'center', padding: '12px', background: 'rgba(129,201,149,0.12)', borderRadius: 8, border: '1px solid rgba(129,201,149,0.3)', color: '#81c995', fontWeight: 700, fontSize: 14 }}>
                ✅ Parte 2 — R$ {Number(div.valor_p2).toFixed(2).replace('.', ',')} — Pago
              </div>
            ) : (
              <a href={div.link_p2} target="_blank" rel="noopener noreferrer" style={{ ...estilos.btnPagar, background: '#6e3fd9', marginBottom: 0 }}>
                💳 Pagar Parte 2 — R$ {Number(div.valor_p2).toFixed(2).replace('.', ',')}
              </a>
            )}

            {/* Botão verificar pagamento (só se NÃO pago) */}
            {!pago && !verificando && !verificado && (
              <button onClick={handleVerificar} style={estilos.btnVerificar}>
                🔄 Já paguei — Verificar Pagamento
              </button>
            )}
            {!pago && verificando && (
              <div style={{ textAlign: 'center', color: '#9aa0a6', fontSize: 13, padding: '8px 0' }}>
                Verificando pagamento…
              </div>
            )}
          </div>
        )}

        {/* Campo de cupom */}
        {!pago && !div && !cupomAplicado && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: '#9aa0a6', marginBottom: 8, textAlign: 'center' }}>
              🎟️ Tem um cupom de desconto?
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={codigoCupom}
                onChange={e => setCodigoCupom(e.target.value.toUpperCase())}
                placeholder="Digite o código"
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  background: '#202124',
                  border: '1px solid #3c4043',
                  borderRadius: 8,
                  color: '#e8eaed',
                  fontSize: 14,
                  outline: 'none',
                  textTransform: 'uppercase',
                }}
                disabled={aplicando}
              />
              <button
                onClick={handleAplicarCupom}
                disabled={aplicando || !codigoCupom.trim()}
                style={{
                  padding: '10px 20px',
                  background: aplicando ? 'rgba(129,201,149,0.3)' : '#81c995',
                  color: '#000',
                  fontWeight: 700,
                  fontSize: 14,
                  border: 'none',
                  borderRadius: 8,
                  cursor: aplicando || !codigoCupom.trim() ? 'not-allowed' : 'pointer',
                  opacity: aplicando || !codigoCupom.trim() ? 0.5 : 1,
                }}
              >
                {aplicando ? '...' : 'Aplicar'}
              </button>
            </div>
            {erroCupom && (
              <div style={{
                marginTop: 8,
                padding: '10px 12px',
                background: erroCupom === 'CUPONS ESGOTADO' ? 'rgba(251,188,4,0.15)' : 'rgba(242,139,130,0.1)',
                border: erroCupom === 'CUPONS ESGOTADO' ? '2px solid rgba(251,188,4,0.5)' : '1px solid rgba(242,139,130,0.3)',
                borderRadius: 8,
                color: erroCupom === 'CUPONS ESGOTADO' ? '#fbbc04' : '#f28b82',
                fontSize: erroCupom === 'CUPONS ESGOTADO' ? 14 : 12,
                fontWeight: erroCupom === 'CUPONS ESGOTADO' ? 700 : 400,
                textAlign: 'center',
              }}>
                {erroCupom === 'CUPONS ESGOTADO' ? '⚠️ CUPONS ESGOTADO ⚠️' : erroCupom}
              </div>
            )}
          </div>
        )}

        {/* Botão de pagamento simples (não dividido) */}
        {!pago && !div && cob.link_mp && cob.link_mp !== 'Pago com Crédito' && (
          <>
            <a
              href={cob.link_mp}
              target="_blank"
              rel="noopener noreferrer"
              style={estilos.btnPagar}
            >
              💳 Pagar Agora
            </a>

            {/* Botão dividir pagamento - só aparece se total >= 20 */}
            {Number(cob.total) >= 20 && (
              <button
                onClick={() => setShowDividir(true)}
                style={estilos.btnDividir}
              >
                ✂️ Dividir Pagamento
              </button>
            )}
          </>
        )}

        {pago && (
          <div style={{ textAlign: 'center', padding: '14px', background: 'rgba(129,201,149,0.12)', borderRadius: 8, border: '1px solid rgba(129,201,149,0.3)', color: '#81c995', fontWeight: 700, fontSize: 15 }}>
            Pagamento confirmado! ✅
          </div>
        )}

        {!pago && !div && (!cob.link_mp || cob.link_mp === 'Pago com Crédito') && (
          <div style={{ textAlign: 'center', padding: '14px', background: 'rgba(251,188,4,0.1)', borderRadius: 8, border: '1px solid rgba(251,188,4,0.3)', color: '#fbbc04', fontWeight: 600, fontSize: 14 }}>
            Aguardando processamento do link de pagamento
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: '#5f6368' }}>
          Em caso de dúvidas, entre em contato via WhatsApp
        </div>
      </div>

      {/* Modal Dividir Pagamento */}
      {showDividir && (
        <div
          style={estilos.modalOverlay}
          onClick={e => e.target === e.currentTarget && setShowDividir(false)}
        >
          <div style={estilos.modalBox}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#e8eaed', marginBottom: 16 }}>
              ✂️ Dividir Pagamento
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: '#9aa0a6', marginBottom: 4 }}>Total</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#e8eaed' }}>
                R$ {Number(cob.total).toFixed(2).replace('.', ',')}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#9aa0a6', marginBottom: 6 }}>
                Quanto quer pagar agora? (Mínimo R$ 10,00)
              </label>
              <input
                type="text"
                value={valorP1}
                onChange={e => setValorP1(e.target.value)}
                placeholder="Ex: 50,00"
                style={estilos.modalInput}
              />
            </div>

            {valorP1 && !isNaN(parseFloat(valorP1.replace(',', '.'))) && (
              <div style={{ marginBottom: 16, padding: 10, background: 'rgba(129,201,149,0.1)', borderRadius: 6 }}>
                <div style={{ fontSize: 12, color: '#9aa0a6' }}>Restante (Parte 2)</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#81c995' }}>
                  R$ {(Number(cob.total) - parseFloat(valorP1.replace(',', '.'))).toFixed(2).replace('.', ',')}
                </div>
              </div>
            )}

            {erroDivisao && (
              <div style={{ marginBottom: 12, padding: 10, background: 'rgba(242,139,130,0.1)', borderRadius: 6, color: '#f28b82', fontSize: 13 }}>
                {erroDivisao}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { setShowDividir(false); setValorP1(''); setErroDivisao('') }}
                style={estilos.btnCancelar}
                disabled={dividindo}
              >
                Cancelar
              </button>
              <button
                onClick={handleDividir}
                style={estilos.btnConfirmar}
                disabled={dividindo}
              >
                {dividindo ? 'Gerando...' : 'Gerar Links de Pagamento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const estilos = {
  pagina: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #141517 0%, #202124 100%)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '30px 16px 60px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    overflowY: 'auto',
    overflowX: 'hidden',
  },
  paginaErro: {
    minHeight: '100vh',
    background: '#202124',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  card: {
    width: '100%',
    maxWidth: 480,
    background: '#292a2d',
    border: '1px solid #3c4043',
    borderRadius: 16,
    padding: '24px 20px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  },
  cardErro: {
    background: '#292a2d',
    border: '1px solid #3c4043',
    borderRadius: 16,
    padding: '40px 30px',
    textAlign: 'center',
    maxWidth: 340,
  },
  header: {
    borderBottom: '1px solid #3c4043',
    paddingBottom: 14,
    marginBottom: 16,
  },
  section: {
    marginBottom: 14,
    paddingBottom: 14,
    borderBottom: '1px solid #3c4043',
  },
  badge: {
    display: 'inline-block',
    padding: '4px 14px',
    borderRadius: 999,
    border: '1px solid',
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 16,
  },
  itemRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 8,
    fontSize: 13,
    padding: '5px 0',
    borderBottom: '1px solid #3c4043',
  },
  totalBox: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 0',
    marginBottom: 16,
    borderTop: '1px solid #3c4043',
    borderBottom: '1px solid #3c4043',
  },
  btnPagar: {
    display: 'block',
    width: '100%',
    padding: '16px',
    background: '#009ee3',
    color: '#fff',
    fontWeight: 800,
    fontSize: 17,
    textAlign: 'center',
    borderRadius: 10,
    textDecoration: 'none',
    marginBottom: 12,
    transition: 'filter 0.2s',
  },
  btnVerificar: {
    display: 'block',
    width: '100%',
    padding: '12px',
    background: 'rgba(255,255,255,0.06)',
    color: '#9aa0a6',
    fontWeight: 600,
    fontSize: 14,
    textAlign: 'center',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.1)',
    cursor: 'pointer',
    marginTop: 4,
  },
  btnDividir: {
    display: 'block',
    width: '100%',
    padding: '12px',
    background: 'rgba(110,63,217,0.12)',
    color: '#a78bfa',
    fontWeight: 700,
    fontSize: 14,
    textAlign: 'center',
    borderRadius: 8,
    border: '1px solid rgba(110,63,217,0.3)',
    cursor: 'pointer',
    marginTop: 8,
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    zIndex: 9999,
  },
  modalBox: {
    background: '#292a2d',
    border: '1px solid #3c4043',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
  },
  modalInput: {
    width: '100%',
    padding: '12px 14px',
    background: '#202124',
    border: '1px solid #3c4043',
    borderRadius: 8,
    color: '#e8eaed',
    fontSize: 16,
    outline: 'none',
    boxSizing: 'border-box',
  },
  btnCancelar: {
    flex: 1,
    padding: '12px',
    background: 'rgba(255,255,255,0.06)',
    color: '#9aa0a6',
    fontWeight: 600,
    fontSize: 14,
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.1)',
    cursor: 'pointer',
  },
  btnConfirmar: {
    flex: 2,
    padding: '12px',
    background: '#009ee3',
    color: '#fff',
    fontWeight: 700,
    fontSize: 14,
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
  },
}
