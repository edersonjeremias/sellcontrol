import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import AppShell from '../../components/ui/AppShell'
import {
  STATUS_PEDIDO_OPTS, calcTotal,
  buscarItensPedido, salvarItens, gerarPedido, buscarPedidoParaReimprimir, atribuirRomaneio,
} from '../../services/pedidosService'
import { getClientes } from '../../services/clientesService'

const STATUS_COR = {
  'Separado':      '#81c995',
  'Enviado':       '#8ab4f8',
  'Comprar':       '#fbbc04',
  'Devolução':     '#f28b82',
  'Gerar Crédito': '#c58af9',
  'Cancelado':     '#9aa0a6',
  'Pendente':      '#fbbc04',
}

const COLS = [
  { key: 'produto',       label: 'PRODUTO',    w: 110 },
  { key: 'modelo',        label: 'MODELO',     w: 95 },
  { key: 'cor',           label: 'COR',        w: 75 },
  { key: 'marca',         label: 'MARCA',      w: 75 },
  { key: 'tamanho',       label: 'TAM.',       w: 55 },
  { key: 'preco',         label: 'PREÇO',      w: 80 },
  { key: 'codigo',        label: 'CÓD.',       w: 80 },
  { key: 'cliente_nome',  label: 'CLIENTE',    w: 110 },
  { key: 'data_live',     label: 'DATA LIVE',  w: 90 },
  { key: 'observacao',    label: 'OBSERVAÇÃO', w: 140 },
  { key: 'status',        label: 'STATUS',     w: 130 },
  { key: 'numero_pedido', label: 'ROM.',       w: 60 },
]

const SI = {
  background: 'var(--input-bg)', border: '1px solid var(--input-border)',
  color: 'var(--input-text)', borderRadius: 6, padding: '5px 8px',
  fontSize: 12, minWidth: 100,
}

const TH = {
  padding: '10px 8px', textAlign: 'left', fontSize: 11, fontWeight: 700,
  color: 'var(--table-header-text)', textTransform: 'uppercase',
  letterSpacing: '0.4px', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border-light)',
  background: 'var(--table-header-bg)',
}

const TD = {
  padding: '8px 8px', fontSize: 12, color: 'var(--text-body)',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
}

function fmtMoney(v) {
  const n = Number(v)
  if (!n && n !== 0) return ''
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d) {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

// ── Print modal ──────────────────────────────────────────────
function PrintModal({ data, onClose }) {
  const printRef = useRef()
  const total = useMemo(() => calcTotal(data.itens), [data.itens])

  function handlePrint() {
    const win = window.open('', '_blank', 'width=900,height=700')
    win.document.write(`
      <html><head><title>Pedido #${data.numero}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; color: #000; padding: 16px; }
        h2 { margin: 0 0 12px; font-size: 16px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #eee; padding: 6px 8px; text-align: left; font-size: 11px; border: 1px solid #ccc; }
        td { padding: 5px 8px; border: 1px solid #ddd; font-size: 11px; }
        .total { margin-top: 12px; font-weight: bold; font-size: 14px; text-align: right; }
        @media print { button { display: none; } }
      </style></head><body>
      <h2>Pedido #${data.numero} — ${data.itens.length} item(s)</h2>
      <table>
        <thead><tr>
          <th>PRODUTO</th><th>MODELO</th><th>COR</th><th>MARCA</th><th>TAM.</th>
          <th>PREÇO</th><th>CÓD.</th><th>CLIENTE</th><th>DATA LIVE</th><th>OBS.</th><th>STATUS</th>
        </tr></thead>
        <tbody>
          ${data.itens.map(i => `<tr>
            <td>${i.produto||''}</td><td>${i.modelo||''}</td><td>${i.cor||''}</td>
            <td>${i.marca||''}</td><td>${i.tamanho||''}</td>
            <td style="text-align:right">${i.preco ? 'R$ '+fmtMoney(i.preco) : ''}</td>
            <td>${i.codigo_peca||''}</td><td>${i.cliente_nome||''}</td>
            <td>${fmtDate(i.data_live)}</td><td>${i.observacao||''}</td><td>${i.status||''}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div class="total">Total: R$ ${fmtMoney(total)}</div>
      <script>window.print(); window.close();<\/script>
      </body></html>
    `)
    win.document.close()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'var(--card-bg)', border: '1px solid var(--border-light)',
        borderRadius: 10, padding: 24, width: 'min(900px,95vw)', maxHeight: '85vh',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-header)', fontWeight: 700, fontSize: 15 }}>
            Romaneio #{data.numero} — {data.itens.length} item(s)
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-acao btn-blue" onClick={handlePrint} style={{ flex: 'none', minWidth: 90 }}>
              Imprimir
            </button>
            <button className="btn-acao btn-dark" onClick={onClose} style={{ flex: 'none', minWidth: 60 }}>
              Fechar
            </button>
          </div>
        </div>

        <div style={{ overflow: 'auto', flex: 1, border: '1px solid var(--border-light)', borderRadius: 6 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
            <thead>
              <tr style={{ background: 'var(--table-header-bg)', position: 'sticky', top: 0 }}>
                {['PRODUTO','MODELO','COR','MARCA','TAM.','PREÇO','CÓD.','CLIENTE','DATA LIVE','OBS.','STATUS'].map(h => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.itens.map(i => (
                <tr key={i.id} style={{ borderBottom: '1px solid var(--table-border)' }}>
                  <td style={TD}>{i.produto}</td>
                  <td style={TD}>{i.modelo}</td>
                  <td style={TD}>{i.cor}</td>
                  <td style={TD}>{i.marca}</td>
                  <td style={TD}>{i.tamanho}</td>
                  <td style={{ ...TD, textAlign: 'right' }}>{i.preco ? `R$ ${fmtMoney(i.preco)}` : ''}</td>
                  <td style={TD}>{i.codigo}</td>
                  <td style={TD}>{i.cliente_nome}</td>
                  <td style={TD}>{fmtDate(i.data_live)}</td>
                  <td style={TD}>{i.observacao}</td>
                  <td style={{ ...TD, color: STATUS_COR[i.status] || 'inherit' }}>{i.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ textAlign: 'right', color: '#81c995', fontWeight: 700, fontSize: 14 }}>
          Total: R$ {fmtMoney(total)}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────
export default function PedidosPage() {
  const { profile } = useAuth()
  const tenantId = profile?.tenant_id

  const [filtros, setFiltros] = useState({
    clienteNome: '',
    dataLive: '',
    statusFiltro: 'nao_enviados',
    numeroPedido: '',
    busca: '',
  })

  const [itens, setItens]       = useState([])
  const [clientes, setClientes] = useState([])
  const [dirty, setDirty]       = useState(new Map())
  const [loading, setLoading]   = useState(false)
  const [err, setErr]           = useState(null)
  const [msg, setMsg]           = useState(null)
  const [printData, setPrintData] = useState(null)
  const [romAddVal, setRomAddVal] = useState('')

  useEffect(() => {
    if (!tenantId) return
    getClientes(tenantId).then(({ data }) => {
      setClientes((data || []).map(c => (c.instagram || '').replace(/^@/, '').trim()).filter(Boolean))
    })
  }, [tenantId])

  const showMsg = useCallback((text) => {
    setMsg(text)
    setTimeout(() => setMsg(null), 2500)
  }, [])

  const handleBuscar = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    setErr(null)
    try {
      const data = await buscarItensPedido(tenantId, {
        clienteNome: filtros.clienteNome,
        dataLive: filtros.dataLive,
        statusFiltro: filtros.statusFiltro,
        numeroPedido: filtros.numeroPedido,
      })
      setItens(data)
      setDirty(new Map())
    } catch (e) {
      setErr(e.message || 'Erro ao buscar')
    } finally {
      setLoading(false)
    }
  }, [tenantId, filtros])

  const handleChange = useCallback((id, field, value) => {
    setItens(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i))
    setDirty(prev => {
      const next = new Map(prev)
      // find the current item from itens to merge
      next.set(id, { ...(next.get(id) || {}), id, [field]: value })
      return next
    })
  }, [])

  const handleSalvar = useCallback(async () => {
    if (!tenantId || !dirty.size) return
    // merge dirty fields with full item data
    const dirtyWithFull = new Map()
    itens.forEach(i => {
      if (dirty.has(i.id)) dirtyWithFull.set(i.id, { ...i, ...dirty.get(i.id) })
    })
    setLoading(true)
    try {
      await salvarItens(tenantId, dirtyWithFull)
      setDirty(new Map())
      showMsg('Salvo!')
    } catch (e) {
      setErr(e.message || 'Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }, [tenantId, dirty, itens, showMsg])

  const handleGerarPedido = useCallback(async () => {
    if (!tenantId) return
    const semPedido = itens.filter(i => !i.numero_pedido)
    if (!semPedido.length) {
      setErr('Todos os itens já possuem romaneio.')
      return
    }
    if (!window.confirm(`Gerar romaneio para ${semPedido.length} item(s) sem número?`)) return
    setLoading(true)
    try {
      const numPedido = await gerarPedido(tenantId, semPedido)
      showMsg(`Romaneio #${numPedido} gerado!`)
      // Atualiza estado local sem recarregar a tela
      const semIds = new Set(semPedido.map(i => i.id))
      const sepIds = new Set(semPedido.filter(i => i.status === 'Separado').map(i => i.id))
      setItens(prev => prev.map(i => {
        if (!semIds.has(i.id)) return i
        return { ...i, numero_pedido: numPedido, ...(sepIds.has(i.id) ? { status: 'Enviado' } : {}) }
      }))
      setDirty(new Map())
    } catch (e) {
      setErr(e.message || 'Erro ao gerar romaneio')
    } finally {
      setLoading(false)
    }
  }, [tenantId, itens, showMsg])

  const handleAdicionarAoRomaneio = useCallback(async () => {
    if (!tenantId || !romAddVal) return
    const num = Number(romAddVal)
    if (!num) return
    const semRomaneio = itensFiltrados.filter(i => !i.numero_pedido)
    if (!semRomaneio.length) {
      setErr('Todos os itens visíveis já possuem romaneio.')
      return
    }
    if (!window.confirm(`Adicionar ${semRomaneio.length} item(s) ao Romaneio #${num}?`)) return
    setLoading(true)
    try {
      await atribuirRomaneio(tenantId, semRomaneio.map(i => i.id), num)
      setItens(prev => prev.map(i =>
        semRomaneio.some(s => s.id === i.id) ? { ...i, numero_pedido: num } : i
      ))
      showMsg(`${semRomaneio.length} item(s) adicionados ao Romaneio #${num}!`)
      setRomAddVal('')
    } catch (e) {
      setErr(e.message || 'Erro ao adicionar ao romaneio')
    } finally {
      setLoading(false)
    }
  }, [tenantId, romAddVal, itensFiltrados, showMsg])

  const handleRomaneioItemBlur = useCallback(async (id, val) => {
    const num = val ? Number(val) : null
    try {
      await atribuirRomaneio(tenantId, [id], num)
      setItens(prev => prev.map(i => i.id === id ? { ...i, numero_pedido: num } : i))
    } catch (e) {
      setErr(e.message || 'Erro ao atribuir romaneio')
    }
  }, [tenantId])

  const handleReimprimir = useCallback(async () => {
    if (!tenantId || !filtros.numeroPedido) {
      setErr('Informe o Romaneio para reimprimir.')
      return
    }
    setLoading(true)
    try {
      const data = await buscarPedidoParaReimprimir(tenantId, filtros.numeroPedido)
      if (!data.length) { setErr('Pedido não encontrado.'); return }
      setPrintData({ numero: filtros.numeroPedido, itens: data })
    } catch (e) {
      setErr(e.message || 'Erro ao buscar pedido')
    } finally {
      setLoading(false)
    }
  }, [tenantId, filtros.numeroPedido])

  const handleImprimir = useCallback(() => {
    const win = window.open('', '_blank', 'width=1000,height=750')
    const rows = itensFiltrados.map(i => `<tr>
      <td>${i.produto||''}</td><td>${i.modelo||''}</td><td>${i.cor||''}</td>
      <td>${i.marca||''}</td><td>${i.tamanho||''}</td>
      <td style="text-align:right">${i.preco ? 'R$ '+fmtMoney(i.preco) : ''}</td>
      <td>${i.codigo_peca||''}</td><td>${i.cliente_nome||''}</td>
      <td>${fmtDate(i.data_live)}</td><td>${i.observacao||''}</td>
      <td>${i.status||''}</td><td>${i.numero_pedido||''}</td>
    </tr>`).join('')
    win.document.write(`
      <html><head><title>Pedidos</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 11px; color: #000; padding: 16px; }
        h2 { margin: 0 0 10px; font-size: 14px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #eee; padding: 5px 6px; text-align: left; font-size: 10px; border: 1px solid #ccc; }
        td { padding: 4px 6px; border: 1px solid #ddd; }
        .total { margin-top: 10px; font-weight: bold; font-size: 13px; text-align: right; }
      </style></head><body>
      <h2>Controle de Pedidos — ${itensFiltrados.length} item(s)</h2>
      <table>
        <thead><tr>
          <th>PRODUTO</th><th>MODELO</th><th>COR</th><th>MARCA</th><th>TAM.</th>
          <th>PREÇO</th><th>CÓD.</th><th>CLIENTE</th><th>DATA LIVE</th>
          <th>OBS.</th><th>STATUS</th><th>PED.</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="total">Total: R$ ${fmtMoney(total)}</div>
      <script>window.print(); window.close();<\/script>
      </body></html>
    `)
    win.document.close()
  }, [])

  const itensFiltrados = useMemo(() => {
    if (!filtros.busca.trim()) return itens
    const termos = filtros.busca.toLowerCase().split(',').map(t => t.trim()).filter(Boolean)
    return itens.filter(i => {
      const txt = [i.produto, i.modelo, i.cor, i.marca, i.tamanho, i.codigo, i.cliente_nome]
        .join(' ').toLowerCase()
      return termos.every(t => txt.includes(t))
    })
  }, [itens, filtros.busca])

  const total = useMemo(() => calcTotal(itensFiltrados), [itensFiltrados])

  function setF(key, val) { setFiltros(p => ({ ...p, [key]: val })) }

  return (
    <AppShell>
      <div style={{
        padding: '12px', height: '100%', display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {/* ── FILTROS ── */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <input list="ped-clientes" value={filtros.clienteNome}
            onChange={e => setF('clienteNome', e.target.value)}
            placeholder="Cliente" style={{ ...SI, minWidth: 130 }} />
          <datalist id="ped-clientes">
            {clientes.map(c => <option key={c} value={c} />)}
          </datalist>

          <input type="date" value={filtros.dataLive}
            onChange={e => setF('dataLive', e.target.value)}
            style={{ ...SI, width: 130 }} />

          <select value={filtros.statusFiltro}
            onChange={e => setF('statusFiltro', e.target.value)}
            style={{ ...SI, width: 145 }}>
            <option value="todos">Todos status</option>
            <option value="nao_enviados">Não enviados</option>
            {STATUS_PEDIDO_OPTS.filter(Boolean).map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <input value={filtros.busca}
            onChange={e => setF('busca', e.target.value)}
            placeholder="Busca rápida..." style={{ ...SI, minWidth: 130 }} />

          <input value={filtros.numeroPedido} type="number" min="1"
            onChange={e => setF('numeroPedido', e.target.value)}
            placeholder="Romaneio" style={{ ...SI, width: 90 }} />

          <span style={{ color: '#81c995', fontWeight: 700, fontSize: 14, marginLeft: 6, whiteSpace: 'nowrap' }}>
            R$ {fmtMoney(total)}
          </span>
        </div>

        {/* ── AÇÕES ── */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn-acao btn-blue" disabled={loading} onClick={handleBuscar}
            style={{ flex: 'none', minWidth: 80 }}>
            Buscar
          </button>
          <button className="btn-acao btn-purple" disabled={loading || !dirty.size} onClick={handleSalvar}
            style={{ flex: 'none', minWidth: 80 }}>
            Salvar{dirty.size > 0 ? ` (${dirty.size})` : ''}
          </button>
          <button className="btn-acao btn-green" disabled={loading} onClick={handleGerarPedido}
            style={{ flex: 'none', minWidth: 110 }}>
            Gerar Romaneio
          </button>
          <button className="btn-acao btn-purple" disabled={loading} onClick={handleReimprimir}
            style={{ flex: 'none', minWidth: 95 }}>
            Reimprimir
          </button>
          <button className="btn-acao btn-dark" disabled={loading} onClick={handleImprimir}
            style={{ flex: 'none', minWidth: 80 }}>
            Imprimir
          </button>

          <span style={{ color: 'var(--muted)', fontSize: 12, margin: '0 2px' }}>|</span>
          <input
            type="number" min="1" value={romAddVal}
            onChange={e => setRomAddVal(e.target.value)}
            placeholder="Nº Romaneio"
            style={{ ...SI, width: 105, minWidth: 0 }}
            onKeyDown={e => e.key === 'Enter' && handleAdicionarAoRomaneio()}
          />
          <button className="btn-acao btn-ghost" disabled={loading || !romAddVal}
            onClick={handleAdicionarAoRomaneio} style={{ flex: 'none', minWidth: 130 }}>
            + Adicionar ao Rom.
          </button>

          {msg && <span style={{ color: '#81c995', fontSize: 13 }}>{msg}</span>}
          {err && (
            <span style={{ color: '#f28b82', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
              {err}
              <button onClick={() => setErr(null)}
                style={{ background: 'none', border: 'none', color: '#f28b82', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>
                ✕
              </button>
            </span>
          )}
        </div>

        {/* ── TABELA ── */}
        <div style={{
          flex: 1, overflow: 'auto', borderRadius: 6,
          border: '1px solid var(--border-light)', background: 'var(--card-bg)',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 900 }}>
            <thead>
              <tr>
                {COLS.map(c => (
                  <th key={c.key} style={{ ...TH, width: c.w, position: 'sticky', top: 0, zIndex: 2 }}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {itensFiltrados.length === 0 && (
                <tr>
                  <td colSpan={COLS.length} style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>
                    {loading ? 'Carregando...' : 'Nenhum item. Use BUSCAR para carregar dados.'}
                  </td>
                </tr>
              )}
              {itensFiltrados.map(item => (
                <ItemRow key={item.id} item={item} onChange={handleChange} onRomaneioBlur={handleRomaneioItemBlur} />
              ))}
            </tbody>
          </table>
        </div>

        {printData && (
          <PrintModal data={printData} onClose={() => setPrintData(null)} />
        )}
      </div>
    </AppShell>
  )
}

// ── Row component ────────────────────────────────────────────
function ItemRow({ item, onChange, onRomaneioBlur }) {
  return (
    <tr style={{ borderBottom: '1px solid var(--table-border)' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--table-row-hover)' }}
      onMouseLeave={e => { e.currentTarget.style.background = '' }}>
      <td style={TD} title={item.produto}>{item.produto}</td>
      <td style={TD} title={item.modelo}>{item.modelo}</td>
      <td style={TD}>{item.cor}</td>
      <td style={TD}>{item.marca}</td>
      <td style={TD}>{item.tamanho}</td>
      <td style={{ ...TD, textAlign: 'right' }}>
        {item.preco ? `R$ ${fmtMoney(item.preco)}` : ''}
      </td>
      <td style={TD}>{item.codigo}</td>
      <td style={TD} title={item.cliente_nome}>{item.cliente_nome}</td>
      <td style={TD}>{fmtDate(item.data_live)}</td>
      <td style={{ ...TD, padding: '4px 6px' }}>
        <input
          value={item.observacao || ''}
          onChange={e => onChange(item.id, 'observacao', e.target.value)}
          style={{
            background: 'transparent', border: 'none', color: 'var(--text-body)',
            width: '100%', fontSize: 12, outline: 'none',
          }}
        />
      </td>
      <td style={{ ...TD, padding: '4px 6px' }}>
        <select
          value={item.status || ''}
          onChange={e => onChange(item.id, 'status', e.target.value)}
          style={{
            background: 'transparent', border: 'none', width: '100%', fontSize: 12,
            color: STATUS_COR[item.status] || 'var(--text-body)', cursor: 'pointer', outline: 'none',
          }}>
          {STATUS_PEDIDO_OPTS.map(s => (
            <option key={s} value={s} style={{ color: STATUS_COR[s] || 'var(--text-body)', background: '#292a2d' }}>
              {s || '—'}
            </option>
          ))}
        </select>
      </td>
      <td style={{ ...TD, padding: '4px 4px' }}>
        <input
          type="number" min="1"
          value={item.numero_pedido || ''}
          onChange={e => {
            const v = e.target.value ? Number(e.target.value) : null
            onChange(item.id, 'numero_pedido', v)
          }}
          onBlur={e => onRomaneioBlur(item.id, e.target.value)}
          style={{
            background: 'transparent', border: 'none', outline: 'none',
            width: '100%', fontSize: 12, textAlign: 'center',
            color: item.numero_pedido ? '#8ab4f8' : 'var(--muted)',
            fontWeight: item.numero_pedido ? 700 : 400,
          }}
        />
      </td>
    </tr>
  )
}
