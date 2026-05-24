import { useState, useEffect, useRef } from 'react'
import AppShell from '../components/ui/AppShell'
import { useApp } from '../context/AppContext'
import { createTenantAndAdmin } from '../services/masterService'
import { getConfig } from '../services/configService'
import {
  getAllTenants, getTenantPages, saveTenantPages, ALL_PAGES,
  updateTenantInfo, deleteTenant, getTenantAdmin, updateTenantAdmin,
} from '../services/authService'

const SI = {
  background: 'var(--input-bg)', border: '1px solid var(--border-light)',
  color: 'var(--text-body)', borderRadius: 6, padding: '8px 10px',
  fontSize: 14, width: '100%', colorScheme: 'dark', boxSizing: 'border-box',
}

const LBL = {
  fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase',
  letterSpacing: '.4px', display: 'block', marginBottom: 5, marginTop: 14,
}

const SECTION_TITLE = {
  fontSize: 11, fontWeight: 700, color: 'var(--blue)', textTransform: 'uppercase',
  letterSpacing: '.6px', marginBottom: 4, marginTop: 20, paddingBottom: 6,
  borderBottom: '1px solid var(--border-light)',
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

// ── Form inicial vazio ──────────────────────────────────────────
const EMPTY = {
  nome_loja: '', cnpj: '', whatsapp: '', email_contato: '', link_frete: '',
  adminNome: '', adminEmail: '', adminCpf: '', adminCelular: '', adminSenha: '',
}

// ── Aba: Empresa (criar / editar / excluir) ─────────────────────
function AbaEmpresa({ showToast }) {
  const [tenants, setTenants]       = useState([])
  const [busca, setBusca]           = useState('')
  const [dropOpen, setDropOpen]     = useState(false)
  const [modo, setModo]             = useState('novo') // 'novo' | 'editar'
  const [tenantSel, setTenantSel]   = useState(null)
  const [adminId, setAdminId]       = useState(null)
  const [form, setForm]             = useState(EMPTY)
  const [loading, setLoading]       = useState(false)
  const [saving, setSaving]         = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => { carregarTenants() }, [])

  // fecha dropdown ao clicar fora
  useEffect(() => {
    function onClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setDropOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  async function carregarTenants() {
    const { data } = await getAllTenants()
    setTenants(data)
  }

  // ── Seleciona empresa existente para editar ──
  async function selecionarEmpresa(t) {
    setDropOpen(false)
    setBusca(t.nome_loja || t.tenant_id)
    setTenantSel(t)
    setConfirmDel(false)
    setLoading(true)
    try {
      const [cfg, admin] = await Promise.all([
        getConfig(t.tenant_id),
        getTenantAdmin(t.tenant_id),
      ])
      setAdminId(admin?.id || null)
      setForm({
        nome_loja:     cfg?.nome_loja     || '',
        cnpj:          '',
        whatsapp:      cfg?.whatsapp      || '',
        email_contato: cfg?.email_contato || '',
        link_frete:    cfg?.link_frete    || '',
        adminNome:     admin?.nome        || '',
        adminEmail:    admin?.email       || '',
        adminCpf:      '',
        adminCelular:  '',
        adminSenha:    '',
      })
      setModo('editar')
    } finally {
      setLoading(false)
    }
  }

  // ── Volta para modo novo ──
  function novaEmpresa() {
    setModo('novo')
    setTenantSel(null)
    setAdminId(null)
    setBusca('')
    setForm(EMPTY)
    setConfirmDel(false)
  }

  const ch = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }))

  const filtrados = tenants.filter(t =>
    !busca || (t.nome_loja || '').toLowerCase().includes(busca.toLowerCase())
  )

  // ── Salvar (criar ou atualizar) ──
  async function handleSalvar(e) {
    e?.preventDefault()
    setSaving(true)
    try {
      if (modo === 'novo') {
        // Criação
        if (!form.nome_loja.trim() || !form.cnpj.trim()) throw new Error('Informe nome e CNPJ.')
        if (!form.adminNome.trim() || !form.adminEmail.trim() || !form.adminCpf.trim() || !form.adminCelular.trim()) throw new Error('Preencha todos os dados do admin.')
        if (form.adminSenha.length < 6) throw new Error('Senha mínima de 6 caracteres.')
        const { data, error } = await createTenantAndAdmin({
          empresaNome: form.nome_loja.trim(), empresaCnpj: form.cnpj.trim(),
          adminNome: form.adminNome.trim(), adminEmail: form.adminEmail.trim().toLowerCase(),
          adminCpf: form.adminCpf.trim(), adminCelular: form.adminCelular.trim(), adminSenha: form.adminSenha,
        })
        if (error) throw error
        if (!data?.ok) throw new Error(data?.message || 'Falha ao criar.')
        showToast('Empresa e admin criados!', 'success')
        novaEmpresa()
        carregarTenants()
      } else {
        // Atualização
        if (!form.nome_loja.trim()) throw new Error('Nome da empresa é obrigatório.')
        await updateTenantInfo(tenantSel.tenant_id, {
          nome_loja:     form.nome_loja.trim(),
          whatsapp:      form.whatsapp.trim(),
          email_contato: form.email_contato.trim(),
          link_frete:    form.link_frete.trim(),
        })
        if (adminId) {
          await updateTenantAdmin(adminId, {
            nome:  form.adminNome.trim(),
            email: form.adminEmail.trim().toLowerCase(),
          })
        }
        showToast('Empresa atualizada!', 'success')
        setBusca(form.nome_loja.trim())
        carregarTenants()
      }
    } catch (err) {
      showToast(err.message || 'Erro ao salvar.', 'error')
    } finally {
      setSaving(false)
    }
  }

  // ── Excluir ──
  async function executarDelete() {
    setDeleting(true)
    try {
      await deleteTenant(tenantSel.tenant_id)
      showToast('Empresa excluída.', 'success')
      novaEmpresa()
      carregarTenants()
    } catch (err) {
      showToast('Erro: ' + err.message, 'error')
    } finally {
      setDeleting(false)
      setConfirmDel(false)
    }
  }

  return (
    <div className="admin-card">

      {/* ── Badge de modo ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>
            {modo === 'novo' ? 'Nova empresa' : `Editando: ${tenantSel?.nome_loja || ''}`}
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            {modo === 'novo'
              ? 'Busque abaixo para editar uma existente, ou preencha os campos para criar.'
              : 'Altere os campos necessários e salve.'}
          </p>
        </div>
        {modo === 'editar' && (
          <button onClick={novaEmpresa}
            style={{ background: 'var(--border-light)', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', color: 'var(--text-body)', fontSize: 13, whiteSpace: 'nowrap' }}>
            + Nova empresa
          </button>
        )}
      </div>

      <form onSubmit={handleSalvar} autoComplete="off">

        {/* ── Campo empresa com autocomplete ── */}
        <div style={SECTION_TITLE}>Empresa</div>

        <div style={{ position: 'relative' }} ref={wrapRef}>
          <label style={LBL}>Nome da empresa *</label>
          <input
            name="nome_loja"
            value={modo === 'editar' ? form.nome_loja : busca}
            onChange={e => {
              if (modo === 'editar') {
                ch(e)
              } else {
                setBusca(e.target.value)
                setDropOpen(true)
              }
            }}
            onFocus={() => { if (modo === 'novo') setDropOpen(true) }}
            placeholder="Digite para buscar empresa existente ou criar nova…"
            autoComplete="off"
            style={SI}
          />

          {/* Dropdown de busca */}
          {modo === 'novo' && dropOpen && filtrados.length > 0 && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0,
              background: '#1a2230', border: '1px solid var(--border-light)',
              borderRadius: 8, zIndex: 30, boxShadow: '0 8px 28px rgba(0,0,0,.6)',
              maxHeight: 240, overflowY: 'auto',
            }}>
              {filtrados.map(t => (
                <button type="button" key={t.tenant_id}
                  onClick={() => selecionarEmpresa(t)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    width: '100%', textAlign: 'left', padding: '11px 14px',
                    background: 'none', border: 'none', color: 'var(--text-body)',
                    cursor: 'pointer', fontSize: 14,
                    borderBottom: '1px solid var(--border-light)',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--table-row-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  <span style={{ fontWeight: 600 }}>{t.nome_loja || '(sem nome)'}</span>
                  <span style={{ fontSize: 11, color: 'var(--blue)' }}>Clique para editar</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {loading && <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 12 }}>Carregando dados da empresa…</div>}

        {!loading && (
          <>
            {modo === 'novo' && (
              <>
                <label style={LBL}>CNPJ *</label>
                <input name="cnpj" value={form.cnpj} onChange={ch} placeholder="00.000.000/0001-00" autoComplete="off" style={SI} />
              </>
            )}

            {modo === 'editar' && (
              <>
                <label style={LBL}>WhatsApp</label>
                <input name="whatsapp" value={form.whatsapp} onChange={ch} placeholder="(00) 90000-0000" autoComplete="off" style={SI} />

                <label style={LBL}>E-mail de contato</label>
                <input name="email_contato" value={form.email_contato} onChange={ch} placeholder="contato@empresa.com" autoComplete="off" style={SI} />

                <label style={LBL}>Link do frete</label>
                <input name="link_frete" value={form.link_frete} onChange={ch} placeholder="https://…" autoComplete="off" style={SI} />
              </>
            )}

            {/* ── Admin ── */}
            <div style={SECTION_TITLE}>Administrador</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
              <div>
                <label style={LBL}>Nome completo *</label>
                <input name="adminNome" value={form.adminNome} onChange={ch} placeholder="Nome do admin" autoComplete="off" style={SI} />
              </div>
              <div>
                <label style={LBL}>E-mail *</label>
                <input name="adminEmail" value={form.adminEmail} onChange={ch} placeholder="admin@empresa.com" autoComplete="off" style={SI} />
              </div>

              {modo === 'novo' && (
                <>
                  <div>
                    <label style={LBL}>CPF *</label>
                    <input name="adminCpf" value={form.adminCpf} onChange={ch} placeholder="000.000.000-00" autoComplete="off" style={SI} />
                  </div>
                  <div>
                    <label style={LBL}>Celular *</label>
                    <input name="adminCelular" value={form.adminCelular} onChange={ch} placeholder="(00) 90000-0000" autoComplete="off" style={SI} />
                  </div>
                </>
              )}

              <div style={modo === 'editar' ? { gridColumn: '1 / -1' } : {}}>
                <label style={LBL}>
                  {modo === 'editar' ? 'Nova senha (deixe vazio para manter)' : 'Senha inicial *'}
                </label>
                <input name="adminSenha" type="password" value={form.adminSenha} onChange={ch}
                  placeholder={modo === 'editar' ? 'Nova senha (opcional)' : 'Mínimo 6 caracteres'}
                  autoComplete="new-password" style={SI} />
              </div>
            </div>

            {/* ── ID do tenant (só edição) ── */}
            {modo === 'editar' && tenantSel && (
              <div style={{ marginTop: 14, fontSize: 11, color: 'var(--muted)' }}>
                ID: {tenantSel.tenant_id}
              </div>
            )}

            {/* ── Botões ── */}
            <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
              <button type="submit" disabled={saving}
                className="btn-acao btn-blue"
                style={{ flex: 1, minHeight: 42, fontWeight: 700, color: '#171717', fontSize: 14 }}>
                {saving
                  ? (modo === 'novo' ? 'Criando…' : 'Salvando…')
                  : (modo === 'novo' ? 'Criar empresa + admin' : 'Salvar alterações')}
              </button>

              {modo === 'editar' && !confirmDel && (
                <button type="button" onClick={() => setConfirmDel(true)}
                  className="btn-acao"
                  style={{ minHeight: 42, padding: '0 20px', background: 'rgba(239,68,68,.15)', color: 'var(--red)', fontWeight: 600, fontSize: 14 }}>
                  Excluir empresa
                </button>
              )}

              {modo === 'editar' && confirmDel && (
                <>
                  <button type="button" onClick={executarDelete} disabled={deleting}
                    className="btn-acao"
                    style={{ minHeight: 42, padding: '0 16px', background: 'var(--red)', color: '#fff', fontWeight: 700, fontSize: 14 }}>
                    {deleting ? 'Excluindo…' : 'Confirmar exclusão'}
                  </button>
                  <button type="button" onClick={() => setConfirmDel(false)}
                    className="btn-acao"
                    style={{ minHeight: 42, padding: '0 14px', background: 'var(--border-light)', color: 'var(--text-body)' }}>
                    Cancelar
                  </button>
                </>
              )}
            </div>

            {confirmDel && (
              <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 6, background: 'rgba(239,68,68,.1)', color: 'var(--red)', fontSize: 13 }}>
                Atenção: esta ação é irreversível e remove todos os dados da empresa permanentemente.
              </div>
            )}
          </>
        )}
      </form>
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

  const toggle = slug => setSelected(prev => ({ ...prev, [slug]: !prev[slug] }))

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
  const [aba, setAba] = useState('empresa')

  return (
    <AppShell title="Master — Empresas">
      <section className="admin-panel">
        <div style={{ borderBottom: '1px solid var(--border-header)', marginBottom: 4 }}>
          <TabBtn label="Empresa"             active={aba === 'empresa'} onClick={() => setAba('empresa')} />
          <TabBtn label="Páginas por Empresa" active={aba === 'paginas'} onClick={() => setAba('paginas')} />
        </div>
        {aba === 'empresa' && <AbaEmpresa showToast={showToast} />}
        {aba === 'paginas' && <AbaPaginas showToast={showToast} />}
      </section>
    </AppShell>
  )
}
