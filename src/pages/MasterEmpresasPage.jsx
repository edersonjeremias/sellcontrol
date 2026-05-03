import { useState, useEffect } from 'react'
import AppShell from '../components/ui/AppShell'
import { useApp } from '../context/AppContext'
import { createTenantAndAdmin } from '../services/masterService'
import {
  getAllTenants, getTenantPages, saveTenantPages, ALL_PAGES,
} from '../services/authService'

const SI = {
  background: 'var(--input-bg)', border: '1px solid var(--border-light)',
  color: 'var(--text-body)', borderRadius: 6, padding: '8px 10px',
  fontSize: 14, width: '100%', colorScheme: 'dark',
}

function TabBtn({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      background: 'none', border: 'none', cursor: 'pointer',
      padding: '10px 18px', fontSize: 14, fontWeight: 600,
      color: active ? 'var(--blue)' : 'var(--muted)',
      borderBottom: active ? '2px solid var(--blue)' : '2px solid transparent',
      transition: 'all 0.15s',
    }}>
      {label}
    </button>
  )
}

// ── Aba: Nova Empresa ──────────────────────────────────────────
const INITIAL_FORM = {
  empresaNome: '', empresaCnpj: '',
  adminNome: '', adminEmail: '', adminCpf: '', adminCelular: '', adminSenha: '',
}

function AbaNova({ showToast }) {
  const [form, setForm]               = useState(INITIAL_FORM)
  const [saving, setSaving]           = useState(false)
  const [created, setCreated]         = useState(null)
  const [requestError, setRequestError] = useState('')

  const getErrorMessage = (err) => {
    if (!err) return 'Erro ao criar empresa e administrador.'
    if (typeof err === 'string') return err
    if (err.message) return err.message
    return 'Erro ao criar empresa e administrador.'
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setCreated(null); setRequestError('')
    if (!form.empresaNome.trim() || !form.empresaCnpj.trim()) { showToast('Informe nome e CNPJ da empresa.', 'error'); return }
    if (!form.adminNome.trim() || !form.adminEmail.trim() || !form.adminCpf.trim() || !form.adminCelular.trim()) { showToast('Preencha todos os dados do administrador.', 'error'); return }
    if (form.adminSenha.length < 6) { showToast('A senha inicial deve ter no mínimo 6 caracteres.', 'error'); return }
    setSaving(true)
    try {
      const payload = {
        empresaNome: form.empresaNome.trim(), empresaCnpj: form.empresaCnpj.trim(),
        adminNome: form.adminNome.trim(), adminEmail: form.adminEmail.trim().toLowerCase(),
        adminCpf: form.adminCpf.trim(), adminCelular: form.adminCelular.trim(), adminSenha: form.adminSenha,
      }
      const { data, error } = await createTenantAndAdmin(payload)
      if (error) throw error
      if (!data?.ok) throw new Error(data?.message || 'Falha ao criar empresa e administrador.')
      setCreated({ tenantId: data.tenantId, adminEmail: payload.adminEmail })
      setForm(INITIAL_FORM)
      showToast('Empresa e administrador criados com sucesso.', 'success')
    } catch (err) {
      const msg = getErrorMessage(err)
      setRequestError(msg)
      showToast(msg, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-card">
      <h2>Novo cliente SaaS</h2>
      <p style={{ color: 'var(--muted)', marginTop: 6 }}>
        Somente o master pode cadastrar uma nova empresa e o administrador responsável.
      </p>
      <form className="login-form" onSubmit={handleSubmit} autoComplete="off">
        <label>Nome da empresa</label>
        <input name="empresaNome" type="text" value={form.empresaNome} onChange={handleChange} placeholder="Ex: VM Kids" autoComplete="off" />
        <label>CNPJ</label>
        <input name="empresaCnpj" type="text" value={form.empresaCnpj} onChange={handleChange} placeholder="00.000.000/0001-00" autoComplete="off" />
        <label>Nome completo do admin</label>
        <input name="adminNome" type="text" value={form.adminNome} onChange={handleChange} placeholder="Nome completo" autoComplete="off" />
        <label>E-mail do admin</label>
        <input name="adminEmail" type="text" value={form.adminEmail} onChange={handleChange} placeholder="admin@empresa.com" autoComplete="off" />
        <label>CPF do admin</label>
        <input name="adminCpf" type="text" value={form.adminCpf} onChange={handleChange} placeholder="000.000.000-00" autoComplete="off" />
        <label>Celular do admin</label>
        <input name="adminCelular" type="text" value={form.adminCelular} onChange={handleChange} placeholder="(00) 90000-0000" autoComplete="off" />
        <label>Senha inicial do admin</label>
        <input name="adminSenha" type="password" value={form.adminSenha} onChange={handleChange} placeholder="Mínimo 6 caracteres" autoComplete="new-password" />
        <button type="submit" className="btn-acao btn-blue" disabled={saving}>
          {saving ? 'Criando empresa...' : 'Criar empresa + admin'}
        </button>
      </form>
      {created && (
        <div style={{ marginTop: 16, color: 'var(--green)', padding: '10px 12px', borderRadius: 10, background: 'rgba(74,222,128,.12)', fontWeight: 600 }}>
          Cadastro concluído. Tenant: {created.tenantId}. Admin: {created.adminEmail}.
        </div>
      )}
      {requestError && (
        <div style={{ marginTop: 16, color: 'var(--red)', padding: '10px 12px', borderRadius: 10, background: 'rgba(242,139,130,.12)', fontWeight: 600 }}>
          {requestError}
        </div>
      )}
    </div>
  )
}

// ── Aba: Páginas por Empresa ────────────────────────────────────
const BY_CATEGORY = ALL_PAGES.reduce((acc, p) => {
  if (!acc[p.category]) acc[p.category] = []
  acc[p.category].push(p)
  return acc
}, {})

function AbaPaginas({ showToast }) {
  const [tenants,   setTenants]   = useState([])
  const [tenantId,  setTenantId]  = useState('')
  const [selected,  setSelected]  = useState({})
  const [loading,   setLoading]   = useState(false)
  const [saving,    setSaving]    = useState(false)

  useEffect(() => {
    getAllTenants().then(({ data }) => setTenants(data))
  }, [])

  useEffect(() => {
    setSelected({})
    if (!tenantId) return
    setLoading(true)
    getTenantPages(tenantId).then(({ data }) => {
      const slugs = new Set((data || []).map(p => p.slug))
      const sel = {}
      ALL_PAGES.forEach(p => { sel[p.slug] = slugs.has(p.slug) })
      setSelected(sel)
      setLoading(false)
    })
  }, [tenantId])

  async function salvar() {
    setSaving(true)
    try {
      const slugs = Object.entries(selected).filter(([, v]) => v).map(([k]) => k)
      await saveTenantPages(tenantId, slugs)
      showToast('Páginas da empresa salvas!')
    } catch (e) {
      showToast('Erro: ' + e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const toggle = (slug) => setSelected(prev => ({ ...prev, [slug]: !prev[slug] }))

  return (
    <div style={{ padding: '20px 0', maxWidth: 520 }}>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
        Selecione a empresa e marque quais páginas ela poderá usar. O admin da empresa poderá atribuir essas páginas aos seus usuários.
      </p>

      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Empresa</label>
        <select value={tenantId} onChange={e => setTenantId(e.target.value)} style={SI}>
          <option value="">-- Selecione uma empresa --</option>
          {tenants.map(t => (
            <option key={t.tenant_id} value={t.tenant_id}>
              {t.nome_loja || t.tenant_id}
            </option>
          ))}
        </select>
      </div>

      {tenantId && loading && (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>Carregando páginas...</div>
      )}

      {tenantId && !loading && (
        <>
          {Object.entries(BY_CATEGORY).map(([cat, pages]) => (
            <div key={cat} style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid var(--border-light)' }}>
                {cat}
              </div>
              {pages.map(p => (
                <label key={p.slug} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', borderRadius: 6, cursor: 'pointer', marginBottom: 2 }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--table-row-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <input type="checkbox" checked={!!selected[p.slug]} onChange={() => toggle(p.slug)}
                    style={{ accentColor: 'var(--blue)', width: 16, height: 16, cursor: 'pointer' }} />
                  <span style={{ fontSize: 14, color: 'var(--text-body)' }}>{p.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>/{p.slug}</span>
                </label>
              ))}
            </div>
          ))}

          <button className="btn-acao btn-blue" onClick={salvar} disabled={saving}
            style={{ width: '100%', minHeight: 42, fontSize: 14, color: '#171717', fontWeight: 700, marginTop: 8 }}>
            {saving ? 'Salvando…' : 'Salvar Páginas da Empresa'}
          </button>
        </>
      )}
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────
export default function MasterEmpresasPage() {
  const { showToast } = useApp()
  const [aba, setAba] = useState('nova')

  return (
    <AppShell title="Master — Empresas">
      <section className="admin-panel">
        <div style={{ borderBottom: '1px solid var(--border-header)', marginBottom: 4 }}>
          <TabBtn label="Nova Empresa"        active={aba === 'nova'}    onClick={() => setAba('nova')} />
          <TabBtn label="Páginas por Empresa" active={aba === 'paginas'} onClick={() => setAba('paginas')} />
        </div>
        {aba === 'nova'    && <AbaNova    showToast={showToast} />}
        {aba === 'paginas' && <AbaPaginas showToast={showToast} />}
      </section>
    </AppShell>
  )
}
