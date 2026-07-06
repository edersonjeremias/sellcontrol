import { useState, useEffect } from 'react'
import { getVendasPermissoes, saveVendasPermissoes, VENDAS_PERMISSOES_DEFAULT } from '../../services/configService'

const PERMISSOES_LABELS = {
  pode_alterar_preco: 'Alterar Preço',
  pode_alterar_colunas_cadastro: 'Alterar Colunas do Cadastro',
  pode_editar_modal: 'Editar no Modal',
  pode_excluir: 'Excluir Linhas',
  pode_estornar: 'Estornar Vendas',
  pode_enviar: 'Enviar para Cobrança',
  pode_copiar: 'Copiar Linhas',
}

export default function VendasPermissoesModal({ user, onClose, showToast }) {
  const [permissoes, setPermissoes] = useState(VENDAS_PERMISSOES_DEFAULT)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function carregar() {
      try {
        const perms = await getVendasPermissoes(user.id)
        setPermissoes(perms)
      } catch (err) {
        console.error('Erro ao carregar permissões:', err)
      } finally {
        setLoading(false)
      }
    }
    carregar()
  }, [user.id])

  async function handleSalvar() {
    setSaving(true)
    try {
      await saveVendasPermissoes(user.id, permissoes)
      showToast('Permissões salvas!', 'success')
      onClose()
    } catch (err) {
      showToast('Erro ao salvar: ' + err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  function toggle(key) {
    setPermissoes(p => ({ ...p, [key]: !p[key] }))
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--card-bg)',
        borderRadius: 12,
        padding: 24,
        maxWidth: 500,
        width: '90%',
        maxHeight: '80vh',
        overflow: 'auto',
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>
          🛒 Permissões de Vendas
        </h3>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 20px' }}>
          <strong>{user.nome}</strong>
        </p>

        {loading ? (
          <p style={{ color: 'var(--muted)' }}>Carregando...</p>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 12 }}>
                O QUE O USUÁRIO PODE FAZER NA PÁGINA VENDAS:
              </div>

              {Object.keys(PERMISSOES_LABELS).map(key => (
                <label
                  key={key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '10px 12px',
                    background: permissoes[key] ? 'rgba(129,201,149,0.08)' : 'var(--bg)',
                    border: `1px solid ${permissoes[key] ? 'rgba(129,201,149,0.3)' : 'var(--border)'}`,
                    borderRadius: 8,
                    marginBottom: 8,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = permissoes[key] ? 'rgba(129,201,149,0.12)' : 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = permissoes[key] ? 'rgba(129,201,149,0.08)' : 'var(--bg)'}
                >
                  <input
                    type="checkbox"
                    checked={permissoes[key]}
                    onChange={() => toggle(key)}
                    style={{ marginRight: 10, cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: 14, color: 'var(--text-body)', flex: 1 }}>
                    {PERMISSOES_LABELS[key]}
                  </span>
                </label>
              ))}
            </div>

            <div style={{
              background: 'rgba(138,180,248,0.08)',
              border: '1px solid rgba(138,180,248,0.3)',
              borderRadius: 8,
              padding: 12,
              marginBottom: 16,
            }}>
              <div style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 700, marginBottom: 4 }}>
                ℹ️ SEMPRE LIBERADO:
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                • Incluir nome do cliente<br />
                • Fazer cadastros (criar linhas)<br />
                • Buscar produtos
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={onClose}
                className="btn-acao"
                style={{ flex: 1 }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSalvar}
                disabled={saving}
                className="btn-acao btn-blue"
                style={{ flex: 1 }}
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
