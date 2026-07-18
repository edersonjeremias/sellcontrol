import React, { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import AppShell from '../../components/ui/AppShell'
import {
  fmtR,
  getVendasPorAno, getVendasPorMes, getVendasPorDia,
  getTopClientesMes, getVendasVsComprasDia, getFluxoCaixaMes,
  getResumoFinanceiro,
} from '../../services/relatorioService'

// ── Gráfico de barras simples ──────────────────────────────────
function BarChart({ items = [], color = '#8ab4f8', height = 180 }) {
  if (!items.length) return <p style={{ color:'var(--muted)', textAlign:'center', padding:24 }}>Sem dados</p>
  const max  = Math.max(...items.map(d => d.value || 0), 1)
  const barH = height - 28
  return (
    <div style={{ display:'flex', alignItems:'flex-end', gap:2, height, padding:'0 4px' }}>
      {items.map((d, i) => {
        const h = Math.max(Math.round((d.value / max) * barH), d.value > 0 ? 2 : 0)
        return (
          <div key={i} title={`${d.label}: ${fmtR(d.value)}`}
            style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-end', height:'100%' }}>
            <div style={{ width:'100%', height:h, background:color, borderRadius:'2px 2px 0 0' }} />
            <div style={{ fontSize:9, color:'var(--muted)', marginTop:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'100%', textAlign:'center' }}>{d.label}</div>
          </div>
        )
      })}
    </div>
  )
}

function DualBarChart({ items = [], colorA = '#8ab4f8', colorB = '#f28b82', keyA, keyB, height = 180 }) {
  if (!items.length) return <p style={{ color:'var(--muted)', textAlign:'center', padding:24 }}>Sem dados</p>
  const max  = Math.max(...items.map(d => Math.max(d[keyA]||0, d[keyB]||0)), 1)
  const barH = height - 28
  return (
    <div style={{ display:'flex', alignItems:'flex-end', gap:2, height, padding:'0 4px' }}>
      {items.map((d, i) => {
        const hA = Math.max(Math.round(((d[keyA]||0)/max)*barH), d[keyA]>0?2:0)
        const hB = Math.max(Math.round(((d[keyB]||0)/max)*barH), d[keyB]>0?2:0)
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

function DashCard({ title, sub, onClick, children }) {
  return (
    <div onClick={onClick} style={{ background:'var(--card-bg)', border:'1px solid var(--border-light)', borderRadius:8, padding:'12px 14px', cursor:'pointer', display:'flex', flexDirection:'column', gap:8 }}
      onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,0.4)' }}
      onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow='' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontSize:12, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.5px' }}>{title}</span>
        {sub && <span style={{ fontSize:11, color:'var(--muted)' }}>{sub}</span>}
      </div>
      {children}
      <div style={{ fontSize:11, color:'var(--blue)' }}>Clique para ampliar ▸</div>
    </div>
  )
}

function ChartModal({ titulo, onClose, children }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth:720, width:'95vw', maxHeight:'90vh' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <h3 style={{ margin:0, fontSize:16 }}>{titulo}</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--muted)', fontSize:18, cursor:'pointer' }}>✕</button>
        </div>
        <div className="modal-body" style={{ padding:20, paddingBottom:20, overflowY:'auto' }}>{children}</div>
      </div>
    </div>
  )
}

function TabelaGrafico({ items, cols }) {
  if (!items?.length) return null
  const total = items.reduce((s, d) => s + (d.value || 0), 0)
  return (
    <div style={{ marginTop:16 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:1 }}>
        {cols.map(c => <div key={c} style={{ fontSize:11, color:'var(--muted)', fontWeight:700, textTransform:'uppercase', padding:'4px 0', letterSpacing:'0.4px' }}>{c}</div>)}
        {items.map((d, i) => (
          <React.Fragment key={i}>
            <div style={{ fontSize:12, color:'var(--text-body)', padding:'3px 0', borderTop:'1px solid var(--border-light)' }}>{d.label}</div>
            <div style={{ fontSize:12, color:'var(--green)', fontWeight:600, padding:'3px 0', borderTop:'1px solid var(--border-light)' }}>{fmtR(d.value)}</div>
          </React.Fragment>
        ))}
        <div style={{ fontSize:12, fontWeight:700, color:'var(--text-header)', borderTop:'2px solid var(--border-light)', paddingTop:6 }}>Total</div>
        <div style={{ fontSize:12, fontWeight:700, color:'var(--blue)', borderTop:'2px solid var(--border-light)', paddingTop:6 }}>{fmtR(total)}</div>
      </div>
    </div>
  )
}

function Kpi({ label, value, color = 'var(--text-body)', sub }) {
  return (
    <div style={{ background:'var(--header-bg)', border:'1px solid var(--border-light)', borderRadius:6, padding:'10px 14px' }}>
      <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:18, fontWeight:800, color }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{sub}</div>}
    </div>
  )
}

function Section({ titulo, children }) {
  return (
    <div>
      <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8, paddingBottom:4, borderBottom:'1px solid var(--border-light)' }}>{titulo}</div>
      {children}
    </div>
  )
}

function ResumoFinanceiro({ d }) {
  const metaAtingida = d.faltaVender <= 0
  return (
    <div style={{ display:'grid', gap:14 }}>
      <Section titulo="Vendas">
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:8 }}>
          <Kpi label="Vendido Bruto"       value={fmtR(d.vendidoBruto)}  color="var(--green)" />
          <Kpi label="Cancelados"          value={fmtR(d.cancelados)}    color="var(--red)" />
          <Kpi label="Devoluções"          value={fmtR(d.devolucoes)}    color="var(--yellow)" />
          <Kpi label="Créditos Clientes"   value={fmtR(d.totalCreditos)} color="var(--yellow)" />
          <Kpi label="Faturamento Líquido" value={fmtR(d.fatLiquido)}    color="var(--blue)" />
          <Kpi label="Compras/Revenda"     value={fmtR(d.comprasRevenda)} color="var(--muted)" />
          <Kpi label="Lucro Bruto"         value={fmtR(d.lucroBruto)}    color={d.lucroBruto >= 0 ? 'var(--green)' : 'var(--red)'} />
          <Kpi label="Margem"              value={`${d.margemPct.toFixed(1)}%`} color={d.margemPct >= 30 ? 'var(--green)' : 'var(--yellow)'} />
        </div>
      </Section>
      <Section titulo="Despesas">
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:8 }}>
          <Kpi label="Fixas (Pago)"         value={fmtR(d.fixasPagas)} color="var(--muted)" />
          <Kpi label="Fixas (A Pagar)"      value={fmtR(d.fixasAP)}    color="var(--yellow)" />
          <Kpi label="Variáveis (Pago)"     value={fmtR(d.varPagas)}   color="var(--muted)" />
          <Kpi label="Variáveis (A Pagar)"  value={fmtR(d.varAP)}      color="var(--yellow)" />
          <Kpi label="Pró-Labore (Pago)"    value={fmtR(d.proLabPago)} color="var(--muted)" />
          <Kpi label="Pró-Labore (A Pagar)" value={fmtR(d.proLabAP)}  color="var(--yellow)" />
          <Kpi label="Total Despesas"       value={fmtR(d.despesasTot)} color="var(--red)" />
        </div>
      </Section>
      <Section titulo="Recebimentos">
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:8 }}>
          <Kpi label="Recebido"  value={fmtR(d.recebido)} color="var(--green)" />
          <Kpi label="A Receber" value={fmtR(d.aReceber)} color="var(--yellow)" />
        </div>
      </Section>
      <Section titulo="KPIs">
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:8 }}>
          <Kpi label="Ponto de Equilíbrio" value={fmtR(d.pontoEq)} color="var(--blue)" />
          <Kpi label="Falta Vender" value={metaAtingida ? 'Meta atingida!' : fmtR(d.faltaVender)} color={metaAtingida ? 'var(--green)' : 'var(--red)'} />
          <Kpi label="PMR (dias)" value={`${d.pmr.toFixed(1)} dias`} color="var(--text-body)" sub="Prazo Médio Recebimento" />
          <Kpi label="PMP (dias)" value={`${d.pmp.toFixed(1)} dias`} color="var(--text-body)" sub="Prazo Médio Pagamento" />
        </div>
      </Section>
    </div>
  )
}

const MESES_LABEL = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const MESES_PT    = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

export default function DashboardFinanceiroPage() {
  const { profile }   = useAuth()
  const { showToast } = useApp()
  const tenantId      = profile?.tenant_id

  const hoje     = new Date()
  const anoAtual = hoje.getFullYear()
  const mesAtual = hoje.getMonth() + 1

  const [anoSel, setAnoSel]         = useState(String(anoAtual))
  const [mesSel, setMesSel]         = useState(String(mesAtual))
  const [modal, setModal]           = useState(null)
  const [carregando, setCarregando] = useState(false)

  const ANOS = Array.from({ length: 5 }, (_, i) => String(anoAtual - 2 + i))

  async function abrirModal(tipo) {
    if (!tenantId) return
    setCarregando(true)
    const ano = parseInt(anoSel)
    const mes = parseInt(mesSel)
    try {
      let dados, titulo
      if (tipo === 'ano') {
        dados = await getVendasPorAno(tenantId); titulo = 'Vendas por Ano'
      } else if (tipo === 'mes') {
        dados = await getVendasPorMes(tenantId, ano); titulo = `Vendas por Mês — ${ano}`
      } else if (tipo === 'dia') {
        dados = await getVendasPorDia(tenantId, ano, mes); titulo = `Vendas por Dia — ${MESES_PT[mes-1]} ${ano}`
      } else if (tipo === 'clientes') {
        dados = await getTopClientesMes(tenantId, ano, mes); titulo = `Top 10 Clientes — ${MESES_PT[mes-1]} ${ano}`
      } else if (tipo === 'vendas-compras') {
        dados = await getVendasVsComprasDia(tenantId, ano, mes); titulo = `Vendas vs Compras — ${MESES_PT[mes-1]} ${ano}`
      } else if (tipo === 'fluxo') {
        dados = await getFluxoCaixaMes(tenantId, ano, mes); titulo = `Fluxo de Caixa — ${MESES_PT[mes-1]} ${ano}`
      } else if (tipo === 'resumo') {
        dados = await getResumoFinanceiro(tenantId, ano, mes); titulo = `Resumo Financeiro — ${MESES_PT[mes-1]} ${ano}`
      }
      setModal({ tipo, titulo, dados })
    } catch (e) { showToast('Erro ao carregar dados.', 'error'); console.error(e) }
    setCarregando(false)
  }

  const S = { inp: { background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:6, color:'var(--input-text)', padding:'7px 10px', fontSize:13, outline:'none' } }
  const subMes = `${MESES_LABEL[parseInt(mesSel)-1]}/${anoSel}`

  return (
    <AppShell title="Dashboard Financeiro" hideTitle>
      {/* Seletores */}
      <div style={{ display:'flex', alignItems:'center', flexWrap:'wrap', gap:8, padding:'12px 16px', borderBottom:'1px solid var(--border-light)', background:'var(--header-bg)' }}>
        <span style={{ fontSize:14, fontWeight:700, color:'var(--text-header)' }}>Dashboard Financeiro</span>
        <div style={{ flex:1 }} />
        <label style={{ fontSize:12, color:'var(--muted)' }}>Ano:</label>
        <select value={anoSel} onChange={e => setAnoSel(e.target.value)} style={S.inp}>
          {ANOS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <label style={{ fontSize:12, color:'var(--muted)' }}>Mês:</label>
        <select value={mesSel} onChange={e => setMesSel(e.target.value)} style={S.inp}>
          {MESES_LABEL.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
        </select>
        {carregando && <span style={{ fontSize:12, color:'var(--muted)' }}>Carregando…</span>}
      </div>

      <div style={{ padding:16 }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:12 }}>
          <DashCard title="Vendas por Ano" onClick={() => abrirModal('ano')}>
            <div style={{ fontSize:12, color:'var(--muted)' }}>Total acumulado por ano</div>
          </DashCard>

          <DashCard title="Vendas por Mês" sub={anoSel} onClick={() => abrirModal('mes')}>
            <div style={{ fontSize:12, color:'var(--muted)' }}>Todos os meses de {anoSel}</div>
          </DashCard>

          <DashCard title="Vendas por Dia" sub={subMes} onClick={() => abrirModal('dia')}>
            <div style={{ fontSize:12, color:'var(--muted)' }}>Cada dia de {subMes}</div>
          </DashCard>

          <DashCard title="Top 10 Clientes" sub={subMes} onClick={() => abrirModal('clientes')}>
            <div style={{ fontSize:12, color:'var(--muted)' }}>Maiores compradores do mês</div>
          </DashCard>

          <DashCard title="Vendas vs Compras" sub={subMes} onClick={() => abrirModal('vendas-compras')}>
            <div style={{ fontSize:12, color:'var(--muted)' }}>Receita vs custo de revenda por dia</div>
          </DashCard>

          <DashCard title="Fluxo de Caixa" sub={subMes} onClick={() => abrirModal('fluxo')}>
            <div style={{ fontSize:12, color:'var(--muted)' }}>Entradas vs saídas por dia</div>
          </DashCard>

          <DashCard title="Resumo Financeiro" sub={subMes} onClick={() => abrirModal('resumo')}>
            <div style={{ fontSize:12, color:'var(--muted)' }}>Faturamento, margem, ponto de equilíbrio, PMR, PMP</div>
          </DashCard>
        </div>
      </div>

      {/* Modais */}
      {modal && (
        <ChartModal titulo={modal.titulo} onClose={() => setModal(null)}>
          {modal.tipo === 'ano' && (
            <><BarChart items={modal.dados} color="#8ab4f8" height={280} /><TabelaGrafico items={modal.dados} cols={['Ano','Total']} /></>
          )}
          {modal.tipo === 'mes' && (
            <><BarChart items={modal.dados} color="#81c995" height={280} /><TabelaGrafico items={modal.dados} cols={['Mês','Total']} /></>
          )}
          {modal.tipo === 'dia' && (
            <><BarChart items={modal.dados} color="#c58af9" height={280} /><TabelaGrafico items={modal.dados} cols={['Dia','Total']} /></>
          )}
          {modal.tipo === 'clientes' && (
            <div>
              {modal.dados.map((d, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                  <span style={{ fontSize:12, color:'var(--muted)', width:24, textAlign:'right' }}>#{i+1}</span>
                  <span style={{ flex:1, fontSize:13, color:'var(--text-body)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.label}</span>
                  <div style={{ width:120, height:14, background:'var(--border-light)', borderRadius:3, overflow:'hidden' }}>
                    <div style={{ height:'100%', background:'#fbbc04', width:`${Math.round((d.value/modal.dados[0].value)*100)}%`, borderRadius:3 }} />
                  </div>
                  <span style={{ fontSize:12, color:'var(--green)', fontWeight:700, minWidth:90, textAlign:'right' }}>{fmtR(d.value)}</span>
                </div>
              ))}
              {!modal.dados.length && <p style={{ color:'var(--muted)', textAlign:'center' }}>Sem dados</p>}
            </div>
          )}
          {modal.tipo === 'vendas-compras' && (
            <>
              <div style={{ display:'flex', gap:16, marginBottom:10 }}>
                <Legenda cor="#8ab4f8" label="Vendas" />
                <Legenda cor="#f28b82" label="Compras" />
              </div>
              <DualBarChart items={modal.dados} keyA="vendas" keyB="compras" height={280} />
            </>
          )}
          {modal.tipo === 'fluxo' && (
            <>
              <div style={{ display:'flex', gap:16, marginBottom:10 }}>
                <Legenda cor="#81c995" label="Entradas" />
                <Legenda cor="#f28b82" label="Saídas" />
              </div>
              <DualBarChart items={modal.dados} keyA="entradas" keyB="saidas" colorA="#81c995" colorB="#f28b82" height={280} />
            </>
          )}
          {modal.tipo === 'resumo' && modal.dados && <ResumoFinanceiro d={modal.dados} />}
        </ChartModal>
      )}
    </AppShell>
  )
}

function Legenda({ cor, label }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
      <div style={{ width:12, height:12, background:cor, borderRadius:2 }} />
      <span style={{ fontSize:12, color:'var(--muted)' }}>{label}</span>
    </div>
  )
}
