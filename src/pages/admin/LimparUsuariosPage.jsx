import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import AppShell from '../../components/ui/AppShell'

export default function LimparUsuariosPage() {
  const { profile } = useAuth()
  const [executando, setExecutando] = useState(false)
  const [resultado, setResultado] = useState(null)

  async function executarLimpeza() {
    if (!confirm('⚠️ Tem certeza que deseja limpar os usuários inválidos?\n\nIsso irá remover:\n- Clientes do portal que estão em users_perfil\n- Usuários com role master que não são você')) {
      return
    }

    setExecutando(true)
    setResultado(null)

    try {
      const response = await fetch('/api/limpar-usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      const data = await response.json()
      setResultado(data)

    } catch (error) {
      setResultado({
        success: false,
        error: error.message
      })
    } finally {
      setExecutando(false)
    }
  }

  if (profile?.role !== 'master') {
    return (
      <AppShell title="Acesso Negado">
        <div style={{ padding: 40, textAlign: 'center' }}>
          <p>Apenas usuários master podem acessar esta página.</p>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell title="Limpar Usuários Inválidos">
      <div style={{ padding: 24, maxWidth: 800 }}>

        <div style={{
          background: 'rgba(251, 191, 36, 0.1)',
          border: '1px solid rgba(251, 191, 36, 0.3)',
          borderRadius: 8,
          padding: 16,
          marginBottom: 24
        }}>
          <h3 style={{ margin: '0 0 12px', color: 'var(--yellow)' }}>⚠️ Atenção</h3>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-body)' }}>
            Esta ferramenta remove usuários inválidos do sistema:
          </p>
          <ul style={{ marginTop: 8, fontSize: 14, color: 'var(--text-body)' }}>
            <li>Clientes do portal que estão cadastrados em users_perfil</li>
            <li>Usuários com role 'master' que não são você (Ederson Jeremias)</li>
          </ul>
        </div>

        <button
          className="btn-acao btn-blue"
          onClick={executarLimpeza}
          disabled={executando}
          style={{
            padding: '12px 24px',
            fontSize: 15,
            fontWeight: 700,
            color: '#171717'
          }}
        >
          {executando ? '⏳ Executando...' : '🗑️ Executar Limpeza'}
        </button>

        {resultado && (
          <div style={{
            marginTop: 24,
            background: 'var(--card-bg)',
            border: '1px solid var(--border-light)',
            borderRadius: 8,
            padding: 16
          }}>
            <h3 style={{
              margin: '0 0 16px',
              color: resultado.success ? 'var(--green)' : 'var(--red)'
            }}>
              {resultado.success ? '✅ Limpeza Concluída' : '❌ Erro'}
            </h3>

            {resultado.success && (
              <>
                <div style={{ marginBottom: 16 }}>
                  <strong>Usuários removidos: {resultado.removidos}</strong>
                </div>

                {resultado.detalhes?.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ margin: '0 0 8px', fontWeight: 600 }}>Detalhes:</p>
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                      {resultado.detalhes.map((u, i) => (
                        <li key={i} style={{ marginBottom: 4, fontSize: 14 }}>
                          {u.nome} - {u.email} ({u.role}) - {u.motivo}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {resultado.log && (
                  <div>
                    <p style={{ margin: '0 0 8px', fontWeight: 600 }}>Log:</p>
                    <div style={{
                      background: 'var(--input-bg)',
                      padding: 12,
                      borderRadius: 6,
                      fontSize: 13,
                      fontFamily: 'monospace',
                      maxHeight: 400,
                      overflow: 'auto'
                    }}>
                      {resultado.log.map((linha, i) => (
                        <div key={i}>{linha}</div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {!resultado.success && (
              <p style={{ color: 'var(--red)', margin: 0 }}>
                {resultado.error || resultado.message}
              </p>
            )}
          </div>
        )}

      </div>
    </AppShell>
  )
}
