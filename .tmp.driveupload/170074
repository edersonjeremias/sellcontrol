import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import AppShell from '../../components/ui/AppShell'
import {
  fmtR, getCreditosClientes, salvarCredito, excluirCredito, getClientesRelatorio,
} from '../../services/relatorioService'

const S = {
  inp: { background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:6, color:'var(--input-text)', padding:'7px 10px', fontSize:13, outline:'none' },
  th:  { background:'var(--table-header-bg)', color:'var(--table-header-text)', fontSize:11, fontWeight:700, textAlign:'left', padding:'8px 10px', textTransform:'uppercase', letterSpacing:'0.4px', whiteSpace:'nowrap' },
  td:  { padding:'7px 10px', color:'var(--text-body)', fontSize:12, whiteSpace:'nowrap' },
  btn: { background:'var(--blue)', color:'#0f0f0f', border:'none', borderRadius:6, padding:'8px 16px', fontWeight:700, cursor:'pointer', fontSize:13 },
  sec: { background:'var(--btn-cancel-bg)', color:'var(--btn-cancel-text)', border:'none', borderRadius:6, padding:'8px 16px', fontWeight:600, cursor:'pointer', fontSize:13 },
  del: { background:'var(--red)', color:'#0f0f0f', border:'none', borderRadius:6, padding:'8px 16px', fontWeight:700, cursor:'pointer', fontSize:13 },
  ico: { background:'none', border:'none', cursor:'pointer', padding:'2px 4px', fontSize:14, lineHeight:1 },
}

function fmtData(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

function primeiroDiaMes() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`
}
function ultimoDiaMes() {
  const d = new Date()
  const fim = new Date(d.getFullYear(), d.getMonth()+1, 0)
  return `${fim.getFullYear()}-${String(fim.getMonth()+1).padStart(2,'0')}-${String(fim.getDate()).padStart(2,'0')}`
}

function Campo({ label, children }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
      <label style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.4px' }}>{label}</label>
      {children}
    </div>
  )
}

function ClienteAutocomplete({ value, onChange, clientes }) {
  const [aberto, setAberto] = useState(false)
  const [filtro, setFiltro] = useState(value)
  const wrapRef             = useRef(null)

  useEffect(() => { setFiltro(value) }, [value])

  useEffect(() => {
    function handler(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setAberto(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const sugestoes = filtro.trim()
    ? clientes.filter(c => c.toLowerCase().includes(filtro.toLowerCase())).slice(0, 10)
    : clientes.slice(0, 10)

  function selecionar(c) { setFiltro(c); onChange(c); setAberto(false) }

  return (
    <div ref={wrapRef} style={{ position:'relative' }}>
      <input
        value={filtro}
        onChange={e => { setFiltro(e.target.value); onChange(e.target.value); setAberto(true) }}
        onFocus={() => setAberto(true)}
        placeholder="@instagram ou nome"
        style={{ ...S.inp, width:'100%' }}
        autoComplete="off"
      />
      {aberto && sugestoes.length > 0 && (
        <div style={{
          position:'absolute', top:'calc(100% + 2px)', left:0, right:0, zIndex:9999,
          background:'#1a2230', border:'1px solid var(--border-light)',
          borderRadius:8, boxShadow:'0 8px 24px rgba(0,0,0,.6)',
          maxHeight:220, overflowY:'auto',
        }}>
          {sugestoes.map(c => (
            <button key={c} type="button" onClick={() => selecionar(c)} style={{
              display:'block', width:'100%', textAlign:'left', padding:'9px 14px',
              background:'none', border:'none', color:'var(--text-body)', fontSize:13,
              cursor:'pointer', borderBottom:'1px solid var(--border-light)',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--table-row-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >{c}</button>
          ))}
        </div>
      )}
    </div>
  )
}

const VAZIO = { cliente:'', valor:'', observacao:'' }

export default function CreditosPage() {
  const { profile }   = useAuth()
  const { showToast } = useApp()
  const tenantId      = profile?.tenant_id

  const [dataIni, setDataIni]       = useState(primeiroDiaMes)
  const [dataFim, setDataFim]       = useState(ultimoDiaMes)
  const [creditos, setCreditos]     = useState([])
  const [clientes, setClientes]     = useState([])
  const [carregando, setCarregando] = useState(false)
  const [form, setForm]             = useState(VAZIO)
  const [editId, setEditId]         = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)

  const carregar = useCallback(async () => {
    if (!tenantId) return
    setCarregando(true)
    try { setCreditos(await getCreditosClientes(tenantId, { dataInicio: dataIni, dataFim })) }
    catch { showToast('Erro ao carregar créditos.', 'error') }
    setCarregando(false)
  }, [tenantId, dataIni, dataFim, showToast])

  useEffect(() => {
    if (!tenantId) return
    getClientesRelatorio(tenantId).then(setClientes).catch(() => {})
    carregar()
  }, [tenantId, carregar])

  const ch = (campo, val) => setForm(f => ({ ...f, [campo]: val }))

  async function handleSalvar() {
    if (!form.cliente?.trim()) return showToast('Informe o cliente.', 'error')
    if (!form.valor) return showToast('Informe o valor.', 'error')
    try {
      await salvarCredito(tenantId, { ...form, id: editId || undefined })
      showToast(editId ? 'Crédito atualizado!' : 'Crédito lançado!', 'success')
      setForm(VAZIO); setEditId(null)
      carregar()
    } catch (e) { showToast('Erro ao salvar: ' + (e.message || ''), 'error') }
  }

  function editar(c) {
    setForm({ cliente: c.cliente || '', valor: c.valor || '', observacao: c.observacao || '' })
    setEditId(c.id)
    window.scrollTo({ top:0, behavior:'smooth' })
  }

  async function handleExcluir(id) {
    try { await excluirCredito(id); showToast('Excluído!', 'success'); carregar() }
    catch { showToast('Erro ao excluir.', 'error') }
    setConfirmDel(null)
  }

  const totalSaldo    = creditos.reduce((s, c) => s + (Number(c.saldo)||0), 0)
  const totalOriginal = creditos.reduce((s, c) => s + (Number(c.valor)||0), 0)

  return (
    <AppShell title="Créditos de Clientes" hideTitle>
      {/* Filtro */}
      <div style={{ display:'flex', alignItems:'center', flexWrap:'wrap', gap:8, padding:'12px 16px', borderBottom:'1px solid var(--border-light)', background:'var(--header-bg)' }}>
        <span style={{ fontSize:14, fontWeight:700, color:'var(--text-header)' }}>Créditos de Clientes</span>
        <div style={{ flex:1 }} />
        <label style={{ fontSize:12, color:'var(--muted)' }}>De</label>
        <input type="date" value={dataIni} onChange={e => setDataIni(e.target.value)} style={S.inp} />
        <label style={{ fontSize:12, color:'var(--muted)' }}>Até</label>
        <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} style={S.inp} />
        <button onClick={carregar} style={S.btn}>Filtrar</button>
      </div>

      <div style={{ padding:16, display:'grid', gap:16 }}>
        {/* Info integração */}
        <div style={{ background:'rgba(138,180,248,0.08)', border:'1px solid rgba(138,180,248,0.3)', borderRadius:8, padding:'10px 14px', fontSize:12, color:'var(--blue)' }}>
          Os créditos lançados aqui aparecem automaticamente na página <strong>Cobranças</strong> ao aplicar desconto para o cliente.
        </div>

        {/* Formulário */}
        <div style={{ background:'var(--card-bg)', border:'1px solid var(--border-light)', borderRadius:8, padding:16 }}>
          <h4 style={{ margin:'0 0 14px', color:'var(--text-header)', fontSize:14 }}>
            {editId ? 'Editar Crédito' : 'Lançar Crédito'}
          </h4>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:10 }}>
            <Campo label="Cliente *">
              <ClienteAutocomplete value={form.cliente} onChange={v => ch('cliente', v)} clientes={clientes} />
            </Campo>
            <Campo label="Valor *">
              <input type="number" step="0.01" value={form.valor} onChange={e => ch('valor', e.target.value)} style={S.inp} placeholder="0,00" />
            </Campo>
            <Campo label="Motivo / Observação">
              <input value={form.observacao} onChange={e => ch('observacao', e.target.value)} style={S.inp} placeholder="ex: Devolução, Presente…" />
            </Campo>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:14 }}>
            <button onClick={handleSalvar} style={S.btn}>{editId ? 'Atualizar' : 'Lançar Crédito'}</button>
            {editId && <button onClick={() => { setForm(VAZIO); setEditId(null) }} style={S.sec}>Cancelar</button>}
          </div>
        </div>

        {/* Totalizadores */}
        {!carregando && creditos.length > 0 && (
          <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
            <div style={{ background:'var(--card-bg)', border:'1px solid var(--border-light)', borderRadius:8, padding:'10px 16px' }}>
              <div style={{ fontSize:11, color:'var(--muted)' }}>Total Lançado</div>
              <div style={{ fontSize:18, fontWeight:800, color:'var(--blue)' }}>{fmtR(totalOriginal)}</div>
            </div>
            <div style={{ background:'var(--card-bg)', border:'1px solid var(--border-light)', borderRadius:8, padding:'10px 16px' }}>
              <div style={{ fontSize:11, color:'var(--muted)' }}>Saldo Disponível</div>
              <div style={{ fontSize:18, fontWeight:800, color:'var(--green)' }}>{fmtR(totalSaldo)}</div>
            </div>
          </div>
        )}

        {/* Lista */}
        {carregando ? <p style={{ color:'var(--muted)' }}>Carregando…</p> : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr>
                  {['Data','Cliente','Valor Original','Saldo','Utilizado','Motivo',''].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {creditos.map(c => (
                  <tr key={c.id} style={{ borderBottom:'1px solid var(--border-light)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--table-row-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                    <td style={S.td}>{fmtData(c.data)}</td>
                    <td style={S.td}>{c.cliente}</td>
                    <td style={{ ...S.td, color:'var(--blue)', fontWeight:600 }}>{fmtR(c.valor)}</td>
                    <td style={{ ...S.td, color: Number(c.saldo) > 0 ? 'var(--green)' : 'var(--muted)', fontWeight:600 }}>{fmtR(c.saldo)}</td>
                    <td style={{ ...S.td, color:'var(--muted)' }}>{fmtR(c.utilizado)}</td>
                    <td style={{ ...S.td, color:'var(--muted)' }}>{c.observacao}</td>
                    <td style={S.td}>
                      <div style={{ display:'flex', gap:4 }}>
                        <button onClick={() => editar(c)} style={S.ico} title="Editar">✏️</button>
                        <button onClick={() => setConfirmDel({ id:c.id, label:c.cliente })} style={S.ico} title="Excluir">🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!creditos.length && (
                  <tr><td colSpan={7} style={{ textAlign:'center', padding:24, color:'var(--muted)' }}>Nenhum crédito no período.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal exclusão */}
      {confirmDel && (
        <div className="modal-overlay" onClick={() => setConfirmDel(null)}>
          <div className="modal-card mini" onClick={e => e.stopPropagation()} style={{ maxWidth:360 }}>
            <div className="modal-header"><h3>Confirmar exclusão</h3></div>
            <div className="modal-body" style={{ paddingBottom:20 }}>
              <p style={{ margin:0 }}>Excluir crédito de <strong>{confirmDel.label}</strong>?</p>
              <p style={{ marginTop:8, fontSize:12, color:'var(--yellow)' }}>Se o crédito já foi utilizado em uma cobrança, o abatimento não será revertido automaticamente.</p>
            </div>
            <div className="modal-footer">
              <button onClick={() => setConfirmDel(null)} style={{ ...S.sec, flex:1 }}>Cancelar</button>
              <button onClick={() => handleExcluir(confirmDel.id)} style={{ ...S.del, flex:1 }}>Excluir</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}
