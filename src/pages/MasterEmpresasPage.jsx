import { useState, useEffect, useRef } from 'react'
import AppShell from '../components/ui/AppShell'
import { useApp } from '../context/AppContext'
import { createTenantAndAdmin } from '../services/masterService'
import { getConfig } from '../services/configService'
import {
  getAllTenants, getTenantPages, saveTenantPages, ALL_PAGES,
  updateTenantInfo, deleteTenant,
} from '../services/authService'

const SI = {
  background: 'var(--input-bg)', border: '1px solid var(--border-light)',
  color: 'var(--text-body)', borderRadius: 6, padding: '8px 10px',
  fontSize: 14, width: '100%', colorScheme: 'dark',
}

const LBL = { fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4, marginTop: 12 }

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

const EMPTY_EDIT = { nome_loja: '', whatsapp: '', email_contato: '', link_frete: '' }

function AbaNova({ showToast }) {
  // --- Criação ---
  const [form, setForm]                 = useState(INITIAL_FORM)
  const [saving, setSaving]             = useState(false)
  const [created, setCreated]           = useState(null)
  const [requestError, setRequestError] = useState('')

  // --- Edição/exclusão ---
  const [tenants, setTenants]           = useState([])
  const [busca, setBusca]               = useState('')
  const [dropOpen, setDropOpen]         = useState(false)
  const [selected, setSelected]         = useState(null)   // tenant selecionado
  const [editForm, setEditForm]         = useState(EMPTY_EDIT)
  const [loadingEdit, setLoadingEdit]   = useState(false)
  const [editSaving, setEditSaving]     = useState(false)
  const [confirmDel, setConfirmDel]     = useState(false)
  const [deleting, setDeleting]         = useState(false)
  const buscaRef = useRef(null)

  useEffect(() => { carregarTenants() }, [])

  async function carregarTenants() {
    const { data } = await getAllTenants()
    setTenants(data)
  }

  async function selecionarEmpresa(t) {
    setSelected(t)
    setBusca(t.nome_loja || t.tenant_id)
    setDropOpen(false)
    setConfirmDel(false)
    setLoadingEdit(true)
    try {
      const cfg = await getConfig(t.tenant_id)
      setEditForm({
        nome_loja:     cfg?.nome_loja     || '',
        whatsapp:      cfg?.whatsapp      || '',
        email_contato: cfg?.email_contato || '',
        link_frete:    cfg?.link_frete    || '',
      })
    } finally {
      setLoadingEdit(false)
    }
  }

  function limparSelecao() {
    setSelected(null)
    setBusca('')
    setEditForm(EMPTY_EDIT)
    setConfirmDel(false)
  }

  const filtrados = tenants.filter(t =>
    !busca || (t.nome_loja || '').toLowerCase().includes(busca.toLowerCase())
  )

  // Criação
  const handleChange = e => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setCreated(null); setRequestError('')
    if (!form.empresaNome.trim() || !form.empresaCnpj.trim()) { showToast('Informe nome e CNPJ.', 'error'); return }
    if (!form.adminNome.trim() || !form.adminEmail.trim() || !form.adminCpf.trim() || !form.adminCelular.trim()) { showToast('Preencha todos os dados do admin.', 'error'); return }
    if (form.adminSenha.length < 6) { showToast('Senha mínima de 6 caracteres.', 'error'); return }
    setSaving(true)
    try {
      const payload = {
        empresaNome: form.empresaNome.trim(), empresaCnpj: form.empresaCnpj.trim(),
        adminNome: form.adminNome.trim(), adminEmail: form.adminEmail.trim().toLowerCase(),
        adminCpf: form.adminCpf.trim(), adminCelular: form.adminCelular.trim(), adminSenha: form.adminSenha,
      }
      const { data, error } = await createTenantAndAdmin(payload)
      if (error) throw error
      if (!data?.ok) throw new Error(data?.message || 'Falha ao criar.')
      setCreated({ tenantId: data.tenantId, adminEmail: payload.adminEmail })
      setForm(INITIAL_FORM)
      showToast('Empresa e admin criados!', 'success')
      carregarTenants()
    } catch (err) {
      const msg = err?.message || 'Erro ao criar.'
      setRequestError(msg)
      showToast(msg, 'error')
    } finally {
      setSaving(false)
    }
  }

  // Salvar edição
  async function salvarEdicao() {
    setEditSaving(true)
    try {
      await updateTenantInfo(selected.tenant_id, editForm)
      showToast('Empresa salva!', 'success')
      carregarTenants()
      limparSelecao()
    } catch (err) {
      showToast('Erro: ' + err.message, 'error')
    } finally {
      setEditSaving(false)
    }
  }

  // Excluir
  async function executarDelete() {
    setDeleting(true)
    try {
      await deleteTenant(selected.tenant_id)
      showToast('Empresa excluída.', 'success')
      limparSelecao()
      carregarTenants()
    } catch (err) {
      showToast('Erro ao excluir: ' + err.message, 'error')
    } finally {
      setDeleting(false)
      setConfirmDel(false)
    }
  }

  const ec = e => setEditForm(p => ({ ...p, [e.target.name]: e.target.value }))

  return (
    <div className="admin-card">

      {/* ══ Criar nova empresa ══ */}
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
          {saving ? 'Criando…' : 'Criar empresa + admin'}
        </button>
      </form>

      {created && (
        <div style={{ marginTop: 12, color: 'var(--green)', padding: '10px 12px', borderRadius: 8, background: 'rgba(74,222,128,.12)', fontWeight: 600 }}>
          Cadastro concluído. Tenant: {created.tenantId} · Admin: {created.adminEmail}
        </div>
      )}
      {requestError && (
        <div style={{ marginTop: 12, color: 'var(--red)', padding: '10px 12px', borderRadius: 8, background: 'rgba(242,139,130,.12)', fontWeight: 600 }}>
          {requestError}
        </div>
      )}

      {/* ══ Editar / Excluir empresa ══ */}
      <div style={{ marginTop: 36, paddingTop: 24, borderTop: '1px solid var(--border-light)' }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-body)', marginBottom: 4 }}>
          Editar ou excluir empresa
        </h3>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
          Busque a empresa pelo nome para carregar e editar os dados.
        </p>

        {/* Busca com dropdown */}
        <div style={{ position: 'relative' }} ref={buscaRef}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              placeholder="Digite o nome da empresa…"
              value={busca}
              onChange={e => { setBusca(e.target.value); setDropOpen(true); if (selected) setSelected(null) }}
              onFocus={() => setDropOpen(true)}
              style={{ ...SI }}
            />
            {selected && (
              <button onClick={limparSelecao} title="Limpar seleção"
                style={{ background: 'var(--border-light)', border: 'none', borderRadius: 6, padding: '0 10px', cursor: 'pointer', color: 'var(--muted)', fontSize: 18, lineHeight: 1 }}>
                ✕
              </button>
            )}
          </div>

          {dropOpen && !selected && filtrados.length > 0 && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
              background: 'var(--input-bg)', border: '1px solid var(--border-light)',
              borderRadius: 8, zIndex: 20, boxShadow: '0 6px 24px rgba(0,0,0,.5)',
              maxHeight: 220, overflowY: 'auto',
            }}>
              {filtrados.map(t => (
                <button key={t.tenant_id}
                  onClick={() => selecionarEmpresa(t)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    width: '100%', textAlign: 'left', padding: '10px 14px',
                    background: 'none', border: 'none', color: 'var(--text-body)',
                    cursor: 'pointer', fontSize: 14, borderBottom: '1px solid var(--border-light)',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--table-row-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  <span style={{ fontWeight: 600 }}>{t.nome_loja || '(sem nome)'}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{t.tenant_id.slice(0, 8)}…</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Formulário de edição */}
        {loadingEdit && (
          <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 16 }}>Carregando dados…</div>
        )}

        {selected && !loadingEdit && (
          <div style={{ marginTop: 20, padding: '20px', borderRadius: 10, border: '1px solid var(--blue)', background: 'rgba(59,130,246,.05)' }}>
            <div style={{ fontSize: 11, color: 'var(--blue)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 16 }}>
              Editando: {selected.nome_loja || selected.tenant_id}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
              <div>
                <label style={LBL}>Nome da empresa</label>
                <input name="nome_loja" value={editForm.nome_loja} onChange={ec} style={SI} placeholder="Nome da empresa" />
              </div>
              <div>
                <label style={LBL}>WhatsApp</label>
                <input name="whatsapp" value={editForm.whatsapp} onChange={ec} style={SI} placeholder="(00) 90000-0000" />
              </div>
              <div>
                <label style={LBL}>E-mail de contato</label>
                <input name="email_contato" value={editForm.email_contato} onChange={ec} style={SI} placeholder="contato@empresa.com" />
              </div>
              <div>
                <label style={LBL}>Link do frete</label>
                <input name="link_frete" value={editForm.link_frete} onChange={ec} style={SI} placeholder="https://…" />
              </div>
            </div>

            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 12 }}>
              ID: {selected.tenant_id}
            </div>

            {/* Botões */}
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button onClick={salvarEdicao} disabled={editSaving}
                className="btn-acao btn-blue"
                style={{ flex: 1, minHeight: 40, fontWeight: 700, color: '#171717', fontSize: 14 }}>
                {editSaving ? 'Salvando…' : 'Salvar alterações'}
              </button>

              {!confirmDel ? (
                <button onClick={() => setConfirmDel(true)}
                  className="btn-acao"
                  style={{ minHeight: 40, padding: '0 20px', background: 'rgba(239,68,68,.15)', color: 'var(--red)', fontWeight: 600, fontSize: 14 }}>
                  Excluir empresa
                </button>
              ) : (
                <>
                  <button onClick={executarDelete} disabled={deleting}
                    className="btn-acao"
                    style={{ minHeight: 40, padding: '0 16px', background: 'var(--red)', color: '#fff', fontWeight: 700, fontSize: 14 }}>
                    {deleting ? 'Excluindo…' : 'Confirmar exclusão'}
                  </button>
                  <button onClick={() => setConfirmDel(false)}
                    className="btn-acao"
                    style={{ minHeight: 40, padding: '0 14px', background: 'var(--border-light)', color: 'var(--text-body)', fontSize: 14 }}>
                    Cancelar
                  </button>
                </>
              )}
            </div>

            {confirmDel && (
              <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 6, background: 'rgba(239,68,68,.1)', color: 'var(--red)', fontSize: 13 }}>
                Atenção: esta ação é irreversível e removerá todos os dados da empresa.
              </div>
            )}
          </div>
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
  const [tenants,  setTenants]  = useState([])
  const [tenantId, setTenantId] = useState('')
  const [selected, setSelected] = useState({})
  const [loading,  setLoading]  = useState(false)
  const [saving,   setSaving]   = useState(false)

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
      showToast('Páginas salvas!')
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
        Selecione a empresa e marque quais páginas ela poderá usar.
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

      {tenantId && loading && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Carregando…</div>}

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
