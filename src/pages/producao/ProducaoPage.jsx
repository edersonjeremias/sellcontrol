import { Fragment, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import AppShell from '../../components/ui/AppShell'
import { useAuth } from '../../context/AuthContext'
import {
  STATUS_ENTREGA_OPTS, STATUS_PROD_OPTS, PACOTE_OPTS,
  createProducaoPedido, duplicateProducaoPedido, getProducaoData,
  checkInadimplencia, saveProducaoField,
  getPecasPendentesCliente, slugCliente,
} from '../../services/producaoService'
// PACOTE_OPTS é usado como fallback quando a empresa não cadastrou embalagens
import { getConfig } from '../../services/configService'
import { hojeISO } from '../../lib/datas'
import { linkRastreio } from '../../lib/rastreio'
import { calcRomaneioTotal, getStatusPedido } from '../../services/pedidosService'
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

const IconChevron = ({ aberto }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    style={{ transform: aberto ? 'rotate(90deg)' : 'none', transition: 'transform .12s' }}>
    <path d="M9 18l6-6-6-6"/>
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

// Até esta quantidade de peças a sacolinha é pequena o bastante para a equipe
// montar na hora, na frente de quem tem 20+ peças. Destacada em verde.
const PECAS_RAPIDO = 3

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

  // Melhor Rastreio: abre preenchido, sem captcha, e atende Jadlog também
  const url = linkRastreio(cod)
  if (!url) return null
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

// ── Card do celular ────────────────────────────────────────────
// No celular a tabela não cabe: cada pedido vira um card e toda a edição
// acontece no DetalheModal, que já existia para o duplo clique do desktop.
function CardProducao({ row, mode, pecasAberta, onAbrir, onTogglePecas }) {
  const cor = spColor(row.status_prod)
  const entrega = mode !== 'producao'
  const cls = row.bloqueado ? ' prod-card-blocked' : row.atrasado ? ' prod-card-delayed' : ''

  return (
    <div className={`prod-card${cls}`} style={{ borderLeftColor: cor }}>
      <div className="prod-card-main" role="button" tabIndex={0} onClick={onAbrir}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir() } }}>
        <div className="prod-card-topo">
          <span className="prod-card-cliente">
            {row.atrasado && <span title="Atrasado">⏳ </span>}
            {row.cliente_nome || '—'}
          </span>
          {!entrega && row.pecas_pendentes > 0 && (
            <span className="prod-card-pecas"
              style={{ color: row.pecas_pendentes <= PECAS_RAPIDO ? '#22c55e' : '#f0f0f1' }}>
              {row.pecas_pendentes} pç
            </span>
          )}
        </div>

        <div className="prod-card-sub">
          <span>{row.data_solicitado_fmt}</span>
          <span style={{ color: row.atrasado ? '#ff9800' : '#abb1bd', fontWeight: row.atrasado ? 700 : 400 }}>
            {row.dias_u} dia(s)
          </span>
          {row.pacote && <span>{row.pacote}</span>}
          {row.peso && <span>{row.peso}</span>}
          {entrega && row.romaneio && <span>Rom. {row.romaneio}</span>}
        </div>

        <div className="prod-card-status-linha">
          <span style={{ color: cor }}>{row.status_prod || 'Sem status'}</span>
          {entrega && row.status_entrega && <span className="prod-card-entrega">{row.status_entrega}</span>}
          {entrega && row.data_pronto_fmt && <span className="prod-card-pronto">✓ {row.data_pronto_fmt}</span>}
        </div>

        {row.obs_cliente && <div className="prod-card-obs">💬 {row.obs_cliente}</div>}
        {row.obs_prod   && <div className="prod-card-obs prod-card-obs-prod">🛠 {row.obs_prod}</div>}
      </div>

      {mode === 'producao' && (
        <div className="prod-card-acoes">
          <button type="button" className="prod-dup-btn" onClick={onTogglePecas}
            title={pecasAberta ? 'Ocultar as peças' : 'Ver as peças da cliente'}>
            <IconChevron aberto={pecasAberta} />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Linha expandida: peças da cliente ainda não enviadas ───────
function PecasExpandidas({ estado, statusCores }) {
  if (!estado || estado.loading) return <div className="prod-pecas-aviso">Carregando as peças…</div>
  if (estado.erro)              return <div className="prod-pecas-aviso prod-pecas-erro">{estado.erro}</div>
  if (!estado.itens.length)     return <div className="prod-pecas-aviso">Nenhuma peça pendente para esta cliente.</div>

  return (
    <div className="prod-pecas-lista">
      {estado.itens.map((it) => (
        <div key={it.id} className="prod-pecas-item">
          <span className="prod-pecas-cod">{it.codigo ? `#${it.codigo}` : '—'}</span>
          <span className="prod-pecas-desc">{it.descricao || '(sem descrição)'}</span>
          {it.data_live_fmt && <span className="prod-pecas-data">{it.data_live_fmt}</span>}
          <span className="prod-pecas-status" style={{ color: statusCores?.[it.status] || '#abb1bd' }}>
            {it.status || '—'}
          </span>
        </div>
      ))}
      <div className="prod-pecas-rodape">{estado.itens.length} peça(s) ainda não enviada(s)</div>
    </div>
  )
}

// ── Modal: Colunas opcionais ───────────────────────────────────
const COLUNAS_OPCIONAIS = [
  { key: 'peso',   label: 'Coluna Peso' },
  { key: 'pacote', label: 'Coluna Pacote' },
]

function ColunasModal({ cols, onChange, onClose }) {
  return (
    <div className="prod-modal-overlay" onClick={onClose}>
      <div className="prod-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 320 }}>
        <div className="prod-modal-header">
          <span>⚙ Colunas Opcionais</span>
          <button type="button" className="prod-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="prod-modal-body">
          {COLUNAS_OPCIONAIS.map(({ key, label }) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,.07)', cursor: 'pointer', color: '#f0f0f1', fontSize: 13 }}>
              <input type="checkbox" checked={!!cols[key]}
                onChange={(e) => onChange((prev) => ({ ...prev, [key]: e.target.checked }))}
                style={{ width: 16, height: 16, accentColor: '#00bcd4', cursor: 'pointer' }} />
              {label}
            </label>
          ))}
          <p style={{ color: '#abb1bd', fontSize: 12, marginTop: 12, lineHeight: 1.5 }}>
            As colunas desmarcadas somem da tabela e o espaço vai para as colunas de texto.
          </p>
        </div>
        <div className="prod-modal-footer">
          <button type="button" className="prod-btn prod-btn-ghost" onClick={onClose}>Fechar</button>
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

  // Peças da cliente: abre por linha e só busca no banco quando a seta é clicada
  const [pecasAbertas, setPecasAbertas] = useState({})   // row.id -> true
  const [pecasCache,   setPecasCache]   = useState({})   // slug   -> { loading, erro, itens }
  const pecasAbertasRef = useRef({})
  const pecasCacheRef   = useRef({})
  const rowsRef         = useRef([])
  const [statusCores, setStatusCores] = useState(null)
  const statusCoresRef = useRef(null)

  const togglePecas = useCallback((row) => {
    const slug    = slugCliente(row.cliente_nome)
    const abrindo = !pecasAbertasRef.current[row.id]

    const abertas = { ...pecasAbertasRef.current }
    if (abrindo) abertas[row.id] = true
    else         delete abertas[row.id]
    pecasAbertasRef.current = abertas
    setPecasAbertas(abertas)

    if (!slug) return

    const gravaCache = (valor) => {
      pecasCacheRef.current = { ...pecasCacheRef.current, [slug]: valor }
      setPecasCache(pecasCacheRef.current)
    }

    if (!abrindo) {
      // Fechou a última linha desta cliente: descarta o que foi carregado, para
      // que a próxima abertura traga o status atual da Expedição.
      const aindaAberta = rowsRef.current.some(
        (r) => abertas[r.id] && slugCliente(r.cliente_nome) === slug
      )
      if (!aindaAberta) {
        const resto = { ...pecasCacheRef.current }
        delete resto[slug]
        pecasCacheRef.current = resto
        setPecasCache(resto)
      }
      return
    }

    // As cores dos status são do tenant: busca uma vez, na primeira expansão
    if (!statusCoresRef.current) {
      statusCoresRef.current = {}
      getStatusPedido(tenantId)
        .then(({ cores }) => { statusCoresRef.current = cores || {}; setStatusCores(cores || {}) })
        .catch(() => {})
    }

    if (pecasCacheRef.current[slug]) return   // já carregado (ou carregando)

    gravaCache({ loading: true, erro: null, itens: [] })
    getPecasPendentesCliente(tenantId, row.cliente_nome)
      .then((itens) => gravaCache({ loading: false, erro: null, itens }))
      .catch((e)    => gravaCache({ loading: false, erro: e.message || 'Erro ao carregar as peças.', itens: [] }))
  }, [tenantId])

  // No celular a tabela vira lista de cards (o mesmo caminho da tela de Cobranças)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768)
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const [showSettings, setShowSettings] = useState(false)
  const [colsConfig,   setColsConfig]   = useState({ peso: true, pacote: true })

  // ── Colunas opcionais (lembradas por empresa) ───────────────
  useEffect(() => {
    if (!tenantId) return
    try {
      const salvo = JSON.parse(localStorage.getItem(`sc_prod_cols_${tenantId}`))
      if (salvo) setColsConfig((p) => ({ ...p, ...salvo }))
    } catch {}
  }, [tenantId])
  useEffect(() => {
    if (!tenantId) return
    localStorage.setItem(`sc_prod_cols_${tenantId}`, JSON.stringify(colsConfig))
  }, [colsConfig, tenantId])

  // ── Load ────────────────────────────────────────────────────
  // silencioso: recarrega sem esconder a tabela nem abrir modal de erro
  const loadData = useCallback(async (signal, { silencioso = false } = {}) => {
    if (!tenantId) return
    if (!silencioso) setLoading(true)
    try {
      const [data, cfg] = await Promise.all([getProducaoData(tenantId), getConfig(tenantId)])
      if (signal?.cancelled) return
      setRows(data.rows); setClientes(data.clientes)
      if (cfg?.link_frete) setLinkFrete(cfg.link_frete)
      if (cfg?.pacotes?.length) setPacoteOpts(cfg.pacotes)
    } catch (e) {
      if (signal?.cancelled || silencioso) return
      setModalErr({ titulo: '⚠️ Erro', mensagem: e.message || 'Erro ao carregar.' })
    } finally {
      if (!signal?.cancelled && !silencioso) setLoading(false)
    }
  }, [tenantId])

  useEffect(() => {
    const signal = { cancelled: false }
    loadData(signal)
    return () => { signal.cancelled = true }
  }, [loadData])

  // Espelho do estado da tela para o timer consultar sem se reiniciar
  const uiRef = useRef({})
  uiRef.current = { modalErr, modalMotivo, showDash, detalhe, saving }
  rowsRef.current = rows

  // ── Atualização automática (10 min) ─────────────────────────
  // Pula o ciclo se alguém estiver mexendo na tela, para não
  // sobrescrever o que ainda está sendo digitado ou salvo.
  useEffect(() => {
    if (!tenantId) return
    const signal = { cancelled: false }

    const ocupado = () => {
      const { modalErr: e, modalMotivo: m, showDash: d, detalhe: det, saving: s } = uiRef.current
      if (e || m !== null || d || det) return true
      if (Object.keys(s || {}).length > 0) return true
      const el = document.activeElement
      return !!el && ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)
    }

    const timer = setInterval(() => {
      if (document.hidden || ocupado()) return
      loadData(signal, { silencioso: true })
    }, 10 * 60 * 1000)

    return () => { signal.cancelled = true; clearInterval(timer) }
  }, [tenantId, loadData])

  // ── Saving helpers ──────────────────────────────────────────
  const markSaving = useCallback((id, field) => {
    setSaving((p) => ({ ...p, [fk(id, field)]: 'saving' }))
  }, [])

  const markDone = useCallback((id, field, ok) => {
    setSaving((p) => ({ ...p, [fk(id, field)]: ok ? 'ok' : 'error' }))
    setTimeout(() => {
      setSaving((p) => {
        const n = { ...p }
        delete n[fk(id, field)]
        return n
      })
    }, 1200)
  }, [])

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
  }, [tenantId, markSaving, markDone])

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
          const hoje = hojeISO()
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
  }, [tenantId, savePatch, updRow, profile, markSaving, markDone])

  // ── Status Entrega ──────────────────────────────────────────
  const handleStatusEntrega = useCallback(async (row, val) => {
    const dbPatch = { status_entrega: val }
    const localExtra = {}
    if ((val === 'Enviado' || val === 'Retirou') && !row.data_enviado) {
      const hoje = hojeISO()
      dbPatch.data_enviado = hoje
      localExtra.data_enviado_fmt = fmtDateBr(hoje)
    }
    updRow(row.id, { ...dbPatch, ...localExtra })
    markSaving(row.id, 'status_entrega')
    try {
      await saveProducaoField(tenantId, row.id, dbPatch)
      markDone(row.id, 'status_entrega', true)
    } catch { markDone(row.id, 'status_entrega', false) }
  }, [tenantId, updRow, markSaving, markDone])

  // ── Pacote ──────────────────────────────────────────────────
  const handlePacote = useCallback(async (row, val) => {
    updRow(row.id, { pacote: val })
    markSaving(row.id, 'pacote')
    try {
      await saveProducaoField(tenantId, row.id, { pacote: val })
      markDone(row.id, 'pacote', true)
    } catch { markDone(row.id, 'pacote', false) }
  }, [tenantId, updRow, markSaving, markDone])

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
  }, [tenantId, updRow, markSaving, markDone])

  // ── DetalheModal save ───────────────────────────────────────
  // Os dois status ficam de fora do patch cru porque cada um tem regra
  // própria — trava de inadimplência, data de pronto, montador, data de
  // envio. Salvá-los direto aqui passava por cima de tudo isso, e no celular
  // o modal é o único caminho de edição.
  const handleDetalheSave = useCallback(async (updated) => {
    const original = rowsRef.current.find((r) => r.id === updated.id) || updated
    try {
      const patch = {
        obs_cliente: updated.obs_cliente || '',
        obs_prod: updated.obs_prod || '', peso: updated.peso || '', pacote: updated.pacote || '',
        pedido_codigo: updated.pedido_codigo || '',
        valor_frete: updated.valor_frete || '', valor_dec: updated.valor_dec || '',
        msg_cobranca: updated.msg_cobranca || '', rastreio: updated.rastreio || '',
      }
      await saveProducaoField(tenantId, updated.id, patch)
      updRow(updated.id, patch)

      const base = { ...original, ...patch }
      if ((updated.status_prod || '') !== (original.status_prod || '')) {
        await handleStatusProd(base, updated.status_prod || '')
      }
      if ((updated.status_entrega || '') !== (original.status_entrega || '')) {
        await handleStatusEntrega(base, updated.status_entrega || '')
      }
      // O romaneio também puxa o valor declarado sozinho
      if (String(updated.romaneio || '') !== String(original.romaneio || '')) {
        await handleRomaneioBlur(base, String(updated.romaneio || ''))
      }
    } catch (e) { setModalErr({ titulo: '⚠️ Erro', mensagem: e.message }) }
  }, [tenantId, updRow, handleStatusProd, handleStatusEntrega, handleRomaneioBlur])

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

  // Larguras do modo "Em Produção" (table-layout: fixed). O espaço das colunas
  // ocultas volta para as colunas de texto, que são as que ganham com mais área.
  const colWidths = useMemo(() => {
    const base = [
      { key: 'solicitado',  w: 9  },
      { key: 'dias',        w: 4  },
      { key: 'pecas',       w: 5  },
      { key: 'cliente',     w: 13 },
      { key: 'status',      w: 12 },
      { key: 'obs_cliente', w: 17 },
      { key: 'obs_prod',    w: 17 },
      { key: 'peso',        w: 6  },
      { key: 'pacote',      w: 12 },
      { key: 'mais',        w: 5  },
    ]
    const opcional = (k) => k === 'peso' || k === 'pacote'
    const sobra = base.filter((c) => opcional(c.key) && !colsConfig[c.key])
                      .reduce((acc, c) => acc + c.w, 0)
    const fatia = { cliente: .25, obs_cliente: .375, obs_prod: .375 }
    return base.filter((c) => !opcional(c.key) || colsConfig[c.key])
               .map((c) => c.w + sobra * (fatia[c.key] || 0))
  }, [colsConfig])

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
            {!isMobile && (
            <button type="button" className="prod-v2-tab prod-v2-tab-icon"
              onClick={() => setShowSettings(true)} title="Configurações de colunas">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
            )}
            {[{ key:'producao', label:'EM PRODUÇÃO'}, { key:'prontos', label:'PRONTOS'}, { key:'finalizados', label:'ENVIADOS'}].map((t) => (
              <button type="button" key={t.key}
                className={`prod-v2-tab${mode === t.key ? ' active' : ''}`}
                onClick={() => setMode(t.key)}>{t.label}</button>
            ))}
            <button type="button" className="prod-v2-tab" onClick={() => setShowDash(true)}>ESTATÍSTICAS</button>
            <span className="prod-v2-count">{filteredRows.length} REGISTROS</span>
          </div>
        </div>

        {/* ── Table ── */}
        <div className="prod-v2-table-wrap">
          {loading && <div className="prod-v2-empty">Carregando...</div>}
          {!loading && filteredRows.length === 0 && <div className="prod-v2-empty">Nenhum registro encontrado.</div>}
          {!loading && filteredRows.length > 0 && isMobile && (
            <div className="prod-card-lista">
              {filteredRows.map((row) => (
                <Fragment key={row.id}>
                  <CardProducao
                    row={row}
                    mode={mode}
                    pecasAberta={!!pecasAbertas[row.id]}
                    onAbrir={() => setDetalhe(row)}
                    onTogglePecas={() => togglePecas(row)}
                  />
                  {mode === 'producao' && pecasAbertas[row.id] && (
                    <div className="prod-card-pecas-box">
                      <PecasExpandidas statusCores={statusCores}
                        estado={pecasCache[slugCliente(row.cliente_nome)]} />
                    </div>
                  )}
                </Fragment>
              ))}
            </div>
          )}

          {!loading && filteredRows.length > 0 && !isMobile && (
            <table className={`prod-v2-table${mode === 'producao' ? ' prod-table-producao' : ''}`}>
              {mode === 'producao' && (
                <colgroup>
                  {colWidths.map((w, i) => <col key={i} style={{ width: `${w}%` }} />)}
                </colgroup>
              )}
              <thead>
                <tr>
                  <th>SOLICITADO</th>
                  <th style={{ textAlign:'center' }}>DIAS</th>
                  {!showDelivery && <th style={{ textAlign:'center' }} title="Peças do cliente ainda não enviadas">PEÇAS</th>}
                  <th>CLIENTE</th>
                  <th>STATUS PROD.</th>
                  <th>OBS. CLIENTE</th>
                  <th>OBS. PROD.</th>
                  {colsConfig.peso   && <th>PESO</th>}
                  {colsConfig.pacote && <th>PACOTE</th>}
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
                  const pecasAberta = mode === 'producao' && !!pecasAbertas[row.id]
                  return (
                    <Fragment key={row.id}>
                    <tr className={cls}>
                      {/* Solicitado */}
                      <td className="prod-td-nb">{row.data_solicitado_fmt}</td>

                      {/* Dias */}
                      <td className="prod-td-nb" style={{ textAlign:'center' }}>
                        <span style={{ color: row.atrasado ? '#ff9800' : '#f0f0f1', fontWeight: row.atrasado ? 700 : 400 }}>{row.dias_u}</span>
                      </td>

                      {/* Peças pendentes: verde = sacolinha pequena, dá p/ montar na frente */}
                      {!showDelivery && (
                        <td className="prod-td-nb" style={{ textAlign:'center' }}
                          title={`${row.pecas_pendentes} peça(s) ainda não enviada(s)`}>
                          {row.pecas_pendentes > 0
                            ? <span style={{ color: row.pecas_pendentes <= PECAS_RAPIDO ? '#22c55e' : '#f0f0f1', fontWeight: row.pecas_pendentes <= PECAS_RAPIDO ? 700 : 400 }}>{row.pecas_pendentes}</span>
                            : <span style={{ color: '#6b7280' }}>—</span>}
                        </td>
                      )}

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

                      {/* Obs Cliente — ocupa a coluna inteira; o texto todo fica no title */}
                      <td>
                        <input className="prod-v2-cell prod-obs-cell" style={{ borderColor: bc(row.id,'obs_cliente') }}
                          title={row.obs_cliente || ''}
                          value={row.obs_cliente || ''}
                          onChange={(e) => updRow(row.id, { obs_cliente: e.target.value })}
                          onBlur={(e) => savePatch(row.id, 'obs_cliente', e.target.value)} />
                      </td>

                      {/* Obs Prod */}
                      <td>
                        <input className="prod-v2-cell prod-obs-cell" style={{ borderColor: bc(row.id,'obs_prod') }}
                          title={row.obs_prod || ''}
                          value={row.obs_prod || ''}
                          onChange={(e) => updRow(row.id, { obs_prod: e.target.value })}
                          onBlur={(e) => savePatch(row.id, 'obs_prod', e.target.value)} />
                      </td>

                      {/* Peso */}
                      {colsConfig.peso && (
                        <td>
                          <input className="prod-v2-cell" style={{ width: 50, borderColor: bc(row.id,'peso') }}
                            value={row.peso || ''}
                            onChange={(e) => updRow(row.id, { peso: e.target.value })}
                            onBlur={(e) => savePatch(row.id, 'peso', e.target.value)} />
                        </td>
                      )}

                      {/* Pacote */}
                      {colsConfig.pacote && (
                        <td>
                          <select className="prod-v2-cell" style={{ width: 100, borderColor: bc(row.id,'pacote') }}
                            value={row.pacote || ''}
                            onChange={(e) => handlePacote(row, e.target.value)}>
                            <option value="">--</option>
                            {pacoteOpts.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </td>
                      )}

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
                        <td style={{ position: 'relative' }}>
                          <input className="prod-v2-cell" style={{ width: 48, borderColor: bc(row.id,'romaneio') }}
                            value={row.romaneio || ''}
                            onChange={(e) => updRow(row.id, { romaneio: e.target.value })}
                            onBlur={(e) => handleRomaneioBlur(row, e.target.value)} />
                          {row.romaneio_frete_pago && (
                            <span style={{
                              position: 'absolute',
                              top: 2,
                              right: 2,
                              background: '#22c55e',
                              color: '#0f0f0f',
                              fontSize: 9,
                              fontWeight: 700,
                              padding: '1px 4px',
                              borderRadius: 3,
                              lineHeight: 1,
                            }} title={`Frete pago via ${row.romaneio_transportadora || 'transportadora'}`}>
                              ✓ PAGO
                            </span>
                          )}
                        </td>
                      )}

                      {showDelivery && (
                        <td>
                          {/* Sem digitação, mostra o código que veio do Melhor Envio */}
                          <input className="prod-v2-cell" style={{ width: 75, borderColor: bc(row.id,'rastreio') }}
                            title={!row.rastreio && row.romaneio_codigo_rastreio
                              ? `Rastreio do romaneio ${row.romaneio} (${row.romaneio_transportadora || 'transportadora'})`
                              : undefined}
                            value={row.rastreio || row.romaneio_codigo_rastreio || ''}
                            onChange={(e) => updRow(row.id, { rastreio: e.target.value })}
                            onBlur={(e) => savePatch(row.id, 'rastreio', e.target.value)} />
                        </td>
                      )}

                      {showDelivery && (
                        <td style={{ textAlign: 'center' }}>
                          {(() => {
                            const waRastreio = buildWaRastreio(row.whatsapp, row.cliente_nome, row.rastreio || row.romaneio_codigo_rastreio, row.romaneio, tenantId)
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

                      {/* Expandir peças + Duplicar — só na aba Em Produção */}
                      {mode === 'producao' && (
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <button type="button" className="prod-dup-btn" onClick={() => togglePecas(row)}
                            title={pecasAbertas[row.id] ? 'Ocultar as peças da cliente' : 'Ver as peças da cliente ainda não enviadas'}>
                            <IconChevron aberto={!!pecasAbertas[row.id]} />
                          </button>
                          <button type="button" className="prod-dup-btn" onClick={() => handleDuplicar(row.id)} title="Duplicar">
                            <IconDup />
                          </button>
                        </td>
                      )}
                    </tr>

                    {pecasAberta && (
                      <tr className="prod-pecas-row">
                        <td colSpan={colWidths.length}>
                          <PecasExpandidas statusCores={statusCores}
                            estado={pecasCache[slugCliente(row.cliente_nome)]} />
                        </td>
                      </tr>
                    )}
                    </Fragment>
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
        {detalhe && (
          <DetalheModal row={detalhe} pacoteOpts={pacoteOpts}
            onSave={handleDetalheSave} onClose={() => setDetalhe(null)} />
        )}
        {showDash && <DashboardModal rows={rows} onClose={() => setShowDash(false)} />}
        {showSettings && (
          <ColunasModal cols={colsConfig} onChange={setColsConfig} onClose={() => setShowSettings(false)} />
        )}
      </div>
    </AppShell>
  )
}
