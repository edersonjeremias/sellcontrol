import { useEffect, useState } from 'react'

/**
 * Confirmação em modal, no lugar de window.confirm e window.prompt.
 *
 * Os estilos são inline de propósito: o mesmo componente serve ao sistema e
 * ao portal do cliente, que têm folhas de estilo diferentes.
 *
 *   campo  — quando presente, mostra um input e devolve o texto em onConfirmar
 *   perigo — pinta o botão de confirmar em vermelho (ações destrutivas)
 */
export default function ModalPergunta({
  titulo = 'Confirmar',
  mensagem,
  campo = null,
  textoConfirmar = 'Confirmar',
  textoCancelar = 'Cancelar',
  perigo = false,
  onConfirmar,
  onCancelar,
}) {
  const [valor, setValor] = useState(campo?.valorInicial || '')

  useEffect(() => {
    const aoTeclar = (e) => {
      if (e.key === 'Escape') onCancelar?.()
      if (e.key === 'Enter' && !campo) onConfirmar?.()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [campo, onConfirmar, onCancelar])

  const corConfirmar = perigo ? '#f44336' : 'var(--p-blue, #8ab4f8)'

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.75)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      zIndex: 12000,
    }}>
      <div style={{
        background: '#1e1e1e',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 12,
        maxWidth: 460,
        width: '100%',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          padding: '16px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
          <h3 style={{ margin: 0, color: '#e8eaed', fontSize: 16, fontWeight: 700 }}>
            {titulo}
          </h3>
          <button
            onClick={onCancelar}
            title="Fechar"
            style={{
              background: 'rgba(255,255,255,0.08)',
              color: '#e8eaed',
              border: 'none',
              borderRadius: 6,
              width: 28,
              height: 28,
              fontSize: 15,
              lineHeight: 1,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: 20 }}>
          {mensagem && (
            <p style={{ margin: 0, color: '#e8eaed', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-line' }}>
              {mensagem}
            </p>
          )}

          {campo && (
            <div style={{ marginTop: mensagem ? 16 : 0 }}>
              <label style={{ display: 'block', color: '#9aa0a6', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                {campo.label}
              </label>
              <input
                autoFocus
                value={valor}
                placeholder={campo.placeholder || ''}
                onChange={(e) => setValor(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') onConfirmar?.(valor) }}
                style={{
                  width: '100%',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 8,
                  padding: '10px 12px',
                  color: '#e8eaed',
                  fontSize: 14,
                }}
              />
              {campo.ajuda && (
                <div style={{ color: '#9aa0a6', fontSize: 11, marginTop: 6, lineHeight: 1.5 }}>
                  {campo.ajuda}
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
            <button
              onClick={() => onConfirmar?.(campo ? valor : undefined)}
              style={{
                flex: 1,
                padding: 12,
                background: corConfirmar,
                color: '#0f0f0f',
                border: 'none',
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              {textoConfirmar}
            </button>
            <button
              onClick={onCancelar}
              style={{
                flex: '0 0 auto',
                padding: '12px 20px',
                background: 'rgba(255,255,255,0.08)',
                color: '#e8eaed',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              {textoCancelar}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
