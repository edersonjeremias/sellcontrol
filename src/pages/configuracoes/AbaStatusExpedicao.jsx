import { useState, useEffect } from 'react'
import {
  getAllStatusExpedicao,
  createStatus,
  updateStatus,
  deleteStatus,
  reorderStatus,
} from '../../services/statusExpedicaoService'

const SI = {
  background: 'var(--input-bg)',
  border: '1px solid var(--border-light)',
  color: 'var(--text-body)',
  borderRadius: 6,
  padding: '8px 10px',
  fontSize: 14,
  width: '100%',
}

export default function AbaStatusExpedicao({ tenantId, showToast }) {
  const [status, setStatus] = useState([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState({ nome: '', cor: '#81c995' })

  useEffect(() => {
    if (!tenantId) return
    carregarStatus()
  }, [tenantId])

  async function carregarStatus() {
    setLoading(true)
    try {
      const data = await getAllStatusExpedicao(tenantId)
      setStatus(data)
    } catch (e) {
      showToast('Erro ao carregar status: ' + e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  async function salvar() {
    if (!form.nome.trim()) {
      showToast('Digite o nome do status', 'error')
      return
    }

    setLoading(true)
    try {
      if (editando) {
        await updateStatus(editando.id, {
          nome: form.nome.trim(),
          cor: form.cor,
        })
        showToast('Status atualizado!')
      } else {
        await createStatus(tenantId, {
          nome: form.nome.trim(),
          cor: form.cor,
          ordem: status.length + 1,
        })
        showToast('Status criado!')
      }
      setForm({ nome: '', cor: '#81c995' })
      setShowForm(false)
      setEditando(null)
      await carregarStatus()
    } catch (e) {
      showToast('Erro ao salvar: ' + e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  async function remover(id, nome) {
    if (!confirm(`Deseja realmente remover o status "${nome}"?`)) return

    setLoading(true)
    try {
      await deleteStatus(id)
      showToast('Status removido!')
      await carregarStatus()
    } catch (e) {
      showToast('Erro ao remover: ' + e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  async function moverStatus(index, direcao) {
    const novaLista = [...status]
    const novoIndex = index + direcao

    if (novoIndex < 0 || novoIndex >= novaLista.length) return

    // Troca posições
    ;[novaLista[index], novaLista[novoIndex]] = [novaLista[novoIndex], novaLista[index]]

    setStatus(novaLista)

    try {
      await reorderStatus(tenantId, novaLista.map(s => s.id))
    } catch (e) {
      showToast('Erro ao reordenar: ' + e.message, 'error')
      await carregarStatus() // Reverte em caso de erro
    }
  }

  function iniciarEdicao(st) {
    setEditando(st)
    setForm({ nome: st.nome, cor: st.cor })
    setShowForm(true)
  }

  function cancelar() {
    setShowForm(false)
    setEditando(null)
    setForm({ nome: '', cor: '#81c995' })
  }

  const CORES_SUGERIDAS = [
    { nome: 'Verde', cor: '#81c995' },
    { nome: 'Azul', cor: '#8ab4f8' },
    { nome: 'Amarelo', cor: '#fbbc04' },
    { nome: 'Vermelho', cor: '#f28b82' },
    { nome: 'Roxo', cor: '#c58af9' },
    { nome: 'Cinza', cor: '#9aa0a6' },
    { nome: 'Laranja', cor: '#ff9800' },
    { nome: 'Rosa', cor: '#ec407a' },
  ]

  return (
    <div style={{ padding: '20px 0', maxWidth: 600 }}>

      {/* Informação */}
      <div style={{
        marginBottom: 20,
        padding: '12px 16px',
        background: 'rgba(59,130,246,0.08)',
        border: '1px solid rgba(59,130,246,0.2)',
        borderRadius: 8,
        fontSize: 13,
        color: 'var(--text-body)',
      }}>
        <strong style={{ color: 'var(--blue)' }}>📋 Status da Expedição</strong>
        <p style={{ margin: '6px 0 0 0', color: 'var(--muted)' }}>
          Configure os status personalizados que aparecem no módulo de Expedição.
          Você pode criar, editar, reordenar e remover status conforme necessário.
        </p>
      </div>

      {/* Botão Novo Status */}
      <button
        className="btn-acao btn-blue"
        style={{
          marginBottom: 16,
          padding: '0 18px',
          height: 36,
          fontSize: 13,
          color: '#171717',
          fontWeight: 600,
        }}
        onClick={() => setShowForm(v => !v)}
        disabled={loading}
      >
        {showForm ? '✕ Cancelar' : '+ Novo Status'}
      </button>

      {/* Formulário */}
      {showForm && (
        <div style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--border-light)',
          borderRadius: 8,
          padding: 16,
          marginBottom: 16,
        }}>
          <h4 style={{ margin: '0 0 12px 0', color: 'var(--text-header)', fontSize: 14 }}>
            {editando ? '✏️ Editar Status' : '➕ Novo Status'}
          </h4>

          <div style={{ marginBottom: 12 }}>
            <label style={{
              fontSize: 11,
              color: 'var(--muted)',
              display: 'block',
              marginBottom: 4,
            }}>
              Nome do Status *
            </label>
            <input
              type="text"
              value={form.nome}
              onChange={e => setForm(p => ({ ...p, nome: e.target.value }))}
              placeholder="Ex: Em trânsito"
              style={SI}
              maxLength={50}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{
              fontSize: 11,
              color: 'var(--muted)',
              display: 'block',
              marginBottom: 8,
            }}>
              Cor *
            </label>

            {/* Cores sugeridas */}
            <div style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              marginBottom: 10,
            }}>
              {CORES_SUGERIDAS.map(c => (
                <button
                  key={c.cor}
                  onClick={() => setForm(p => ({ ...p, cor: c.cor }))}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 8,
                    background: c.cor,
                    border: form.cor === c.cor
                      ? '3px solid var(--blue)'
                      : '2px solid var(--border-light)',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    position: 'relative',
                  }}
                  title={c.nome}
                >
                  {form.cor === c.cor && (
                    <span style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      color: '#000',
                      fontSize: 18,
                      fontWeight: 700,
                    }}>
                      ✓
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Seletor de cor customizado */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="color"
                value={form.cor}
                onChange={e => setForm(p => ({ ...p, cor: e.target.value }))}
                style={{
                  width: 60,
                  height: 38,
                  borderRadius: 6,
                  border: '2px solid var(--border-light)',
                  cursor: 'pointer',
                  background: 'var(--input-bg)',
                }}
              />
              <input
                type="text"
                value={form.cor}
                onChange={e => {
                  const val = e.target.value
                  if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                    setForm(p => ({ ...p, cor: val }))
                  }
                }}
                placeholder="#81c995"
                style={{
                  ...SI,
                  width: 100,
                  fontFamily: 'monospace',
                  textTransform: 'uppercase',
                }}
                maxLength={7}
              />
              <div style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 6,
                background: 'var(--input-bg)',
                border: '2px solid var(--border-light)',
                color: form.cor,
                fontWeight: 700,
                fontSize: 14,
                textAlign: 'center',
              }}>
                Exemplo
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn-acao btn-green"
              onClick={salvar}
              disabled={loading}
              style={{
                flex: 1,
                minHeight: 40,
                fontSize: 14,
                color: '#171717',
                fontWeight: 700,
              }}
            >
              {loading ? 'Salvando…' : editando ? 'Atualizar' : 'Criar Status'}
            </button>
            <button
              onClick={cancelar}
              disabled={loading}
              style={{
                flex: 'none',
                padding: '0 16px',
                minHeight: 40,
                borderRadius: 6,
                border: '1px solid var(--border-light)',
                background: 'transparent',
                color: 'var(--muted)',
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista de Status */}
      <div style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--border-light)',
        borderRadius: 8,
        overflow: 'hidden',
      }}>
        {status.length === 0 ? (
          <div style={{
            padding: 40,
            textAlign: 'center',
            color: 'var(--muted)',
            fontSize: 13,
          }}>
            {loading ? 'Carregando...' : 'Nenhum status cadastrado'}
          </div>
        ) : (
          status.map((st, index) => (
            <div
              key={st.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 14px',
                borderBottom: index < status.length - 1
                  ? '1px solid var(--border-light)'
                  : 'none',
                background: !st.ativo ? 'rgba(154,160,166,0.05)' : 'transparent',
              }}
            >
              {/* Ícone de arrastar */}
              <div style={{
                fontSize: 18,
                color: 'var(--muted)',
                cursor: 'grab',
              }}>
                ⠿
              </div>

              {/* Cor preview */}
              <div style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                background: st.cor,
                border: '2px solid var(--border-light)',
                flexShrink: 0,
              }} />

              {/* Nome */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: st.ativo ? 'var(--text-body)' : 'var(--muted)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {st.nome}
                  {!st.ativo && (
                    <span style={{
                      marginLeft: 8,
                      fontSize: 10,
                      color: '#f28b82',
                      background: 'rgba(242,139,130,0.15)',
                      padding: '2px 6px',
                      borderRadius: 4,
                      fontWeight: 700,
                    }}>
                      INATIVO
                    </span>
                  )}
                </div>
                <div style={{
                  fontSize: 11,
                  color: 'var(--muted)',
                  fontFamily: 'monospace',
                }}>
                  {st.cor}
                </div>
              </div>

              {/* Botões de ordenação */}
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => moverStatus(index, -1)}
                  disabled={index === 0 || loading}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: index === 0 ? 'not-allowed' : 'pointer',
                    color: index === 0 ? 'var(--border-light)' : 'var(--muted)',
                    fontSize: 16,
                    padding: '4px 6px',
                  }}
                  title="Mover para cima"
                >
                  ▲
                </button>
                <button
                  onClick={() => moverStatus(index, 1)}
                  disabled={index === status.length - 1 || loading}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: index === status.length - 1 ? 'not-allowed' : 'pointer',
                    color: index === status.length - 1 ? 'var(--border-light)' : 'var(--muted)',
                    fontSize: 16,
                    padding: '4px 6px',
                  }}
                  title="Mover para baixo"
                >
                  ▼
                </button>
              </div>

              {/* Botão editar */}
              <button
                onClick={() => iniciarEdicao(st)}
                disabled={loading}
                style={{
                  height: 32,
                  padding: '0 12px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  border: '1px solid var(--border-light)',
                  background: 'transparent',
                  color: 'var(--blue)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Editar
              </button>

              {/* Botão remover */}
              <button
                onClick={() => remover(st.id, st.nome)}
                disabled={loading}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#f28b82',
                  fontSize: 18,
                  padding: '4px 8px',
                  lineHeight: 1,
                }}
                title="Remover"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>

      {/* Informação adicional */}
      {status.length > 0 && (
        <div style={{
          marginTop: 12,
          fontSize: 12,
          color: 'var(--muted)',
          fontStyle: 'italic',
        }}>
          💡 Use as setas ▲▼ para reordenar como os status aparecem no módulo de Expedição
        </div>
      )}
    </div>
  )
}
