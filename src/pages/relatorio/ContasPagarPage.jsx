import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import AppShell from '../../components/ui/AppShell'
import { fmtR, getContasPagar, salvarContaPagar, excluirContaPagar } from '../../services/relatorioService'

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

const VAZIO = { categoria:'', tipo_despesa:'Fixa', data_vencimento:'', valor:'', status:'A PAGAR', data_pagamento:'', observacao:'' }
const TIPOS = ['Fixa','Variável','Pró-Labore','Compra/Revenda']

export default function ContasPagarPage() {
  const { profile }   = useAuth()
  const { showToast } = useApp()
  const tenantId      = profile?.tenant_id

  const [dataIni, setDataIni]       = useState(primeiroDiaMes)
  const [dataFim, setDataFim]       = useState(ultimoDiaMes)
  const [contas, setContas]         = useState([])
  const [carregando, setCarregando] = useState(false)
  const [form, setForm]             = useState(VAZIO)
  const [editId, setEditId]         = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)

  const carregar = useCallback(async () => {
    if (!tenantId) return
    setCarregando(true)
    try { setContas(await getContasPagar(tenantId, { dataInicio: dataIni, dataFim })) }
    catch { showToast('Erro ao carregar contas.', 'error') }
    setCarregando(false)
  }, [tenantId, dataIni, dataFim, showToast])

  useEffect(() => { carregar() }, [tenantId]) // eslint-disable-line

  const ch = (campo, val) => setForm(f => ({ ...f, [campo]: val }))

  async function handleSalvar() {
    if (!form.categoria?.trim()) return showToast('Informe a categoria.', 'error')
    if (!form.valor) return showToast('Informe o valor.', 'error')
    try {
      await salvarContaPagar(tenantId, { ...form, id: editId })
      showToast(editId ? 'Conta atualizada!' : 'Conta salva!', 'success')
      setForm(VAZIO); setEditId(null)
      carregar()
    } catch { showToast('Erro ao salvar.', 'error') }
  }

  function editar(c) {
    setForm({ categoria:c.categoria||'', tipo_despesa:c.tipo_despesa||'Fixa', data_vencimento:c.data_vencimento||'', valor:c.valor||'', status:c.status||'A PAGAR', data_pagamento:c.data_pagamento||'', observacao:c.observacao||'' })
    setEditId(c.id)
    window.scrollTo({ top:0, behavior:'smooth' })
  }

  async function handleExcluir(id) {
    try { await excluirContaPagar(id); showToast('Excluído!', 'success'); carregar() }
    catch { showToast('Erro ao excluir.', 'error') }
    setConfirmDel(null)
  }

  const totalPago  = contas.filter(c => c.status === 'PAGO').reduce((s, c) => s + (Number(c.valor)||0), 0)
  const totalAPagar = contas.filter(c => c.status !== 'PAGO').reduce((s, c) => s + (Number(c.valor)||0), 0)

  return (
    <AppShell title="Contas a Pagar" hideTitle>
      {/* Filtro */}
      <div style={{ display:'flex', alignItems:'center', flexWrap:'wrap', gap:8, padding:'12px 16px', borderBottom:'1px solid var(--border-light)', background:'var(--header-bg)' }}>
        <span style={{ fontSize:14, fontWeight:700, color:'var(--text-header)' }}>Contas a Pagar</span>
        <div style={{ flex:1 }} />
        <label style={{ fontSize:12, color:'var(--muted)' }}>De</label>
        <input type="date" value={dataIni} onChange={e => setDataIni(e.target.value)} style={S.inp} />
        <label style={{ fontSize:12, color:'var(--muted)' }}>Até</label>
        <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} style={S.inp} />
        <button onClick={carregar} style={S.btn}>Filtrar</button>
      </div>

      <div style={{ padding:16, display:'grid', gap:16 }}>
        {/* Formulário */}
        <div style={{ background:'var(--card-bg)', border:'1px solid var(--border-light)', borderRadius:8, padding:16 }}>
          <h4 style={{ margin:'0 0 14px', color:'var(--text-header)', fontSize:14 }}>
            {editId ? 'Editar Conta' : 'Nova Conta'}
          </h4>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:10 }}>
            <Campo label="Categoria *">
              <input value={form.categoria} onChange={e => ch('categoria', e.target.value)} style={S.inp} placeholder="ex: Aluguel, Luz, Fornecedor…" />
            </Campo>
            <Campo label="Tipo">
              <select value={form.tipo_despesa} onChange={e => ch('tipo_despesa', e.target.value)} style={S.inp}>
                {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Campo>
            <Campo label="Vencimento">
              <input type="date" value={form.data_vencimento} onChange={e => ch('data_vencimento', e.target.value)} style={S.inp} />
            </Campo>
            <Campo label="Valor *">
              <input type="number" step="0.01" value={form.valor} onChange={e => ch('valor', e.target.value)} style={S.inp} placeholder="0,00" />
            </Campo>
            <Campo label="Status">
              <select value={form.status} onChange={e => ch('status', e.target.value)} style={S.inp}>
                <option value="A PAGAR">A PAGAR</option>
                <option value="PAGO">PAGO</option>
              </select>
            </Campo>
            <Campo label="Data Pagamento">
              <input type="date" value={form.data_pagamento} onChange={e => ch('data_pagamento', e.target.value)} style={S.inp} />
            </Campo>
            <Campo label="Observação">
              <input value={form.observacao} onChange={e => ch('observacao', e.target.value)} style={{ ...S.inp, gridColumn:'1/-1' }} />
            </Campo>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:14 }}>
            <button onClick={handleSalvar} style={S.btn}>{editId ? 'Atualizar' : 'Salvar'}</button>
            {editId && <button onClick={() => { setForm(VAZIO); setEditId(null) }} style={S.sec}>Cancelar</button>}
          </div>
        </div>

        {/* Totalizadores */}
        {!carregando && contas.length > 0 && (
          <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
            <div style={{ background:'var(--card-bg)', border:'1px solid var(--border-light)', borderRadius:8, padding:'10px 16px' }}>
              <div style={{ fontSize:11, color:'var(--muted)' }}>A Pagar</div>
              <div style={{ fontSize:18, fontWeight:800, color:'var(--yellow)' }}>{fmtR(totalAPagar)}</div>
            </div>
            <div style={{ background:'var(--card-bg)', border:'1px solid var(--border-light)', borderRadius:8, padding:'10px 16px' }}>
              <div style={{ fontSize:11, color:'var(--muted)' }}>Pago</div>
              <div style={{ fontSize:18, fontWeight:800, color:'var(--green)' }}>{fmtR(totalPago)}</div>
            </div>
            <div style={{ background:'var(--card-bg)', border:'1px solid var(--border-light)', borderRadius:8, padding:'10px 16px' }}>
              <div style={{ fontSize:11, color:'var(--muted)' }}>Total</div>
              <div style={{ fontSize:18, fontWeight:800, color:'var(--blue)' }}>{fmtR(totalAPagar + totalPago)}</div>
            </div>
          </div>
        )}

        {/* Lista */}
        {carregando ? <p style={{ color:'var(--muted)' }}>Carregando…</p> : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr>
                  {['Categoria','Tipo','Vencimento','Valor','Status','Pago em','Obs.',''].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {contas.map(c => (
                  <tr key={c.id} style={{ borderBottom:'1px solid var(--border-light)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--table-row-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                    <td style={S.td}>{c.categoria}</td>
                    <td style={S.td}>{c.tipo_despesa}</td>
                    <td style={S.td}>{fmtData(c.data_vencimento)}</td>
                    <td style={{ ...S.td, color:'var(--red)', fontWeight:600 }}>{fmtR(c.valor)}</td>
                    <td style={{ ...S.td, color: c.status==='PAGO' ? 'var(--green)' : 'var(--yellow)', fontWeight:600 }}>{c.status}</td>
                    <td style={S.td}>{fmtData(c.data_pagamento)}</td>
                    <td style={{ ...S.td, color:'var(--muted)', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis' }}>{c.observacao}</td>
                    <td style={S.td}>
                      <div style={{ display:'flex', gap:4 }}>
                        <button onClick={() => editar(c)} style={S.ico} title="Editar">✏️</button>
                        <button onClick={() => setConfirmDel({ id:c.id, label:c.categoria })} style={S.ico} title="Excluir">🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!contas.length && (
                  <tr><td colSpan={8} style={{ textAlign:'center', padding:24, color:'var(--muted)' }}>Nenhuma conta cadastrada no período.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal confirmação exclusão */}
      {confirmDel && (
        <div className="modal-overlay" onClick={() => setConfirmDel(null)}>
          <div className="modal-card mini" onClick={e => e.stopPropagation()} style={{ maxWidth:360 }}>
            <div className="modal-header"><h3>Confirmar exclusão</h3></div>
            <div className="modal-body" style={{ paddingBottom:20 }}>
              <p style={{ margin:0 }}>Excluir <strong>{confirmDel.label}</strong>? Esta ação não pode ser desfeita.</p>
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
