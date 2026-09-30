import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import AppShell from '../../components/ui/AppShell'
import {
  STATUS_PEDIDO_OPTS, calcTotal, getStatusPedido,
  buscarItensPedido, salvarItens, gerarPedido, buscarPedidoParaReimprimir,
  atribuirRomaneio, adicionarSeparadosAoRomaneio, criarRomaneioComDimensoes,
  atualizarDimensoesRomaneio,
} from '../../services/pedidosService'
import { getClientes } from '../../services/clientesService'
import { criarNotificacaoCancelamentoConversa } from '../../services/notificacoesConversasService'
import { supabase } from '../../lib/supabase'

const STATUS_COR = {
  'Separado':      '#81c995',
  'Enviado':       '#8ab4f8',
  'Comprar':       '#fbbc04',
  'Comprado':      '#81c995',
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
  const [originalStatus, setOriginalStatus] = useState(new Map())
  const [loading, setLoading]   = useState(false)
  const [err, setErr]           = useState(null)
  const [msg, setMsg]           = useState(null)
  const [printData, setPrintData] = useState(null)
  const [romAddVal, setRomAddVal] = useState('')
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)
  const [statusOpts, setStatusOpts] = useState(STATUS_PEDIDO_OPTS)
  const [statusCores, setStatusCores] = useState(STATUS_COR)

  // Modal dimensões para gerar romaneio
  const [showDimensoesModal, setShowDimensoesModal] = useState(false)
  const [dimensoes, setDimensoes] = useState({ peso: '', altura: '', largura: '', comprimento: '' })
  const [modoEdicao, setModoEdicao] = useState(false)

  // Detecta mudança de tamanho de tela
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const carregarClientes = useCallback(async () => {
    if (!tenantId) return
    const { data } = await getClientes(tenantId)
    setClientes((data || []).map(c => (c.instagram || '').replace(/^@/, '').trim()).filter(Boolean))
  }, [tenantId])

  const carregarStatus = useCallback(async () => {
    if (!tenantId) return
    const { opts, cores } = await getStatusPedido(tenantId)
    setStatusOpts(opts)
    setStatusCores(cores)
  }, [tenantId])

  useEffect(() => {
    carregarClientes()
    carregarStatus()
  }, [carregarClientes, carregarStatus])

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
      setOriginalStatus(new Map())
    } catch (e) {
      setErr(e.message || 'Erro ao buscar')
    } finally {
      setLoading(false)
    }
  }, [tenantId, filtros])

  const handleChange = useCallback((id, field, value) => {
    if (field === 'status') {
      setItens(currItens => {
        const item = currItens.find(i => i.id === id)
        if (item) {
          setOriginalStatus(prevOriginal => {
            if (!prevOriginal.has(id)) {
              const next = new Map(prevOriginal)
              next.set(id, item.status)
              return next
            }
            return prevOriginal
          })
        }
        return currItens.map(i => i.id === id ? { ...i, [field]: value } : i)
      })
    } else {
      setItens(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i))
    }

    setDirty(prev => {
      const next = new Map(prev)
      next.set(id, { ...(next.get(id) || {}), id, [field]: value })
      return next
    })
  }, [])

  const handleSalvar = useCallback(async () => {
    if (!tenantId || !dirty.size) return
    const dirtyWithFull = new Map()
    const itemsCancelados = []

    itens.forEach(i => {
      if (dirty.has(i.id)) {
        let updated = { ...i, ...dirty.get(i.id) }
        const statusAntigo = originalStatus.get(i.id) || i.status
        const statusNovo = dirty.get(i.id).status

        if (i.numero_pedido && statusNovo === '') {
          updated = { ...updated, numero_pedido: null }
        }

        dirtyWithFull.set(i.id, updated)

        if (dirty.get(i.id).status === 'Cancelado' && statusAntigo !== 'Cancelado') {
          itemsCancelados.push(updated)
        }
      }
    })

    setLoading(true)
    try {
      await salvarItens(tenantId, dirtyWithFull)

      for (const item of itemsCancelados) {
        try {
          await criarNotificacaoCancelamentoConversa(tenantId, {
            codigo: item.codigo || 'Sem código',
            produto: item.produto || '',
            modelo: item.modelo || '',
            cor: item.cor || '',
            marca: item.marca || '',
            tamanho: item.tamanho || '',
            cliente_nome: item.cliente_nome || 'Cliente',
            data_live: item.data_live || '',
            preco: item.preco || 0,
            observacao: item.observacao || '',
          })
        } catch (err) {
          console.error('Erro ao criar notificação:', err)
        }
      }

      setDirty(new Map())
      setOriginalStatus(new Map())
      showMsg('Salvo!')
    } catch (e) {
      setErr(e.message || 'Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }, [tenantId, dirty, itens, originalStatus, showMsg])

  const handleGerarPedido = useCallback(() => {
    if (!tenantId) return
    const semPedido = itens.filter(i => !i.numero_pedido)
    if (!semPedido.length) {
      setErr('Todos os itens já possuem romaneio.')
      return
    }
    setDimensoes({ peso: '', altura: '', largura: '', comprimento: '' })
    setShowDimensoesModal(true)
  }, [tenantId, itens])

  const handleConfirmarGerar = useCallback(async () => {
    if (!tenantId) return

    setShowDimensoesModal(false)
    setLoading(true)

    try {
      if (modoEdicao) {
        if (!romAddVal) {
          setErr('Digite o número do romaneio para editar')
          return
        }

        await atualizarDimensoesRomaneio(tenantId, romAddVal, dimensoes)
        showMsg(`Romaneio #${romAddVal} atualizado!`)
        setModoEdicao(false)
      } else {
        const semPedido = itens.filter(i => !i.numero_pedido)
        if (!semPedido.length) {
          setErr('Todos os itens já possuem romaneio.')
          return
        }

        const numPedido = await criarRomaneioComDimensoes(tenantId, semPedido, dimensoes)
        showMsg(`Romaneio #${numPedido} gerado com sucesso!`)

        const semIds = new Set(semPedido.map(i => i.id))
        const sepIds = new Set(semPedido.filter(i => i.status === 'Separado').map(i => i.id))
        setItens(prev => prev.map(i => {
          if (!semIds.has(i.id)) return i
          return { ...i, numero_pedido: numPedido, ...(sepIds.has(i.id) ? { status: 'Enviado' } : {}) }
        }))
        setDirty(new Map())
      }
    } catch (e) {
      setErr(e.message || 'Erro ao salvar romaneio')
    } finally {
      setLoading(false)
    }
  }, [tenantId, itens, dimensoes, showMsg, modoEdicao, romAddVal])

  const handleBuscarRomaneio = useCallback(async () => {
    if (!tenantId || !romAddVal) {
      setErr('Digite o número do romaneio')
      return
    }

    setLoading(true)
    try {
      const data = await buscarPedidoParaReimprimir(tenantId, romAddVal)
      setItens(data)
      setDirty(new Map())
      showMsg(`Romaneio #${romAddVal} carregado!`)
    } catch (e) {
      setErr(e.message || 'Erro ao buscar romaneio')
    } finally {
      setLoading(false)
    }
  }, [tenantId, romAddVal, showMsg])

  const handleEditarRomaneio = useCallback(async () => {
    if (!tenantId || !romAddVal) {
      setErr('Digite o número do romaneio para editar')
      return
    }

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('romaneios')
        .select('peso, altura, largura, comprimento')
        .eq('tenant_id', tenantId)
        .ilike('numero', `%${romAddVal}%`)
        .limit(1)
        .single()

      if (error) throw error

      if (!data) {
        setErr(`Romaneio #${romAddVal} não encontrado`)
        return
      }

      setDimensoes({
        peso: data.peso ? String(data.peso) : '',
        altura: data.altura ? String(data.altura) : '',
        largura: data.largura ? String(data.largura) : '',
        comprimento: data.comprimento ? String(data.comprimento) : '',
      })

      setModoEdicao(true)
      setShowDimensoesModal(true)
    } catch (e) {
      setErr(e.message || 'Erro ao buscar romaneio')
    } finally {
      setLoading(false)
    }
  }, [tenantId, romAddVal])

  const handleAdicionarAoRomaneio = useCallback(async () => {
    if (!tenantId || !romAddVal) return
    const num = Number(romAddVal)
    if (!num) return
    const separados = itens.filter(i => i.status === 'Separado')
    if (!separados.length) {
      setErr('Nenhum item com status Separado para adicionar ao romaneio.')
      return
    }
    setLoading(true)
    try {
      const ids = separados.map(i => i.id)
      await adicionarSeparadosAoRomaneio(tenantId, ids, num)
      const idSet = new Set(ids)
      setItens(prev => prev.map(i =>
        idSet.has(i.id) ? { ...i, status: 'Enviado', numero_pedido: num } : i
      ))
      setDirty(prev => {
        const next = new Map(prev)
        ids.forEach(id => next.delete(id))
        return next
      })
      showMsg(`${separados.length} item(s) adicionados ao Romaneio #${num}!`)
      setRomAddVal('')
    } catch (e) {
      setErr(e.message || 'Erro ao adicionar ao romaneio')
    } finally {
      setLoading(false)
    }
  }, [tenantId, romAddVal, itens, showMsg])

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
        padding: isMobile ? '8px' : '12px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}>
        {/* ── FILTROS ── */}
        <div style={{
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          alignItems: 'center',
          fontSize: isMobile ? 14 : 12,
        }}>
          <input list="ped-clientes" value={filtros.clienteNome}
            onChange={e => setF('clienteNome', e.target.value)}
            placeholder="Cliente"
            style={{
              ...SI,
              minWidth: isMobile ? 140 : 130,
              fontSize: isMobile ? 14 : 12,
            }} />
          <datalist id="ped-clientes">
            {clientes.map(c => <option key={c} value={c} />)}
          </datalist>

          <input type="date" value={filtros.dataLive}
            onChange={e => setF('dataLive', e.target.value)}
            style={{
              ...SI,
              width: isMobile ? 150 : 130,
              fontSize: isMobile ? 14 : 12,
            }} />

          <select value={filtros.statusFiltro}
            onChange={e => setF('statusFiltro', e.target.value)}
            style={{
              ...SI,
              width: isMobile ? 160 : 145,
              fontSize: isMobile ? 14 : 12,
            }}>
            <option value="todos">Todos status</option>
            <option value="nao_enviados">Não enviados</option>
            {statusOpts.filter(Boolean).map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <input value={filtros.busca}
            onChange={e => setF('busca', e.target.value)}
            placeholder="Busca rápida..."
            style={{
              ...SI,
              minWidth: isMobile ? 140 : 130,
              fontSize: isMobile ? 14 : 12,
              flex: isMobile ? '1 1 100%' : 'none',
            }} />

          {!isMobile && (
            <>
              <input value={filtros.numeroPedido} type="number" min="1"
                onChange={e => setF('numeroPedido', e.target.value)}
                placeholder="Romaneio" style={{ ...SI, width: 90 }} />

              <span style={{ color: '#81c995', fontWeight: 700, fontSize: 14, marginLeft: 6, whiteSpace: 'nowrap' }}>
                R$ {fmtMoney(total)}
              </span>
            </>
          )}
        </div>

        {/* ── AÇÕES ── */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn-acao btn-blue" disabled={loading} onClick={handleBuscar}
            style={{ flex: 'none', minWidth: isMobile ? 70 : 80, fontSize: isMobile ? 13 : 12 }}>
            Buscar
          </button>
          <button className="btn-acao btn-purple" disabled={loading || !dirty.size} onClick={handleSalvar}
            style={{ flex: 'none', minWidth: isMobile ? 70 : 80, fontSize: isMobile ? 13 : 12 }}>
            Salvar{dirty.size > 0 ? ` (${dirty.size})` : ''}
          </button>

          {!isMobile && (
            <>
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
                onKeyDown={e => e.key === 'Enter' && handleBuscarRomaneio()}
              />
              <button className="btn-acao btn-blue" disabled={loading || !romAddVal}
                onClick={handleBuscarRomaneio} style={{ flex: 'none', minWidth: 90 }}
                title="Buscar itens deste romaneio">
                🔍 Buscar
              </button>
              <button className="btn-acao btn-yellow" disabled={loading || !romAddVal}
                onClick={handleEditarRomaneio} style={{ flex: 'none', minWidth: 90 }}
                title="Editar peso e dimensões deste romaneio">
                ✏️ Editar
              </button>
              <button className="btn-acao btn-ghost" disabled={loading || !romAddVal}
                onClick={handleAdicionarAoRomaneio} style={{ flex: 'none', minWidth: 130 }}>
                + Adicionar ao Rom.
              </button>
            </>
          )}

          {isMobile && (
            <span style={{ color: '#81c995', fontWeight: 700, fontSize: 16, marginLeft: 'auto' }}>
              R$ {fmtMoney(total)}
            </span>
          )}

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

        {/* ── CONTEÚDO (TABELA DESKTOP / CARDS MOBILE) ── */}
        {isMobile ? (
          // VIEW MOBILE - CARDS
          <div style={{
            flex: 1,
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}>
            {itensFiltrados.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>
                {loading ? 'Carregando...' : 'Nenhum item. Use BUSCAR para carregar dados.'}
              </div>
            )}
            {itensFiltrados.map(item => (
              <ItemCardMobile
                key={item.id}
                item={item}
                onChange={handleChange}
                onRomaneioBlur={handleRomaneioItemBlur}
                statusOpts={statusOpts}
                statusCores={statusCores}
              />
            ))}
          </div>
        ) : (
          // VIEW DESKTOP - TABELA
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
                  <ItemRow
                    key={item.id}
                    item={item}
                    onChange={handleChange}
                    onRomaneioBlur={handleRomaneioItemBlur}
                    statusOpts={statusOpts}
                    statusCores={statusCores}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {printData && (
          <PrintModal data={printData} onClose={() => setPrintData(null)} />
        )}

        {/* Modal Dimensões Romaneio */}
        {showDimensoesModal && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }} onClick={() => setShowDimensoesModal(false)}>
            <div style={{
              background: '#1a2230', border: '2px solid var(--blue)', borderRadius: 12,
              padding: 24, minWidth: isMobile ? '90vw' : 400, maxWidth: isMobile ? '90vw' : 500,
            }} onClick={e => e.stopPropagation()}>
              <h3 style={{ margin: '0 0 16px 0', color: 'var(--blue)', fontSize: 18 }}>
                {modoEdicao ? `✏️ Editar Romaneio #${romAddVal}` : '📦 Informações da Caixa'}
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
                    Peso (kg) *
                  </label>
                  <input
                    type="text"
                    value={dimensoes.peso}
                    onChange={e => setDimensoes(p => ({ ...p, peso: e.target.value }))}
                    placeholder="Ex: 2.5 ou 2,5"
                    style={{ ...SI, width: '100%' }}
                    autoFocus
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
                      Altura (cm) *
                    </label>
                    <input
                      type="number"
                      value={dimensoes.altura}
                      onChange={e => setDimensoes(p => ({ ...p, altura: e.target.value }))}
                      placeholder="15"
                      style={{ ...SI, width: '100%' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
                      Largura (cm) *
                    </label>
                    <input
                      type="number"
                      value={dimensoes.largura}
                      onChange={e => setDimensoes(p => ({ ...p, largura: e.target.value }))}
                      placeholder="20"
                      style={{ ...SI, width: '100%' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
                      Comprimento (cm) *
                    </label>
                    <input
                      type="number"
                      value={dimensoes.comprimento}
                      onChange={e => setDimensoes(p => ({ ...p, comprimento: e.target.value }))}
                      placeholder="10"
                      style={{ ...SI, width: '100%' }}
                    />
                  </div>
                </div>

                <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
                  * Campos obrigatórios para cálculo de frete
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button
                    onClick={() => setShowDimensoesModal(false)}
                    style={{
                      flex: 1, padding: '10px', background: 'var(--btn-cancel-bg)',
                      color: 'var(--btn-cancel-text)', border: 'none', borderRadius: 6,
                      fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleConfirmarGerar}
                    style={{
                      flex: 1, padding: '10px', background: 'var(--blue)',
                      color: '#0f0f0f', border: 'none', borderRadius: 6,
                      fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    {modoEdicao ? '✅ Salvar Alterações' : '✅ Gerar Romaneio'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}

// ── Row component (Desktop) ────────────────────────────────────────────
function ItemRow({ item, onChange, onRomaneioBlur, statusOpts, statusCores }) {
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
            color: statusCores[item.status] || 'var(--text-body)', cursor: 'pointer', outline: 'none',
          }}>
          {statusOpts.map(s => (
            <option key={s} value={s} style={{ color: statusCores[s] || 'var(--text-body)', background: '#292a2d' }}>
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

// ── Card component (Mobile) ────────────────────────────────────────────
function ItemCardMobile({ item, onChange, onRomaneioBlur, statusOpts, statusCores }) {
  return (
    <div style={{
      background: 'var(--card-bg)',
      border: '1px solid var(--border-light)',
      borderRadius: 6,
      padding: 10,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      {/* LINHA 1: Cód + Produto + Modelo + Cor + Marca + Preço */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 6,
        fontSize: 13,
      }}>
        <div style={{
          flex: '1 1 auto',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 4,
          alignItems: 'center',
          color: 'var(--text-body)',
        }}>
          {item.codigo && (
            <span style={{
              background: 'var(--input-bg)',
              padding: '2px 6px',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--muted)',
            }}>
              #{item.codigo}
            </span>
          )}
          <span style={{ fontWeight: 700, color: 'var(--text-header)' }}>
            {item.produto}
          </span>
          {item.modelo && <span>• {item.modelo}</span>}
          {item.cor && <span>• {item.cor}</span>}
          {item.marca && <span>• {item.marca}</span>}
          {item.tamanho && (
            <span style={{
              background: 'var(--input-bg)',
              padding: '2px 6px',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
            }}>
              {item.tamanho}
            </span>
          )}
        </div>
        <div style={{
          fontWeight: 700,
          fontSize: 15,
          color: '#81c995',
          whiteSpace: 'nowrap',
        }}>
          {item.preco ? `R$ ${fmtMoney(item.preco)}` : ''}
        </div>
      </div>

      {/* LINHA 2: Cliente + Data Live */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 12,
        color: 'var(--text-body)',
        gap: 8,
      }}>
        <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span style={{ color: 'var(--muted)', fontSize: 10 }}>CLIENTE: </span>
          {item.cliente_nome}
        </div>
        {item.data_live && (
          <div style={{ whiteSpace: 'nowrap' }}>
            <span style={{ color: 'var(--muted)', fontSize: 10 }}>LIVE: </span>
            {fmtDate(item.data_live)}
          </div>
        )}
        {item.numero_pedido && (
          <div style={{
            background: 'var(--input-bg)',
            padding: '2px 8px',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 700,
            color: '#8ab4f8',
            whiteSpace: 'nowrap',
          }}>
            ROM {item.numero_pedido}
          </div>
        )}
      </div>

      {/* LINHA 3: Status */}
      <div>
        <select
          value={item.status || ''}
          onChange={e => onChange(item.id, 'status', e.target.value)}
          style={{
            width: '100%',
            padding: '10px',
            fontSize: 14,
            fontWeight: 600,
            background: 'var(--input-bg)',
            border: '2px solid var(--input-border)',
            borderRadius: 6,
            color: statusCores[item.status] || 'var(--text-body)',
            cursor: 'pointer',
            outline: 'none',
          }}>
          {statusOpts.map(s => (
            <option
              key={s}
              value={s}
              style={{
                color: statusCores[s] || 'var(--text-body)',
                background: '#1a1a1a',
                padding: '8px',
              }}
            >
              {s || '— Selecione —'}
            </option>
          ))}
        </select>
      </div>

      {/* LINHA 4: Observação */}
      {(item.observacao || true) && (
        <div>
          <input
            value={item.observacao || ''}
            onChange={e => onChange(item.id, 'observacao', e.target.value)}
            placeholder="Observação..."
            style={{
              width: '100%',
              padding: '8px',
              fontSize: 12,
              background: 'var(--input-bg)',
              border: '1px solid var(--input-border)',
              borderRadius: 4,
              color: 'var(--text-body)',
              outline: 'none',
            }}
          />
        </div>
      )}
    </div>
  )
}
