import { useState } from 'react'
import {
  updateUsuario,
  toggleUsuarioAtivo,
  resetUsuarioSenha,
} from '../../services/configService'

export default function UserActionsMenu({ user, onUpdate, showToast }) {
  const [showMenu, setShowMenu] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showResetModal, setShowResetModal] = useState(false)
  const [editForm, setEditForm] = useState({ nome: user.nome, email: user.email })
  const [novaSenha, setNovaSenha] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleEditar() {
    setLoading(true)
    try {
      await updateUsuario(user.id, editForm)
      showToast('Usuário atualizado!', 'success')
      onUpdate()
      setShowEditModal(false)
    } catch (err) {
      showToast('Erro ao atualizar: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleResetSenha() {
    if (!novaSenha || novaSenha.length < 6) {
      showToast('Senha deve ter pelo menos 6 caracteres', 'error')
      return
    }
    setLoading(true)
    try {
      await resetUsuarioSenha(user.id, novaSenha)
      showToast('Senha resetada com sucesso!', 'success')
      setShowResetModal(false)
      setNovaSenha('')
    } catch (err) {
      showToast('Erro ao resetar senha: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleToggleAtivo() {
    const novoStatus = !user.ativo
    const confirmMsg = novoStatus
      ? `Reativar usuário ${user.nome}?`
      : `Inativar usuário ${user.nome}? Ele não poderá mais fazer login.`

    if (!window.confirm(confirmMsg)) return

    setLoading(true)
    try {
      await toggleUsuarioAtivo(user.id, novoStatus)
      showToast(novoStatus ? 'Usuário reativado!' : 'Usuário inativado!', 'success')
      onUpdate()
    } catch (err) {
      showToast('Erro: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Botão de menu */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setShowMenu(!showMenu)}
          style={{
            background: 'none',
            border: '1px solid var(--border-light)',
            borderRadius: 6,
            padding: '6px 10px',
            cursor: 'pointer',
            color: 'var(--muted)',
            fontSize: 16,
          }}
        >
          ⋮
        </button>

        {showMenu && (
          <div style={{
            position: 'absolute',
            right: 0,
            top: '100%',
            marginTop: 4,
            background: 'var(--card-bg)',
            border: '1px solid var(--border-light)',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 100,
            minWidth: 180,
          }}>
            <button
              onClick={() => { setShowEditModal(true); setShowMenu(false) }}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '10px 14px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 13,
                color: 'var(--text-body)',
                borderBottom: '1px solid var(--border-light)',
              }}
            >
              ✏️ Editar Nome/Email
            </button>
            <button
              onClick={() => { setShowResetModal(true); setShowMenu(false) }}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '10px 14px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 13,
                color: 'var(--text-body)',
                borderBottom: '1px solid var(--border-light)',
              }}
            >
              🔑 Resetar Senha
            </button>
            <button
              onClick={() => { handleToggleAtivo(); setShowMenu(false) }}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '10px 14px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 13,
                color: user.ativo ? '#f28b82' : 'var(--green)',
              }}
            >
              {user.ativo ? '⛔ Inativar Usuário' : '✅ Reativar Usuário'}
            </button>
          </div>
        )}
      </div>

      {/* Modal Editar */}
      {showEditModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }} onClick={() => setShowEditModal(false)}>
          <div style={{
            background: 'var(--card-bg)',
            borderRadius: 12,
            padding: 24,
            maxWidth: 400,
            width: '90%',
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18 }}>Editar Usuário</h3>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Nome</label>
              <input
                type="text"
                value={editForm.nome}
                onChange={e => setEditForm(p => ({ ...p, nome: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--input-border)',
                  background: 'var(--input-bg)',
                  color: 'var(--input-text)',
                  fontSize: 14,
                }}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Email</label>
              <input
                type="email"
                value={editForm.email}
                onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--input-border)',
                  background: 'var(--input-bg)',
                  color: 'var(--input-text)',
                  fontSize: 14,
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowEditModal(false)}
                className="btn-acao"
                style={{ flex: 1 }}
              >
                Cancelar
              </button>
              <button
                onClick={handleEditar}
                disabled={loading}
                className="btn-acao btn-blue"
                style={{ flex: 1 }}
              >
                {loading ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Reset Senha */}
      {showResetModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }} onClick={() => setShowResetModal(false)}>
          <div style={{
            background: 'var(--card-bg)',
            borderRadius: 12,
            padding: 24,
            maxWidth: 400,
            width: '90%',
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>Resetar Senha</h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 16px' }}>
              Defina uma nova senha para <strong>{user.nome}</strong>
            </p>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Nova Senha (mín. 6 caracteres)</label>
              <input
                type="text"
                value={novaSenha}
                onChange={e => setNovaSenha(e.target.value)}
                placeholder="Digite a nova senha..."
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--input-border)',
                  background: 'var(--input-bg)',
                  color: 'var(--input-text)',
                  fontSize: 14,
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => { setShowResetModal(false); setNovaSenha('') }}
                className="btn-acao"
                style={{ flex: 1 }}
              >
                Cancelar
              </button>
              <button
                onClick={handleResetSenha}
                disabled={loading}
                className="btn-acao btn-blue"
                style={{ flex: 1 }}
              >
                {loading ? 'Resetando...' : 'Resetar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
