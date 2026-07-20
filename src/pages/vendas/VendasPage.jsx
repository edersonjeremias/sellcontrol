import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  getDadosIniciais, getListas, salvarNovoCadastro,
  getVendas, salvarVendas, estornarVenda,
  finalizarLive, formatMoney,
  getVendasEnviadas, updateVendaEnviada,
  enviarVenda,
  buscarProdutosPorTermos,
} from '../../services/vendasService'
import { getConfig, saveConfig, getVendasPermissoes } from '../../services/configService'
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
// UUID para keys estáveis (performance crítica)
function gerarId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

function novaLinha(codigo = '') {
  return {
    _key: gerarId(), // KEY ÚNICA E ESTÁVEL
    id: null, produto: '', modelo: '', cor: '', marca: '',
    tamanho: '', preco: '', codigo, cliente_nome: '',
    data_live: '', live_nome: '', sacolinha: null,
    status: '', fila1: '', fila2: '', fila3: '',
    custo: '', qtde: '', condicao: '', genero: '',
    isNew: true, deleted: false, isSent: false, liberado: false,
  }
}

function mapRow(row) {
  return {
    _key:         row.id || gerarId(), // KEY ESTÁVEL SEMPRE
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
    isSent: ['ENVIADO', 'VENDIDO'].includes((row.status || '').toUpperCase()),
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

// Removido: não queremos reordenar as linhas automaticamente
// As linhas devem permanecer na posição onde o usuário as criou
function ordenarLinhas(linhas) {
  return linhas // Retorna sem ordenar
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
  const modo = 'live' // Modo fixo (histórico removido)
  const [linhas,      setLinhas]      = useState([])
  const [listas,      setListas]      = useState({ produtos: [], modelos: [], cores: [], marcas: [], clientes: [] })
  const [globalDB,    setGlobalDB]    = useState({ lives: [], bloqueados: {} })
  const [config,      setConfig]      = useState({ codigo_automatico: false, proximo_codigo: 100 })
  const [permissoes,  setPermissoes]  = useState({ pode_editar_enviadas: true })
  const [dataLive,    setDataLive]    = useState(() => {
    const hoje = new Date()
    return hoje.toISOString().split('T')[0] // Formato YYYY-MM-DD
  })
  const [liveNome,    setLiveNome]    = useState('')
  const [statusFiltro, setStatusFiltro] = useState('pendentes') // 'pendentes' | 'enviadas' | 'todas'
  const [busy,        setBusyState]   = useState(false)
  const [busyMsg,     setBusyMsg]     = useState('')
  const [hasUnsaved,  setHasUnsaved]  = useState(false)
  const [filtro,      setFiltro]      = useState('')
  const [tabelaMsg,   setTabelaMsg]   = useState('Iniciando sistema...')
  const [pronto,      setPronto]      = useState(false)
  const [scrollTop,   setScrollTop]   = useState(false)
  const novoProdutoFocus = useRef(false)
  const busyRef = useRef(false)
  const lastRealtimeKeyRef = useRef('')
  const focusReturnRef = useRef(null)  // guarda o input de cliente que disparou o bloqueio
  const skipFilterEffectRef = useRef(false)  // flag para evitar loop ao limpar filtro

  // ── Configurações de colunas ──
  const [colsConfig,    setColsConfig]    = useState({ custo: false, condicao: false, genero: false })
  const [showSettings,  setShowSettings]  = useState(false)
  const [modalQt,       setModalQt]       = useState(false)
  const [qtInput,       setQtInput]       = useState('2')

  // ── Modal state ──
  const [modalEdicaoKey,    setModalEdicaoKey]    = useState(null)
  const [modalFilaKey,      setModalFilaKey]      = useState(null)
  const [showModalCadastro, setShowModalCadastro] = useState(false)
  const [alerta,            setAlerta]            = useState(null)
  const [modalClienteErro,  setModalClienteErro]  = useState(null) // { key, nome }
  const [confirmacao,       setConfirmacao]       = useState(null)

  // ── Modo Histórico ── (REMOVIDO)

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
  const listasRef    = useRef(listas)
  const saveTimerRef = useRef(null)
  // Atualização síncrona durante o render — sem lag de useEffect
  dataLiveRef.current  = dataLive
  liveNomeRef.current  = liveNome
  tenantIdRef.current  = tenantId
  listasRef.current    = listas
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
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
  }, [])

  // ── Próximo código automático ──
  const proximoCodigoRef = useRef(config.proximo_codigo)

  const getProximoCodigo = useCallback(() => {
    if (!config.codigo_automatico) return ''
    const codigo = String(proximoCodigoRef.current)
    proximoCodigoRef.current += 1
    return codigo
  }, [config.codigo_automatico])

  // Salva o proximo_codigo no banco após salvar com sucesso
  const salvarProximoCodigo = useCallback(async () => {
    if (!config.codigo_automatico || !tenantId) return
    try {
      await saveConfig(tenantId, { proximo_codigo: proximoCodigoRef.current })
    } catch (err) {
      console.error('Erro ao salvar proximo_codigo:', err)
    }
  }, [config.codigo_automatico, tenantId])

  // Atualiza ref quando config muda
  useEffect(() => {
    proximoCodigoRef.current = config.proximo_codigo
  }, [config.proximo_codigo])

  // ── Total vendido ──
  const totalInfo = useMemo(() => {
    let total = 0, qtd = 0
    linhas.forEach(l => {
      // Ignora deletados e sem cliente
      if (l.deleted || !l.cliente_nome?.trim() || !passaFiltro(l, filtro)) return
      // Se estiver em modo Pendentes, ignora vendidos
      if (statusFiltro === 'pendentes' && l.status === 'Vendido') return
      qtd++
      const n = parseFloat((l.preco || '').replace(/\./g, '').replace(',', '.'))
      if (!isNaN(n)) total += n
    })
    return { total, qtd }
  }, [linhas, filtro, statusFiltro])

  // ── BUSCA DE PRODUTOS (quando digita no filtro) ──
  useEffect(() => {
    console.log('🔄 useEffect busca ativado. Filtro:', filtro)

    // Se limpar filtro, remove produtos da busca que não foram editados
    if (!filtro.trim()) {
      // Evita executar se a limpeza veio da função buscar()
      if (skipFilterEffectRef.current) {
        console.log('⏭️ Pulando useEffect (flag skipFilterEffect ativa)')
        skipFilterEffectRef.current = false
        return
      }
      console.log('⚪ Filtro vazio, removendo produtos não editados da busca')
      setLinhas(prev => prev.filter(l => {
        // Mantém se NÃO for da busca, OU se foi editado (tem cliente ou outros dados)
        if (!l._fromSearch) return true
        const foiEditado = l.cliente_nome?.trim() || l.produto?.trim() || l.modelo?.trim()
        return foiEditado
      }))
      return
    }

    console.log('⏱️ Iniciando debounce de 300ms...')
    const timer = setTimeout(async () => {
      console.log('🚀 Executando busca após debounce')
      try {
        const resultados = await buscarProdutosPorTermos(tenantId, filtro)
        console.log('📥 Resultados recebidos:', resultados.length)

        // Adiciona resultados no início de linhas com flag _fromSearch
        if (resultados.length > 0) {
          setLinhas(prev => {
            // Remove produtos antigos da busca
            const semBusca = prev.filter(l => !l._fromSearch)
            // Adiciona novos resultados no início
            const novosResultados = resultados.map(r => ({ ...r, _fromSearch: true }))
            return [...novosResultados, ...semBusca]
          })
        }
      } catch (err) {
        console.error('❌ Erro ao buscar produtos:', err)
      }
    }, 300) // Debounce de 300ms

    return () => {
      console.log('🧹 Limpando timer do debounce')
      clearTimeout(timer)
    }
  }, [filtro, tenantId])

  // ── Força statusFiltro para pendentes se não for Master/Admin e não tiver permissão ──
  useEffect(() => {
    const isMasterOuAdmin = profile?.role === 'master' || profile?.role === 'admin'
    if (!isMasterOuAdmin && !permissoes.pode_editar_enviadas && statusFiltro !== 'pendentes') {
      setStatusFiltro('pendentes')
    }
  }, [permissoes.pode_editar_enviadas, profile?.role])

  // ── INIT ──
  useEffect(() => {
    async function init() {
      if (!tenantId) return
      setBusy(true, 'Iniciando...')
      try {
        const [db, lst, cfg, perms] = await Promise.all([
          getDadosIniciais(tenantId),
          getListas(tenantId),
          getConfig(tenantId),
          getVendasPermissoes(profile?.id)
        ])
        setGlobalDB(db)
        setListas(lst)
        setConfig({
          codigo_automatico: cfg?.codigo_automatico || false,
          proximo_codigo: cfg?.proximo_codigo || 100
        })
        setPermissoes(perms)
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

  // ── salvarAgora: salva IMEDIATAMENTE com debounce de 300ms ──
  const salvarAgora = useCallback(() => {
    // Limpa timer anterior
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
    }

    // Debounce de 300ms
    saveTimerRef.current = setTimeout(async () => {
      if (isSavingRef.current || busyRef.current) return

      // Verifica se tem linhas com cliente mas sem live_nome
      const temLinhasComCliente = linhasRef.current.some(l => !l.deleted && l.cliente_nome?.trim())
      if (temLinhasComCliente && !liveNomeRef.current?.trim()) {
        console.warn('⚠️ Salvamento bloqueado: Live não preenchida')
        return
      }

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
        console.log('💾 Salvo automaticamente')

        // Salva o próximo código no banco se modo automático estiver ativo
        salvarProximoCodigo()
      } catch (err) {
        console.error('Erro ao salvar:', err)
        showToast('Erro ao salvar alterações', 'error')
      } finally {
        isSavingRef.current = false
      }
    }, 300)
  }, [showToast])

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

    // Validação: exige data preenchida
    if (!dataLive?.trim()) {
      showToast('Preencha a data antes de buscar.', 'error')
      return
    }

    setBusy(true, 'Buscando dados...')
    setTabelaMsg('Buscando registros...')
    try {
      let rows = []

      // Filtra conforme status selecionado
      if (statusFiltro === 'pendentes') {
        // Busca apenas vendas pendentes (não enviadas)
        rows = await getVendas(tenantId, dataLive || null, liveNome || null, { apenasComCliente: true, somentePendentes: true })
      } else if (statusFiltro === 'enviadas') {
        // Busca apenas vendas finalizadas (enviadas/vendidas)
        const allRows = await getVendas(tenantId, dataLive || null, liveNome || null, { apenasComCliente: true })
        rows = allRows.filter(r => {
          const status = r.status?.toUpperCase() || ''
          return status === 'ENVIADO' || status === 'VENDIDO'
        })
      } else {
        // Busca todas as vendas com cliente
        rows = await getVendas(tenantId, dataLive || null, liveNome || null, { apenasComCliente: true })
      }

      const novas = ordenarLinhas(calcSacolas(rows.map(mapRow)))
      setLinhas(novas)
      skipFilterEffectRef.current = true  // Evita que useEffect execute ao limpar filtro
      setFiltro('') // Limpa filtro
      setHasUnsaved(false)

      if (!novas.length) {
        const msg = statusFiltro === 'pendentes'
          ? 'Nenhuma venda pendente encontrada. Use o campo de busca para encontrar produtos ou clique em + Novo.'
          : statusFiltro === 'enviadas'
          ? 'Nenhuma venda enviada encontrada para os filtros selecionados.'
          : 'Nenhuma venda encontrada.'
        setTabelaMsg(msg)
      }
    } catch { setTabelaMsg('Erro ao buscar dados.'); showToast('Erro ao buscar dados.', 'error') }
    finally { setBusy(false) }
  }, [tenantId, dataLive, liveNome, statusFiltro])

  const novo = useCallback(() => {
    if (busy) return
    setLinhas(prev => {
      const primeira = prev.find(l => !l.deleted)
      if (primeira) {
        const vazia = !primeira.produto && !primeira.modelo && !primeira.cor &&
          !primeira.marca && !primeira.preco && !primeira.cliente_nome
        if (vazia) {
          setTimeout(() => {
            scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
            // Foca no primeiro input (produto) da primeira linha
            const input = document.querySelector('#tabela tbody tr:first-child td:nth-child(2) .cell-input')
            input?.focus()
          }, 50)
          return prev
        }
      }
      novoProdutoFocus.current = true
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
        // Foca no primeiro input (produto) da primeira linha
        const input = document.querySelector('#tabela tbody tr:first-child td:nth-child(2) .cell-input')
        input?.focus()
      }, 50)
      return [novaLinha(getProximoCodigo()), ...prev]
    })
    setPronto(true)
  }, [busy, getProximoCodigo])

  // Cria nova linha ACIMA da linha atual (quando Enter em CLIENTE)
  const novoAcima = useCallback((idx) => {
    if (busy) return
    setLinhas(prev => {
      const novasLinhas = [...prev]
      // Insere nova linha NA POSIÇÃO idx (empurra a linha atual para baixo)
      novasLinhas.splice(idx, 0, novaLinha(getProximoCodigo()))
      return novasLinhas
    })
    setPronto(true)
    salvarAgora()

    // Foca no campo PRODUTO da nova linha criada (posição idx)
    setTimeout(() => {
      const rows = document.querySelectorAll('#tabela tbody tr')
      let visibleIdx = 0
      let targetRow = null

      // Encontra a linha visível correspondente ao índice idx
      for (let i = 0; i < rows.length; i++) {
        if (visibleIdx === idx) {
          targetRow = rows[i]
          break
        }
        visibleIdx++
      }

      if (targetRow) {
        // Calcula qual coluna é PRODUTO considerando colunas opcionais
        let colIdx = 2 // Padrão: SACOLA(1) + PRODUTO(2)
        const input = targetRow.querySelector(`td:nth-child(${colIdx}) .cell-input`)
        input?.focus()
      }
    }, 80)
  }, [busy, salvarAgora])

  // Adiciona nova linha ao FINAL sem scroll — chamado quando usuário dá Enter na última linha
  const novoAbaixo = useCallback(() => {
    const nl = novaLinha(getProximoCodigo())
    setLinhas(prev => [...prev, nl])
    setPronto(true)
    // Foca o primeiro input da nova última linha sem rolar a tela para o topo
    setTimeout(() => {
      const rows = document.querySelectorAll('#tabela tbody tr')
      const lastRow = rows[rows.length - 1]
      const input = lastRow?.querySelector('td:nth-child(2) .cell-input')
      input?.focus()
    }, 80)
    salvarAgora()
  }, [salvarAgora])

  // Chamado ao dar Enter no campo Cliente - verifica linha vazia antes de criar nova
  const handleEnterNoCliente = useCallback(() => {
    if (busy) return

    // Procura por linha vazia (sem produto e sem cliente) começando do topo
    const linhaVazia = linhasRef.current.find(l =>
      !l.deleted &&
      !l.isSent &&
      !l.produto?.trim() &&
      !l.cliente_nome?.trim()
    )

    if (linhaVazia) {
      // Já existe linha vazia - foca no campo PRODUTO dela
      setTimeout(() => {
        const rows = document.querySelectorAll('#tabela tbody tr')
        for (let row of rows) {
          const codigoInput = row.querySelector('.col-cod .cell-input')
          if (codigoInput && codigoInput.value === linhaVazia.codigo) {
            const produtoInput = row.querySelector('.col-produto .cell-input')
            produtoInput?.focus()
            // Scroll suave para a linha
            row.scrollIntoView({ behavior: 'smooth', block: 'center' })
            break
          }
        }
      }, 50)
    } else {
      // Não existe linha vazia - cria nova no topo
      setLinhas(prev => [novaLinha(getProximoCodigo()), ...prev])
      setPronto(true)
      salvarAgora()

      // Foca no campo PRODUTO da primeira linha (nova linha criada)
      setTimeout(() => {
        const firstRow = document.querySelector('#tabela tbody tr:first-child')
        const produtoInput = firstRow?.querySelector('.col-produto .cell-input')
        produtoInput?.focus()
      }, 50)
    }
  }, [busy, salvarAgora])

  // Adiciona produto da busca às vendas
  const adicionarProdutoBusca = useCallback((produto) => {
    // Remove da lista de busca e adiciona às linhas
    setProdutosBusca(prev => prev.filter(p => p._key !== produto._key))
    setLinhas(prev => [{ ...produto, _key: `new-${Date.now()}-${Math.random()}`, _isBuscaResult: false }, ...prev])
    setHasUnsaved(true)
    salvarAgora()
  }, [salvarAgora])

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
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [pronto, tenantId])

  // ── LISTENER REALTIME COBRANÇAS (atualiza bloqueios em tempo real) ──
  useEffect(() => {
    if (!pronto || !tenantId) return

    const atualizarBloqueados = async () => {
      try {
        const db = await getDadosIniciais(tenantId)
        globalDBRef.current = db
        setGlobalDB(db)
      } catch (err) {
        console.error('Erro ao atualizar bloqueios:', err)
      }
    }

    const channelCob = supabase
      .channel(`cobrancas-live-${tenantId}`)
      // Escuta INSERT (nova cobrança criada = novo bloqueio)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'cobrancas',
          filter: `tenant_id=eq.${tenantId}`,
        },
        async (payload) => {
          const status = payload.new?.status?.toUpperCase()
          const statusBloqueio = ['PENDENTE', 'ENVIADO', 'REENVIADO', 'LEMBRETE']

          if (statusBloqueio.includes(status)) {
            await atualizarBloqueados()
            showToast('⚠️ Nova cobrança pendente. Cliente bloqueado.', 'warning')
          }
        }
      )
      // Escuta UPDATE (mudança de status)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'cobrancas',
          filter: `tenant_id=eq.${tenantId}`,
        },
        async (payload) => {
          const statusNovo = payload.new?.status?.toUpperCase()
          const statusAntigo = payload.old?.status?.toUpperCase()

          if (statusNovo === statusAntigo) return

          const statusLiberado = ['PAGO', 'BAIXADO', 'CANCELADO']
          const statusBloqueio = ['PENDENTE', 'ENVIADO', 'REENVIADO', 'LEMBRETE']

          if (statusLiberado.includes(statusNovo)) {
            await atualizarBloqueados()
            showToast('✅ Pagamento confirmado! Cliente liberado.', 'success')
          } else if (statusBloqueio.includes(statusNovo)) {
            await atualizarBloqueados()
            showToast('⚠️ Cliente bloqueado por pendência.', 'warning')
          }
        }
      )
      // Escuta DELETE (cobrança deletada = pode liberar)
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'cobrancas',
          filter: `tenant_id=eq.${tenantId}`,
        },
        async () => {
          await atualizarBloqueados()
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channelCob) }
  }, [pronto, tenantId])

  // ── UPDATE DE CAMPO ──
  const handleFieldChange = useCallback((key, field, value) => {
    // Usa _key para identificar a linha (não depende de índice visual)
    setLinhas(prev => {
      const idx = prev.findIndex(l => l._key === key)
      if (idx === -1) return prev

      const n = [...prev]
      const l = { ...n[idx], [field]: value }
      if (field === 'cliente_nome') { l.liberado = false; l.sacolinha = null; n[idx] = l; return calcSacolas(n) }
      if (field === 'preco') l.preco = value.replace(/[^\d,]/g, '')
      n[idx] = l
      return n
    })

    // NÃO salva enquanto está digitando cliente (salva no onBlur)
    if (field !== 'cliente_nome') {
      salvarAgora()
    }
  }, [salvarAgora])

  // ── CHECK BLOQUEIO (chamado no onBlur do campo cliente) ──
  function showBloqueioModal(key, nomeExibido, inputEl) {
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
        setLinhas(prev => calcSacolas(prev.map(l => l._key === key ? {...l, cliente_nome:'', sacolinha:null, liberado:false} : l)))
        setConfirmacao(null)
        const el = focusReturnRef.current
        if (el) setTimeout(() => { el.focus(); focusReturnRef.current = null }, 50)
      },
    })
  }

  const handleClienteBlur = useCallback((key) => {
    console.log('🔍 handleClienteBlur chamado para key:', key)

    const l = linhasRef.current.find(linha => linha._key === key)
    console.log('📋 Linha encontrada:', l)

    if (!l || l.liberado) {
      console.log('⚠️ Linha não encontrada ou já liberada')
      return
    }

    const nome = (l.cliente_nome || '').trim()
    console.log('👤 Nome do cliente:', nome)

    // Salva o que foi digitado (já que não salvou durante a digitação)
    salvarAgora()

    if (!nome) {
      console.log('⚠️ Nome vazio, ignorando validação')
      return
    }

    // Verifica se lista de clientes está carregada
    if (!listasRef.current || !listasRef.current.clientes) {
      console.error('❌ listasRef.current.clientes não está carregado!')
      console.log('listasRef.current:', listasRef.current)
      showToast('Erro: lista de clientes não carregada. Recarregue a página.', 'error')
      return
    }

    // Valida se o cliente está cadastrado (com trim para evitar espaços)
    const clienteExiste = listasRef.current.clientes.some(c =>
      c.trim().toLowerCase() === nome.toLowerCase()
    )

    console.log('✅ Cliente existe?', clienteExiste)
    console.log('📚 Total de clientes na lista:', listasRef.current.clientes.length)
    console.log('📚 Lista de clientes:', listasRef.current.clientes)
    console.log('🔍 Procurando por:', nome)

    // Log detalhado para debug
    if (!clienteExiste) {
      const similares = listasRef.current.clientes.filter(c =>
        c.toLowerCase().includes(nome.toLowerCase()) ||
        nome.toLowerCase().includes(c.toLowerCase())
      )
      if (similares.length > 0) {
        console.log('⚠️ Clientes similares encontrados:', similares)
      }
    }

    if (!clienteExiste) {
      console.log('❌ Cliente NÃO cadastrado - abrindo popup')
      // Cliente não cadastrado - mostra popup
      setModalClienteErro({ key, nome })
      return
    }

    console.log('✓ Cliente válido, verificando bloqueio')
    showBloqueioModal(key, nome)
  }, [salvarAgora])

  const confirmarClienteErro = useCallback(() => {
    if (!modalClienteErro) return

    // Limpa o campo do cliente
    setLinhas(prev => calcSacolas(prev.map(linha =>
      linha._key === modalClienteErro.key
        ? {...linha, cliente_nome: '', sacolinha: null, liberado: false}
        : linha
    )))

    setModalClienteErro(null)
  }, [modalClienteErro])

  // Sem useCallback para garantir closure sempre atualizada
  function handleClienteSelect(key, nome, inputEl) {
    const l = linhasRef.current.find(linha => linha._key === key)
    if (l?.liberado) return
    showBloqueioModal(key, nome, inputEl)
  }

  function handleIsBlocked(nome) {
    return !!globalDBRef.current.bloqueados[(nome || '').trim().toLowerCase()]
  }

  // ── FILA ──
  const salvarFila = useCallback((key, f1, f2, f3) => {
    setLinhas(prev => prev.map(l => l._key === key ? {...l, fila1:f1, fila2:f2, fila3:f3} : l))
    salvarAgora(); setModalFilaKey(null)
  }, [salvarAgora])

  const trocarClienteFila = useCallback((key, novoCliente) => {
    setLinhas(prev => {
      return calcSacolas(prev.map(l => l._key === key ? {...l, cliente_nome:novoCliente, liberado:false, sacolinha:null} : l))
    })
    salvarAgora()
  }, [salvarAgora])

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
    const novoCodigo = config.codigo_automatico ? getProximoCodigo() : o.codigo
    const copia = { ...novaLinha(novoCodigo), produto: o.produto, modelo: o.modelo, cor: o.cor, marca: o.marca, tamanho: o.tamanho, preco: o.preco }
    setLinhas(prev => {
      const idx = prev.findIndex(r => r._key === rowKey)
      if (idx < 0) return [...prev, copia]
      const next = [...prev]
      next.splice(idx + 1, 0, copia)
      return next
    })
    salvarAgora()
  }, [salvarAgora])

  const handleExcluir = useCallback((rowKey) => {
    setConfirmacao({
      titulo: '🗑️ Excluir Linha',
      mensagem: 'Deseja realmente EXCLUIR esta linha?',
      onSim: () => {
        setConfirmacao(null)
        setLinhas(prev => calcSacolas(prev.map(r => r._key === rowKey ? { ...r, deleted: true, cliente_nome: '', sacolinha: null } : r)))
        salvarAgora()
      },
      onNao: () => setConfirmacao(null),
    })
  }, [salvarAgora])

  // ── MODAL EDIÇÃO ──
  const salvarDiretoDoModal = useCallback(async (key, campos) => {
    const linha = linhas.find(l => l._key === key)
    if (!linha || !linha.id) {
      showToast('Linha não encontrada ou sem ID', 'error')
      return
    }

    setBusy(true, 'Salvando...')
    try {
      // Atualiza no banco
      await updateVendaEnviada(tenantId, {
        ...linha,
        ...campos,
        sacolinha: campos.sacola,
        data_live: campos.data_live,
        live_nome: campos.live_nome
      })

      // Atualiza na interface
      setLinhas(prev => prev.map(l => {
        if (l._key !== key) return l
        return {
          ...l,
          ...campos,
          sacolinha: campos.sacola,
          data_live: campos.data_live,
          live_nome: campos.live_nome
        }
      }))

      setModalEdicaoKey(null)
      showToast('Venda salva com sucesso!', 'success')
    } catch (err) {
      showToast('Erro ao salvar: ' + err.message, 'error')
    } finally {
      setBusy(false)
    }
  }, [linhas, tenantId])

  const confirmarEdicao = useCallback((key, campos) => {
    setLinhas(prev => {
      return calcSacolas(prev.map(l => {
        if (l._key !== key) return l
        const clienteMudou = l.cliente_nome !== campos.cliente_nome
        return {
          ...l,
          ...campos,
          liberado: clienteMudou ? false : campos.liberado,
          sacolinha: clienteMudou ? null : l.sacolinha
        }
      }))
    })
    salvarAgora(); setModalEdicaoKey(null)
  }, [salvarAgora])

  // ── FINALIZAR LIVE ──
  const iniciarFinalizacao = useCallback(async () => {
    if (busy) return

    // Valida se Live está preenchida (obrigatório)
    if (!liveNome?.trim()) {
      showToast('Preencha o campo Live antes de salvar.', 'error')
      return
    }

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
          const novoCodigo = config.codigo_automatico ? getProximoCodigo() : l.codigo
          const nl = novaLinha(novoCodigo)
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

  // ── HISTÓRICO: código completamente removido ──

  // ── RENDER ──
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
            {/* Filtro Status - sempre aparece para Master/Admin, ou se tiver permissão */}
            {(profile?.role === 'master' || profile?.role === 'admin' || permissoes.pode_editar_enviadas) && (
              <div className="field">
                <label>Status</label>
                <select value={statusFiltro} onChange={e => setStatusFiltro(e.target.value)}
                  style={{ width: '100%', height: 40, padding: '0 12px', borderRadius: 6, border: '1px solid var(--input-border)',
                           background: 'var(--input-bg)', color: 'var(--input-text)', fontSize: 14, cursor: 'pointer' }}>
                  <option value="pendentes">Pendentes</option>
                  <option value="enviadas">Enviadas</option>
                  <option value="todas">Todas</option>
                </select>
              </div>
            )}
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

      {/* TABELA — MODO LIVE */}
      {modo === 'live' && (
        <div id="tabela-container">
          <div className="table-responsive" ref={scrollRef}
            onScroll={e => setScrollTop(e.target.scrollTop > 150)}>
            {!pronto || linhas.filter(l => {
              if (l.deleted || !passaFiltro(l, filtro)) return false
              if (statusFiltro === 'pendentes' && l.status === 'Vendido') return false
              return true
            }).length === 0 ? (
              <div id="tabela-msg">{tabelaMsg}</div>
            ) : null}
            {pronto && linhas.filter(l => {
              if (l.deleted || !passaFiltro(l, filtro)) return false
              if (statusFiltro === 'pendentes' && l.status === 'Vendido') return false
              return true
            }).length > 0 && (
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
                  {linhas.map((l, idx) => {
                    // Filtra deletados e pelo filtro de busca
                    if (l.deleted || !passaFiltro(l, filtro)) return null
                    // Se estiver em modo Pendentes, não mostra vendidos
                    if (statusFiltro === 'pendentes' && l.status === 'Vendido') return null
                    return (
                      <TabelaRow key={l._key}
                        linha={l} listas={listas}
                        cols={colsConfig}
                        config={config}
                        podeEditarEnviadas={permissoes.pode_editar_enviadas}
                        podeEstornar={permissoes.pode_estornar}
                        onFieldChange={handleFieldChange}
                        onClienteBlur={handleClienteBlur}
                        onClienteSelect={handleClienteSelect}
                        onIsBlocked={handleIsBlocked}
                        onEnterNoCliente={handleEnterNoCliente}
                        onAbrirModal={() => setModalEdicaoKey(l._key)}
                        onAbrirFila={() => setModalFilaKey(l._key)}
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
      {modalFilaKey !== null && (
        <ModalFila
          linha={linhas.find(l => l._key === modalFilaKey)}
          clientes={listas.clientes}
          onSalvar={(res) => {
            if (res.trocarCliente) {
              trocarClienteFila(modalFilaKey, res.trocarCliente)
              salvarFila(modalFilaKey,
                res.numFila === 1 ? '' : res.fila1,
                res.numFila === 2 ? '' : res.fila2,
                res.numFila === 3 ? '' : res.fila3)
            } else {
              salvarFila(modalFilaKey, res.fila1, res.fila2, res.fila3)
            }
          }}
          onFechar={() => setModalFilaKey(null)}
        />
      )}
      {modalEdicaoKey !== null && (() => {
        const linhaModal = linhas.find(l => l._key === modalEdicaoKey)
        const podeSalvarDireto = linhaModal?.isSent && permissoes.pode_editar_enviadas
        return (
          <ModalEdicao
            linha={linhaModal}
            listas={listas}
            onConfirmar={(campos) => confirmarEdicao(modalEdicaoKey, campos)}
            onFechar={() => setModalEdicaoKey(null)}
            podeSalvarDireto={podeSalvarDireto}
            onSalvarDireto={(campos) => salvarDiretoDoModal(modalEdicaoKey, campos)}
          />
        )
      })()}
      {showModalCadastro && (
        <ModalCadastro
          onSalvar={async (tipo, val, wpp) => {
            try {
              console.log('💾 Salvando novo cadastro:', { tipo, val, wpp })
              await salvarNovoCadastro(tenantId, tipo, val, wpp)

              console.log('🔄 Recarregando lista de clientes...')
              const novasListas = await getListas(tenantId)
              setListas(novasListas)

              console.log('✅ Lista atualizada. Total de clientes:', novasListas.clientes.length)
              console.log('✅ Cliente recém-cadastrado na lista?', novasListas.clientes.includes(val))

              showToast('Cadastro realizado! Lista atualizada.', 'success')
              setShowModalCadastro(false) // Fecha modal automaticamente
            } catch (err) {
              showToast(err?.message || 'Erro ao cadastrar. Verifique o banco.', 'error')
              throw err
            }
          }}
          onFechar={() => setShowModalCadastro(false)}
        />
      )}
      {alerta      && <ModalAlerta      titulo={alerta.titulo}      mensagem={alerta.mensagem}      onFechar={() => setAlerta(null)} />}
      {confirmacao && <ModalConfirmacao titulo={confirmacao.titulo} mensagem={confirmacao.mensagem} onSim={confirmacao.onSim} onNao={confirmacao.onNao} hideConfirm={confirmacao.hideConfirm} />}

      {/* MODAL ERRO CLIENTE NÃO CADASTRADO */}
      {modalClienteErro && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: 12, padding: 24, maxWidth: 400, width: '90%', border: '1px solid var(--border)' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18, color: 'var(--red)' }}>❌ Cliente Não Cadastrado</h3>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--text-body)', lineHeight: 1.5 }}>
              O cliente <strong>"{modalClienteErro.nome}"</strong> não está cadastrado no sistema.
              <br /><br />
              Use o botão <strong>+Cadastro</strong> para adicionar este cliente.
            </p>
            <button
              onClick={confirmarClienteErro}
              style={{
                width: '100%',
                padding: '12px 24px',
                background: 'var(--blue)',
                border: 'none',
                borderRadius: 8,
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* MODAL CONFIGURAÇÕES DE COLUNAS */}
      {showSettings && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}
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
