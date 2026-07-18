import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import {
  ASSUNTOS_DISPONIVEIS,
  getUsuariosComAssuntos,
  saveUserAssuntos,
} from '../../services/assuntosService'

export default function ConfigAssuntos() {
  const { profile } = useAuth()
  const { showToast } = useApp()
  const [usuarios, setUsuarios] = useState([])
  const [userSelecionado, setUserSelecionado] = useState(null)
  const [assuntosSelecionados, setAssuntosSelecionados] = useState([])
  const [salvando, setSalvando] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile?.tenant_id) return
    async function carregar() {
      try {
        const usrs = await getUsuariosComAssuntos(profile.tenant_id)
        setUsuarios(usrs)
      } catch (err) {
        showToast('Erro ao carregar usuários', 'error')
      } finally {
        setLoading(false)
      }
    }
    carregar()
  }, [profile?.tenant_id, showToast])

  async function salvar() {
    if (!userSelecionado) return
    setSalvando(true)
    try {
      await saveUserAssuntos(userSelecionado.id, assuntosSelecionados)

      // Atualiza lista local
      setUsuarios(prev => prev.map(u =>
        u.id === userSelecionado.id
          ? { ...u, assuntos_permitidos: assuntosSelecionados }
          : u
      ))

      showToast('Assuntos salvos com sucesso!', 'success')
    } catch (err) {
      showToast('Erro ao salvar assuntos', 'error')
    } finally {
      setSalvando(false)
    }
  }

  function selecionarUsuario(user) {
    setUserSelecionado(user)
    setAssuntosSelecionados(user.assuntos_permitidos || [])
  }

  function toggleAssunto(assunto) {
    setAssuntosSelecionados(prev =>
      prev.includes(assunto)
        ? prev.filter(a => a !== assunto)
        : [...prev, assunto]
    )
  }

  if (loading) return <div>Carregando...</div>

  return (
    <div style={{ maxWidth: 900 }}>
      <h2 style={{ fontSize: 20, marginBottom: 8 }}>Assuntos por Usuário</h2>
      <p style={{ color: 'var(--muted)', marginBottom: 24, fontSize: 14 }}>
        Defina quais assuntos cada usuário pode visualizar nas conversas.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
        {usuarios.map(user => {
          const isExpanded = userSelecionado?.id === user.id
          const assuntosAtivos = user.assuntos_permitidos || []

          return (
            <div key={user.id} style={{
              background: 'var(--card-bg)',
              border: '1px solid var(--border-light)',
              borderRadius: 10,
              overflow: 'hidden'
            }}>
              {/* Header */}
              <div
                onClick={() => selecionarUsuario(user)}
                style={{
                  padding: '16px 20px',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: isExpanded ? 'rgba(var(--blue-rgb), 0.05)' : 'transparent'
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-body)' }}>
                    {user.nome}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
                    @{user.username} · {user.email}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{
                    fontSize: 12,
                    color: 'var(--blue)',
                    background: 'rgba(var(--blue-rgb), 0.1)',
                    padding: '4px 10px',
                    borderRadius: 12,
                    fontWeight: 600
                  }}>
                    {assuntosAtivos.length} {assuntosAtivos.length === 1 ? 'assunto' : 'assuntos'}
                  </span>
                  <button
                    className="btn-acao"
                    style={{
                      padding: '6px 16px',
                      fontSize: 13,
                      background: isExpanded ? 'var(--blue)' : 'transparent',
                      color: isExpanded ? '#fff' : 'var(--blue)',
                      border: `1px solid ${isExpanded ? 'var(--blue)' : 'var(--border-light)'}`,
                    }}
                  >
                    {isExpanded ? 'Configurando' : 'Configurar'}
                  </button>
                </div>
              </div>

              {/* Checkboxes de assuntos */}
              {isExpanded && (
                <div style={{ padding: '0 20px 20px', borderTop: '1px solid var(--border-light)' }}>
                  <p style={{ fontSize: 13, color: 'var(--muted)', margin: '16px 0 12px' }}>
                    Marque os assuntos que <strong>{user.nome}</strong> poderá acessar:
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                    {ASSUNTOS_DISPONIVEIS.map(assunto => (
                      <label key={assunto.value} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 12px',
                        background: assuntosSelecionados.includes(assunto.value) ? 'rgba(var(--blue-rgb), 0.08)' : 'transparent',
                        border: '1px solid var(--border-light)',
                        borderRadius: 8,
                        cursor: 'pointer'
                      }}>
                        <input
                          type="checkbox"
                          checked={assuntosSelecionados.includes(assunto.value)}
                          onChange={() => toggleAssunto(assunto.value)}
                          style={{ cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: 14, color: 'var(--text-body)' }}>
                          {assunto.label}
                        </span>
                      </label>
                    ))}
                  </div>

                  <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
                    <button
                      onClick={salvar}
                      disabled={salvando}
                      className="btn-acao btn-blue"
                    >
                      {salvando ? 'Salvando...' : 'Salvar Assuntos'}
                    </button>
                    <button
                      onClick={() => setUserSelecionado(null)}
                      className="btn-acao"
                      style={{ background: 'transparent', color: 'var(--muted)' }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
