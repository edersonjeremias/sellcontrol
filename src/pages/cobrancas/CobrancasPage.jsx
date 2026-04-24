import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import AppShell from '../../components/ui/AppShell'
import {
  formatMoeda, parseMoeda,
  getCobrancas, criarCobranca, atualizarCobranca, excluirCobranca,
  getLivesParaCobranca, getClientesParaCobranca,
  getSaldoCliente, abaterCredito,
  buscarVendasParaCobranca, gerarPreferenciaMp,
  sincronizarCobrancaComVendas,
} from '../../services/cobrancasService'

// ── Constantes ─────────────────────────────────────────────────
const HOJE = new Date().toISOString().slice(0, 10)

const COR_STATUS = {
  PENDENTE:  'var(--muted)',
  ENVIADO:   '#0dcaf0',
  REENVIADO: 'var(--purple)',
  LEMBRETE:  'var(--yellow)',
  PAGO:      'var(--green)',
  BAIXADO:   'var(--green)',
  CANCELADO: 'var(--red)',
}

const LABEL_STATUS = {
  PENDENTE: 'Pendente', ENVIADO: 'Enviado', REENVIADO: 'Reenviado',
  LEMBRETE: 'Lembrete', PAGO: 'Pago', BAIXADO: 'Baixado', CANCELADO: 'Cancelado',
}

function fmtData(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

function fmtDataHora(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function vlrStr(val) {
  return formatMoeda(val).replace('R$ ', '')
}

// ── Card de cobrança ───────────────────────────────────────────
function CardCobranca({ c, onClick }) {
  const cor = COR_STATUS[c.status] || 'var(--muted)'
  return (
    <div
      className="cobranca-card"
      onClick={onClick}
      style={{ borderLeft: `4px solid ${cor}` }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-header)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {c.cliente}
          {c.live && <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 12, marginLeft: 6 }}>· {c.live}</span>}
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>
          {fmtData(c.data)}
          {c.observacao && <span style={{ marginLeft: 8, color: 'var(--yellow)', fontStyle: 'italic' }}>{c.observacao}</span>}
        </div>
        {c.qt_envios > 0 && (
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>✉ {c.qt_envios}x enviado</div>
        )}
        {(c.status === 'PAGO' || c.status === 'BAIXADO') && c.data_pagamento && (
          <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 2 }}>
            ✅ {fmtDataHora(c.data_pagamento)}
            {c.valor_liquido > 0 && (
              <span style={{ color: 'var(--muted)', marginLeft: 6 }}>
                · líq. R$ {vlrStr(c.valor_liquido)}
              </span>
            )}
          </div>
        )}
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--green)' }}>R$ {vlrStr(c.total)}</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: cor, marginTop: 2 }}>{LABEL_STATUS[c.status] || c.status}</div>
      </div>
    </div>
  )
}

// ── Input estilizado ───────────────────────────────────────────
const SI = { background: 'var(--input-bg)', border: '1px solid var(--border-light)', color: 'var(--text-body)', borderRadius: 6, padding: '6px 9px', fontSize: 13, width: '100%', colorScheme: 'dark' }
const SL = { ...SI, height: 31, padding: '0 8px', fontSize: 13 }

// ── Página principal ───────────────────────────────────────────
export default function CobrancasPage() {
  const { profile }   = useAuth()
  const { showToast } = useApp()
  const tenantId      = profile?.tenant_id

  // Dados
  const [cobrancas,     setCobrancas]     = useState([])
  const [resumo,        setResumo]        = useState({ geral: 0, recebido: 0, pendente: 0 })
  const [listaLives,    setListaLives]    = useState([])
  const [listaClientes, setListaClientes] = useState([])
  const [carregando,    setCarregando]    = useState(false)

  // Filtros barra superior (período para o resumo)
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim,    setDataFim]    = useState('')

  // Filtros da barra de pesquisa
  const [filtroData,     setFiltroData]     = useState('')
  const [filtroDataPag,  setFiltroDataPag]  = useState('')
  const [filtroStatus,   setFiltroStatus]   = useState('PENDENTE')
  const [filtroCliente,  setFiltroCliente]  = useState('')
  const [filtroLive,     setFiltroLive]     = useState('')
  const [dropClientes,   setDropClientes]   = useState([])

  // Modal de ação (detalhe da cobrança)
  const [sel,           setSel]           = useState(null)   // cobrança selecionada
  const [obsTexto,      setObsTexto]      = useState('')
  const [salvandoObs,   setSalvandoObs]   = useState(false)
  const [sincronizando, setSincronizando] = useState(false)

  // Modal novo manual
  const [showManual,    setShowManual]    = useState(false)
  const [mNome,         setMNome]         = useState('')
  const [mWhats,        setMWhats]        = useState('')
  const [mDesc,         setMDesc]         = useState('')
  const [mValor,        setMValor]        = useState('')
  const [mData,         setMData]         = useState(HOJE)
  const [dropManual,    setDropManual]    = useState([])
  const [criandoManual, setCriandoManual] = useState(false)

  // Modal importar vendas
  const [showImportar,   setShowImportar]   = useState(false)
  const [impData,        setImpData]        = useState(HOJE)
  const [impLive,        setImpLive]        = useState('')
  const [impResultado,   setImpResultado]   = useState([])
  const [importando,     setImportando]     = useState(false)
  const [gerando,        setGerando]        = useState(false)

  // Modal desconto
  const [showDesc,      setShowDesc]      = useState(false)
  const [saldoCli,      setSaldoCli]      = useState({ saldo: 0, motivo: '' })
  const [dMotivo,       setDMotivo]       = useState('')
  const [dValor,        setDValor]        = useState('')
  const [dAbater,       setDAbater]       = useState(false)
  const [aplicandoDesc, setAplicandoDesc] = useState(false)

  // Modal confirmação
  const [confirm, setConfirm] = useState(null)  // { msg, onSim }

  // ── Carga de dados ─────────────────────────────────────────
  const carregar = useCallback(async () => {
    if (!tenantId) return
    setCarregando(true)
    try {
      const { lista, resumo: r } = await getCobrancas(tenantId, {
        dataInicio, dataFim, filtroData, filtroDataPag,
        filtroStatus, filtroCliente, filtroLive,
      })
      setCobrancas(lista)
      setResumo(r)
    } catch (e) {
      showToast('Erro ao carregar cobranças', 'error')
    } finally {
      setCarregando(false)
    }
  }, [tenantId, dataInicio, dataFim, filtroData, filtroDataPag, filtroStatus, filtroCliente, filtroLive])

  useEffect(() => {
    if (!tenantId) return
    getLivesParaCobranca(tenantId).then(setListaLives)
    getClientesParaCobranca(tenantId).then(setListaClientes)
    carregar()
  }, [tenantId])

  // ── Autocomplete ──────────────────────────────────────────
  function filtrarAuto(texto, setter) {
    if (!texto || texto.length < 2) { setter([]); return }
    setter(
      listaClientes
        .filter(c => String(c.instagram).toLowerCase().includes(texto.toLowerCase()))
        .slice(0, 8)
    )
  }

  // ── Ação modal ─────────────────────────────────────────────
  function abrirAcao(c) {
    setSel(c)
    setObsTexto(c.observacao || '')
  }

  async function salvarObs() {
    if (!sel) return
    setSalvandoObs(true)
    try {
      await atualizarCobranca(sel.id, { observacao: obsTexto })
      const atualizado = { ...sel, observacao: obsTexto }
      setSel(atualizado)
      setCobrancas(prev => prev.map(c => c.id === sel.id ? atualizado : c))
      showToast('Anotação salva')
      setSel(null)
    } catch { showToast('Erro ao salvar', 'error') }
    finally { setSalvandoObs(false) }
  }

  function enviarWhatsApp(cobranca, tipo) {
    const zap = String(cobranca.whatsapp || '').replace(/\D/g, '')
    if (!zap) { showToast('Cliente sem WhatsApp', 'error'); return }

    // Monta URL antes de qualquer async para abrir WhatsApp imediatamente
    const reciboUrl = `https://sellcontrol.vercel.app/recibo/${cobranca.id}`
    let url = `https://wa.me/55${zap}`
    if (tipo === 'lembrete') {
      const msg = `Olá ${cobranca.cliente}! Tudo bem? 🌸\n\nLembrando que sua compra do dia *${fmtData(cobranca.data)}* no valor de *R$ ${vlrStr(cobranca.total)}* ainda está aguardando o pagamento.\n\nVocê pode conferir o seu recibo clicando no link abaixo:\n${reciboUrl}`
      url += `?text=${encodeURIComponent(msg)}`
    } else if (tipo === 'enviar') {
      const msg = `Olá ${cobranca.cliente}! Tudo bem? 🌸\n\nSegue sua compra do dia *${fmtData(cobranca.data)}* no valor de *R$ ${vlrStr(cobranca.total)}*.\n\nVocê pode conferir o seu recibo clicando no link abaixo:\n${reciboUrl}`
      url += `?text=${encodeURIComponent(msg)}`
    }
    // tipo === 'chat': abre só o WhatsApp sem mensagem pré-definida

    // Abre WhatsApp/app ANTES de qualquer await (evita bloqueio de popup no browser e mobile)
    window.open(url, '_blank', 'noopener')

    // Atualiza status em background sem bloquear a abertura
    if (tipo !== 'chat') {
      const novoStatus = cobranca.qt_envios > 0
        ? (tipo === 'lembrete' ? 'LEMBRETE' : 'REENVIADO')
        : 'ENVIADO'
      atualizarCobranca(cobranca.id, {
        status: novoStatus,
        qt_envios: cobranca.qt_envios + 1,
      }).then(() => {
        const at = { ...cobranca, status: novoStatus, qt_envios: cobranca.qt_envios + 1 }
        setCobrancas(prev => prev.map(c => c.id === cobranca.id ? at : c))
      }).catch(() => showToast('Erro ao atualizar status', 'error'))
    }

    setSel(null)
  }

  function baixar(cobranca) {
    setConfirm({
      msg: `Baixar cobrança de ${cobranca.cliente} (R$ ${vlrStr(cobranca.total)})?`,
      onSim: async () => {
        try {
          const campos = { status: 'BAIXADO', data_pagamento: new Date().toISOString() }
          await atualizarCobranca(cobranca.id, campos)
          const at = { ...cobranca, ...campos }
          setSel(at)
          setCobrancas(prev => prev.map(c => c.id === cobranca.id ? at : c))
          showToast('Baixado com sucesso')
        } catch { showToast('Erro ao baixar', 'error') }
      },
    })
  }

  function excluir(cobranca) {
    setConfirm({
      msg: `Excluir cobrança de ${cobranca.cliente}? Se houver crédito aplicado, ele será devolvido.`,
      onSim: async () => {
        try {
          await excluirCobranca(tenantId, cobranca)
          setCobrancas(prev => prev.filter(c => c.id !== cobranca.id))
          setSel(null)
          showToast('Excluído e créditos devolvidos (se houver)')
        } catch { showToast('Erro ao excluir', 'error') }
      },
    })
  }

  async function sincronizar(cobranca) {
    setSincronizando(true)
    try {
      const at = await sincronizarCobrancaComVendas(tenantId, cobranca)
      setSel(at)
      setCobrancas(prev => prev.map(c => c.id === cobranca.id ? at : c))
      showToast('Sincronizado com as vendas!')
    } catch (e) {
      showToast('Erro ao sincronizar: ' + e.message, 'error')
    } finally {
      setSincronizando(false)
    }
  }

  function copiarLink(cobranca) {
    const url = `${window.location.origin}/recibo/${cobranca.id}`
    navigator.clipboard?.writeText(url)
      .then(() => { showToast('Link copiado!'); setSel(null) })
      .catch(() => showToast('Não foi possível copiar', 'error'))
  }

  // ── Desconto ───────────────────────────────────────────────
  async function abrirDesconto() {
    if (!sel) return
    setDMotivo(''); setDValor(''); setDAbater(false)
    setShowDesc(true)
    const s = await getSaldoCliente(tenantId, sel.cliente)
    setSaldoCli(s)
  }

  async function aplicarDesconto() {
    if (!dMotivo || !dValor || !sel) { showToast('Preencha todos os campos', 'error'); return }

    let vDesc = 0
    const sv = String(dValor).trim()
    if (sv.endsWith('%')) {
      vDesc = (Number(sel.total) * parseFloat(sv)) / 100
    } else {
      vDesc = parseMoeda(sv)
    }

    if (vDesc <= 0 || vDesc > Number(sel.total)) {
      showToast('Valor inválido ou maior que o total', 'error'); return
    }

    setAplicandoDesc(true)
    try {
      const novoTotal = Number(sel.total) - vDesc
      const itens     = [...(sel.itens || []), { descricao: `🎁 ${dMotivo}`, valor: -vDesc, cancelado: false }]

      let novoLink = sel.link_mp
      let novoIdMp = sel.id_mp

      if (novoTotal > 0) {
        try {
          const mp = await gerarPreferenciaMp({ cliente: sel.cliente, total: novoTotal, whatsapp: sel.whatsapp, data: fmtData(sel.data), live: sel.live, idCobranca: sel.id })
          novoLink = mp.link; novoIdMp = mp.id_mp
        } catch (e) { 
          console.warn('MP indisponível:', e.message)
          showToast('Link MP não atualizado: ' + e.message, 'warning')
        }
      } else {
        novoLink = 'Pago com Crédito'
      }

      await atualizarCobranca(sel.id, { itens, total: novoTotal, link_mp: novoLink, id_mp: novoIdMp })
      if (dAbater) await abaterCredito(tenantId, sel.cliente, vDesc)

      const at = { ...sel, itens, total: novoTotal, link_mp: novoLink, id_mp: novoIdMp }
      setSel(at)
      setCobrancas(prev => prev.map(c => c.id === sel.id ? at : c))
      setShowDesc(false)
      showToast('Desconto aplicado!')
    } catch (e) { showToast('Erro: ' + e.message, 'error') }
    finally { setAplicandoDesc(false) }
  }

  // ── Cobrança manual ────────────────────────────────────────
  async function criarManual() {
    if (!mNome || !mValor) { showToast('Nome e valor são obrigatórios', 'error'); return }
    const valor = parseMoeda(mValor)
    if (!valor || valor <= 0) { showToast('Valor inválido', 'error'); return }

    setCriandoManual(true)
    try {
      const idCobranca = crypto.randomUUID()
      let link = '', idMp = ''
      try {
        const mp = await gerarPreferenciaMp({ cliente: mNome, total: valor, whatsapp: mWhats, data: mData, live: '', idCobranca })
        link = mp.link; idMp = mp.id_mp
      } catch (e) { 
        console.warn('MP indisponível:', e.message)
        showToast('Link MP não gerado: ' + e.message, 'warning')
      }

      const nova = await criarCobranca(tenantId, {
        id: idCobranca, data: mData,
        cliente: mNome.trim(), whatsapp: mWhats,
        itens: [{ descricao: mDesc || 'Cobrança Manual', valor, cancelado: false }],
        total: valor, link_mp: link, status: 'PENDENTE', id_mp: idMp, ext_ref: idCobranca, live: '',
      })

      setCobrancas(prev => [...prev, nova].sort((a, b) => {
        if (a.data < b.data) return -1; if (a.data > b.data) return 1
        return a.cliente.localeCompare(b.cliente)
      }))
      setShowManual(false)
      setMNome(''); setMWhats(''); setMDesc(''); setMValor(''); setMData(HOJE)
      showToast('Cobrança criada!')
    } catch (e) { showToast('Erro: ' + e.message, 'error') }
    finally { setCriandoManual(false) }
  }

  // ── Importar vendas ────────────────────────────────────────
  async function buscarVendas() {
    if (!impData) { showToast('Selecione a data', 'error'); return }
    setImportando(true)
    try {
      const res = await buscarVendasParaCobranca(tenantId, impData, impLive || null)
      setImpResultado(res)
      if (!res.length) showToast('Nenhuma venda nova encontrada', 'info')
    } catch (e) { showToast('Erro: ' + e.message, 'error') }
    finally { setImportando(false) }
  }

  async function gerarLinks() {
    setGerando(true)
    let ok = 0, err = 0
    for (const g of impResultado) {
      try {
        const id = crypto.randomUUID()
        let link = '', idMp = ''
        if (g.total > 0) {
          try {
            const mp = await gerarPreferenciaMp({ cliente: g.cliente, total: g.total, whatsapp: g.whatsapp, data: fmtData(g.data) || g.data, live: g.live, idCobranca: id })
            link = mp.link; idMp = mp.id_mp
          } catch (e) { 
            console.warn('MP erro para cliente:', g.cliente, e.message)
            err++
          }
        }
        await criarCobranca(tenantId, {
          id, data: g.data, cliente: g.cliente, whatsapp: g.whatsapp || '',
          itens: g.itens, total: g.total, link_mp: link,
          status: 'PENDENTE', id_mp: idMp, ext_ref: id, live: g.live || '',
        })
        ok++
      } catch { err++ }
    }
    setGerando(false)
    setShowImportar(false)
    setImpResultado([])
    showToast(`${ok} cobranças geradas${err ? ` (${err} erro(s))` : ''}`)
    carregar()
  }

  // ── Render ─────────────────────────────────────────────────
  const itens = sel ? (Array.isArray(sel.itens) ? sel.itens : []) : []

  return (
    <AppShell title="" flush hideTitle>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

        {/* ── Navbar: período + botão Manual ── */}
        <div style={{ background: '#1a1a1a', borderBottom: '1px solid var(--border-header)', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>De:</span>
            <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} onBlur={carregar} style={{ ...SI, width: 130 }} />
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>Até:</span>
            <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} onBlur={carregar} style={{ ...SI, width: 130 }} />
          </div>
          
          <button className="btn-acao btn-ghost" style={{ flex: 'none', width: 140, height: 32, minHeight: 32, padding: '0 12px', fontSize: 13, border: '1px solid var(--border-light)', borderRadius: 6, color: 'var(--blue)', fontWeight: 600 }} onClick={() => { setShowManual(true); setMData(HOJE) }}>
            + Manual
          </button>
        </div>

        {/* ── Stats bar ── */}
        <div style={{ background: '#252525', borderBottom: '1px solid var(--border-header)', padding: '5px 12px', display: 'flex', justifyContent: 'space-around', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>Geral: <span style={{ color: 'var(--blue)' }}>{formatMoeda(resumo.geral)}</span></span>
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--green)' }}>Rec: {formatMoeda(resumo.recebido)}</span>
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--yellow)' }}>Pend: {formatMoeda(resumo.pendente)}</span>
        </div>

        {/* ── Filtros ── */}
        <div style={{ background: 'var(--header-bg)', borderBottom: '1px solid var(--border-header)', padding: '8px 12px', flexShrink: 0 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' }}>Data Venda</span>
              <input type="date" value={filtroData} onChange={e => setFiltroData(e.target.value)} style={{ ...SI, width: 130 }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 10, color: 'var(--green)', textTransform: 'uppercase' }}>Data Pagamento</span>
              <input type="date" value={filtroDataPag} onChange={e => setFiltroDataPag(e.target.value)} style={{ ...SI, width: 130, borderColor: 'rgba(129,201,149,0.4)' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' }}>Status</span>
              <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} style={{ ...SL, width: 110 }}>
                <option value="PENDENTE">Pendentes</option>
                <option value="PAGO">Pagos</option>
                <option value="Todos">Todos</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 120, position: 'relative' }}>
              <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' }}>Cliente</span>
              <input
                type="text"
                placeholder="Buscar cliente..."
                value={filtroCliente}
                onChange={e => { setFiltroCliente(e.target.value); filtrarAuto(e.target.value, setDropClientes) }}
                onKeyDown={e => e.key === 'Enter' && carregar()}
                style={SI}
              />
              {dropClientes.length > 0 && (
                <ul className="autocomplete-list" style={{ zIndex: 200 }}>
                  {dropClientes.map(c => (
                    <li key={c.instagram} onClick={() => { setFiltroCliente(c.instagram); setDropClientes([]) }}>{c.instagram}</li>
                  ))}
                </ul>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' }}>Live</span>
              <select value={filtroLive} onChange={e => setFiltroLive(e.target.value)} style={{ ...SL, width: 150 }}>
                <option value="">Todas</option>
                {listaLives.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
              <button className="btn-acao btn-green" onClick={carregar} style={{ minWidth: 44, padding: '0 10px' }} title="Buscar">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              </button>
              <button className="btn-acao btn-ghost" onClick={() => { setShowImportar(true); setImpResultado([]) }} style={{ minWidth: 44, padding: '0 10px' }} title="Importar vendas">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* ── Lista de cards ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 6px', scrollbarWidth: 'none' }}>
          {carregando && <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)' }}>Carregando...</div>}
          {!carregando && cobrancas.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Nenhuma cobrança encontrada</div>
          )}
          {cobrancas.map(c => <CardCobranca key={c.id} c={c} onClick={() => abrirAcao(c)} />)}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          MODAL: AÇÃO / DETALHE
      ══════════════════════════════════════════════════════ */}
      {sel && (
        <div className="modal-overlay" onClick={() => setSel(null)}>
          <div className="modal-card" style={{ maxWidth: 440, width: '95vw', maxHeight: '92vh', overflowY: 'auto', scrollbarWidth: 'none' }} onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px' }}>
              <h3 style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '85%', margin: 0, fontSize: 14 }}>{sel.cliente}</h3>
              <button style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 0 }} onClick={() => setSel(null)}>✕</button>
            </div>

            <div className="modal-body" style={{ padding: '10px 14px 14px' }}>

              {/* Valor compacto */}
              <div style={{ textAlign: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green)', lineHeight: 1.2 }}>{formatMoeda(sel.total)}</div>
                <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>
                  {fmtData(sel.data)}{sel.live && ` · ${sel.live}`}
                </div>
                <div style={{ color: COR_STATUS[sel.status] || 'var(--muted)', fontWeight: 700, fontSize: 12 }}>
                  {LABEL_STATUS[sel.status] || sel.status}
                  {sel.qt_envios > 0 && <span style={{ color: 'var(--muted)', fontWeight: 400, marginLeft: 6 }}>· ✉ {sel.qt_envios}x</span>}
                </div>
                {(sel.status === 'PAGO' || sel.status === 'BAIXADO') && sel.data_pagamento && (
                  <div style={{ marginTop: 6, display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: 'var(--green)' }}>
                      ✅ Pago em: <b>{fmtDataHora(sel.data_pagamento)}</b>
                    </span>
                    {sel.valor_liquido > 0 && (
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                        · Líquido MP: <b style={{ color: 'var(--blue)' }}>R$ {vlrStr(sel.valor_liquido)}</b>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Itens */}
              {itens.length > 0 && (
                <div style={{ background: '#1a1a1a', borderRadius: 6, padding: '6px 10px', marginBottom: 10, maxHeight: 110, overflowY: 'auto', scrollbarWidth: 'none' }}>
                  {itens.map((item, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, padding: '2px 0', borderBottom: i < itens.length - 1 ? '1px solid var(--border-light)' : 'none', color: item.cancelado ? 'var(--muted)' : 'var(--text-body)', textDecoration: item.cancelado ? 'line-through' : 'none' }}>
                      <span style={{ flex: 1 }}>{item.descricao}</span>
                      <span style={{ fontWeight: 700, whiteSpace: 'nowrap', color: item.valor < 0 ? 'var(--green)' : 'inherit' }}>
                        {item.valor < 0 ? '-' : ''}R$ {Math.abs(item.valor).toFixed(2).replace('.', ',')}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Anotação + botões utilitários na mesma linha */}
              <div style={{ display: 'flex', gap: 5, marginBottom: 10, alignItems: 'center' }}>
                <input
                  type="text"
                  value={obsTexto}
                  onChange={e => setObsTexto(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && salvarObs()}
                  placeholder="📝 Anotação (aparece na lista)..."
                  style={{ ...SI, flex: 1, fontSize: 12 }}
                />
                {/* Salvar */}
                <button onClick={salvarObs} disabled={salvandoObs} title="Salvar anotação"
                  style={{ flexShrink: 0, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(138,180,248,0.12)', border: '1px solid rgba(138,180,248,0.3)', color: 'var(--blue)', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>
                  {salvandoObs ? '…' : '💾'}
                </button>
                {/* Sincronizar */}
                <button onClick={() => sincronizar(sel)} disabled={sincronizando} title="Sincronizar com vendas"
                  style={{ flexShrink: 0, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(138,180,248,0.12)', border: '1px solid rgba(138,180,248,0.3)', color: 'var(--blue)', borderRadius: 6, cursor: 'pointer' }}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                  </svg>
                </button>
                {/* Desconto */}
                <button onClick={abrirDesconto} title="Aplicar desconto"
                  style={{ flexShrink: 0, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(251,188,4,0.12)', border: '1px solid rgba(251,188,4,0.3)', color: 'var(--yellow)', borderRadius: 6, cursor: 'pointer', fontWeight: 800, fontSize: 15 }}>
                  %
                </button>
              </div>

              {/* Botões de comunicação — mesma linha */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5, marginBottom: sel.qt_envios > 0 ? 5 : 8 }}>
                <button onClick={() => enviarWhatsApp(sel, 'chat')}
                  style={{ height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, background: 'rgba(129,201,149,0.1)', color: 'var(--green)', border: '1px solid rgba(129,201,149,0.3)', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 11 }}>
                  💬 Conversar
                </button>
                <button onClick={() => enviarWhatsApp(sel, 'enviar')}
                  style={{ height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, background: 'rgba(129,201,149,0.6)', color: '#171717', border: '1px solid var(--green)', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 11 }}>
                  📲 {sel.qt_envios > 0 ? 'Reenviar' : 'Enviar'}
                </button>
                <button onClick={() => copiarLink(sel)}
                  style={{ height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, background: 'rgba(138,180,248,0.1)', color: 'var(--blue)', border: '1px solid rgba(138,180,248,0.3)', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 11 }}>
                  🔗 Copiar
                </button>
              </div>

              {/* Lembrete */}
              {sel.qt_envios > 0 && (
                <button onClick={() => enviarWhatsApp(sel, 'lembrete')}
                  style={{ width: '100%', height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(251,188,4,0.1)', color: 'var(--yellow)', border: '1px solid rgba(251,188,4,0.3)', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 12, marginBottom: 8 }}>
                  ⏰ Lembrete
                </button>
              )}

              {/* Baixar / Excluir */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button className="btn-acao btn-blue" style={{ minHeight: 38, fontSize: 13, color: '#171717' }} onClick={() => baixar(sel)}>
                  Baixar
                </button>
                <button className="btn-acao btn-danger" style={{ minHeight: 38, fontSize: 13 }} onClick={() => excluir(sel)}>
                  Excluir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          MODAL: NOVA COBRANÇA MANUAL
      ══════════════════════════════════════════════════════ */}
      {showManual && (
        <div className="modal-overlay" onClick={() => setShowManual(false)}>
          <div className="modal-card" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Nova Cobrança Manual</h3>
              <button style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 22, lineHeight: 1 }} onClick={() => setShowManual(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ paddingBottom: 20 }}>

              <div style={{ position: 'relative', marginBottom: 10 }}>
                <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Nome do Cliente *</label>
                <input
                  type="text"
                  value={mNome}
                  onChange={e => { setMNome(e.target.value); filtrarAuto(e.target.value, setDropManual) }}
                  placeholder="Ex: Maria da Silva"
                  style={SI}
                />
                {dropManual.length > 0 && (
                  <ul className="autocomplete-list">
                    {dropManual.map(c => (
                      <li key={c.instagram} onClick={() => { setMNome(c.instagram); setMWhats(c.whatsapp || ''); setDropManual([]) }}>
                        {c.instagram}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>WhatsApp *</label>
                <input type="tel" value={mWhats} onChange={e => setMWhats(e.target.value)} placeholder="11999999999" style={SI} />
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Descrição</label>
                <input type="text" value={mDesc} onChange={e => setMDesc(e.target.value)} placeholder="Ex: 2 Vestidos e 1 Laço" style={SI} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Valor Total *</label>
                  <input type="number" value={mValor} onChange={e => setMValor(e.target.value)} placeholder="0.00" step="0.01" min="0" style={SI} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Data</label>
                  <input type="date" value={mData} onChange={e => setMData(e.target.value)} style={SI} />
                </div>
              </div>

              <button className="btn-acao btn-green" style={{ width: '100%', minHeight: 48, fontSize: 15, color: '#171717' }} onClick={criarManual} disabled={criandoManual}>
                {criandoManual ? 'Gerando…' : 'Gerar Link de Pagamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          MODAL: IMPORTAR VENDAS
      ══════════════════════════════════════════════════════ */}
      {showImportar && (
        <div className="modal-overlay" onClick={() => setShowImportar(false)}>
          <div className="modal-card" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Importar Vendas</h3>
              <button style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 22, lineHeight: 1 }} onClick={() => setShowImportar(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ paddingBottom: 20 }}>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 12, alignItems: 'flex-end' }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 2 }}>Data</label>
                  <input type="date" value={impData} onChange={e => setImpData(e.target.value)} style={SI} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 2 }}>Live</label>
                  <select value={impLive} onChange={e => setImpLive(e.target.value)} style={{ ...SL, width: '100%' }}>
                    <option value="">Todas</option>
                    {listaLives.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <button className="btn-acao btn-ghost" style={{ minHeight: 33, padding: '0 14px', fontSize: 13 }} onClick={buscarVendas} disabled={importando}>
                  {importando ? '…' : '🔍 Buscar'}
                </button>
              </div>

              {impResultado.length > 0 ? (
                <>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>
                    {impResultado.length} cliente(s) encontrado(s)
                    {impResultado.filter(r => !r.whatsapp).length > 0 && (
                      <span style={{ color: 'var(--red)', marginLeft: 6 }}>
                        · {impResultado.filter(r => !r.whatsapp).length} sem WhatsApp ⚠️
                      </span>
                    )}
                  </div>
                  <div style={{ maxHeight: 220, overflowY: 'auto', scrollbarWidth: 'none', background: '#1a1a1a', borderRadius: 6, padding: 6, marginBottom: 12 }}>
                    {impResultado.map((r, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 8px', borderBottom: '1px solid var(--border-light)', fontSize: 13 }}>
                        <span style={{ color: r.whatsapp ? 'var(--text-body)' : 'var(--red)' }}>
                          {r.cliente}{!r.whatsapp && ' ⚠️'}
                        </span>
                        <span style={{ color: 'var(--green)', fontWeight: 700 }}>{formatMoeda(r.total)}</span>
                      </div>
                    ))}
                  </div>
                  <button className="btn-acao btn-green" style={{ width: '100%', minHeight: 46, fontSize: 14, color: '#171717' }} onClick={gerarLinks} disabled={gerando}>
                    {gerando ? 'Gerando…' : `Gerar ${impResultado.length} Link(s) de Pagamento`}
                  </button>
                </>
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, padding: 20 }}>
                  Selecione a data e clique em Buscar para ver as vendas ainda não cobradas
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          MODAL: DESCONTO / CRÉDITO
      ══════════════════════════════════════════════════════ */}
      {showDesc && sel && (
        <div className="modal-overlay" onClick={() => setShowDesc(false)}>
          <div className="modal-card" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ background: 'rgba(129,201,149,0.08)', borderBottom: '1px solid var(--green)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: 'var(--green)' }}>🏷️ Aplicar Desconto</h3>
              <button style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 22, lineHeight: 1 }} onClick={() => setShowDesc(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ paddingBottom: 20 }}>
              <div style={{ textAlign: 'center', padding: '10px 12px', background: '#1a1a1a', borderRadius: 6, marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>Saldo disponível ({sel.cliente})</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--blue)' }}>{formatMoeda(saldoCli.saldo)}</div>
                {saldoCli.motivo && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{saldoCli.motivo}</div>}
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Motivo (aparece no recibo)</label>
                <input type="text" value={dMotivo} onChange={e => setDMotivo(e.target.value)} placeholder="Ex: Crédito Devolução / Cupom10" style={SI} />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Valor ou % a descontar</label>
                <input type="text" value={dValor} onChange={e => setDValor(e.target.value)} placeholder="Ex: 50.00 ou 10%" style={SI} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <input type="checkbox" id="abater" checked={dAbater} onChange={e => setDAbater(e.target.checked)} style={{ width: 15, height: 15, cursor: 'pointer' }} />
                <label htmlFor="abater" style={{ fontSize: 13, color: 'var(--text-body)', cursor: 'pointer' }}>Abater do saldo da cliente?</label>
              </div>
              <button className="btn-acao btn-green" style={{ width: '100%', minHeight: 46, fontSize: 14, color: '#171717' }} onClick={aplicarDesconto} disabled={aplicandoDesc}>
                {aplicandoDesc ? 'Aplicando…' : 'Aplicar e Recalcular'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          MODAL: CONFIRMAÇÃO
      ══════════════════════════════════════════════════════ */}
      {confirm && (
        <div className="modal-overlay" style={{ zIndex: 11000 }} onClick={() => setConfirm(null)}>
          <div className="modal-card mini" style={{ maxWidth: 360, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ background: 'rgba(251,188,4,0.08)', borderBottom: '1px solid rgba(251,188,4,0.4)' }}>
              <h3 style={{ margin: 0, color: 'var(--yellow)' }}>Confirmação</h3>
            </div>
            <div className="modal-body" style={{ padding: '20px' }}>
              <p style={{ margin: '0 0 20px', lineHeight: 1.5 }}>{confirm.msg}</p>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setConfirm(null)}>Cancelar</button>
              <button
                style={{ flex: 1, minHeight: 50, borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: 'pointer', border: 'none', background: 'var(--yellow)', color: '#171717' }}
                onClick={async () => { 
                  console.log('Executando ação de confirmação...');
                  await confirm.onSim(); 
                  setConfirm(null); 
                }}
              >
                Sim
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}
