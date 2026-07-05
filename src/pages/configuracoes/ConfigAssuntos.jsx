import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import {
  ASSUNTOS_DISPONIVEIS,
  getAssuntosConfig,
  saveAssuntosConfig,
  getUsuariosDisponiveis,
} from '../../services/assuntosService'

export default function ConfigAssuntos() {
  const { profile } = useAuth()
  const { showToast } = useApp()
  const [config, setConfig] = useState({})
  const [usuarios, setUsuarios] = useState([])
  const [salvando, setSalvando] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile?.tenant_id) return
    async function carregar() {
      try {
        const [cfg, usrs] = await Promise.all([
          getAssuntosConfig(profile.tenant_id),
          getUsuariosDisponiveis(profile.tenant_id),
        ])
        setConfig(cfg)
        setUsuarios(usrs)
      } catch (err) {
        showToast('Erro ao carregar configurações', 'error')
      } finally {
        setLoading(false)
      }
    }
    carregar()
  }, [profile?.tenant_id, showToast])

  async function salvar() {
    setSalvando(true)
    try {
      await saveAssuntosConfig(profile.tenant_id, config)
      showToast('Configurações salvas com sucesso!', 'success')
    } catch (err) {
      showToast('Erro ao salvar configurações', 'error')
    } finally {
      setSalvando(false)
    }
  }

  function handleChange(assunto, userId) {
    setConfig(prev => ({
      ...prev,
      [assunto]: userId || null,
    }))
  }

  if (loading) return <div>Carregando...</div>

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <h2 style={{ fontSize: 20, marginBottom: 8 }}>Roteamento de Assuntos</h2>
      <p style={{ color: 'var(--muted)', marginBottom: 24, fontSize: 14 }}>
        Configure para qual usuário cada tipo de assunto será direcionado automaticamente.
      </p>

      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-light)', borderRadius: 10, padding: 24 }}>
        {ASSUNTOS_DISPONIVEIS.map(assunto => (
          <div key={assunto.value} style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid var(--border-light)' }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--text-body)' }}>
              {assunto.label}
            </label>
            <select
              value={config[assunto.value] || ''}
              onChange={e => handleChange(assunto.value, e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 14,
                borderRadius: 8,
                border: '1px solid var(--input-border)',
                background: 'var(--input-bg)',
                color: 'var(--input-text)',
                outline: 'none',
              }}
            >
              <option value="">Nenhum responsável definido</option>
              {usuarios.map(user => (
                <option key={user.id} value={user.id}>
                  {user.nome} (@{user.username})
                </option>
              ))}
            </select>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
              Conversas com assunto "{assunto.label}" serão atribuídas a este usuário
            </p>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          <button
            onClick={salvar}
            disabled={salvando}
            className="btn-acao btn-blue"
            style={{ minWidth: 120 }}
          >
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 24, padding: 16, background: 'rgba(74, 222, 128, 0.1)', border: '1px solid rgba(74, 222, 128, 0.3)', borderRadius: 10 }}>
        <strong style={{ color: 'var(--green)', fontSize: 14 }}>💡 Como funciona:</strong>
        <ul style={{ marginTop: 8, paddingLeft: 20, color: 'var(--text-body)', fontSize: 13, lineHeight: 1.6 }}>
          <li>Quando o cliente cria uma nova mensagem no portal, ele escolhe um assunto</li>
          <li>A conversa é automaticamente direcionada para o usuário configurado</li>
          <li>Se nenhum responsável estiver definido, a conversa fica sem atribuição</li>
        </ul>
      </div>
    </div>
  )
}
