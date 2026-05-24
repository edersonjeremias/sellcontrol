import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import AppShell from '../../components/ui/AppShell'
import {
  fmtR,
  getVendasRelatorio,
  getContasPagar, salvarContaPagar, excluirContaPagar,
  getCreditosClientes, salvarCredito, excluirCredito,
  getVendasPorAno, getVendasPorMes, getVendasPorDia,
  getTopClientesMes, getVendasVsComprasDia, getFluxoCaixaMes,
  getResumoFinanceiro,
} from '../../services/relatorioService'

// ── Helpers ────────────────────────────────────────────────────
function fmtData(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

function primeiroDiaMes() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function ultimoDiaMes() {
  const d = new Date()
  const fim = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return `${fim.getFullYear()}-${String(fim.getMonth() + 1).padStart(2, '0')}-${String(fim.getDate()).padStart(2, '0')}`
}

const TIPOS_DESPESA = ['Fixa', 'Variável', 'Pró-Labore', 'Compra/Revenda']
const STATUS_CONTA  = ['A PAGAR', 'PAGO']

// ── Gráfico de barras simples ──────────────────────────────────
function BarChart({ items = [], color = '#8ab4f8', height = 180 }) {
  if (!items.length) return <p style={{ color:'var(--muted)', textAlign:'center', padding:24 }}>Sem dados</p>
  const max = Math.max(...items.map(d => d.value || 0), 1)
  const barH = height - 28

  return (
    <div style={{ display:'flex', alignItems:'flex-end', gap:2, height, padding:'0 4px' }}>
      {items.map((d, i) => {
        const h = Math.max(Math.round((d.value / max) * barH), d.value > 0 ? 2 : 0)
        return (
          <div
            key={i}
            style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-end', height:'100%', cursor:'default' }}
            title={`${d.label}: ${fmtR(d.value)}`}
          >
            <div style={{ width:'100%', height:h, background:color, borderRadius:'2px 2px 0 0', transition:'height 0.2s' }} />
            <div style={{ fontSize:9, color:'var(--muted)', marginTop:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'100%', textAlign:'center' }}>
              {d.label}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function DualBarChart({ items = [], colorA = '#8ab4f8', colorB = '#f28b82', keyA = 'a', keyB = 'b', height = 180 }) {
  if (!items.length) return <p style={{ color:'var(--muted)', textAlign:'center', padding:24 }}>Sem dados</p>
  const max = Math.max(...items.map(d => Math.max(d[keyA] || 0, d[keyB] || 0)), 1)
  const barH = height - 28

  return (
    <div style={{ display:'flex', alignItems:'flex-end', gap:2, height, padding:'0 4px' }}>
      {items.map((d, i) => {
        const hA = Math.max(Math.round(((d[keyA]||0) / max) * barH), d[keyA] > 0 ? 2 : 0)
        const hB = Math.max(Math.round(((d[keyB]||0) / max) * barH), d[keyB] > 0 ? 2 : 0)
        return (
          <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-end', height:'100%' }}>
            <div style={{ display:'flex', alignItems:'flex-end', gap:1, width:'100%', height:barH }}>
              <div style={{ flex:1, height:hA, background:colorA, borderRadius:'2px 2px 0 0', alignSelf:'flex-end' }} title={fmtR(d[keyA])} />
              <div style={{ flex:1, height:hB, background:colorB, borderRadius:'2px 2px 0 0', alignSelf:'flex-end' }} title={fmtR(d[keyB])} />
            </div>
            <div style={{ fontSize:9, color:'var(--muted)', marginTop:3, textAlign:'center', whiteSpace:'nowrap' }}>{d.label}</div>
          </div>
        )
      })}
    </div>
  )
}

// ── Cards mini do dashboard ────────────────────────────────────
function DashCard({ title, sub, onClick, children }) {
  return (
    <div
      onClick={onClick}
      style={{
        background:'var(--card-bg)', border:'1px solid var(--border-light)', borderRadius:8,
        padding:'12px 14px', cursor:'pointer', transition:'transform 0.15s, box-shadow 0.15s',
        display:'flex', flexDirection:'column', gap:8,
      }}
      onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,0.4)' }}
      onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow='' }}
    >
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontSize:12, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.5px' }}>{title}</span>
        {sub && <span style={{ fontSize:11, color:'var(--muted)' }}>{sub}</span>}
      </div>
      {children}
      <div style={{ fontSize:11, color:'var(--blue)', marginTop:2 }}>Clique para ampliar ▸</div>
    </div>
  )
}

// ── KPI card ──────────────────────────────────────────────────
function Kpi({ label, value, color = 'var(--text-body)', sub }) {
  return (
    <div style={{ background:'var(--header-bg)', border:'1px solid var(--border-light)', borderRadius:6, padding:'10px 14px' }}>
      <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:18, fontWeight:800, color }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{sub}</div>}
    </div>
  )
}

// ── Modal genérico de gráfico ──────────────────────────────────
function ChartModal({ titulo, onClose, children }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth:720, width:'95vw', maxHeight:'90vh' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <h3 style={{ margin:0, fontSize:16 }}>{titulo}</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--muted)', fontSize:18, cursor:'pointer', lineHeight:1 }}>✕</button>
        </div>
        <div className="modal-body" style={{ padding:'20px', paddingBottom:20, overflowY:'auto' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

// ── Linha de tabela de vendas ──────────────────────────────────
const STATUS_COR = {
  CANCELADO: 'var(--red)', DEVOLVIDO: 'var(--yellow)', ENVIADO: 'var(--green)',
}

// ── Formulário de conta a pagar / crédito ─────────────────────
const CONTA_VAZIA = { categoria:'', data_vencimento:'', valor:'', status:'A PAGAR', data_pagamento:'', tipo_despesa:'Fixa', observacao:'' }
const CREDITO_VAZIO = { data:'', cliente:'', valor:'', observacao:'' }

// ═══════════════════════════════════════════════════════════════
export default function RelatorioPage() {
  const { profile } = useAuth()
  const { showToast } = useApp()
  const tenantId = profile?.tenant_id

  const hoje   = new Date()
  const anoAtual = hoje.getFullYear()
  const mesAtual = hoje.getMonth() + 1

  // ── Estado geral ───────────────────────────────────────────
  const [aba, setAba] = useState('relatorio')
  const [dataIni, setDataIni] = useState(primeiroDiaMes)
  const [dataFim, setDataFim] = useState(ultimoDiaMes)
  const [busca, setBusca]   = useState('')
  const [anoSel, setAnoSel] = useState(String(anoAtual))
  const [mesSel, setMesSel] = useState(String(mesAtual))

  // dados
  const [vendas, setVendas]     = useState([])
  const [contas, setContas]     = useState([])
  const [creditos, setCreditos] = useState([])
  const [carregando, setCarregando] = useState(false)

  // modal do dashboard
  const [modal, setModal] = useState(null) // { tipo, titulo, dados }
  const [modalCarregando, setModalCarregando] = useState(false)

  // formulários
  const [formConta, setFormConta]   = useState(CONTA_VAZIA)
  const [editConta, setEditConta]   = useState(null)
  const [formCred, setFormCred]     = useState(CREDITO_VAZIO)
  const [editCred, setEditCred]     = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)

  // ── Carregamento por aba ───────────────────────────────────
  useEffect(() => {
    if (!tenantId) return
    if (aba === 'relatorio') carregarVendas()
    if (aba === 'contas')    carregarContas()
    if (aba === 'creditos')  carregarCreditos()
  }, [aba, tenantId]) // eslint-disable-line

  const carregarVendas = useCallback(async () => {
    setCarregando(true)
    try {
      const rows = await getVendasRelatorio(tenantId, { dataInicio: dataIni, dataFim, busca })
      setVendas(rows)
    } catch (e) { showToast('Erro ao carregar vendas.', 'error'); console.error(e) }
    setCarregando(false)
  }, [tenantId, dataIni, dataFim, busca, showToast])

  const carregarContas = useCallback(async () => {
    setCarregando(true)
    try { setContas(await getContasPagar(tenantId, { dataInicio: dataIni, dataFim })) }
    catch (e) { showToast('Erro ao carregar contas.', 'error') }
    setCarregando(false)
  }, [tenantId, dataIni, dataFim, showToast])

  const carregarCreditos = useCallback(async () => {
    setCarregando(true)
    try { setCreditos(await getCreditosClientes(tenantId, { dataInicio: dataIni, dataFim })) }
    catch (e) { showToast('Erro ao carregar créditos.', 'error') }
    setCarregando(false)
  }, [tenantId, dataIni, dataFim, showToast])

  function aplicarFiltro() {
    if (aba === 'relatorio') carregarVendas()
    if (aba === 'contas')    carregarContas()
    if (aba === 'creditos')  carregarCreditos()
  }

  // ── Dashboard: abrir modais ───────────────────────────────
  async function abrirModal(tipo) {
    setModalCarregando(true)
    const ano = parseInt(anoSel)
    const mes = parseInt(mesSel)
    const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
    try {
      let dados = null, titulo = ''
      if (tipo === 'ano') {
        dados = await getVendasPorAno(tenantId)
        titulo = 'Vendas por Ano'
      } else if (tipo === 'mes') {
        dados = await getVendasPorMes(tenantId, ano)
        titulo = `Vendas por Mês — ${ano}`
      } else if (tipo === 'dia') {
        dados = await getVendasPorDia(tenantId, ano, mes)
        titulo = `Vendas por Dia — ${MESES_PT[mes-1]} ${ano}`
      } else if (tipo === 'clientes') {
        dados = await getTopClientesMes(tenantId, ano, mes)
        titulo = `Top 10 Clientes — ${MESES_PT[mes-1]} ${ano}`
      } else if (tipo === 'vendas-compras') {
        dados = await getVendasVsComprasDia(tenantId, ano, mes)
        titulo = `Vendas vs Compras — ${MESES_PT[mes-1]} ${ano}`
      } else if (tipo === 'fluxo') {
        dados = await getFluxoCaixaMes(tenantId, ano, mes)
        titulo = `Fluxo de Caixa — ${MESES_PT[mes-1]} ${ano}`
      } else if (tipo === 'resumo') {
        dados = await getResumoFinanceiro(tenantId, ano, mes)
        titulo = `Resumo Financeiro — ${MESES_PT[mes-1]} ${ano}`
      }
      setModal({ tipo, titulo, dados })
    } catch (e) { showToast('Erro ao carregar dados.', 'error'); console.error(e) }
    setModalCarregando(false)
  }

  // ── CRUD Contas a Pagar ───────────────────────────────────
  async function handleSalvarConta() {
    if (!formConta.categoria?.trim()) return showToast('Informe a categoria.', 'error')
    if (!formConta.valor) return showToast('Informe o valor.', 'error')
    try {
      await salvarContaPagar(tenantId, { ...formConta, id: editConta })
      showToast(editConta ? 'Conta atualizada!' : 'Conta salva!', 'success')
      setFormConta(CONTA_VAZIA); setEditConta(null)
      carregarContas()
    } catch (e) { showToast('Erro ao salvar conta.', 'error') }
  }

  async function handleExcluirConta(id) {
    try { await excluirContaPagar(id); showToast('Excluído!', 'success'); carregarContas() }
    catch { showToast('Erro ao excluir.', 'error') }
    setConfirmDel(null)
  }

  function editarConta(c) {
    setFormConta({
      categoria: c.categoria || '', data_vencimento: c.data_vencimento || '',
      valor: c.valor || '', status: c.status || 'A PAGAR',
      data_pagamento: c.data_pagamento || '', tipo_despesa: c.tipo_despesa || 'Fixa',
      observacao: c.observacao || '',
    })
    setEditConta(c.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ── CRUD Créditos ─────────────────────────────────────────
  async function handleSalvarCredito() {
    if (!formCred.data) return showToast('Informe a data.', 'error')
    if (!formCred.valor) return showToast('Informe o valor.', 'error')
    try {
      await salvarCredito(tenantId, { ...formCred, id: editCred })
      showToast(editCred ? 'Crédito atualizado!' : 'Crédito salvo!', 'success')
      setFormCred(CREDITO_VAZIO); setEditCred(null)
      carregarCreditos()
    } catch (e) { showToast('Erro ao salvar crédito.', 'error') }
  }

  async function handleExcluirCredito(id) {
    try { await excluirCredito(id); showToast('Excluído!', 'success'); carregarCreditos() }
    catch { showToast('Erro ao excluir.', 'error') }
    setConfirmDel(null)
  }

  // ── Render ────────────────────────────────────────────────
  const ANOS = Array.from({ length: 5 }, (_, i) => String(anoAtual - 2 + i))
  const MESES_LABEL = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

  return (
    <AppShell title="Relatório" hideTitle>

      {/* ── Filtro de período ── */}
      <div style={{ display:'flex', alignItems:'center', flexWrap:'wrap', gap:8, padding:'12px 16px', borderBottom:'1px solid var(--border-light)', background:'var(--header-bg)' }}>
        <span style={{ fontSize:13, fontWeight:700, color:'var(--text-header)' }}>Relatório</span>
        <div style={{ flex:1 }} />
        <label style={{ fontSize:12, color:'var(--muted)' }}>De</label>
        <input type="date" value={dataIni} onChange={e => setDataIni(e.target.value)}
          style={S.inp} />
        <label style={{ fontSize:12, color:'var(--muted)' }}>Até</label>
        <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
          style={S.inp} />
        <button onClick={aplicarFiltro} style={S.btnPri}>Filtrar</button>
      </div>

      {/* ── Abas ── */}
      <div style={{ display:'flex', gap:0, borderBottom:'1px solid var(--border-light)', background:'var(--header-bg)', padding:'0 16px' }}>
        {[['relatorio','Relatório'],['dashboard','Dashboard'],['contas','Contas a Pagar'],['creditos','Créditos']].map(([id, label]) => (
          <button key={id} onClick={() => setAba(id)} style={{
            background:'none', border:'none', padding:'10px 14px', cursor:'pointer',
            fontSize:13, fontWeight: aba===id ? 700 : 400,
            color: aba===id ? 'var(--blue)' : 'var(--muted)',
            borderBottom: aba===id ? '2px solid var(--blue)' : '2px solid transparent',
          }}>{label}</button>
        ))}
      </div>

      <div style={{ padding:'16px', overflowX:'hidden' }}>

        {/* ════════════════ ABA RELATÓRIO ════════════════ */}
        {aba === 'relatorio' && (
          <div>
            <div style={{ display:'flex', gap:8, marginBottom:12 }}>
              <input
                placeholder="Buscar produto, cliente, live…"
                value={busca} onChange={e => setBusca(e.target.value)}
                onKeyDown={e => e.key==='Enter' && carregarVendas()}
                style={{ ...S.inp, flex:1 }}
              />
              <button onClick={carregarVendas} style={S.btnPri}>Buscar</button>
            </div>

            {carregando ? <p style={{ color:'var(--muted)' }}>Carregando…</p> : (
              <>
                <p style={{ fontSize:12, color:'var(--muted)', marginBottom:8 }}>
                  {vendas.length} registro(s) · Total: {fmtR(vendas.reduce((s,v)=>{
                    const st=(v.status||'').toUpperCase()
                    return s+(st==='CANCELADO'||st==='DEVOLVIDO'?0:Number(v.preco)||0)
                  },0))}
                </p>
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                    <thead>
                      <tr>
                        {['Data','Live','Cliente','Produto','Modelo','Cor','Tam','Cód.','Preço','Status'].map(h => (
                          <th key={h} style={S.th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {vendas.map(v => (
                        <tr key={v.id} style={{ borderBottom:'1px solid var(--border-light)' }}
                          onMouseEnter={e=>e.currentTarget.style.background='var(--table-row-hover)'}
                          onMouseLeave={e=>e.currentTarget.style.background=''}>
                          <td style={S.td}>{fmtData(v.data_live)}</td>
                          <td style={S.td}>{v.live_nome}</td>
                          <td style={S.td}>{v.cliente_nome}</td>
                          <td style={S.td}>{v.produto}</td>
                          <td style={S.td}>{v.modelo}</td>
                          <td style={S.td}>{v.cor}</td>
                          <td style={S.td}>{v.tamanho}</td>
                          <td style={S.td}>{v.codigo}</td>
                          <td style={{ ...S.td, color:'var(--green)', fontWeight:600 }}>{fmtR(v.preco)}</td>
                          <td style={{ ...S.td, color: STATUS_COR[v.status?.toUpperCase()] || 'var(--muted)', fontSize:11 }}>
                            {v.status || '—'}
                          </td>
                        </tr>
                      ))}
                      {!vendas.length && (
                        <tr><td colSpan={10} style={{ textAlign:'center', padding:24, color:'var(--muted)' }}>Nenhum registro encontrado.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* ════════════════ ABA DASHBOARD ════════════════ */}
        {aba === 'dashboard' && (
          <div>
            {/* Seletores ano/mês */}
            <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:16, flexWrap:'wrap' }}>
              <span style={{ fontSize:12, color:'var(--muted)' }}>Ano:</span>
              <select value={anoSel} onChange={e=>setAnoSel(e.target.value)} style={S.inp}>
                {ANOS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <span style={{ fontSize:12, color:'var(--muted)' }}>Mês:</span>
              <select value={mesSel} onChange={e=>setMesSel(e.target.value)} style={S.inp}>
                {MESES_LABEL.map((m,i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
              {modalCarregando && <span style={{ fontSize:12, color:'var(--muted)' }}>Carregando…</span>}
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:12 }}>
              <DashCard title="Vendas por Ano" onClick={() => abrirModal('ano')}>
                <div style={{ height:80 }}><BarChart items={[]} color="#8ab4f8" height={80} /></div>
              </DashCard>

              <DashCard title="Vendas por Mês" sub={anoSel} onClick={() => abrirModal('mes')}>
                <div style={{ height:80 }}><BarChart items={[]} color="#81c995" height={80} /></div>
              </DashCard>

              <DashCard title="Vendas por Dia" sub={`${MESES_LABEL[parseInt(mesSel)-1]}/${anoSel}`} onClick={() => abrirModal('dia')}>
                <div style={{ height:80 }}><BarChart items={[]} color="#c58af9" height={80} /></div>
              </DashCard>

              <DashCard title="Top 10 Clientes" sub={`${MESES_LABEL[parseInt(mesSel)-1]}/${anoSel}`} onClick={() => abrirModal('clientes')}>
                <div style={{ height:80 }}><BarChart items={[]} color="#fbbc04" height={80} /></div>
              </DashCard>

              <DashCard title="Vendas vs Compras" sub={`${MESES_LABEL[parseInt(mesSel)-1]}/${anoSel}`} onClick={() => abrirModal('vendas-compras')}>
                <div style={{ height:80 }}><DualBarChart items={[]} keyA="vendas" keyB="compras" height={80} /></div>
              </DashCard>

              <DashCard title="Fluxo de Caixa" sub={`${MESES_LABEL[parseInt(mesSel)-1]}/${anoSel}`} onClick={() => abrirModal('fluxo')}>
                <div style={{ height:80 }}><DualBarChart items={[]} keyA="entradas" keyB="saidas" height={80} /></div>
              </DashCard>

              <DashCard title="Resumo Financeiro" sub={`${MESES_LABEL[parseInt(mesSel)-1]}/${anoSel}`} onClick={() => abrirModal('resumo')}>
                <div style={{ fontSize:12, color:'var(--muted)' }}>Faturamento, margem, KPIs…</div>
              </DashCard>
            </div>
          </div>
        )}

        {/* ════════════════ ABA CONTAS A PAGAR ════════════════ */}
        {aba === 'contas' && (
          <div style={{ display:'grid', gap:16 }}>
            {/* Formulário */}
            <div style={{ background:'var(--card-bg)', border:'1px solid var(--border-light)', borderRadius:8, padding:16 }}>
              <h4 style={{ margin:'0 0 12px', color:'var(--text-header)', fontSize:14 }}>
                {editConta ? 'Editar Conta' : 'Nova Conta a Pagar'}
              </h4>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:10 }}>
                <Campo label="Categoria" required>
                  <input value={formConta.categoria} onChange={e=>setFormConta(f=>({...f,categoria:e.target.value}))} style={S.inp} placeholder="ex: Aluguel, Luz…" />
                </Campo>
                <Campo label="Tipo">
                  <select value={formConta.tipo_despesa} onChange={e=>setFormConta(f=>({...f,tipo_despesa:e.target.value}))} style={S.inp}>
                    {TIPOS_DESPESA.map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
                </Campo>
                <Campo label="Vencimento">
                  <input type="date" value={formConta.data_vencimento} onChange={e=>setFormConta(f=>({...f,data_vencimento:e.target.value}))} style={S.inp} />
                </Campo>
                <Campo label="Valor" required>
                  <input type="number" step="0.01" value={formConta.valor} onChange={e=>setFormConta(f=>({...f,valor:e.target.value}))} style={S.inp} placeholder="0,00" />
                </Campo>
                <Campo label="Status">
                  <select value={formConta.status} onChange={e=>setFormConta(f=>({...f,status:e.target.value}))} style={S.inp}>
                    {STATUS_CONTA.map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                </Campo>
                <Campo label="Data Pag.">
                  <input type="date" value={formConta.data_pagamento} onChange={e=>setFormConta(f=>({...f,data_pagamento:e.target.value}))} style={S.inp} />
                </Campo>
                <Campo label="Observação" style={{ gridColumn:'1/-1' }}>
                  <input value={formConta.observacao} onChange={e=>setFormConta(f=>({...f,observacao:e.target.value}))} style={S.inp} />
                </Campo>
              </div>
              <div style={{ display:'flex', gap:8, marginTop:12 }}>
                <button onClick={handleSalvarConta} style={S.btnPri}>{editConta ? 'Atualizar' : 'Salvar'}</button>
                {editConta && (
                  <button onClick={()=>{setFormConta(CONTA_VAZIA);setEditConta(null)}} style={S.btnSec}>Cancelar</button>
                )}
              </div>
            </div>

            {/* Lista */}
            {carregando ? <p style={{ color:'var(--muted)' }}>Carregando…</p> : (
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr>{['Categoria','Tipo','Vencimento','Valor','Status','Pago em','Obs.',''].map(h=>(
                      <th key={h} style={S.th}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {contas.map(c => (
                      <tr key={c.id} style={{ borderBottom:'1px solid var(--border-light)' }}
                        onMouseEnter={e=>e.currentTarget.style.background='var(--table-row-hover)'}
                        onMouseLeave={e=>e.currentTarget.style.background=''}>
                        <td style={S.td}>{c.categoria}</td>
                        <td style={S.td}>{c.tipo_despesa}</td>
                        <td style={S.td}>{fmtData(c.data_vencimento)}</td>
                        <td style={{ ...S.td, color:'var(--red)', fontWeight:600 }}>{fmtR(c.valor)}</td>
                        <td style={{ ...S.td, color: c.status==='PAGO'?'var(--green)':'var(--yellow)' }}>{c.status}</td>
                        <td style={S.td}>{fmtData(c.data_pagamento)}</td>
                        <td style={{ ...S.td, color:'var(--muted)', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis' }}>{c.observacao}</td>
                        <td style={S.td}>
                          <div style={{ display:'flex', gap:4 }}>
                            <button onClick={()=>editarConta(c)} style={S.btnIcon} title="Editar">✏️</button>
                            <button onClick={()=>setConfirmDel({tipo:'conta',id:c.id,label:c.categoria})} style={S.btnIcon} title="Excluir">🗑️</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!contas.length && (
                      <tr><td colSpan={8} style={{ textAlign:'center', padding:20, color:'var(--muted)' }}>Nenhuma conta cadastrada.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ════════════════ ABA CRÉDITOS ════════════════ */}
        {aba === 'creditos' && (
          <div style={{ display:'grid', gap:16 }}>
            <div style={{ background:'var(--card-bg)', border:'1px solid var(--border-light)', borderRadius:8, padding:16 }}>
              <h4 style={{ margin:'0 0 12px', color:'var(--text-header)', fontSize:14 }}>
                {editCred ? 'Editar Crédito' : 'Novo Crédito de Cliente'}
              </h4>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:10 }}>
                <Campo label="Data" required>
                  <input type="date" value={formCred.data} onChange={e=>setFormCred(f=>({...f,data:e.target.value}))} style={S.inp} />
                </Campo>
                <Campo label="Cliente">
                  <input value={formCred.cliente} onChange={e=>setFormCred(f=>({...f,cliente:e.target.value}))} style={S.inp} placeholder="@instagram" />
                </Campo>
                <Campo label="Valor" required>
                  <input type="number" step="0.01" value={formCred.valor} onChange={e=>setFormCred(f=>({...f,valor:e.target.value}))} style={S.inp} placeholder="0,00" />
                </Campo>
                <Campo label="Observação">
                  <input value={formCred.observacao} onChange={e=>setFormCred(f=>({...f,observacao:e.target.value}))} style={S.inp} />
                </Campo>
              </div>
              <div style={{ display:'flex', gap:8, marginTop:12 }}>
                <button onClick={handleSalvarCredito} style={S.btnPri}>{editCred ? 'Atualizar' : 'Salvar'}</button>
                {editCred && (
                  <button onClick={()=>{setFormCred(CREDITO_VAZIO);setEditCred(null)}} style={S.btnSec}>Cancelar</button>
                )}
              </div>
            </div>

            {carregando ? <p style={{ color:'var(--muted)' }}>Carregando…</p> : (
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr>{['Data','Cliente','Valor','Observação',''].map(h=>(
                      <th key={h} style={S.th}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {creditos.map(c => (
                      <tr key={c.id} style={{ borderBottom:'1px solid var(--border-light)' }}
                        onMouseEnter={e=>e.currentTarget.style.background='var(--table-row-hover)'}
                        onMouseLeave={e=>e.currentTarget.style.background=''}>
                        <td style={S.td}>{fmtData(c.data)}</td>
                        <td style={S.td}>{c.cliente}</td>
                        <td style={{ ...S.td, color:'var(--yellow)', fontWeight:600 }}>{fmtR(c.valor)}</td>
                        <td style={{ ...S.td, color:'var(--muted)' }}>{c.observacao}</td>
                        <td style={S.td}>
                          <div style={{ display:'flex', gap:4 }}>
                            <button onClick={()=>{setFormCred({data:c.data||'',cliente:c.cliente||'',valor:c.valor||'',observacao:c.observacao||''});setEditCred(c.id);window.scrollTo({top:0,behavior:'smooth'})}} style={S.btnIcon}>✏️</button>
                            <button onClick={()=>setConfirmDel({tipo:'credito',id:c.id,label:c.cliente||fmtData(c.data)})} style={S.btnIcon}>🗑️</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!creditos.length && (
                      <tr><td colSpan={5} style={{ textAlign:'center', padding:20, color:'var(--muted)' }}>Nenhum crédito cadastrado.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ════════════════ MODAIS DE GRÁFICO ════════════════ */}
      {modal && (
        <ChartModal titulo={modal.titulo} onClose={() => setModal(null)}>
          {/* Vendas por Ano */}
          {modal.tipo === 'ano' && (
            <>
              <BarChart items={modal.dados} color="#8ab4f8" height={280} />
              <TabelaGrafico items={modal.dados} cols={['Ano','Total']} />
            </>
          )}

          {/* Vendas por Mês */}
          {modal.tipo === 'mes' && (
            <>
              <BarChart items={modal.dados} color="#81c995" height={280} />
              <TabelaGrafico items={modal.dados} cols={['Mês','Total']} />
            </>
          )}

          {/* Vendas por Dia */}
          {modal.tipo === 'dia' && (
            <>
              <BarChart items={modal.dados} color="#c58af9" height={280} />
              <TabelaGrafico items={modal.dados} cols={['Dia','Total']} />
            </>
          )}

          {/* Top 10 Clientes */}
          {modal.tipo === 'clientes' && (
            <>
              <div style={{ marginBottom:16 }}>
                {modal.dados.map((d, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                    <span style={{ fontSize:12, color:'var(--muted)', width:20, textAlign:'right' }}>#{i+1}</span>
                    <span style={{ flex:1, fontSize:13, color:'var(--text-body)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.label}</span>
                    <div style={{ width:120, height:14, background:'var(--border-light)', borderRadius:3, overflow:'hidden' }}>
                      <div style={{
                        height:'100%', background:'#fbbc04',
                        width: `${Math.round((d.value/modal.dados[0].value)*100)}%`,
                        borderRadius:3,
                      }} />
                    </div>
                    <span style={{ fontSize:12, color:'var(--green)', fontWeight:700, minWidth:80, textAlign:'right' }}>{fmtR(d.value)}</span>
                  </div>
                ))}
                {!modal.dados.length && <p style={{ color:'var(--muted)', textAlign:'center' }}>Sem dados</p>}
              </div>
            </>
          )}

          {/* Vendas vs Compras */}
          {modal.tipo === 'vendas-compras' && (
            <>
              <div style={{ display:'flex', gap:16, marginBottom:8 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <div style={{ width:12, height:12, background:'#8ab4f8', borderRadius:2 }} />
                  <span style={{ fontSize:12, color:'var(--muted)' }}>Vendas</span>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <div style={{ width:12, height:12, background:'#f28b82', borderRadius:2 }} />
                  <span style={{ fontSize:12, color:'var(--muted)' }}>Compras</span>
                </div>
              </div>
              <DualBarChart items={modal.dados} keyA="vendas" keyB="compras" height={280} />
            </>
          )}

          {/* Fluxo de Caixa */}
          {modal.tipo === 'fluxo' && (
            <>
              <div style={{ display:'flex', gap:16, marginBottom:8 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <div style={{ width:12, height:12, background:'#81c995', borderRadius:2 }} />
                  <span style={{ fontSize:12, color:'var(--muted)' }}>Entradas</span>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <div style={{ width:12, height:12, background:'#f28b82', borderRadius:2 }} />
                  <span style={{ fontSize:12, color:'var(--muted)' }}>Saídas</span>
                </div>
              </div>
              <DualBarChart items={modal.dados} keyA="entradas" keyB="saidas" colorA="#81c995" colorB="#f28b82" height={280} />
            </>
          )}

          {/* Resumo Financeiro */}
          {modal.tipo === 'resumo' && modal.dados && (
            <ResumoFinanceiro d={modal.dados} />
          )}
        </ChartModal>
      )}

      {/* ════════════════ MODAL CONFIRMAÇÃO EXCLUSÃO ════════════════ */}
      {confirmDel && (
        <div className="modal-overlay" onClick={() => setConfirmDel(null)}>
          <div className="modal-card mini" onClick={e => e.stopPropagation()} style={{ maxWidth:360 }}>
            <div className="modal-header"><h3>Confirmar exclusão</h3></div>
            <div className="modal-body" style={{ paddingBottom:20 }}>
              <p style={{ margin:0 }}>Excluir <strong>{confirmDel.label}</strong>? Esta ação não pode ser desfeita.</p>
            </div>
            <div className="modal-footer">
              <button onClick={() => setConfirmDel(null)} style={{ ...S.btnSec, flex:1 }}>Cancelar</button>
              <button
                onClick={() => confirmDel.tipo==='conta' ? handleExcluirConta(confirmDel.id) : handleExcluirCredito(confirmDel.id)}
                style={{ ...S.btnDel, flex:1 }}
              >Excluir</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}

// ── Sub-componentes auxiliares ─────────────────────────────────

function Campo({ label, children, style }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4, ...style }}>
      <label style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.4px' }}>{label}</label>
      {children}
    </div>
  )
}

function TabelaGrafico({ items, cols }) {
  if (!items?.length) return null
  const total = items.reduce((s, d) => s + (d.value || 0), 0)
  return (
    <div style={{ marginTop:16 }}>
      <div style={{ display:'grid', gridTemplateColumns:`1fr 1fr`, gap:1 }}>
        {cols.map(c => (
          <div key={c} style={{ fontSize:11, color:'var(--muted)', fontWeight:700, textTransform:'uppercase', padding:'4px 0', letterSpacing:'0.4px' }}>{c}</div>
        ))}
        {items.map((d, i) => (
          <React.Fragment key={i}>
            <div style={{ fontSize:12, color:'var(--text-body)', padding:'3px 0', borderTop:'1px solid var(--border-light)' }}>{d.label}</div>
            <div style={{ fontSize:12, color:'var(--green)', fontWeight:600, padding:'3px 0', borderTop:'1px solid var(--border-light)' }}>{fmtR(d.value)}</div>
          </React.Fragment>
        ))}
        <div style={{ fontSize:12, fontWeight:700, color:'var(--text-header)', borderTop:'2px solid var(--border-light)', paddingTop:6, marginTop:2 }}>Total</div>
        <div style={{ fontSize:12, fontWeight:700, color:'var(--blue)', borderTop:'2px solid var(--border-light)', paddingTop:6, marginTop:2 }}>{fmtR(total)}</div>
      </div>
    </div>
  )
}

function ResumoFinanceiro({ d }) {
  const metaAtingida = d.faltaVender <= 0
  return (
    <div style={{ display:'grid', gap:10 }}>
      <Section titulo="Vendas">
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:8 }}>
          <Kpi label="Vendido Bruto"        value={fmtR(d.vendidoBruto)}      color="var(--green)" />
          <Kpi label="Cancelados"           value={fmtR(d.cancelados)}        color="var(--red)" />
          <Kpi label="Devoluções"           value={fmtR(d.devolucoes)}        color="var(--yellow)" />
          <Kpi label="Créditos Clientes"    value={fmtR(d.totalCreditos)}     color="var(--yellow)" />
          <Kpi label="Faturamento Líquido"  value={fmtR(d.fatLiquido)}        color="var(--blue)" />
          <Kpi label="Compras/Revenda"      value={fmtR(d.comprasRevenda)}    color="var(--muted)" />
          <Kpi label="Lucro Bruto"          value={fmtR(d.lucroBruto)}        color={d.lucroBruto >= 0 ? 'var(--green)' : 'var(--red)'} />
          <Kpi label="Margem"               value={`${d.margemPct.toFixed(1)}%`}  color={d.margemPct >= 30 ? 'var(--green)' : 'var(--yellow)'} />
        </div>
      </Section>

      <Section titulo="Despesas">
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:8 }}>
          <Kpi label="Fixas (Pago)"      value={fmtR(d.fixasPagas)}   color="var(--muted)" />
          <Kpi label="Fixas (A Pagar)"   value={fmtR(d.fixasAP)}      color="var(--yellow)" />
          <Kpi label="Variáveis (Pago)"  value={fmtR(d.varPagas)}     color="var(--muted)" />
          <Kpi label="Variáveis (A Pagar)" value={fmtR(d.varAP)}      color="var(--yellow)" />
          <Kpi label="Pró-Labore (Pago)" value={fmtR(d.proLabPago)}   color="var(--muted)" />
          <Kpi label="Pró-Labore (A Pag)" value={fmtR(d.proLabAP)}   color="var(--yellow)" />
          <Kpi label="Total Despesas"    value={fmtR(d.despesasTot)}  color="var(--red)" />
        </div>
      </Section>

      <Section titulo="Recebimentos">
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:8 }}>
          <Kpi label="Recebido"    value={fmtR(d.recebido)}   color="var(--green)" />
          <Kpi label="A Receber"   value={fmtR(d.aReceber)}   color="var(--yellow)" />
        </div>
      </Section>

      <Section titulo="KPIs">
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:8 }}>
          <Kpi label="Ponto de Equilíbrio" value={fmtR(d.pontoEq)} color="var(--blue)" />
          <Kpi
            label="Falta Vender"
            value={metaAtingida ? 'Meta atingida!' : fmtR(d.faltaVender)}
            color={metaAtingida ? 'var(--green)' : 'var(--red)'}
          />
          <Kpi label="PMR (dias)" value={`${d.pmr.toFixed(1)} dias`} color="var(--text-body)" sub="Prazo Médio Recebimento" />
          <Kpi label="PMP (dias)" value={`${d.pmp.toFixed(1)} dias`} color="var(--text-body)" sub="Prazo Médio Pagamento" />
        </div>
      </Section>
    </div>
  )
}

function Section({ titulo, children }) {
  return (
    <div>
      <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8, paddingBottom:4, borderBottom:'1px solid var(--border-light)' }}>
        {titulo}
      </div>
      {children}
    </div>
  )
}

// ── Estilos inline centralizados ──────────────────────────────
const S = {
  inp: {
    background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:6,
    color:'var(--input-text)', padding:'7px 10px', fontSize:13, outline:'none',
  },
  th: {
    background:'var(--table-header-bg)', color:'var(--table-header-text)',
    fontSize:11, fontWeight:700, textAlign:'left', padding:'8px 10px',
    textTransform:'uppercase', letterSpacing:'0.4px', whiteSpace:'nowrap',
  },
  td: {
    padding:'7px 10px', color:'var(--text-body)', fontSize:12, whiteSpace:'nowrap',
  },
  btnPri: {
    background:'var(--blue)', color:'#0f0f0f', border:'none', borderRadius:6,
    padding:'8px 16px', fontWeight:700, cursor:'pointer', fontSize:13,
  },
  btnSec: {
    background:'var(--btn-cancel-bg)', color:'var(--btn-cancel-text)', border:'none',
    borderRadius:6, padding:'8px 16px', fontWeight:600, cursor:'pointer', fontSize:13,
  },
  btnDel: {
    background:'var(--red)', color:'#0f0f0f', border:'none', borderRadius:6,
    padding:'8px 16px', fontWeight:700, cursor:'pointer', fontSize:13,
  },
  btnIcon: {
    background:'none', border:'none', cursor:'pointer', padding:'2px 4px', fontSize:14, lineHeight:1,
  },
}

