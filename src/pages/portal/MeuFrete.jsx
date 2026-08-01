import { useState, useEffect, useCallback } from 'react'
import { usePortalAuth } from '../../context/PortalAuthContext'
import { usePortalToast } from '../../components/portal/PortalToast'
import { supabase } from '../../lib/supabase'
import { calcularFrete, salvarCotacoes, buscarCotacoes } from '../../services/melhorEnvioService'
import { criarPagamentoPIX, buscarPagamentoRomaneio } from '../../services/mercadoPagoService'

export default function MeuFrete() {
  const { cliente, tenantId } = usePortalAuth()
  const { showToast } = usePortalToast()

  const [romaneios, setRomaneios] = useState([])
  const [loading, setLoading] = useState(true)
  const [cotando, setCotando] = useState(false)
  const [romaneioSelecionado, setRomaneioSelecionado] = useState(null)
  const [cotacoes, setCotacoes] = useState([])
  const [enderecos, setEnderecos] = useState([])
  const [enderecoSelecionado, setEnderecoSelecionado] = useState(null)
  const [pagamentoPIX, setPagamentoPIX] = useState(null)
  const [showPIX, setShowPIX] = useState(false)

  const carregar = useCallback(async () => {
    if (!tenantId || !cliente?.instagram) return
    setLoading(true)
    try {
      const { data: romsData, error: romsError } = await supabase
        .from('romaneios')
        .select('*, romaneio_sacolinhas(*)')
        .eq('tenant_id', tenantId)
        .eq('cliente_instagram', cliente.instagram.replace('@', ''))
        .in('status', ['pronto', 'frete_cotado', 'frete_pago'])
        .order('created_at', { ascending: false })

      if (romsError) throw romsError

      const { data: endsData, error: endsError } = await supabase
        .from('enderecos_clientes')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('cliente_instagram', cliente.instagram.replace('@', ''))
        .order('padrao', { ascending: false })

      if (endsError) throw endsError

      setRomaneios(romsData || [])
      setEnderecos(endsData || [])

      if (endsData?.length > 0) {
        const padrao = endsData.find(e => e.padrao) || endsData[0]
        setEnderecoSelecionado(padrao.id)
      }
    } catch (err) {
      showToast('Erro ao carregar romaneios', 'error')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [tenantId, cliente, showToast])

  useEffect(() => { carregar() }, [carregar])

  const handleCotarFrete = async (romaneio) => {
    if (!enderecoSelecionado) {
      return showToast('Selecione um endereço de entrega', 'error')
    }

    const endereco = enderecos.find(e => e.id === enderecoSelecionado)
    if (!endereco) return

    setCotando(true)
    setRomaneioSelecionado(romaneio.id)

    try {
      const cotacoesExistentes = await buscarCotacoes(romaneio.id)

      if (cotacoesExistentes.length > 0) {
        setCotacoes(cotacoesExistentes)
        showToast('Cotações carregadas', 'success')
      } else {
        const enderecoOrigem = {
          postal_code: '13560340',
          address: 'Rua Antonio Bueno de Camargo',
          number: '295',
          district: 'Centro',
          city: 'São Carlos',
          state_abbr: 'SP',
        }

        const enderecoDestino = {
          postal_code: endereco.cep.replace(/\D/g, ''),
          address: endereco.rua,
          number: endereco.numero,
          district: endereco.bairro,
          city: endereco.cidade,
          state_abbr: endereco.estado,
        }

        const pacote = {
          height: romaneio.altura || 10,
          width: romaneio.largura || 20,
          length: romaneio.comprimento || 30,
          weight: romaneio.peso || 1,
        }

        const cotacoesAPI = await calcularFrete(tenantId, {
          from: enderecoOrigem,
          to: enderecoDestino,
          package: pacote,
        })

        await salvarCotacoes(romaneio.id, cotacoesAPI)

        const cotacoesSalvas = await buscarCotacoes(romaneio.id)
        setCotacoes(cotacoesSalvas)
        showToast('Frete cotado com sucesso!', 'success')
      }
    } catch (err) {
      showToast(err.message || 'Erro ao cotar frete', 'error')
      console.error(err)
    } finally {
      setCotando(false)
    }
  }

  const handleEscolherFrete = async (cotacao) => {
    if (!window.confirm(`Confirmar frete de R$ ${cotacao.valor.toFixed(2)} via ${cotacao.transportadora}?`)) {
      return
    }

    try {
      const romaneio = romaneios.find(r => r.id === romaneioSelecionado)

      await supabase
        .from('romaneios')
        .update({
          transportadora: cotacao.transportadora,
          servico: cotacao.servico,
          valor_frete: cotacao.valor,
          prazo_entrega: cotacao.prazo,
          status: 'frete_cotado',
          endereco_id: enderecoSelecionado,
        })
        .eq('id', romaneioSelecionado)

      const pix = await criarPagamentoPIX(tenantId, romaneioSelecionado, cotacao.valor, {
        numeroRomaneio: romaneio?.numero,
        email: cliente?.email || 'cliente@email.com',
        nome: cliente?.nome || 'Cliente',
      })

      setPagamentoPIX(pix)
      setShowPIX(true)
      setRomaneioSelecionado(null)
      setCotacoes([])
      showToast('PIX gerado! Escaneie o QR Code para pagar.', 'success')
    } catch (err) {
      showToast(err.message || 'Erro ao gerar PIX', 'error')
      console.error(err)
    }
  }

  const handleVerPIX = async (romaneio) => {
    try {
      const pagamento = await buscarPagamentoRomaneio(romaneio.id)
      if (!pagamento || !pagamento.pix_qr_code) {
        showToast('PIX não encontrado ou expirado', 'error')
        return
      }

      setPagamentoPIX({
        qr_code: pagamento.pix_qr_code,
        qr_code_base64: pagamento.pix_qr_code_base64,
        expiracao: new Date(pagamento.pix_expiracao),
      })
      setShowPIX(true)
    } catch (err) {
      showToast('Erro ao carregar PIX', 'error')
      console.error(err)
    }
  }

  const copiarPIX = () => {
    if (pagamentoPIX?.qr_code) {
      navigator.clipboard.writeText(pagamentoPIX.qr_code)
      showToast('Código PIX copiado!', 'success')
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#9aa0a6' }}>
        Carregando romaneios...
      </div>
    )
  }

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: '0 auto' }}>
      <h2 style={{ margin: '0 0 20px 0', color: '#e8eaed', fontSize: 20 }}>
        🚚 Meus Envios
      </h2>

      {enderecos.length === 0 && (
        <div style={{
          background: 'rgba(255,193,7,0.1)',
          border: '1px solid rgba(255,193,7,0.3)',
          borderRadius: 12,
          padding: 16,
          marginBottom: 20,
        }}>
          <p style={{ color: 'var(--p-yellow)', margin: 0, fontSize: 14 }}>
            ⚠️ Você precisa cadastrar um endereço antes de cotar o frete.
          </p>
        </div>
      )}

      {romaneios.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: 40,
          background: 'rgba(255,255,255,0.03)',
          borderRadius: 12,
          border: '1px dashed rgba(255,255,255,0.1)',
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
          <p style={{ color: '#9aa0a6', margin: 0 }}>
            Nenhum envio pendente no momento.
          </p>
        </div>
      ) : (
        <>
          {enderecos.length > 1 && (
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', color: '#9aa0a6', fontSize: 13, marginBottom: 8 }}>
                📍 Endereço de entrega:
              </label>
              <select
                value={enderecoSelecionado || ''}
                onChange={e => setEnderecoSelecionado(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  padding: '10px',
                  color: '#e8eaed',
                  fontSize: 14,
                }}
              >
                {enderecos.map(end => (
                  <option key={end.id} value={end.id}>
                    {end.apelido ? `${end.apelido} - ` : ''}{end.rua}, {end.numero} - {end.cidade}/{end.estado}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {romaneios.map(rom => (
              <div
                key={rom.id}
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 12,
                  padding: 16,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 }}>
                  <div>
                    <div style={{ color: 'var(--p-blue)', fontWeight: 700, fontSize: 16 }}>
                      Romaneio {rom.numero}
                    </div>
                    <div style={{ color: '#9aa0a6', fontSize: 13, marginTop: 4 }}>
                      {rom.romaneio_sacolinhas?.length || 0} sacolinha(s)
                    </div>
                  </div>
                  <div style={{
                    background: rom.status === 'frete_pago' ? 'rgba(76,175,80,0.2)' :
                               rom.status === 'frete_cotado' ? 'rgba(255,193,7,0.2)' :
                               'rgba(255,255,255,0.1)',
                    color: rom.status === 'frete_pago' ? 'var(--p-green)' :
                           rom.status === 'frete_cotado' ? 'var(--p-yellow)' : '#9aa0a6',
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: 6,
                  }}>
                    {rom.status === 'frete_pago' ? '✓ PAGO' :
                     rom.status === 'frete_cotado' ? 'AGUARDANDO PAGAMENTO' : 'PRONTO'}
                  </div>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                  gap: 12,
                  marginBottom: 12,
                  paddingBottom: 12,
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                }}>
                  <div>
                    <div style={{ color: '#9aa0a6', fontSize: 11, marginBottom: 2 }}>Peso</div>
                    <div style={{ color: '#e8eaed', fontSize: 14, fontWeight: 600 }}>
                      {rom.peso ? `${rom.peso} kg` : '-'}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#9aa0a6', fontSize: 11, marginBottom: 2 }}>Dimensões</div>
                    <div style={{ color: '#e8eaed', fontSize: 14, fontWeight: 600 }}>
                      {rom.altura && rom.largura && rom.comprimento
                        ? `${rom.altura}x${rom.largura}x${rom.comprimento} cm`
                        : '-'}
                    </div>
                  </div>
                </div>

                {rom.status === 'pronto' && (
                  <button
                    onClick={() => handleCotarFrete(rom)}
                    disabled={cotando || enderecos.length === 0}
                    style={{
                      width: '100%',
                      background: enderecos.length === 0 ? 'rgba(255,255,255,0.05)' : 'var(--p-blue)',
                      color: enderecos.length === 0 ? '#9aa0a6' : '#0f0f0f',
                      border: 'none',
                      borderRadius: 8,
                      padding: '12px',
                      fontWeight: 700,
                      cursor: enderecos.length === 0 ? 'not-allowed' : 'pointer',
                      opacity: cotando ? 0.6 : 1,
                    }}
                  >
                    {cotando && romaneioSelecionado === rom.id ? 'Cotando...' : '🚚 Cotar Frete'}
                  </button>
                )}

                {rom.status === 'frete_cotado' && rom.transportadora && (
                  <div style={{
                    background: 'rgba(255,193,7,0.1)',
                    border: '1px solid rgba(255,193,7,0.3)',
                    borderRadius: 8,
                    padding: 12,
                  }}>
                    <div style={{ color: '#e8eaed', fontWeight: 600, marginBottom: 4 }}>
                      {rom.transportadora} - {rom.servico}
                    </div>
                    <div style={{ color: '#9aa0a6', fontSize: 13 }}>
                      Valor: R$ {(rom.valor_frete || 0).toFixed(2)} • Prazo: {rom.prazo_entrega || 0} dia(s) útil(is)
                    </div>
                    <button
                      onClick={() => handleVerPIX(rom)}
                      style={{
                        width: '100%',
                        background: 'var(--p-yellow)',
                        color: '#0f0f0f',
                        border: 'none',
                        borderRadius: 6,
                        padding: '10px',
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: 'pointer',
                        marginTop: 10,
                      }}
                    >
                      💳 Ver PIX
                    </button>
                  </div>
                )}

                {rom.status === 'frete_pago' && (
                  <div style={{
                    background: 'rgba(76,175,80,0.1)',
                    border: '1px solid rgba(76,175,80,0.3)',
                    borderRadius: 8,
                    padding: 12,
                  }}>
                    <div style={{ color: 'var(--p-green)', fontWeight: 700 }}>
                      ✓ Frete Pago
                    </div>
                    <div style={{ color: '#9aa0a6', fontSize: 13, marginTop: 4 }}>
                      Seu pedido está sendo preparado para envio!
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {romaneioSelecionado && cotacoes.length > 0 && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => { setRomaneioSelecionado(null); setCotacoes([]) }}
        >
          <div
            style={{
              background: '#1a2230',
              border: '2px solid var(--p-blue)',
              borderRadius: 16,
              padding: 24,
              maxWidth: 600,
              width: '100%',
              maxHeight: '80vh',
              overflowY: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px 0', color: 'var(--p-blue)' }}>
              🚚 Escolha o Frete
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {cotacoes.map((cot, idx) => (
                <button
                  key={idx}
                  onClick={() => handleEscolherFrete(cot)}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 10,
                    padding: 16,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div>
                      <div style={{ color: '#e8eaed', fontWeight: 700, fontSize: 15 }}>
                        {cot.transportadora}
                      </div>
                      <div style={{ color: '#9aa0a6', fontSize: 13, marginTop: 2 }}>
                        {cot.servico}
                      </div>
                      <div style={{ color: '#9aa0a6', fontSize: 12, marginTop: 6 }}>
                        ⏱️ {cot.prazo} dia(s) útil(is)
                      </div>
                    </div>
                    <div style={{ color: 'var(--p-blue)', fontWeight: 700, fontSize: 18 }}>
                      R$ {cot.valor.toFixed(2)}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={() => { setRomaneioSelecionado(null); setCotacoes([]) }}
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.05)',
                color: '#9aa0a6',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                padding: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                marginTop: 16,
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {showPIX && pagamentoPIX && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.9)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setShowPIX(false)}
        >
          <div
            style={{
              background: '#1a2230',
              border: '2px solid var(--p-blue)',
              borderRadius: 16,
              padding: 24,
              maxWidth: 400,
              width: '100%',
              textAlign: 'center',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px 0', color: 'var(--p-blue)' }}>
              💳 Pagar com PIX
            </h3>

            <div style={{
              background: '#fff',
              padding: 16,
              borderRadius: 12,
              marginBottom: 16,
            }}>
              {pagamentoPIX.qr_code_base64 ? (
                <img
                  src={`data:image/png;base64,${pagamentoPIX.qr_code_base64}`}
                  alt="QR Code PIX"
                  style={{ width: '100%', maxWidth: 250, margin: '0 auto', display: 'block' }}
                />
              ) : (
                <div style={{ color: '#333', padding: 20 }}>
                  QR Code não disponível
                </div>
              )}
            </div>

            <p style={{ color: '#9aa0a6', fontSize: 13, marginBottom: 16 }}>
              Escaneie o QR Code com o app do seu banco ou copie o código abaixo:
            </p>

            <button
              onClick={copiarPIX}
              style={{
                width: '100%',
                background: 'var(--p-blue)',
                color: '#0f0f0f',
                border: 'none',
                borderRadius: 8,
                padding: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                marginBottom: 12,
              }}
            >
              📋 Copiar Código PIX
            </button>

            {pagamentoPIX.expiracao && (
              <p style={{ color: 'var(--p-yellow)', fontSize: 12, marginBottom: 16 }}>
                ⏰ Válido até {new Date(pagamentoPIX.expiracao).toLocaleString('pt-BR')}
              </p>
            )}

            <p style={{ color: '#9aa0a6', fontSize: 12, marginBottom: 16 }}>
              Após o pagamento, o status será atualizado automaticamente em alguns minutos.
            </p>

            <button
              onClick={() => setShowPIX(false)}
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.05)',
                color: '#9aa0a6',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                padding: '10px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
