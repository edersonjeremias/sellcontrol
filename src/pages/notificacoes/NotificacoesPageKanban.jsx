import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import AppShell from '../../components/ui/AppShell'
import {
  getColunas, salvarColunas, COLUNAS_DEFAULT,
  getNotificacoesConversas, getMensagensNotificacao, responderNotificacao,
  moverNotificacao, marcarNotificacaoLida, encerrarNotificacao, criarNotificacaoManual,
} from '../../services/notificacoesConversasService'

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

function fmtDataHora(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ── Card de notificação no Kanban ─────────────────────────────────
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
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'start', marginBottom:4}}>
        <span style={{fontSize:11, fontWeight:700, color:'var(--text)'}}>
          {notif.remetente || 'SISTEMA'}
        </span>
        <span style={{fontSize:10, color:'var(--text-muted)'}}>
          {fmtTempo(notif.created_at)}
        </span>
      </div>
      <div style={{fontSize:12, color:'var(--text)', marginBottom:4, fontWeight:600}}>
        {notif.assunto || notif.titulo}
      </div>
      <div style={{fontSize:11, color:'var(--text-muted)', marginBottom:6, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
        {notif.mensagem?.substring(0, 60)}...
      </div>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <span style={{fontSize:10, color:'var(--text-muted)'}}>
          Para: {notif.destinatario || 'TODOS'}
        </span>
        <div ref={ref} style={{position:'relative'}}>
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen) }}
            style={{
              background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer',
              fontSize:16, padding:4, lineHeight:1,
            }}
          >
            ⋮
          </button>
          {menuOpen && (
            <div style={{
              position:'absolute', right:0, top:'100%', zIndex:10,
              background:'var(--bg-card)', border:'1px solid var(--border)',
              borderRadius:6, boxShadow:'0 4px 12px rgba(0,0,0,0.3)', minWidth:150,
            }}>
              {colunas.map(col => (
                <button
                  key={col}
                  onClick={(e) => { e.stopPropagation(); onMover(notif.id, col); setMenuOpen(false) }}
                  style={{
                    display:'block', width:'100%', textAlign:'left',
                    background:'none', border:'none', color:'var(--text)',
                    padding:'8px 12px', cursor:'pointer', fontSize:12,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#252525'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  Mover → {col}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Modal de detalhes ─────────────────────────────────────────────
function ModalDetalhes({ notif, onFechar, onResponder, onEncerrar }) {
  const [mensagens, setMensagens] = useState([])
  const [resposta, setResposta] = useState('')
  const [remetente, setRemetente] = useState('')
  const [loading, setLoading] = useState(false)
  const chatRef = useRef(null)

  useEffect(() => {
    async function carregar() {
      try {
        const msgs = await getMensagensNotificacao(notif.id)
        setMensagens(msgs)
        setTimeout(() => {
          if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
        }, 100)
      } catch (err) {
        console.error('Erro ao carregar mensagens:', err)
      }
    }
    carregar()
  }, [notif.id])

  async function handleEnviar() {
    if (!resposta.trim() || !remetente.trim()) return
    setLoading(true)
    try {
      await onResponder(resposta, remetente)
      setResposta('')
      // Recarrega mensagens
      const msgs = await getMensagensNotificacao(notif.id)
      setMensagens(msgs)
      setTimeout(() => {
        if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
      }, 100)
    } catch (err) {
      console.error('Erro ao enviar:', err)
    }
    setLoading(false)
  }

  return (
    <div
      onClick={onFechar}
      style={{
        position:'fixed', top:0, left:0, right:0, bottom:0,
        background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center',
        zIndex:9999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background:'var(--bg-card)', border:'1px solid var(--border)',
          borderRadius:16, padding:24, maxWidth:700, width:'90%',
          maxHeight:'85vh', display:'flex', flexDirection:'column',
        }}
      >
        {/* Cabeçalho */}
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'start', marginBottom:16}}>
          <div style={{flex:1}}>
            <h3 style={{margin:0, marginBottom:8, color:'var(--text)', fontSize:18}}>
              {notif.tipo === 'cancelamento' ? '❌' : '📩'} {notif.assunto || notif.titulo}
            </h3>
            <div style={{fontSize:12, color:'var(--text-muted)'}}>
              <div><strong>De:</strong> {notif.remetente || 'SISTEMA'}</div>
              <div><strong>Para:</strong> {notif.destinatario || 'TODOS'}</div>
              <div><strong>Criado:</strong> {fmtDataHora(notif.created_at)}</div>
            </div>
          </div>
          <button
            onClick={onFechar}
            style={{
              background:'none', border:'none', color:'var(--text-muted)',
              fontSize:24, cursor:'pointer', padding:0, lineHeight:1,
            }}
          >
            ×
          </button>
        </div>

        {/* Linha separadora */}
        <div style={{borderTop:'1px dashed var(--border)', margin:'16px 0'}} />

        {/* Mensagem inicial */}
        <div
          style={{
            background:'var(--bg)', padding:12, borderRadius:8,
            marginBottom:16, lineHeight:1.6, color:'var(--text)',
            whiteSpace:'pre-line', fontSize:13,
          }}
        >
          {notif.mensagem}
        </div>

        {/* Chat de respostas */}
        {mensagens.length > 0 && (
          <>
            <div style={{borderTop:'1px solid var(--border)', margin:'16px 0'}} />
            <div
              ref={chatRef}
              style={{
                flex:1, overflowY:'auto', marginBottom:16,
                maxHeight:300, display:'flex', flexDirection:'column', gap:8,
              }}
            >
              {mensagens.map(msg => (
                <div key={msg.id} style={{
                  background:'var(--bg)', padding:10, borderRadius:8,
                  borderLeft:'3px solid var(--primary)',
                }}>
                  <div style={{display:'flex', justifyContent:'space-between', marginBottom:4}}>
                    <span style={{fontSize:11, fontWeight:700, color:'var(--text)'}}>
                      {msg.remetente}
                    </span>
                    <span style={{fontSize:10, color:'var(--text-muted)'}}>
                      {fmtHora(msg.created_at)}
                    </span>
                  </div>
                  <div style={{fontSize:13, color:'var(--text)', whiteSpace:'pre-line'}}>
                    {msg.mensagem}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Formulário de resposta */}
        <div style={{marginTop:'auto'}}>
          <input
            type="text"
            placeholder="Seu nome..."
            value={remetente}
            onChange={(e) => setRemetente(e.target.value)}
            style={{
              width:'100%', padding:'8px 12px', marginBottom:8,
              background:'var(--input-bg)', border:'1px solid var(--input-border)',
              borderRadius:6, color:'var(--input-text)', fontSize:13,
            }}
          />
          <textarea
            rows={3}
            placeholder="Digite sua resposta..."
            value={resposta}
            onChange={(e) => setResposta(e.target.value)}
            style={{
              width:'100%', padding:'8px 12px', marginBottom:8,
              background:'var(--input-bg)', border:'1px solid var(--input-border)',
              borderRadius:6, color:'var(--input-text)', fontSize:13, resize:'vertical',
            }}
          />
          <div style={{display:'flex', gap:8}}>
            <button
              onClick={handleEnviar}
              disabled={loading || !resposta.trim() || !remetente.trim()}
              className="btn-primary"
              style={{flex:1}}
            >
              {loading ? 'Enviando...' : 'Enviar Resposta'}
            </button>
            <button onClick={onEncerrar} className="btn-secondary">
              Encerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────
export default function NotificacoesPageKanban() {
  const { profile } = useAuth()
  const tenantId = profile?.tenant_id

  const [colunas, setColunas] = useState(COLUNAS_DEFAULT)
  const [notificacoes, setNotificacoes] = useState([])
  const [notifSelecionada, setNotifSelecionada] = useState(null)
  const [showNova, setShowNova] = useState(false)
  const [busca, setBusca] = useState('')

  // Form nova conversa
  const [novaRemetente, setNovaRemetente] = useState('')
  const [novaDestinatario, setNovaDestinatario] = useState('TODOS')
  const [novaAssunto, setNovaAssunto] = useState('')
  const [novaMensagem, setNovaMensagem] = useState('')

  const carregar = useCallback(async () => {
    if (!tenantId) return
    try {
      const [cols, notifs] = await Promise.all([
        getColunas(tenantId),
        getNotificacoesConversas(tenantId),
      ])
      setColunas(cols)
      setNotificacoes(notifs)
    } catch (err) {
      console.error('Erro ao carregar:', err)
    }
  }, [tenantId])

  useEffect(() => {
    carregar()
    const interval = setInterval(carregar, 30000)
    return () => clearInterval(interval)
  }, [carregar])

  async function handleMover(notifId, novaColuna) {
    try {
      await moverNotificacao(notifId, novaColuna)
      carregar()
    } catch (err) {
      console.error('Erro ao mover:', err)
    }
  }

  async function handleResponder(mensagem, remetente) {
    if (!notifSelecionada) return
    try {
      await responderNotificacao(notifSelecionada.id, tenantId, remetente, mensagem)
      await marcarNotificacaoLida(notifSelecionada.id)
      carregar()
    } catch (err) {
      console.error('Erro ao responder:', err)
      throw err
    }
  }

  async function handleEncerrar() {
    if (!notifSelecionada) return
    try {
      await encerrarNotificacao(notifSelecionada.id)
      setNotifSelecionada(null)
      carregar()
    } catch (err) {
      console.error('Erro ao encerrar:', err)
    }
  }

  async function handleCriarNova() {
    if (!novaRemetente.trim() || !novaAssunto.trim() || !novaMensagem.trim()) return
    try {
      await criarNotificacaoManual(tenantId, novaRemetente, novaDestinatario, novaAssunto, novaMensagem)
      setShowNova(false)
      setNovaRemetente('')
      setNovaDestinatario('TODOS')
      setNovaAssunto('')
      setNovaMensagem('')
      carregar()
    } catch (err) {
      console.error('Erro ao criar:', err)
    }
  }

  const notifsFiltradas = notificacoes.filter(n =>
    !busca || n.assunto?.toLowerCase().includes(busca.toLowerCase()) ||
    n.mensagem?.toLowerCase().includes(busca.toLowerCase()) ||
    n.remetente?.toLowerCase().includes(busca.toLowerCase())
  )

  return (
    <AppShell title="Notificações">
      <div style={{padding:20}}>
        {/* Header */}
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20}}>
          <h2 style={{margin:0, color:'var(--text)'}}>📩 Notificações</h2>
          <div style={{display:'flex', gap:10}}>
            <input
              type="text"
              placeholder="🔍 Buscar..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              style={{
                padding:'8px 12px', background:'var(--input-bg)',
                border:'1px solid var(--input-border)', borderRadius:6,
                color:'var(--input-text)', fontSize:13, minWidth:200,
              }}
            />
            <button onClick={carregar} className="btn-secondary">
              🔄 Atualizar
            </button>
            <button onClick={() => setShowNova(true)} className="btn-primary">
              + Nova Conversa
            </button>
          </div>
        </div>

        {/* Kanban */}
        <div style={{display:'flex', gap:12, overflowX:'auto', paddingBottom:16}}>
          {colunas.map(col => {
            const notifsColuna = notifsFiltradas.filter(n => n.coluna === col)
            const totalNaoLidas = notifsColuna.filter(n => n.nao_lidas > 0).length

            return (
              <div key={col} style={{
                minWidth:280, background:'var(--bg)', borderRadius:12,
                border:'1px solid var(--border)', padding:12,
              }}>
                <div style={{
                  display:'flex', justifyContent:'space-between', alignItems:'center',
                  marginBottom:12, paddingBottom:8, borderBottom:'1px solid var(--border)',
                }}>
                  <span style={{fontSize:13, fontWeight:700, color:'var(--text)'}}>
                    {col}
                  </span>
                  <span style={{
                    fontSize:11, background:'var(--primary)', color:'#000',
                    padding:'2px 8px', borderRadius:10, fontWeight:700,
                  }}>
                    {notifsColuna.length} {totalNaoLidas > 0 && `(${totalNaoLidas})`}
                  </span>
                </div>
                <div style={{minHeight:400}}>
                  {notifsColuna.map(notif => (
                    <KanbanCard
                      key={notif.id}
                      notif={notif}
                      onAbrir={setNotifSelecionada}
                      onMover={handleMover}
                      colunas={colunas}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Modal detalhes */}
        {notifSelecionada && (
          <ModalDetalhes
            notif={notifSelecionada}
            onFechar={() => setNotifSelecionada(null)}
            onResponder={handleResponder}
            onEncerrar={handleEncerrar}
          />
        )}

        {/* Modal nova conversa */}
        {showNova && (
          <div
            onClick={() => setShowNova(false)}
            style={{
              position:'fixed', top:0, left:0, right:0, bottom:0,
              background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center',
              zIndex:9999,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background:'var(--bg-card)', border:'1px solid var(--border)',
                borderRadius:16, padding:24, maxWidth:500, width:'90%',
              }}
            >
              <h3 style={{margin:0, marginBottom:16, color:'var(--text)'}}>Nova Conversa</h3>
              <input
                type="text"
                placeholder="Seu nome..."
                value={novaRemetente}
                onChange={(e) => setNovaRemetente(e.target.value)}
                style={{
                  width:'100%', padding:'8px 12px', marginBottom:8,
                  background:'var(--input-bg)', border:'1px solid var(--input-border)',
                  borderRadius:6, color:'var(--input-text)', fontSize:13,
                }}
              />
              <input
                type="text"
                placeholder="Destinatário (ex: TODOS, João, Financeiro...)"
                value={novaDestinatario}
                onChange={(e) => setNovaDestinatario(e.target.value)}
                style={{
                  width:'100%', padding:'8px 12px', marginBottom:8,
                  background:'var(--input-bg)', border:'1px solid var(--input-border)',
                  borderRadius:6, color:'var(--input-text)', fontSize:13,
                }}
              />
              <input
                type="text"
                placeholder="Assunto..."
                value={novaAssunto}
                onChange={(e) => setNovaAssunto(e.target.value)}
                style={{
                  width:'100%', padding:'8px 12px', marginBottom:8,
                  background:'var(--input-bg)', border:'1px solid var(--input-border)',
                  borderRadius:6, color:'var(--input-text)', fontSize:13,
                }}
              />
              <textarea
                rows={5}
                placeholder="Mensagem..."
                value={novaMensagem}
                onChange={(e) => setNovaMensagem(e.target.value)}
                style={{
                  width:'100%', padding:'8px 12px', marginBottom:16,
                  background:'var(--input-bg)', border:'1px solid var(--input-border)',
                  borderRadius:6, color:'var(--input-text)', fontSize:13, resize:'vertical',
                }}
              />
              <div style={{display:'flex', gap:8}}>
                <button onClick={handleCriarNova} className="btn-primary" style={{flex:1}}>
                  Criar Conversa
                </button>
                <button onClick={() => setShowNova(false)} className="btn-secondary">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
