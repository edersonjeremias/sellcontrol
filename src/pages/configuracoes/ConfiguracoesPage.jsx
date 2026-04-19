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
  const [form, setForm]       = useState({ mp_access_token: '', nome_loja: '', whatsapp: '', email_contato: '' })
  const [salvando, setSalvando] = useState(false)
  const [mostrarToken, setMostrarToken] = useState(false)

  useEffect(() => {
    if (!tenantId) return
    getConfig(tenantId).then(cfg => {
      if (cfg) setForm({ mp_access_token: cfg.mp_access_token || '', nome_loja: cfg.nome_loja || '', whatsapp: cfg.whatsapp || '', email_contato: cfg.email_contato || '' })
    })
  }, [tenantId])

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
  const [usuarios, setUsuarios] = useState([])
  const [salvando, setSalvando] = useState(null)

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

  const roleInfo = Object.fromEntries(ROLES.map(r => [r.value, r]))

  return (
    <div style={{ padding: '20px 0' }}>

      <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, fontSize: 13, color: 'var(--muted)' }}>
        <strong style={{ color: 'var(--blue)' }}>Funções disponíveis:</strong>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px', marginTop: 6 }}>
          {ROLES.map(r => (
            <span key={r.value}><strong style={{ color: 'var(--text-body)' }}>{r.label}</strong> — {r.desc}</span>
          ))}
        </div>
      </div>

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
            {u.nome && u.email && (
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{u.email}</div>
            )}
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
