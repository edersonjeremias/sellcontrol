import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import AppShell from '../../components/ui/AppShell'
import {
  getNotificacoes,
  marcarComoLida,
  marcarTodasComoLidas,
} from '../../services/notificacoesService'

function formatDataHora(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const TIPO_ICONE = {
  sistema: '⚙️',
  cancelamento: '❌',
  alerta: '⚠️',
  info: 'ℹ️',
}

const TIPO_COR = {
  sistema: '#8ab4f8',
  cancelamento: '#f28b82',
  alerta: '#fbbc04',
  info: '#81c995',
}

export default function NotificacoesPage() {
  const { profile } = useAuth()
  const tenantId = profile?.tenant_id

  const [notificacoes, setNotificacoes] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('todas') // 'todas' | 'nao_lidas' | 'lidas'
  const [notifSelecionada, setNotifSelecionada] = useState(null)

  const carregar = useCallback(async () => {
    console.log('🔍 Carregando notificações, tenantId:', tenantId)
    if (!tenantId) {
      console.warn('⚠️ tenantId não definido, abortando carregamento')
      return
    }
    setLoading(true)
    try {
      console.log('📡 Buscando notificações do banco...')
      const data = await getNotificacoes(tenantId)
      console.log('✅ Notificações recebidas:', data?.length || 0, data)
      setNotificacoes(data)
    } catch (err) {
      console.error('❌ Erro ao carregar notificações:', err)
    }
    setLoading(false)
  }, [tenantId])

  useEffect(() => {
    carregar()
  }, [carregar])

  // Auto-atualização a cada 30s
  useEffect(() => {
    if (!tenantId) return
    const interval = setInterval(carregar, 30000)
    return () => clearInterval(interval)
  }, [tenantId, carregar])

  async function handleMarcarLida(notif) {
    if (notif.lida) return
    try {
      await marcarComoLida(notif.id)
      carregar()
    } catch (err) {
      console.error('Erro ao marcar como lida:', err)
    }
  }

  async function handleMarcarTodasLidas() {
    try {
      await marcarTodasComoLidas(tenantId)
      console.log('✅ Todas marcadas como lidas!')
      carregar()
    } catch (err) {
      console.error('Erro ao marcar todas:', err)
    }
  }

  function abrirModal(notif) {
    setNotifSelecionada(notif)
    if (!notif.lida) handleMarcarLida(notif)
  }

  const notifsFiltradas = notificacoes.filter((n) => {
    if (filtro === 'nao_lidas') return !n.lida
    if (filtro === 'lidas') return n.lida
    return true
  })

  const totalNaoLidas = notificacoes.filter((n) => !n.lida).length

  return (
    <AppShell title="Notificações">
      <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, color: 'var(--text)' }}>
            🔔 Notificações {totalNaoLidas > 0 && `(${totalNaoLidas})`}
          </h2>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={carregar} className="btn-secondary">
              🔄 Atualizar
            </button>
            {totalNaoLidas > 0 && (
              <button onClick={handleMarcarTodasLidas} className="btn-primary">
                ✓ Marcar todas lidas
              </button>
            )}
          </div>
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          {['todas', 'nao_lidas', 'lidas'].map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              style={{
                padding: '8px 16px',
                background: filtro === f ? 'var(--primary)' : 'var(--bg-card)',
                color: filtro === f ? '#000' : 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: filtro === f ? 700 : 400,
              }}
            >
              {f === 'todas' && 'Todas'}
              {f === 'nao_lidas' && 'Não lidas'}
              {f === 'lidas' && 'Lidas'}
            </button>
          ))}
        </div>

        {/* Lista de notificações */}
        {loading ? (
          <p style={{ color: 'var(--text-muted)' }}>Carregando...</p>
        ) : notifsFiltradas.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: 40 }}>
            {filtro === 'nao_lidas' ? 'Nenhuma notificação não lida!' : 'Nenhuma notificação.'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {notifsFiltradas.map((notif) => {
              const cor = TIPO_COR[notif.tipo] || '#8ab4f8'
              const icone = TIPO_ICONE[notif.tipo] || 'ℹ️'
              return (
                <div
                  key={notif.id}
                  onClick={() => abrirModal(notif)}
                  style={{
                    background: 'var(--bg-card)',
                    border: notif.lida ? '1px solid var(--border)' : '2px solid var(--primary)',
                    borderRadius: 12,
                    padding: 16,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    opacity: notif.lida ? 0.7 : 1,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--bg-hover)'
                    e.currentTarget.style.transform = 'translateY(-2px)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--bg-card)'
                    e.currentTarget.style.transform = 'translateY(0)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <span style={{ fontSize: 24 }}>{icone}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14 }}>
                          {notif.titulo}
                        </span>
                        {!notif.lida && (
                          <span
                            style={{
                              background: 'var(--primary)',
                              color: '#000',
                              fontSize: 10,
                              padding: '2px 8px',
                              borderRadius: 10,
                              fontWeight: 700,
                            }}
                          >
                            NOVA
                          </span>
                        )}
                      </div>
                      <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5 }}>
                        {notif.mensagem.length > 120
                          ? notif.mensagem.substring(0, 120) + '...'
                          : notif.mensagem}
                      </p>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {formatDataHora(notif.created_at)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal de detalhes */}
      {notifSelecionada && (
        <div
          onClick={() => setNotifSelecionada(null)}
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
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              padding: 24,
              maxWidth: 600,
              width: '90%',
              maxHeight: '80vh',
              overflow: 'auto',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <span style={{ fontSize: 32 }}>{TIPO_ICONE[notifSelecionada.tipo] || 'ℹ️'}</span>
              <h3 style={{ margin: 0, color: 'var(--text)', flex: 1 }}>{notifSelecionada.titulo}</h3>
              <button
                onClick={() => setNotifSelecionada(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: 24,
                  cursor: 'pointer',
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            <div
              style={{
                background: 'var(--bg)',
                padding: 16,
                borderRadius: 8,
                marginBottom: 16,
                lineHeight: 1.6,
                color: 'var(--text)',
              }}
            >
              {notifSelecionada.mensagem}
            </div>

            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16 }}>
              📅 {formatDataHora(notifSelecionada.created_at)}
              {notifSelecionada.lida && notifSelecionada.lida_em && (
                <span style={{ marginLeft: 16 }}>
                  ✓ Lida em {formatDataHora(notifSelecionada.lida_em)}
                </span>
              )}
            </div>

            {notifSelecionada.metadata && Object.keys(notifSelecionada.metadata).length > 0 && (
              <details style={{ marginTop: 16 }}>
                <summary style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12 }}>
                  Detalhes técnicos
                </summary>
                <pre
                  style={{
                    background: 'var(--bg)',
                    padding: 12,
                    borderRadius: 8,
                    fontSize: 11,
                    overflow: 'auto',
                    marginTop: 8,
                    color: 'var(--text)',
                  }}
                >
                  {JSON.stringify(notifSelecionada.metadata, null, 2)}
                </pre>
              </details>
            )}

            <button onClick={() => setNotifSelecionada(null)} className="btn-primary" style={{ width: '100%', marginTop: 16 }}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </AppShell>
  )
}
