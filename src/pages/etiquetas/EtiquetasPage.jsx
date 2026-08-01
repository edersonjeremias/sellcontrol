import { useState, useEffect, useCallback } from 'react'
import AppShell from '../../components/ui/AppShell'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { gerarEtiqueta, imprimirEtiqueta } from '../../services/melhorEnvioService'

export default function EtiquetasPage() {
  const { profile } = useAuth()
  const tenantId = profile?.tenant_id

  const [romaneios, setRomaneios] = useState([])
  const [loading, setLoading] = useState(true)
  const [gerando, setGerando] = useState(null)

  const carregar = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('romaneios')
        .select('*, enderecos_clientes(*)')
        .eq('tenant_id', tenantId)
        .in('status', ['frete_pago', 'etiqueta_gerada', 'despachado'])
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

  const handleGerarEtiqueta = async (romaneio) => {
    if (!romaneio.melhor_envio_order_id) {
      alert('Este romaneio não possui pedido no Melhor Envio')
      return
    }

    setGerando(romaneio.id)
    try {
      const result = await gerarEtiqueta(tenantId, [romaneio.melhor_envio_order_id])

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
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}>
          <h1 style={{ margin: 0, color: '#e8eaed', fontSize: 24, fontWeight: 700 }}>
            📦 Gestão de Etiquetas
          </h1>
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
            }}
          >
            🔄 Atualizar
          </button>
        </div>

        {romaneios.length === 0 ? (
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
          <div style={{ display: 'grid', gap: 16 }}>
            {romaneios.map(rom => (
              <div
                key={rom.id}
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 12,
                  padding: 20,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 16 }}>
                  <div>
                    <div style={{ color: 'var(--p-blue)', fontWeight: 700, fontSize: 18 }}>
                      {rom.numero}
                    </div>
                    <div style={{ color: '#9aa0a6', fontSize: 14, marginTop: 4 }}>
                      @{rom.cliente_instagram}
                    </div>
                  </div>
                  <div style={{
                    background: rom.status === 'despachado' ? 'rgba(76,175,80,0.2)' :
                               rom.status === 'etiqueta_gerada' ? 'rgba(33,150,243,0.2)' :
                               'rgba(255,193,7,0.2)',
                    color: rom.status === 'despachado' ? '#4caf50' :
                           rom.status === 'etiqueta_gerada' ? '#2196f3' : '#ffc107',
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '6px 12px',
                    borderRadius: 6,
                    textTransform: 'uppercase',
                  }}>
                    {rom.status === 'despachado' ? '✓ Despachado' :
                     rom.status === 'etiqueta_gerada' ? '🏷️ Etiqueta Gerada' : '💳 Frete Pago'}
                  </div>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: 16,
                  marginBottom: 16,
                  padding: 16,
                  background: 'rgba(255,255,255,0.02)',
                  borderRadius: 8,
                }}>
                  <div>
                    <div style={{ color: '#9aa0a6', fontSize: 12, marginBottom: 4 }}>Transportadora</div>
                    <div style={{ color: '#e8eaed', fontWeight: 600 }}>
                      {rom.transportadora || '-'}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#9aa0a6', fontSize: 12, marginBottom: 4 }}>Serviço</div>
                    <div style={{ color: '#e8eaed', fontWeight: 600 }}>
                      {rom.servico || '-'}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#9aa0a6', fontSize: 12, marginBottom: 4 }}>Valor Frete</div>
                    <div style={{ color: '#e8eaed', fontWeight: 600 }}>
                      {rom.valor_frete ? `R$ ${Number(rom.valor_frete).toFixed(2)}` : '-'}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#9aa0a6', fontSize: 12, marginBottom: 4 }}>Prazo</div>
                    <div style={{ color: '#e8eaed', fontWeight: 600 }}>
                      {rom.prazo_entrega ? `${rom.prazo_entrega} dia(s)` : '-'}
                    </div>
                  </div>
                </div>

                {rom.enderecos_clientes && (
                  <div style={{
                    padding: 12,
                    background: 'rgba(255,255,255,0.02)',
                    borderRadius: 8,
                    marginBottom: 16,
                  }}>
                    <div style={{ color: '#9aa0a6', fontSize: 11, marginBottom: 4 }}>📍 Endereço de Entrega</div>
                    <div style={{ color: '#e8eaed', fontSize: 13, lineHeight: 1.5 }}>
                      {rom.enderecos_clientes.destinatario}<br />
                      {rom.enderecos_clientes.rua}, {rom.enderecos_clientes.numero}
                      {rom.enderecos_clientes.complemento && ` - ${rom.enderecos_clientes.complemento}`}<br />
                      {rom.enderecos_clientes.bairro} - {rom.enderecos_clientes.cidade}/{rom.enderecos_clientes.estado}<br />
                      CEP: {rom.enderecos_clientes.cep}
                    </div>
                  </div>
                )}

                {rom.codigo_rastreio && (
                  <div style={{
                    padding: 12,
                    background: 'rgba(33,150,243,0.1)',
                    border: '1px solid rgba(33,150,243,0.3)',
                    borderRadius: 8,
                    marginBottom: 16,
                  }}>
                    <div style={{ color: '#9aa0a6', fontSize: 11, marginBottom: 4 }}>🔍 Código de Rastreio</div>
                    <div style={{ color: '#2196f3', fontSize: 14, fontWeight: 700 }}>
                      {rom.codigo_rastreio}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {rom.status === 'frete_pago' && (
                    <button
                      onClick={() => handleGerarEtiqueta(rom)}
                      disabled={gerando === rom.id}
                      style={{
                        flex: 1,
                        minWidth: 150,
                        background: 'var(--p-blue)',
                        color: '#0f0f0f',
                        border: 'none',
                        borderRadius: 8,
                        padding: '12px 16px',
                        fontWeight: 700,
                        cursor: gerando === rom.id ? 'wait' : 'pointer',
                        opacity: gerando === rom.id ? 0.6 : 1,
                      }}
                    >
                      {gerando === rom.id ? 'Gerando...' : '🏷️ Gerar Etiqueta'}
                    </button>
                  )}

                  {(rom.status === 'etiqueta_gerada' || rom.status === 'despachado') && (
                    <>
                      <button
                        onClick={() => handleImprimirEtiqueta(rom)}
                        style={{
                          flex: 1,
                          minWidth: 150,
                          background: 'rgba(33,150,243,0.2)',
                          color: '#2196f3',
                          border: '1px solid rgba(33,150,243,0.5)',
                          borderRadius: 8,
                          padding: '12px 16px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        🖨️ Imprimir Etiqueta
                      </button>

                      {rom.status === 'etiqueta_gerada' && (
                        <button
                          onClick={() => handleMarcarDespachado(rom)}
                          style={{
                            flex: 1,
                            minWidth: 150,
                            background: 'rgba(76,175,80,0.2)',
                            color: '#4caf50',
                            border: '1px solid rgba(76,175,80,0.5)',
                            borderRadius: 8,
                            padding: '12px 16px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          ✓ Marcar como Despachado
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
