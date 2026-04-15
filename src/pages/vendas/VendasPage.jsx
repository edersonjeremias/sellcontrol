import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  getDadosIniciais, getListas, salvarNovoCadastro,
  getVendas, salvarVendas, enviarVenda, estornarVenda,
  finalizarLive, formatMoney,
  getVendasEnviadas, updateVendaEnviada,
} from '../../services/vendasService'
import { supabase } from '../../lib/supabase'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import AppShell from '../../components/ui/AppShell'
import TabelaRow      from '../../components/vendas/TabelaRow'
import ModalEdicao    from '../../components/vendas/ModalEdicao'
import ModalFila      from '../../components/vendas/ModalFila'
import ModalCadastro  from '../../components/vendas/ModalCadastro'
import AutocompleteInput  from '../../components/ui/AutocompleteInput'
import ModalAlerta        from '../../components/ui/ModalAlerta'
import ModalConfirmacao   from '../../components/ui/ModalConfirmacao'

// ─── HELPERS PUROS ────────────────────────────────────────
let _keyCounter = 0
function novaLinha() {
  return {
    _key: `new-${++_keyCounter}`,
    id: null, produto: '', modelo: '', cor: '', marca: '',
    tamanho: '', preco: '', codigo: '', cliente_nome: '',
    data_live: '', live_nome: '', sacolinha: null,
    status: '', fila1: '', fila2: '', fila3: '',
    isNew: true, deleted: false, isSent: false, liberado: false,
  }
}

function mapRow(row) {
  return {
    _key:         row.id,
    id:           row.id,
    produto:      row.produto      || '',
    modelo:       row.modelo       || '',
    cor:          row.cor          || '',
    marca:        row.marca        || '',
    tamanho:      row.tamanho      || '',
    preco:        formatMoney(row.preco),
    codigo:       row.codigo       || '',
    cliente_nome: row.cliente_nome || '',
    data_live:    row.data_live    || '',
    live_nome:    row.live_nome    || '',
    sacolinha:    row.sacolinha,
    status:       row.status       || '',
    fila1:        row.fila1        || '',
    fila2:        row.fila2        || '',
    fila3:        row.fila3        || '',
    isNew: false, deleted: false,
    isSent: (row.status || '').toUpperCase() === 'ENVIADO',
    liberado: false,
  }
}

function calcSacolas(linhas) {
  const usados = new Set()
  const mapa   = {}
  linhas.forEach(l => {
    if (l.deleted || l.isSent || !l.cliente_nome?.trim()) return
    const c = l.cliente_nome.trim().toLowerCase()
    if (l.sacolinha && !isNaN(l.sacolinha)) {
      usados.add(Number(l.sacolinha))
      if (!mapa[c]) mapa[c] = Number(l.sacolinha)
    }
  })
  return linhas.map(l => {
    if (l.deleted || l.isSent) return l
    if (!l.cliente_nome?.trim()) return { ...l, sacolinha: null }
    const c = l.cliente_nome.trim().toLowerCase()
    if (mapa[c]) return { ...l, sacolinha: mapa[c] }
    let n = 1; while (usados.has(n)) n++
    usados.add(n); mapa[c] = n
    return { ...l, sacolinha: n }
  })
}

function ordenarLinhas(linhas) {
  return [...linhas].sort((a, b) => {
    const aPreenchido = a.cliente_nome?.trim() ? 0 : 1
    const bPreenchido = b.cliente_nome?.trim() ? 0 : 1
    return aPreenchido - bPreenchido
  })
}

function passaFiltro(l, filtro) {
  if (!filtro.trim()) return true
  const termos = filtro.toLowerCase().split(',').map(t => t.trim()).filter(Boolean)
  const txt = [l.produto, l.modelo, l.cor, l.marca, l.tamanho, l.codigo, l.cliente_nome]
    .join(' ').toLowerCase()
  return termos.every(t => txt.includes(t))
}

// ─── COMPONENT ────────────────────────────────────────────
export default function VendasPage() {
  const { showToast } = useApp()
  const { profile } = useAuth()
  const tenantId = profile?.tenant_id

  // ── State ──
  const [linhas,      setLinhas]      = useState([])
  const [listas,      setListas]      = useState({ produtos: [], modelos: [], cores: [], marcas: [], clientes: [] })
  const [globalDB,    setGlobalDB]    = useState({ lives: [], bloqueados: {} })
  const [dataLive,    setDataLive]    = useState('')
  const [liveNome,    setLiveNome]    = useState('')
  const [busy,        setBusyState]   = useState(false)
  const [busyMsg,     setBusyMsg]     = useState('')
  const [hasUnsaved,  setHasUnsaved]  = useState(false)
  const [filtro,      setFiltro]      = useState('')
  const [tabelaMsg,   setTabelaMsg]   = useState('Iniciando sistema...')
  const [pronto,      setPronto]      = useState(false)
  const [scrollTop,   setScrollTop]   = useState(false)
  const [flash,       setFlash]       = useState(false)
  const novoProdutoFocus = useRef(false)
  const busyRef = useRef(false)
  const lastRealtimeKeyRef = useRef('')

  // ── Modal state ──
  const [modalEdicaoIdx,    setModalEdicaoIdx]    = useState(null)
  const [modalFilaIdx,      setModalFilaIdx]      = useState(null)
  const [showModalCadastro, setShowModalCadastro] = useState(false)
  const [alerta,            setAlerta]            = useState(null)
  const [confirmacao,       setConfirmacao]       = useState(null)

  // ── Modo Histórico ──
  const [modo,          setModo]          = useState('live')
  const [filtrosHist,   setFiltrosHist]   = useState({ dataInicio: '', dataFim: '', clienteNome: '' })
  const [linhasHist,    setLinhasHist]    = useState([])
  const [modalHistIdx,  setModalHistIdx]  = useState(null)
  const linhasHistRef = useRef(linhasHist)
  useEffect(() => { linhasHistRef.current = linhasHist }, [linhasHist])

  // ── Refs ──
  const scrollRef   = useRef(null)
  const linhasRef   = useRef(linhas)
  const globalDBRef = useRef(globalDB)
  const busyTimerRef = useRef(null)
  useEffect(() => { linhasRef.current = linhas },     [linhas])
  useEffect(() => { globalDBRef.current = globalDB }, [globalDB])
  useEffect(() => { busyRef.current = busy }, [busy])

  // ── setBusy helper ──
  const setBusy = useCallback((v, msg = '') => {
    if (busyTimerRef.current) {
      clearTimeout(busyTimerRef.current)
      busyTimerRef.current = null
    }

    setBusyState(v)
    setBusyMsg(msg)

    if (v) {
      busyTimerRef.current = setTimeout(() => {
        setBusyState(false)
        setBusyMsg('')
        busyTimerRef.current = null
      }, 15000)
    }
  }, [])

  useEffect(() => () => {
    if (busyTimerRef.current) clearTimeout(busyTimerRef.current)
  }, [])

  // ── Total vendido ──
  const totalInfo = useMemo(() => {
    let total = 0, qtd = 0
    linhas.forEach(l => {
      if (l.deleted || !l.cliente_nome?.trim() || !passaFiltro(l, filtro)) return
      qtd++
      const n = parseFloat((l.preco || '').replace(/\./g, '').replace(',', '.'))
      if (!isNaN(n)) total += n
    })
    return { total, qtd }
  }, [linhas, filtro])

  // ── INIT ──
  useEffect(() => {
    async function init() {
      if (!tenantId) return
      setBusy(true, 'Iniciando...')
      try {
        const [db, lst] = await Promise.all([getDadosIniciais(tenantId), getListas(tenantId)])
        setGlobalDB(db)
        setListas(lst)
        setPronto(true)
        setTabelaMsg('Clique em + Novo para começar ou Buscar para carregar registros.')
      } catch {
        showToast('Erro ao iniciar o sistema.', 'error')
        setTabelaMsg('Erro ao carregar. Verifique suas credenciais no .env e recarregue.')
      } finally {
        setBusy(false)
      }
    }
    init()
  }, [tenantId])

  useEffect(() => {
    if (!novoProdutoFocus.current) return
    novoProdutoFocus.current = false
    setTimeout(() => {
      const input = document.querySelector('#tabela tbody tr:first-child td:nth-child(2) .cell-input')
      input?.focus()
    }, 120)
  }, [linhas])

  // ── Autosave a cada 60s ──
  useEffect(() => {
    const id = setInterval(async () => {
      if (!hasUnsaved || busy || !tenantId) return
      try {
        await salvarVendas(tenantId, linhasRef.current, { data_live: dataLive, live_nome: liveNome })
        setHasUnsaved(false)
        showToast('✅ Salvo automaticamente', 'info')
      } catch {}
    }, 60000)
    return () => clearInterval(id)
  }, [hasUnsaved, busy, dataLive, liveNome])

  // ── AÇÕES PRINCIPAIS ──
  const atualizarDados = useCallback(async () => {
    if (busyRef.current || !tenantId) return
    setBusy(true, 'Sincronizando...')
    try {
      const [db, lst] = await Promise.all([getDadosIniciais(tenantId), getListas(tenantId)])
      setGlobalDB(db); setListas(lst)
      showToast('Sincronização concluída!', 'success')
    } catch { showToast('Erro ao sincronizar.', 'error') }
    finally { setBusy(false) }
  }, [tenantId])

  const buscar = useCallback(async () => {
    if (busyRef.current || !tenantId) return
    setBusy(true, 'Buscando dados...')
    setTabelaMsg('Buscando registros...')
    try {
      const rows = await getVendas(tenantId, dataLive || null, liveNome.trim() || null, { somentePendentes: true })
      const novas = ordenarLinhas(calcSacolas(rows.map(mapRow)))
      setLinhas(novas)
      setHasUnsaved(false)
      if (!novas.length) setTabelaMsg('Nenhum registro pendente encontrado.')
    } catch { setTabelaMsg('Erro ao buscar dados.'); showToast('Erro ao buscar dados.', 'error') }
    finally { setBusy(false) }
  }, [tenantId, dataLive, liveNome])

  const novo = useCallback(() => {
    if (busy) return
    const primeira = linhasRef.current.find(l => !l.deleted)
    if (primeira) {
      const vazia = !primeira.produto && !primeira.modelo && !primeira.cor &&
        !primeira.marca && !primeira.preco && !primeira.cliente_nome
      if (vazia) { scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); return }
    }
    const nl = novaLinha()
    novoProdutoFocus.current = true
    setLinhas(prev => [nl, ...prev])
    setPronto(true)
    setHasUnsaved(true)
    setTimeout(() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }), 50)
  }, [busy])

  useEffect(() => {
    if (!pronto || !tenantId) return
    const channel = supabase
      .channel(`vendas-live-${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'vendas',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          const novoCliente = payload.new?.cliente_nome?.trim()
          const antigoCliente = payload.old?.cliente_nome?.trim()
          const realtimeKey = `${payload.new?.id || ''}:${payload.new?.updated_at || ''}:${novoCliente || ''}`
          if (realtimeKey && realtimeKey === lastRealtimeKeyRef.current) return
          lastRealtimeKeyRef.current = realtimeKey

          if (novoCliente && !antigoCliente) {
            setLinhas(prev => {
              const idx = prev.findIndex(l => l.id === payload.new?.id)
              if (idx < 0) return prev

              const next = [...prev]
              next[idx] = {
                ...next[idx],
                cliente_nome: payload.new?.cliente_nome || next[idx].cliente_nome,
                status: payload.new?.status || next[idx].status,
                fila1: payload.new?.fila1 || next[idx].fila1,
                fila2: payload.new?.fila2 || next[idx].fila2,
                fila3: payload.new?.fila3 || next[idx].fila3,
                sacolinha: payload.new?.sacolinha ?? next[idx].sacolinha,
                isSent: (payload.new?.status || next[idx].status || '').toUpperCase() === 'ENVIADO',
              }
              return ordenarLinhas(calcSacolas(next))
            })
            setFlash(true)
            setTimeout(() => setFlash(false), 400)
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [pronto, tenantId])

  // ── UPDATE DE CAMPO ──
  const handleFieldChange = useCallback((idx, field, value) => {
    setLinhas(prev => {
      const n = [...prev]
      const l = { ...n[idx], [field]: value }
      if (field === 'cliente_nome') { l.liberado = false; l.sacolinha = null; n[idx] = l; return calcSacolas(n) }
      if (field === 'preco') l.preco = value.replace(/[^\d,]/g, '')
      n[idx] = l
      return n
    })
    setHasUnsaved(true)
  }, [])

  // ── CHECK BLOQUEIO (chamado no onBlur do campo cliente) ──
  const handleClienteBlur = useCallback((idx) => {
    const l = linhasRef.current[idx]
    if (!l || l.liberado) return
    const nome = (l.cliente_nome || '').trim().toLowerCase()
    if (!nome || !globalDBRef.current.bloqueados[nome]) return

    const info = globalDBRef.current.bloqueados[nome]
    let msg = `O cliente <b style="color:#f28b82">${l.cliente_nome}</b> está BLOQUEADO.<br><br>`
    if (info.manual) msg += `<b>Bloqueio Manual:</b> ${info.msgManual || 'Sem motivo especificado.'}<br><br>`
    if (info.dividas?.length) {
      msg += `<b>Pendências Financeiras:</b><br>`
      info.dividas.forEach(d => { msg += `- Live <b>${d.data}</b> — R$ <b>${d.valor}</b><br>` })
      msg += '<br>'
    }
    msg += 'Deseja liberar a venda mesmo assim?'

    setConfirmacao({
      titulo: '🚫 Cliente Bloqueado',
      mensagem: msg,
      onSim: () => {
        setLinhas(prev => { const n=[...prev]; n[idx]={...n[idx],liberado:true,sacolinha:null}; return calcSacolas(n) })
        setConfirmacao(null)
      },
      onNao: () => {
        setLinhas(prev => { const n=[...prev]; n[idx]={...n[idx],cliente_nome:'',sacolinha:null,liberado:false}; return calcSacolas(n) })
        setConfirmacao(null)
      },
    })
  }, [])

  // ── FILA ──
  const salvarFila = useCallback((idx, f1, f2, f3) => {
    setLinhas(prev => { const n=[...prev]; n[idx]={...n[idx],fila1:f1,fila2:f2,fila3:f3}; return n })
    setHasUnsaved(true); setModalFilaIdx(null)
  }, [])

  const trocarClienteFila = useCallback((idx, novoCliente) => {
    setLinhas(prev => {
      const n=[...prev]; n[idx]={...n[idx],cliente_nome:novoCliente,liberado:false,sacolinha:null}
      return calcSacolas(n)
    })
    setHasUnsaved(true); showToast('Cliente alterado!', 'success')
  }, [])

  // ── ENVIAR / ESTORNAR ──
  const handleEnviar = useCallback(async (idx) => {
    const l = linhasRef.current[idx]
    if (l.isSent) { showToast('Esta venda já foi enviada!', 'info'); return }
    if (!dataLive || !liveNome.trim()) {
      setAlerta({ titulo: 'Faltam Dados', mensagem: 'Preencha a <b>Data</b> e a <b>Live</b> no topo.' }); return
    }
    if (!l.cliente_nome.trim()) {
      setAlerta({ titulo: 'Cliente Vazio', mensagem: 'Esta linha precisa de um <b>Cliente</b>.' }); return
    }
    const p = (l.preco || '').replace(/\./g,'').replace(',','.')
    if (!p || parseFloat(p) === 0) {
      setAlerta({ titulo: 'Preço Ausente', mensagem: 'O <b>Preço</b> precisa ser preenchido.' }); return
    }
    setBusy(true, 'Enviando...')
    try {
      const res = await enviarVenda(tenantId, l, dataLive, liveNome)
      setLinhas(prev => { const n=[...prev]; n[idx]={...n[idx],isSent:true,status:'ENVIADO',id:res.id||n[idx].id}; return n })
      showToast('✅ Venda enviada com sucesso!'); setHasUnsaved(true)
    } catch { showToast('Erro ao enviar venda.', 'error') }
    finally { setBusy(false) }
  }, [dataLive, liveNome, busy])

  const handleEstornar = useCallback((idx) => {
    setConfirmacao({
      titulo: '↩️ Estornar Venda',
      mensagem: 'Deseja ESTORNAR esta venda?<br><br>Ela voltará a ficar editável.',
      onSim: async () => {
        setConfirmacao(null); setBusy(true, 'Estornando...')
        try {
          await estornarVenda(linhasRef.current[idx].id)
          setLinhas(prev => { const n=[...prev]; n[idx]={...n[idx],isSent:false,status:''}; return n })
          showToast('Venda estornada!', 'success'); setHasUnsaved(true)
        } catch { showToast('Erro ao estornar.', 'error') }
        finally { setBusy(false) }
      },
      onNao: () => setConfirmacao(null),
    })
  }, [])

  // ── COPIAR / EXCLUIR ──
  const handleCopiar = useCallback((idx) => {
    const o = linhasRef.current[idx]
    const copia = { ...novaLinha(), produto:o.produto, modelo:o.modelo, cor:o.cor, marca:o.marca, tamanho:o.tamanho, preco:o.preco, codigo:o.codigo }
    setLinhas(prev => [copia, ...prev])
    setHasUnsaved(true)
    setTimeout(() => scrollRef.current?.scrollTo({ top:0, behavior:'smooth' }), 50)
  }, [])

  const handleExcluir = useCallback((idx) => {
    setConfirmacao({
      titulo: '🗑️ Excluir Linha',
      mensagem: 'Deseja realmente EXCLUIR esta linha?',
      onSim: () => {
        setLinhas(prev => {
          const n=[...prev]; n[idx]={...n[idx],deleted:true,cliente_nome:'',sacolinha:null}
          setConfirmacao(null); return calcSacolas(n)
        })
        setHasUnsaved(true)
      },
      onNao: () => setConfirmacao(null),
    })
  }, [])

  // ── MODAL EDIÇÃO ──
  const confirmarEdicao = useCallback((idx, campos) => {
    setLinhas(prev => {
      const n=[...prev]; const clienteMudou = n[idx].cliente_nome !== campos.cliente_nome
      n[idx] = { ...n[idx], ...campos, liberado: clienteMudou ? false : campos.liberado }
      if (clienteMudou) n[idx].sacolinha = null
      return calcSacolas(n)
    })
    setHasUnsaved(true); setModalEdicaoIdx(null)
  }, [])

  // ── FINALIZAR LIVE ──
  const salvarRascunho = useCallback(async () => {
    if (busy) return
    setBusy(true, 'Salvando...')
    try {
      await salvarVendas(tenantId, linhasRef.current, { data_live: dataLive, live_nome: liveNome })
      setHasUnsaved(false)
      showToast('✅ Salvo com sucesso!', 'success')
    } catch (err) {
      showToast('Erro ao salvar: ' + (err?.message || 'Tente novamente.'), 'error')
    } finally { setBusy(false) }
  }, [busy, tenantId, dataLive, liveNome])

  const iniciarFinalizacao = useCallback(() => {
    if (busy) return
    if (!dataLive || !liveNome.trim()) {
      setAlerta({ titulo: 'Dados Faltando', mensagem: 'Preencha a <b>Data</b> e a <b>Live</b> antes de finalizar.' }); return
    }
    const semPreco = linhasRef.current.some(l => {
      if (l.deleted || l.isSent || !l.cliente_nome?.trim()) return false
      const p = (l.preco||'').replace(/\./g,'').replace(',','.')
      return !p || parseFloat(p) === 0
    })
    if (semPreco) {
      setAlerta({ titulo: 'Preço Ausente', mensagem: 'Há itens com cliente mas <b>sem preço</b>. Corrija antes de finalizar.' }); return
    }
    setConfirmacao({
      titulo: 'Finalizar a Live?',
      mensagem: 'Todos os itens com cliente serão marcados como <b>ENVIADO</b> no banco.<br><br>Deseja continuar?',
      onSim: async () => {
        setConfirmacao(null); setBusy(true, 'Finalizando live...')
        try {
          const res = await finalizarLive(tenantId, linhasRef.current, dataLive, liveNome)
          showToast(`✅ ${res.movidos} vendas confirmadas!`, 'success')
          setHasUnsaved(false); await buscar()
        } catch (err) {
          console.error('Erro ao finalizar live:', err)
          const msg = err?.message || String(err) || 'Tente novamente.'
          setAlerta({ titulo: 'Erro', mensagem: `Erro ao finalizar a live. ${msg}` })
        } finally { setBusy(false) }
      },
      onNao: () => setConfirmacao(null),
    })
  }, [busy, dataLive, liveNome, buscar])

  // ── HISTÓRICO: handlers ──────────────────────────────────────
  const buscarHistorico = useCallback(async () => {
    if (busyRef.current || !tenantId) return
    setBusy(true, 'Buscando histórico...')
    try {
      const rows = await getVendasEnviadas(tenantId, filtrosHist)
      setLinhasHist(rows)
      if (!rows.length) showToast('Nenhum registro encontrado para os filtros informados.', 'info')
      else showToast(`${rows.length} registro(s) encontrado(s).`, 'success')
    } catch { showToast('Erro ao buscar histórico.', 'error') }
    finally { setBusy(false) }
  }, [tenantId, filtrosHist])

  const confirmarEdicaoHist = useCallback(async (idx, campos) => {
    setModalHistIdx(null)
    const linha = { ...linhasHistRef.current[idx], ...campos }
    setBusy(true, 'Salvando...')
    try {
      await updateVendaEnviada(tenantId, linha)
      setLinhasHist(prev => { const n = [...prev]; n[idx] = linha; return n })
      showToast('Registro atualizado!', 'success')
    } catch { showToast('Erro ao salvar alterações.', 'error') }
    finally { setBusy(false) }
  }, [tenantId])

  const estornarHist = useCallback((idx) => {
    setConfirmacao({
      titulo: '↩️ Estornar Venda',
      mensagem: 'Deseja ESTORNAR esta venda?<br><br>Ela voltará para pendente e sumirá do histórico.',
      onSim: async () => {
        setConfirmacao(null); setBusy(true, 'Estornando...')
        try {
          await estornarVenda(linhasHistRef.current[idx].id)
          setLinhasHist(prev => prev.filter((_, i) => i !== idx))
          showToast('Venda estornada!', 'success')
        } catch { showToast('Erro ao estornar.', 'error') }
        finally { setBusy(false) }
      },
      onNao: () => setConfirmacao(null),
    })
  }, [])

  const excluirHist = useCallback((idx) => {
    setConfirmacao({
      titulo: '🗑️ Excluir Registro',
      mensagem: 'Deseja EXCLUIR este registro permanentemente?<br><br>Esta ação não pode ser desfeita.',
      onSim: async () => {
        setConfirmacao(null); setBusy(true, 'Excluindo...')
        try {
          const { error } = await supabase.from('vendas').delete()
            .eq('id', linhasHistRef.current[idx].id)
          if (error) throw error
          setLinhasHist(prev => prev.filter((_, i) => i !== idx))
          showToast('Registro excluído.', 'success')
        } catch { showToast('Erro ao excluir.', 'error') }
        finally { setBusy(false) }
      },
      onNao: () => setConfirmacao(null),
    })
  }, [])

  // ── RENDER ──
  const visivel = linhas.filter(l => !l.deleted && passaFiltro(l, filtro))
  const totalFmt = totalInfo.total.toLocaleString('pt-BR', { style:'currency', currency:'BRL' })

  return (
    <AppShell title="Vendas" hideTitle flush>
    <div style={{ height:'100%', display:'flex', flexDirection:'column', overflow:'hidden' }}>

      {/* TOP LOADER */}
      {busy && (
        <>
          <div id="topLoader" style={{ display:'block' }}><div className="topLoader-bar" /></div>
          {busyMsg && <div className="topLoader-text">{busyMsg}</div>}
        </>
      )}

      {/* SCROLL TOP */}
      <button id="btnScrollTop" className={scrollTop ? 'show' : ''}
        onClick={() => scrollRef.current?.scrollTo({ top:0, behavior:'smooth' })} title="Topo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" style={{ width:24, height:24 }}>
          <polyline points="18 15 12 9 6 15"/>
        </svg>
      </button>

      {/* TOOLBAR — MODO HISTÓRICO */}
      {modo === 'historico' && (
        <div className="no-print">
          <div style={{ padding: '6px 14px 0', maxWidth: 1200, margin: '0 auto' }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--purple)' }}>
              📋 Modo Histórico — registros enviados
            </span>
          </div>
          <div className="toolbar">
            <div className="field">
              <label>Data De</label>
              <input type="date" value={filtrosHist.dataInicio}
                onChange={e => setFiltrosHist(p => ({ ...p, dataInicio: e.target.value }))}
                onClick={e => { try { e.target.showPicker() } catch {} }} />
            </div>
            <div className="field">
              <label>Data Até</label>
              <input type="date" value={filtrosHist.dataFim}
                onChange={e => setFiltrosHist(p => ({ ...p, dataFim: e.target.value }))}
                onClick={e => { try { e.target.showPicker() } catch {} }} />
            </div>
            <div className="field" style={{ flex: 2 }}>
              <label>Cliente</label>
              <AutocompleteInput
                value={filtrosHist.clienteNome}
                onChange={v => setFiltrosHist(p => ({ ...p, clienteNome: v }))}
                list={listas.clientes}
                placeholder="Nome do cliente..."
                showOnFocus
              />
            </div>
            <div className="total-container">
              <label style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.4px', color:'var(--muted)' }}>Encontrados</label>
              <div className="total-valor" style={{ fontSize: 18 }}>
                <span style={{ color: 'var(--purple)' }}>{linhasHist.filter(l => passaFiltro(l, filtro)).length}</span>
                <span style={{ fontSize:13, color:'var(--muted)', fontWeight:600, marginLeft:4 }}>itens</span>
              </div>
            </div>
            <div className="actions">
              <button className="btn-acao btn-ghost" onClick={() => { setModo('live'); setLinhasHist([]) }} disabled={busy}>
                ← Voltar
              </button>
              <button className="btn-acao btn-green" onClick={buscarHistorico} disabled={busy}>
                Buscar Enviados
              </button>
            </div>
          </div>
          <div className="filter-header-bar">
            <input type="text" value={filtro} onChange={e => setFiltro(e.target.value)}
              placeholder="Filtro Rápido: produto, cor, marca, tamanho..." />
          </div>
        </div>
      )}

      {/* TOOLBAR — MODO LIVE */}
      {modo === 'live' && (
        <div className="no-print">
          <div className="toolbar">
            <div className="field">
              <label>Data</label>
              <input type="date" value={dataLive} onChange={e => setDataLive(e.target.value)}
                onClick={e => { try { e.target.showPicker() } catch {} }} />
            </div>
            <div className="field">
              <label>Live</label>
              <AutocompleteInput value={liveNome} onChange={setLiveNome}
                list={globalDB.lives} placeholder="Buscar Live..." showOnFocus />
            </div>
            <div className="total-container">
              <label style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.4px', color:'var(--muted)' }}>Total Vendido</label>
              <div className="total-valor">
                {totalFmt}{' '}
                <span style={{ fontSize:13, color:'var(--muted)', fontWeight:600 }}>({totalInfo.qtd} unid.)</span>
              </div>
            </div>
            <div className="actions">
              <button className="btn-acao btn-ghost" onClick={atualizarDados} disabled={busy}
                style={{ minWidth:44, padding:'0 10px' }} title="Sincronizar dados">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
              </button>
              <button className="btn-acao btn-ghost" style={{ color: 'var(--purple)', borderColor: 'rgba(197,138,249,0.3)' }}
                onClick={() => { setModo('historico'); setFiltro('') }} disabled={busy} title="Buscar e editar registros já enviados">
                Histórico
              </button>
              <button className="btn-acao btn-ghost" onClick={() => setShowModalCadastro(true)} disabled={busy}>+ Cadastro</button>
              <button className="btn-acao btn-ghost" onClick={novo} disabled={busy}>+ Novo</button>
              <button className="btn-acao btn-green" onClick={buscar} disabled={busy}>Buscar</button>
              <div className="save-group">
                <button className="btn-acao btn-ghost" onClick={salvarRascunho} disabled={busy} title="Salva os dados sem finalizar a live">Salvar</button>
                <button className="btn-acao btn-blue" onClick={iniciarFinalizacao} disabled={busy} title="Requer Data e Live preenchidos — marca tudo como ENVIADO">Finalizar</button>
              </div>
            </div>
          </div>
          <div className="filter-header-bar">
            <input type="text" value={filtro} onChange={e => setFiltro(e.target.value)}
              placeholder="Filtro Rápido: Digite para buscar (Ex: camiseta, verde, zara)" />
          </div>
        </div>
      )}

      {/* TABELA — MODO HISTÓRICO */}
      {modo === 'historico' && (
        <div id="tabela-container">
          <div className="table-responsive" ref={scrollRef}
            onScroll={e => setScrollTop(e.target.scrollTop > 150)}>
            {linhasHist.length === 0 ? (
              <div id="tabela-msg">
                {busy ? 'Buscando...' : 'Use os filtros acima e clique em "Buscar Enviados".'}
              </div>
            ) : (
              <table id="tabela">
                <thead>
                  <tr>
                    <th className="col-sacola">Data / Live</th>
                    <th>Produto</th><th>Modelo</th>
                    <th className="col-cor">Cor</th><th>Marca</th>
                    <th className="col-tam">Tam.</th>
                    <th className="col-preco">Preço</th>
                    <th className="col-cod">Cód.</th>
                    <th className="col-cliente">Cliente</th>
                    <th className="col-acoes">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasHist.map((l, idx) => {
                    if (!passaFiltro(l, filtro)) return null
                    return (
                      <TabelaRow key={l.id} linha={l} idx={idx} listas={listas}
                        modoHistorico={true}
                        onFieldChange={() => {}}
                        onClienteBlur={() => {}}
                        onNovoFromRow={() => {}}
                        onAbrirModal={setModalHistIdx}
                        onAbrirFila={() => {}}
                        onEnviar={() => {}}
                        onEstornar={estornarHist}
                        onCopiar={() => {}}
                        onExcluir={excluirHist}
                      />
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* TABELA — MODO LIVE */}
      {modo === 'live' && (
        <div id="tabela-container" style={flash ? { backgroundColor: 'rgba(255, 249, 196, 0.45)', transition: 'background-color 0.25s ease' } : undefined}>
          <div className="table-responsive" ref={scrollRef}
            onScroll={e => setScrollTop(e.target.scrollTop > 150)}>
            {!pronto || visivel.length === 0 ? (
              <div id="tabela-msg">{tabelaMsg}</div>
            ) : null}
            {pronto && visivel.length > 0 && (
              <table id="tabela">
                <thead>
                  <tr>
                    <th className="col-sacola">Sacola</th>
                    <th>Produto</th><th>Modelo</th>
                    <th className="col-cor">Cor</th><th>Marca</th>
                    <th className="col-tam">Tam.</th>
                    <th className="col-preco">Preço</th>
                    <th className="col-cod">Cód.</th>
                    <th className="col-cliente">Cliente</th>
                    <th className="col-acoes">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l, idx) => {
                    if (l.deleted || !passaFiltro(l, filtro)) return null
                    return (
                      <TabelaRow key={l._key || l.id || idx}
                        linha={l} idx={idx} listas={listas}
                        onFieldChange={handleFieldChange}
                        onClienteBlur={handleClienteBlur}
                        onNovoFromRow={novo}
                        onAbrirModal={setModalEdicaoIdx}
                        onAbrirFila={setModalFilaIdx}
                        onEnviar={handleEnviar}
                        onEstornar={handleEstornar}
                        onCopiar={handleCopiar}
                        onExcluir={handleExcluir}
                      />
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* MODAIS */}
      {modalFilaIdx !== null && (
        <ModalFila
          linha={linhas[modalFilaIdx]}
          clientes={listas.clientes}
          onSalvar={(res) => {
            if (res.trocarCliente) {
              trocarClienteFila(modalFilaIdx, res.trocarCliente)
              salvarFila(modalFilaIdx,
                res.numFila === 1 ? '' : res.fila1,
                res.numFila === 2 ? '' : res.fila2,
                res.numFila === 3 ? '' : res.fila3)
            } else {
              salvarFila(modalFilaIdx, res.fila1, res.fila2, res.fila3)
            }
          }}
          onFechar={() => setModalFilaIdx(null)}
        />
      )}
      {modalEdicaoIdx !== null && (
        <ModalEdicao
          linha={linhas[modalEdicaoIdx]}
          listas={listas}
          onConfirmar={(campos) => confirmarEdicao(modalEdicaoIdx, campos)}
          onFechar={() => setModalEdicaoIdx(null)}
        />
      )}
      {showModalCadastro && (
        <ModalCadastro
          onSalvar={async (tipo, val, wpp) => {
            await salvarNovoCadastro(tenantId, tipo, val, wpp)
            setListas(await getListas(tenantId))
            showToast('Cadastro realizado!', 'success')
          }}
          onFechar={() => setShowModalCadastro(false)}
        />
      )}
      {modalHistIdx !== null && (
        <ModalEdicao
          linha={linhasHist[modalHistIdx]}
          listas={listas}
          onConfirmar={(campos) => confirmarEdicaoHist(modalHistIdx, campos)}
          onFechar={() => setModalHistIdx(null)}
        />
      )}
      {alerta      && <ModalAlerta      titulo={alerta.titulo}      mensagem={alerta.mensagem}      onFechar={() => setAlerta(null)} />}
      {confirmacao && <ModalConfirmacao titulo={confirmacao.titulo} mensagem={confirmacao.mensagem} onSim={confirmacao.onSim} onNao={confirmacao.onNao} />}
    </div>
    </AppShell>
  )
}
