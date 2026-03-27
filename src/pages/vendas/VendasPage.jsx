import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useApp } from '../../context/AppContext'
import { useToast, ToastContainer } from '../../components/ui/Toast'
import TopLoader from '../../components/ui/TopLoader'
import LinhaVenda from '../../components/vendas/LinhaVenda'
import ModalEdicao from '../../components/vendas/ModalEdicao'
import ModalFila from '../../components/vendas/ModalFila'
import ModalCadastro from '../../components/vendas/ModalCadastro'
import { ModalAlerta, ModalConfirmacao } from '../../components/vendas/Modais'
import AutocompleteInput from '../../components/vendas/AutocompleteInput'
import {
  getVendas, salvarVendas, enviarVendaIndividual,
  estornarVenda, finalizarLive, salvarNovoCadastro,
} from '../../services/vendasService'

// ── Utilitário: calcula sacolinha por cliente ─────────────────
function calcularSacolas(linhas) {
  const idsEmUso     = new Set()
  const clienteParaSacola = {}

  linhas.forEach(l => {
    if (l.isDeleted) return
    const c = l.cliente_nome.trim().toLowerCase()
    const s = l.sacolinha
    if (c && s && !isNaN(s)) {
      idsEmUso.add(Number(s))
      if (!clienteParaSacola[c]) clienteParaSacola[c] = Number(s)
    }
  })

  return linhas.map(l => {
    if (l.isDeleted) return l
    const c = l.cliente_nome.trim().toLowerCase()
    if (!c) return { ...l, sacolinha: null }
    if (clienteParaSacola[c]) return { ...l, sacolinha: clienteParaSacola[c] }
    let n = 1
    while (idsEmUso.has(n)) n++
    idsEmUso.add(n)
    clienteParaSacola[c] = n
    return { ...l, sacolinha: n }
  })
}

// ── Linha em branco ───────────────────────────────────────────
function novaLinha() {
  return {
    id: null, produto: '', modelo: '', cor: '', marca: '', tamanho: '',
    preco: '', codigo: '', cliente_nome: '', sacolinha: null,
    status: '', fila1: '', fila2: '', fila3: '',
    isNew: true, isDeleted: false, isSent: false, liberado: false,
  }
}

export default function VendasPage() {
  const { tenantId, lives, bloqueados, listas, carregarDados, recarregarListas } = useApp()
  const { toasts, addToast } = useToast()

  const [linhas,          setLinhas]          = useState([])
  const [busy,            setBusy]            = useState(false)
  const [busyMsg,         setBusyMsg]         = useState('')
  const [dataInput,       setDataInput]       = useState('')
  const [liveNome,        setLiveNome]        = useState('')
  const [filtroRapido,    setFiltroRapido]    = useState('')
  const [hasChanges,      setHasChanges]      = useState(false)
  const [tabelaVisivel,   setTabelaVisivel]   = useState(false)
  const [tabelaMsg,       setTabelaMsg]       = useState('Iniciando sistema...')

  // Modais
  const [modalEdicao,   setModalEdicao]   = useState(null)   // índice da linha
  const [modalFila,     setModalFila]     = useState(null)   // índice da linha
  const [modalCadastro, setModalCadastro] = useState(false)
  const [alerta,        setAlerta]        = useState(null)   // { titulo, mensagem }
  const [confirmacao,   setConfirmacao]   = useState(null)   // { titulo, mensagem, onSim, onNao }

  const scrollRef = useRef(null)

  // ── Inicialização ─────────────────────────────────────────
  useEffect(() => {
    setBusy(true); setBusyMsg('Iniciando...')
    carregarDados()
      .then(() => { setBusy(false); setTabelaMsg('Use Buscar para carregar as vendas.') })
      .catch(() => { setBusy(false); addToast('Erro ao iniciar', 'error') })
  }, [])

  // Autosave a cada 60 segundos
  useEffect(() => {
    const timer = setInterval(() => {
      if (hasChanges && !busy && linhas.length > 0) salvar(true)
    }, 60_000)
    return () => clearInterval(timer)
  }, [hasChanges, busy, linhas])

  // ── Helpers de estado ─────────────────────────────────────
  function atualizarLinha(idx, campos) {
    setLinhas(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], ...campos }
      return next
    })
    setHasChanges(true)
  }

  function recalcular(linhasBase) {
    const calculadas = calcularSacolas(linhasBase)
    setLinhas(calculadas)
    return calculadas
  }

  // ── Bloqueio de cliente ───────────────────────────────────
  function verificarBloqueio(clienteNome, liberado, onLiberar, onCancelar) {
    if (liberado) return false
    const key  = clienteNome.trim().toLowerCase()
    const info = bloqueados[key]
    if (!key || !info) return false

    let msg = `O cliente <b style="color:var(--red)">${clienteNome}</b> está BLOQUEADO.<br><br>`
    if (info.manual)
      msg += `<b>Bloqueio Manual:</b> ${info.msgManual || 'Sem motivo especificado.'}<br><br>`
    if (info.dividas?.length > 0) {
      msg += `<b>Pendências Financeiras:</b><br>`
      info.dividas.forEach(d => { msg += `- Live ${d.data} — R$ ${d.valor}<br>` })
      msg += '<br>'
    }
    msg += 'Deseja liberar a venda mesmo assim?'

    setConfirmacao({
      titulo: '🚫 Cliente Bloqueado',
      mensagem: msg,
      onSim: () => { setConfirmacao(null); onLiberar?.() },
      onNao: () => { setConfirmacao(null); onCancelar?.() },
    })
    return true
  }

  // ── Total vendido ─────────────────────────────────────────
  const totalVendido = useMemo(() => {
    let total = 0; let qtd = 0
    linhas.forEach(l => {
      if (l.isDeleted || l.status === 'ENVIADO' && false) return
      if (!l.cliente_nome.trim()) return
      qtd++
      if (l.preco) {
        const n = parseFloat(l.preco.replace(/\./g, '').replace(',', '.'))
        if (!isNaN(n)) total += n
      }
    })
    return { total, qtd }
  }, [linhas])

  // ── Filtro rápido ─────────────────────────────────────────
  const linhasFiltradas = useMemo(() => {
    if (!filtroRapido.trim()) return linhas
    const termos = filtroRapido.toLowerCase().split(',').map(t => t.trim()).filter(Boolean)
    return linhas.map(l => {
      if (l.isDeleted) return { ...l, _oculto: false }
      const texto = [l.produto, l.modelo, l.cor, l.marca, l.tamanho, l.codigo, l.cliente_nome]
        .join(' ').toLowerCase()
      return { ...l, _oculto: !termos.every(t => texto.includes(t)) }
    })
  }, [linhas, filtroRapido])

  // ── Buscar ────────────────────────────────────────────────
  async function buscar() {
    if (busy) return
    setBusy(true); setBusyMsg('Buscando dados...')
    setTabelaVisivel(false); setTabelaMsg('Buscando registros...')
    try {
      const dados = await getVendas(tenantId, dataInput || null, liveNome || null)
      if (dados.length === 0) {
        setTabelaMsg('Nenhum registro encontrado. Use + Novo para começar.')
      } else {
        setTabelaVisivel(true)
      }
      setLinhas(dados)
      setHasChanges(false)
    } catch (e) {
      setTabelaMsg('Erro ao buscar dados.')
      addToast('Erro ao buscar dados', 'error')
    } finally { setBusy(false) }
  }

  // ── Novo ──────────────────────────────────────────────────
  function novo() {
    if (busy) return
    // Não cria se a primeira linha já estiver vazia
    const primeira = linhas.find(l => !l.isDeleted)
    if (primeira) {
      const vazia = !primeira.produto && !primeira.modelo && !primeira.cliente_nome && !primeira.codigo
      if (vazia) { scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); return }
    }
    setLinhas(prev => [novaLinha(), ...prev])
    setTabelaVisivel(true)
    setHasChanges(true)
    setTimeout(() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }), 50)
  }

  // ── Salvar (autosave ou manual) ───────────────────────────
  async function salvar(silencioso = false) {
    if (busy || linhas.length === 0) return
    if (!silencioso) { setBusy(true); setBusyMsg('Salvando...') }
    try {
      const { novosIds } = await salvarVendas(tenantId, linhas, dataInput || null, liveNome || null)
      // Atualiza IDs das linhas novas
      if (novosIds.length > 0) {
        setLinhas(prev => {
          const next = [...prev]
          let ni = 0
          next.forEach((l, i) => { if (!l.id && !l.isDeleted && ni < novosIds.length) { next[i] = { ...l, id: novosIds[ni++].id, isNew: false } } })
          return next
        })
      }
      setHasChanges(false)
      if (silencioso) addToast('✅ Salvo na tela', 'info')
      else addToast('Salvo com sucesso!', 'success')
    } catch (e) {
      addToast('Erro ao salvar: ' + e.message, 'error')
    } finally { if (!silencioso) setBusy(false) }
  }

  // ── Enviar linha individual ───────────────────────────────
  async function enviarLinha(idx) {
    const l = linhas[idx]
    if (l.isSent) { addToast('Esta venda já foi enviada!', 'info'); return }
    if (!dataInput || !liveNome.trim()) {
      setAlerta({ titulo: 'Faltam Dados', mensagem: 'Preencha a <b>Data</b> e a <b>Live</b> antes de enviar.' })
      return
    }
    if (!l.cliente_nome.trim()) {
      setAlerta({ titulo: 'Cliente Vazio', mensagem: 'Esta linha precisa de um <b>Cliente</b>.' })
      return
    }
    if (!l.preco || l.preco === '0' || l.preco === '0,00') {
      setAlerta({ titulo: 'Preço Ausente', mensagem: 'Preencha o <b>Preço</b> antes de enviar.' })
      return
    }
    setBusy(true); setBusyMsg('Enviando...')
    try {
      const res = await enviarVendaIndividual(tenantId, l, dataInput, liveNome)
      setLinhas(prev => {
        const next = [...prev]
        next[idx] = { ...next[idx], status: 'ENVIADO', isSent: true, ...(res.newId ? { id: res.newId } : {}) }
        return next
      })
      setHasChanges(true)
      addToast('✅ Venda enviada!', 'success')
    } catch (e) { addToast('Erro ao enviar: ' + e.message, 'error') }
    finally { setBusy(false) }
  }

  // ── Estornar linha ────────────────────────────────────────
  function estornarLinha(idx) {
    setConfirmacao({
      titulo: '↩️ Estornar Venda',
      mensagem: 'Deseja ESTORNAR esta venda?<br><br>Ela voltará para edição.',
      onSim: async () => {
        setConfirmacao(null)
        setBusy(true); setBusyMsg('Estornando...')
        try {
          await estornarVenda(linhas[idx].id)
          setLinhas(prev => {
            const next = [...prev]
            next[idx] = { ...next[idx], status: '', isSent: false }
            return next
          })
          addToast('Venda estornada!', 'success')
        } catch (e) { addToast('Erro ao estornar', 'error') }
        finally { setBusy(false) }
      },
      onNao: () => setConfirmacao(null),
    })
  }

  // ── Excluir linha ─────────────────────────────────────────
  function excluirLinha(idx) {
    setConfirmacao({
      titulo: '🗑️ Excluir Linha',
      mensagem: 'Deseja realmente EXCLUIR esta linha?',
      onSim: () => {
        setConfirmacao(null)
        setLinhas(prev => {
          const next = [...prev]
          next[idx] = { ...next[idx], isDeleted: true }
          return recalcular(next)
        })
        setHasChanges(true)
      },
      onNao: () => setConfirmacao(null),
    })
  }

  // ── Copiar linha ──────────────────────────────────────────
  function copiarLinha(idx) {
    const orig = linhas[idx]
    const copia = {
      ...novaLinha(),
      produto: orig.produto, modelo: orig.modelo, cor: orig.cor,
      marca: orig.marca, tamanho: orig.tamanho, preco: orig.preco,
      codigo: orig.codigo,
    }
    setLinhas(prev => [copia, ...prev])
    setHasChanges(true)
  }

  // ── Cliente change (com verificação de bloqueio) ──────────
  function handleClienteChange(idx, val) {
    const bloqueado = verificarBloqueio(
      val, linhas[idx].liberado,
      () => {
        setLinhas(prev => {
          const next = [...prev]
          next[idx] = { ...next[idx], cliente_nome: val, liberado: true }
          return recalcular(next)
        })
        setHasChanges(true)
      },
      () => {
        setLinhas(prev => {
          const next = [...prev]
          next[idx] = { ...next[idx], cliente_nome: '' }
          return recalcular(next)
        })
      }
    )
    if (!bloqueado) {
      setLinhas(prev => {
        const next = [...prev]
        next[idx] = { ...next[idx], cliente_nome: val, liberado: false }
        return recalcular(next)
      })
      setHasChanges(true)
    }
  }

  // ── Modal de Edição ───────────────────────────────────────
  function confirmarEdicao(campos) {
    const idx = modalEdicao
    setLinhas(prev => {
      const next = [...prev]
      const ant = next[idx].cliente_nome
      next[idx] = {
        ...next[idx],
        produto: campos.produto, modelo: campos.modelo, cor: campos.cor,
        marca: campos.marca, tamanho: campos.tamanho, preco: campos.preco,
        codigo: campos.codigo, cliente_nome: campos.cliente_nome,
        liberado: campos.liberado,
        sacolinha: campos.cliente_nome !== ant ? null : next[idx].sacolinha,
      }
      return recalcular(next)
    })
    setHasChanges(true)
    setModalEdicao(null)
  }

  // ── Modal de Fila ─────────────────────────────────────────
  function salvarFila(res) {
    const idx = modalFila
    if (res.trocarCliente) {
      // Trocar cliente principal pelo da fila
      const novasFila = { fila1: res.fila1, fila2: res.fila2, fila3: res.fila3, [`fila${res.numFila}`]: '' }
      handleClienteChange(idx, res.trocarCliente)
      setLinhas(prev => {
        const next = [...prev]
        next[idx] = { ...next[idx], ...novasFila }
        return next
      })
    } else {
      setLinhas(prev => {
        const next = [...prev]
        next[idx] = { ...next[idx], fila1: res.fila1, fila2: res.fila2, fila3: res.fila3 }
        return next
      })
    }
    setHasChanges(true)
    setModalFila(null)
  }

  // ── Modal de Cadastro ─────────────────────────────────────
  async function salvarCadastro(tipo, valor, celular) {
    try {
      await salvarNovoCadastro(tenantId, tipo, valor, celular)
      await recarregarListas()
      setModalCadastro(false)
      addToast('Cadastro realizado!', 'success')
    } catch (e) { addToast(e.message, 'error') }
  }

  // ── Finalizar Live ────────────────────────────────────────
  function iniciarFinalizacao() {
    if (!dataInput || !liveNome.trim()) {
      setAlerta({ titulo: 'Dados Faltando', mensagem: 'Preencha a <b>Data</b> e a <b>Live</b> antes de salvar.' })
      return
    }
    const semPreco = linhas.some(l =>
      !l.isDeleted && !l.isSent && l.cliente_nome.trim() &&
      (!l.preco || l.preco === '0' || l.preco === '0,00')
    )
    if (semPreco) {
      setAlerta({ titulo: 'Preço Ausente', mensagem: 'Existem itens com cliente mas <b>sem Preço</b>. Corrija antes de salvar.' })
      return
    }
    setConfirmacao({
      titulo: 'Finalizar a Live?',
      mensagem: 'Todos os itens com cliente serão confirmados no banco definitivo.<br><br>Deseja continuar?',
      onSim: async () => {
        setConfirmacao(null)
        setBusy(true); setBusyMsg('Transferindo para o Banco Definitivo...')
        try {
          const res = await finalizarLive(tenantId, linhas, dataInput, liveNome)
          addToast(`Sucesso! ${res.movidos} vendas confirmadas.`, 'success')
          await buscar()
        } catch (e) { addToast('Erro ao finalizar: ' + e.message, 'error') }
        finally { setBusy(false) }
      },
      onNao: () => setConfirmacao(null),
    })
  }

  // ── Sincronizar ───────────────────────────────────────────
  async function sincronizar() {
    if (busy) return
    setBusy(true); setBusyMsg('Sincronizando...')
    try {
      await carregarDados()
      addToast('Sincronização concluída!', 'success')
    } catch (e) { addToast('Erro ao sincronizar', 'error') }
    finally { setBusy(false) }
  }

  // ── Scroll to top ─────────────────────────────────────────
  const [showScrollTop, setShowScrollTop] = useState(false)

  // ── Render ────────────────────────────────────────────────
  return (
    <>
      <TopLoader visible={busy} message={busyMsg} />
      <ToastContainer toasts={toasts} />

      {/* Scroll to top */}
      <button id="btnScrollTop" className={showScrollTop ? 'show' : ''}
        onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" style={{ width: 24, height: 24 }}>
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </button>

      {/* ── TOOLBAR ─────────────────────────────────────── */}
      <div className="no-print">
        <div className="toolbar">
          <div className="field">
            <label>Data</label>
            <input type="date" value={dataInput} onChange={e => setDataInput(e.target.value)}
              onClick={e => { try { e.target.showPicker() } catch {} }} />
          </div>

          <div className="field">
            <label>Live</label>
            <AutocompleteInput
              value={liveNome} list={lives}
              onChange={setLiveNome} onSelect={setLiveNome}
              placeholder="Buscar Live..."
              className=""
              style={{ height: 44, padding: '0 14px', border: '1px solid var(--border-light)', borderRadius: 8, background: 'var(--input-bg)', color: 'var(--text-header)', fontSize: 15 }}
            />
          </div>

          <div className="total-container">
            <label className="field" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--muted)' }}>Total Vendido</label>
            <div className="total-valor">
              {totalVendido.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              {' '}<span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
                ({totalVendido.qtd} unid.)
              </span>
            </div>
          </div>

          <div className="actions">
            <button className="btn-acao btn-ghost" onClick={sincronizar} disabled={busy}
              style={{ minWidth: 44, padding: '0 10px' }} title="Sincronizar">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            </button>
            <button className="btn-acao btn-ghost" onClick={() => setModalCadastro(true)} disabled={busy}>+ Cadastro</button>
            <button className="btn-acao btn-ghost" onClick={novo}     disabled={busy}>+ Novo</button>
            <button className="btn-acao btn-green" onClick={buscar}   disabled={busy}>Buscar</button>
            <div className="save-group">
              <button className="btn-acao btn-blue" onClick={iniciarFinalizacao} disabled={busy}>Salvar</button>
            </div>
          </div>
        </div>

        <div className="filter-header-bar">
          <input type="text" value={filtroRapido}
            onChange={e => setFiltroRapido(e.target.value)}
            placeholder="Filtro Rápido: Digite para buscar (Ex: camiseta, verde, zara)" />
        </div>
      </div>

      {/* ── TABELA ──────────────────────────────────────── */}
      <div id="tabela-container">
        <div className="table-responsive" id="scrollArea" ref={scrollRef}
          onScroll={e => setShowScrollTop(e.target.scrollTop > 150)}>

          {!tabelaVisivel && <div id="tabela-msg">{tabelaMsg}</div>}

          {tabelaVisivel && (
            <table>
              <thead>
                <tr>
                  <th className="col-sacola">Sacola</th>
                  <th>Produto</th>
                  <th>Modelo</th>
                  <th className="col-cor">Cor</th>
                  <th>Marca</th>
                  <th className="col-tam">Tam.</th>
                  <th className="col-preco">Preço</th>
                  <th className="col-cod">Cód.</th>
                  <th className="col-cliente">Cliente</th>
                  <th className="col-acoes">Ações</th>
                </tr>
              </thead>
              <tbody>
                {linhasFiltradas.map((l, idx) => l._oculto ? null : (
                  <LinhaVenda
                    key={l.id || `new-${idx}`}
                    linha={l}
                    listas={listas}
                    onUpdate={(campo, val) => {
                      atualizarLinha(idx, { [campo]: val })
                      if (campo === 'cliente_nome') {
                        setLinhas(prev => recalcular(prev))
                      }
                    }}
                    onAbrirModal={() => setModalEdicao(idx)}
                    onAbrirFila={() => setModalFila(idx)}
                    onEnviar={() => enviarLinha(idx)}
                    onEstornar={() => estornarLinha(idx)}
                    onCopiar={() => copiarLinha(idx)}
                    onExcluir={() => excluirLinha(idx)}
                    onClienteChange={val => handleClienteChange(idx, val)}
                    onNovaLinha={novo}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── MODAIS ──────────────────────────────────────── */}
      {modalEdicao !== null && (
        <ModalEdicao
          linha={linhas[modalEdicao]}
          listas={listas}
          onConfirmar={confirmarEdicao}
          onFechar={() => setModalEdicao(null)}
          onBloqueio={(val, lib) => {
            if (lib) return false
            const key = val.trim().toLowerCase()
            return !!bloqueados[key]
          }}
        />
      )}

      {modalFila !== null && (
        <ModalFila
          linha={linhas[modalFila]}
          clientes={listas.clientes}
          onSalvar={salvarFila}
          onFechar={() => setModalFila(null)}
        />
      )}

      {modalCadastro && (
        <ModalCadastro
          onSalvar={salvarCadastro}
          onFechar={() => setModalCadastro(false)}
        />
      )}

      {alerta && (
        <ModalAlerta
          titulo={alerta.titulo}
          mensagem={alerta.mensagem}
          onFechar={() => setAlerta(null)}
        />
      )}

      {confirmacao && (
        <ModalConfirmacao
          titulo={confirmacao.titulo}
          mensagem={confirmacao.mensagem}
          onSim={confirmacao.onSim}
          onNao={confirmacao.onNao}
        />
      )}
    </>
  )
}
