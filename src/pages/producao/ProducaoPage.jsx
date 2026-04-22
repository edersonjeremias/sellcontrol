import { useEffect, useMemo, useState, useCallback } from 'react'
import AppShell from '../../components/ui/AppShell'
import { useAuth } from '../../context/AuthContext'
import {
  STATUS_ENTREGA_OPTS, STATUS_PROD_OPTS, PACOTE_OPTS,
  createProducaoPedido, duplicateProducaoPedido, getProducaoData,
  checkInadimplencia, saveProducaoField,
} from '../../services/producaoService'
import DashboardModal from './DashboardModal'

// ── Icons ─────────────────────────────────────────────────────
const IconWa = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="#22c55e">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.118.554 4.107 1.523 5.83L.057 23.857a.5.5 0 0 0 .621.608l6.228-1.638A11.95 11.95 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22a9.95 9.95 0 0 1-5.053-1.373l-.362-.214-3.747.985.986-3.645-.232-.374A9.953 9.953 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
  </svg>
)

const IconCopy = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00bcd4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
  if (mode === 'prontos') {
    return (sp === 'Pronto' || sp === 'Liberado') && se !== 'Enviado' && se !== 'Retirou'
  }
  if (mode === 'finalizados') {
    return se === 'Enviado' || se === 'Retirou' || sp === 'Repetido'
  }
  if (sp === 'Pronto' || sp === 'Liberado' || sp === 'Repetido') return false
  if (se === 'Enviado' || se === 'Retirou') return false
  return true
}

// ── Saving state helpers ───────────────────────────────────────
function fieldKey(id, field) { return `${id}__${field}` }

// ── Modal components ───────────────────────────────────────────
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

function MotivoModal({ onConfirm, onClose, value, onChange }) {
  return (
    <div className="prod-modal-overlay" onClick={onClose}>
      <div className="prod-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <div className="prod-modal-header">
          <span>⏰ Motivo do Atraso</span>
          <button type="button" className="prod-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="prod-modal-body">
          <p style={{ color: 'var(--prod-muted)', marginBottom: 10, fontSize: 13 }}>
            Descreva o motivo do atraso. Será salvo com o prefixo <b>ATRASO:</b>
          </p>
          <textarea
            autoFocus
            rows={3}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onConfirm() } }}
            style={{
              width: '100%', background: '#26292f', border: '1px solid #3c414b',
              color: '#f0f0f1', borderRadius: 6, padding: 10, fontSize: 13, resize: 'vertical',
            }}
          />
        </div>
        <div className="prod-modal-footer">
          <button type="button" className="prod-btn prod-btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="button" className="prod-btn prod-btn-red" onClick={onConfirm}>Salvar Motivo</button>
        </div>
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────
export default function ProducaoPage() {
  const { profile } = useAuth()
  const tenantId = profile?.tenant_id

  const [rows, setRows] = useState([])
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState({})  // { 'id__field': 'saving'|'ok'|'error' }

  const [mode, setMode] = useState('producao')
  const [busca, setBusca] = useState('')
  const [novoCliente, setNovoCliente] = useState('')

  const [modalErr, setModalErr] = useState(null)
  const [modalMotivo, setModalMotivo] = useState(null)
  const [motivoText, setMotivoText] = useState('')
  const [showDash, setShowDash] = useState(false)

  // ── Load ──
  const loadData = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    try {
      const data = await getProducaoData(tenantId)
      setRows(data.rows)
      setClientes(data.clientes)
    } catch (e) {
      setModalErr({ titulo: '⚠️ Erro', mensagem: e.message || 'Erro ao carregar dados.' })
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useEffect(() => { loadData() }, [loadData])

  // ── Saving state ──
  const markSaving = (id, field) =>
    setSaving((p) => ({ ...p, [fieldKey(id, field)]: 'saving' }))

  const markDone = (id, field, ok) => {
    setSaving((p) => ({ ...p, [fieldKey(id, field)]: ok ? 'ok' : 'error' }))
    setTimeout(() =>
      setSaving((p) => { const n = { ...p }; delete n[fieldKey(id, field)]; return n }), 1200)
  }

  function fieldBorder(id, field) {
    const s = saving[fieldKey(id, field)]
    if (s === 'saving') return '#00bcd4'
    if (s === 'ok')     return '#22c55e'
    if (s === 'error')  return '#f44336'
    return undefined
  }

  // ── Inline field update ──
  const updateRow = (id, patch) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  // ── Background save ──
  const saveField = useCallback(async (row, patch) => {
    const field = Object.keys(patch)[0]
    markSaving(row.id, field)
    try {
      await saveProducaoField(tenantId, row.id, patch)
      markDone(row.id, field, true)
    } catch {
      markDone(row.id, field, false)
    }
  }, [tenantId])

  // ── Status Prod change — with inadimplência check ──
  const handleStatusProdChange = useCallback(async (row, newVal) => {
    updateRow(row.id, { status_prod: newVal })

    if (newVal === 'Pronto') {
      markSaving(row.id, 'status_prod')
      try {
        const hasDebt = await checkInadimplencia(tenantId, row.cliente_nome)
        if (hasDebt) {
          updateRow(row.id, { status_prod: 'Aguard. pag.' })
          await saveProducaoField(tenantId, row.id, { status_prod: 'Aguard. pag.' })
          markDone(row.id, 'status_prod', false)
          setModalErr({
            titulo: '🚫 Cliente Inadimplente',
            mensagem: `<b>${row.cliente_nome}</b> possui cobranças em aberto.<br><br>Status alterado para <b>Aguard. pag.</b> automaticamente.`,
          })
          return
        }
        const patch = { status_prod: 'Pronto' }
        if (!row.data_pronto) patch.data_pronto = new Date().toISOString().slice(0, 10)
        updateRow(row.id, patch)
        await saveProducaoField(tenantId, row.id, patch)
        markDone(row.id, 'status_prod', true)
      } catch {
        markDone(row.id, 'status_prod', false)
      }
      return
    }

    await saveField(row, { status_prod: newVal })
  }, [tenantId, saveField])

  // ── Status Entrega change ──
  const handleStatusEntregaChange = useCallback(async (row, newVal) => {
    const patch = { status_entrega: newVal }
    if ((newVal === 'Enviado' || newVal === 'Retirou') && !row.data_enviado) {
      patch.data_enviado = new Date().toISOString().slice(0, 10)
    }
    updateRow(row.id, patch)
    markSaving(row.id, 'status_entrega')
    try {
      await saveProducaoField(tenantId, row.id, patch)
      markDone(row.id, 'status_entrega', true)
    } catch {
      markDone(row.id, 'status_entrega', false)
    }
  }, [tenantId])

  // ── Motivo atraso ──
  const handleMotivoSave = useCallback(async () => {
    if (!modalMotivo || !motivoText.trim()) return
    const row = rows.find((r) => r.id === modalMotivo)
    if (!row) return
    const novaObs = `ATRASO: ${motivoText.trim()}`
    try {
      await saveProducaoField(tenantId, row.id, { obs_prod: novaObs })
      updateRow(row.id, { obs_prod: novaObs })
    } catch {}
    setModalMotivo(null)
    setMotivoText('')
  }, [modalMotivo, motivoText, rows, tenantId])

  // ── Novo pedido ──
  const handleNovoPedido = useCallback(async () => {
    if (!novoCliente.trim()) return
    try {
      await createProducaoPedido(tenantId, novoCliente.trim())
      setNovoCliente('')
      await loadData()
    } catch (e) {
      setModalErr({ titulo: '⚠️ Erro', mensagem: e.message })
    }
  }, [tenantId, novoCliente, loadData])

  const handleDuplicar = useCallback(async (id) => {
    try {
      await duplicateProducaoPedido(tenantId, id)
      await loadData()
    } catch (e) {
      setModalErr({ titulo: '⚠️ Erro', mensagem: e.message })
    }
  }, [tenantId, loadData])

  // ── Filtro ──
  const filteredRows = useMemo(() => {
    const terms = busca.toLowerCase().split(',').map((v) => v.trim()).filter(Boolean)
    return rows.filter((row) => {
      if (!modeFilter(row, mode)) return false
      if (!terms.length) return true
      const txt = [row.cliente_nome, row.obs_cliente, row.obs_prod, row.pedido_codigo, row.msg_cobranca, row.rastreio]
        .join(' ').toLowerCase()
      return terms.every((t) => txt.includes(t))
    })
  }, [rows, mode, busca])

  // ── Stats ──
  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const prontosHoje = rows.filter((r) => (r.data_pronto || '').slice(0, 10) === today && r.status_prod !== 'Repetido').length
    const pendentes = rows.filter((r) => modeFilter(r, 'producao')).length
    const prontos = rows.filter((r) => (r.status_prod === 'Pronto' || r.status_prod === 'Liberado') && r.status_prod !== 'Repetido').length
    return { prontosHoje, pendentes, prontos, total: rows.filter((r) => r.status_prod !== 'Repetido').length }
  }, [rows])

  const hideDelivery = mode === 'producao'

  // ── Row class ──
  function rowClass(row) {
    if (row.bloqueado) return 'prod-row-blocked'
    if (row.atrasado) return 'prod-row-delayed'
    return ''
  }

  return (
    <AppShell title="Produção" flush>
      <div className="prod-v2">

        {/* Toolbar */}
        <div className="prod-v2-toolbar">
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              className="prod-v2-input"
              list="prod-v2-clientes"
              placeholder="Cliente para novo pedido"
              value={novoCliente}
              onChange={(e) => setNovoCliente(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleNovoPedido() }}
              style={{ width: 200 }}
            />
            <button type="button" className="prod-btn prod-btn-green" onClick={handleNovoPedido} disabled={loading}>
              + Novo
            </button>
            <button type="button" className="prod-btn prod-btn-ghost" onClick={() => setShowDash(true)}>
              📊 Estatísticas
            </button>
          </div>

          <input
            className="prod-v2-input"
            placeholder="Buscar (vírgula para múltiplos termos)"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={{ flex: 1, minWidth: 200 }}
          />

          <div className="prod-v2-tabs">
            {[
              { key: 'producao',  label: 'EM PRODUÇÃO' },
              { key: 'prontos',   label: 'PRONTOS' },
              { key: 'finalizados', label: 'ENVIADOS' },
            ].map((t) => (
              <button type="button" key={t.key}
                className={`prod-v2-tab${mode === t.key ? ' active' : ''}`}
                onClick={() => setMode(t.key)}>
                {t.label}
              </button>
            ))}
          </div>

          <span className="prod-v2-count">{filteredRows.length} REG.</span>
        </div>

        {/* Stats */}
        <div className="prod-v2-stats">
          {[
            { label: 'Prontos Hoje', val: stats.prontosHoje, color: '#22c55e' },
            { label: 'Total',        val: stats.total,       color: '#00bcd4' },
            { label: 'Prontos',      val: stats.prontos,     color: '#22c55e' },
            { label: 'Pendentes',    val: stats.pendentes,   color: '#ff9800' },
          ].map((c) => (
            <div key={c.label} className="prod-v2-stat-card">
              <div className="prod-v2-stat-label">{c.label}</div>
              <div className="prod-v2-stat-val" style={{ color: c.color }}>{c.val}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="prod-v2-table-wrap">
          {loading && <div className="prod-v2-empty">Carregando...</div>}
          {!loading && filteredRows.length === 0 && (
            <div className="prod-v2-empty">Nenhum registro encontrado.</div>
          )}

          {!loading && filteredRows.length > 0 && (
            <table className={`prod-v2-table${hideDelivery ? ' focus-mode' : ''}`}>
              <thead>
                <tr>
                  <th>Solicitado</th>
                  <th>Dias</th>
                  <th>Cliente</th>
                  <th>Status Prod.</th>
                  <th>Obs Cliente</th>
                  <th>Obs Prod.</th>
                  <th>Peso</th>
                  <th>Pacote</th>
                  <th>Data Pronto</th>
                  {!hideDelivery && <th>Status Entrega</th>}
                  {!hideDelivery && <th>Pedido</th>}
                  {!hideDelivery && <th>Frete</th>}
                  {!hideDelivery && <th>Msg Cobrança</th>}
                  {!hideDelivery && <th>Enviado</th>}
                  {!hideDelivery && <th>Rastreio</th>}
                  {!hideDelivery && <th>WA / Link</th>}
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const waLink = buildWaLink(row.whatsapp)
                  const rastreioLink = row.link_rastreio || ''
                  const precisaMotivo = row.atrasado && !(row.obs_prod || '').toUpperCase().includes('ATRASO')
                  return (
                    <tr key={row.id} className={rowClass(row)}>
                      {/* Solicitado */}
                      <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{row.data_solicitado_fmt}</td>

                      {/* Dias */}
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span style={{ color: row.atrasado ? '#ff9800' : 'inherit', fontWeight: row.atrasado ? 700 : 400 }}>
                          {row.dias_u}
                        </span>
                        {precisaMotivo && (
                          <button type="button"
                            onClick={() => { setModalMotivo(row.id); setMotivoText('') }}
                            style={{
                              marginLeft: 4, fontSize: 10, padding: '1px 5px',
                              background: '#f44336', color: '#fff', border: 'none',
                              borderRadius: 3, cursor: 'pointer', lineHeight: 1.4,
                            }}>
                            + MOTIVO
                          </button>
                        )}
                      </td>

                      {/* Cliente */}
                      <td>
                        <input
                          className="prod-v2-cell"
                          list="prod-v2-clientes"
                          value={row.cliente_nome || ''}
                          onChange={(e) => updateRow(row.id, { cliente_nome: e.target.value })}
                          onBlur={() => saveField(row, { cliente_nome: row.cliente_nome })}
                          style={{ borderColor: fieldBorder(row.id, 'cliente_nome') }}
                        />
                      </td>

                      {/* Status Prod */}
                      <td>
                        <select
                          className="prod-v2-cell"
                          value={row.status_prod || ''}
                          onChange={(e) => handleStatusProdChange(row, e.target.value)}
                          style={{ borderColor: fieldBorder(row.id, 'status_prod') }}
                        >
                          <option value="">--</option>
                          {STATUS_PROD_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </td>

                      {/* Obs Cliente */}
                      <td>
                        <input className="prod-v2-cell" value={row.obs_cliente || ''}
                          onChange={(e) => updateRow(row.id, { obs_cliente: e.target.value })}
                          onBlur={() => saveField(row, { obs_cliente: row.obs_cliente })}
                          style={{ borderColor: fieldBorder(row.id, 'obs_cliente') }} />
                      </td>

                      {/* Obs Prod */}
                      <td>
                        <input className="prod-v2-cell" value={row.obs_prod || ''}
                          onChange={(e) => updateRow(row.id, { obs_prod: e.target.value })}
                          onBlur={() => saveField(row, { obs_prod: row.obs_prod })}
                          style={{ borderColor: fieldBorder(row.id, 'obs_prod') }} />
                      </td>

                      {/* Peso */}
                      <td>
                        <input className="prod-v2-cell" value={row.peso || ''} style={{ width: 60, borderColor: fieldBorder(row.id, 'peso') }}
                          onChange={(e) => updateRow(row.id, { peso: e.target.value })}
                          onBlur={() => saveField(row, { peso: row.peso })} />
                      </td>

                      {/* Pacote */}
                      <td>
                        <select className="prod-v2-cell" value={row.pacote || ''}
                          onChange={(e) => { updateRow(row.id, { pacote: e.target.value }); saveField({ ...row, pacote: e.target.value }, { pacote: e.target.value }) }}
                          style={{ borderColor: fieldBorder(row.id, 'pacote') }}>
                          <option value="">--</option>
                          {PACOTE_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </td>

                      {/* Data Pronto */}
                      <td style={{ fontSize: 12, whiteSpace: 'nowrap', color: row.data_pronto_fmt ? '#22c55e' : 'inherit' }}>
                        {row.data_pronto_fmt || '—'}
                      </td>

                      {/* Delivery columns — hidden in focus mode */}
                      {!hideDelivery && (
                        <td>
                          <select className="prod-v2-cell" value={row.status_entrega || ''}
                            onChange={(e) => handleStatusEntregaChange(row, e.target.value)}
                            style={{ borderColor: fieldBorder(row.id, 'status_entrega') }}>
                            <option value="">--</option>
                            {STATUS_ENTREGA_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </td>
                      )}

                      {!hideDelivery && (
                        <td>
                          <input className="prod-v2-cell" value={row.pedido_codigo || ''}
                            onChange={(e) => updateRow(row.id, { pedido_codigo: e.target.value })}
                            onBlur={() => saveField(row, { pedido_codigo: row.pedido_codigo })}
                            style={{ width: 80, borderColor: fieldBorder(row.id, 'pedido_codigo') }} />
                        </td>
                      )}

                      {!hideDelivery && (
                        <td>
                          <input className="prod-v2-cell" value={row.valor_frete || ''}
                            onChange={(e) => updateRow(row.id, { valor_frete: e.target.value })}
                            onBlur={() => saveField(row, { valor_frete: row.valor_frete })}
                            style={{ width: 70, borderColor: fieldBorder(row.id, 'valor_frete') }} />
                        </td>
                      )}

                      {!hideDelivery && (
                        <td>
                          <input className="prod-v2-cell" value={row.msg_cobranca || ''}
                            onChange={(e) => updateRow(row.id, { msg_cobranca: e.target.value })}
                            onBlur={() => saveField(row, { msg_cobranca: row.msg_cobranca })}
                            style={{ borderColor: fieldBorder(row.id, 'msg_cobranca') }} />
                        </td>
                      )}

                      {!hideDelivery && (
                        <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                          {rastreioLink
                            ? <a href={rastreioLink} target="_blank" rel="noreferrer" style={{ color: '#00bcd4', textDecoration: 'none' }}>{row.data_enviado_fmt || 'Ver'}</a>
                            : <span>{row.data_enviado_fmt || '—'}</span>
                          }
                        </td>
                      )}

                      {!hideDelivery && (
                        <td>
                          <input className="prod-v2-cell" value={row.rastreio || ''}
                            onChange={(e) => updateRow(row.id, { rastreio: e.target.value })}
                            onBlur={() => saveField(row, { rastreio: row.rastreio })}
                            style={{ borderColor: fieldBorder(row.id, 'rastreio') }} />
                        </td>
                      )}

                      {!hideDelivery && (
                        <td style={{ textAlign: 'center' }}>
                          {waLink
                            ? <a href={waLink} target="_blank" rel="noreferrer" title="WhatsApp"><IconWa /></a>
                            : (
                              <button type="button" title="Copiar nome"
                                onClick={() => navigator.clipboard?.writeText(row.cliente_nome || '')}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                                <IconCopy />
                              </button>
                            )
                          }
                        </td>
                      )}

                      {/* Ações */}
                      <td>
                        <button type="button" className="prod-btn prod-btn-ghost"
                          style={{ fontSize: 11, padding: '2px 8px' }}
                          onClick={() => handleDuplicar(row.id)}>
                          Dup.
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

        {/* Modals */}
        {modalErr && <ErrModal titulo={modalErr.titulo} mensagem={modalErr.mensagem} onClose={() => setModalErr(null)} />}
        {modalMotivo !== null && (
          <MotivoModal
            value={motivoText}
            onChange={setMotivoText}
            onConfirm={handleMotivoSave}
            onClose={() => { setModalMotivo(null); setMotivoText('') }}
          />
        )}
        {showDash && <DashboardModal rows={rows} onClose={() => setShowDash(false)} />}
      </div>
    </AppShell>
  )
}
