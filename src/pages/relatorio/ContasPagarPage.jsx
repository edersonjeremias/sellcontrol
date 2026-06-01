import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import AppShell from '../../components/ui/AppShell'
import {
  fmtR,
  getContasPagar, salvarContaPagar, excluirContaPagar,
  pagarContaPagar, inserirContasPagarLote, getCategoriasContasPagar,
} from '../../services/relatorioService'

// ── Helpers ────────────────────────────────────────────────────
const HOJE = new Date().toISOString().slice(0, 10)

function primeiroDiaMes() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`
}
function ultimoDiaMes() {
  const d = new Date()
  const fim = new Date(d.getFullYear(), d.getMonth()+1, 0)
  return `${fim.getFullYear()}-${String(fim.getMonth()+1).padStart(2,'0')}-${String(fim.getDate()).padStart(2,'0')}`
}
function fmtData(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}
function parseValor(s) {
  if (!s) return 0
  return parseFloat(String(s).replace(/\./g, '').replace(',', '.')) || 0
}
function mascaraValor(s) {
  let v = String(s).replace(/\D/g, '')
  if (!v) return ''
  v = (parseInt(v, 10) / 100).toFixed(2)
  v = v.replace('.', ',').replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1.')
  return v
}

// Gera datas para repetição
function gerarDatas(venc, freq, parcelas) {
  const [ano, mes, dia] = venc.split('-').map(Number)
  return Array.from({ length: parcelas }, (_, i) => {
    const d = new Date(ano, mes - 1, dia)
    if (freq === 'mensal')    d.setMonth(d.getMonth() + i)
    else if (freq === 'quin') d.setDate(d.getDate() + 15 * i)
    else if (freq === 'sem')  d.setDate(d.getDate() + 7 * i)
    return d.toISOString().slice(0, 10)
  })
}

const TIPOS = ['Fixa', 'Variável', 'Compra/Revenda']

const CATS_DEFAULT = [
  'Impulsionamento', 'Pro labore', 'Funcionario', 'Manutenção',
  'Compras revenda', 'Compras', 'Emprestimo', 'Despesas/Viagem',
  'Despesas', 'Mercado', 'Imposto', 'Devolução cliente', 'Investimento',
]

const SUBCATS_PROLABORE = [
  'Mercado', 'Moradia', 'Transporte', 'Saude', 'Filhos', 'Lazer',
  'Emprestimos / Financiamento', 'Compras Diversas', 'Investimento',
  'Alimentação', 'Pet', 'Presente',
]

function isProLabore(cat) {
  const c = (cat || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  return c.includes('pro') && c.includes('labore')
}

const S = {
  inp:  { background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:6, color:'var(--input-text)', padding:'8px 11px', fontSize:14, outline:'none', width:'100%' },
  inpS: { background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:6, color:'var(--input-text)', padding:'6px 9px', fontSize:14, outline:'none' },
  th:   { background:'var(--table-header-bg)', color:'var(--table-header-text)', fontSize:12, fontWeight:700, textAlign:'left', padding:'8px 10px', textTransform:'uppercase', letterSpacing:'0.4px', whiteSpace:'nowrap' },
  td:   { padding:'9px 10px', color:'var(--text-body)', fontSize:14 },
  btn:  { background:'var(--blue)', color:'#0f0f0f', border:'none', borderRadius:6, padding:'7px 14px', fontWeight:700, cursor:'pointer', fontSize:14 },
  sec:  { background:'var(--btn-cancel-bg)', color:'var(--btn-cancel-text)', border:'none', borderRadius:6, padding:'7px 14px', fontWeight:600, cursor:'pointer', fontSize:14 },
  del:  { background:'var(--red)', color:'#0f0f0f', border:'none', borderRadius:6, padding:'7px 14px', fontWeight:700, cursor:'pointer', fontSize:14 },
  ok:   { background:'var(--green)', color:'#0f0f0f', border:'none', borderRadius:6, padding:'7px 14px', fontWeight:700, cursor:'pointer', fontSize:14 },
}

function Campo({ label, children }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
      <label style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.4px' }}>{label}</label>
      {children}
    </div>
  )
}

function FreqRadios({ value, onChange, name }) {
  const opts = [
    { v:'unica', l:'1x', title:'Uma parcela' },
    { v:'sem',   l:'7d', title:'Semanal — 4 parcelas' },
    { v:'quin',  l:'15d', title:'Quinzenal — 2 parcelas' },
    { v:'mensal',l:'30d', title:'Mensal — 12 parcelas' },
  ]
  return (
    <div style={{ display:'flex', gap:6, alignItems:'center', background:'rgba(0,0,0,0.15)', padding:'4px 8px', borderRadius:6, border:'1px solid var(--border-light)' }}>
      {opts.map(o => (
        <label key={o.v} title={o.title} style={{ display:'flex', alignItems:'center', gap:3, fontSize:12, fontWeight:700, color:'var(--text-body)', cursor:'pointer', whiteSpace:'nowrap' }}>
          <input type="radio" name={name} value={o.v} checked={value===o.v} onChange={() => onChange(o.v)} style={{ margin:0, width:12, height:12, cursor:'pointer' }} />
          {o.l}
        </label>
      ))}
    </div>
  )
}

// Formulário base (compartilhado entre Quick Add e Modal Avançado)
const FORM_VAZIO = { observacao:'', categoria:'', tipo_despesa:'Fixa', subcat:'', valor:'', data_vencimento:HOJE, status:'A PAGAR', data_pagamento:'' }

// ════════════════════════════════════════════════════════════════
export default function ContasPagarPage() {
  const { profile }   = useAuth()
  const { showToast } = useApp()
  const tenantId      = profile?.tenant_id

  // ── Dados ──────────────────────────────────────────────────
  const [contas,      setContas]      = useState([])
  const [categorias,  setCategorias]  = useState([])
  const [carregando,  setCarregando]  = useState(false)

  // ── Filtros ────────────────────────────────────────────────
  const [dataIni,    setDataIni]    = useState(primeiroDiaMes)
  const [dataFim,    setDataFim]    = useState(ultimoDiaMes)
  const [busca,      setBusca]      = useState('')
  const [filtroSt,   setFiltroSt]   = useState('A PAGAR')

  // ── Abas ───────────────────────────────────────────────────
  const [aba,        setAba]        = useState('lancamentos')

  // ── Grupos abertos ─────────────────────────────────────────
  const [abertos,    setAbertos]    = useState(new Set())

  // ── Modais ─────────────────────────────────────────────────
  const [modalNova,   setModalNova]   = useState(false)
  const [modalEdit,   setModalEdit]   = useState(null)   // conta completa
  const [modalPagar,  setModalPagar]  = useState(null)   // { id }
  const [dataPag,     setDataPag]     = useState(HOJE)
  const [confirmDel,  setConfirmDel]  = useState(null)
  const [salvando,    setSalvando]    = useState(false)

  // ── Formulário modal novo / editar ─────────────────────────
  const [form,    setForm]    = useState(FORM_VAZIO)
  const [freqNova, setFreqNova] = useState('unica')

  // ── Quick Add bar ──────────────────────────────────────────
  const [qa, setQa] = useState({ observacao:'', categoria:'', tipo_despesa:'Fixa', subcat:'', valor:'', data_vencimento:HOJE, pago:false })
  const [qaFreq, setQaFreq] = useState('unica')
  const qaDescRef = useRef(null)

  // ── Carregar ───────────────────────────────────────────────
  const carregar = useCallback(async () => {
    if (!tenantId) return
    setCarregando(true)
    try {
      const dados = await getContasPagar(tenantId, { dataInicio: dataIni, dataFim })
      setContas(dados)
    } catch { showToast('Erro ao carregar contas.', 'error') }
    setCarregando(false)
  }, [tenantId, dataIni, dataFim, showToast])

  useEffect(() => {
    if (!tenantId) return
    getCategoriasContasPagar(tenantId).then(data => {
      // Mescla categorias do banco com as defaults, sem duplicatas
      const merged = [...new Set([...CATS_DEFAULT, ...data])].sort()
      setCategorias(merged)
    }).catch(() => setCategorias(CATS_DEFAULT))
    carregar()
  }, [tenantId]) // eslint-disable-line

  // ── Filtrar ────────────────────────────────────────────────
  const contasFiltradas = contas.filter(c => {
    if (filtroSt !== 'Todos' && c.status !== filtroSt) return false
    if (!busca.trim()) return true
    const termos = busca.toLowerCase().split(/[\s,]+/).filter(Boolean)
    const txt = [c.observacao, c.categoria, c.tipo_despesa, c.status, c.valor].join(' ').toLowerCase()
    return termos.every(t => txt.includes(t))
  })

  const totalAPagar  = contasFiltradas.filter(c => c.status !== 'PAGO').reduce((s, c) => s + (Number(c.valor)||0), 0)
  const totalPago    = contasFiltradas.filter(c => c.status === 'PAGO').reduce((s, c) => s + (Number(c.valor)||0), 0)

  // ── Grupos por data ────────────────────────────────────────
  const grupos = {}
  contasFiltradas.forEach(c => {
    const d = c.data_vencimento || '0000-00-00'
    if (!grupos[d]) grupos[d] = []
    grupos[d].push(c)
  })
  const datasOrd = Object.keys(grupos).sort((a, b) => a.localeCompare(b))

  function toggleGrupo(d) {
    setAbertos(prev => {
      const s = new Set(prev)
      s.has(d) ? s.delete(d) : s.add(d)
      return s
    })
  }

  // ── Salvar Quick Add ───────────────────────────────────────
  async function salvarQA() {
    if (!qa.observacao?.trim() && !qa.categoria?.trim()) return showToast('Preencha descrição ou categoria.', 'error')
    if (!qa.valor) return showToast('Informe o valor.', 'error')
    const parcelas = qaFreq === 'mensal' ? 12 : qaFreq === 'quin' ? 2 : qaFreq === 'sem' ? 4 : 1
    const datas = gerarDatas(qa.data_vencimento || HOJE, qaFreq, parcelas)
    const tipoQA = isProLabore(qa.categoria) ? (qa.subcat || 'Pro labore') : (qa.tipo_despesa || 'Fixa')
    const linhas = datas.map((d, i) => ({
      observacao:      parcelas > 1 ? `${qa.observacao} (${i+1}/${parcelas})` : qa.observacao,
      categoria:       qa.categoria,
      tipo_despesa:    tipoQA,
      valor:           parseValor(qa.valor),
      data_vencimento: d,
      status:          qa.pago ? 'PAGO' : 'A PAGAR',
      data_pagamento:  qa.pago ? (qa.data_vencimento || HOJE) : null,
    }))
    setSalvando(true)
    try {
      await inserirContasPagarLote(tenantId, linhas)
      showToast(parcelas > 1 ? `${parcelas} lançamentos salvos!` : 'Lançamento salvo!', 'success')
      setQa({ observacao:'', categoria:'', tipo_despesa:'Fixa', subcat:'', valor:'', data_vencimento:HOJE, pago:false })
      setQaFreq('unica')
      qaDescRef.current?.focus()
      // Atualiza categorias se nova
      if (qa.categoria && !categorias.includes(qa.categoria))
        setCategorias(prev => [...prev, qa.categoria].sort())
      carregar()
    } catch (e) { showToast('Erro ao salvar: ' + e.message, 'error') }
    setSalvando(false)
  }

  // ── Salvar Modal Novo ──────────────────────────────────────
  async function salvarNovo() {
    if (!form.categoria?.trim()) return showToast('Informe a categoria.', 'error')
    if (!form.valor) return showToast('Informe o valor.', 'error')
    const parcelas = freqNova === 'mensal' ? 12 : freqNova === 'quin' ? 2 : freqNova === 'sem' ? 4 : 1
    const datas = gerarDatas(form.data_vencimento || HOJE, freqNova, parcelas)
    const tipoForm = isProLabore(form.categoria) ? (form.subcat || 'Pro labore') : form.tipo_despesa
    const linhas = datas.map((d, i) => ({
      observacao:      parcelas > 1 ? `${form.observacao} (${i+1}/${parcelas})` : form.observacao,
      categoria:       form.categoria,
      tipo_despesa:    tipoForm,
      valor:           parseValor(form.valor),
      data_vencimento: d,
      status:          form.status,
      data_pagamento:  form.status === 'PAGO' ? (form.data_pagamento || d) : null,
    }))
    setSalvando(true)
    try {
      await inserirContasPagarLote(tenantId, linhas)
      showToast(parcelas > 1 ? `${parcelas} lançamentos salvos!` : 'Conta salva!', 'success')
      setModalNova(false)
      setForm(FORM_VAZIO)
      if (form.categoria && !categorias.includes(form.categoria))
        setCategorias(prev => [...prev, form.categoria].sort())
      carregar()
    } catch (e) { showToast('Erro: ' + e.message, 'error') }
    setSalvando(false)
  }

  // ── Salvar Edição ──────────────────────────────────────────
  async function salvarEdicao() {
    if (!modalEdit) return
    setSalvando(true)
    try {
      await salvarContaPagar(tenantId, {
        id:              modalEdit.id,
        observacao:      form.observacao,
        categoria:       form.categoria,
        tipo_despesa:    form.tipo_despesa,
        valor:           parseValor(form.valor),
        data_vencimento: form.data_vencimento,
        status:          form.status,
        data_pagamento:  form.status === 'PAGO' ? (form.data_pagamento || form.data_vencimento) : null,
      })
      showToast('Atualizado!', 'success')
      setModalEdit(null)
      carregar()
    } catch (e) { showToast('Erro: ' + e.message, 'error') }
    setSalvando(false)
  }

  function abrirEditar(c) {
    setForm({
      observacao:      c.observacao || '',
      categoria:       c.categoria || '',
      tipo_despesa:    c.tipo_despesa || 'Fixa',
      valor:           mascaraValor(String(Math.round((Number(c.valor)||0)*100))),
      data_vencimento: c.data_vencimento || HOJE,
      status:          c.status || 'A PAGAR',
      data_pagamento:  c.data_pagamento || '',
    })
    setModalEdit(c)
  }

  // ── Pagar ──────────────────────────────────────────────────
  async function confirmarPagamento() {
    if (!modalPagar) return
    setSalvando(true)
    try {
      await pagarContaPagar(modalPagar.id, dataPag)
      showToast('Pagamento registrado!', 'success')
      setModalPagar(null)
      carregar()
    } catch { showToast('Erro ao registrar pagamento.', 'error') }
    setSalvando(false)
  }

  // ── Excluir ────────────────────────────────────────────────
  async function confirmarExclusao() {
    if (!confirmDel) return
    try {
      await excluirContaPagar(confirmDel.id)
      showToast('Excluído!', 'success')
      carregar()
    } catch { showToast('Erro ao excluir.', 'error') }
    setConfirmDel(null)
  }

  // ── Relatórios: gastos por categoria ──────────────────────
  const gastosCat = {}
  contasFiltradas.forEach(c => {
    const cat = c.categoria || 'Sem categoria'
    gastosCat[cat] = (gastosCat[cat] || 0) + (Number(c.valor) || 0)
  })
  const totalPeriodo = Object.values(gastosCat).reduce((s, v) => s + v, 0)
  const catOrdenadas = Object.entries(gastosCat).sort((a, b) => b[1] - a[1])

  // ── Render ─────────────────────────────────────────────────
  return (
    <AppShell title="Contas a Pagar" hideTitle>

      {/* ── Filtros ── */}
      <div style={{ background:'var(--header-bg)', borderBottom:'1px solid var(--border-light)', padding:'10px 16px', display:'flex', flexWrap:'wrap', gap:8, alignItems:'flex-end' }}>
        <div style={{ flex:2, minWidth:160, display:'flex', flexDirection:'column', gap:3 }}>
          <label style={{ fontSize:11, color:'var(--muted)' }}>Buscar descrição ou categoria</label>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Busca inteligente (termo1 termo2)" style={S.inpS} />
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:3, minWidth:120 }}>
          <label style={{ fontSize:11, color:'var(--muted)' }}>Status</label>
          <select value={filtroSt} onChange={e => setFiltroSt(e.target.value)} style={S.inpS}>
            <option value="A PAGAR">Pendentes</option>
            <option value="PAGO">Pagos</option>
            <option value="Todos">Todos</option>
          </select>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
          <label style={{ fontSize:11, color:'var(--muted)' }}>Início</label>
          <input type="date" value={dataIni} onChange={e => setDataIni(e.target.value)} style={S.inpS} />
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
          <label style={{ fontSize:11, color:'var(--muted)' }}>Fim</label>
          <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} style={S.inpS} />
        </div>
        <button onClick={carregar} style={{ ...S.btn, padding:'5px 14px' }}>Filtrar</button>
        <button onClick={() => { setForm(FORM_VAZIO); setFreqNova('unica'); setModalNova(true) }}
          style={{ ...S.ok, padding:'5px 14px', marginLeft:'auto' }}>+ Avançado</button>
      </div>

      {/* ── Resumo + Abas ── */}
      <div style={{ background:'var(--header-bg)', borderBottom:'1px solid var(--border-light)', padding:'10px 16px', display:'flex', flexWrap:'wrap', alignItems:'center', gap:12 }}>
        <div style={{ display:'flex', gap:10 }}>
          <div style={{ background:'var(--card-bg)', border:'1px solid var(--border-light)', borderRadius:8, padding:'8px 16px' }}>
            <div style={{ fontSize:11, color:'var(--muted)' }}>A Pagar (período)</div>
            <div style={{ fontSize:18, fontWeight:800, color:'var(--red)' }}>{fmtR(totalAPagar)}</div>
          </div>
          <div style={{ background:'var(--card-bg)', border:'1px solid var(--border-light)', borderRadius:8, padding:'8px 16px' }}>
            <div style={{ fontSize:11, color:'var(--muted)' }}>Total Pago (período)</div>
            <div style={{ fontSize:18, fontWeight:800, color:'var(--green)' }}>{fmtR(totalPago)}</div>
          </div>
        </div>
        <div style={{ marginLeft:'auto', display:'flex', gap:4, background:'rgba(0,0,0,0.2)', padding:5, borderRadius:8 }}>
          {[['lancamentos','Lançamentos'],['relatorios','Relatórios']].map(([id, label]) => (
            <button key={id} onClick={() => setAba(id)} style={{
              background: aba===id ? 'var(--card-bg)' : 'transparent',
              color: aba===id ? 'var(--blue)' : 'var(--muted)',
              border:'none', borderRadius:6, padding:'7px 16px', fontWeight:600,
              fontSize:13, cursor:'pointer', boxShadow: aba===id ? 'var(--shadow)' : 'none',
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* ── Quick Add Bar (desktop) ── */}
      <div style={{ background:'var(--card-bg)', borderBottom:'1px solid var(--border-light)', padding:'6px 16px', display:'flex', flexWrap:'wrap', gap:6, alignItems:'center' }}>
        <input ref={qaDescRef} value={qa.observacao} onChange={e => setQa(p=>({...p,observacao:e.target.value}))}
          placeholder="Descrição" style={{ ...S.inpS, flex:2, minWidth:100 }}
          onKeyDown={e => e.key==='Enter' && salvarQA()} />
        <input value={qa.categoria} onChange={e => setQa(p=>({...p,categoria:e.target.value,subcat:''}))}
          list="lista-cats-qa" placeholder="Categoria" style={{ ...S.inpS, flex:1, minWidth:100 }}
          onKeyDown={e => e.key==='Enter' && salvarQA()} />
        <datalist id="lista-cats-qa">{categorias.map(c=><option key={c} value={c}/>)}</datalist>
        {isProLabore(qa.categoria) ? (
          <select value={qa.subcat} onChange={e => setQa(p=>({...p,subcat:e.target.value}))}
            style={{ ...S.inpS, minWidth:130, color:'var(--blue)' }}>
            <option value="">Subcategoria…</option>
            {SUBCATS_PROLABORE.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        ) : (
          <select value={qa.tipo_despesa} onChange={e => setQa(p=>({...p,tipo_despesa:e.target.value}))} style={{ ...S.inpS, minWidth:80 }}>
            {TIPOS.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
        )}
        <input value={qa.valor} onChange={e => setQa(p=>({...p,valor:mascaraValor(e.target.value.replace(/\D/g,''))}))}
          placeholder="0,00" style={{ ...S.inpS, width:70 }}
          onKeyDown={e => e.key==='Enter' && salvarQA()} />
        <input type="date" value={qa.data_vencimento} onChange={e => setQa(p=>({...p,data_vencimento:e.target.value}))}
          style={{ ...S.inpS, minWidth:110 }} />
        <label style={{ display:'flex', alignItems:'center', gap:4, fontSize:12, fontWeight:700, color:'var(--green)', cursor:'pointer', whiteSpace:'nowrap' }}>
          <input type="checkbox" checked={qa.pago} onChange={e => setQa(p=>({...p,pago:e.target.checked}))}
            style={{ width:13, height:13 }} /> Pago
        </label>
        <FreqRadios value={qaFreq} onChange={setQaFreq} name="qa_freq" />
        <button onClick={salvarQA} disabled={salvando} style={{ ...S.ok, padding:'5px 12px', whiteSpace:'nowrap' }}>
          {salvando ? '…' : 'Inserir'}
        </button>
      </div>

      <div style={{ padding:16 }}>

        {/* ═══════════ ABA LANÇAMENTOS ═══════════ */}
        {aba === 'lancamentos' && (
          carregando ? <p style={{ color:'var(--muted)' }}>Carregando…</p> : (
            contasFiltradas.length === 0
              ? <p style={{ color:'var(--muted)', textAlign:'center', padding:24 }}>Nenhuma conta encontrada.</p>
              : (
                <div style={{ display:'grid', gap:2 }}>
                  {datasOrd.map(d => {
                    const grupo = grupos[d]
                    const totalGrupo = grupo.reduce((s, c) => s + (Number(c.valor)||0), 0)
                    const open = abertos.has(d)
                    return (
                      <div key={d}>
                        {/* Cabeçalho do grupo */}
                        <div
                          onClick={() => toggleGrupo(d)}
                          style={{
                            display:'flex', justifyContent:'space-between', alignItems:'center',
                            padding:'10px 14px', background:'var(--filter-bg)',
                            borderLeft:'3px solid var(--blue)', borderRadius:4, cursor:'pointer',
                            marginBottom: open ? 1 : 2,
                          }}
                        >
                          <span style={{ color:'var(--blue)', fontWeight:700, fontSize:13 }}>
                            📅 {fmtData(d)}
                            <small style={{ color:'var(--muted)', fontWeight:400, marginLeft:8 }}>
                              ({grupo.length} {grupo.length===1?'lançamento':'lançamentos'})
                            </small>
                          </span>
                          <span style={{ display:'flex', alignItems:'center', gap:8, fontWeight:700, color:'var(--text-body)' }}>
                            {fmtR(totalGrupo)}
                            <span style={{ fontSize:10, transition:'transform 0.2s', transform: open?'rotate(180deg)':'rotate(0deg)' }}>▼</span>
                          </span>
                        </div>

                        {/* Linhas do grupo */}
                        {open && grupo.map(c => (
                          <div
                            key={c.id}
                            style={{
                              display:'flex', alignItems:'center', gap:8,
                              padding:'9px 14px', background:'var(--body-bg)',
                              borderBottom:'1px solid var(--border-light)',
                            }}
                            onMouseEnter={e=>e.currentTarget.style.background='var(--table-row-hover)'}
                            onMouseLeave={e=>e.currentTarget.style.background='var(--body-bg)'}
                          >
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontSize:14, color:'var(--text-header)', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                {c.observacao || c.categoria}
                              </div>
                              <div style={{ fontSize:12, color:'var(--muted)', marginTop:1 }}>
                                {c.categoria}{c.tipo_despesa ? ` • ${c.tipo_despesa}` : ''}
                                {c.status==='PAGO' && c.data_pagamento && <span style={{ color:'var(--green)', marginLeft:6 }}>✓ pago {fmtData(c.data_pagamento)}</span>}
                              </div>
                            </div>
                            <span style={{ fontWeight:700, fontSize:14, color: c.status==='PAGO'?'var(--green)':'var(--red)', flexShrink:0 }}>
                              {fmtR(c.valor)}
                            </span>
                            <span style={{
                              fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:4, flexShrink:0,
                              color: c.status==='PAGO'?'var(--green)':'var(--yellow)',
                            }}>
                              {c.status==='PAGO' ? 'Pago' : 'Pendente'}
                            </span>
                            <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                              {c.status !== 'PAGO' && (
                                <button onClick={() => { setModalPagar({id:c.id}); setDataPag(HOJE) }}
                                  style={{ ...S.ok, padding:'3px 8px', fontSize:12 }} title="Marcar como pago">
                                  ✓ Pagar
                                </button>
                              )}
                              <button onClick={() => abrirEditar(c)} style={{ ...S.btn, padding:'3px 8px', fontSize:12 }} title="Editar">✏️</button>
                              <button onClick={() => setConfirmDel(c)} style={{ ...S.del, padding:'3px 8px', fontSize:12 }} title="Excluir">🗑️</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )
          )
        )}

        {/* ═══════════ ABA RELATÓRIOS ═══════════ */}
        {aba === 'relatorios' && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:12 }}>
            {catOrdenadas.length === 0
              ? <p style={{ color:'var(--muted)' }}>Sem dados no período.</p>
              : catOrdenadas.map(([cat, valor]) => {
                  const pct = totalPeriodo > 0 ? (valor / totalPeriodo * 100).toFixed(1) : 0
                  return (
                    <div key={cat} style={{
                      background:'var(--card-bg)', border:'1px solid var(--border-light)',
                      borderRadius:8, padding:'14px 18px', cursor:'default',
                      transition:'transform 0.15s',
                    }}
                      onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-2px)';e.currentTarget.style.borderColor='var(--blue)'}}
                      onMouseLeave={e=>{e.currentTarget.style.transform='';e.currentTarget.style.borderColor='var(--border-light)'}}
                    >
                      <div style={{ fontSize:12, color:'var(--muted)', marginBottom:6 }}>{cat}</div>
                      <div style={{ fontSize:20, fontWeight:800, color:'var(--text-body)', marginBottom:8 }}>{fmtR(valor)}</div>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'var(--muted)', marginBottom:4, fontWeight:700 }}>
                        <span>Fatia do período</span>
                        <span>{pct}%</span>
                      </div>
                      <div style={{ background:'var(--body-bg)', height:6, borderRadius:3, overflow:'hidden' }}>
                        <div style={{ width:`${pct}%`, height:'100%', background:'var(--blue)', borderRadius:3, transition:'width 0.8s ease-out' }} />
                      </div>
                    </div>
                  )
                })
            }
          </div>
        )}
      </div>

      {/* ═══ MODAL: NOVA CONTA AVANÇADO ═══ */}
      {modalNova && (
        <div className="modal-overlay" onClick={() => setModalNova(false)}>
          <div className="modal-card" style={{ maxWidth:460 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <h3 style={{ margin:0, fontSize:16 }}>Nova Conta a Pagar</h3>
              <button onClick={() => setModalNova(false)} style={{ background:'none', border:'none', color:'var(--muted)', fontSize:18, cursor:'pointer' }}>✕</button>
            </div>
            <div className="modal-body" style={{ padding:20, paddingBottom:20, display:'grid', gap:12 }}>
              <Campo label="Descrição">
                <input value={form.observacao} onChange={e => setForm(p=>({...p,observacao:e.target.value}))} style={S.inp} placeholder="Ex: Conta de luz, Aluguel…" />
              </Campo>
              <Campo label="Categoria *">
                <input value={form.categoria} onChange={e => setForm(p=>({...p,categoria:e.target.value,subcat:''}))}
                  list="lista-cats-modal" style={S.inp} placeholder="Selecione ou digite" />
                <datalist id="lista-cats-modal">{categorias.map(c=><option key={c} value={c}/>)}</datalist>
              </Campo>
              {isProLabore(form.categoria) && (
                <Campo label="Subcategoria (Pro Labore)">
                  <select value={form.subcat} onChange={e => setForm(p=>({...p,subcat:e.target.value}))}
                    style={{ ...S.inp, color:'var(--blue)' }}>
                    <option value="">Selecione…</option>
                    {SUBCATS_PROLABORE.map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                </Campo>
              )}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                {!isProLabore(form.categoria) && (
                <Campo label="Tipo">
                  <select value={form.tipo_despesa} onChange={e => setForm(p=>({...p,tipo_despesa:e.target.value}))} style={S.inp}>
                    {TIPOS.map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
                </Campo>
                )}
                <Campo label="Valor *">
                  <input value={form.valor}
                    onChange={e => setForm(p=>({...p,valor:mascaraValor(e.target.value.replace(/\D/g,''))}))}
                    style={S.inp} placeholder="0,00" />
                </Campo>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <Campo label="Primeiro Vencimento">
                  <input type="date" value={form.data_vencimento} onChange={e => setForm(p=>({...p,data_vencimento:e.target.value}))} style={S.inp} />
                </Campo>
                <Campo label="Status">
                  <select value={form.status} onChange={e => setForm(p=>({...p,status:e.target.value}))} style={S.inp}>
                    <option value="A PAGAR">A Pagar</option>
                    <option value="PAGO">Pago</option>
                  </select>
                </Campo>
              </div>
              {form.status === 'PAGO' && (
                <Campo label="Data do Pagamento">
                  <input type="date" value={form.data_pagamento || form.data_vencimento} onChange={e => setForm(p=>({...p,data_pagamento:e.target.value}))} style={S.inp} />
                </Campo>
              )}
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.4px', display:'block', marginBottom:6 }}>Repetição</label>
                <FreqRadios value={freqNova} onChange={setFreqNova} name="nova_freq" />
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>
                  {freqNova==='mensal' ? '12 parcelas mensais' : freqNova==='quin' ? '2 parcelas (15 em 15 dias)' : freqNova==='sem' ? '4 parcelas (7 em 7 dias)' : '1 lançamento único'}
                </div>
              </div>
              <div style={{ display:'flex', gap:8, justifyContent:'flex-end', paddingTop:8, borderTop:'1px solid var(--border-light)' }}>
                <button onClick={() => setModalNova(false)} style={S.sec}>Cancelar</button>
                <button onClick={salvarNovo} disabled={salvando} style={S.ok}>{salvando ? 'Salvando…' : 'Salvar'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: EDITAR ═══ */}
      {modalEdit && (
        <div className="modal-overlay" onClick={() => setModalEdit(null)}>
          <div className="modal-card" style={{ maxWidth:420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <h3 style={{ margin:0, fontSize:16 }}>Editar Conta</h3>
              <button onClick={() => setModalEdit(null)} style={{ background:'none', border:'none', color:'var(--muted)', fontSize:18, cursor:'pointer' }}>✕</button>
            </div>
            <div className="modal-body" style={{ padding:20, paddingBottom:20, display:'grid', gap:12 }}>
              <Campo label="Descrição">
                <input value={form.observacao} onChange={e => setForm(p=>({...p,observacao:e.target.value}))} style={S.inp} />
              </Campo>
              <Campo label="Categoria *">
                <input value={form.categoria} onChange={e => setForm(p=>({...p,categoria:e.target.value,subcat:''}))}
                  list="lista-cats-edit" style={S.inp} />
                <datalist id="lista-cats-edit">{categorias.map(c=><option key={c} value={c}/>)}</datalist>
              </Campo>
              {isProLabore(form.categoria) && (
                <Campo label="Subcategoria (Pro Labore)">
                  <select value={form.subcat || form.tipo_despesa} onChange={e => setForm(p=>({...p,subcat:e.target.value}))}
                    style={{ ...S.inp, color:'var(--blue)' }}>
                    <option value="">Selecione…</option>
                    {SUBCATS_PROLABORE.map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                </Campo>
              )}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                {!isProLabore(form.categoria) && (
                <Campo label="Tipo">
                  <select value={form.tipo_despesa} onChange={e => setForm(p=>({...p,tipo_despesa:e.target.value}))} style={S.inp}>
                    {TIPOS.map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
                </Campo>
                )}
                <Campo label="Valor *">
                  <input value={form.valor}
                    onChange={e => setForm(p=>({...p,valor:mascaraValor(e.target.value.replace(/\D/g,''))}))}
                    style={S.inp} placeholder="0,00" />
                </Campo>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <Campo label="Vencimento">
                  <input type="date" value={form.data_vencimento} onChange={e => setForm(p=>({...p,data_vencimento:e.target.value}))} style={S.inp} />
                </Campo>
                <Campo label="Status">
                  <select value={form.status} onChange={e => setForm(p=>({...p,status:e.target.value}))} style={S.inp}>
                    <option value="A PAGAR">A Pagar</option>
                    <option value="PAGO">Pago</option>
                  </select>
                </Campo>
              </div>
              {form.status === 'PAGO' && (
                <Campo label="Data Pagamento">
                  <input type="date" value={form.data_pagamento} onChange={e => setForm(p=>({...p,data_pagamento:e.target.value}))} style={S.inp} />
                </Campo>
              )}
              <div style={{ display:'flex', gap:8, justifyContent:'flex-end', paddingTop:8, borderTop:'1px solid var(--border-light)' }}>
                <button onClick={() => setModalEdit(null)} style={S.sec}>Cancelar</button>
                <button onClick={salvarEdicao} disabled={salvando} style={S.btn}>{salvando ? 'Salvando…' : 'Atualizar'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: PAGAR ═══ */}
      {modalPagar && (
        <div className="modal-overlay" onClick={() => setModalPagar(null)}>
          <div className="modal-card mini" onClick={e => e.stopPropagation()} style={{ maxWidth:340 }}>
            <div className="modal-header"><h3 style={{ margin:0, fontSize:16 }}>Confirmar Pagamento</h3></div>
            <div className="modal-body" style={{ padding:20, paddingBottom:20 }}>
              <Campo label="Data do Pagamento">
                <input type="date" value={dataPag} onChange={e => setDataPag(e.target.value)} style={S.inp} />
              </Campo>
            </div>
            <div className="modal-footer">
              <button onClick={() => setModalPagar(null)} style={{ ...S.sec, flex:1 }}>Cancelar</button>
              <button onClick={confirmarPagamento} disabled={salvando} style={{ ...S.ok, flex:1 }}>
                {salvando ? 'Processando…' : 'Dar Baixa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: EXCLUIR ═══ */}
      {confirmDel && (
        <div className="modal-overlay" onClick={() => setConfirmDel(null)}>
          <div className="modal-card mini" onClick={e => e.stopPropagation()} style={{ maxWidth:360 }}>
            <div className="modal-header"><h3 style={{ margin:0, color:'var(--red)', fontSize:16 }}>Confirmar Exclusão</h3></div>
            <div className="modal-body" style={{ padding:20, paddingBottom:20 }}>
              <p style={{ margin:0 }}>Excluir <strong>{confirmDel.observacao || confirmDel.categoria}</strong>?</p>
            </div>
            <div className="modal-footer">
              <button onClick={() => setConfirmDel(null)} style={{ ...S.sec, flex:1 }}>Cancelar</button>
              <button onClick={confirmarExclusao} style={{ ...S.del, flex:1 }}>Excluir</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}
