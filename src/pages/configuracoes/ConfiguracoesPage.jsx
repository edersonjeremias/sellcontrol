import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import AppShell from '../../components/ui/AppShell'
import {
  getConfig, saveConfig, invalidateMpTokenCache,
  getUsuarios, updateUsuarioRole, ROLES,
} from '../../services/configService'
import {
  getTenantPages, getUserPageIds, saveUserPageAccess,
} from '../../services/authService'
import ConfigAssuntos from './ConfigAssuntos'

const SI = {
  background: 'var(--input-bg)', border: '1px solid var(--border-light)',
  color: 'var(--text-body)', borderRadius: 6, padding: '8px 10px',
  fontSize: 14, width: '100%', colorScheme: 'dark',
}

function TabBtn({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        padding: '10px 18px', fontSize: 14, fontWeight: 600,
        color: active ? 'var(--blue)' : 'var(--muted)',
        borderBottom: active ? '2px solid var(--blue)' : '2px solid transparent',
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  )
}

// ── Aba: Configurações da empresa ──────────────────────────────
function AbaConfiguracoes({ tenantId, showToast }) {
  const [form, setForm]         = useState({ mp_access_token: '', nome_loja: '', whatsapp: '', email_contato: '', link_frete: '' })
  const [salvando, setSalvando] = useState(false)
  const [mostrarToken, setMostrarToken] = useState(false)
  const [pacotes, setPacotes]   = useState([])
  const [novoPacote, setNovoPacote] = useState('')
  const [salvandoPacote, setSalvandoPacote] = useState(false)

  useEffect(() => {
    if (!tenantId) return
    getConfig(tenantId).then(cfg => {
      if (cfg) {
        setForm({
          mp_access_token: cfg.mp_access_token || '',
          nome_loja: cfg.nome_loja || '',
          whatsapp: cfg.whatsapp || '',
          email_contato: cfg.email_contato || '',
          link_frete: cfg.link_frete || '',
        })
        setPacotes(cfg.pacotes || [])
      }
    })
  }, [tenantId])

  async function salvarPacotes(lista) {
    setSalvandoPacote(true)
    try {
      await saveConfig(tenantId, { pacotes: lista })
    } catch (e) {
      showToast('Erro ao salvar embalagem: ' + e.message, 'error')
    } finally {
      setSalvandoPacote(false)
    }
  }

  function addPacote() {
    const nome = novoPacote.trim()
    if (!nome || pacotes.includes(nome)) return
    const nova = [...pacotes, nome]
    setPacotes(nova)
    setNovoPacote('')
    salvarPacotes(nova)
  }

  function removePacote(idx) {
    const nova = pacotes.filter((_, i) => i !== idx)
    setPacotes(nova)
    salvarPacotes(nova)
  }

  function moverPacote(idx, dir) {
    const nova = [...pacotes]
    const troca = idx + dir
    if (troca < 0 || troca >= nova.length) return
    ;[nova[idx], nova[troca]] = [nova[troca], nova[idx]]
    setPacotes(nova)
    salvarPacotes(nova)
  }

  async function salvar() {
    setSalvando(true)
    try {
      await saveConfig(tenantId, form)
      invalidateMpTokenCache()
      showToast('Configurações salvas!')
    } catch (e) {
      showToast('Erro ao salvar: ' + e.message, 'error')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div style={{ maxWidth: 520, padding: '24px 0' }}>

      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Nome da Loja</label>
        <input
          type="text"
          value={form.nome_loja}
          onChange={e => setForm(p => ({ ...p, nome_loja: e.target.value }))}
          placeholder="Ex: VM Kids"
          style={SI}
        />
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>WhatsApp da Loja</label>
        <input
          type="tel"
          value={form.whatsapp}
          onChange={e => setForm(p => ({ ...p, whatsapp: e.target.value }))}
          placeholder="11999999999"
          style={SI}
        />
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>E-mail de contato</label>
        <input
          type="email"
          value={form.email_contato}
          onChange={e => setForm(p => ({ ...p, email_contato: e.target.value }))}
          placeholder="contato@suaempresa.com"
          style={SI}
        />
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Link de Pagamento do Frete (para Produção)</label>
        <input
          type="url"
          value={form.link_frete}
          onChange={e => setForm(p => ({ ...p, link_frete: e.target.value }))}
          placeholder="https://linknabio.gg/suaempresa"
          style={SI}
        />
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
          Este link é enviado automaticamente na mensagem de cobrança do frete via WhatsApp na página de Produção.
        </div>
      </div>

      {/* ── Embalagens ── */}
      <div style={{ marginBottom: 28 }}>
        <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 8, fontWeight: 600 }}>
          📦 Tipos de Embalagem (Produção)
        </label>

        {/* Lista existente */}
        <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {pacotes.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
              Nenhuma embalagem cadastrada. Adicione abaixo.
            </div>
          )}
          {pacotes.map((p, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--card-bg)', border: '1px solid var(--border-light)',
              borderRadius: 6, padding: '6px 10px',
            }}>
              <span style={{ flex: 1, fontSize: 13, color: 'var(--text-body)' }}>{p}</span>
              <button onClick={() => moverPacote(i, -1)} disabled={i === 0 || salvandoPacote}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 13, padding: '0 4px' }}>▲</button>
              <button onClick={() => moverPacote(i, 1)} disabled={i === pacotes.length - 1 || salvandoPacote}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 13, padding: '0 4px' }}>▼</button>
              <button onClick={() => removePacote(i)} disabled={salvandoPacote}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f28b82', fontSize: 14, padding: '0 4px', lineHeight: 1 }}>✕</button>
            </div>
          ))}
        </div>

        {/* Adicionar nova embalagem */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={novoPacote}
            onChange={e => setNovoPacote(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addPacote()}
            placeholder="Ex: CP 40x20x20"
            style={{ ...SI, flex: 1 }}
          />
          <button
            className="btn-acao btn-green"
            onClick={addPacote}
            disabled={salvandoPacote || !novoPacote.trim()}
            style={{ whiteSpace: 'nowrap', padding: '0 16px', fontSize: 13, color: '#171717', fontWeight: 700 }}
          >
            {salvandoPacote ? '…' : '+ Adicionar'}
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
          Estas opções aparecem no campo Pacote da página de Produção.
        </div>
      </div>

      <div style={{ marginBottom: 28 }}>
        <label style={{ fontSize: 12, color: 'var(--yellow)', display: 'block', marginBottom: 4, fontWeight: 600 }}>
          🔑 Token Mercado Pago (Access Token de Produção)
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type={mostrarToken ? 'text' : 'password'}
            value={form.mp_access_token}
            onChange={e => setForm(p => ({ ...p, mp_access_token: e.target.value }))}
            placeholder="APP_USR-..."
            style={{ ...SI, flex: 1, fontFamily: 'monospace', fontSize: 12 }}
          />
          <button
            onClick={() => setMostrarToken(v => !v)}
            style={{ background: 'var(--input-bg)', border: '1px solid var(--border-light)', borderRadius: 6, padding: '0 12px', cursor: 'pointer', color: 'var(--muted)', fontSize: 13 }}
          >
            {mostrarToken ? '🙈' : '👁️'}
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5 }}>
          Encontre em mercadopago.com.br → Seu negócio → Configurações → Credenciais de produção
        </div>
      </div>

      <button
        className="btn-acao btn-blue"
        style={{ width: '100%', minHeight: 46, fontSize: 15, color: '#171717', fontWeight: 700 }}
        onClick={salvar}
        disabled={salvando}
      >
        {salvando ? 'Salvando…' : 'Salvar Configurações'}
      </button>
    </div>
  )
}

// ── Aba: Usuários ──────────────────────────────────────────────
function AbaUsuarios({ tenantId, profileAtual, showToast }) {
  const [usuarios,     setUsuarios]     = useState([])
  const [salvando,     setSalvando]     = useState(null)
  const [showForm,     setShowForm]     = useState(false)
  const [criando,      setCriando]      = useState(false)
  const [form,         setForm]         = useState({ nome: '', username: '', email: '', password: '', role: 'vendedor' })
  const [formPageIds,  setFormPageIds]  = useState([])   // páginas selecionadas no formulário de criação
  const [tenantPages,  setTenantPages]  = useState([])   // páginas disponíveis na empresa
  const [paginasOpen,  setPaginasOpen]  = useState(null) // userId com painel de páginas aberto
  const [userPageIds,  setUserPageIds]  = useState([])
  const [salvandoPag,  setSalvandoPag]  = useState(false)

  useEffect(() => {
    if (!tenantId) return
    getUsuarios(tenantId).then(setUsuarios)
    getTenantPages(tenantId).then(({ data }) => setTenantPages(data || []))
  }, [tenantId])

  async function mudarRole(userId, novoRole) {
    if (userId === profileAtual?.id && novoRole !== 'admin') {
      showToast('Você não pode rebaixar a si mesmo.', 'error'); return
    }
    setSalvando(userId)
    try {
      await updateUsuarioRole(userId, novoRole)
      setUsuarios(prev => prev.map(u => u.id === userId ? { ...u, role: novoRole } : u))
      showToast('Permissão atualizada!')
    } catch (e) {
      showToast('Erro: ' + e.message, 'error')
    } finally {
      setSalvando(null)
    }
  }

  async function abrirPaginas(userId) {
    if (paginasOpen === userId) { setPaginasOpen(null); return }
    const { data } = await getUserPageIds(userId)
    setUserPageIds(data || [])
    setPaginasOpen(userId)
  }

  function togglePagina(pageId) {
    setUserPageIds(prev =>
      prev.includes(pageId) ? prev.filter(id => id !== pageId) : [...prev, pageId]
    )
  }

  async function salvarPaginas(userId) {
    setSalvandoPag(true)
    try {
      await saveUserPageAccess(userId, tenantId, userPageIds)
      showToast('Páginas do usuário salvas!')
      setPaginasOpen(null)
    } catch (e) {
      showToast('Erro: ' + e.message, 'error')
    } finally {
      setSalvandoPag(false)
    }
  }

  async function criarUsuario() {
    if (!form.nome || !form.username || !form.password) {
      showToast('Preencha nome, username e senha', 'error'); return
    }
    if (form.password.length < 6) {
      showToast('Senha deve ter no mínimo 6 caracteres', 'error'); return
    }
    setCriando(true)
    try {
      // Gera email fictício se não fornecido
      const emailFinal = form.email?.trim() || `${form.username}@vmkids.local`

      const resp = await fetch('/api/criar-usuario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: form.nome,
          username: form.username,
          email: emailFinal,
          password: form.password,
          role: form.role,
          tenant_id: tenantId
        }),
      })
      const json = await resp.json()
      if (!resp.ok) throw new Error(json.error || 'Erro ao criar usuário')

      // Salva as páginas selecionadas para o novo usuário
      if (formPageIds.length > 0) {
        try {
          await saveUserPageAccess(json.userId, tenantId, formPageIds)
        } catch (e) {
          console.error('Erro ao salvar páginas do usuário:', e)
        }
      }

      setUsuarios(prev => [...prev, {
        id: json.userId,
        nome: form.nome,
        username: form.username,
        email: emailFinal,
        role: form.role
      }])
      setForm({ nome: '', username: '', email: '', password: '', role: 'vendedor' })
      setFormPageIds([])
      setShowForm(false)
      showToast(`Usuário ${form.nome} (${form.username}) criado com sucesso!`)
    } catch (e) {
      showToast('Erro: ' + e.message, 'error')
    } finally {
      setCriando(false)
    }
  }

  return (
    <div style={{ padding: '20px 0' }}>

      {/* Legenda de funções */}
      <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, fontSize: 13, color: 'var(--muted)' }}>
        <strong style={{ color: 'var(--blue)' }}>Funções disponíveis:</strong>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px', marginTop: 6 }}>
          {ROLES.map(r => (
            <span key={r.value}><strong style={{ color: 'var(--text-body)' }}>{r.label}</strong> — {r.desc}</span>
          ))}
        </div>
      </div>

      {/* Botão novo usuário */}
      <button
        className="btn-acao btn-blue"
        style={{ marginBottom: 16, padding: '0 18px', height: 36, fontSize: 13, color: '#171717', fontWeight: 600 }}
        onClick={() => setShowForm(v => !v)}
      >
        {showForm ? '✕ Cancelar' : '+ Novo Usuário'}
      </button>

      {/* Formulário de criação */}
      {showForm && (
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-light)', borderRadius: 8, padding: '16px', marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Nome *</label>
              <input type="text" value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} placeholder="Ex: Ana Paula" style={SI} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Username * (para login)</label>
              <input
                type="text"
                value={form.username}
                onChange={e => setForm(p => ({ ...p, username: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '') }))}
                placeholder="Ex: vendedor1"
                style={SI}
              />
              {form.username && (
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                  Email gerado: {form.username}@vmkids.local
                </div>
              )}
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>E-mail (opcional)</label>
              <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="" style={SI} />
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                Deixe vazio para gerar automaticamente
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Senha * (mín. 6 caracteres)</label>
              <input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder="••••••" style={SI} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Função</label>
              <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} style={{ ...SI, height: 36, padding: '0 8px' }}>
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>)}
              </select>
            </div>
          </div>

          {/* Seleção de páginas */}
          <div style={{ marginTop: 12, marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 8, fontWeight: 600 }}>
              Páginas que o usuário poderá acessar:
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '6px 12px' }}>
              {tenantPages.map(p => (
                <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={formPageIds.includes(p.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormPageIds(prev => [...prev, p.id])
                      } else {
                        setFormPageIds(prev => prev.filter(id => id !== p.id))
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ color: 'var(--text-body)' }}>{p.nome}</span>
                </label>
              ))}
            </div>
            {formPageIds.length === 0 && (
              <div style={{ fontSize: 11, color: 'var(--yellow)', marginTop: 6 }}>
                ⚠️ Nenhuma página selecionada - usuário não terá acesso a nada
              </div>
            )}
          </div>

          <button className="btn-acao btn-green"
            style={{ width: '100%', minHeight: 40, fontSize: 14, color: '#171717', fontWeight: 700 }}
            onClick={criarUsuario} disabled={criando}>
            {criando ? 'Criando…' : 'Criar Usuário'}
          </button>
        </div>
      )}

      {/* Lista de usuários */}
      {usuarios.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 30 }}>Nenhum usuário encontrado</div>
      )}

      {usuarios.map(u => {
        const isMaster = u.role === 'master'
        const isOpen   = paginasOpen === u.id
        return (
          <div key={u.id} style={{ marginBottom: 8 }}>
            {/* Linha do usuário */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'var(--card-bg)', borderRadius: isOpen ? '8px 8px 0 0' : 8,
              padding: '10px 14px',
              border: u.id === profileAtual?.id ? '1px solid rgba(59,130,246,0.3)' : '1px solid var(--border-light)',
              borderBottom: isOpen ? 'none' : undefined,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {u.nome || u.username || u.email}
                  {u.id === profileAtual?.id && <span style={{ fontSize: 11, color: 'var(--blue)', marginLeft: 8 }}>(você)</span>}
                </div>
                {u.username && <div style={{ fontSize: 12, color: 'var(--green)' }}>@{u.username}</div>}
                {u.email && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{u.email}</div>}
              </div>

              {/* Role: badge para master, select para os demais */}
              {isMaster ? (
                <span style={{
                  padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                  background: 'rgba(197,138,249,.15)', color: 'var(--purple)',
                  border: '1px solid rgba(197,138,249,.3)',
                }}>Master</span>
              ) : (
                <select
                  value={u.role || 'admin'}
                  onChange={e => mudarRole(u.id, e.target.value)}
                  disabled={salvando === u.id}
                  style={{ ...SI, width: 130, height: 34, padding: '0 8px', fontSize: 13 }}
                >
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              )}

              {/* Botão páginas — apenas para não-master */}
              {!isMaster && (
                <button
                  onClick={() => abrirPaginas(u.id)}
                  style={{
                    height: 34, padding: '0 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                    border: '1px solid var(--border-light)', background: isOpen ? 'rgba(138,180,248,.15)' : 'transparent',
                    color: isOpen ? 'var(--blue)' : 'var(--muted)', cursor: 'pointer', whiteSpace: 'nowrap',
                  }}>
                  Páginas {isOpen ? '▲' : '▼'}
                </button>
              )}

              {salvando === u.id && <span style={{ fontSize: 12, color: 'var(--muted)' }}>…</span>}
            </div>

            {/* Painel de páginas */}
            {isOpen && (
              <div style={{
                background: 'var(--card-bg)', border: '1px solid var(--border-light)',
                borderTop: '1px solid rgba(138,180,248,.2)',
                borderRadius: '0 0 8px 8px', padding: '14px 14px 12px',
              }}>
                {tenantPages.length === 0 ? (
                  <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
                    Esta empresa ainda não tem páginas configuradas. Acesse <strong>Master → Empresas → Páginas por Empresa</strong> para configurar.
                  </p>
                ) : (
                  <>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
                      Marque as páginas que <strong style={{ color: 'var(--text-body)' }}>{u.nome}</strong> poderá acessar:
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 6, marginBottom: 12 }}>
                      {tenantPages.map(p => (
                        <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '5px 6px', borderRadius: 5 }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--table-row-hover)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <input type="checkbox"
                            checked={userPageIds.includes(p.id)}
                            onChange={() => togglePagina(p.id)}
                            style={{ accentColor: 'var(--blue)', width: 15, height: 15, cursor: 'pointer' }} />
                          <span style={{ fontSize: 13, color: 'var(--text-body)' }}>{p.label}</span>
                        </label>
                      ))}
                    </div>
                    <button className="btn-acao btn-blue"
                      onClick={() => salvarPaginas(u.id)} disabled={salvandoPag}
                      style={{ height: 34, padding: '0 18px', fontSize: 13, color: '#171717', fontWeight: 700 }}>
                      {salvandoPag ? 'Salvando…' : 'Salvar Páginas'}
                    </button>
                    <button onClick={() => setPaginasOpen(null)}
                      style={{ marginLeft: 8, height: 34, padding: '0 14px', borderRadius: 6, border: '1px solid var(--border-light)', background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }}>
                      Cancelar
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────
export default function ConfiguracoesPage() {
  const { profile }   = useAuth()
  const { showToast } = useApp()
  const [aba, setAba] = useState('config')

  const tenantId = profile?.tenant_id

  return (
    <AppShell title="Configurações">
      <div style={{ padding: '0 16px', maxWidth: 640 }}>

        <div style={{ borderBottom: '1px solid var(--border-header)', marginBottom: 4 }}>
          <TabBtn label="Configurações da Empresa" active={aba === 'config'} onClick={() => setAba('config')} />
          {['admin', 'master'].includes(profile?.role) && (
            <>
              <TabBtn label="Usuários e Permissões" active={aba === 'usuarios'} onClick={() => setAba('usuarios')} />
              <TabBtn label="Assuntos" active={aba === 'assuntos'} onClick={() => setAba('assuntos')} />
            </>
          )}
        </div>

        {aba === 'config' && (
          <AbaConfiguracoes tenantId={tenantId} showToast={showToast} />
        )}
        {aba === 'usuarios' && (
          <AbaUsuarios tenantId={tenantId} profileAtual={profile} showToast={showToast} />
        )}
        {aba === 'assuntos' && (
          <ConfigAssuntos />
        )}
      </div>
    </AppShell>
  )
}
