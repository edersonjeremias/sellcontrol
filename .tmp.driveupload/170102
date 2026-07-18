import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import AppShell from '../../components/ui/AppShell'
import {
  getColunas, salvarColunas, COLUNAS_DEFAULT,
  getNotificacoesConversas, getMensagensNotificacao, responderNotificacao,
  moverNotificacao, marcarNotificacaoLida, encerrarNotificacao, criarNotificacaoManual,
} from '../../services/notificacoesConversasService'
import { getUsuarios } from '../../services/configService'

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

// ── Card no Kanban ─────────────────────────────────────────────
function KanbanCard({ notif, onAbrir, onMover, colunas }) {
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
      borderLeft: notif.nao_lidas > 0 ? '3px solid var(--blue)' : '3px solid transparent',
      opacity: notif.encerrado ? 0.6 : 1,
    }}
      onClick={() => onAbrir(notif)}
      onMouseEnter={e => e.currentTarget.style.background = '#252525'}
      onMouseLeave={e => e.currentTarget.style.background = 'var(--card-bg)'}
    >
      {/* Remetente + tempo */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
        <span style={{ fontSize:13, fontWeight:700, color:'var(--blue)' }}>
          {notif.remetente || 'SISTEMA'}
        </span>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          {notif.nao_lidas > 0 && (
            <span style={{ background:'var(--blue)', color:'#0f0f0f', borderRadius:10, fontSize:10, fontWeight:700, padding:'1px 6px' }}>
              {notif.nao_lidas}
            </span>
          )}
          <span style={{ fontSize:11, color:'var(--muted)' }}>{fmtTempo(notif.created_at)}</span>
        </div>
      </div>
      {/* Assunto */}
      <div style={{ fontSize:12, color:'var(--text-body)', marginBottom:6, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
        {notif.assunto || notif.titulo}
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
                onClick={() => { onMover(notif.id, col.titulo); setMenuOpen(false) }}
                style={{
                  display:'block', width:'100%', textAlign:'left', padding:'8px 12px',
                  background: col.titulo === notif.coluna ? 'rgba(138,180,248,0.1)' : 'none',
                  border:'none', color: col.titulo === notif.coluna ? 'var(--blue)' : 'var(--text-body)',
                  cursor:'pointer', fontSize:13, borderBottom:'1px solid var(--border-light)',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--table-row-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = col.titulo === notif.coluna ? 'rgba(138,180,248,0.1)' : 'none'}
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

// ── Modal de notificação ───────────────────────────────────────
function ModalNotificacao({ notif, onClose, onAtualizar, colunas, tenantId, profile }) {
  const { showToast } = useApp()
  const [mensagens, setMensagens] = useState([])
  const [resposta, setResposta] = useState('')
  const [remetente, setRemetente] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [editColuna, setEditColuna] = useState(false)
  const endRef = useRef(null)

  useEffect(() => {
    getMensagensNotificacao(notif.id)
      .then(msgs => {
        console.log('Mensagens carregadas:', msgs)
        setMensagens(msgs)
      })
      .catch(err => {
        console.error('Erro ao carregar mensagens:', err)
        showToast('Erro ao carregar mensagens: ' + err.message, 'error')
      })
    marcarNotificacaoLida(notif.id)
  }, [notif.id, showToast])

  // Preenche remetente automaticamente com nome do usuário logado
  useEffect(() => {
    if (profile?.nome) {
      setRemetente(profile.nome)
    }
  }, [profile])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior:'smooth' })
  }, [mensagens])

  async function enviar() {
    if (!resposta.trim() || !remetente.trim()) return
    setEnviando(true)
    try {
      await responderNotificacao(notif.id, tenantId, remetente.trim(), resposta.trim())
      setResposta('')
      const msgs = await getMensagensNotificacao(notif.id)
      setMensagens(msgs)
      onAtualizar()
    } catch { showToast('Erro ao enviar.', 'error') }
    setEnviando(false)
  }

  async function toggleEncerrar() {
    try {
      if (notif.encerrado) {
        await moverNotificacao(notif.id, 'Novo')
        notif.encerrado = false
      } else {
        await encerrarNotificacao(notif.id)
        notif.encerrado = true
      }
      onAtualizar()
      onClose()
    } catch { showToast('Erro.', 'error') }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth:560, width:'95vw', maxHeight:'90vh', display:'flex', flexDirection:'column' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:15, fontWeight:700, color:'var(--blue)' }}>
              {notif.remetente || 'SISTEMA'}
            </div>
            <div style={{ fontSize:13, color:'var(--text-body)', marginTop:2 }}>{notif.assunto || notif.titulo}</div>
          </div>
          <div style={{ display:'flex', gap:6, flexShrink:0, alignItems:'center' }}>
            {/* Coluna dropdown */}
            <div style={{ position:'relative' }}>
              <button onClick={() => setEditColuna(o => !o)}
                style={{ background:'rgba(138,180,248,0.15)', border:'1px solid var(--blue)', borderRadius:4, color:'var(--blue)', fontSize:11, fontWeight:700, padding:'4px 10px', cursor:'pointer' }}>
                {notif.coluna} ▾
              </button>
              {editColuna && (
                <div style={{ position:'absolute', top:'calc(100% + 4px)', right:0, zIndex:100, background:'var(--card-bg)', border:'1px solid var(--border-light)', borderRadius:6, minWidth:160, boxShadow:'0 4px 16px rgba(0,0,0,0.4)' }}>
                  {colunas.map(col => (
                    <button key={col.titulo} onClick={async () => { await moverNotificacao(notif.id, col.titulo); setEditColuna(false); onAtualizar(); notif.coluna = col.titulo }}
                      style={{ display:'block', width:'100%', textAlign:'left', padding:'8px 12px', background:'none', border:'none', color:'var(--text-body)', cursor:'pointer', fontSize:13, borderBottom:'1px solid var(--border-light)' }}
                      onMouseEnter={e=>e.currentTarget.style.background='var(--table-row-hover)'}
                      onMouseLeave={e=>e.currentTarget.style.background='none'}
                    >{col.titulo}</button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={toggleEncerrar}
              style={{ background: notif.encerrado ? 'rgba(129,201,149,0.15)' : 'rgba(242,139,130,0.15)', border:'none', borderRadius:4, color: notif.encerrado ? 'var(--green)' : 'var(--red)', fontSize:11, fontWeight:700, padding:'4px 10px', cursor:'pointer' }}>
              {notif.encerrado ? '↩ Reabrir' : '✓ Encerrar'}
            </button>
            <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--muted)', fontSize:20, cursor:'pointer', lineHeight:1 }}>✕</button>
          </div>
        </div>

        {/* Mensagem inicial */}
        <div style={{ padding:'16px', borderBottom:'1px solid var(--border-light)' }}>
          <div style={{ fontSize:12, color:'var(--muted)', marginBottom:8 }}>
            <strong>De:</strong> {notif.remetente || 'SISTEMA'} · <strong>Para:</strong> {notif.destinatario || 'TODOS'}
          </div>
          <div style={{ background:'var(--header-bg)', padding:'10px 14px', borderRadius:8, color:'var(--text-body)', fontSize:13, lineHeight:1.5, whiteSpace:'pre-line' }}>
            {notif.mensagem}
          </div>
        </div>

        {/* Mensagens */}
        <div style={{ flex:1, overflowY:'auto', padding:'16px', display:'flex', flexDirection:'column', gap:10 }}>
          {mensagens.map(m => {
            const isAdmin = m.remetente !== (notif.remetente || 'SISTEMA')
            return (
              <div key={m.id} style={{ display:'flex', flexDirection:'column', alignItems: isAdmin ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth:'80%', padding:'10px 14px', borderRadius: isAdmin ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  background: isAdmin ? 'rgba(138,180,248,0.2)' : 'var(--header-bg)',
                  color:'var(--text-body)', fontSize:13, lineHeight:1.5,
                }}>
                  {m.mensagem}
                </div>
                <span style={{ fontSize:10, color:'var(--muted)', marginTop:3 }}>
                  {m.remetente} · {fmtHora(m.created_at)}
                </span>
              </div>
            )
          })}
          {mensagens.length === 0 && <p style={{ color:'var(--muted)', textAlign:'center', fontSize:13 }}>Nenhuma resposta ainda.</p>}
          <div ref={endRef} />
        </div>

        {/* Resposta */}
        {!notif.encerrado && (
          <>
            <div style={{ padding:'0 16px 8px' }}>
              <input
                type="text"
                value={remetente}
                readOnly
                placeholder="Seu nome..."
                style={{ width:'100%', background:'var(--bg)', border:'1px solid var(--border-light)', borderRadius:6, color:'var(--muted)', padding:'6px 10px', fontSize:13, outline:'none', boxSizing:'border-box', cursor:'not-allowed' }}
              />
            </div>
            <div style={{ padding:'0 16px 12px', borderTop:'1px solid var(--border-light)', paddingTop:12, display:'flex', gap:8 }}>
              <textarea
                value={resposta}
                onChange={e => setResposta(e.target.value)}
                onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
                placeholder="Digite sua resposta… (Enter para enviar, Shift+Enter nova linha)"
                rows={2}
                style={{ flex:1, background:'var(--input-bg)', border:'1px solid var(--border-light)', borderRadius:8, color:'var(--text-body)', padding:'8px 12px', fontSize:13, resize:'none', outline:'none', lineHeight:1.4 }}
              />
              <button onClick={enviar} disabled={enviando || !resposta.trim() || !remetente.trim()}
                style={{ background:'var(--blue)', color:'#0f0f0f', border:'none', borderRadius:8, padding:'0 16px', fontWeight:700, cursor:'pointer', fontSize:13, alignSelf:'stretch', minWidth:70, opacity: (!resposta.trim()||!remetente.trim()||enviando) ? 0.5 : 1 }}>
                {enviando ? '…' : 'Enviar'}
              </button>
            </div>
          </>
        )}
        {notif.encerrado && (
          <div style={{ padding:'10px 16px', borderTop:'1px solid var(--border-light)', textAlign:'center', fontSize:12, color:'var(--muted)' }}>
            Conversa encerrada · clique em "↩ Reabrir" para continuar
          </div>
        )}
      </div>
    </div>
  )
}

// ── Modal nova conversa ────────────────────────────────────────
function ModalNovaConversa({ tenantId, profile, onCriada, onClose, showToast }) {
  const [remetente, setRemetente] = useState('')
  const [destinatario, setDestinatario] = useState('TODOS')
  const [assunto, setAssunto] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [usuarios, setUsuarios] = useState([])

  // Busca usuários e preenche remetente automaticamente
  useEffect(() => {
    if (profile?.nome) {
      setRemetente(profile.nome)
    }

    async function carregarUsuarios() {
      try {
        const users = await getUsuarios(tenantId)
        setUsuarios(users.filter(u => u.ativo))
      } catch (err) {
        console.error('Erro ao buscar usuários:', err)
      }
    }

    if (tenantId) carregarUsuarios()
  }, [tenantId, profile])

  async function criar() {
    if (!remetente.trim() || !assunto.trim() || !mensagem.trim()) {
      return showToast('Preencha todos os campos', 'error')
    }
    setEnviando(true)
    try {
      await criarNotificacaoManual(tenantId, remetente.trim(), destinatario.trim(), assunto.trim(), mensagem.trim())
      showToast('Conversa criada!', 'success')
      onCriada()
    } catch {
      showToast('Erro ao criar conversa', 'error')
    }
    setEnviando(false)
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth:500 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <h3 style={{ margin:0, fontSize:16 }}>✉ Nova Conversa</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--muted)', fontSize:20, cursor:'pointer' }}>✕</button>
        </div>
        <div className="modal-body" style={{ padding:20, paddingBottom:20, display:'grid', gap:14 }}>
          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', marginBottom:6 }}>
              Seu Nome *
            </label>
            <input
              value={remetente}
              readOnly
              style={{ width:'100%', background:'var(--bg)', border:'1px solid var(--border-light)', borderRadius:6, color:'var(--muted)', padding:'8px 12px', fontSize:13, outline:'none', boxSizing:'border-box', cursor:'not-allowed' }}
            />
          </div>
          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', marginBottom:6 }}>
              Destinatário *
            </label>
            <select
              value={destinatario}
              onChange={e => setDestinatario(e.target.value)}
              style={{ width:'100%', background:'var(--input-bg)', border:'1px solid var(--border-light)', borderRadius:6, color:'var(--text-body)', padding:'8px 12px', fontSize:13, outline:'none', boxSizing:'border-box', cursor:'pointer' }}
            >
              <option value="TODOS">TODOS</option>
              {usuarios.map(user => (
                <option key={user.id} value={user.nome}>
                  {user.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', marginBottom:6 }}>
              Assunto *
            </label>
            <input
              value={assunto}
              onChange={e => setAssunto(e.target.value)}
              placeholder="Ex: Orçamento, Dúvida, Follow-up..."
              style={{ width:'100%', background:'var(--input-bg)', border:'1px solid var(--border-light)', borderRadius:6, color:'var(--text-body)', padding:'8px 12px', fontSize:13, outline:'none', boxSizing:'border-box' }}
            />
          </div>
          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', marginBottom:6 }}>
              Mensagem *
            </label>
            <textarea
              value={mensagem}
              onChange={e => setMensagem(e.target.value)}
              rows={4}
              placeholder="Escreva a mensagem..."
              style={{ width:'100%', background:'var(--input-bg)', border:'1px solid var(--border-light)', borderRadius:6, color:'var(--text-body)', padding:'8px 12px', fontSize:13, resize:'none', outline:'none', boxSizing:'border-box' }}
            />
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} style={{ flex:1, background:'var(--btn-cancel-bg)', color:'var(--btn-cancel-text)', border:'none', borderRadius:6, padding:'10px', fontWeight:600, cursor:'pointer' }}>
            Cancelar
          </button>
          <button onClick={criar} disabled={enviando || !remetente.trim() || !assunto.trim() || !mensagem.trim()}
            style={{ flex:1, background:'var(--blue)', color:'#0f0f0f', border:'none', borderRadius:6, padding:'10px', fontWeight:700, cursor:'pointer', opacity: (enviando || !remetente.trim() || !assunto.trim() || !mensagem.trim()) ? 0.5 : 1 }}>
            {enviando ? 'Criando…' : '✉ Criar Conversa'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal encerrados ───────────────────────────────────────────
function ModalEncerrados({ notificacoes, onAbrir, onClose }) {
  const [filtro, setFiltro] = useState('')

  const encerradas = notificacoes.filter(n => n.encerrado)
  const filtradas = filtro.trim()
    ? encerradas.filter(n => {
        const t = filtro.toLowerCase()
        return n.remetente?.toLowerCase().includes(t) || n.assunto?.toLowerCase().includes(t) || n.mensagem?.toLowerCase().includes(t)
      })
    : encerradas

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth:700, maxHeight:'90vh', display:'flex', flexDirection:'column' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <h3 style={{ margin:0, fontSize:16 }}>📁 Conversas Encerradas ({encerradas.length})</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--muted)', fontSize:20, cursor:'pointer' }}>✕</button>
        </div>
        <div style={{ padding:'0 20px 12px', borderBottom:'1px solid var(--border-light)' }}>
          <input
            type="text"
            placeholder="Buscar por remetente ou assunto..."
            value={filtro}
            onChange={e => setFiltro(e.target.value)}
            style={{ width:'100%', background:'var(--input-bg)', border:'1px solid var(--border-light)', borderRadius:6, color:'var(--text-body)', padding:'8px 12px', fontSize:13, outline:'none', boxSizing:'border-box' }}
          />
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:20, display:'flex', flexDirection:'column', gap:8 }}>
          {filtradas.length === 0 ? (
            <div style={{ textAlign:'center', color:'var(--muted)', padding:'40px 20px', fontSize:13 }}>
              {filtro.trim() ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa encerrada'}
            </div>
          ) : (
            filtradas.map(n => (
              <div
                key={n.id}
                onClick={() => { onAbrir(n); onClose() }}
                style={{ background:'var(--card-bg)', border:'1px solid var(--border-light)', borderRadius:8, padding:'12px 14px', cursor:'pointer', transition:'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = '#252525'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--card-bg)'}
              >
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                  <span style={{ fontSize:13, fontWeight:700, color:'var(--blue)' }}>
                    {n.remetente || 'SISTEMA'}
                  </span>
                  <span style={{ fontSize:11, color:'var(--muted)' }}>{fmtTempo(n.created_at)}</span>
                </div>
                <div style={{ fontSize:12, color:'var(--text-body)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {n.assunto || n.titulo}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ── Modal configurar colunas ───────────────────────────────────
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
    <div className="modal-overlay">
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
export default function NotificacoesPageKanban() {
  const { profile } = useAuth()
  const { showToast } = useApp()
  const tenantId = profile?.tenant_id

  const [notificacoes, setNotificacoes] = useState([])
  const [colunas, setColunas] = useState(COLUNAS_DEFAULT)
  const [carregando, setCarregando] = useState(false)
  const [selNotif, setSelNotif] = useState(null)
  const [modalColunas, setModalColunas] = useState(false)
  const [modalNova, setModalNova] = useState(false)
  const [modalEncerrados, setModalEncerrados] = useState(false)
  const [busca, setBusca] = useState('')

  const carregar = useCallback(async () => {
    if (!tenantId) return
    setCarregando(true)
    try {
      const [notifs, cols] = await Promise.all([
        getNotificacoesConversas(tenantId),
        getColunas(tenantId),
      ])
      setNotificacoes(notifs)
      setColunas(cols || COLUNAS_DEFAULT)
    } catch { showToast('Erro ao carregar.', 'error') }
    setCarregando(false)
  }, [tenantId, showToast])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    if (!tenantId) return
    const interval = setInterval(() => {
      carregar()
    }, 30000)
    return () => clearInterval(interval)
  }, [tenantId, carregar])

  async function handleMover(id, novaColuna) {
    try {
      await moverNotificacao(id, novaColuna)
      setNotificacoes(prev => prev.map(n => n.id === id ? { ...n, coluna: novaColuna } : n))
      showToast(`Movido para "${novaColuna}"`, 'success')
    } catch (err) {
      console.error('Erro ao mover:', err)
      showToast('Erro ao mover: ' + err.message, 'error')
    }
  }

  async function handleSalvarColunas(novasCols) {
    try {
      await salvarColunas(tenantId, novasCols)
      setColunas(novasCols)
      setModalColunas(false)
      showToast('Colunas salvas!', 'success')
    } catch { showToast('Erro ao salvar colunas.', 'error') }
  }

  // Filtro de busca + Remove encerrados do Kanban
  const notifsFiltradas = busca.trim()
    ? notificacoes.filter(n => {
        const t = busca.toLowerCase()
        return !n.encerrado && (n.remetente?.toLowerCase().includes(t) || n.assunto?.toLowerCase().includes(t) || n.mensagem?.toLowerCase().includes(t))
      })
    : notificacoes.filter(n => !n.encerrado)

  // Agrupar por coluna
  const porColuna = {}
  colunas.forEach(col => { porColuna[col.titulo] = [] })
  notifsFiltradas.forEach(n => {
    const col = n.coluna || 'Novo'
    if (!porColuna[col]) porColuna[col] = []
    porColuna[col].push(n)
  })

  const totalNaoLidas = notificacoes.reduce((s, n) => s + (n.nao_lidas || 0), 0)
  const totalEncerrados = notificacoes.filter(n => n.encerrado).length

  return (
    <AppShell title="Notificações" hideTitle flush>
      {/* Toolbar */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', borderBottom:'1px solid var(--border-light)', background:'var(--header-bg)', flexWrap:'wrap' }}>
        <span style={{ fontSize:14, fontWeight:700, color:'var(--text-header)' }}>
          📩 Notificações
          {totalNaoLidas > 0 && (
            <span style={{ marginLeft:8, background:'var(--blue)', color:'#0f0f0f', borderRadius:12, fontSize:11, fontWeight:700, padding:'1px 8px' }}>
              {totalNaoLidas} nova{totalNaoLidas>1?'s':''}
            </span>
          )}
        </span>
        <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <input
            type="text"
            placeholder="🔍 Buscar…"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            style={{ background:'var(--input-bg)', border:'1px solid var(--border-light)', borderRadius:6, color:'var(--text-body)', padding:'5px 10px', fontSize:13, outline:'none', minWidth:140 }}
          />
          <button onClick={() => setModalEncerrados(true)} style={{ background:'var(--card-bg)', border:'1px solid var(--border-light)', borderRadius:6, color:'var(--text-body)', fontSize:12, padding:'5px 12px', cursor:'pointer', fontWeight:600 }}>
            📁 Encerrados ({totalEncerrados})
          </button>
          <button onClick={() => setModalColunas(true)} style={{ background:'var(--card-bg)', border:'1px solid var(--border-light)', borderRadius:6, color:'var(--text-body)', fontSize:12, padding:'5px 12px', cursor:'pointer', fontWeight:600 }}>
            ⚙ Colunas
          </button>
          <button onClick={() => setModalNova(true)} style={{ background:'var(--blue)', color:'#0f0f0f', border:'none', borderRadius:6, fontSize:12, fontWeight:700, padding:'5px 14px', cursor:'pointer' }}>
            + Nova Conversa
          </button>
        </div>
      </div>

      {/* Kanban */}
      <div style={{ display:'flex', gap:12, padding:16, overflowX:'auto', height:'calc(100vh - 120px)' }}>
        {colunas.map(col => {
          const notifsCol = porColuna[col.titulo] || []
          const naoLidasCol = notifsCol.filter(n => n.nao_lidas > 0).length

          return (
            <div key={col.titulo} style={{ minWidth:280, maxWidth:280, display:'flex', flexDirection:'column', background:'var(--table-bg)', borderRadius:8, border:'1px solid var(--border-light)' }}>
              <div style={{ padding:12, borderBottom:'1px solid var(--border-light)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ width:12, height:12, borderRadius:3, background:col.cor }} />
                  <span style={{ fontSize:13, fontWeight:700, color:'var(--text-header)' }}>{col.titulo}</span>
                </div>
                <span style={{ background:'var(--card-bg)', borderRadius:12, fontSize:11, fontWeight:700, padding:'2px 8px', color:'var(--text-muted)' }}>
                  {notifsCol.length} {naoLidasCol > 0 && `(${naoLidasCol})`}
                </span>
              </div>
              <div style={{ flex:1, overflowY:'auto', padding:8 }}>
                {notifsCol.map(n => (
                  <KanbanCard
                    key={n.id}
                    notif={n}
                    onAbrir={setSelNotif}
                    onMover={handleMover}
                    colunas={colunas}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Modals */}
      {selNotif && <ModalNotificacao notif={selNotif} onClose={() => setSelNotif(null)} onAtualizar={carregar} colunas={colunas} tenantId={tenantId} profile={profile} />}
      {modalNova && <ModalNovaConversa tenantId={tenantId} profile={profile} onCriada={() => { setModalNova(false); carregar() }} onClose={() => setModalNova(false)} showToast={showToast} />}
      {modalEncerrados && <ModalEncerrados notificacoes={notificacoes} onAbrir={setSelNotif} onClose={() => setModalEncerrados(false)} />}
      {modalColunas && <ModalColunas colunas={colunas} onSalvar={handleSalvarColunas} onClose={() => setModalColunas(false)} />}
    </AppShell>
  )
}
