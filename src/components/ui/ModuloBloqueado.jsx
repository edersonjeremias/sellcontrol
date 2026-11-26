// ============================================================================
// MÓDULO NÃO CONTRATADO — o que a empresa vê ao abrir o que não assinou
// ============================================================================
// Mandar para o Dashboard em silêncio esconde que o recurso existe. Aqui a
// empresa descobre o que está perdendo e tem um caminho para contratar.
// ============================================================================

import { useNavigate } from 'react-router-dom'
import { moduloPorSlug } from '../../lib/modulos'
import { whatsappSuporte, linkWhatsappSuporte } from '../../lib/saas'

export default function ModuloBloqueado({ slug }) {
  const navigate = useNavigate()
  const modulo = moduloPorSlug(slug)
  const nome = modulo?.label || 'Este recurso'

  const mensagem = `Olá! Quero contratar o módulo ${nome} no sistema.`

  return (
    <div style={{
      minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: 'var(--card-bg, #1e1e1e)',
        border: '1px solid var(--border-light, #2a2a2a)',
        borderRadius: 12, padding: '32px 28px', maxWidth: 480, width: '100%',
        textAlign: 'center',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%', margin: '0 auto 18px',
          background: 'var(--input-bg, #252525)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 26,
        }}>
          <i className="fa-solid fa-lock" style={{ color: 'var(--muted, #6c757d)', fontSize: 22 }} />
        </div>

        <h2 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text-body, #fff)', margin: '0 0 10px' }}>
          {nome} não está no seu plano
        </h2>

        <p style={{ fontSize: 14, color: 'var(--muted, #adb5bd)', lineHeight: 1.6, margin: '0 0 6px' }}>
          {modulo?.descricao || 'Este módulo não está habilitado para a sua empresa.'}
        </p>

        <p style={{ fontSize: 13, color: 'var(--muted, #6c757d)', lineHeight: 1.6, margin: '0 0 24px' }}>
          Para liberar, fale com o suporte do sistema.
        </p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          {whatsappSuporte() && (
            <a
              href={linkWhatsappSuporte(mensagem)}
              target="_blank"
              rel="noreferrer"
              className="btn-acao btn-blue"
              style={{
                minHeight: 42, padding: '0 20px', display: 'inline-flex', alignItems: 'center',
                gap: 8, fontSize: 14, fontWeight: 700, color: '#171717', textDecoration: 'none',
                borderRadius: 8,
              }}
            >
              Quero contratar
            </a>
          )}
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              minHeight: 42, padding: '0 20px',
              background: 'var(--input-bg, #252525)',
              border: '1px solid var(--border-light, #333)',
              borderRadius: 8, color: 'var(--text-body, #fff)',
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Voltar ao início
          </button>
        </div>
      </div>
    </div>
  )
}
