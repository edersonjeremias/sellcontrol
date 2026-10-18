import { useState, useEffect, useRef } from 'react'
import Papa from 'papaparse'
import { hojeISO } from '../lib/datas'
import AppShell from '../components/ui/AppShell'
import { useApp } from '../context/AppContext'
import { createTenantAndAdmin } from '../services/masterService'
import { getConfig } from '../services/configService'
import {
  getAllTenants, getTenantPages, saveTenantPages, ALL_PAGES,
  updateTenantInfo, deleteTenant, getTenantAdmin, updateTenantAdmin,
} from '../services/authService'
import { supabase } from '../lib/supabase'

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
  cpf_cnpj: '', telefone: '',
  endereco_rua: '', endereco_numero: '', endereco_complemento: '',
  endereco_bairro: '', endereco_cidade: '', endereco_estado: '', endereco_cep: '',
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
  const [buscandoCep, setBuscandoCep] = useState(false)
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
        cpf_cnpj:      cfg?.cpf_cnpj      || '',
        telefone:      cfg?.telefone      || '',
        endereco_rua:        cfg?.endereco_rua        || '',
        endereco_numero:     cfg?.endereco_numero     || '',
        endereco_complemento: cfg?.endereco_complemento || '',
        endereco_bairro:     cfg?.endereco_bairro     || '',
        endereco_cidade:     cfg?.endereco_cidade     || '',
        endereco_estado:     cfg?.endereco_estado     || '',
        endereco_cep:        cfg?.endereco_cep        || '',
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

  // ── Buscar endereço por CEP ──
  async function buscarCep(cep) {
    const cepLimpo = cep.replace(/\D/g, '')
    if (cepLimpo.length !== 8) return

    setBuscandoCep(true)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`)
      const data = await res.json()

      if (data.erro) {
        showToast('CEP não encontrado', 'error')
        return
      }

      setForm(p => ({
        ...p,
        endereco_rua: data.logradouro || p.endereco_rua,
        endereco_bairro: data.bairro || p.endereco_bairro,
        endereco_cidade: data.localidade || p.endereco_cidade,
        endereco_estado: data.uf || p.endereco_estado,
      }))
    } catch (err) {
      console.error('Erro ao buscar CEP:', err)
    } finally {
      setBuscandoCep(false)
    }
  }

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
        if (!form.nome_loja.trim()) throw new Error('Informe o nome da empresa.')
        if (!form.adminNome.trim() || !form.adminEmail.trim() || !form.adminCelular.trim()) throw new Error('Preencha todos os dados do admin.')
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
          cpf_cnpj:      form.cpf_cnpj.trim(),
          telefone:      form.telefone.trim(),
          endereco_rua:        form.endereco_rua.trim(),
          endereco_numero:     form.endereco_numero.trim(),
          endereco_complemento: form.endereco_complemento.trim(),
          endereco_bairro:     form.endereco_bairro.trim(),
          endereco_cidade:     form.endereco_cidade.trim(),
          endereco_estado:     form.endereco_estado.trim(),
          endereco_cep:        form.endereco_cep.trim(),
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
                setForm(p => ({ ...p, nome_loja: e.target.value })) // atualiza form também
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
                <label style={LBL}>CNPJ</label>
                <input name="cnpj" value={form.cnpj} onChange={ch} placeholder="00.000.000/0001-00" autoComplete="off" style={SI} />
              </>
            )}

            {modo === 'editar' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                  <div>
                    <label style={LBL}>CPF/CNPJ</label>
                    <input name="cpf_cnpj" value={form.cpf_cnpj} onChange={ch} placeholder="000.000.000-00 ou 00.000.000/0001-00" autoComplete="off" style={SI} />
                  </div>
                  <div>
                    <label style={LBL}>Telefone</label>
                    <input name="telefone" value={form.telefone} onChange={ch} placeholder="(00) 0000-0000" autoComplete="off" style={SI} />
                  </div>
                </div>

                <label style={LBL}>WhatsApp</label>
                <input name="whatsapp" value={form.whatsapp} onChange={ch} placeholder="(00) 90000-0000" autoComplete="off" style={SI} />

                <label style={LBL}>E-mail de contato</label>
                <input name="email_contato" value={form.email_contato} onChange={ch} placeholder="contato@empresa.com" autoComplete="off" style={SI} />

                <label style={LBL}>Link do frete</label>
                <input name="link_frete" value={form.link_frete} onChange={ch} placeholder="https://…" autoComplete="off" style={SI} />

                <div style={SECTION_TITLE}>Endereço da Empresa (Para Etiquetas de Envio)</div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0 16px' }}>
                  <div>
                    <label style={LBL}>CEP *</label>
                    <input
                      name="endereco_cep"
                      value={form.endereco_cep}
                      onChange={e => {
                        ch(e)
                        const cep = e.target.value.replace(/\D/g, '')
                        if (cep.length === 8) buscarCep(cep)
                      }}
                      placeholder="00000-000"
                      autoComplete="off"
                      style={SI}
                      disabled={buscandoCep}
                    />
                    {buscandoCep && <div style={{ fontSize: 11, color: 'var(--blue)', marginTop: 4 }}>Buscando...</div>}
                  </div>
                  <div>
                    <label style={LBL}>Rua</label>
                    <input name="endereco_rua" value={form.endereco_rua} onChange={ch} placeholder="Rua Exemplo" autoComplete="off" style={SI} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0 16px' }}>
                  <div>
                    <label style={LBL}>Número</label>
                    <input name="endereco_numero" value={form.endereco_numero} onChange={ch} placeholder="123" autoComplete="off" style={SI} />
                  </div>
                  <div>
                    <label style={LBL}>Complemento</label>
                    <input name="endereco_complemento" value={form.endereco_complemento} onChange={ch} placeholder="Sala 1, Andar 2, etc" autoComplete="off" style={SI} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr', gap: '0 16px' }}>
                  <div>
                    <label style={LBL}>Bairro</label>
                    <input name="endereco_bairro" value={form.endereco_bairro} onChange={ch} placeholder="Centro" autoComplete="off" style={SI} />
                  </div>
                  <div>
                    <label style={LBL}>Cidade</label>
                    <input name="endereco_cidade" value={form.endereco_cidade} onChange={ch} placeholder="São Paulo" autoComplete="off" style={SI} />
                  </div>
                  <div>
                    <label style={LBL}>Estado</label>
                    <input name="endereco_estado" value={form.endereco_estado} onChange={ch} placeholder="SP" autoComplete="off" maxLength={2} style={SI} />
                  </div>
                </div>
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
                    <label style={LBL}>CPF</label>
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

// ── Aba: Importar Bling ────────────────────────────────────────
function AbaImportarBling({ showToast }) {
  const [tenants, setTenants] = useState([])
  const [tenantId, setTenantId] = useState('')
  const [preview, setPreview] = useState([])
  const [analise, setAnalise] = useState(null)
  const [analisando, setAnalisando] = useState(false)
  const [soComWhatsapp, setSoComWhatsapp] = useState(true)
  const [importing, setImporting] = useState(false)
  const [progresso, setProgresso] = useState(null)
  const [errosDetalhados, setErrosDetalhados] = useState([])
  const fileInputRef = useRef(null)

  useEffect(() => {
    getAllTenants().then(({ data }) => setTenants(data))
  }, [])

  // Processar CSV do Bling
  function handleFileUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      delimiter: ';', // Bling usa ponto-e-vírgula
      complete: (results) => {
        if (results.data.length === 0) {
          showToast('Arquivo CSV vazio', 'error')
          return
        }
        setPreview(results.data)
        showToast(`${results.data.length} clientes carregados para preview`, 'success')
      },
      error: (error) => {
        showToast('Erro ao ler CSV: ' + error.message, 'error')
      }
    })
  }

  const limparDocumento = doc => (doc || '').replace(/[^\d]/g, '')
  const limparTelefone  = tel => (tel || '').replace(/[^\d]/g, '')

  // Handle de Instagram: sem espaços, só letras/números/ponto/underscore
  function pareceHandle(txt) {
    const bruto = (txt || '').trim()
    if (!bruto || /\s/.test(bruto)) return false
    const h = bruto.toLowerCase().replace(/^@+/, '')
    return h.length >= 3 && /^[a-z0-9._]+$/.test(h)
  }

  const normalizarHandle = txt =>
    (txt || '').trim().toLowerCase().replace(/^@+/, '').replace(/\s+/g, '')

  // O Bling corta a coluna "Código" em 15 caracteres, então ela é a última opção:
  // o handle inteiro costuma estar entre parênteses no Nome, em Contatos ou em Fantasia.
  function extrairInstagram(row) {
    const nome = (row.Nome || '').trim()

    const entreParenteses = [...nome.matchAll(/\(([^)]+)\)/g)].map(m => m[1]).reverse()
    const doNome = entreParenteses.find(pareceHandle)
    if (doNome) return normalizarHandle(doNome)

    if (pareceHandle(row.Contatos)) return normalizarHandle(row.Contatos)
    if (pareceHandle(row.Fantasia)) return normalizarHandle(row.Fantasia)

    const codigo = row['Código'] || row.Codigo
    if (pareceHandle(codigo)) return normalizarHandle(codigo)

    return normalizarHandle(nome)
  }

  // Linhas de controle interno do Bling que não são clientes
  const NAO_CLIENTES = ['consumidor final', 'bling', 'das - documento', 'dctf web', 'contabil']

  function ehCliente(row) {
    const nome = (row.Nome || '').trim().toLowerCase()
    if (!nome) return false
    if (NAO_CLIENTES.some(termo => nome.includes(termo))) return false

    // "Tipo contato" vazio entra; preenchido só entra se incluir "Cliente"
    const tipo = (row['Tipo contato'] || '').trim().toLowerCase()
    return !tipo || tipo.includes('cliente')
  }

  function dataBrParaISO(str) {
    const m = (str || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null
  }

  function extrairDados(row) {
    return {
      nome:         (row.Nome || '').trim(),
      instagram:    extrairInstagram(row),
      cpfCnpj:      limparDocumento(row['CNPJ / CPF'] || row.CPF || row.CNPJ),
      tipoPessoa:   row['Tipo pessoa'] === 'Pessoa Jurídica' ? 'juridica' : 'fisica',
      whatsapp:     limparTelefone(row.Celular),
      telefone:     limparTelefone(row.Fone || row.Telefone),
      email:        (row['E-mail'] || row.Email || '').trim().toLowerCase(),
      clienteDesde: dataBrParaISO(row['Cliente desde']),
      cep:          limparDocumento(row.CEP),
      rua:          (row['Endereço'] || row.Endereco || '').trim(),
      numero:       (row['Número'] || row.Numero || '').trim(),
      complemento:  (row.Complemento || '').trim(),
      bairro:       (row.Bairro || '').trim(),
      cidade:       (row.Cidade || '').trim(),
      estado:       (row.UF || '').trim().toUpperCase(),
    }
  }

  const temEnderecoValido = d =>
    d.cep.length === 8 && !!d.rua && !!d.cidade && d.estado.length === 2

  const pontuar = d =>
    (temEnderecoValido(d) ? 10 : 0) + (d.whatsapp ? 4 : 0) +
    (d.cpfCnpj ? 2 : 0) + (d.email ? 1 : 0) + (d.telefone ? 1 : 0)

  // ── Confere o CSV contra o banco antes de importar ───────────
  useEffect(() => {
    if (!tenantId || preview.length === 0) { setAnalise(null); return }

    let cancelado = false
    setAnalisando(true)

    ;(async () => {
      const linhas = preview.map((row, i) => ({ linha: i + 2, row, dados: extrairDados(row) }))
      const valida = l => ehCliente(l.row) && !!l.dados.nome && l.dados.instagram.length >= 3

      const ignoradas = linhas.filter(l => !valida(l))

      // Mesmo @instagram em várias linhas: fica só a mais completa
      const porInstagram = new Map()
      const duplicadas = []
      linhas.filter(valida).forEach(item => {
        const atual = porInstagram.get(item.dados.instagram)
        if (!atual) { porInstagram.set(item.dados.instagram, item); return }
        const vencedora = pontuar(item.dados) > pontuar(atual.dados) ? item : atual
        porInstagram.set(item.dados.instagram, vencedora)
        duplicadas.push(vencedora === item ? atual : item)
      })
      const unicas = [...porInstagram.values()]

      const { data: existentes, error } = await supabase
        .from('clientes')
        .select('id, instagram, whatsapp')
        .eq('tenant_id', tenantId)

      if (cancelado) return
      if (error) {
        showToast('Erro ao conferir clientes existentes: ' + error.message, 'error')
        setAnalisando(false)
        return
      }

      const mapaInstagram = new Map((existentes || []).map(c => [c.instagram, c]))
      const mapaWhatsapp  = new Map((existentes || []).filter(c => c.whatsapp).map(c => [c.whatsapp, c]))

      unicas.forEach(l => {
        l.existente = mapaInstagram.get(l.dados.instagram)
          || (l.dados.whatsapp ? mapaWhatsapp.get(l.dados.whatsapp) : null)
          || null
      })

      // Tem WhatsApp se veio no CSV ou se o cliente já tem um salvo no sistema
      const temWhatsapp = l => !!l.dados.whatsapp || !!l.existente?.whatsapp
      const semWhatsapp = soComWhatsapp ? unicas.filter(l => !temWhatsapp(l)) : []
      const fila = soComWhatsapp ? unicas.filter(temWhatsapp) : unicas

      setAnalise({
        unicas: fila,
        ignoradas,
        duplicadas,
        semWhatsapp,
        novos:       fila.filter(l => !l.existente).length,
        atualizados: fila.filter(l => l.existente).length,
        comEndereco: fila.filter(l => temEnderecoValido(l.dados)).length,
      })
      setAnalisando(false)
    })()

    return () => { cancelado = true }
  }, [tenantId, preview, soComWhatsapp])

  // Executar importação
  async function executarImportacao() {
    const fila = analise?.unicas || []
    if (fila.length === 0) {
      showToast('Nenhuma linha válida para importar', 'error')
      return
    }

    setImporting(true)
    setProgresso({ total: fila.length, atual: 0, inseridos: 0, atualizados: 0, erros: 0, pulados: 0 })
    setErrosDetalhados([])

    let inseridos = 0
    let atualizados = 0
    let erros = 0
    let enderecosInseridos = 0
    const listaErros = []

    for (let i = 0; i < fila.length; i++) {
      const { linha, dados: d, existente } = fila[i]
      // Se o cliente já existe, o @ do sistema manda — é o que as vendas usam
      let instagram = existente?.instagram || d.instagram

      try {
        // Só grava campo que veio preenchido no CSV: nunca apaga o que já existe.
        // bloqueado, msg_bloqueio e data_cadastro ficam intactos de propósito.
        const campos = {}
        Object.entries({
          whatsapp:      d.whatsapp,
          telefone:      d.telefone,
          email:         d.email,
          nome_completo: d.nome,
          cpf_cnpj:      d.cpfCnpj,
          tipo_pessoa:   d.tipoPessoa,
        }).forEach(([k, v]) => { if (v) campos[k] = v })

        if (existente) {
          if (Object.keys(campos).length > 0) {
            const { error } = await supabase
              .from('clientes')
              .update(campos)
              .eq('id', existente.id)
            if (error) throw error
          }
          atualizados++
        } else {
          const { error } = await supabase
            .from('clientes')
            .insert({
              ...campos,
              tenant_id: tenantId,
              instagram,
              data_cadastro: d.clienteDesde || hojeISO(),
            })
          if (error) throw error
          inseridos++
        }

        if (temEnderecoValido(d)) {
          const { data: enderecos } = await supabase
            .from('enderecos_clientes')
            .select('id, cep, numero')
            .eq('tenant_id', tenantId)
            .eq('cliente_instagram', instagram)

          const enderecoData = {
            tenant_id: tenantId,
            cliente_instagram: instagram,
            apelido: 'Bling',
            destinatario: d.nome,
            telefone: d.whatsapp || d.telefone || '',
            cep: d.cep,
            rua: d.rua,
            numero: d.numero || 's/n',
            complemento: d.complemento,
            bairro: d.bairro,
            cidade: d.cidade,
            estado: d.estado,
          }

          const mesmoLocal = (enderecos || []).find(
            e => limparDocumento(e.cep) === d.cep && (e.numero || '').trim() === enderecoData.numero
          )

          if (mesmoLocal) {
            const { error } = await supabase
              .from('enderecos_clientes')
              .update(enderecoData)
              .eq('id', mesmoLocal.id)
            if (error) throw error
          } else {
            // Vira padrão só se o cliente ainda não tem endereço nenhum —
            // nunca sobrescreve o que ele mesmo escolheu no portal
            const { error } = await supabase
              .from('enderecos_clientes')
              .insert({ ...enderecoData, padrao: (enderecos || []).length === 0 })
            if (error) throw error
            enderecosInseridos++
          }
        }

        setProgresso(p => ({ ...p, atual: i + 1, inseridos, atualizados }))

      } catch (err) {
        console.error(`Erro linha ${linha}:`, err)
        erros++
        listaErros.push({
          linha,
          instagram,
          erro: err.message || 'Erro desconhecido',
          detalhes: err.details || err.hint || '',
          tipo: 'erro'
        })
        setProgresso(p => ({ ...p, atual: i + 1, erros }))
      }
    }

    setErrosDetalhados(listaErros)
    setImporting(false)

    const resumo = `${inseridos} clientes novos, ${atualizados} atualizados, ${enderecosInseridos} endereços criados`
    showToast(
      erros > 0 ? `Importação concluída com ${erros} erro(s). ${resumo}` : `Importação concluída! ${resumo}`,
      erros > 0 ? 'error' : 'success'
    )
  }

  const nomeEmpresa = tenants.find(t => t.tenant_id === tenantId)?.nome_loja || ''

  return (
    <div style={{ padding: '20px 0', maxWidth: 900 }}>
      <div style={{
        background: 'rgba(59,130,246,0.1)',
        border: '1px solid var(--blue)',
        borderRadius: 8,
        padding: 16,
        marginBottom: 24
      }}>
        <h3 style={{ margin: '0 0 8px 0', fontSize: 14, fontWeight: 700, color: 'var(--blue)' }}>
          📦 Importação de Clientes do Bling
        </h3>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-body)', lineHeight: 1.6 }}>
          A partir do CSV de contatos do Bling:
          <br/>• Cria ou completa o <strong>cadastro do cliente</strong> (nome, CPF/CNPJ, e-mail, telefone)
          <br/>• Cria o <strong>endereço</strong> que aparece no portal e na cotação de frete
          <br/>• <strong>Nunca apaga</strong> dado que já existe: campo vazio no CSV é ignorado
          <br/>• Linhas repetidas e contatos que não são clientes ficam de fora
        </p>
      </div>

      {/* Selecionar empresa */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
          Empresa de destino *
        </label>
        <select value={tenantId} onChange={e => setTenantId(e.target.value)} style={SI}>
          <option value="">-- Selecione a empresa --</option>
          {tenants.map(t => (
            <option key={t.tenant_id} value={t.tenant_id}>
              {t.nome_loja || t.tenant_id}
            </option>
          ))}
        </select>
      </div>

      {/* Upload CSV */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
          Arquivo CSV do Bling
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileUpload}
          disabled={importing}
          style={{
            ...SI,
            cursor: 'pointer',
            padding: '10px',
          }}
        />
        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
          Formato Bling: separado por ponto-e-vírgula (;), com colunas Nome, Código, CNPJ/CPF, Endereço, CEP, etc.
        </p>
      </div>

      <label style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 24,
        padding: '12px 14px', borderRadius: 8, cursor: 'pointer',
        background: 'var(--input-bg)', border: '1px solid var(--border-light)',
      }}>
        <input
          type="checkbox"
          checked={soComWhatsapp}
          onChange={e => setSoComWhatsapp(e.target.checked)}
          disabled={importing}
          style={{ accentColor: 'var(--blue)', width: 16, height: 16, cursor: 'pointer', marginTop: 1 }}
        />
        <span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-body)' }}>
            Importar somente clientes com WhatsApp
          </span>
          <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
            Vale o celular do CSV ou o WhatsApp que o cliente já tem no sistema.
          </span>
        </span>
      </label>

      {preview.length > 0 && !tenantId && (
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24 }}>
          Selecione a empresa acima para conferir o arquivo contra os clientes já cadastrados.
        </p>
      )}

      {analisando && (
        <p style={{ fontSize: 13, color: 'var(--blue)', marginBottom: 24 }}>Conferindo com o banco…</p>
      )}

      {/* Preview */}
      {analise && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-body)', margin: 0 }}>
              Conferência do arquivo ({preview.length} linhas)
            </h3>
            <button
              onClick={() => {
                setPreview([])
                setAnalise(null)
                if (fileInputRef.current) fileInputRef.current.value = ''
              }}
              style={{
                background: 'none', border: 'none', color: 'var(--red)',
                cursor: 'pointer', fontSize: 12, textDecoration: 'underline'
              }}>
              Limpar
            </button>
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12,
            padding: 16, marginBottom: 12, fontSize: 12,
            background: 'var(--input-bg)', border: '1px solid var(--border-light)', borderRadius: 8,
          }}>
            <div>
              <div style={{ color: 'var(--muted)' }}>Clientes novos</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--green)' }}>{analise.novos}</div>
            </div>
            <div>
              <div style={{ color: 'var(--muted)' }}>Já existem</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--blue)' }}>{analise.atualizados}</div>
            </div>
            <div>
              <div style={{ color: 'var(--muted)' }}>Com endereço</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-body)' }}>{analise.comEndereco}</div>
            </div>
            <div>
              <div style={{ color: 'var(--muted)' }}>Repetidas no CSV</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--muted)' }}>{analise.duplicadas.length}</div>
            </div>
            <div>
              <div style={{ color: 'var(--muted)' }}>Ignoradas</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--muted)' }}>{analise.ignoradas.length}</div>
            </div>
            <div>
              <div style={{ color: 'var(--muted)' }}>Sem WhatsApp</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--muted)' }}>{analise.semWhatsapp.length}</div>
            </div>
          </div>

          <div style={{
            padding: '10px 14px', marginBottom: 12, borderRadius: 8, fontSize: 12, lineHeight: 1.6,
            background: 'rgba(34,197,94,.08)', border: '1px solid var(--green)', color: 'var(--text-body)',
          }}>
            Campo vazio no CSV não sobrescreve o que já está no sistema — WhatsApp, bloqueios e data
            de cadastro dos clientes existentes são preservados.
          </div>

          <div style={{
            maxHeight: 400, overflowY: 'auto',
            border: '1px solid var(--border-light)', borderRadius: 8,
            background: 'var(--input-bg)'
          }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#1a2230', borderBottom: '1px solid var(--border-light)' }}>
                <tr>
                  <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--muted)', fontWeight: 600 }}>Ação</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--muted)', fontWeight: 600 }}>Nome</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--muted)', fontWeight: 600 }}>Instagram</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--muted)', fontWeight: 600 }}>WhatsApp</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--muted)', fontWeight: 600 }}>Cidade</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', color: 'var(--muted)', fontWeight: 600 }}>Endereço</th>
                </tr>
              </thead>
              <tbody>
                {analise.unicas.slice(0, 80).map(({ linha, dados, existente }) => (
                  <tr key={linha} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '6px 10px' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                        background: existente ? 'rgba(59,130,246,.15)' : 'rgba(34,197,94,.15)',
                        color: existente ? 'var(--blue)' : 'var(--green)',
                      }}>
                        {existente ? 'ATUALIZA' : 'NOVO'}
                      </span>
                    </td>
                    <td style={{ padding: '6px 10px', color: 'var(--text-body)', fontWeight: 600 }}>{dados.nome}</td>
                    <td style={{ padding: '6px 10px', color: 'var(--blue)' }}>
                      @{existente?.instagram || dados.instagram}
                    </td>
                    <td style={{ padding: '6px 10px', color: 'var(--muted)', fontSize: 11 }}>
                      {dados.whatsapp || (existente ? 'mantém o atual' : '—')}
                    </td>
                    <td style={{ padding: '6px 10px', color: 'var(--text-body)' }}>{dados.cidade || '—'}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                      {temEnderecoValido(dados)
                        ? <span style={{ color: 'var(--green)', fontSize: 16 }}>✓</span>
                        : <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {analise.unicas.length > 80 && (
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
              Mostrando 80 de {analise.unicas.length} linhas
            </p>
          )}

          {(analise.ignoradas.length > 0 || analise.duplicadas.length > 0 || analise.semWhatsapp.length > 0) && (
            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--muted)' }}>
                Ver as {analise.ignoradas.length + analise.duplicadas.length + analise.semWhatsapp.length} linhas que não serão importadas
              </summary>
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)', lineHeight: 1.8 }}>
                {analise.ignoradas.map(l => (
                  <div key={`i${l.linha}`}>
                    Linha {l.linha}: <strong>{l.dados.nome || '(sem nome)'}</strong> — não é cliente ou está sem identificação
                  </div>
                ))}
                {analise.duplicadas.map(l => (
                  <div key={`d${l.linha}`}>
                    Linha {l.linha}: <strong>{l.dados.nome}</strong> — @{l.dados.instagram} repetido, fica a linha mais completa
                  </div>
                ))}
                {analise.semWhatsapp.map(l => (
                  <div key={`w${l.linha}`}>
                    Linha {l.linha}: <strong>{l.dados.nome}</strong> — sem WhatsApp
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Botão importar */}
      {analise && (
        <div>
          {!progresso && (
            <button
              onClick={executarImportacao}
              disabled={importing || analise.unicas.length === 0}
              className="btn-acao"
              style={{
                width: '100%', minHeight: 48, fontSize: 15, fontWeight: 700,
                background: 'var(--green)', color: '#fff'
              }}>
              {importing
                ? 'Importando...'
                : `Importar ${analise.unicas.length} clientes para ${nomeEmpresa || 'empresa selecionada'}`}
            </button>
          )}

          {/* Barra de progresso */}
          {progresso && (
            <div style={{
              padding: 20, background: 'var(--input-bg)',
              border: '1px solid var(--border-light)', borderRadius: 8
            }}>
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-body)' }}>
                    {importing ? 'Importando...' : 'Concluído!'}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                    {progresso.atual} / {progresso.total}
                  </span>
                </div>
                <div style={{ width: '100%', height: 8, background: 'var(--border-light)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    width: `${(progresso.atual / progresso.total) * 100}%`,
                    height: '100%', background: 'var(--blue)',
                    transition: 'width 0.2s'
                  }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, fontSize: 12 }}>
                <div>
                  <div style={{ color: 'var(--muted)' }}>Novos</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--green)' }}>{progresso.inseridos}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--muted)' }}>Atualizados</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--blue)' }}>{progresso.atualizados}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--muted)' }}>Pulados</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--muted)' }}>{progresso.pulados}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--muted)' }}>Erros</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--red)' }}>{progresso.erros}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Lista de erros detalhados */}
      {errosDetalhados.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--red)', margin: 0 }}>
              ⚠️ Erros e Pulados ({errosDetalhados.length})
            </h3>
            <button
              onClick={() => {
                const csv = [
                  ['Linha', 'Instagram', 'Erro', 'Detalhes', 'Tipo'].join(','),
                  ...errosDetalhados.map(e => [
                    e.linha,
                    e.instagram,
                    `"${e.erro.replace(/"/g, '""')}"`,
                    `"${(e.detalhes || '').replace(/"/g, '""')}"`,
                    e.tipo
                  ].join(','))
                ].join('\n')

                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
                const link = document.createElement('a')
                link.href = URL.createObjectURL(blob)
                link.download = `erros_importacao_bling_${hojeISO()}.csv`
                link.click()
                showToast('CSV de erros baixado!', 'success')
              }}
              className="btn-acao"
              style={{
                padding: '6px 12px', fontSize: 12, background: 'var(--blue)', color: '#171717'
              }}>
              Baixar CSV dos Erros
            </button>
          </div>

          <div style={{
            maxHeight: 300, overflowY: 'auto',
            border: '1px solid var(--red)', borderRadius: 8,
            background: 'rgba(239, 68, 68, 0.05)'
          }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#1a2230', borderBottom: '1px solid var(--red)' }}>
                <tr>
                  <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--red)', fontWeight: 600 }}>Linha</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--red)', fontWeight: 600 }}>Instagram</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--red)', fontWeight: 600 }}>Erro</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--red)', fontWeight: 600 }}>Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {errosDetalhados.map((erro, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '8px 10px', color: 'var(--text-body)', fontWeight: 700 }}>
                      {erro.linha}
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--text-body)' }}>
                      {erro.instagram}
                    </td>
                    <td style={{ padding: '8px 10px', color: erro.tipo === 'erro' ? 'var(--red)' : 'var(--muted)' }}>
                      {erro.erro}
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--muted)', fontSize: 11 }}>
                      {erro.detalhes || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Aba: Importar Dados ────────────────────────────────────────
function AbaImportarDados({ showToast }) {
  const [tipoImport, setTipoImport] = useState('clientes') // 'clientes' | 'vendas'
  const [tenants, setTenants] = useState([])
  const [tenantId, setTenantId] = useState('')
  const [metodo, setMetodo] = useState('csv') // 'csv' | 'sheets'
  const [sheetsUrl, setSheetsUrl] = useState('')
  const [sheetsApiKey, setSheetsApiKey] = useState('')
  const [preview, setPreview] = useState([])
  const [importing, setImporting] = useState(false)
  const [progresso, setProgresso] = useState(null)
  const [errosDetalhados, setErrosDetalhados] = useState([])
  const fileInputRef = useRef(null)

  useEffect(() => {
    getAllTenants().then(({ data }) => setTenants(data))
  }, [])

  // Processar CSV
  function handleFileUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.data.length === 0) {
          showToast('Arquivo CSV vazio', 'error')
          return
        }
        setPreview(results.data)
        showToast(`${results.data.length} linhas carregadas para preview`, 'success')
      },
      error: (error) => {
        showToast('Erro ao ler CSV: ' + error.message, 'error')
      }
    })
  }

  // Carregar Google Sheets
  async function carregarGoogleSheets() {
    if (!sheetsUrl.trim()) {
      showToast('Informe o link da planilha', 'error')
      return
    }

    // Extrair spreadsheet ID da URL
    const match = sheetsUrl.match(/\/d\/([a-zA-Z0-9-_]+)/)
    if (!match) {
      showToast('URL inválida. Use o link completo da planilha.', 'error')
      return
    }

    const spreadsheetId = match[1]
    const range = 'cliente!A2:I' // mesmo range do script

    setImporting(true)
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?key=${sheetsApiKey}`
      const response = await fetch(url)
      const data = await response.json()

      if (data.error) {
        throw new Error(data.error.message || 'Erro ao acessar planilha')
      }

      if (!data.values || data.values.length === 0) {
        showToast('Nenhum dado encontrado na planilha', 'error')
        return
      }

      // Converter para formato de objetos
      const rows = data.values.map(row => ({
        whatsapp: row[0] || '',
        instagram: row[1] || '',
        data_cadastro: row[2] || '',
        bloqueado: row[3] || '',
        observacoes: row[4] || '',
      }))

      setPreview(rows)
      showToast(`${rows.length} linhas carregadas da planilha!`, 'success')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setImporting(false)
    }
  }

  // Converter data brasileira para ISO
  function converterData(dataStr) {
    if (!dataStr || dataStr.trim() === '') return hojeISO()

    const str = dataStr.trim()

    // Se já está no formato ISO (YYYY-MM-DD), retorna
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str

    // Se está no formato brasileiro (DD/MM/YYYY), converte
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
      const [dia, mes, ano] = str.split('/')
      return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`
    }

    // Fallback: data atual
    return hojeISO()
  }

  // Importar CLIENTES
  async function executarImportacaoClientes() {
    if (!tenantId) {
      showToast('Selecione uma empresa de destino', 'error')
      return
    }

    if (preview.length === 0) {
      showToast('Nenhum dado para importar', 'error')
      return
    }

    setImporting(true)
    setProgresso({ total: preview.length, atual: 0, inseridos: 0, atualizados: 0, erros: 0, pulados: 0 })
    setErrosDetalhados([])

    let inseridos = 0
    let atualizados = 0
    let erros = 0
    let pulados = 0
    const listaErros = []

    for (let i = 0; i < preview.length; i++) {
      const row = preview[i]

      // Mapear campos (suporta CSV e Sheets)
      const instagram = (row.instagram || row.Cliente || '').trim().toLowerCase().replace('@', '')
      const whatsapp = row.whatsapp || row.Whatsapp || ''
      const data_cadastro = converterData(row.data_cadastro || row['Data cadastro'] || '')
      const bloqueado = row.bloqueado === 'TRUE' || row.bloqueado === 'true' || row.bloqueado === '☑' || row.Bloqueado === 'TRUE'
      const msg_bloqueio = row.observacoes || row['Observações'] || row.msg_bloqueio || ''

      if (!instagram) {
        pulados++
        listaErros.push({
          linha: i + 2,
          instagram: instagram || '(vazio)',
          erro: 'Instagram vazio ou inválido',
          tipo: 'pulado'
        })
        setProgresso(p => ({ ...p, atual: i + 1, pulados }))
        continue
      }

      try {
        const { data: existente } = await supabase
          .from('clientes')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('instagram', instagram)
          .maybeSingle()

        const clienteData = {
          tenant_id: tenantId,
          instagram,
          whatsapp,
          data_cadastro,
          bloqueado,
          msg_bloqueio,
        }

        if (existente) {
          const { error } = await supabase
            .from('clientes')
            .update(clienteData)
            .eq('id', existente.id)
          if (error) throw error
          atualizados++
        } else {
          const { error } = await supabase
            .from('clientes')
            .insert(clienteData)
          if (error) throw error
          inseridos++
        }

        setProgresso(p => ({ ...p, atual: i + 1, inseridos, atualizados }))
        await new Promise(resolve => setTimeout(resolve, 50))

      } catch (err) {
        console.error(`Erro linha ${i + 2}:`, err)
        erros++
        listaErros.push({
          linha: i + 2,
          instagram,
          erro: err.message || 'Erro desconhecido',
          detalhes: err.details || err.hint || '',
          tipo: 'erro'
        })
        setProgresso(p => ({ ...p, atual: i + 1, erros }))
      }
    }

    setErrosDetalhados(listaErros)
    setImporting(false)

    if (erros > 0) {
      showToast(
        `⚠️ Importação concluída com erros!\n${inseridos} inseridos, ${atualizados} atualizados, ${pulados} pulados, ${erros} erros`,
        'error'
      )
    } else {
      showToast(
        `✅ Importação concluída!\n${inseridos} inseridos, ${atualizados} atualizados, ${pulados} pulados`,
        'success'
      )
    }

    if (erros === 0 && pulados === 0) {
      setTimeout(() => {
        setPreview([])
        setProgresso(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
        setSheetsUrl('')
      }, 3000)
    }
  }

  // Importar VENDAS
  async function executarImportacaoVendas() {
    if (!tenantId) {
      showToast('Selecione uma empresa de destino', 'error')
      return
    }

    if (preview.length === 0) {
      showToast('Nenhum dado para importar', 'error')
      return
    }

    setImporting(true)
    setProgresso({ total: preview.length, atual: 0, inseridos: 0, atualizados: 0, erros: 0, pulados: 0 })
    setErrosDetalhados([])

    let inseridos = 0
    let erros = 0
    let pulados = 0
    const listaErros = []

    for (let i = 0; i < preview.length; i++) {
      const row = preview[i]

      // Mapear campos do CSV de vendas
      const produto = row.produto || ''
      const modelo = row.modelo || ''
      const cor = row.cor || ''
      const marca = row.marca || ''
      const tamanho = row.tamanho || ''
      const preco = row.preco ? parseFloat(row.preco) : null
      const codigo = row.codigo || ''
      const cliente_nome = (row.cliente_nome || '').trim().toLowerCase().replace('@', '')
      const data_live = row.data_live || null
      const live_nome = row.live_nome || ''
      const sacolinha = row.sacolinha ? parseInt(row.sacolinha) : null

      if (!produto || !cliente_nome) {
        pulados++
        listaErros.push({
          linha: i + 2,
          instagram: cliente_nome || '(vazio)',
          erro: 'Produto ou cliente vazio',
          tipo: 'pulado'
        })
        setProgresso(p => ({ ...p, atual: i + 1, pulados }))
        continue
      }

      try {
        // Buscar cliente_id pelo instagram
        const { data: cliente } = await supabase
          .from('clientes')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('instagram', cliente_nome)
          .maybeSingle()

        const vendaData = {
          tenant_id: tenantId,
          produto,
          modelo,
          cor,
          marca,
          tamanho,
          preco,
          codigo,
          cliente_nome,
          cliente_id: cliente?.id || null,
          data_live,
          live_nome,
          sacolinha,
          status: 'ENVIADO',
          tipo_envio: 'lote'
        }

        const { error } = await supabase
          .from('vendas')
          .insert(vendaData)

        if (error) throw error
        inseridos++

        setProgresso(p => ({ ...p, atual: i + 1, inseridos }))
        await new Promise(resolve => setTimeout(resolve, 50))

      } catch (err) {
        console.error(`Erro linha ${i + 2}:`, err)
        erros++
        listaErros.push({
          linha: i + 2,
          instagram: cliente_nome,
          erro: err.message || 'Erro desconhecido',
          detalhes: err.details || err.hint || '',
          tipo: 'erro'
        })
        setProgresso(p => ({ ...p, atual: i + 1, erros }))
      }
    }

    setErrosDetalhados(listaErros)
    setImporting(false)

    if (erros > 0) {
      showToast(
        `⚠️ Importação concluída com erros!\n${inseridos} inseridos, ${pulados} pulados, ${erros} erros`,
        'error'
      )
    } else {
      showToast(
        `✅ Importação concluída!\n${inseridos} vendas inseridas, ${pulados} puladas`,
        'success'
      )
    }

    if (erros === 0 && pulados === 0) {
      setTimeout(() => {
        setPreview([])
        setProgresso(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
        setSheetsUrl('')
      }, 3000)
    }
  }

  const nomeEmpresa = tenants.find(t => t.tenant_id === tenantId)?.nome_loja || ''
  const executarImportacao = tipoImport === 'clientes' ? executarImportacaoClientes : executarImportacaoVendas

  return (
    <div style={{ padding: '20px 0', maxWidth: 800 }}>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 20 }}>
        Importe dados de {tipoImport === 'clientes' ? 'clientes' : 'vendas'} em massa via CSV ou Google Sheets para qualquer empresa.
      </p>

      {/* Tabs tipo de importação */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '2px solid var(--border-light)' }}>
        <button
          onClick={() => {
            setTipoImport('clientes')
            setPreview([])
            setProgresso(null)
            setErrosDetalhados([])
            if (fileInputRef.current) fileInputRef.current.value = ''
          }}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '12px 20px', fontSize: 15, fontWeight: 700,
            color: tipoImport === 'clientes' ? 'var(--blue)' : 'var(--muted)',
            borderBottom: tipoImport === 'clientes' ? '3px solid var(--blue)' : '3px solid transparent',
            transition: 'all 0.15s',
          }}>
          Clientes
        </button>
        <button
          onClick={() => {
            setTipoImport('vendas')
            setPreview([])
            setProgresso(null)
            setErrosDetalhados([])
            if (fileInputRef.current) fileInputRef.current.value = ''
          }}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '12px 20px', fontSize: 15, fontWeight: 700,
            color: tipoImport === 'vendas' ? 'var(--blue)' : 'var(--muted)',
            borderBottom: tipoImport === 'vendas' ? '3px solid var(--blue)' : '3px solid transparent',
            transition: 'all 0.15s',
          }}>
          Vendas
        </button>
      </div>

      {/* Selecionar empresa */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
          Empresa de destino *
        </label>
        <select value={tenantId} onChange={e => setTenantId(e.target.value)} style={SI}>
          <option value="">-- Selecione a empresa --</option>
          {tenants.map(t => (
            <option key={t.tenant_id} value={t.tenant_id}>
              {t.nome_loja || t.tenant_id}
            </option>
          ))}
        </select>
      </div>

      {/* Tabs método */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid var(--border-light)' }}>
        <button
          onClick={() => setMetodo('csv')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '10px 16px', fontSize: 14, fontWeight: 600,
            color: metodo === 'csv' ? 'var(--blue)' : 'var(--muted)',
            borderBottom: metodo === 'csv' ? '2px solid var(--blue)' : '2px solid transparent',
          }}>
          Upload CSV
        </button>
        <button
          onClick={() => setMetodo('sheets')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '10px 16px', fontSize: 14, fontWeight: 600,
            color: metodo === 'sheets' ? 'var(--blue)' : 'var(--muted)',
            borderBottom: metodo === 'sheets' ? '2px solid var(--blue)' : '2px solid transparent',
          }}>
          Google Sheets
        </button>
      </div>

      {/* Upload CSV */}
      {metodo === 'csv' && (
        <div style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
            Arquivo CSV
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            disabled={importing}
            style={{
              ...SI,
              cursor: 'pointer',
              padding: '10px',
            }}
          />
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
            {tipoImport === 'clientes'
              ? 'Formato: instagram, whatsapp, data_cadastro, bloqueado, observacoes'
              : 'Formato: produto, modelo, cor, marca, tamanho, preco, codigo, cliente_nome, data_live, live_nome, sacolinha'}
          </p>
        </div>
      )}

      {/* Google Sheets */}
      {metodo === 'sheets' && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
              Link da planilha
            </label>
            <input
              value={sheetsUrl}
              onChange={e => setSheetsUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              disabled={importing}
              style={SI}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
              Google API Key (opcional se planilha for pública)
            </label>
            <input
              type="password"
              value={sheetsApiKey}
              onChange={e => setSheetsApiKey(e.target.value)}
              placeholder="AIza..."
              disabled={importing}
              style={SI}
            />
          </div>
          <button
            onClick={carregarGoogleSheets}
            disabled={importing || !sheetsUrl.trim()}
            className="btn-acao btn-blue"
            style={{ width: '100%', minHeight: 40, fontSize: 14, color: '#171717', fontWeight: 600 }}>
            {importing ? 'Carregando...' : 'Carregar Planilha'}
          </button>
        </div>
      )}

      {/* Preview */}
      {preview.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-body)', margin: 0 }}>
              Preview ({preview.length} linhas)
            </h3>
            <button
              onClick={() => {
                setPreview([])
                if (fileInputRef.current) fileInputRef.current.value = ''
                setSheetsUrl('')
              }}
              style={{
                background: 'none', border: 'none', color: 'var(--red)',
                cursor: 'pointer', fontSize: 12, textDecoration: 'underline'
              }}>
              Limpar
            </button>
          </div>

          <div style={{
            maxHeight: 300, overflowY: 'auto',
            border: '1px solid var(--border-light)', borderRadius: 8,
            background: 'var(--input-bg)'
          }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#1a2230', borderBottom: '1px solid var(--border-light)' }}>
                <tr>
                  {tipoImport === 'clientes' ? (
                    <>
                      <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--muted)', fontWeight: 600 }}>Instagram</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--muted)', fontWeight: 600 }}>WhatsApp</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--muted)', fontWeight: 600 }}>Bloqueado</th>
                    </>
                  ) : (
                    <>
                      <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--muted)', fontWeight: 600 }}>Produto</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--muted)', fontWeight: 600 }}>Cliente</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--muted)', fontWeight: 600 }}>Preço</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--muted)', fontWeight: 600 }}>Live</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 50).map((row, i) => {
                  if (tipoImport === 'clientes') {
                    const instagram = (row.instagram || row.Cliente || '').trim()
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '6px 10px', color: 'var(--text-body)' }}>
                          {instagram || <span style={{ color: 'var(--red)' }}>❌ vazio</span>}
                        </td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-body)' }}>
                          {row.whatsapp || row.Whatsapp || '-'}
                        </td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-body)' }}>
                          {row.bloqueado === 'TRUE' || row.Bloqueado === 'TRUE' ? '🔒' : '-'}
                        </td>
                      </tr>
                    )
                  } else {
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '6px 10px', color: 'var(--text-body)' }}>
                          {row.produto || <span style={{ color: 'var(--red)' }}>❌ vazio</span>}
                        </td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-body)' }}>
                          {row.cliente_nome || <span style={{ color: 'var(--red)' }}>❌ vazio</span>}
                        </td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-body)' }}>
                          {row.preco ? `R$ ${parseFloat(row.preco).toFixed(2)}` : '-'}
                        </td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-body)' }}>
                          {row.live_nome || '-'}
                        </td>
                      </tr>
                    )
                  }
                })}
              </tbody>
            </table>
          </div>
          {preview.length > 50 && (
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
              Mostrando 50 de {preview.length} linhas
            </p>
          )}
        </div>
      )}

      {/* Botão importar */}
      {preview.length > 0 && (
        <div>
          {!progresso && (
            <button
              onClick={executarImportacao}
              disabled={importing || !tenantId}
              className="btn-acao"
              style={{
                width: '100%', minHeight: 48, fontSize: 15, fontWeight: 700,
                background: 'var(--green)', color: '#fff'
              }}>
              {importing
                ? 'Importando...'
                : `Importar ${preview.length} ${tipoImport} para ${nomeEmpresa || 'empresa selecionada'}`}
            </button>
          )}

          {/* Barra de progresso */}
          {progresso && (
            <div style={{
              padding: 20, background: 'var(--input-bg)',
              border: '1px solid var(--border-light)', borderRadius: 8
            }}>
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-body)' }}>
                    {importing ? 'Importando...' : 'Concluído!'}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                    {progresso.atual} / {progresso.total}
                  </span>
                </div>
                <div style={{ width: '100%', height: 8, background: 'var(--border-light)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    width: `${(progresso.atual / progresso.total) * 100}%`,
                    height: '100%', background: 'var(--blue)',
                    transition: 'width 0.2s'
                  }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, fontSize: 12 }}>
                <div>
                  <div style={{ color: 'var(--muted)' }}>Inseridos</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--green)' }}>{progresso.inseridos}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--muted)' }}>Atualizados</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--blue)' }}>{progresso.atualizados}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--muted)' }}>Pulados</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--muted)' }}>{progresso.pulados}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--muted)' }}>Erros</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--red)' }}>{progresso.erros}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Lista de erros detalhados */}
      {errosDetalhados.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--red)', margin: 0 }}>
              ⚠️ Erros e Pulados ({errosDetalhados.length})
            </h3>
            <button
              onClick={() => {
                // Baixar CSV com os erros
                const csv = [
                  ['Linha', 'Instagram', 'Erro', 'Detalhes', 'Tipo'].join(','),
                  ...errosDetalhados.map(e => [
                    e.linha,
                    e.instagram,
                    `"${e.erro.replace(/"/g, '""')}"`,
                    `"${(e.detalhes || '').replace(/"/g, '""')}"`,
                    e.tipo
                  ].join(','))
                ].join('\n')

                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
                const link = document.createElement('a')
                link.href = URL.createObjectURL(blob)
                link.download = `erros_importacao_${hojeISO()}.csv`
                link.click()
                showToast('CSV de erros baixado!', 'success')
              }}
              className="btn-acao"
              style={{
                padding: '6px 12px', fontSize: 12, background: 'var(--blue)', color: '#171717'
              }}>
              Baixar CSV dos Erros
            </button>
          </div>

          <div style={{
            maxHeight: 400, overflowY: 'auto',
            border: '1px solid var(--red)', borderRadius: 8,
            background: 'rgba(239, 68, 68, 0.05)'
          }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#1a2230', borderBottom: '1px solid var(--red)' }}>
                <tr>
                  <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--red)', fontWeight: 600 }}>Linha</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--red)', fontWeight: 600 }}>Instagram</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--red)', fontWeight: 600 }}>Erro</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--red)', fontWeight: 600 }}>Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {errosDetalhados.map((erro, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '8px 10px', color: 'var(--text-body)', fontWeight: 700 }}>
                      {erro.linha}
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--text-body)' }}>
                      {erro.instagram}
                    </td>
                    <td style={{ padding: '8px 10px', color: erro.tipo === 'erro' ? 'var(--red)' : 'var(--muted)' }}>
                      {erro.erro}
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--muted)', fontSize: 11 }}>
                      {erro.detalhes || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{
            marginTop: 12, padding: '12px 16px', background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid var(--red)', borderRadius: 8
          }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-body)', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--red)' }}>💡 Como corrigir:</strong><br/>
              1. Baixe o CSV dos erros usando o botão acima<br/>
              2. Corrija os dados no seu arquivo original<br/>
              3. Tente importar novamente
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Aba: Usuários da Empresa ───────────────────────────────────
function AbaUsuarios({ showToast }) {
  const [tenants, setTenants] = useState([])
  const [tenantId, setTenantId] = useState('')
  const [usuarios, setUsuarios] = useState([])
  const [tenantPages, setTenantPages] = useState([])
  const [userPageIds, setUserPageIds] = useState([])
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getAllTenants().then(({ data }) => setTenants(data))
  }, [])

  useEffect(() => {
    if (!tenantId) {
      setUsuarios([])
      setTenantPages([])
      setSelectedUserId(null)
      return
    }
    carregarUsuarios()
    carregarPaginas()
  }, [tenantId])

  async function carregarUsuarios() {
    setLoading(true)
    try {
      // Busca TODOS os user_ids que estão na tabela portal_clientes
      const { data: clientesPortal } = await supabase
        .from('portal_clientes')
        .select('user_id')

      const idsClientesPortal = new Set(
        (clientesPortal || []).map(c => c.user_id).filter(Boolean)
      )

      // Busca TODOS os usuários do tenant
      const { data: todosUsuarios } = await supabase
        .from('users_perfil')
        .select('id, nome, email, username, role')
        .eq('tenant_id', tenantId)
        .order('nome')

      // Filtra em JavaScript: remove usuários que são clientes do portal
      const usuariosFiltrados = (todosUsuarios || []).filter(
        u => !idsClientesPortal.has(u.id)
      )

      console.log('🔍 Total de usuários do tenant:', todosUsuarios?.length || 0)
      console.log('🔍 Clientes do portal encontrados:', idsClientesPortal.size)
      console.log('🔍 Usuários após filtro:', usuariosFiltrados.length)

      setUsuarios(usuariosFiltrados)
    } catch (e) {
      showToast('Erro ao carregar usuários: ' + e.message, 'error')
      console.error('Erro ao carregar usuários:', e)
    } finally {
      setLoading(false)
    }
  }

  async function carregarPaginas() {
    const { data } = await getTenantPages(tenantId)
    setTenantPages(data || [])
  }

  async function selecionarUsuario(userId) {
    setSelectedUserId(userId)
    // Busca páginas do usuário
    const { data } = await supabase
      .from('pages_access')
      .select('page_id, pages!inner(id)')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)

    const pageIds = (data || []).map(item => item.pages.id)
    setUserPageIds(pageIds)
  }

  function togglePage(pageId) {
    setUserPageIds(prev =>
      prev.includes(pageId) ? prev.filter(id => id !== pageId) : [...prev, pageId]
    )
  }

  async function salvarPermissoes() {
    if (!selectedUserId) return
    setSaving(true)
    try {
      // Remove todas as permissões antigas
      await supabase
        .from('pages_access')
        .delete()
        .eq('user_id', selectedUserId)
        .eq('tenant_id', tenantId)

      // Insere novas permissões
      if (userPageIds.length > 0) {
        const rows = userPageIds.map(pageId => ({
          user_id: selectedUserId,
          tenant_id: tenantId,
          page_id: pageId
        }))
        const { error } = await supabase.from('pages_access').insert(rows)
        if (error) throw error
      }

      showToast('Permissões salvas!')
    } catch (e) {
      showToast('Erro: ' + e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const usuarioSelecionado = usuarios.find(u => u.id === selectedUserId)

  return (
    <div style={{ padding: '20px 0', maxWidth: 900 }}>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
        Gerencie usuários e suas permissões de páginas por empresa.
      </p>

      {/* Seletor de empresa */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Empresa</label>
        <select value={tenantId} onChange={e => setTenantId(e.target.value)} style={SI}>
          <option value="">-- Selecione uma empresa --</option>
          {tenants.map(t => (
            <option key={t.tenant_id} value={t.tenant_id}>{t.nome_loja}</option>
          ))}
        </select>
      </div>

      {tenantId && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

          {/* Coluna: Lista de usuários */}
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--blue)' }}>
              Usuários da empresa
            </h3>
            {loading ? (
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>Carregando...</p>
            ) : usuarios.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>Nenhum usuário encontrado</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {usuarios.map(u => (
                  <button
                    key={u.id}
                    onClick={() => selecionarUsuario(u.id)}
                    style={{
                      background: selectedUserId === u.id ? 'rgba(59,130,246,0.15)' : 'var(--card-bg)',
                      border: selectedUserId === u.id ? '1px solid var(--blue)' : '1px solid var(--border-light)',
                      borderRadius: 6,
                      padding: '10px 12px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-body)' }}>
                      {u.nome || u.email}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      {u.email} · {u.role}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Coluna: Páginas do usuário selecionado */}
          <div>
            {selectedUserId ? (
              <>
                <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--blue)' }}>
                  Páginas de {usuarioSelecionado?.nome || usuarioSelecionado?.email}
                </h3>

                {tenantPages.length === 0 ? (
                  <p style={{ color: 'var(--muted)', fontSize: 13 }}>
                    Esta empresa não tem páginas configuradas. Vá em "Páginas por Empresa" primeiro.
                  </p>
                ) : (
                  <>
                    <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {tenantPages.map(p => (
                        <label
                          key={p.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '8px 10px',
                            background: 'var(--card-bg)',
                            border: '1px solid var(--border-light)',
                            borderRadius: 6,
                            cursor: 'pointer',
                            transition: 'all 0.15s'
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--table-row-hover)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'var(--card-bg)'}
                        >
                          <input
                            type="checkbox"
                            checked={userPageIds.includes(p.id)}
                            onChange={() => togglePage(p.id)}
                            style={{ accentColor: 'var(--blue)', width: 16, height: 16, cursor: 'pointer' }}
                          />
                          <span style={{ fontSize: 13, color: 'var(--text-body)', flex: 1 }}>{p.label}</span>
                          <span style={{ fontSize: 11, color: 'var(--muted)' }}>{p.category}</span>
                        </label>
                      ))}
                    </div>

                    <button
                      className="btn-acao btn-blue"
                      onClick={salvarPermissoes}
                      disabled={saving}
                      style={{ width: '100%', minHeight: 40, fontSize: 14, color: '#171717', fontWeight: 700 }}
                    >
                      {saving ? 'Salvando…' : 'Salvar Permissões'}
                    </button>
                  </>
                )}
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
                Selecione um usuário à esquerda
              </div>
            )}
          </div>

        </div>
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
          <TabBtn label="Empresa"             active={aba === 'empresa'}  onClick={() => setAba('empresa')} />
          <TabBtn label="Páginas por Empresa" active={aba === 'paginas'}  onClick={() => setAba('paginas')} />
          <TabBtn label="Usuários da Empresa" active={aba === 'usuarios'} onClick={() => setAba('usuarios')} />
          <TabBtn label="Importar Bling"      active={aba === 'bling'}    onClick={() => setAba('bling')} />
          <TabBtn label="Importar Dados"      active={aba === 'importar'} onClick={() => setAba('importar')} />
        </div>
        {aba === 'empresa'  && <AbaEmpresa showToast={showToast} />}
        {aba === 'paginas'  && <AbaPaginas showToast={showToast} />}
        {aba === 'usuarios' && <AbaUsuarios showToast={showToast} />}
        {aba === 'bling'    && <AbaImportarBling showToast={showToast} />}
        {aba === 'importar' && <AbaImportarDados showToast={showToast} />}
      </section>
    </AppShell>
  )
}
