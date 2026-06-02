import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import AppShell from '../../components/ui/AppShell'
import { fmtR, getVendasRelatorio } from '../../services/relatorioService'

const S = {
  inp: { background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:6, color:'var(--input-text)', padding:'7px 10px', fontSize:13, outline:'none' },
  th:  { background:'var(--table-header-bg)', color:'var(--table-header-text)', fontSize:11, fontWeight:700, textAlign:'left', padding:'8px 10px', textTransform:'uppercase', letterSpacing:'0.4px', whiteSpace:'nowrap' },
  td:  { padding:'7px 10px', color:'var(--text-body)', fontSize:12, whiteSpace:'nowrap' },
  btn: { background:'var(--blue)', color:'#0f0f0f', border:'none', borderRadius:6, padding:'8px 16px', fontWeight:700, cursor:'pointer', fontSize:13 },
}

const STATUS_COR = { CANCELADO:'var(--red)', DEVOLVIDO:'var(--yellow)', ENVIADO:'var(--green)' }

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

export default function RelatorioPage() {
  const { profile }   = useAuth()
  const { showToast } = useApp()
  const tenantId      = profile?.tenant_id

  const [dataIni, setDataIni]       = useState(primeiroDiaMes)
  const [dataFim, setDataFim]       = useState(ultimoDiaMes)
  const [busca, setBusca]           = useState('')
  const [vendasBase, setVendasBase] = useState([])  // todos do período (sem filtro de busca)
  const [carregando, setCarregando] = useState(false)

  // Carrega do servidor apenas por período (sem busca — busca é client-side)
  const carregar = useCallback(async () => {
    if (!tenantId) return
    setCarregando(true)
    try {
      const rows = await getVendasRelatorio(tenantId, { dataInicio: dataIni, dataFim })
      setVendasBase(rows)
    } catch { showToast('Erro ao carregar vendas.', 'error') }
    setCarregando(false)
  }, [tenantId, dataIni, dataFim, showToast])

  useEffect(() => { carregar() }, [tenantId]) // eslint-disable-line

  // Filtro de busca aplicado CLIENT-SIDE em tempo real (sem chamada ao servidor)
  const vendas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return vendasBase
    // Suporta múltiplos termos separados por vírgula OU espaço
    const termos = termo.split(/[,\s]+/).filter(Boolean)
    return vendasBase.filter(v => {
      const txt = [v.produto, v.modelo, v.cor, v.marca, v.tamanho, v.cliente_nome, v.live_nome, v.codigo]
        .join(' ').toLowerCase()
      return termos.every(t => txt.includes(t))
    })
  }, [vendasBase, busca])

  const totalLiquido = vendas.reduce((s, v) => {
    const st = (v.status || '').toUpperCase()
    return s + (st === 'CANCELADO' || st === 'DEVOLVIDO' ? 0 : Number(v.preco) || 0)
  }, 0)

  return (
    <AppShell title="Relatório" hideTitle>
      {/* Filtros de período */}
      <div style={{ display:'flex', alignItems:'center', flexWrap:'wrap', gap:8, padding:'12px 16px', borderBottom:'1px solid var(--border-light)', background:'var(--header-bg)' }}>
        <span style={{ fontSize:14, fontWeight:700, color:'var(--text-header)' }}>Relatório de Vendas</span>
        <div style={{ flex:1 }} />
        <label style={{ fontSize:12, color:'var(--muted)' }}>De</label>
        <input type="date" value={dataIni} onChange={e => setDataIni(e.target.value)} style={S.inp} />
        <label style={{ fontSize:12, color:'var(--muted)' }}>Até</label>
        <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} style={S.inp} />
        <button onClick={carregar} style={S.btn}>Filtrar</button>
      </div>

      <div style={{ padding:16 }}>
        {/* Busca inteligente em tempo real */}
        <div style={{ marginBottom:12 }}>
          <input
            placeholder="Busca inteligente: produto, cliente, live, código… (separe termos por vírgula ou espaço)"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            style={{ ...S.inp, width:'100%', fontSize:13 }}
          />
        </div>

        {carregando ? (
          <p style={{ color:'var(--muted)' }}>Carregando…</p>
        ) : (
          <>
            <p style={{ fontSize:12, color:'var(--muted)', marginBottom:8 }}>
              {vendas.length} de {vendasBase.length} registro(s)
              {busca.trim() && <span style={{ color:'var(--blue)', marginLeft:6 }}>· filtrado por "{busca.trim()}"</span>}
              {' · '}Total líquido: <strong style={{ color:'var(--green)' }}>{fmtR(totalLiquido)}</strong>
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
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--table-row-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}>
                      <td style={S.td}>{fmtData(v.data_live)}</td>
                      <td style={S.td}>{v.live_nome}</td>
                      <td style={S.td}>{v.cliente_nome}</td>
                      <td style={S.td}>{v.produto}</td>
                      <td style={S.td}>{v.modelo}</td>
                      <td style={S.td}>{v.cor}</td>
                      <td style={S.td}>{v.tamanho}</td>
                      <td style={S.td}>{v.codigo}</td>
                      <td style={{ ...S.td, color:'var(--green)', fontWeight:600 }}>{fmtR(v.preco)}</td>
                      <td style={{ ...S.td, color: STATUS_COR[(v.status||'').toUpperCase()] || 'var(--muted)', fontSize:11 }}>
                        {v.status || '—'}
                      </td>
                    </tr>
                  ))}
                  {!vendas.length && (
                    <tr>
                      <td colSpan={10} style={{ textAlign:'center', padding:24, color:'var(--muted)' }}>
                        {busca.trim()
                          ? `Nenhum resultado para "${busca.trim()}"`
                          : 'Nenhum registro encontrado no período.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}
