import { useState, useEffect, useCallback } from 'react'
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
  const { profile }    = useAuth()
  const { showToast }  = useApp()
  const tenantId       = profile?.tenant_id

  const [dataIni, setDataIni]     = useState(primeiroDiaMes)
  const [dataFim, setDataFim]     = useState(ultimoDiaMes)
  const [busca, setBusca]         = useState('')
  const [vendas, setVendas]       = useState([])
  const [carregando, setCarregando] = useState(false)

  const carregar = useCallback(async () => {
    if (!tenantId) return
    setCarregando(true)
    try {
      setVendas(await getVendasRelatorio(tenantId, { dataInicio: dataIni, dataFim, busca }))
    } catch { showToast('Erro ao carregar vendas.', 'error') }
    setCarregando(false)
  }, [tenantId, dataIni, dataFim, busca, showToast])

  useEffect(() => { carregar() }, [tenantId]) // eslint-disable-line

  const totalLiquido = vendas.reduce((s, v) => {
    const st = (v.status || '').toUpperCase()
    return s + (st === 'CANCELADO' || st === 'DEVOLVIDO' ? 0 : Number(v.preco) || 0)
  }, 0)

  return (
    <AppShell title="Relatório" hideTitle>
      {/* Filtros */}
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
        {/* Busca */}
        <div style={{ display:'flex', gap:8, marginBottom:12 }}>
          <input
            placeholder="Buscar produto, cliente, live, código…"
            value={busca} onChange={e => setBusca(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && carregar()}
            style={{ ...S.inp, flex:1 }}
          />
          <button onClick={carregar} style={S.btn}>Buscar</button>
        </div>

        {carregando ? (
          <p style={{ color:'var(--muted)' }}>Carregando…</p>
        ) : (
          <>
            <p style={{ fontSize:12, color:'var(--muted)', marginBottom:8 }}>
              {vendas.length} registro(s) · Total líquido: <strong style={{ color:'var(--green)' }}>{fmtR(totalLiquido)}</strong>
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
                    <tr><td colSpan={10} style={{ textAlign:'center', padding:24, color:'var(--muted)' }}>Nenhum registro encontrado.</td></tr>
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
