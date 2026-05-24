import { useState, useEffect } from 'react'
import AppShell from '../components/ui/AppShell'
import { useApp } from '../context/AppContext'
import { createTenantAndAdmin } from '../services/masterService'
import {
  getAllTenants, getTenantPages, saveTenantPages, ALL_PAGES,
  updateTenantInfo, deleteTenant,
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

function TenantRow({ t, onEdit, onDelete }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 12px', borderRadius: 8,
      background: 'var(--table-row)', marginBottom: 4,
      border: '1px solid var(--border-light)',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-body)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {t.nome_loja || '(sem nome)'}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
          {t.whatsapp ? `WhatsApp: ${t.whatsapp} · ` : ''}{t.tenant_id}
        </div>
      </div>
      <button onClick={() => onEdit(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--blue)', padding: '4px 6px', borderRadius: 4 }}
        title="Editar">
        <span className="material-icons" style={{ fontSize: 18 }}>edit</span>
      </button>
      <button onClick={() => onDelete(t.tenant_id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: '4px 6px', borderRadius: 4 }}
        title="Excluir">
        <span className="material-icons" style={{ fontSize: 18 }}>delete</span>
      </button>
    </div>
  )
}

function TenantEditRow({ t, onSave, onCancel, saving }) {
  const [form, setForm] = useState({ nome_loja: t.nome_loja || '', whatsapp: t.whatsapp || '' })
  const ch = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }))
  return (
    <div style={{
      padding: '12px', borderRadius: 8, marginBottom: 4,
      border: '1px solid var(--blue)', background: 'rgba(59,130,246,.06)',
    }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input name="nome_loja" value={form.nome_loja} onChange={ch} placeholder="Nome da empresa"
          style={{ ...SI, width: '100%' }} />
        <input name="whatsapp" value={form.whatsapp} onChange={ch} placeholder="WhatsApp"
          style={{ ...SI, width: 180, flexShrink: 0 }} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => onSave(t.tenant_id, form)} disabled={saving}
          className="btn-acao btn-blue" style={{ fontSize: 13, minHeight: 34, color: '#171717', fontWeight: 700 }}>
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
        <button onClick={onCancel} className="btn-acao"
          style={{ fontSize: 13, minHeight: 34, background: 'var(--border-light)', color: 'var(--text-body)' }}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

function ConfirmDelete({ tenantId, tenants, onConfirm, onCancel }) {
  const t = tenants.find(x => x.tenant_id === tenantId)
  return (
    <div style={{
      padding: '14px 16px', borderRadius: 8, marginBottom: 8,
      border: '1px solid var(--red)', background: 'rgba(239,68,68,.07)',
    }}>
      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--red)', marginBottom: 6 }}>
        Excluir "{t?.nome_loja || tenantId}"?
      </div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
        Esta ação é irreversível. Todos os dados da empresa (usuários, páginas) serão removidos.
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onConfirm} className="btn-acao"
          style={{ fontSize: 13, minHeight: 34, background: 'var(--red)', color: '#fff', fontWeight: 700 }}>
          Confirmar exclusão
        </button>
        <button onClick={onCancel} className="btn-acao"
          style={{ fontSize: 13, minHeight: 34, background: 'var(--border-light)', color: 'var(--text-body)' }}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

function AbaNova({ showToast }) {
  const [form, setForm]                 = useState(INITIAL_FORM)
  const [saving, setSaving]             = useState(false)
  const [created, setCreated]           = useState(null)
  const [requestError, setRequestError] = useState('')

  const [tenants, setTenants]     = useState([])
  const [filtro, setFiltro]       = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editSaving, setEditSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [deleting, setDeleting]   = useState(false)

  useEffect(() => { carregarTenants() }, [])

  async function carregarTenants() {
    const { data } = await getAllTenants()
    setTenants(data)
  }

  const handleChange = e => {
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
      carregarTenants()
    } catch (err) {
      const msg = err?.message || 'Erro ao criar empresa e administrador.'
      setRequestError(msg)
      showToast(msg, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function salvarEdicao(tenantId, fields) {
    setEditSaving(true)
    try {
      await updateTenantInfo(tenantId, fields)
      showToast('Empresa atualizada!', 'success')
      setEditingId(null)
      carregarTenants()
    } catch (err) {
      showToast('Erro: ' + err.message, 'error')
    } finally {
      setEditSaving(false)
    }
  }

  async function executarDelete() {
    setDeleting(true)
    try {
      await deleteTenant(deletingId)
      showToast('Empresa excluída.', 'success')
      setDeletingId(null)
      carregarTenants()
    } catch (err) {
      showToast('Erro ao excluir: ' + err.message, 'error')
    } finally {
      setDeleting(false)
    }
  }

  const filtrados = tenants.filter(t =>
    !filtro || (t.nome_loja || '').toLowerCase().includes(filtro.toLowerCase()) ||
    (t.whatsapp || '').includes(filtro)
  )

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

      {/* ── Empresas cadastradas ── */}
      <div style={{ marginTop: 32, borderTop: '1px solid var(--border-light)', paddingTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-body)' }}>Empresas cadastradas</h3>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{filtrados.length} de {tenants.length}</span>
        </div>

        <input
          type="text"
          placeholder="Filtrar por nome ou CNPJ…"
          value={filtro}
          onChange={e => setFiltro(e.target.value)}
          style={{ ...SI, marginBottom: 12 }}
        />

        {deletingId && (
          <ConfirmDelete
            tenantId={deletingId}
            tenants={tenants}
            onConfirm={executarDelete}
            onCancel={() => setDeletingId(null)}
          />
        )}

        {filtrados.length === 0 && (
          <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: 16 }}>
            {tenants.length === 0 ? 'Nenhuma empresa cadastrada.' : 'Nenhuma empresa encontrada.'}
          </div>
        )}

        {filtrados.map(t =>
          editingId === t.tenant_id ? (
            <TenantEditRow
              key={t.tenant_id}
              t={t}
              saving={editSaving}
              onSave={salvarEdicao}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <TenantRow
              key={t.tenant_id}
              t={t}
              onEdit={x => { setEditingId(x.tenant_id); setDeletingId(null) }}
              onDelete={id => { setDeletingId(id); setEditingId(null) }}
            />
          )
        )}
      </div>
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
