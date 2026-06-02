import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import AppShell from '../../components/ui/AppShell'
import {
  getColunas, salvarColunas, COLUNAS_DEFAULT,
  getConversas, getMensagens, responderAdmin,
  moverConversa, marcarLida, encerrarConversa,
} from '../../services/conversasService'

function fmtTempo(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const agora = new Date()
  const diff = Math.floor((agora - d) / 60000)
  if (diff < 1)   return 'agora'
  if (diff < 60)  return `${diff}min`
  if (diff < 1440) return `${Math.floor(diff/60)}h`
  return `${Math.floor(diff/1440)}d`
}

function fmtHora(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })
}

// ── Card de conversa no Kanban ─────────────────────────────────
function KanbanCard({ conversa, onAbrir, onMover, colunas }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div style={{
      background:'var(--card-bg)', border:'1px solid var(--border-light)', borderRadius:8,
      padding:'10px 12px', marginBottom:8, cursor:'pointer',
      borderLeft: conversa.nao_lidas > 0 ? '3px solid var(--blue)' : '3px solid transparent',
      opacity: conversa.encerrado ? 0.6 : 1,
    }}
      onClick={() => onAbrir(conversa)}
      onMouseEnter={e => e.currentTarget.style.background = '#252525'}
      onMouseLeave={e => e.currentTarget.style.background = 'var(--card-bg)'}
    >
      {/* Instagram + tempo */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
        <span style={{ fontSize:13, fontWeight:700, color:'var(--blue)' }}>
          @{(conversa.cliente_instagram||'').replace('@','')}
        </span>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          {conversa.nao_lidas > 0 && (
            <span style={{ background:'var(--blue)', color:'#0f0f0f', borderRadius:10, fontSize:10, fontWeight:700, padding:'1px 6px' }}>
              {conversa.nao_lidas}
            </span>
          )}
          <span style={{ fontSize:11, color:'var(--muted)' }}>{fmtTempo(conversa.updated_at)}</span>
        </div>
      </div>
      {/* Assunto */}
      <div style={{ fontSize:12, color:'var(--text-body)', marginBottom:6, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
        {conversa.assunto}
      </div>
      {/* Botão mover */}
      <div ref={ref} style={{ position:'relative' }} onClick={e => e.stopPropagation()}>
        <button
          onClick={() => setMenuOpen(o => !o)}
          style={{ background:'none', border:'1px solid var(--border-light)', borderRadius:4, fontSize:11, color:'var(--muted)', padding:'2px 8px', cursor:'pointer' }}
        >
          Mover ▾
        </button>
        {menuOpen && (
          <div style={{
            position:'absolute', top:'calc(100% + 4px)', left:0, zIndex:50,
            background:'var(--card-bg)', border:'1px solid var(--border-light)',
            borderRadius:6, minWidth:160, boxShadow:'0 4px 16px rgba(0,0,0,0.4)',
          }}>
            {colunas.map(col => (
              <button
                key={col.titulo}
                onClick={() => { onMover(conversa.id, col.titulo); setMenuOpen(false) }}
                style={{
                  display:'block', width:'100%', textAlign:'left', padding:'8px 12px',
                  background: col.titulo === conversa.coluna ? 'rgba(138,180,248,0.1)' : 'none',
                  border:'none', color: col.titulo === conversa.coluna ? 'var(--blue)' : 'var(--text-body)',
                  cursor:'pointer', fontSize:13, borderBottom:'1px solid var(--border-light)',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--table-row-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = col.titulo === conversa.coluna ? 'rgba(138,180,248,0.1)' : 'none'}
              >
                {col.titulo}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Modal de conversa ──────────────────────────────────────────
function ModalConversa({ conversa, onClose, onAtualizar, colunas, tenantId }) {
  const { showToast } = useApp()
  const [mensagens, setMensagens]   = useState([])
  const [resposta, setResposta]     = useState('')
  const [enviando, setEnviando]     = useState(false)
  const [editColuna, setEditColuna] = useState(false)
  const endRef = useRef(null)

  useEffect(() => {
    getMensagens(conversa.id).then(setMensagens)
    marcarLida(conversa.id)
  }, [conversa.id])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior:'smooth' })
  }, [mensagens])

  async function enviar() {
    if (!resposta.trim()) return
    setEnviando(true)
    try {
      await responderAdmin(conversa.id, resposta.trim())
      setResposta('')
      const msgs = await getMensagens(conversa.id)
      setMensagens(msgs)
      onAtualizar()
    } catch { showToast('Erro ao enviar.', 'error') }
    setEnviando(false)
  }

  async function toggleEncerrar() {
    try {
      await encerrarConversa(conversa.id, !conversa.encerrado)
      onAtualizar()
      onClose()
    } catch { showToast('Erro.', 'error') }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth:560, width:'95vw', maxHeight:'90vh', display:'flex', flexDirection:'column' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:15, fontWeight:700, color:'var(--blue)' }}>
              @{(conversa.cliente_instagram||'').replace('@','')}
            </div>
            <div style={{ fontSize:13, color:'var(--text-body)', marginTop:2 }}>{conversa.assunto}</div>
          </div>
          <div style={{ display:'flex', gap:6, flexShrink:0, alignItems:'center' }}>
            {/* Coluna dropdown */}
            <div style={{ position:'relative' }}>
              <button onClick={() => setEditColuna(o => !o)}
                style={{ background:'rgba(138,180,248,0.15)', border:'1px solid var(--blue)', borderRadius:4, color:'var(--blue)', fontSize:11, fontWeight:700, padding:'4px 10px', cursor:'pointer' }}>
                {conversa.coluna} ▾
              </button>
              {editColuna && (
                <div style={{ position:'absolute', top:'calc(100% + 4px)', right:0, zIndex:100, background:'var(--card-bg)', border:'1px solid var(--border-light)', borderRadius:6, minWidth:160, boxShadow:'0 4px 16px rgba(0,0,0,0.4)' }}>
                  {colunas.map(col => (
                    <button key={col.titulo} onClick={async () => { await moverConversa(conversa.id, col.titulo); setEditColuna(false); onAtualizar(); conversa.coluna = col.titulo }}
                      style={{ display:'block', width:'100%', textAlign:'left', padding:'8px 12px', background:'none', border:'none', color:'var(--text-body)', cursor:'pointer', fontSize:13, borderBottom:'1px solid var(--border-light)' }}
                      onMouseEnter={e=>e.currentTarget.style.background='var(--table-row-hover)'}
                      onMouseLeave={e=>e.currentTarget.style.background='none'}
                    >{col.titulo}</button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={toggleEncerrar}
              style={{ background: conversa.encerrado ? 'rgba(129,201,149,0.15)' : 'rgba(242,139,130,0.15)', border:'none', borderRadius:4, color: conversa.encerrado ? 'var(--green)' : 'var(--red)', fontSize:11, fontWeight:700, padding:'4px 10px', cursor:'pointer' }}>
              {conversa.encerrado ? '↩ Reabrir' : '✓ Encerrar'}
            </button>
            <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--muted)', fontSize:20, cursor:'pointer', lineHeight:1 }}>✕</button>
          </div>
        </div>

        {/* Mensagens */}
        <div style={{ flex:1, overflowY:'auto', padding:'16px', display:'flex', flexDirection:'column', gap:10 }}>
          {mensagens.map(m => {
            const isAdmin = m.remetente === 'admin'
            return (
              <div key={m.id} style={{ display:'flex', flexDirection:'column', alignItems: isAdmin ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth:'80%', padding:'10px 14px', borderRadius: isAdmin ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  background: isAdmin ? 'rgba(138,180,248,0.2)' : 'var(--header-bg)',
                  color:'var(--text-body)', fontSize:13, lineHeight:1.5,
                }}>
                  {m.texto}
                </div>
                <span style={{ fontSize:10, color:'var(--muted)', marginTop:3 }}>
                  {isAdmin ? 'Você' : (conversa.cliente_instagram||'').replace('@','')} · {fmtHora(m.created_at)}
                </span>
              </div>
            )
          })}
          {mensagens.length === 0 && <p style={{ color:'var(--muted)', textAlign:'center', fontSize:13 }}>Nenhuma mensagem ainda.</p>}
          <div ref={endRef} />
        </div>

        {/* Resposta */}
        {!conversa.encerrado && (
          <div style={{ padding:'12px 16px', borderTop:'1px solid var(--border-light)', display:'flex', gap:8 }}>
            <textarea
              value={resposta}
              onChange={e => setResposta(e.target.value)}
              onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
              placeholder="Digite sua resposta… (Enter para enviar, Shift+Enter nova linha)"
              rows={2}
              style={{ flex:1, background:'var(--input-bg)', border:'1px solid var(--border-light)', borderRadius:8, color:'var(--text-body)', padding:'8px 12px', fontSize:13, resize:'none', outline:'none', lineHeight:1.4 }}
            />
            <button onClick={enviar} disabled={enviando || !resposta.trim()}
              style={{ background:'var(--blue)', color:'#0f0f0f', border:'none', borderRadius:8, padding:'0 16px', fontWeight:700, cursor:'pointer', fontSize:13, alignSelf:'stretch', minWidth:70, opacity: (!resposta.trim()||enviando) ? 0.5 : 1 }}>
              {enviando ? '…' : 'Enviar'}
            </button>
          </div>
        )}
        {conversa.encerrado && (
          <div style={{ padding:'10px 16px', borderTop:'1px solid var(--border-light)', textAlign:'center', fontSize:12, color:'var(--muted)' }}>
            Conversa encerrada · clique em "↩ Reabrir" para continuar
          </div>
        )}
      </div>
    </div>
  )
}

// ── Modal de configuração de colunas ──────────────────────────
function ModalColunas({ colunas, onSalvar, onClose }) {
  const [cols, setCols] = useState(colunas.map(c => ({ ...c })))

  function add() {
    setCols(prev => [...prev, { titulo: 'Nova Coluna', cor: '#9aa0a6' }])
  }
  function remove(i) {
    setCols(prev => prev.filter((_, idx) => idx !== i))
  }
  function upd(i, field, val) {
    setCols(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: val } : c))
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth:400 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <h3 style={{ margin:0, fontSize:16 }}>Configurar Colunas</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--muted)', fontSize:20, cursor:'pointer' }}>✕</button>
        </div>
        <div className="modal-body" style={{ padding:20, paddingBottom:20, display:'grid', gap:10 }}>
          {cols.map((c, i) => (
            <div key={i} style={{ display:'flex', gap:8, alignItems:'center' }}>
              <input type="color" value={c.cor} onChange={e => upd(i,'cor',e.target.value)}
                style={{ width:32, height:32, padding:2, borderRadius:4, border:'1px solid var(--border-light)', background:'none', cursor:'pointer' }} />
              <input value={c.titulo} onChange={e => upd(i,'titulo',e.target.value)}
                style={{ flex:1, background:'var(--input-bg)', border:'1px solid var(--border-light)', borderRadius:6, color:'var(--text-body)', padding:'6px 10px', fontSize:14, outline:'none' }} />
              {cols.length > 1 && (
                <button onClick={() => remove(i)} style={{ background:'none', border:'none', color:'var(--red)', cursor:'pointer', fontSize:16, lineHeight:1 }}>✕</button>
              )}
            </div>
          ))}
          <button onClick={add} style={{ background:'none', border:'1px dashed var(--border-light)', borderRadius:6, color:'var(--muted)', padding:'8px', cursor:'pointer', fontSize:13 }}>
            + Adicionar coluna
          </button>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} style={{ flex:1, background:'var(--btn-cancel-bg)', color:'var(--btn-cancel-text)', border:'none', borderRadius:6, padding:'10px', fontWeight:600, cursor:'pointer' }}>Cancelar</button>
          <button onClick={() => onSalvar(cols)} style={{ flex:1, background:'var(--blue)', color:'#0f0f0f', border:'none', borderRadius:6, padding:'10px', fontWeight:700, cursor:'pointer' }}>Salvar</button>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
export default function ContatosPage() {
  const { profile }   = useAuth()
  const { showToast } = useApp()
  const tenantId      = profile?.tenant_id

  const [conversas,     setConversas]     = useState([])
  const [colunas,       setColunas]       = useState(COLUNAS_DEFAULT)
  const [carregando,    setCarregando]    = useState(false)
  const [selConversa,   setSelConversa]   = useState(null)
  const [modalColunas,  setModalColunas]  = useState(false)
  const [busca,         setBusca]         = useState('')

  const carregar = useCallback(async () => {
    if (!tenantId) return
    setCarregando(true)
    try {
      const [conv, cols] = await Promise.all([
        getConversas(tenantId),
        getColunas(tenantId),
      ])
      setConversas(conv)
      setColunas(cols || COLUNAS_DEFAULT)
    } catch { showToast('Erro ao carregar.', 'error') }
    setCarregando(false)
  }, [tenantId, showToast])

  useEffect(() => { carregar() }, [tenantId]) // eslint-disable-line

  async function handleMover(id, novaColuna) {
    try {
      await moverConversa(id, novaColuna)
      setConversas(prev => prev.map(c => c.id === id ? { ...c, coluna: novaColuna } : c))
    } catch { showToast('Erro ao mover.', 'error') }
  }

  async function handleSalvarColunas(novasCols) {
    try {
      await salvarColunas(tenantId, novasCols)
      setColunas(novasCols)
      setModalColunas(false)
      showToast('Colunas salvas!', 'success')
    } catch { showToast('Erro ao salvar colunas.', 'error') }
  }

  // Filtro de busca
  const convFiltradas = busca.trim()
    ? conversas.filter(c => {
        const t = busca.toLowerCase()
        return c.cliente_instagram?.toLowerCase().includes(t) || c.assunto?.toLowerCase().includes(t)
      })
    : conversas

  // Agrupar por coluna
  const porColuna = {}
  colunas.forEach(col => { porColuna[col.titulo] = [] })
  convFiltradas.forEach(c => {
    const col = c.coluna || 'Novo'
    if (!porColuna[col]) porColuna[col] = []
    porColuna[col].push(c)
  })

  const totalNaoLidas = conversas.reduce((s, c) => s + (c.nao_lidas || 0), 0)

  return (
    <AppShell title="CRM — Contatos" hideTitle flush>
      {/* Toolbar */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', borderBottom:'1px solid var(--border-light)', background:'var(--header-bg)', flexWrap:'wrap' }}>
        <span style={{ fontSize:14, fontWeight:700, color:'var(--text-header)' }}>
          CRM — Contatos
          {totalNaoLidas > 0 && (
            <span style={{ marginLeft:8, background:'var(--blue)', color:'#0f0f0f', borderRadius:12, fontSize:11, fontWeight:700, padding:'1px 8px' }}>
              {totalNaoLidas} nova{totalNaoLidas>1?'s':''}
            </span>
          )}
        </span>
        <input
          placeholder="Buscar cliente ou assunto…"
          value={busca} onChange={e => setBusca(e.target.value)}
          style={{ background:'var(--input-bg)', border:'1px solid var(--border-light)', borderRadius:6, color:'var(--text-body)', padding:'6px 10px', fontSize:13, outline:'none', width:220 }}
        />
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          <button onClick={() => setModalColunas(true)}
            style={{ background:'none', border:'1px solid var(--border-light)', borderRadius:6, color:'var(--muted)', padding:'6px 14px', cursor:'pointer', fontSize:13 }}>
            ⚙ Colunas
          </button>
          <button onClick={carregar}
            style={{ background:'var(--blue)', color:'#0f0f0f', border:'none', borderRadius:6, padding:'6px 14px', fontWeight:700, cursor:'pointer', fontSize:13 }}>
            {carregando ? '…' : '↻ Atualizar'}
          </button>
        </div>
      </div>

      {/* Kanban board */}
      <div style={{ display:'flex', gap:12, padding:16, overflowX:'auto', minHeight:'calc(100vh - 90px)', alignItems:'flex-start' }}>
        {colunas.map(col => {
          const cards = porColuna[col.titulo] || []
          return (
            <div key={col.titulo} style={{ minWidth:240, width:240, flexShrink:0 }}>
              {/* Cabeçalho da coluna */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10, paddingBottom:8, borderBottom:`2px solid ${col.cor}` }}>
                <span style={{ fontSize:13, fontWeight:700, color:'var(--text-header)' }}>{col.titulo}</span>
                <span style={{ fontSize:12, color:'var(--muted)', background:'var(--header-bg)', borderRadius:10, padding:'1px 8px' }}>{cards.length}</span>
              </div>
              {/* Cards */}
              <div>
                {cards.map(conv => (
                  <KanbanCard
                    key={conv.id}
                    conversa={conv}
                    onAbrir={c => { setSelConversa(c); marcarLida(c.id); setConversas(prev => prev.map(x => x.id===c.id ? {...x,nao_lidas:0} : x)) }}
                    onMover={handleMover}
                    colunas={colunas}
                  />
                ))}
                {cards.length === 0 && (
                  <div style={{ fontSize:12, color:'var(--muted)', textAlign:'center', padding:'20px 8px', border:'1px dashed var(--border-light)', borderRadius:8 }}>
                    Nenhuma conversa
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal conversa */}
      {selConversa && (
        <ModalConversa
          conversa={selConversa}
          colunas={colunas}
          tenantId={tenantId}
          onClose={() => setSelConversa(null)}
          onAtualizar={carregar}
        />
      )}

      {/* Modal colunas */}
      {modalColunas && (
        <ModalColunas
          colunas={colunas}
          onSalvar={handleSalvarColunas}
          onClose={() => setModalColunas(false)}
        />
      )}
    </AppShell>
  )
}
