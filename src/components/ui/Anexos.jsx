import { useState, useEffect, useRef, useCallback } from 'react'
import {
  ACCEPT_ANEXO, MAX_ANEXOS, ehImagem, fmtTamanho,
  normalizarAnexos, nomeAmigavel, uploadAnexos, validarAnexo,
} from '../../services/anexosService'

// ════════════════════════════════════════════════════════════════
// Anexos de mensagem — anexar, colar (Ctrl+V), arrastar e visualizar
// Usado em Contatos, Notificações e no Portal do cliente.
// ════════════════════════════════════════════════════════════════

const TEMAS = {
  admin: {
    bg:'var(--header-bg)', card:'var(--card-bg)', borda:'var(--border-light)',
    texto:'var(--text-body)', muted:'var(--muted)', accent:'var(--blue)',
  },
  portal: {
    bg:'var(--p-card)', card:'var(--p-card)', borda:'var(--p-border)',
    texto:'var(--p-text)', muted:'var(--p-muted)', accent:'var(--p-blue)',
  },
}
const cores = (tema) => TEMAS[tema] || TEMAS.admin

// Extrai arquivos de um evento de colar (clipboardData) ou soltar (dataTransfer)
export function arquivosDoEvento(e) {
  const dt = e.clipboardData || e.dataTransfer
  if (!dt) return []
  if (dt.files && dt.files.length) return Array.from(dt.files)
  const itens = Array.from(dt.items || [])
  return itens
    .filter(i => i.kind === 'file')
    .map(i => i.getAsFile())
    .filter(Boolean)
}

/**
 * Estado dos arquivos pendentes de envio.
 * @param {string} pasta   'contatos' | 'notificacoes'
 * @param {object} client  cliente Supabase (portalSb no portal)
 * @param {function} onErro(msg)
 */
export function useAnexos({ pasta = 'mensagens', client, onErro } = {}) {
  const [itens, setItens] = useState([])
  const [subindo, setSubindo] = useState(false)
  const itensRef = useRef(itens)
  itensRef.current = itens

  // Libera as previews ao desmontar
  useEffect(() => () => {
    itensRef.current.forEach(i => { if (i.preview) URL.revokeObjectURL(i.preview) })
  }, [])

  const adicionar = useCallback((files) => {
    const lista = Array.from(files || []).filter(Boolean)
    if (!lista.length) return
    setItens(atuais => {
      const novos = []
      for (const file of lista) {
        if (atuais.length + novos.length >= MAX_ANEXOS) {
          onErro?.(`Máximo de ${MAX_ANEXOS} anexos por mensagem.`)
          break
        }
        const erro = validarAnexo(file)
        if (erro) { onErro?.(erro); continue }
        novos.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file,
          nome: nomeAmigavel(file),
          tipo: String(file.type || '').toLowerCase(),
          tamanho: file.size,
          preview: ehImagem(file.type) ? URL.createObjectURL(file) : null,
        })
      }
      return novos.length ? [...atuais, ...novos] : atuais
    })
  }, [onErro])

  const remover = useCallback((id) => {
    setItens(atuais => {
      const alvo = atuais.find(i => i.id === id)
      if (alvo?.preview) URL.revokeObjectURL(alvo.preview)
      return atuais.filter(i => i.id !== id)
    })
  }, [])

  const limpar = useCallback(() => {
    setItens(atuais => {
      atuais.forEach(i => { if (i.preview) URL.revokeObjectURL(i.preview) })
      return []
    })
  }, [])

  // Sobe tudo e devolve os registros prontos para salvar no banco
  const subir = useCallback(async () => {
    const atuais = itensRef.current
    if (!atuais.length) return []
    setSubindo(true)
    try {
      return await uploadAnexos(atuais.map(i => i.file), pasta, client)
    } finally {
      setSubindo(false)
    }
  }, [pasta, client])

  return { itens, adicionar, remover, limpar, subir, subindo, temAnexos: itens.length > 0 }
}

// ── Botão de clipe ─────────────────────────────────────────────
export function BotaoAnexo({ onArquivos, disabled, tema = 'admin', titulo = 'Anexar imagem ou PDF' }) {
  const ref = useRef(null)
  const c = cores(tema)
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={ACCEPT_ANEXO}
        multiple
        style={{ display:'none' }}
        onChange={e => { onArquivos(e.target.files); e.target.value = '' }}
      />
      <button
        type="button"
        title={titulo}
        aria-label={titulo}
        disabled={disabled}
        onClick={() => ref.current?.click()}
        style={{
          background:'none', border:`1px solid ${c.borda}`, borderRadius:8,
          color: disabled ? c.muted : c.accent, cursor: disabled ? 'not-allowed' : 'pointer',
          padding:'0 12px', fontSize:17, lineHeight:1, alignSelf:'stretch',
          opacity: disabled ? 0.5 : 1, flexShrink:0,
        }}
      >
        📎
      </button>
    </>
  )
}

// ── Prévia dos arquivos antes de enviar ────────────────────────
export function PreviaAnexos({ itens, onRemover, tema = 'admin', subindo = false }) {
  const c = cores(tema)
  if (!itens?.length) return null
  return (
    <div style={{ display:'flex', gap:8, flexWrap:'wrap', padding:'8px 0 0' }}>
      {itens.map(item => (
        <div key={item.id} style={{
          position:'relative', display:'flex', alignItems:'center', gap:8,
          background:c.bg, border:`1px solid ${c.borda}`, borderRadius:8,
          padding:'6px 10px 6px 6px', maxWidth:200, opacity: subindo ? 0.6 : 1,
        }}>
          {item.preview ? (
            <img src={item.preview} alt={item.nome}
              style={{ width:38, height:38, objectFit:'cover', borderRadius:6, flexShrink:0 }} />
          ) : (
            <div style={{
              width:38, height:38, borderRadius:6, flexShrink:0, display:'flex',
              alignItems:'center', justifyContent:'center', background:'rgba(242,139,130,0.15)',
              color:'#f28b82', fontSize:10, fontWeight:700,
            }}>PDF</div>
          )}
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:11, color:c.texto, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {item.nome}
            </div>
            <div style={{ fontSize:10, color:c.muted }}>{fmtTamanho(item.tamanho)}</div>
          </div>
          {!subindo && (
            <button type="button" onClick={() => onRemover(item.id)} aria-label="Remover anexo"
              style={{
                position:'absolute', top:-6, right:-6, width:20, height:20, borderRadius:'50%',
                background:'#f28b82', color:'#0f0f0f', border:'none',
                fontSize:12, lineHeight:1, cursor:'pointer', fontWeight:700,
              }}>✕</button>
          )}
        </div>
      ))}
    </div>
  )
}

const btnLightbox = {
  background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.2)',
  color:'#e8eaed', borderRadius:8, padding:'8px 14px', fontSize:13, cursor:'pointer',
}

// ── Visualizador em tela cheia ─────────────────────────────────
export function LightboxImagem({ imagens, indice, onFechar, onNavegar }) {
  useEffect(() => {
    function tecla(e) {
      if (e.key === 'Escape') onFechar()
      if (e.key === 'ArrowRight') onNavegar(1)
      if (e.key === 'ArrowLeft')  onNavegar(-1)
    }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [onFechar, onNavegar])

  const atual = imagens[indice]
  if (!atual) return null

  return (
    <div
      onClick={onFechar}
      style={{
        position:'fixed', inset:0, zIndex:99999, background:'rgba(0,0,0,0.92)',
        display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:16,
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{ display:'flex', flexDirection:'column', alignItems:'center', maxWidth:'100%', maxHeight:'100%' }}>
        <img src={atual.url} alt={atual.nome}
          style={{ maxWidth:'92vw', maxHeight:'78vh', objectFit:'contain', borderRadius:8 }} />
        <div style={{ display:'flex', alignItems:'center', gap:16, marginTop:14, flexWrap:'wrap', justifyContent:'center' }}>
          {imagens.length > 1 && (
            <>
              <button onClick={() => onNavegar(-1)} style={btnLightbox}>‹ Anterior</button>
              <span style={{ color:'#9aa0a6', fontSize:12 }}>{indice + 1} / {imagens.length}</span>
              <button onClick={() => onNavegar(1)} style={btnLightbox}>Próxima ›</button>
            </>
          )}
          <a href={atual.url} target="_blank" rel="noreferrer" download={atual.nome}
            style={{ ...btnLightbox, textDecoration:'none', display:'inline-block' }}>
            Abrir / baixar
          </a>
          <button onClick={onFechar} style={btnLightbox}>Fechar</button>
        </div>
        <div style={{ color:'#9aa0a6', fontSize:11, marginTop:8, textAlign:'center' }}>{atual.nome}</div>
      </div>
    </div>
  )
}

// ── Anexos já enviados, dentro da bolha da mensagem ────────────
export function AnexosMensagem({ anexos, tema = 'admin' }) {
  const lista = normalizarAnexos(anexos)
  const [zoom, setZoom] = useState(-1)
  const c = cores(tema)
  if (!lista.length) return null

  const imagens  = lista.filter(a => ehImagem(a.tipo))
  const arquivos = lista.filter(a => !ehImagem(a.tipo))

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6, marginTop:2 }}>
      {imagens.length > 0 && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
          {imagens.map((a, i) => (
            <img
              key={a.url + i}
              src={a.url}
              alt={a.nome || 'imagem'}
              loading="lazy"
              onClick={() => setZoom(i)}
              style={{
                maxWidth: imagens.length > 1 ? 120 : 220,
                maxHeight: imagens.length > 1 ? 120 : 240,
                width:'auto', borderRadius:8, cursor:'zoom-in', display:'block',
                border:`1px solid ${c.borda}`, objectFit:'cover',
              }}
            />
          ))}
        </div>
      )}

      {arquivos.map((a, i) => (
        <a key={a.url + i} href={a.url} target="_blank" rel="noreferrer"
          style={{
            display:'flex', alignItems:'center', gap:10, textDecoration:'none',
            background:'rgba(0,0,0,0.32)', border:'1px solid rgba(255,255,255,0.12)',
            borderRadius:8, padding:'8px 10px', maxWidth:260,
          }}>
          <span style={{ fontSize:10, fontWeight:700, color:'#f28b82', flexShrink:0 }}>PDF</span>
          <span style={{ minWidth:0 }}>
            <span style={{ display:'block', fontSize:12, color:'#e8eaed', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {a.nome || 'documento.pdf'}
            </span>
            {a.tamanho ? <span style={{ fontSize:10, color:'#9aa0a6' }}>{fmtTamanho(a.tamanho)}</span> : null}
          </span>
        </a>
      ))}

      {zoom >= 0 && (
        <LightboxImagem
          imagens={imagens}
          indice={zoom}
          onFechar={() => setZoom(-1)}
          onNavegar={(passo) => setZoom(i => (i + passo + imagens.length) % imagens.length)}
        />
      )}
    </div>
  )
}
