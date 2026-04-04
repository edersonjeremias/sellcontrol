import { useEffect, useState } from 'react'
import AppShell from '../components/ui/AppShell'
import { useAuth } from '../context/AuthContext'
import { getInformativos, addInformativo, markInformativoRead } from '../services/appService'
import { useApp } from '../context/AppContext'

export default function DashboardPage() {
  const { profile } = useAuth()
  const { showToast } = useApp()
  const [informativos, setInformativos] = useState([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [destinatario, setDestinatario] = useState('TODOS')
  const [filter, setFilter] = useState('Pendente')

  const tenantId = profile?.tenant_id

  useEffect(() => {
    if (!tenantId) return
    loadInformativos()
  }, [tenantId])

  const loadInformativos = async () => {
    setLoading(true)
    const result = await getInformativos(tenantId)
    if (result.error) {
      showToast('Erro ao carregar comunicados.', 'error')
      setInformativos([])
    } else {
      setInformativos(result.data || [])
    }
    setLoading(false)
  }

  const handleSave = async () => {
    if (!message.trim()) {
      showToast('Digite uma mensagem antes de salvar.', 'error')
      return
    }
    const result = await addInformativo(tenantId, message.trim(), destinatario, profile?.nome || '')
    if (result.error) {
      showToast('Erro ao salvar comunicado.', 'error')
      return
    }
    setMessage('')
    setDestinatario('TODOS')
    showToast('Comunicado salvo com sucesso!', 'success')
    loadInformativos()
  }

  const handleMarkRead = async (id) => {
    const { error } = await markInformativoRead(id)
    if (error) {
      showToast('Erro ao marcar como lido.', 'error')
      return
    }
    showToast('Marcado como lido.', 'success')
    loadInformativos()
  }

  const filtered = informativos.filter((item) => {
    if (filter === 'Pendente') return item.status === 'Pendente'
    if (filter === 'Lido') return item.status === 'Lido'
    return true
  })

  return (
    <AppShell title="Dashboard">
      <section className="dashboard-panel">
        <div className="dashboard-cards">
          <div className="dashboard-card">
            <div className="card-title">Pendentes</div>
            <div className="card-value">{informativos.filter((item) => item.status === 'Pendente').length}</div>
          </div>
          <div className="dashboard-card">
            <div className="card-title">Histórico</div>
            <div className="card-value">{informativos.filter((item) => item.status === 'Lido').length}</div>
          </div>
          <div className="dashboard-card">
            <div className="card-title">Seus Dados</div>
            <div className="card-value">{profile?.nome || 'Usuário'}</div>
          </div>
        </div>

        <div className="dashboard-actions">
          <div className="dashboard-form-card">
            <h2>Novo aviso</h2>
            <textarea
              rows={5}
              placeholder="Digite a comunicação interna aqui..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <div className="row gap">
              <input
                type="text"
                placeholder="Destinatário (TODOS, nome de usuário, setor...)"
                value={destinatario}
                onChange={(e) => setDestinatario(e.target.value)}
              />
              <button className="btn-acao btn-blue" onClick={handleSave}>
                Salvar aviso
              </button>
            </div>
          </div>

          <div className="dashboard-list-card">
            <div className="list-header">
              <h2>Informativos</h2>
              <div className="list-tabs">
                {['Pendente', 'Lido', 'Todos'].map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={filter === tab ? 'btn-acao btn-blue' : 'btn-acao btn-ghost'}
                    onClick={() => setFilter(tab)}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            <div className="informativos-list">
              {loading && <div className="empty-state">Carregando...</div>}
              {!loading && filtered.length === 0 && <div className="empty-state">Nenhum informativo encontrado.</div>}
              {!loading && filtered.map((item) => (
                <div key={item.id} className="informativo-card">
                  <div className="informativo-header">
                    <strong>{item.destinatario || 'TODOS'}</strong>
                    <span>{new Date(item.data_insercao).toLocaleString('pt-BR')}</span>
                  </div>
                  <div className="informativo-message" dangerouslySetInnerHTML={{ __html: item.mensagem }} />
                  <div className="informativo-footer">
                    <span>{item.status}</span>
                    {item.status !== 'Lido' && (
                      <button className="btn-acao btn-ghost" onClick={() => handleMarkRead(item.id)}>
                        Marcar como lido
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  )
}
