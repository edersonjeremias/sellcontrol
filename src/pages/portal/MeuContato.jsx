import { useState, useEffect, useRef } from 'react'
import { usePortalToast } from '../../components/portal/PortalToast'
import {
  portalCriarConversa, portalGetConversas,
  portalGetMensagens, portalResponder,
} from '../../services/conversasService'

function fmtHora(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
}

const STATUS_LABEL = {
  Novo:                'Novo',
  Orçamento:           'Orçamento',
  Negociação:          'Negociação',
  'Aguardando Resposta':'Aguard. Resposta',
  Encerrado:           'Encerrado',
}
const STATUS_COR = {
  Novo:                '#8ab4f8',
  Orçamento:           '#fbbc04',
  Negociação:          '#c58af9',
  'Aguardando Resposta':'#f28b82',
  Encerrado:           '#81c995',
}

// ── Thread de mensagens ────────────────────────────────────────
function ThreadConversa({ conversa, instagram, onVoltar }) {
  const toast = usePortalToast()
  const [msgs, setMsgs]       = useState([])
  const [texto, setTexto]     = useState('')
  const [enviando, setEnviando] = useState(false)
  const endRef = useRef(null)

  useEffect(() => {
    portalGetMensagens(conversa.id).then(setMsgs).catch(() => {})
  }, [conversa.id])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior:'smooth' })
  }, [msgs])

  async function enviar() {
    if (!texto.trim() || enviando) return
    setEnviando(true)
    try {
      await portalResponder(conversa.id, texto.trim())
      setTexto('')
      const novas = await portalGetMensagens(conversa.id)
      setMsgs(novas)
    } catch { toast('Erro ao enviar mensagem.', 'error') }
    setEnviando(false)
  }

  const cor = STATUS_COR[conversa.coluna] || '#8ab4f8'

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 0', borderBottom:'1px solid var(--p-border)', marginBottom:12 }}>
        <button onClick={onVoltar} style={{ background:'none', border:'none', color:'var(--p-blue)', cursor:'pointer', fontSize:18, lineHeight:1, padding:0 }}>←</button>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:14, fontWeight:700, color:'var(--p-text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {conversa.assunto}
          </div>
        </div>
        <span style={{ fontSize:11, fontWeight:700, color:cor, background:`${cor}22`, padding:'3px 10px', borderRadius:20, whiteSpace:'nowrap' }}>
          {STATUS_LABEL[conversa.coluna] || conversa.coluna}
        </span>
      </div>

      {/* Mensagens */}
      <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:10, paddingBottom:8 }}>
        {msgs.map(m => {
          const isCliente = m.remetente === 'cliente'
          return (
            <div key={m.id} style={{ display:'flex', flexDirection:'column', alignItems: isCliente ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth:'85%', padding:'10px 14px',
                borderRadius: isCliente ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                background: isCliente ? 'var(--p-blue)' : 'var(--p-card)',
                color: isCliente ? '#0f0f0f' : 'var(--p-text)',
                fontSize:14, lineHeight:1.5,
              }}>
                {m.texto}
              </div>
              <span style={{ fontSize:10, color:'var(--p-muted)', marginTop:3 }}>
                {isCliente ? 'Você' : 'VM Kids'} · {fmtHora(m.created_at)}
              </span>
            </div>
          )
        })}
        {msgs.length === 0 && (
          <p style={{ color:'var(--p-muted)', textAlign:'center', fontSize:13 }}>Sem mensagens ainda.</p>
        )}
        <div ref={endRef} />
      </div>

      {/* Input resposta */}
      {conversa.encerrado ? (
        <div style={{ padding:'12px 0', textAlign:'center', fontSize:12, color:'var(--p-muted)', borderTop:'1px solid var(--p-border)' }}>
          Esta conversa foi encerrada.
        </div>
      ) : (
        <div style={{ display:'flex', gap:8, paddingTop:12, borderTop:'1px solid var(--p-border)' }}>
          <textarea
            value={texto}
            onChange={e => setTexto(e.target.value)}
            onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
            placeholder="Responder…"
            rows={2}
            style={{ flex:1, background:'var(--p-input)', border:'1px solid var(--p-border)', borderRadius:10, color:'var(--p-text)', padding:'10px 14px', fontSize:14, resize:'none', outline:'none' }}
          />
          <button onClick={enviar} disabled={enviando || !texto.trim()}
            className="portal-btn portal-btn-blue"
            style={{ alignSelf:'stretch', minWidth:60, fontSize:13 }}>
            {enviando ? '…' : '➤'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Formulário de nova conversa ────────────────────────────────
function NovaConversa({ onEnviada, onCancelar }) {
  const toast = usePortalToast()
  const [assunto, setAssunto] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar() {
    if (!assunto.trim() || !mensagem.trim()) return toast('Preencha assunto e mensagem.', 'error')
    setEnviando(true)
    try {
      await portalCriarConversa(assunto.trim(), mensagem.trim())
      toast('Mensagem enviada!', 'success')
      onEnviada()
    } catch { toast('Erro ao enviar.', 'error') }
    setEnviando(false)
  }

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
        <button onClick={onCancelar} style={{ background:'none', border:'none', color:'var(--p-blue)', cursor:'pointer', fontSize:18, padding:0 }}>←</button>
        <h3 style={{ margin:0, fontSize:16, color:'var(--p-text)' }}>Nova Mensagem</h3>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        <div>
          <label style={{ fontSize:11, fontWeight:700, color:'var(--p-muted)', textTransform:'uppercase', display:'block', marginBottom:6 }}>Assunto *</label>
          <input value={assunto} onChange={e => setAssunto(e.target.value)} placeholder="Ex: Orçamento bolsa infantil, Dúvida sobre pedido…"
            style={{ width:'100%', background:'var(--p-input)', border:'1px solid var(--p-border)', borderRadius:10, color:'var(--p-text)', padding:'12px 14px', fontSize:14, outline:'none', boxSizing:'border-box' }} />
        </div>
        <div>
          <label style={{ fontSize:11, fontWeight:700, color:'var(--p-muted)', textTransform:'uppercase', display:'block', marginBottom:6 }}>Mensagem *</label>
          <textarea value={mensagem} onChange={e => setMensagem(e.target.value)} rows={5} placeholder="Escreva sua mensagem aqui…"
            style={{ width:'100%', background:'var(--p-input)', border:'1px solid var(--p-border)', borderRadius:10, color:'var(--p-text)', padding:'12px 14px', fontSize:14, resize:'none', outline:'none', boxSizing:'border-box' }} />
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={onCancelar} className="portal-btn" style={{ flex:1, background:'var(--p-card)', color:'var(--p-muted)' }}>Cancelar</button>
          <button onClick={enviar} disabled={enviando} className="portal-btn portal-btn-green" style={{ flex:2 }}>
            {enviando ? 'Enviando…' : '✉ Enviar Mensagem'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
export default function MeuContato() {
  const toast = usePortalToast()
  const [conversas,   setConversas]   = useState([])
  const [loading,     setLoading]     = useState(true)
  const [tela,        setTela]        = useState('lista')  // 'lista' | 'nova' | 'thread'
  const [selConv,     setSelConv]     = useState(null)

  async function carregar() {
    setLoading(true)
    try { setConversas(await portalGetConversas()) }
    catch { toast('Erro ao carregar conversas.', 'error') }
    setLoading(false)
  }

  useEffect(() => { carregar() }, []) // eslint-disable-line

  if (loading) return <div className="portal-loading">Carregando…</div>

  return (
    <div className="portal-content" style={{ minHeight:'calc(100vh - 100px)', display:'flex', flexDirection:'column' }}>

      {tela === 'nova' && (
        <NovaConversa
          onEnviada={() => { carregar(); setTela('lista') }}
          onCancelar={() => setTela('lista')}
        />
      )}

      {tela === 'thread' && selConv && (
        <ThreadConversa
          conversa={selConv}
          onVoltar={() => { setTela('lista'); carregar() }}
        />
      )}

      {tela === 'lista' && (
        <>
          {/* Botão nova mensagem */}
          <button onClick={() => setTela('nova')} className="portal-btn portal-btn-green"
            style={{ width:'100%', marginBottom:16, fontSize:14, padding:'12px' }}>
            ✉ Nova Mensagem / Contato
          </button>

          {/* Lista de conversas */}
          {conversas.length === 0 ? (
            <div className="portal-empty" style={{ color:'var(--p-muted)' }}>
              Nenhuma conversa ainda. Clique em "Nova Mensagem" para entrar em contato.
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {conversas.map(c => {
                const cor = STATUS_COR[c.coluna] || '#8ab4f8'
                return (
                  <div key={c.id}
                    onClick={() => { setSelConv(c); setTela('thread') }}
                    style={{
                      background:'var(--p-card)', border:'1px solid var(--p-border)', borderRadius:12,
                      padding:'14px 16px', cursor:'pointer', transition:'background 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--p-card2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'var(--p-card)'}
                  >
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                      <span style={{ fontSize:14, fontWeight:700, color:'var(--p-text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1, marginRight:8 }}>
                        {c.assunto}
                      </span>
                      <span style={{ fontSize:11, fontWeight:700, color:cor, background:`${cor}22`, padding:'3px 10px', borderRadius:20, whiteSpace:'nowrap', flexShrink:0 }}>
                        {STATUS_LABEL[c.coluna] || c.coluna}
                      </span>
                    </div>
                    {c.ultima_msg && (
                      <div style={{ fontSize:13, color:'var(--p-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {c.ultima_msg}
                      </div>
                    )}
                    <div style={{ fontSize:11, color:'var(--p-muted)', marginTop:4 }}>
                      {fmtHora(c.updated_at)}
                      {c.encerrado && <span style={{ marginLeft:8, color:'var(--p-green)' }}>· Encerrado</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
