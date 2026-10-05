import { useState, useEffect, useCallback } from 'react'
import AppShell from '../../components/ui/AppShell'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { gerarEtiqueta, imprimirEtiqueta } from '../../services/melhorEnvioService'

export default function EtiquetasPage() {
  const { profile } = useAuth()
  const tenantId = profile?.tenant_id

  const [romaneios, setRomaneios] = useState([])
  const [romaneiosFiltrados, setRomaneiosFiltrados] = useState([])
  const [loading, setLoading] = useState(true)
  const [gerando, setGerando] = useState(null)
  const [modalAberto, setModalAberto] = useState(null)

  // Filtros
  const [busca, setBusca] = useState('')
  const [statusFiltro, setStatusFiltro] = useState('etiqueta_gerada')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')

  const carregar = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('romaneios')
        .select('*, enderecos_clientes(*)')
        .eq('tenant_id', tenantId)
        .in('status', ['frete_pago', 'etiqueta_gerada', 'despachado', 'cancelado'])
        .order('frete_pago_em', { ascending: false })

      if (error) throw error
      setRomaneios(data || [])
    } catch (err) {
      console.error('Erro ao carregar romaneios:', err)
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useEffect(() => { carregar() }, [carregar])

  // Aplicar filtros
  useEffect(() => {
    let filtrados = [...romaneios]

    // Filtro de status
    if (statusFiltro && statusFiltro !== 'todos') {
      if (statusFiltro === 'aguardando_pagamento') {
        // Aguardando Pagamento = romaneios que ainda não foram pagos
        filtrados = filtrados.filter(rom =>
          ['pronto', 'frete_cotado'].includes(rom.status)
        )
      } else {
        filtrados = filtrados.filter(rom => rom.status === statusFiltro)
      }
    }

    // Filtro de busca (cliente ou romaneio)
    if (busca) {
      const termo = busca.toLowerCase()
      filtrados = filtrados.filter(rom =>
        rom.numero?.toLowerCase().includes(termo) ||
        rom.cliente_instagram?.toLowerCase().includes(termo)
      )
    }

    // Filtro de data - EXCETO quando status = 'etiqueta_gerada' ou 'aguardando_pagamento'
    // Etiquetas geradas SEMPRE aparecem todas (para não esquecer de despachar)
    // Aguardando pagamento SEMPRE aparecem todos (para não esquecer de cobrar/dar baixa)
    if (!['etiqueta_gerada', 'aguardando_pagamento'].includes(statusFiltro)) {
      // Filtro de data início
      if (dataInicio) {
        filtrados = filtrados.filter(rom => {
          const dataRom = new Date(rom.frete_pago_em || rom.created_at)
          return dataRom >= new Date(dataInicio)
        })
      }

      // Filtro de data fim
      if (dataFim) {
        filtrados = filtrados.filter(rom => {
          const dataRom = new Date(rom.frete_pago_em || rom.created_at)
          return dataRom <= new Date(dataFim + 'T23:59:59')
        })
      }
    }

    setRomaneiosFiltrados(filtrados)
  }, [romaneios, busca, statusFiltro, dataInicio, dataFim])

  const handleGerarEtiqueta = async (romaneio) => {
    setGerando(romaneio.id)
    try {
      let orderId = romaneio.melhor_envio_order_id

      // Se não tem pedido, cria primeiro
      if (!orderId) {
        if (!romaneio.melhor_envio_cotacao_id) {
          alert('Este romaneio não possui cotação salva')
          return
        }

        if (!window.confirm('Este romaneio ainda não tem pedido no Melhor Envio. Deseja criar agora e comprar a etiqueta?')) {
          return
        }

        alert('Criando pedido no Melhor Envio... Aguarde.')

        // Chama Edge Function para criar pedido
        const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

        // Pega o token de sessão do usuário autenticado
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token

        if (!token) {
          throw new Error('Usuário não autenticado')
        }

        console.log('🔍 DEBUG - SUPABASE_URL:', SUPABASE_URL)
        console.log('🔍 DEBUG - URL completa:', `${SUPABASE_URL}/functions/v1/criar-pedido-melhor-envio`)

        const response = await fetch(`${SUPABASE_URL}/functions/v1/criar-pedido-melhor-envio`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            romaneio_id: romaneio.id,
          }),
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Erro ao criar pedido')
        }

        const result = await response.json()

        alert(`Pedido criado com sucesso! Order ID: ${result.order_id}${result.tracking ? '\nRastreio: ' + result.tracking : ''}`)

        // Recarrega para pegar os dados atualizados
        carregar()
        return
      }

      // Compra a etiqueta
      const result = await gerarEtiqueta(tenantId, [orderId])

      await supabase
        .from('romaneios')
        .update({
          status: 'etiqueta_gerada',
          etiqueta_gerada_em: new Date().toISOString(),
        })
        .eq('id', romaneio.id)

      alert('Etiqueta gerada com sucesso!')
      carregar()
    } catch (err) {
      alert(`Erro ao gerar etiqueta: ${err.message}`)
    } finally {
      setGerando(null)
    }
  }

  const handleImprimirEtiqueta = async (romaneio) => {
    if (!romaneio.melhor_envio_order_id) {
      alert('Este romaneio não possui pedido no Melhor Envio')
      return
    }

    try {
      const pdfUrl = await imprimirEtiqueta(tenantId, [romaneio.melhor_envio_order_id])

      await supabase
        .from('romaneios')
        .update({
          url_etiqueta: pdfUrl,
        })
        .eq('id', romaneio.id)

      window.open(pdfUrl, '_blank')
    } catch (err) {
      alert(`Erro ao imprimir etiqueta: ${err.message}`)
    }
  }

  const handleMarcarDespachado = async (romaneio) => {
    if (!window.confirm(`Marcar romaneio ${romaneio.numero} como despachado?`)) return

    try {
      await supabase
        .from('romaneios')
        .update({
          status: 'despachado',
          despachado_em: new Date().toISOString(),
        })
        .eq('id', romaneio.id)

      alert('Romaneio marcado como despachado!')
      carregar()
    } catch (err) {
      alert(`Erro: ${err.message}`)
    }
  }

  const handleMarcarComoPago = async (romaneio) => {
    const motivo = prompt(
      `Marcar frete do romaneio ${romaneio.numero} como PAGO?\n\n` +
      'Informe o motivo (opcional):\n' +
      '- Crédito do cliente\n' +
      '- Cortesia\n' +
      '- Pagamento externo\n' +
      '- Outro motivo'
    )

    if (motivo === null) return // Cancelou

    try {
      await supabase
        .from('romaneios')
        .update({
          status: 'frete_pago',
          frete_pago_em: new Date().toISOString(),
        })
        .eq('id', romaneio.id)

      // Opcional: registrar em pagamentos_frete como "manual"
      await supabase
        .from('pagamentos_frete')
        .insert({
          romaneio_id: romaneio.id,
          valor: romaneio.valor_frete || 0,
          metodo: 'manual',
          status: 'aprovado',
          pago_em: new Date().toISOString(),
          observacao: motivo || 'Marcado manualmente como pago',
          tenant_id: tenantId,
        })

      alert('Frete marcado como pago com sucesso!')
      carregar()
    } catch (err) {
      alert(`Erro: ${err.message}`)
    }
  }

  if (loading) {
    return (
      <AppShell page="Etiquetas">
        <div style={{ padding: 24, textAlign: 'center', color: '#9aa0a6' }}>
          Carregando...
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell page="Etiquetas">
      <div style={{ padding: 24 }}>
        <h1 style={{ margin: '0 0 20px 0', color: '#e8eaed', fontSize: 24, fontWeight: 700 }}>
          📦 Gestão de Etiquetas
        </h1>

        {/* Barra de Filtros */}
        <div style={{
          display: 'flex',
          gap: 12,
          marginBottom: 24,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}>
          <input
            type="text"
            placeholder="🔍 Buscar cliente ou romaneio..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={{
              flex: '1 1 250px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              padding: '10px 14px',
              color: '#e8eaed',
              fontSize: 14,
            }}
          />

          <select
            value={statusFiltro}
            onChange={(e) => setStatusFiltro(e.target.value)}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              padding: '10px 14px',
              color: '#e8eaed',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            <option value="etiqueta_gerada">🏷️ Etiqueta Gerada</option>
            <option value="aguardando_pagamento">⏳ Aguardando Pagamento</option>
            <option value="despachado">✓ Despachado</option>
            <option value="frete_pago">💳 Frete Pago</option>
            <option value="cancelado">✗ Cancelado</option>
            <option value="todos">📦 Todos</option>
          </select>

          <input
            type="date"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
            placeholder="Data Início"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              padding: '10px 14px',
              color: '#e8eaed',
              fontSize: 14,
              colorScheme: 'dark',
            }}
          />

          <input
            type="date"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
            placeholder="Data Fim"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              padding: '10px 14px',
              color: '#e8eaed',
              fontSize: 14,
              colorScheme: 'dark',
            }}
          />

          {(busca || statusFiltro !== 'etiqueta_gerada' || dataInicio || dataFim) && (
            <button
              onClick={() => {
                setBusca('')
                setStatusFiltro('etiqueta_gerada')
                setDataInicio('')
                setDataFim('')
              }}
              style={{
                background: 'rgba(244,67,54,0.1)',
                color: '#f44336',
                border: '1px solid rgba(244,67,54,0.3)',
                borderRadius: 8,
                padding: '10px 16px',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              🧹 Limpar
            </button>
          )}

          <button
            onClick={carregar}
            style={{
              background: 'rgba(255,255,255,0.1)',
              color: '#e8eaed',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 8,
              padding: '10px 16px',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            🔄 Atualizar
          </button>
        </div>

        {romaneiosFiltrados.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: 60,
            background: 'rgba(255,255,255,0.03)',
            borderRadius: 16,
            border: '1px dashed rgba(255,255,255,0.1)',
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
            <p style={{ color: '#9aa0a6', margin: 0, fontSize: 16 }}>
              Nenhum romaneio com frete pago no momento
            </p>
          </div>
        ) : (
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12,
            overflow: 'hidden',
          }}>
            {/* Header da Tabela */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '130px 1fr 140px 140px 160px 280px',
              gap: 16,
              padding: '14px 20px',
              background: 'rgba(255,255,255,0.05)',
              borderBottom: '1px solid rgba(255,255,255,0.1)',
              fontSize: 11,
              fontWeight: 700,
              color: '#9aa0a6',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>
              <div>Romaneio</div>
              <div>Cliente</div>
              <div>Data Pago</div>
              <div>Data Despacho</div>
              <div>Status</div>
              <div>Ações</div>
            </div>

            {/* Linhas da Tabela */}
            {romaneiosFiltrados.map(rom => {
              const formatarData = (data) => {
                if (!data) return '-'
                const d = new Date(data)
                return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
              }

              return (
                <div
                  key={rom.id}
                  onClick={() => setModalAberto(rom)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '130px 1fr 140px 140px 160px 280px',
                    gap: 16,
                    padding: '16px 20px',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <div>
                    <div style={{ color: 'var(--p-blue)', fontWeight: 700, fontSize: 15 }}>
                      {rom.numero}
                    </div>
                    {rom.codigo_rastreio && (
                      <div style={{ color: '#2196f3', fontSize: 10, marginTop: 2 }}>
                        {rom.codigo_rastreio}
                      </div>
                    )}
                  </div>

                  <div style={{ color: '#e8eaed', fontSize: 14 }}>
                    @{rom.cliente_instagram}
                  </div>

                  <div style={{ color: '#9aa0a6', fontSize: 13 }}>
                    {formatarData(rom.frete_pago_em)}
                  </div>

                  <div style={{ color: '#9aa0a6', fontSize: 13 }}>
                    {formatarData(rom.despachado_em)}
                  </div>

                  <div>
                  <div style={{
                    display: 'inline-block',
                    background: rom.status === 'despachado' ? 'rgba(76,175,80,0.2)' :
                               rom.status === 'etiqueta_gerada' ? 'rgba(33,150,243,0.2)' :
                               rom.status === 'cancelado' ? 'rgba(244,67,54,0.2)' :
                               'rgba(255,193,7,0.2)',
                    color: rom.status === 'despachado' ? '#4caf50' :
                           rom.status === 'etiqueta_gerada' ? '#2196f3' :
                           rom.status === 'cancelado' ? '#f44336' : '#ffc107',
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '5px 10px',
                    borderRadius: 6,
                    textTransform: 'uppercase',
                  }}>
                    {rom.status === 'despachado' ? '✓ Despachado' :
                     rom.status === 'etiqueta_gerada' ? '🏷️ Etiqueta Gerada' :
                     rom.status === 'cancelado' ? '✗ Cancelado' : '💳 Frete Pago'}
                  </div>
                </div>

                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{ display: 'flex', gap: 6 }}
                >
                  {rom.status === 'frete_pago' && (
                    <button
                      onClick={() => handleGerarEtiqueta(rom)}
                      disabled={gerando === rom.id}
                      title="Gerar Etiqueta"
                      style={{
                        background: 'var(--p-blue)',
                        color: '#0f0f0f',
                        border: 'none',
                        borderRadius: 6,
                        padding: '7px 12px',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: gerando === rom.id ? 'wait' : 'pointer',
                        opacity: gerando === rom.id ? 0.6 : 1,
                      }}
                    >
                      {gerando === rom.id ? '...' : '🏷️ Gerar'}
                    </button>
                  )}

                  {(rom.status === 'etiqueta_gerada' || rom.status === 'despachado') && (
                    <>
                      <button
                        onClick={() => handleImprimirEtiqueta(rom)}
                        title="Imprimir Etiqueta"
                        style={{
                          background: 'rgba(33,150,243,0.2)',
                          color: '#2196f3',
                          border: '1px solid rgba(33,150,243,0.5)',
                          borderRadius: 6,
                          padding: '7px 12px',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        🖨️
                      </button>

                      {rom.status === 'etiqueta_gerada' && (
                        <button
                          onClick={() => handleMarcarDespachado(rom)}
                          title="Marcar como Despachado"
                          style={{
                            background: 'rgba(76,175,80,0.2)',
                            color: '#4caf50',
                            border: '1px solid rgba(76,175,80,0.5)',
                            borderRadius: 6,
                            padding: '7px 12px',
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          ✓
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              )
            })}
          </div>
        )}

        {/* Modal de Detalhes */}
        {modalAberto && (
          <div
            onClick={() => setModalAberto(null)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              padding: 20,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: '#1e1e1e',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 16,
                maxWidth: 600,
                width: '100%',
                maxHeight: '90vh',
                overflow: 'auto',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              }}
            >
              {/* Header Modal */}
              <div style={{
                padding: 20,
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <div>
                  <div style={{ color: 'var(--p-blue)', fontWeight: 700, fontSize: 20 }}>
                    {modalAberto.numero}
                  </div>
                  <div style={{ color: '#9aa0a6', fontSize: 14, marginTop: 4 }}>
                    @{modalAberto.cliente_instagram}
                  </div>
                </div>
                <button
                  onClick={() => setModalAberto(null)}
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    color: '#e8eaed',
                    border: 'none',
                    borderRadius: 8,
                    width: 32,
                    height: 32,
                    cursor: 'pointer',
                    fontSize: 18,
                  }}
                >
                  ×
                </button>
              </div>

              {/* Conteúdo Modal */}
              <div style={{ padding: 20 }}>
                {/* Status */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ color: '#9aa0a6', fontSize: 11, marginBottom: 8, textTransform: 'uppercase', fontWeight: 700 }}>
                    Status
                  </div>
                  <div style={{
                    display: 'inline-block',
                    background: modalAberto.status === 'despachado' ? 'rgba(76,175,80,0.2)' :
                               modalAberto.status === 'etiqueta_gerada' ? 'rgba(33,150,243,0.2)' :
                               modalAberto.status === 'cancelado' ? 'rgba(244,67,54,0.2)' :
                               'rgba(255,193,7,0.2)',
                    color: modalAberto.status === 'despachado' ? '#4caf50' :
                           modalAberto.status === 'etiqueta_gerada' ? '#2196f3' :
                           modalAberto.status === 'cancelado' ? '#f44336' : '#ffc107',
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '8px 14px',
                    borderRadius: 8,
                    textTransform: 'uppercase',
                  }}>
                    {modalAberto.status === 'despachado' ? '✓ Despachado' :
                     modalAberto.status === 'etiqueta_gerada' ? '🏷️ Etiqueta Gerada' :
                     modalAberto.status === 'cancelado' ? '✗ Cancelado' : '💳 Frete Pago'}
                  </div>
                </div>

                {/* Informações de Frete */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 16,
                  marginBottom: 20,
                  padding: 16,
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 8,
                }}>
                  <div>
                    <div style={{ color: '#9aa0a6', fontSize: 11, marginBottom: 4 }}>Transportadora</div>
                    <div style={{ color: '#e8eaed', fontWeight: 600, fontSize: 14 }}>
                      {modalAberto.transportadora || '-'}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#9aa0a6', fontSize: 11, marginBottom: 4 }}>Serviço</div>
                    <div style={{ color: '#e8eaed', fontWeight: 600, fontSize: 14 }}>
                      {modalAberto.servico || '-'}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#9aa0a6', fontSize: 11, marginBottom: 4 }}>Valor Frete</div>
                    <div style={{ color: '#e8eaed', fontWeight: 600, fontSize: 14 }}>
                      {modalAberto.valor_frete ? `R$ ${Number(modalAberto.valor_frete).toFixed(2)}` : '-'}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#9aa0a6', fontSize: 11, marginBottom: 4 }}>Prazo</div>
                    <div style={{ color: '#e8eaed', fontWeight: 600, fontSize: 14 }}>
                      {modalAberto.prazo_entrega ? `${modalAberto.prazo_entrega} dia(s)` : '-'}
                    </div>
                  </div>
                </div>

                {/* Endereço */}
                {modalAberto.enderecos_clientes && (
                  <div style={{
                    padding: 16,
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: 8,
                    marginBottom: 20,
                  }}>
                    <div style={{ color: '#9aa0a6', fontSize: 11, marginBottom: 8, textTransform: 'uppercase', fontWeight: 700 }}>
                      📍 Endereço de Entrega
                    </div>
                    <div style={{ color: '#e8eaed', fontSize: 14, lineHeight: 1.6 }}>
                      <strong>{modalAberto.enderecos_clientes.destinatario}</strong><br />
                      {modalAberto.enderecos_clientes.rua}, {modalAberto.enderecos_clientes.numero}
                      {modalAberto.enderecos_clientes.complemento && ` - ${modalAberto.enderecos_clientes.complemento}`}<br />
                      {modalAberto.enderecos_clientes.bairro} - {modalAberto.enderecos_clientes.cidade}/{modalAberto.enderecos_clientes.estado}<br />
                      CEP: {modalAberto.enderecos_clientes.cep}
                    </div>
                  </div>
                )}

                {/* Código de Rastreio */}
                {modalAberto.codigo_rastreio && (
                  <div style={{
                    padding: 16,
                    background: 'rgba(33,150,243,0.1)',
                    border: '1px solid rgba(33,150,243,0.3)',
                    borderRadius: 8,
                    marginBottom: 20,
                  }}>
                    <div style={{ color: '#9aa0a6', fontSize: 11, marginBottom: 8, textTransform: 'uppercase', fontWeight: 700 }}>
                      🔍 Código de Rastreio
                    </div>
                    <div style={{ color: '#2196f3', fontSize: 16, fontWeight: 700, fontFamily: 'monospace' }}>
                      {modalAberto.codigo_rastreio}
                    </div>
                  </div>
                )}

                {/* Aviso: Frete não cotado */}
                {['pronto', 'frete_cotado'].includes(modalAberto.status) && !modalAberto.transportadora && (
                  <div style={{
                    padding: 16,
                    background: 'rgba(255,193,7,0.1)',
                    border: '1px solid rgba(255,193,7,0.3)',
                    borderRadius: 8,
                    marginBottom: 20,
                  }}>
                    <div style={{ color: '#ffc107', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                      ⚠️ Frete ainda não cotado
                    </div>
                    <div style={{ color: '#9aa0a6', fontSize: 13, marginBottom: 12 }}>
                      Para marcar como pago, primeiro é necessário cotar o frete e escolher a transportadora.
                    </div>
                    <button
                      onClick={() => {
                        window.open('/expedicao', '_blank')
                      }}
                      style={{
                        background: 'rgba(255,193,7,0.2)',
                        color: '#ffc107',
                        border: '1px solid rgba(255,193,7,0.5)',
                        borderRadius: 8,
                        padding: '10px 16px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        fontSize: 14,
                      }}
                    >
                      📦 Ir para Expedição
                    </button>
                  </div>
                )}

                {/* Botões do Modal */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {modalAberto.status === 'frete_pago' && (
                    <button
                      onClick={() => {
                        handleGerarEtiqueta(modalAberto)
                        setModalAberto(null)
                      }}
                      disabled={gerando === modalAberto.id}
                      style={{
                        flex: 1,
                        minWidth: 150,
                        background: 'var(--p-blue)',
                        color: '#0f0f0f',
                        border: 'none',
                        borderRadius: 8,
                        padding: '14px 20px',
                        fontWeight: 700,
                        cursor: gerando === modalAberto.id ? 'wait' : 'pointer',
                        opacity: gerando === modalAberto.id ? 0.6 : 1,
                      }}
                    >
                      {gerando === modalAberto.id ? 'Gerando...' : '🏷️ Gerar Etiqueta'}
                    </button>
                  )}

                  {(modalAberto.status === 'etiqueta_gerada' || modalAberto.status === 'despachado') && (
                    <>
                      <button
                        onClick={() => handleImprimirEtiqueta(modalAberto)}
                        style={{
                          flex: 1,
                          minWidth: 150,
                          background: 'rgba(33,150,243,0.2)',
                          color: '#2196f3',
                          border: '1px solid rgba(33,150,243,0.5)',
                          borderRadius: 8,
                          padding: '14px 20px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        🖨️ Imprimir Etiqueta
                      </button>

                      {modalAberto.status === 'etiqueta_gerada' && (
                        <button
                          onClick={() => {
                            handleMarcarDespachado(modalAberto)
                            setModalAberto(null)
                          }}
                          style={{
                            flex: 1,
                            minWidth: 150,
                            background: 'rgba(76,175,80,0.2)',
                            color: '#4caf50',
                            border: '1px solid rgba(76,175,80,0.5)',
                            borderRadius: 8,
                            padding: '14px 20px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          ✓ Marcar como Despachado
                        </button>
                      )}
                    </>
                  )}

                  {/* Botão Marcar como Pago - aparece apenas quando NÃO está pago */}
                  {!['frete_pago', 'etiqueta_gerada', 'despachado'].includes(modalAberto.status) && (
                    <button
                      onClick={() => {
                        handleMarcarComoPago(modalAberto)
                        setModalAberto(null)
                      }}
                      style={{
                        flex: 1,
                        minWidth: 150,
                        background: 'rgba(255,193,7,0.2)',
                        color: '#ffc107',
                        border: '1px solid rgba(255,193,7,0.5)',
                        borderRadius: 8,
                        padding: '14px 20px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      💰 Marcar como Pago
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
