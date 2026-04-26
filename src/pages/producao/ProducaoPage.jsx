import { useEffect, useMemo, useState, useCallback } from 'react'
import AppShell from '../../components/ui/AppShell'
import { useAuth } from '../../context/AuthContext'
import {
  STATUS_ENTREGA_OPTS, STATUS_PROD_OPTS, PACOTE_OPTS,
  createProducaoPedido, duplicateProducaoPedido, getProducaoData,
  checkInadimplencia, saveProducaoField,
} from '../../services/producaoService'
// PACOTE_OPTS é usado como fallback quando a empresa não cadastrou embalagens
import { getConfig } from '../../services/configService'
import { calcRomaneioTotal } from '../../services/pedidosService'
import DashboardModal from './DashboardModal'
import DetalheModal   from './DetalheModal'

// ── SVG Icons (definidos fora do componente) ───────────────────
const IconWa = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="#22c55e">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.118.554 4.107 1.523 5.83L.057 23.857a.5.5 0 0 0 .621.608l6.228-1.638A11.95 11.95 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22a9.95 9.95 0 0 1-5.053-1.373l-.362-.214-3.747.985.986-3.645-.232-.374A9.953 9.953 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
  </svg>
)
const IconCopyLink = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#00bcd4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
)
const IconDup = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
)

// ── Helpers (fora do componente) ───────────────────────────────
function buildWaLink(phone) {
  const d = (phone || '').replace(/\D/g, '')
  if (d.length === 10 || d.length === 11) return `https://wa.me/55${d}`
  if (d.length > 7) return `https://wa.me/${d}`
  return null
}

function modeFilter(row, mode) {
  const sp = row.status_prod || ''
  const se = row.status_entrega || ''
  if (mode === 'prontos')     return (sp === 'Pronto' || sp === 'Liberado') && se !== 'Enviado' && se !== 'Retirou'
  if (mode === 'finalizados') return se === 'Enviado' || se === 'Retirou' || sp === 'Repetido'
  if (sp === 'Pronto' || sp === 'Liberado' || sp === 'Repetido') return false
  if (se === 'Enviado' || se === 'Retirou') return false
  return true
}

const SP_COLOR = {
  'Pronto': '#ff9800', 'Liberado': '#22c55e',
  'Aguard. pag.': '#f44336', 'Urgente': '#f44336',
  'Repetido': '#6b7280', 'Mancha': '#00bcd4', 'Costureira': '#a78bfa',
}
const spColor = (v) => SP_COLOR[v] || '#f0f0f1'
const fk = (id, field) => `${id}__${field}`

function saudacao() {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

function fmtDateBr(dateStr) {
  if (!dateStr) return ''
  const parts = String(dateStr).slice(0, 10).split('-')
  if (parts.length !== 3) return ''
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

function buildWaMsg(phone, clienteNome, valorFrete, linkFrete) {
  const d = (phone || '').replace(/\D/g, '')
  if (!d || d.length < 8) return null
  const num = d.length === 10 || d.length === 11 ? `55${d}` : d
  const frete = valorFrete ? `R$${valorFrete}` : 'R$—'
  const msg = `${saudacao()} ${clienteNome || ''}, o valor do frete ficou em ${frete}, segue link pagamento do frete ${linkFrete || ''}`
  return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`
}

function buildWaRastreio(phone, clienteNome, rastreio, romaneio, tenantId) {
  const d = (phone || '').replace(/\D/g, '')
  if (!d || d.length < 8 || !rastreio) return null
  const num = d.length === 10 || d.length === 11 ? `55${d}` : d
  const cod = (rastreio || '').trim()

  if (romaneio && tenantId) {
    const pageUrl = `${window.location.origin}/rastreio?r=${romaneio}&t=${tenantId}&cod=${encodeURIComponent(cod)}`
    const msg = `${saudacao()} ${clienteNome || ''}, seu pedido está a caminho! Acompanhe aqui: ${pageUrl}`
    return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`
  }

  let url = ''
  if (cod.toUpperCase().startsWith('BLI')) {
    url = `https://www.loggi.com/rastreador/${cod}`
  } else if (cod.match(/^[A-Za-z]/)) {
    url = `https://rastreamento.correios.com.br/app/index.php?objetos=${cod}`
  } else {
    return null
  }
  const msg = `${saudacao()} ${clienteNome || ''}, segue seu código de rastreio: ${url}`
  return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`
}

// ── Modal: Erro ────────────────────────────────────────────────
function ErrModal({ titulo, mensagem, onClose }) {
  return (
    <div className="prod-modal-overlay" onClick={onClose}>
      <div className="prod-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="prod-modal-header">
          <span>{titulo}</span>
          <button type="button" className="prod-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="prod-modal-body" dangerouslySetInnerHTML={{ __html: mensagem }} />
        <div className="prod-modal-footer">
          <button type="button" className="prod-btn prod-btn-red" onClick={onClose}>Entendi</button>
        </div>
      </div>
    </div>
  )
}

// ── Modal: Motivo ──────────────────────────────────────────────
function MotivoModal({ value, onChange, onConfirm, onClose }) {
  return (
    <div className="prod-modal-overlay" onClick={onClose}>
      <div className="prod-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <div className="prod-modal-header">
          <span>⏰ Motivo do Atraso</span>
          <button type="button" className="prod-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="prod-modal-body">
          <p style={{ color: '#abb1bd', marginBottom: 8, fontSize: 13 }}>Descreva o motivo — será salvo como <b>ATRASO: [motivo]</b></p>
          <textarea autoFocus rows={3} value={value} onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onConfirm() } }}
            style={{ width: '100%', background: '#1c1f24', border: '1px solid #3c414b', color: '#f0f0f1', borderRadius: 6, padding: 10, fontSize: 13, resize: 'vertical' }} />
        </div>
        <div className="prod-modal-footer">
          <button type="button" className="prod-btn prod-btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="button" className="prod-btn prod-btn-red" onClick={onConfirm}>Salvar</button>
        </div>
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────
export default function ProducaoPage() {
  const { profile } = useAuth()
  const tenantId = profile?.tenant_id

  const [rows,       setRows]      = useState([])
  const [clientes,   setClientes]  = useState([])
  const [loading,    setLoading]   = useState(false)
  const [saving,     setSaving]    = useState({})
  const [pacoteOpts, setPacoteOpts] = useState(PACOTE_OPTS)

  const [mode,          setMode]          = useState('producao')
  const [busca,         setBusca]         = useState('')
  const [filtroEntrega, setFiltroEntrega] = useState('')
  const [novoCliente,   setNovoCliente]   = useState('')

  const [modalErr,    setModalErr]    = useState(null)
  const [modalMotivo, setModalMotivo] = useState(null)
  const [motivoText,  setMotivoText]  = useState('')
  const [showDash,    setShowDash]    = useState(false)
  const [detalhe,     setDetalhe]     = useState(null)
  const [linkFrete,   setLinkFrete]   = useState('')

  // ── Load ────────────────────────────────────────────────────
  const loadData = useCallback(async (signal) => {
    if (!tenantId) return
    setLoading(true)
    try {
      const [data, cfg] = await Promise.all([getProducaoData(tenantId), getConfig(tenantId)])
      if (signal?.cancelled) return
      setRows(data.rows); setClientes(data.clientes)
      if (cfg?.link_frete) setLinkFrete(cfg.link_frete)
      if (cfg?.pacotes?.length) setPacoteOpts(cfg.pacotes)
    } catch (e) {
      if (signal?.cancelled) return
      setModalErr({ titulo: '⚠️ Erro', mensagem: e.message || 'Erro ao carregar.' })
    } finally {
      if (!signal?.cancelled) setLoading(false)
    }
  }, [tenantId])

  useEffect(() => {
    const signal = { cancelled: false }
    loadData(signal)
    return () => { signal.cancelled = true }
  }, [loadData])

  // ── Saving helpers ──────────────────────────────────────────
  const markSaving = (id, field) => setSaving((p) => ({ ...p, [fk(id, field)]: 'saving' }))
  const markDone   = (id, field, ok) => {
    setSaving((p) => ({ ...p, [fk(id, field)]: ok ? 'ok' : 'error' }))
    setTimeout(() => setSaving((p) => { const n = { ...p }; delete n[fk(id, field)]; return n }), 1200)
  }
  const bc = (id, field) => {
    const s = saving[fk(id, field)]
    return s === 'saving' ? '#00bcd4' : s === 'ok' ? '#22c55e' : s === 'error' ? '#f44336' : undefined
  }

  const updRow = useCallback((id, patch) =>
    setRows((p) => p.map((r) => r.id === id ? { ...r, ...patch } : r)), [])

  // ── Background save ─────────────────────────────────────────
  const savePatch = useCallback(async (id, field, value) => {
    markSaving(id, field)
    try {
      await saveProducaoField(tenantId, id, { [field]: value })
      markDone(id, field, true)
    } catch { markDone(id, field, false) }
  }, [tenantId])

  // ── Status Prod com trava de inadimplência ──────────────────
  const handleStatusProd = useCallback(async (row, val) => {
    updRow(row.id, { status_prod: val })
    if (val === 'Pronto') {
      markSaving(row.id, 'status_prod')
      try {
        const hasDebt = await checkInadimplencia(tenantId, row.cliente_nome)
        if (hasDebt) {
          updRow(row.id, { status_prod: 'Aguard. pag.' })
          await saveProducaoField(tenantId, row.id, { status_prod: 'Aguard. pag.' })
          markDone(row.id, 'status_prod', false)
          setModalErr({ titulo: '🚫 Cliente Inadimplente', mensagem: `<b>${row.cliente_nome}</b> possui cobranças em aberto.<br><br>Status alterado para <b>Aguard. pag.</b>` })
          return
        }
        const dbPatch = { status_prod: 'Pronto' }
        const localExtra = {}
        if (!row.data_pronto) {
          const hoje = new Date().toISOString().slice(0, 10)
          dbPatch.data_pronto = hoje
          localExtra.data_pronto_fmt = fmtDateBr(hoje)
        }
        if (!row.montado_por) {
          dbPatch.montado_por = profile?.nome || 'Usuário'
        }
        updRow(row.id, { ...dbPatch, ...localExtra })
        await saveProducaoField(tenantId, row.id, dbPatch)
        markDone(row.id, 'status_prod', true)
      } catch { markDone(row.id, 'status_prod', false) }
      return
    }
    await savePatch(row.id, 'status_prod', val)
  }, [tenantId, savePatch, updRow, profile])

  // ── Status Entrega ──────────────────────────────────────────
  const handleStatusEntrega = useCallback(async (row, val) => {
    const dbPatch = { status_entrega: val }
    const localExtra = {}
    if ((val === 'Enviado' || val === 'Retirou') && !row.data_enviado) {
      const hoje = new Date().toISOString().slice(0, 10)
      dbPatch.data_enviado = hoje
      localExtra.data_enviado_fmt = fmtDateBr(hoje)
    }
    updRow(row.id, { ...dbPatch, ...localExtra })
    markSaving(row.id, 'status_entrega')
    try {
      await saveProducaoField(tenantId, row.id, dbPatch)
      markDone(row.id, 'status_entrega', true)
    } catch { markDone(row.id, 'status_entrega', false) }
  }, [tenantId, updRow])

  // ── Pacote ──────────────────────────────────────────────────
  const handlePacote = useCallback(async (row, val) => {
    updRow(row.id, { pacote: val })
    markSaving(row.id, 'pacote')
    try {
      await saveProducaoField(tenantId, row.id, { pacote: val })
      markDone(row.id, 'pacote', true)
    } catch { markDone(row.id, 'pacote', false) }
  }, [tenantId, updRow])

  // ── Romaneio + auto DEC ─────────────────────────────────────
  const handleRomaneioBlur = useCallback(async (row, val) => {
    const num = val ? Number(val) : null
    markSaving(row.id, 'romaneio')
    try {
      await saveProducaoField(tenantId, row.id, { romaneio: num })
      markDone(row.id, 'romaneio', true)
      if (num > 0) {
        const total = await calcRomaneioTotal(tenantId, num, row.cliente_nome)
        if (total > 0) {
          const decVal = Number(total.toFixed(2))
          updRow(row.id, { valor_dec: String(decVal).replace('.', ',') })
          await saveProducaoField(tenantId, row.id, { valor_dec: decVal })
        }
      }
    } catch { markDone(row.id, 'romaneio', false) }
  }, [tenantId, updRow])

  // ── DetalheModal save ───────────────────────────────────────
  const handleDetalheSave = useCallback(async (updated) => {
    try {
      const patch = {
        status_prod: updated.status_prod || '', obs_cliente: updated.obs_cliente || '',
        obs_prod: updated.obs_prod || '', peso: updated.peso || '', pacote: updated.pacote || '',
        status_entrega: updated.status_entrega || '', pedido_codigo: updated.pedido_codigo || '',
        valor_frete: updated.valor_frete || '', valor_dec: updated.valor_dec || '',
        msg_cobranca: updated.msg_cobranca || '', rastreio: updated.rastreio || '',
      }
      await saveProducaoField(tenantId, updated.id, patch)
      updRow(updated.id, patch)
    } catch (e) { setModalErr({ titulo: '⚠️ Erro', mensagem: e.message }) }
  }, [tenantId, updRow])

  // ── Motivo ──────────────────────────────────────────────────
  const handleMotivoSave = useCallback(async () => {
    if (!modalMotivo || !motivoText.trim()) return
    const row = rows.find((r) => r.id === modalMotivo)
    if (!row) return
    const novaObs = `ATRASO: ${motivoText.trim()}`
    try {
      await saveProducaoField(tenantId, row.id, { obs_prod: novaObs })
      updRow(row.id, { obs_prod: novaObs })
    } catch {}
    setModalMotivo(null); setMotivoText('')
  }, [modalMotivo, motivoText, rows, tenantId, updRow])

  // ── Novo / Duplicar ─────────────────────────────────────────
  const handleNovo = useCallback(async () => {
    if (!novoCliente.trim()) return
    try { await createProducaoPedido(tenantId, novoCliente.trim()); setNovoCliente(''); await loadData() }
    catch (e) { setModalErr({ titulo: '⚠️ Erro', mensagem: e.message }) }
  }, [tenantId, novoCliente, loadData])

  const handleDuplicar = useCallback(async (id) => {
    try { await duplicateProducaoPedido(tenantId, id); await loadData() }
    catch (e) { setModalErr({ titulo: '⚠️ Erro', mensagem: e.message }) }
  }, [tenantId, loadData])

  // ── Filtro ──────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    const terms = busca.toLowerCase().split(',').map((v) => v.trim()).filter(Boolean)
    return rows.filter((row) => {
      if (!modeFilter(row, mode)) return false
      if (filtroEntrega && row.status_entrega !== filtroEntrega) return false
      if (!terms.length) return true
      const txt = [row.cliente_nome, row.obs_cliente, row.obs_prod, row.pedido_codigo, row.msg_cobranca, row.rastreio, row.pacote].join(' ').toLowerCase()
      return terms.every((t) => txt.includes(t))
    })
  }, [rows, mode, busca, filtroEntrega])

  const showDelivery = mode !== 'producao'

  return (
    <AppShell title="Produção" flush hideTitle>
      <div className="prod-v2">

        {/* ── Toolbar ── */}
        <div className="prod-v2-toolbar">
          <div className="prod-v2-toolbar-left">
            <input className="prod-v2-input" list="prod-v2-clientes-novo"
              placeholder="Nome do cliente..."
              value={novoCliente} onChange={(e) => setNovoCliente(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleNovo() }}
              style={{ minWidth: 140 }} />
            <datalist id="prod-v2-clientes-novo">{clientes.map((c) => <option key={c} value={c} />)}</datalist>
            <button type="button" className="prod-btn prod-btn-green" onClick={handleNovo} disabled={loading}>+ NOVO</button>
            <input className="prod-v2-input"
              placeholder="Buscar (ex: nome, pacote, obs)..."
              value={busca} onChange={(e) => setBusca(e.target.value)}
              style={{ minWidth: 160, flex: 1 }} />
            <select className="prod-v2-input" value={filtroEntrega}
              onChange={(e) => setFiltroEntrega(e.target.value)} style={{ minWidth: 170 }}>
              <option value="">Status Entrega (Todos)</option>
              {STATUS_ENTREGA_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="prod-v2-toolbar-right">
            {[{ key:'producao', label:'EM PRODUÇÃO'}, { key:'prontos', label:'PRONTOS'}, { key:'finalizados', label:'ENVIADOS'}].map((t) => (
              <button type="button" key={t.key}
                className={`prod-v2-tab${mode === t.key ? ' active' : ''}`}
                onClick={() => setMode(t.key)}>{t.label}</button>
            ))}
            <button type="button" className="prod-v2-tab" onClick={() => setShowDash(true)}>📊 ESTATÍSTICAS</button>
            <span className="prod-v2-count">{filteredRows.length} REGISTROS</span>
          </div>
        </div>

        {/* ── Table ── */}
        <div className="prod-v2-table-wrap">
          {loading && <div className="prod-v2-empty">Carregando...</div>}
          {!loading && filteredRows.length === 0 && <div className="prod-v2-empty">Nenhum registro encontrado.</div>}
          {!loading && filteredRows.length > 0 && (
            <table className={`prod-v2-table${mode === 'producao' ? ' prod-table-producao' : ''}`}>
              {mode === 'producao' && (
                <colgroup>
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '5%' }}  />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '19%' }} />
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '6%' }}  />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '3%' }}  />
                </colgroup>
              )}
              <thead>
                <tr>
                  <th>SOLICITADO</th>
                  <th>DIAS</th>
                  <th>CLIENTE</th>
                  <th>STATUS PROD.</th>
                  <th>OBS. CLIENTE</th>
                  <th>OBS. PROD.</th>
                  <th>PESO</th>
                  <th>PACOTE</th>
                  {showDelivery && <th>PRONTO</th>}
                  {showDelivery && <th>STATUS ENTREGA</th>}
                  {mode === 'finalizados' && <th>ENVIADO</th>}
                  {showDelivery && <th>PED.</th>}
                  {showDelivery && <th>FRETE</th>}
                  {showDelivery && <th>DEC.</th>}
                  {showDelivery && <th>COB.</th>}
                  {showDelivery && <th>ROM.</th>}
                  {showDelivery && <th>RASTREIO</th>}
                  {showDelivery && <th style={{ textAlign:'center' }}>LINK</th>}
                  {mode === 'finalizados' && <th>MONTADO POR</th>}
                  {mode === 'producao' && <th style={{ textAlign:'center' }}>+</th>}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const waLink = buildWaLink(row.whatsapp)
                  const rastreioLink = row.link_rastreio || ''
                  const precisaMotivo = row.atrasado && !(row.obs_prod || '').toUpperCase().includes('ATRASO')
                  const cls = row.bloqueado ? 'prod-row-blocked' : row.atrasado ? 'prod-row-delayed' : ''
                  return (
                    <tr key={row.id} className={cls}>
                      {/* Solicitado */}
                      <td className="prod-td-nb">{row.data_solicitado_fmt}</td>

                      {/* Dias */}
                      <td className="prod-td-nb" style={{ textAlign:'center' }}>
                        <span style={{ color: row.atrasado ? '#ff9800' : '#f0f0f1', fontWeight: row.atrasado ? 700 : 400 }}>{row.dias_u}</span>
                      </td>

                      {/* Cliente */}
                      <td className="prod-td-nb">
                        {row.atrasado && <span style={{ marginRight: 3, fontSize: 10 }}>⏳</span>}
                        <button type="button" className="prod-cliente-btn"
                          onClick={() => setDetalhe(row)} title="Clique para editar">
                          {row.cliente_nome || '—'}
                        </button>
                      </td>

                      {/* Status Prod */}
                      <td>
                        <select className="prod-v2-cell"
                          value={row.status_prod || ''}
                          onChange={(e) => handleStatusProd(row, e.target.value)}
                          style={{ borderColor: bc(row.id, 'status_prod'), color: spColor(row.status_prod), fontWeight: 600, width: 88 }}>
                          <option value="">--</option>
                          {STATUS_PROD_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </td>

                      {/* Obs Cliente — input INLINE sem componente helper */}
                      <td>
                        <input className="prod-v2-cell" style={{ width: 80, borderColor: bc(row.id,'obs_cliente') }}
                          value={row.obs_cliente || ''}
                          onChange={(e) => updRow(row.id, { obs_cliente: e.target.value })}
                          onBlur={(e) => savePatch(row.id, 'obs_cliente', e.target.value)} />
                      </td>

                      {/* Obs Prod */}
                      <td>
                        <input className="prod-v2-cell" style={{ width: 80, borderColor: bc(row.id,'obs_prod') }}
                          value={row.obs_prod || ''}
                          onChange={(e) => updRow(row.id, { obs_prod: e.target.value })}
                          onBlur={(e) => savePatch(row.id, 'obs_prod', e.target.value)} />
                      </td>

                      {/* Peso */}
                      <td>
                        <input className="prod-v2-cell" style={{ width: 50, borderColor: bc(row.id,'peso') }}
                          value={row.peso || ''}
                          onChange={(e) => updRow(row.id, { peso: e.target.value })}
                          onBlur={(e) => savePatch(row.id, 'peso', e.target.value)} />
                      </td>

                      {/* Pacote */}
                      <td>
                        <select className="prod-v2-cell" style={{ width: 100, borderColor: bc(row.id,'pacote') }}
                          value={row.pacote || ''}
                          onChange={(e) => handlePacote(row, e.target.value)}>
                          <option value="">--</option>
                          {pacoteOpts.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </td>

                      {/* Data Pronto — só nas abas Prontos e Enviados */}
                      {showDelivery && (
                        <td className="prod-td-nb" style={{ color: row.data_pronto_fmt ? '#22c55e' : '#6b7280' }}>
                          {row.data_pronto_fmt || '—'}
                        </td>
                      )}

                      {/* ── Colunas de entrega ── */}
                      {showDelivery && (
                        <td>
                          <select className="prod-v2-cell" style={{ width: 112, borderColor: bc(row.id,'status_entrega') }}
                            value={row.status_entrega || ''}
                            onChange={(e) => handleStatusEntrega(row, e.target.value)}>
                            <option value="">--</option>
                            {STATUS_ENTREGA_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </td>
                      )}

                      {/* Data Enviado — só na aba Enviados */}
                      {mode === 'finalizados' && (
                        <td className="prod-td-nb">
                          {rastreioLink
                            ? <a href={rastreioLink} target="_blank" rel="noreferrer" style={{ color: '#00bcd4', textDecoration: 'none' }}>{row.data_enviado_fmt || 'Ver'}</a>
                            : row.data_enviado_fmt || '—'}
                        </td>
                      )}

                      {showDelivery && (
                        <td>
                          <input className="prod-v2-cell" style={{ width: 48, borderColor: bc(row.id,'pedido_codigo') }}
                            value={row.pedido_codigo || ''}
                            onChange={(e) => updRow(row.id, { pedido_codigo: e.target.value })}
                            onBlur={(e) => savePatch(row.id, 'pedido_codigo', e.target.value)} />
                        </td>
                      )}

                      {showDelivery && (
                        <td>
                          <input className="prod-v2-cell" style={{ width: 48, borderColor: bc(row.id,'valor_frete') }}
                            value={row.valor_frete || ''}
                            onChange={(e) => updRow(row.id, { valor_frete: e.target.value })}
                            onBlur={(e) => savePatch(row.id, 'valor_frete', e.target.value)} />
                        </td>
                      )}

                      {showDelivery && (
                        <td>
                          <input className="prod-v2-cell" style={{ width: 48, borderColor: bc(row.id,'valor_dec') }}
                            value={row.valor_dec || ''}
                            onChange={(e) => updRow(row.id, { valor_dec: e.target.value })}
                            onBlur={(e) => savePatch(row.id, 'valor_dec', e.target.value)} />
                        </td>
                      )}

                      {showDelivery && (
                        <td style={{ textAlign: 'center' }}>
                          {(() => {
                            const waCobranca = buildWaMsg(row.whatsapp, row.cliente_nome, row.valor_frete, linkFrete)
                            return waCobranca
                              ? <a href={waCobranca} target="_blank" rel="noreferrer" title="Enviar cobrança de frete via WhatsApp"><IconWa /></a>
                              : <span style={{ color: '#6b7280', fontSize: 10 }}>sem tel.</span>
                          })()}
                        </td>
                      )}

                      {showDelivery && (
                        <td>
                          <input className="prod-v2-cell" style={{ width: 48, borderColor: bc(row.id,'romaneio') }}
                            value={row.romaneio || ''}
                            onChange={(e) => updRow(row.id, { romaneio: e.target.value })}
                            onBlur={(e) => handleRomaneioBlur(row, e.target.value)} />
                        </td>
                      )}

                      {showDelivery && (
                        <td>
                          <input className="prod-v2-cell" style={{ width: 75, borderColor: bc(row.id,'rastreio') }}
                            value={row.rastreio || ''}
                            onChange={(e) => updRow(row.id, { rastreio: e.target.value })}
                            onBlur={(e) => savePatch(row.id, 'rastreio', e.target.value)} />
                        </td>
                      )}

                      {showDelivery && (
                        <td style={{ textAlign: 'center' }}>
                          {(() => {
                            const waRastreio = buildWaRastreio(row.whatsapp, row.cliente_nome, row.rastreio, row.romaneio, tenantId)
                            if (waRastreio) return <a href={waRastreio} target="_blank" rel="noreferrer" title="Enviar código de rastreio via WhatsApp"><IconWa /></a>
                            if (waLink) return <a href={waLink} target="_blank" rel="noreferrer" title="Abrir WhatsApp"><IconWa /></a>
                            return (
                              <button type="button" style={{ background:'none',border:'none',cursor:'pointer',padding:0 }}
                                onClick={() => navigator.clipboard?.writeText(row.cliente_nome || '')}>
                                <IconCopyLink />
                              </button>
                            )
                          })()}
                        </td>
                      )}

                      {/* Montado Por — só na aba Enviados */}
                      {mode === 'finalizados' && (
                        <td className="prod-td-nb" style={{ color: '#8ab4f8' }}>
                          {row.montado_por || '—'}
                        </td>
                      )}

                      {/* Duplicar — só na aba Em Produção */}
                      {mode === 'producao' && (
                        <td style={{ textAlign: 'center' }}>
                          <button type="button" className="prod-dup-btn" onClick={() => handleDuplicar(row.id)} title="Duplicar">
                            <IconDup />
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {modalErr && <ErrModal titulo={modalErr.titulo} mensagem={modalErr.mensagem} onClose={() => setModalErr(null)} />}
        {modalMotivo !== null && (
          <MotivoModal value={motivoText} onChange={setMotivoText} onConfirm={handleMotivoSave}
            onClose={() => { setModalMotivo(null); setMotivoText('') }} />
        )}
        {detalhe && <DetalheModal row={detalhe} onSave={handleDetalheSave} onClose={() => setDetalhe(null)} />}
        {showDash && <DashboardModal rows={rows} onClose={() => setShowDash(false)} />}
      </div>
    </AppShell>
  )
}
