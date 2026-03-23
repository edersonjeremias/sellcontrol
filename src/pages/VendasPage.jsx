import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  getDadosIniciais, getListas, salvarNovoCadastro,
  getVendas, salvarVendas, enviarVenda, estornarVenda,
  finalizarLive, formatMoney,
} from '../services/vendasService'
import { useApp } from '../context/AppContext'
import TabelaRow      from '../components/vendas/TabelaRow'
import ModalEdicao    from '../components/vendas/ModalEdicao'
import ModalFila      from '../components/vendas/ModalFila'
import ModalCadastro  from '../components/vendas/ModalCadastro'
import AutocompleteInput  from '../components/ui/AutocompleteInput'
import ModalAlerta        from '../components/ui/ModalAlerta'
import ModalConfirmacao   from '../components/ui/ModalConfirmacao'

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

  // ── Modal state ──
  const [modalEdicaoIdx,    setModalEdicaoIdx]    = useState(null)
  const [modalFilaIdx,      setModalFilaIdx]      = useState(null)
  const [showModalCadastro, setShowModalCadastro] = useState(false)
  const [alerta,            setAlerta]            = useState(null)
  const [confirmacao,       setConfirmacao]       = useState(null)

  // ── Refs ──
  const scrollRef   = useRef(null)
  const linhasRef   = useRef(linhas)
  const globalDBRef = useRef(globalDB)
  useEffect(() => { linhasRef.current = linhas },     [linhas])
  useEffect(() => { globalDBRef.current = globalDB }, [globalDB])

  // ── setBusy helper ──
  const setBusy = useCallback((v, msg = '') => { setBusyState(v); setBusyMsg(msg) }, [])

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
      setBusy(true, 'Iniciando...')
      try {
        const [db, lst] = await Promise.all([getDadosIniciais(), getListas()])
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
  }, [])

  // ── Autosave a cada 60s ──
  useEffect(() => {
    const id = setInterval(async () => {
      if (!hasUnsaved || busy) return
      try {
        await salvarVendas(linhasRef.current, { data_live: dataLive, live_nome: liveNome })
        setHasUnsaved(false)
        showToast('✅ Salvo automaticamente', 'info')
      } catch {}
    }, 60000)
    return () => clearInterval(id)
  }, [hasUnsaved, busy, dataLive, liveNome])

  // ── AÇÕES PRINCIPAIS ──
  const atualizarDados = useCallback(async () => {
    if (busy) return
    setBusy(true, 'Sincronizando...')
    try {
      const [db, lst] = await Promise.all([getDadosIniciais(), getListas()])
      setGlobalDB(db); setListas(lst)
      showToast('Sincronização concluída!', 'success')
    } catch { showToast('Erro ao sincronizar.', 'error') }
    finally { setBusy(false) }
  }, [busy])

  const buscar = useCallback(async () => {
    if (busy) return
    setBusy(true, 'Buscando dados...')
    setTabelaMsg('Buscando registros...')
    try {
      const rows = await getVendas(dataLive || null, liveNome.trim() || null)
      const novas = calcSacolas(rows.map(mapRow))
      setLinhas(novas)
      setHasUnsaved(false)
      if (!novas.length) setTabelaMsg('Nenhum registro pendente encontrado.')
    } catch { setTabelaMsg('Erro ao buscar dados.'); showToast('Erro ao buscar dados.', 'error') }
    finally { setBusy(false) }
  }, [busy, dataLive, liveNome])

  const novo = useCallback(() => {
    if (busy) return
    const primeira = linhasRef.current.find(l => !l.deleted)
    if (primeira) {
      const vazia = !primeira.produto && !primeira.modelo && !primeira.cor &&
        !primeira.marca && !primeira.preco && !primeira.cliente_nome
      if (vazia) { scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); return }
    }
    const nl = novaLinha()
    setLinhas(prev => [nl, ...prev])
    setPronto(true)
    setHasUnsaved(true)
    setTimeout(() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }), 50)
  }, [busy])

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
      const res = await enviarVenda(l, dataLive, liveNome)
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
  const iniciarFinalizacao = useCallback(() => {
    if (busy) return
    if (!dataLive || !liveNome.trim()) {
      setAlerta({ titulo: 'Dados Faltando', mensagem: 'Preencha a <b>Data</b> e a <b>Live</b> antes de salvar.' }); return
    }
    const semPreco = linhasRef.current.some(l => {
      if (l.deleted || l.isSent || !l.cliente_nome?.trim()) return false
      const p = (l.preco||'').replace(/\./g,'').replace(',','.')
      return !p || parseFloat(p) === 0
    })
    if (semPreco) {
      setAlerta({ titulo: 'Preço Ausente', mensagem: 'Há itens com cliente mas <b>sem preço</b>. Corrija antes de salvar.' }); return
    }
    setConfirmacao({
      titulo: 'Finalizar a Live?',
      mensagem: 'Todos os itens com cliente serão confirmados no banco.<br><br>Deseja continuar?',
      onSim: async () => {
        setConfirmacao(null); setBusy(true, 'Finalizando live...')
        try {
          const res = await finalizarLive(linhasRef.current, dataLive, liveNome)
          showToast(`✅ ${res.movidos} vendas confirmadas!`, 'success')
          setHasUnsaved(false); await buscar()
        } catch { setAlerta({ titulo: 'Erro', mensagem: 'Erro ao finalizar a live. Tente novamente.' }) }
        finally { setBusy(false) }
      },
      onNao: () => setConfirmacao(null),
    })
  }, [busy, dataLive, liveNome, buscar])

  // ── RENDER ──
  const visivel = linhas.filter(l => !l.deleted && passaFiltro(l, filtro))
  const totalFmt = totalInfo.total.toLocaleString('pt-BR', { style:'currency', currency:'BRL' })

  return (
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

      {/* TOOLBAR */}
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

      {/* TABELA */}
      <div id="tabela-container">
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

      {/* MODAIS */}
      {modalFilaIdx !== null && (
        <ModalFila linha={linhas[modalFilaIdx]} idx={modalFilaIdx} listas={listas}
          onSalvar={salvarFila} onTrocarCliente={trocarClienteFila}
          onFechar={() => setModalFilaIdx(null)} />
      )}
      {modalEdicaoIdx !== null && (
        <ModalEdicao linha={linhas[modalEdicaoIdx]} idx={modalEdicaoIdx}
          listas={listas} globalDB={globalDB}
          onConfirmar={confirmarEdicao} onFechar={() => setModalEdicaoIdx(null)}
          setAlerta={setAlerta} setConfirmacao={setConfirmacao} />
      )}
      {showModalCadastro && (
        <ModalCadastro
          onSalvar={async (tipo, val, wpp) => { await salvarNovoCadastro(tipo, val, wpp); setListas(await getListas()) }}
          onFechar={() => setShowModalCadastro(false)} showToast={showToast} />
      )}
      {alerta      && <ModalAlerta      titulo={alerta.titulo}      mensagem={alerta.mensagem}      onFechar={() => setAlerta(null)} />}
      {confirmacao && <ModalConfirmacao titulo={confirmacao.titulo} mensagem={confirmacao.mensagem} onSim={confirmacao.onSim} onNao={confirmacao.onNao} />}
    </div>
  )
}
