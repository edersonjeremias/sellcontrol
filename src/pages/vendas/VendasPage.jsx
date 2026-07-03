import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  getDadosIniciais, getListas, salvarNovoCadastro,
  getVendas, salvarVendas, estornarVenda,
  finalizarLive, formatMoney,
  getVendasEnviadas, updateVendaEnviada,
  enviarVenda,
  buscarProdutosPorTermos,
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
    custo: '', qtde: '', condicao: '', genero: '',
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
    custo:        row.custo        || '',
    qtde:         row.qtde         || '',
    condicao:     row.condicao     || '',
    genero:       row.genero       || '',
    isSent: (row.status || '').toUpperCase() === 'ENVIADO',
    liberado: false,
  }
}

function calcSacolas(linhas) {
  const usados = new Set()
  const mapa   = {}
  linhas.forEach(l => {
    if (l.deleted || !l.cliente_nome?.trim()) return   // inclui isSent para reservar seus números
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

const GENERO_TXT = { M: 'masculino masc', F: 'feminino fem', U: 'unissex' }

function passaFiltro(l, filtro) {
  if (!filtro.trim()) return true
  const termos = filtro.toLowerCase().split(',').map(t => t.trim()).filter(Boolean)
  const generoTxt = GENERO_TXT[l.genero] || l.genero || ''
  const txt = [l.produto, l.modelo, l.cor, l.marca, l.tamanho, l.codigo, l.cliente_nome, generoTxt, l.condicao]
    .join(' ').toLowerCase()
  return termos.every(t => txt.includes(t))
}

// ─── HELPERS DE PERSISTÊNCIA ──────────────────────────────
function storageSave(tid, data) {
  try { localStorage.setItem(`sc_vendas_${tid}`, JSON.stringify(data)) } catch {}
}
function storageLoad(tid) {
  try { return JSON.parse(localStorage.getItem(`sc_vendas_${tid}`) || 'null') } catch { return null }
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
  const [produtosBusca, setProdutosBusca] = useState([]) // Produtos encontrados na busca
  const [tabelaMsg,   setTabelaMsg]   = useState('Iniciando sistema...')
  const [pronto,      setPronto]      = useState(false)
  const [scrollTop,   setScrollTop]   = useState(false)
  const [flash,       setFlash]       = useState(false)
  const novoProdutoFocus = useRef(false)
  const busyRef = useRef(false)
  const lastRealtimeKeyRef = useRef('')
  const focusReturnRef = useRef(null)  // guarda o input de cliente que disparou o bloqueio

  // ── Configurações de colunas ──
  const [colsConfig,    setColsConfig]    = useState({ custo: false, condicao: false, genero: false })
  const [showSettings,  setShowSettings]  = useState(false)
  const [modalQt,       setModalQt]       = useState(false)
  const [qtInput,       setQtInput]       = useState('2')

  // ── Modal state ──
  const [modalEdicaoIdx,    setModalEdicaoIdx]    = useState(null)
  const [modalFilaIdx,      setModalFilaIdx]      = useState(null)
  const [showModalCadastro, setShowModalCadastro] = useState(false)
  const [alerta,            setAlerta]            = useState(null)
  const [confirmacao,       setConfirmacao]       = useState(null)

  // ── Modo Histórico ──
  const [modo,             setModo]             = useState('live')
  const [filtrosHist,      setFiltrosHist]      = useState({ dataInicio: '', dataFim: '', clienteNome: '' })
  const [linhasHist,       setLinhasHist]       = useState([])
  const [modalHistIdx,     setModalHistIdx]     = useState(null)
  const [modalFilaHistIdx, setModalFilaHistIdx] = useState(null)
  const linhasHistRef = useRef(linhasHist)
  useEffect(() => { linhasHistRef.current = linhasHist }, [linhasHist])

  // ── Refs ──
  const scrollRef    = useRef(null)
  const linhasRef    = useRef(linhas)
  const globalDBRef  = useRef(globalDB)
  const busyTimerRef = useRef(null)
  const isSavingRef    = useRef(false)
  const hasUnsavedRef  = useRef(false)
  const dataLiveRef  = useRef(dataLive)
  const liveNomeRef  = useRef(liveNome)
  const tenantIdRef  = useRef(tenantId)
  // Atualização síncrona durante o render — sem lag de useEffect
  dataLiveRef.current  = dataLive
  liveNomeRef.current  = liveNome
  tenantIdRef.current  = tenantId
  useEffect(() => { linhasRef.current = linhas },         [linhas])
  useEffect(() => { globalDBRef.current = globalDB },     [globalDB])
  useEffect(() => { busyRef.current = busy },             [busy])
  useEffect(() => { hasUnsavedRef.current = hasUnsaved }, [hasUnsaved])

  useEffect(() => {
    if (!tenantId) return
    try { const s = JSON.parse(localStorage.getItem(`sc_cols_${tenantId}`)); if (s) setColsConfig(s) } catch {}
  }, [tenantId])
  useEffect(() => {
    if (!tenantId) return
    localStorage.setItem(`sc_cols_${tenantId}`, JSON.stringify(colsConfig))
  }, [colsConfig, tenantId])

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
      }, 8000)
    }
  }, [])

  useEffect(() => () => {
    if (busyTimerRef.current) clearTimeout(busyTimerRef.current)
  }, [])

  // ── Total vendido ──
  const totalInfo = useMemo(() => {
    let total = 0, qtd = 0
    linhas.forEach(l => {
      if (l.deleted || l.status === 'Vendido' || !l.cliente_nome?.trim() || !passaFiltro(l, filtro)) return
      qtd++
      const n = parseFloat((l.preco || '').replace(/\./g, '').replace(',', '.'))
      if (!isNaN(n)) total += n
    })
    return { total, qtd }
  }, [linhas, filtro])

  // ── BUSCA DE PRODUTOS (quando digita no filtro) ──
  useEffect(() => {
    console.log('🔄 useEffect busca ativado. Filtro:', filtro)
    if (!filtro.trim()) {
      console.log('⚪ Filtro vazio, limpando busca')
      setProdutosBusca([])
      return
    }

    console.log('⏱️ Iniciando debounce de 300ms...')
    const timer = setTimeout(async () => {
      console.log('🚀 Executando busca após debounce')
      try {
        const resultados = await buscarProdutosPorTermos(tenantId, filtro)
        console.log('📥 Resultados recebidos:', resultados.length)
        setProdutosBusca(resultados)
      } catch (err) {
        console.error('❌ Erro ao buscar produtos:', err)
      }
    }, 300) // Debounce de 300ms

    return () => {
      console.log('🧹 Limpando timer do debounce')
      clearTimeout(timer)
    }
  }, [filtro, tenantId])

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

  // ── Restaurar estado ao montar (navegação entre páginas) ──
  useEffect(() => {
    if (!tenantId) return
    const saved = storageLoad(tenantId)
    if (!saved) return
    // Removido o preenchimento automático de dataLive e liveNome para não filtrar a busca inicial
    if (saved.linhas?.length) {
      setLinhas(saved.linhas)
      setPronto(true)
      setTabelaMsg('')
    }
  }, [tenantId])

  // ── Persistir estado sempre que mudar ──
  useEffect(() => {
    if (!tenantId) return
    storageSave(tenantId, {
      linhas: linhas.filter(l => !l.deleted),
      dataLive,
      liveNome,
    })
  }, [linhas, dataLive, liveNome, tenantId])

  useEffect(() => {
    if (!novoProdutoFocus.current) return
    novoProdutoFocus.current = false
    setTimeout(() => {
      const input = document.querySelector('#tabela tbody tr:first-child td:nth-child(2) .cell-input')
      input?.focus()
    }, 120)
  }, [linhas])

  // ── triggerAutoSave: apenas marca que há alterações pendentes ──
  const triggerAutoSave = useCallback(() => {
    setHasUnsaved(true)
  }, [])

  // ── Auto-save periódico (1 minuto) ──
  useEffect(() => {
    if (!tenantId || !pronto) return
    const interval = setInterval(async () => {
      if (!hasUnsavedRef.current || isSavingRef.current || busyRef.current) return
      isSavingRef.current = true
      try {
        const res = await salvarVendas(tenantIdRef.current, linhasRef.current, {
          data_live: dataLiveRef.current || null,
          live_nome: liveNomeRef.current || '',
        })
        if (res.novosIds?.length) {
          setLinhas(prev => {
            const queue = [...res.novosIds]
            return prev.map(l => {
              if (!l.id && !l.deleted && queue.length) {
                return { ...l, id: queue.shift().id, isNew: false }
              }
              return l
            })
          })
        }
        setHasUnsaved(false)
        showToast('Salvo', 'success', 1800)
      } catch (err) {
        console.error('Erro no auto-save periódico:', err)
      } finally {
        isSavingRef.current = false
      }
    }, 60000)
    return () => clearInterval(interval)
  }, [tenantId, pronto, showToast])

  // ── AÇÕES PRINCIPAIS ──
  const atualizarDados = useCallback(async () => {
    if (busyRef.current || !tenantId) return
    setBusy(true, 'Sincronizando...')
    try {
      const [db, lst] = await Promise.all([getDadosIniciais(tenantId), getListas(tenantId)])
      globalDBRef.current = db
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
      // Busca apenas itens COM cliente e não enviados/vendidos
      const rows = await getVendas(tenantId, dataLive || null, liveNome || null, { apenasComCliente: true })
      const novas = ordenarLinhas(calcSacolas(rows.map(mapRow)))
      setLinhas(novas)
      setProdutosBusca([]) // Limpa busca ao carregar vendas
      setFiltro('') // Limpa filtro
      setHasUnsaved(false)
      if (!novas.length) setTabelaMsg('Nenhum item com cliente encontrado. Use o campo de busca para encontrar produtos ou clique em + Novo.')
    } catch { setTabelaMsg('Erro ao buscar dados.'); showToast('Erro ao buscar dados.', 'error') }
    finally { setBusy(false) }
  }, [tenantId, dataLive, liveNome])

  const novo = useCallback(() => {
    if (busy) return
    setLinhas(prev => {
      const primeira = prev.find(l => !l.deleted)
      if (primeira) {
        const vazia = !primeira.produto && !primeira.modelo && !primeira.cor &&
          !primeira.marca && !primeira.preco && !primeira.cliente_nome
        if (vazia) {
          setTimeout(() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }), 50)
          return prev
        }
      }
      novoProdutoFocus.current = true
      setTimeout(() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }), 50)
      return [novaLinha(), ...prev]
    })
    setPronto(true)
  }, [busy])

  // Adiciona nova linha ao FINAL sem scroll — chamado quando usuário dá Enter na última linha
  const novoAbaixo = useCallback(() => {
    const nl = novaLinha()
    setLinhas(prev => [...prev, nl])
    setPronto(true)
    // Foca o primeiro input da nova última linha sem rolar a tela para o topo
    setTimeout(() => {
      const rows = document.querySelectorAll('#tabela tbody tr')
      const lastRow = rows[rows.length - 1]
      const input = lastRow?.querySelector('td:nth-child(2) .cell-input')
      input?.focus()
    }, 80)
    triggerAutoSave()
  }, [triggerAutoSave])

  // Adiciona produto da busca às vendas
  const adicionarProdutoBusca = useCallback((produto) => {
    // Remove da lista de busca e adiciona às linhas
    setProdutosBusca(prev => prev.filter(p => p._key !== produto._key))
    setLinhas(prev => [{ ...produto, _key: `new-${Date.now()}-${Math.random()}`, _isBuscaResult: false }, ...prev])
    setHasUnsaved(true)
    triggerAutoSave()
  }, [triggerAutoSave])

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
            // Ignora atualização do próprio auto-save (evita re-render/flash desnecessário)
            const existingRow = linhasRef.current.find(l => l.id === payload.new?.id)
            if (existingRow?.cliente_nome?.trim() === novoCliente) return

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
    triggerAutoSave()
  }, [triggerAutoSave])

  // ── CHECK BLOQUEIO (chamado no onBlur do campo cliente) ──
  function showBloqueioModal(idx, nomeExibido, inputEl) {
    const nome = nomeExibido.trim().toLowerCase()
    const info = globalDBRef.current.bloqueados[nome]
    if (!info) return
    focusReturnRef.current = inputEl || null
    let msg = `O cliente <b style="color:#f28b82">${nomeExibido.trim()}</b> está BLOQUEADO.<br><br>`
    if (info.manual) msg += `<b>Bloqueio Manual:</b> ${info.msgManual || 'Sem motivo especificado.'}<br><br>`
    if (info.dividas?.length) {
      msg += `<b>Pendências Financeiras:</b><br>`
      info.dividas.forEach(d => { msg += `- Live <b>${d.data}</b> — R$ <b>${d.valor}</b><br>` })
    }
    setConfirmacao({
      titulo: '🚫 Cliente Bloqueado',
      mensagem: msg,
      hideConfirm: true,
      onNao: () => {
        setLinhas(prev => { const n=[...prev]; n[idx]={...n[idx],cliente_nome:'',sacolinha:null,liberado:false}; return calcSacolas(n) })
        setConfirmacao(null)
        const el = focusReturnRef.current
        if (el) setTimeout(() => { el.focus(); focusReturnRef.current = null }, 50)
      },
    })
  }

  const handleClienteBlur = useCallback((idx) => {
    const l = linhasRef.current[idx]
    if (!l || l.liberado) return
    const nome = (l.cliente_nome || '').trim()
    if (!nome) return
    showBloqueioModal(idx, nome)
  }, [])

  // Sem useCallback para garantir closure sempre atualizada
  function handleClienteSelect(idx, nome, inputEl) {
    const l = linhasRef.current[idx]
    if (l?.liberado) return
    showBloqueioModal(idx, nome, inputEl)
  }

  function handleIsBlocked(nome) {
    return !!globalDBRef.current.bloqueados[(nome || '').trim().toLowerCase()]
  }

  // ── FILA ──
  const salvarFila = useCallback((idx, f1, f2, f3) => {
    setLinhas(prev => { const n=[...prev]; n[idx]={...n[idx],fila1:f1,fila2:f2,fila3:f3}; return n })
    triggerAutoSave(); setModalFilaIdx(null)
  }, [triggerAutoSave])

  const trocarClienteFila = useCallback((idx, novoCliente) => {
    setLinhas(prev => {
      const n=[...prev]; n[idx]={...n[idx],cliente_nome:novoCliente,liberado:false,sacolinha:null}
      return calcSacolas(n)
    })
    triggerAutoSave()
  }, [triggerAutoSave])

  // ── SALVAR LINHA (aviãozinho) ──
  const handleEnviar = useCallback(async (rowKey) => {
    const l = linhasRef.current.find(r => r._key === rowKey)
    if (!l) { showToast('Linha não encontrada. Clique em Buscar e tente novamente.', 'error'); return }
    if (l.isSent) { showToast('Esta venda já foi finalizada!', 'info'); return }
    const dl = dataLiveRef.current
    const ln = liveNomeRef.current
    if (!dl || !ln.trim()) {
      showToast('Preencha a Data e a Live antes de salvar.', 'error'); return
    }
    if (!l.cliente_nome?.trim()) {
      showToast('Preencha o nome do Cliente antes de enviar.', 'error'); return
    }
    if (!l.preco?.trim()) {
      showToast('Preencha o Preço antes de enviar.', 'error'); return
    }
    try {
      const tid = tenantIdRef.current
      let res
      if (l.cliente_nome?.trim()) {
        res = await enviarVenda(tid, l, dl || null, ln || '')
        setLinhas(prev => calcSacolas(prev.map(r => r._key === rowKey ? { ...r, id: res.id, isNew: false, isSent: true, status: 'ENVIADO' } : r)))
      } else {
        res = await salvarVendas(tid, [l], { data_live: dl || null, live_nome: ln || '' })
        if (!l.id && res.novosIds?.length > 0) {
          setLinhas(prev => prev.map(r => r._key === rowKey ? { ...r, id: res.novosIds[0].id, isNew: false } : r))
        }
      }
      setHasUnsaved(false)
    } catch (err) {
      showToast('Erro ao salvar: ' + (err?.message || String(err)), 'error')
    }
  }, [])

  const handleEstornar = useCallback((rowKey) => {
    setConfirmacao({
      titulo: '↩️ Estornar Venda',
      mensagem: 'Deseja ESTORNAR esta venda?<br><br>Ela voltará a ficar editável.',
      onSim: async () => {
        setConfirmacao(null); setBusy(true, 'Estornando...')
        try {
          const l = linhasRef.current.find(r => r._key === rowKey)
          if (!l?.id) return
          await estornarVenda(l.id)
          setLinhas(prev => calcSacolas(prev.map(r => r._key === rowKey ? { ...r, isSent: false, status: '' } : r)))
          showToast('Venda estornada!', 'success')
        } catch { showToast('Erro ao estornar.', 'error') }
        finally { setBusy(false) }
      },
      onNao: () => setConfirmacao(null),
    })
  }, [])

  // ── COPIAR / EXCLUIR ──
  const handleCopiar = useCallback((rowKey) => {
    const o = linhasRef.current.find(r => r._key === rowKey)
    if (!o) return
    const copia = { ...novaLinha(), produto: o.produto, modelo: o.modelo, cor: o.cor, marca: o.marca, tamanho: o.tamanho, preco: o.preco, codigo: o.codigo }
    setLinhas(prev => {
      const idx = prev.findIndex(r => r._key === rowKey)
      if (idx < 0) return [...prev, copia]
      const next = [...prev]
      next.splice(idx + 1, 0, copia)
      return next
    })
    triggerAutoSave()
  }, [triggerAutoSave])

  const handleExcluir = useCallback((rowKey) => {
    setConfirmacao({
      titulo: '🗑️ Excluir Linha',
      mensagem: 'Deseja realmente EXCLUIR esta linha?',
      onSim: () => {
        setConfirmacao(null)
        setLinhas(prev => calcSacolas(prev.map(r => r._key === rowKey ? { ...r, deleted: true, cliente_nome: '', sacolinha: null } : r)))
        triggerAutoSave()
      },
      onNao: () => setConfirmacao(null),
    })
  }, [triggerAutoSave])

  // ── MODAL EDIÇÃO ──
  const confirmarEdicao = useCallback((idx, campos) => {
    setLinhas(prev => {
      const n=[...prev]; const clienteMudou = n[idx].cliente_nome !== campos.cliente_nome
      n[idx] = { ...n[idx], ...campos, liberado: clienteMudou ? false : campos.liberado }
      if (clienteMudou) n[idx].sacolinha = null
      return calcSacolas(n)
    })
    triggerAutoSave(); setModalEdicaoIdx(null)
  }, [])

  // ── FINALIZAR LIVE ──
  const iniciarFinalizacao = useCallback(async () => {
    if (busy) return

    const linhasComCliente = linhasRef.current.filter(l => !l.deleted && l.cliente_nome?.trim())
    const todasJaEnviadas  = linhasComCliente.length > 0 && linhasComCliente.every(l => l.isSent)

    // Todos os pedidos já foram enviados individualmente — só limpa a mesa
    if (todasJaEnviadas) {
      setConfirmacao({
        titulo: 'Limpar Mesa?',
        mensagem: `Todos os ${linhasComCliente.length} pedido(s) já foram enviados individualmente.<br><br>Deseja limpar a mesa para a próxima live?`,
        onSim: () => {
          setConfirmacao(null)
          setLinhas([])
          setHasUnsaved(false)
          setTabelaMsg('Mesa limpa. Clique em + Novo para começar ou Buscar para carregar registros.')
          showToast('Mesa limpa!', 'success')
        },
        onNao: () => setConfirmacao(null),
      })
      return
    }

    // NOVO: Marca itens com cliente + data da live como "Vendido" automaticamente
    setBusy(true, 'Salvando...')
    try {
      const linhasAtualizadas = linhasRef.current.map(l => {
        // Se tem cliente_nome E data_live preenchidos, marca como Vendido
        if (!l.deleted && l.cliente_nome?.trim() && dataLive) {
          return { ...l, status: 'Vendido' }
        }
        return l
      })

      // Salva as vendas com os status atualizados
      await salvarVendas(tenantId, linhasAtualizadas, dataLive, liveNome)

      // Remove itens vendidos da visualização
      const itensVendidos = linhasAtualizadas.filter(l => l.status === 'Vendido').length
      const linhasRestantes = linhasAtualizadas.filter(l => l.status !== 'Vendido')

      setLinhas(linhasRestantes)
      setHasUnsaved(false)

      if (itensVendidos > 0) {
        showToast(`✅ ${itensVendidos} item(ns) marcado(s) como Vendido e removido(s) da tela!`, 'success')
      } else {
        showToast('Vendas salvas!', 'success')
      }
    } catch (err) {
      console.error('Erro ao salvar vendas:', err)
      const msg = err?.message || String(err) || 'Tente novamente.'
      setAlerta({ titulo: 'Erro', mensagem: `Erro ao salvar vendas. ${msg}` })
    } finally {
      setBusy(false)
    }
  }, [busy, dataLive, liveNome, tenantId])

  // ── MULTIPLICAR LINHAS ──
  function multiplicarLinhas() {
    const n = parseInt(qtInput)
    if (!n || n < 2 || n > 99) return
    setLinhas(prev => {
      const novas = []
      prev.forEach(l => {
        if (l.deleted || l.isSent) { novas.push(l); return }
        novas.push(l)
        for (let i = 1; i < n; i++) {
          const nl = novaLinha()
          novas.push({
            ...nl,
            produto: l.produto, modelo: l.modelo, cor: l.cor, marca: l.marca,
            tamanho: l.tamanho, preco: l.preco, codigo: l.codigo,
            custo: l.custo, qtde: l.qtde, condicao: l.condicao, genero: l.genero,
          })
        }
      })
      return calcSacolas(novas)
    })
    setHasUnsaved(true)
    setModalQt(false)
  }

  // ── HISTÓRICO: handlers ──────────────────────────────────────
  const buscarHistorico = useCallback(async () => {
    if (busyRef.current || !tenantId) return
    if (!filtrosHist.dataInicio && !filtrosHist.dataFim) {
      showToast('Preencha ao menos uma data para buscar.', 'error'); return
    }
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

  const handleStatusChangeHist = useCallback(async (idx, novoStatus) => {
    const linha = linhasHistRef.current[idx]
    if (!linha?.id) return
    try {
      const { error } = await supabase.from('vendas').update({ status: novoStatus }).eq('id', linha.id)
      if (error) throw error
      setLinhasHist(prev => { const n = [...prev]; n[idx] = { ...n[idx], status: novoStatus }; return n })
      showToast(novoStatus === 'CANCELADO' ? 'Marcado como cancelado.' : 'Status atualizado.', 'success')
    } catch { showToast('Erro ao atualizar status.', 'error') }
  }, [])

  const salvarFilaHist = useCallback(async (idx, f1, f2, f3) => {
    const linha = { ...linhasHistRef.current[idx], fila1: f1, fila2: f2, fila3: f3 }
    setLinhasHist(prev => { const n = [...prev]; n[idx] = linha; return n })
    setModalFilaHistIdx(null)
    try {
      await updateVendaEnviada(tenantId, linha)
    } catch { showToast('Erro ao salvar fila.', 'error') }
  }, [tenantId])

  const trocarClienteFilaHist = useCallback(async (idx, novoCliente) => {
    const linha = { ...linhasHistRef.current[idx], cliente_nome: novoCliente }
    setLinhasHist(prev => { const n = [...prev]; n[idx] = linha; return n })
    try {
      await updateVendaEnviada(tenantId, linha)
      showToast('Cliente alterado!', 'success')
    } catch { showToast('Erro ao salvar.', 'error') }
  }, [tenantId])

  // ── RENDER ──
  // Se tem filtro: mostra busca + linhas que correspondem
  // Se não tem filtro: mostra TODAS as linhas não deletadas/vendidas
  const visivel = filtro.trim()
    ? [...produtosBusca, ...linhas.filter(l => !l.deleted && l.status !== 'Vendido' && passaFiltro(l, filtro))]
    : linhas.filter(l => !l.deleted && l.status !== 'Vendido')
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
              <button className="btn-acao btn-ghost" onClick={() => setShowSettings(true)}
                style={{ minWidth:44, padding:'0 10px' }} title="Configurações de colunas">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
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
                <button className="btn-acao btn-blue" onClick={iniciarFinalizacao} disabled={busy}>Salvar</button>
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
                    <th className="col-status">Status</th>
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
                        onAbrirFila={setModalFilaHistIdx}
                        onEnviar={() => {}}
                        onEstornar={estornarHist}
                        onCopiar={() => {}}
                        onExcluir={excluirHist}
                        onStatusChange={handleStatusChangeHist}
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
                    <th className="col-produto">Produto</th>
                    <th className="col-modelo">Modelo</th>
                    {colsConfig.genero   && <th className="col-genero">Gênero</th>}
                    <th className="col-cor">Cor</th><th>Marca</th>
                    <th className="col-tam">Tam.</th>
                    {colsConfig.condicao && <th className="col-tam">Cond.</th>}
                    {colsConfig.custo    && <th className="col-preco">Custo</th>}
                    <th className="col-preco">Preço</th>
                    <th className="col-cod">Cód.</th>
                    <th className="col-cliente">Cliente</th>
                    <th className="col-acoes">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {visivel.map((l, idx) => {
                    if (l.deleted || l.status === 'Vendido') return null
                    return (
                      <TabelaRow key={l._key || l.id || idx}
                        linha={l} idx={idx} listas={listas}
                        cols={colsConfig}
                        onFieldChange={handleFieldChange}
                        onClienteBlur={handleClienteBlur}
                        onClienteSelect={handleClienteSelect}
                        onIsBlocked={handleIsBlocked}
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
            try {
              await salvarNovoCadastro(tenantId, tipo, val, wpp)
              setListas(await getListas(tenantId))
              showToast('Cadastro realizado!', 'success')
            } catch (err) {
              showToast(err?.message || 'Erro ao cadastrar. Verifique o banco.', 'error')
              throw err
            }
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
      {modalFilaHistIdx !== null && (
        <ModalFila
          linha={linhasHist[modalFilaHistIdx]}
          clientes={listas.clientes}
          onSalvar={(res) => {
            if (res.trocarCliente) {
              trocarClienteFilaHist(modalFilaHistIdx, res.trocarCliente)
              salvarFilaHist(modalFilaHistIdx,
                res.numFila === 1 ? '' : res.fila1,
                res.numFila === 2 ? '' : res.fila2,
                res.numFila === 3 ? '' : res.fila3)
            } else {
              salvarFilaHist(modalFilaHistIdx, res.fila1, res.fila2, res.fila3)
            }
          }}
          onFechar={() => setModalFilaHistIdx(null)}
        />
      )}
      {alerta      && <ModalAlerta      titulo={alerta.titulo}      mensagem={alerta.mensagem}      onFechar={() => setAlerta(null)} />}
      {confirmacao && <ModalConfirmacao titulo={confirmacao.titulo} mensagem={confirmacao.mensagem} onSim={confirmacao.onSim} onNao={confirmacao.onNao} hideConfirm={confirmacao.hideConfirm} />}

      {/* MODAL CONFIGURAÇÕES DE COLUNAS */}
      {showSettings && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:900, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={() => setShowSettings(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background:'#1a2232', border:'1px solid rgba(255,255,255,.12)', borderRadius:12, padding:'24px 28px', width:320, boxShadow:'0 12px 40px rgba(0,0,0,.6)' }}>
            <div style={{ fontSize:16, fontWeight:800, color:'#e6edf3', marginBottom:18 }}>⚙ Colunas Opcionais</div>
            {[
              { key:'custo',    label:'Coluna Custo' },
              { key:'condicao', label:'Coluna Novo / Usado' },
              { key:'genero',   label:'Coluna Masc. / Fem. / Unissex' },
            ].map(({ key, label }) => (
              <label key={key} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 0', borderBottom:'1px solid rgba(255,255,255,.07)', cursor:'pointer', color:'#c9d1d9', fontSize:14 }}>
                <input type="checkbox" checked={!!colsConfig[key]}
                  onChange={e => setColsConfig(p => ({ ...p, [key]: e.target.checked }))}
                  style={{ width:16, height:16, accentColor:'#60a5fa', cursor:'pointer' }} />
                {label}
              </label>
            ))}
            <button onClick={() => setShowSettings(false)}
              style={{ marginTop:18, width:'100%', padding:'9px 0', background:'rgba(255,255,255,.07)', border:'1px solid rgba(255,255,255,.12)', borderRadius:7, color:'#e6edf3', fontWeight:700, fontSize:14, cursor:'pointer' }}>
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* MODAL QT — MULTIPLICAR LINHAS */}
      {modalQt && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:900, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={() => setModalQt(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background:'#1a2232', border:'1px solid rgba(255,255,255,.12)', borderRadius:12, padding:'24px 28px', width:300, boxShadow:'0 12px 40px rgba(0,0,0,.6)' }}>
            <div style={{ fontSize:16, fontWeight:800, color:'#e6edf3', marginBottom:8 }}>QT — Multiplicar Linhas</div>
            <div style={{ fontSize:13, color:'#8b949e', marginBottom:16 }}>
              Cria N cópias de cada linha da tabela (sem cliente, sem enviadas).
            </div>
            <label style={{ fontSize:12, fontWeight:700, color:'#8b949e', textTransform:'uppercase', letterSpacing:'0.4px' }}>Quantidade de cópias</label>
            <input
              type="number" min={2} max={99} value={qtInput}
              onChange={e => setQtInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && multiplicarLinhas()}
              autoFocus
              style={{ width:'100%', marginTop:6, marginBottom:16, background:'linear-gradient(180deg,#111b28,#0f1621)', border:'1px solid rgba(255,255,255,.15)', borderRadius:7, color:'#e6edf3', fontSize:22, fontWeight:800, textAlign:'center', padding:'8px 0', outline:'none' }}
            />
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setModalQt(false)}
                style={{ flex:1, padding:'9px 0', background:'transparent', border:'1px solid rgba(255,255,255,.12)', borderRadius:7, color:'#8b949e', fontWeight:700, fontSize:14, cursor:'pointer' }}>
                Cancelar
              </button>
              <button onClick={multiplicarLinhas}
                style={{ flex:2, padding:'9px 0', background:'#1d6f42', border:'1px solid rgba(34,197,94,.3)', borderRadius:7, color:'#fff', fontWeight:800, fontSize:14, cursor:'pointer' }}>
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </AppShell>
  )
}
