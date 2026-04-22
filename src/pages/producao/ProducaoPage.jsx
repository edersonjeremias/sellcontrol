import { useEffect, useMemo, useState, useCallback } from 'react'
import AppShell from '../../components/ui/AppShell'
import { useAuth } from '../../context/AuthContext'
import {
  STATUS_ENTREGA_OPTS, STATUS_PROD_OPTS, PACOTE_OPTS,
  createProducaoPedido, duplicateProducaoPedido, getProducaoData,
  checkInadimplencia, saveProducaoField,
} from '../../services/producaoService'
import DashboardModal from './DashboardModal'
import DetalheModal    from './DetalheModal'

// ── SVG Icons ──────────────────────────────────────────────────
const IconWa = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="#22c55e">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.118.554 4.107 1.523 5.83L.057 23.857a.5.5 0 0 0 .621.608l6.228-1.638A11.95 11.95 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22a9.95 9.95 0 0 1-5.053-1.373l-.362-.214-3.747.985.986-3.645-.232-.374A9.953 9.953 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
  </svg>
)
const IconCopyLink = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00bcd4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
)
const IconDup = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
)

// ── Helpers ────────────────────────────────────────────────────
function buildWaLink(phone) {
  const d = (phone || '').replace(/\D/g, '')
  if (d.length === 10 || d.length === 11) return `https://wa.me/55${d}`
  if (d.length > 7) return `https://wa.me/${d}`
  return null
}

function modeFilter(row, mode) {
  const sp = row.status_prod || ''
  const se = row.status_entrega || ''
  if (mode === 'prontos')    return (sp === 'Pronto' || sp === 'Liberado') && se !== 'Enviado' && se !== 'Retirou'
  if (mode === 'finalizados') return se === 'Enviado' || se === 'Retirou' || sp === 'Repetido'
  if (sp === 'Pronto' || sp === 'Liberado' || sp === 'Repetido') return false
  if (se === 'Enviado' || se === 'Retirou') return false
  return true
}

const SP_COLOR = {
  'Pronto':       '#ff9800',
  'Liberado':     '#22c55e',
  'Aguard. pag.': '#f44336',
  'Urgente':      '#f44336',
  'Repetido':     '#6b7280',
  'Mancha':       '#00bcd4',
  'Costureira':   '#a78bfa',
}
function spColor(val) { return SP_COLOR[val] || '#f0f0f1' }

function fKey(id, field) { return `${id}__${field}` }

// ── Error modal ────────────────────────────────────────────────
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

// ── Motivo modal ───────────────────────────────────────────────
function MotivoModal({ onConfirm, onClose, value, onChange }) {
  return (
    <div className="prod-modal-overlay" onClick={onClose}>
      <div className="prod-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <div className="prod-modal-header">
          <span>⏰ Motivo do Atraso</span>
          <button type="button" className="prod-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="prod-modal-body">
          <p style={{ color: '#abb1bd', marginBottom: 10, fontSize: 13 }}>
            Descreva o motivo. Será salvo como <b>ATRASO: [motivo]</b>
          </p>
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

  const [rows,      setRows]      = useState([])
  const [clientes,  setClientes]  = useState([])
  const [loading,   setLoading]   = useState(false)
  const [saving,    setSaving]    = useState({})

  const [mode,          setMode]          = useState('producao')
  const [busca,         setBusca]         = useState('')
  const [filtroEntrega, setFiltroEntrega] = useState('')
  const [novoCliente,   setNovoCliente]   = useState('')

  const [modalErr,    setModalErr]    = useState(null)
  const [modalMotivo, setModalMotivo] = useState(null)
  const [motivoText,  setMotivoText]  = useState('')
  const [showDash,    setShowDash]    = useState(false)
  const [detalhe,     setDetalhe]     = useState(null)   // row para DetalheModal

  // ── Load ────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    try {
      const data = await getProducaoData(tenantId)
      setRows(data.rows)
      setClientes(data.clientes)
    } catch (e) {
      setModalErr({ titulo: '⚠️ Erro', mensagem: e.message || 'Erro ao carregar.' })
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useEffect(() => { loadData() }, [loadData])

  // ── Saving helpers ──────────────────────────────────────────
  const markSaving = (id, field) => setSaving((p) => ({ ...p, [fKey(id, field)]: 'saving' }))
  const markDone   = (id, field, ok) => {
    setSaving((p) => ({ ...p, [fKey(id, field)]: ok ? 'ok' : 'error' }))
    setTimeout(() => setSaving((p) => { const n = { ...p }; delete n[fKey(id, field)]; return n }), 1200)
  }
  const borderColor = (id, field) => {
    const s = saving[fKey(id, field)]
    return s === 'saving' ? '#00bcd4' : s === 'ok' ? '#22c55e' : s === 'error' ? '#f44336' : undefined
  }

  const updRow = (id, patch) => setRows((p) => p.map((r) => r.id === id ? { ...r, ...patch } : r))

  // ── Background save ─────────────────────────────────────────
  const savePatch = useCallback(async (row, patch) => {
    const field = Object.keys(patch)[0]
    markSaving(row.id, field)
    try {
      await saveProducaoField(tenantId, row.id, patch)
      markDone(row.id, field, true)
    } catch {
      markDone(row.id, field, false)
    }
  }, [tenantId])

  // ── Status Prod — inadimplência check ──────────────────────
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
        const patch = { status_prod: 'Pronto' }
        if (!row.data_pronto) patch.data_pronto = new Date().toISOString().slice(0, 10)
        updRow(row.id, patch)
        await saveProducaoField(tenantId, row.id, patch)
        markDone(row.id, 'status_prod', true)
      } catch { markDone(row.id, 'status_prod', false) }
      return
    }
    await savePatch(row, { status_prod: val })
  }, [tenantId, savePatch])

  // ── Status Entrega ──────────────────────────────────────────
  const handleStatusEntrega = useCallback(async (row, val) => {
    const patch = { status_entrega: val }
    if ((val === 'Enviado' || val === 'Retirou') && !row.data_enviado)
      patch.data_enviado = new Date().toISOString().slice(0, 10)
    updRow(row.id, patch)
    markSaving(row.id, 'status_entrega')
    try {
      await saveProducaoField(tenantId, row.id, patch)
      markDone(row.id, 'status_entrega', true)
    } catch { markDone(row.id, 'status_entrega', false) }
  }, [tenantId])

  // ── DetalheModal save (salva todos os campos alterados) ────
  const handleDetalheSave = useCallback(async (updated) => {
    try {
      const patch = {
        status_prod:    updated.status_prod    || '',
        obs_cliente:    updated.obs_cliente    || '',
        obs_prod:       updated.obs_prod       || '',
        peso:           updated.peso           || '',
        pacote:         updated.pacote         || '',
        status_entrega: updated.status_entrega || '',
        pedido_codigo:  updated.pedido_codigo  || '',
        valor_frete:    updated.valor_frete    || '',
        valor_dec:      updated.valor_dec      || '',
        msg_cobranca:   updated.msg_cobranca   || '',
        rastreio:       updated.rastreio       || '',
      }
      await saveProducaoField(tenantId, updated.id, patch)
      updRow(updated.id, patch)
    } catch (e) {
      setModalErr({ titulo: '⚠️ Erro', mensagem: e.message })
    }
  }, [tenantId])

  // ── Motivo atraso ───────────────────────────────────────────
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
  }, [modalMotivo, motivoText, rows, tenantId])

  // ── Novo pedido ─────────────────────────────────────────────
  const handleNovo = useCallback(async () => {
    if (!novoCliente.trim()) return
    try {
      await createProducaoPedido(tenantId, novoCliente.trim())
      setNovoCliente(''); await loadData()
    } catch (e) { setModalErr({ titulo: '⚠️ Erro', mensagem: e.message }) }
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

  // Colunas extras visíveis apenas em PRONTOS/ENVIADOS
  const showDelivery = mode !== 'producao'

  // ── Row class ───────────────────────────────────────────────
  const rowCls = (row) => row.bloqueado ? 'prod-row-blocked' : row.atrasado ? 'prod-row-delayed' : ''

  // ── Input cell helper ───────────────────────────────────────
  const Cell = ({ row, field, style = {}, list }) => (
    <input
      className="prod-v2-cell"
      value={row[field] || ''}
      list={list}
      onChange={(e) => updRow(row.id, { [field]: e.target.value })}
      onBlur={() => savePatch(row, { [field]: row[field] })}
      style={{ borderColor: borderColor(row.id, field), ...style }}
    />
  )

  return (
    <AppShell title="Produção" flush hideTitle>
      <div className="prod-v2">

        {/* ── Toolbar ── */}
        <div className="prod-v2-toolbar">
          {/* Left */}
          <div className="prod-v2-toolbar-left">
            <button type="button" className="prod-btn prod-btn-green" onClick={handleNovo} disabled={loading}>
              + NOVO
            </button>
            <input className="prod-v2-input" list="prod-v2-clientes"
              placeholder="Buscar (ex: nome, pacote, obs)..."
              value={busca} onChange={(e) => setBusca(e.target.value)}
              style={{ minWidth: 200, flex: 1 }} />
            <select className="prod-v2-input" value={filtroEntrega} onChange={(e) => setFiltroEntrega(e.target.value)}
              style={{ minWidth: 180 }}>
              <option value="">Status Entrega (Todos)</option>
              {STATUS_ENTREGA_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          {/* Right */}
          <div className="prod-v2-toolbar-right">
            {[
              { key: 'producao',   label: 'EM PRODUÇÃO' },
              { key: 'prontos',    label: 'PRONTOS' },
              { key: 'finalizados',label: 'ENVIADOS' },
            ].map((t) => (
              <button type="button" key={t.key}
                className={`prod-v2-tab${mode === t.key ? ' active' : ''}`}
                onClick={() => setMode(t.key)}>
                {t.label}
              </button>
            ))}
            <button type="button" className="prod-v2-tab" style={{ borderColor: '#3c414b' }}
              onClick={() => setShowDash(true)}>
              📊 ESTATÍSTICAS
            </button>
            <span className="prod-v2-count">{filteredRows.length} REGISTROS</span>
          </div>
        </div>

        {/* ── Table ── */}
        <div className="prod-v2-table-wrap">
          {loading && <div className="prod-v2-empty">Carregando...</div>}
          {!loading && filteredRows.length === 0 && (
            <div className="prod-v2-empty">Nenhum registro encontrado.</div>
          )}
          {!loading && filteredRows.length > 0 && (
            <table className="prod-v2-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 80 }}>SOLICITADO</th>
                  <th style={{ minWidth: 60 }}>DIAS</th>
                  <th style={{ minWidth: 140 }}>CLIENTE</th>
                  <th style={{ minWidth: 140 }}>STATUS PROD.</th>
                  <th style={{ minWidth: 130 }}>OBS. CLIENTE</th>
                  <th style={{ minWidth: 130 }}>OBS. PROD.</th>
                  <th style={{ minWidth: 60 }}>PESO</th>
                  <th style={{ minWidth: 140 }}>PACOTE</th>
                  <th style={{ minWidth: 90 }}>PRONTO</th>
                  {showDelivery && <th style={{ minWidth: 155 }}>STATUS ENTREGA</th>}
                  {showDelivery && <th style={{ minWidth: 85 }}>ENVIADO</th>}
                  {showDelivery && <th style={{ minWidth: 60 }}>PED.</th>}
                  {showDelivery && <th style={{ minWidth: 55 }}>FRETE</th>}
                  {showDelivery && <th style={{ minWidth: 55 }}>DEC.</th>}
                  {showDelivery && <th style={{ minWidth: 120 }}>COB.</th>}
                  {showDelivery && <th style={{ minWidth: 110 }}>RASTREIO</th>}
                  {showDelivery && <th style={{ minWidth: 34, textAlign: 'center' }}>LINK</th>}
                  <th style={{ minWidth: 34, textAlign: 'center' }}>+</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const waLink = buildWaLink(row.whatsapp)
                  const rastreioLink = row.link_rastreio || ''
                  const precisaMotivo = row.atrasado && !(row.obs_prod || '').toUpperCase().includes('ATRASO')
                  return (
                    <tr key={row.id} className={rowCls(row)}>

                      {/* Solicitado */}
                      <td className="prod-td-fixed" style={{ fontSize: 11 }}>{row.data_solicitado_fmt}</td>

                      {/* Dias */}
                      <td className="prod-td-fixed" style={{ textAlign: 'center' }}>
                        <div style={{ color: row.atrasado ? '#ff9800' : '#f0f0f1', fontWeight: row.atrasado ? 700 : 400, fontSize: 13 }}>
                          {row.dias_u}
                        </div>
                        {precisaMotivo && (
                          <button type="button" className="prod-motivo-btn"
                            onClick={() => { setModalMotivo(row.id); setMotivoText('') }}>
                            + MOTIVO
                          </button>
                        )}
                      </td>

                      {/* Cliente — clicável → abre DetalheModal */}
                      <td className="prod-td-cliente">
                        {row.atrasado && <span style={{ marginRight: 4, fontSize: 11 }}>⏳</span>}
                        <button type="button" className="prod-cliente-btn"
                          onClick={() => setDetalhe(row)}
                          title="Clique para editar detalhes">
                          {row.cliente_nome || '—'}
                        </button>
                      </td>

                      {/* Status Prod */}
                      <td>
                        <select className="prod-v2-cell"
                          value={row.status_prod || ''}
                          onChange={(e) => handleStatusProd(row, e.target.value)}
                          style={{ borderColor: borderColor(row.id, 'status_prod'), color: spColor(row.status_prod), fontWeight: 600 }}>
                          <option value="">--</option>
                          {STATUS_PROD_OPTS.map((o) => <option key={o} value={o} style={{ color: spColor(o) }}>{o}</option>)}
                        </select>
                      </td>

                      {/* Obs Cliente */}
                      <td><Cell row={row} field="obs_cliente" /></td>

                      {/* Obs Prod */}
                      <td><Cell row={row} field="obs_prod" /></td>

                      {/* Peso */}
                      <td><Cell row={row} field="peso" style={{ width: 55 }} /></td>

                      {/* Pacote */}
                      <td>
                        <select className="prod-v2-cell"
                          value={row.pacote || ''}
                          onChange={(e) => { const v = e.target.value; updRow(row.id, { pacote: v }); savePatch({ ...row, pacote: v }, { pacote: v }) }}
                          style={{ borderColor: borderColor(row.id, 'pacote') }}>
                          <option value="">--</option>
                          {PACOTE_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </td>

                      {/* Data Pronto */}
                      <td className="prod-td-fixed" style={{ fontSize: 11, color: row.data_pronto_fmt ? '#22c55e' : '#6b7280' }}>
                        {row.data_pronto_fmt || '—'}
                      </td>

                      {/* ── Colunas de entrega ── */}
                      {showDelivery && (
                        <td>
                          <select className="prod-v2-cell"
                            value={row.status_entrega || ''}
                            onChange={(e) => handleStatusEntrega(row, e.target.value)}
                            style={{ borderColor: borderColor(row.id, 'status_entrega') }}>
                            <option value="">--</option>
                            {STATUS_ENTREGA_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </td>
                      )}

                      {showDelivery && (
                        <td className="prod-td-fixed" style={{ fontSize: 11 }}>
                          {rastreioLink
                            ? <a href={rastreioLink} target="_blank" rel="noreferrer" style={{ color: '#00bcd4', textDecoration: 'none' }}>{row.data_enviado_fmt || 'Ver'}</a>
                            : row.data_enviado_fmt || '—'}
                        </td>
                      )}

                      {showDelivery && <td><Cell row={row} field="pedido_codigo" style={{ width: 55 }} /></td>}
                      {showDelivery && <td><Cell row={row} field="valor_frete"   style={{ width: 50 }} /></td>}
                      {showDelivery && <td><Cell row={row} field="valor_dec"     style={{ width: 50 }} /></td>}
                      {showDelivery && <td><Cell row={row} field="msg_cobranca"  style={{ minWidth: 100 }} /></td>}
                      {showDelivery && <td><Cell row={row} field="rastreio"      style={{ minWidth: 90 }} /></td>}

                      {showDelivery && (
                        <td style={{ textAlign: 'center' }}>
                          {waLink
                            ? <a href={waLink} target="_blank" rel="noreferrer"><IconWa /></a>
                            : <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                onClick={() => navigator.clipboard?.writeText(row.cliente_nome || '')} title="Copiar nome">
                                <IconCopyLink />
                              </button>}
                        </td>
                      )}

                      {/* Ação: duplicar */}
                      <td style={{ textAlign: 'center' }}>
                        <button type="button" className="prod-dup-btn"
                          onClick={() => handleDuplicar(row.id)} title="Duplicar">
                          <IconDup />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <datalist id="prod-v2-clientes">
          {clientes.map((c) => <option key={c} value={c} />)}
        </datalist>

        {/* ── Modals ── */}
        {modalErr && <ErrModal titulo={modalErr.titulo} mensagem={modalErr.mensagem} onClose={() => setModalErr(null)} />}

        {modalMotivo !== null && (
          <MotivoModal value={motivoText} onChange={setMotivoText}
            onConfirm={handleMotivoSave}
            onClose={() => { setModalMotivo(null); setMotivoText('') }} />
        )}

        {detalhe && (
          <DetalheModal row={detalhe} onSave={handleDetalheSave} onClose={() => setDetalhe(null)} />
        )}

        {showDash && <DashboardModal rows={rows} onClose={() => setShowDash(false)} />}
      </div>
    </AppShell>
  )
}
