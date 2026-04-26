import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import AppShell from '../../components/ui/AppShell'
import {
  getConfig, saveConfig, invalidateMpTokenCache,
  getUsuarios, updateUsuarioRole, ROLES,
} from '../../services/configService'

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
  const [usuarios, setUsuarios]     = useState([])
  const [salvando, setSalvando]     = useState(null)
  const [showForm, setShowForm]     = useState(false)
  const [criando, setCriando]       = useState(false)
  const [form, setForm]             = useState({ nome: '', email: '', password: '', role: 'vendedor' })

  useEffect(() => {
    if (!tenantId) return
    getUsuarios(tenantId).then(setUsuarios)
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

  async function criarUsuario() {
    if (!form.nome || !form.email || !form.password) {
      showToast('Preencha nome, e-mail e senha', 'error'); return
    }
    setCriando(true)
    try {
      const resp = await fetch('/api/criar-usuario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, tenant_id: tenantId }),
      })
      const json = await resp.json()
      if (!resp.ok) throw new Error(json.error || 'Erro ao criar usuário')
      setUsuarios(prev => [...prev, { id: json.userId, nome: form.nome, email: form.email, role: form.role }])
      setForm({ nome: '', email: '', password: '', role: 'vendedor' })
      setShowForm(false)
      showToast(`Usuário ${form.nome} criado com sucesso!`)
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
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>E-mail *</label>
              <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="ana@email.com" style={SI} />
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
          <button
            className="btn-acao btn-green"
            style={{ width: '100%', minHeight: 40, fontSize: 14, color: '#171717', fontWeight: 700 }}
            onClick={criarUsuario}
            disabled={criando}
          >
            {criando ? 'Criando…' : 'Criar Usuário'}
          </button>
        </div>
      )}

      {/* Lista de usuários */}
      {usuarios.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 30 }}>Nenhum usuário encontrado</div>
      )}

      {usuarios.map(u => (
        <div
          key={u.id}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: 'var(--card-bg)', borderRadius: 8,
            padding: '10px 14px', marginBottom: 8,
            border: u.id === profileAtual?.id ? '1px solid rgba(59,130,246,0.3)' : '1px solid var(--border-light)',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {u.nome || u.email}
              {u.id === profileAtual?.id && <span style={{ fontSize: 11, color: 'var(--blue)', marginLeft: 8 }}>(você)</span>}
            </div>
            {u.email && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{u.email}</div>}
          </div>
          <select
            value={u.role || 'admin'}
            onChange={e => mudarRole(u.id, e.target.value)}
            disabled={salvando === u.id}
            style={{ ...SI, width: 130, height: 34, padding: '0 8px', fontSize: 13 }}
          >
            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          {salvando === u.id && <span style={{ fontSize: 12, color: 'var(--muted)' }}>…</span>}
        </div>
      ))}
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
            <TabBtn label="Usuários e Permissões" active={aba === 'usuarios'} onClick={() => setAba('usuarios')} />
          )}
        </div>

        {aba === 'config' && (
          <AbaConfiguracoes tenantId={tenantId} showToast={showToast} />
        )}
        {aba === 'usuarios' && (
          <AbaUsuarios tenantId={tenantId} profileAtual={profile} showToast={showToast} />
        )}
      </div>
    </AppShell>
  )
}
