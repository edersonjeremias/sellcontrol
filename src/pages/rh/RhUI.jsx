// Peças de UI compartilhadas pelas abas do RH.
// Mantém o mesmo visual de Contas a Pagar / Compras.

export const S = {
  inp:  { background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:6, color:'var(--input-text)', padding:'8px 11px', fontSize:14, outline:'none', width:'100%' },
  inpS: { background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:6, color:'var(--input-text)', padding:'6px 9px', fontSize:14, outline:'none' },
  btn:  { background:'var(--blue)', color:'#0f0f0f', border:'none', borderRadius:6, padding:'7px 14px', fontWeight:700, cursor:'pointer', fontSize:14 },
  sec:  { background:'var(--btn-cancel-bg)', color:'var(--btn-cancel-text)', border:'none', borderRadius:6, padding:'7px 14px', fontWeight:600, cursor:'pointer', fontSize:14 },
  del:  { background:'var(--red)', color:'#0f0f0f', border:'none', borderRadius:6, padding:'7px 14px', fontWeight:700, cursor:'pointer', fontSize:14 },
  ok:   { background:'var(--green)', color:'#0f0f0f', border:'none', borderRadius:6, padding:'7px 14px', fontWeight:700, cursor:'pointer', fontSize:14 },
  wpp:  { background:'#25d366', color:'#0f0f0f', border:'none', borderRadius:6, padding:'7px 14px', fontWeight:700, cursor:'pointer', fontSize:14 },
}

export function Campo({ label, children, span }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4, gridColumn: span ? `span ${span}` : undefined, minWidth:0 }}>
      <label style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.4px' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

export function Modal({ titulo, onFechar, children, footer, largura = 520 }) {
  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth:largura }} onClick={e => e.stopPropagation()}>
        <div className="modal-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <h3 style={{ margin:0, fontSize:16 }}>{titulo}</h3>
          <button onClick={onFechar} style={{ background:'none', border:'none', color:'var(--muted)', fontSize:18, cursor:'pointer' }}>✕</button>
        </div>
        <div className="modal-body" style={{ padding:20, paddingBottom:20, display:'grid', gap:12 }}>
          {children}
        </div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

export function ModalConfirma({ titulo, texto, onCancelar, onConfirmar, textoBotao = 'Excluir', perigo = true }) {
  return (
    <div className="modal-overlay" onClick={onCancelar}>
      <div className="modal-card mini" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h3 style={{ fontSize:16 }}>{titulo}</h3></div>
        <div className="modal-body" style={{ padding:20, paddingBottom:20 }}>{texto}</div>
        <div className="modal-footer">
          <button className="btn-cancel" onClick={onCancelar}>Cancelar</button>
          <button className={perigo ? 'btn-danger' : 'btn-confirm'} onClick={onConfirmar}>{textoBotao}</button>
        </div>
      </div>
    </div>
  )
}

const SVG = { viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:2, strokeLinecap:'round', strokeLinejoin:'round' }

export const IconCheck = () => <svg {...SVG} strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
export const IconEdit  = () => <svg {...SVG}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
export const IconTrash = () => <svg {...SVG}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
export const IconUndo  = () => <svg {...SVG}><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
export const IconWhats = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.136-.136.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.05-.52-.099-.148-.669-1.612-.916-2.207-.244-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.464 3.488"/>
  </svg>
)
