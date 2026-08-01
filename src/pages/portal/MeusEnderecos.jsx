import { useState, useEffect, useCallback } from 'react'
import { usePortalAuth } from '../../context/PortalAuthContext'
import { usePortalToast } from '../../components/portal/PortalToast'
import { supabase } from '../../lib/supabase'

export default function MeusEnderecos() {
  const { cliente, tenantId } = usePortalAuth()
  const { showToast } = usePortalToast()

  const [enderecos, setEnderecos] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState({
    apelido: '',
    destinatario: '',
    telefone: '',
    cep: '',
    rua: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    estado: '',
    padrao: false,
  })

  // Buscar endereços do cliente
  const carregar = useCallback(async () => {
    if (!tenantId || !cliente?.instagram) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('enderecos_clientes')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('cliente_instagram', cliente.instagram.replace('@', ''))
        .order('padrao', { ascending: false })
        .order('created_at', { ascending: false })

      if (error) throw error
      setEnderecos(data || [])
    } catch (err) {
      showToast('Erro ao carregar endereços', 'error')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [tenantId, cliente, showToast])

  useEffect(() => { carregar() }, [carregar])

  // Abrir modal para novo endereço
  const handleNovo = () => {
    setEditando(null)
    setForm({
      apelido: '',
      destinatario: cliente?.nome || '',
      telefone: cliente?.whatsapp || '',
      cep: '',
      rua: '',
      numero: '',
      complemento: '',
      bairro: '',
      cidade: '',
      estado: '',
      padrao: enderecos.length === 0, // Primeiro endereço é padrão automaticamente
    })
    setShowModal(true)
  }

  // Abrir modal para editar
  const handleEditar = (end) => {
    setEditando(end.id)
    setForm({ ...end })
    setShowModal(true)
  }

  // Salvar endereço
  const handleSalvar = async () => {
    // Validações
    if (!form.destinatario?.trim()) return showToast('Preencha o destinatário', 'error')
    if (!form.telefone?.trim()) return showToast('Preencha o telefone', 'error')
    if (!form.cep?.trim()) return showToast('Preencha o CEP', 'error')
    if (!form.rua?.trim()) return showToast('Preencha a rua', 'error')
    if (!form.numero?.trim()) return showToast('Preencha o número', 'error')
    if (!form.bairro?.trim()) return showToast('Preencha o bairro', 'error')
    if (!form.cidade?.trim()) return showToast('Preencha a cidade', 'error')
    if (!form.estado?.trim()) return showToast('Preencha o estado', 'error')

    try {
      const dados = {
        tenant_id: tenantId,
        cliente_instagram: cliente.instagram.replace('@', ''),
        apelido: form.apelido?.trim() || null,
        destinatario: form.destinatario.trim(),
        telefone: form.telefone.trim(),
        cep: form.cep.trim(),
        rua: form.rua.trim(),
        numero: form.numero.trim(),
        complemento: form.complemento?.trim() || null,
        bairro: form.bairro.trim(),
        cidade: form.cidade.trim(),
        estado: form.estado.trim().toUpperCase(),
        padrao: form.padrao,
      }

      if (editando) {
        // Atualizar
        const { error } = await supabase
          .from('enderecos_clientes')
          .update(dados)
          .eq('id', editando)

        if (error) throw error
        showToast('Endereço atualizado!', 'success')
      } else {
        // Criar
        const { error } = await supabase
          .from('enderecos_clientes')
          .insert([dados])

        if (error) throw error
        showToast('Endereço salvo!', 'success')
      }

      // Se marcou como padrão, desmarcar os outros
      if (form.padrao) {
        await supabase
          .from('enderecos_clientes')
          .update({ padrao: false })
          .eq('tenant_id', tenantId)
          .eq('cliente_instagram', cliente.instagram.replace('@', ''))
          .neq('id', editando || '00000000-0000-0000-0000-000000000000')
      }

      setShowModal(false)
      carregar()
    } catch (err) {
      showToast('Erro ao salvar endereço', 'error')
      console.error(err)
    }
  }

  // Deletar endereço
  const handleDeletar = async (id) => {
    if (!window.confirm('Tem certeza que deseja excluir este endereço?')) return

    try {
      const { error } = await supabase
        .from('enderecos_clientes')
        .delete()
        .eq('id', id)

      if (error) throw error
      showToast('Endereço excluído', 'success')
      carregar()
    } catch (err) {
      showToast('Erro ao excluir endereço', 'error')
      console.error(err)
    }
  }

  // Marcar como padrão
  const handleMarcarPadrao = async (id) => {
    try {
      // Desmarca todos
      await supabase
        .from('enderecos_clientes')
        .update({ padrao: false })
        .eq('tenant_id', tenantId)
        .eq('cliente_instagram', cliente.instagram.replace('@', ''))

      // Marca o selecionado
      const { error } = await supabase
        .from('enderecos_clientes')
        .update({ padrao: true })
        .eq('id', id)

      if (error) throw error
      showToast('Endereço padrão atualizado', 'success')
      carregar()
    } catch (err) {
      showToast('Erro ao marcar como padrão', 'error')
      console.error(err)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#9aa0a6' }}>
        Carregando endereços...
      </div>
    )
  }

  return (
    <div style={{ padding: 16, maxWidth: 800, margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
      }}>
        <h2 style={{ margin: 0, color: '#e8eaed', fontSize: 20 }}>
          📍 Meus Endereços
        </h2>
        <button
          onClick={handleNovo}
          style={{
            background: 'var(--p-blue)',
            color: '#0f0f0f',
            border: 'none',
            borderRadius: 8,
            padding: '10px 16px',
            fontWeight: 700,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          + Novo Endereço
        </button>
      </div>

      {/* Lista */}
      {enderecos.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: 40,
          background: 'rgba(255,255,255,0.03)',
          borderRadius: 12,
          border: '1px dashed rgba(255,255,255,0.1)',
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
          <p style={{ color: '#9aa0a6', margin: 0 }}>
            Nenhum endereço cadastrado ainda.
          </p>
          <p style={{ color: '#9aa0a6', fontSize: 13, margin: '8px 0 0 0' }}>
            Cadastre um endereço para receber seus pedidos!
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {enderecos.map(end => (
            <div
              key={end.id}
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: end.padrao ? '2px solid var(--p-blue)' : '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12,
                padding: 16,
                position: 'relative',
              }}
            >
              {end.padrao && (
                <div style={{
                  position: 'absolute',
                  top: 12,
                  right: 12,
                  background: 'var(--p-blue)',
                  color: '#0f0f0f',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '4px 8px',
                  borderRadius: 4,
                }}>
                  PADRÃO
                </div>
              )}

              <div style={{ marginBottom: 8 }}>
                {end.apelido && (
                  <div style={{
                    color: 'var(--p-blue)',
                    fontWeight: 700,
                    fontSize: 14,
                    marginBottom: 4,
                  }}>
                    {end.apelido}
                  </div>
                )}
                <div style={{ color: '#e8eaed', fontWeight: 600 }}>
                  {end.destinatario}
                </div>
                <div style={{ color: '#9aa0a6', fontSize: 13 }}>
                  {end.telefone}
                </div>
              </div>

              <div style={{ color: '#9aa0a6', fontSize: 13, lineHeight: 1.5 }}>
                {end.rua}, {end.numero}
                {end.complemento && ` - ${end.complemento}`}
                <br />
                {end.bairro} - {end.cidade}/{end.estado}
                <br />
                CEP: {end.cep}
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                {!end.padrao && (
                  <button
                    onClick={() => handleMarcarPadrao(end.id)}
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      color: '#9aa0a6',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 6,
                      padding: '6px 12px',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    ⭐ Marcar como padrão
                  </button>
                )}
                <button
                  onClick={() => handleEditar(end)}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    color: '#9aa0a6',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6,
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  ✏️ Editar
                </button>
                <button
                  onClick={() => handleDeletar(end.id)}
                  style={{
                    background: 'rgba(244,67,54,0.1)',
                    color: 'var(--p-red)',
                    border: '1px solid rgba(244,67,54,0.3)',
                    borderRadius: 6,
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  🗑️ Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
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
          onClick={() => setShowModal(false)}
        >
          <div
            style={{
              background: '#1a2230',
              border: '2px solid var(--p-blue)',
              borderRadius: 16,
              padding: 24,
              maxWidth: 500,
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 20px 0', color: 'var(--p-blue)' }}>
              {editando ? '✏️ Editar Endereço' : '📍 Novo Endereço'}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', color: '#9aa0a6', fontSize: 12, marginBottom: 4 }}>
                  Apelido (ex: Casa, Trabalho)
                </label>
                <input
                  type="text"
                  value={form.apelido}
                  onChange={e => setForm(p => ({ ...p, apelido: e.target.value }))}
                  placeholder="Casa"
                  style={{
                    width: '100%',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    padding: '10px',
                    color: '#e8eaed',
                    fontSize: 14,
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', color: '#9aa0a6', fontSize: 12, marginBottom: 4 }}>
                  Destinatário *
                </label>
                <input
                  type="text"
                  value={form.destinatario}
                  onChange={e => setForm(p => ({ ...p, destinatario: e.target.value }))}
                  placeholder="Nome completo"
                  style={{
                    width: '100%',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    padding: '10px',
                    color: '#e8eaed',
                    fontSize: 14,
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', color: '#9aa0a6', fontSize: 12, marginBottom: 4 }}>
                  Telefone *
                </label>
                <input
                  type="tel"
                  value={form.telefone}
                  onChange={e => setForm(p => ({ ...p, telefone: e.target.value }))}
                  placeholder="(11) 99999-9999"
                  style={{
                    width: '100%',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    padding: '10px',
                    color: '#e8eaed',
                    fontSize: 14,
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', color: '#9aa0a6', fontSize: 12, marginBottom: 4 }}>
                  CEP *
                </label>
                <input
                  type="text"
                  value={form.cep}
                  onChange={e => setForm(p => ({ ...p, cep: e.target.value }))}
                  placeholder="00000-000"
                  style={{
                    width: '100%',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    padding: '10px',
                    color: '#e8eaed',
                    fontSize: 14,
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', color: '#9aa0a6', fontSize: 12, marginBottom: 4 }}>
                  Rua *
                </label>
                <input
                  type="text"
                  value={form.rua}
                  onChange={e => setForm(p => ({ ...p, rua: e.target.value }))}
                  placeholder="Rua, Avenida..."
                  style={{
                    width: '100%',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    padding: '10px',
                    color: '#e8eaed',
                    fontSize: 14,
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
                <div>
                  <label style={{ display: 'block', color: '#9aa0a6', fontSize: 12, marginBottom: 4 }}>
                    Número *
                  </label>
                  <input
                    type="text"
                    value={form.numero}
                    onChange={e => setForm(p => ({ ...p, numero: e.target.value }))}
                    placeholder="123"
                    style={{
                      width: '100%',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 8,
                      padding: '10px',
                      color: '#e8eaed',
                      fontSize: 14,
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', color: '#9aa0a6', fontSize: 12, marginBottom: 4 }}>
                    Complemento
                  </label>
                  <input
                    type="text"
                    value={form.complemento}
                    onChange={e => setForm(p => ({ ...p, complemento: e.target.value }))}
                    placeholder="Apto 10, Bloco A..."
                    style={{
                      width: '100%',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 8,
                      padding: '10px',
                      color: '#e8eaed',
                      fontSize: 14,
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', color: '#9aa0a6', fontSize: 12, marginBottom: 4 }}>
                  Bairro *
                </label>
                <input
                  type="text"
                  value={form.bairro}
                  onChange={e => setForm(p => ({ ...p, bairro: e.target.value }))}
                  placeholder="Centro"
                  style={{
                    width: '100%',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    padding: '10px',
                    color: '#e8eaed',
                    fontSize: 14,
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ display: 'block', color: '#9aa0a6', fontSize: 12, marginBottom: 4 }}>
                    Cidade *
                  </label>
                  <input
                    type="text"
                    value={form.cidade}
                    onChange={e => setForm(p => ({ ...p, cidade: e.target.value }))}
                    placeholder="São Paulo"
                    style={{
                      width: '100%',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 8,
                      padding: '10px',
                      color: '#e8eaed',
                      fontSize: 14,
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', color: '#9aa0a6', fontSize: 12, marginBottom: 4 }}>
                    Estado *
                  </label>
                  <input
                    type="text"
                    value={form.estado}
                    onChange={e => setForm(p => ({ ...p, estado: e.target.value.toUpperCase() }))}
                    placeholder="SP"
                    maxLength={2}
                    style={{
                      width: '100%',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 8,
                      padding: '10px',
                      color: '#e8eaed',
                      fontSize: 14,
                      textTransform: 'uppercase',
                    }}
                  />
                </div>
              </div>

              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                marginTop: 8,
              }}>
                <input
                  type="checkbox"
                  checked={form.padrao}
                  onChange={e => setForm(p => ({ ...p, padrao: e.target.checked }))}
                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                />
                <span style={{ color: '#e8eaed', fontSize: 14 }}>
                  ⭐ Marcar como endereço padrão
                </span>
              </label>

              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button
                  onClick={() => setShowModal(false)}
                  style={{
                    flex: 1,
                    background: 'rgba(255,255,255,0.05)',
                    color: '#9aa0a6',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    padding: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSalvar}
                  style={{
                    flex: 1,
                    background: 'var(--p-blue)',
                    color: '#0f0f0f',
                    border: 'none',
                    borderRadius: 8,
                    padding: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {editando ? 'Salvar' : 'Adicionar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
