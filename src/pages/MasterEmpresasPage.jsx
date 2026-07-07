import { useState, useEffect, useRef } from 'react'
import Papa from 'papaparse'
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

// ── Aba: Importar Dados ────────────────────────────────────────
function AbaImportarDados({ showToast }) {
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

  // Importar dados
  async function executarImportacao() {
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
      const data_cadastro = row.data_cadastro || row['Data cadastro'] || new Date().toISOString().split('T')[0]
      const bloqueado = row.bloqueado === 'TRUE' || row.bloqueado === 'true' || row.bloqueado === '☑' || row.Bloqueado === 'TRUE'
      const msg_bloqueio = row.observacoes || row['Observações'] || row.msg_bloqueio || ''

      if (!instagram) {
        pulados++
        listaErros.push({
          linha: i + 2, // +2 porque linha 1 é header e array começa em 0
          instagram: instagram || '(vazio)',
          erro: 'Instagram vazio ou inválido',
          tipo: 'pulado'
        })
        setProgresso(p => ({ ...p, atual: i + 1, pulados }))
        continue
      }

      try {
        // Verificar se existe
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
          // Atualizar
          const { error } = await supabase
            .from('clientes')
            .update(clienteData)
            .eq('id', existente.id)

          if (error) throw error
          atualizados++
        } else {
          // Inserir
          const { error } = await supabase
            .from('clientes')
            .insert(clienteData)

          if (error) throw error
          inseridos++
        }

        setProgresso(p => ({ ...p, atual: i + 1, inseridos, atualizados }))

        // Pausa de 50ms para não sobrecarregar
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

    // NÃO limpar preview se houver erros (para o usuário revisar)
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

  return (
    <div style={{ padding: '20px 0', maxWidth: 800 }}>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 20 }}>
        Importe dados de clientes em massa via CSV ou Google Sheets para qualquer empresa.
      </p>

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
          📁 Upload CSV
        </button>
        <button
          onClick={() => setMetodo('sheets')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '10px 16px', fontSize: 14, fontWeight: 600,
            color: metodo === 'sheets' ? 'var(--blue)' : 'var(--muted)',
            borderBottom: metodo === 'sheets' ? '2px solid var(--blue)' : '2px solid transparent',
          }}>
          📊 Google Sheets
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
            Formato: instagram, whatsapp, data_cadastro, bloqueado, observacoes
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
                  <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--muted)', fontWeight: 600 }}>Instagram</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--muted)', fontWeight: 600 }}>WhatsApp</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--muted)', fontWeight: 600 }}>Bloqueado</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 50).map((row, i) => {
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
              {importing ? 'Importando...' : `Importar ${preview.length} clientes para ${nomeEmpresa || 'empresa selecionada'}`}
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
                link.download = `erros_importacao_${new Date().toISOString().slice(0,10)}.csv`
                link.click()
                showToast('CSV de erros baixado!', 'success')
              }}
              className="btn-acao"
              style={{
                padding: '6px 12px', fontSize: 12, background: 'var(--blue)', color: '#171717'
              }}>
              📥 Baixar CSV dos Erros
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
          <TabBtn label="Importar Dados"      active={aba === 'importar'} onClick={() => setAba('importar')} />
        </div>
        {aba === 'empresa'  && <AbaEmpresa showToast={showToast} />}
        {aba === 'paginas'  && <AbaPaginas showToast={showToast} />}
        {aba === 'importar' && <AbaImportarDados showToast={showToast} />}
      </section>
    </AppShell>
  )
}
