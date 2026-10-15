import { useState, useEffect } from 'react'
import { getConfig, saveConfig } from '../../services/configService'

const SI = {
  background: 'var(--input-bg)', border: '1px solid var(--border-light)',
  color: 'var(--text-body)', borderRadius: 6, padding: '8px 10px',
  fontSize: 14, width: '100%', colorScheme: 'dark',
}

const ENDPOINT = 'receber-solicitacao-envio'

// Token aleatório de 32 caracteres hex, gerado no navegador
function gerarToken() {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  return `mc_${hex}`
}

// ── Campo somente leitura com botão de copiar ──────────────────
function CampoCopiavel({ label, valor, oculto = false, onToggleOculto, onCopiar, ajuda }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6, fontWeight: 600 }}>
        {label}
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          readOnly
          type={oculto ? 'password' : 'text'}
          value={valor}
          onFocus={e => e.target.select()}
          style={{ ...SI, flex: 1, fontFamily: 'monospace', fontSize: 12 }}
        />
        {onToggleOculto && (
          <button
            onClick={onToggleOculto}
            style={{ background: 'var(--input-bg)', border: '1px solid var(--border-light)', borderRadius: 6, padding: '0 12px', cursor: 'pointer', color: 'var(--muted)', fontSize: 13 }}
          >
            {oculto ? '👁️' : '🙈'}
          </button>
        )}
        <button
          onClick={onCopiar}
          style={{ background: 'var(--input-bg)', border: '1px solid var(--border-light)', borderRadius: 6, padding: '0 12px', cursor: 'pointer', color: 'var(--blue)', fontSize: 13, whiteSpace: 'nowrap' }}
        >
          Copiar
        </button>
      </div>
      {ajuda && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5 }}>{ajuda}</div>}
    </div>
  )
}

export default function AbaIntegracoes({ tenantId, showToast }) {
  const [token,        setToken]        = useState('')
  const [carregando,   setCarregando]   = useState(true)
  const [salvando,     setSalvando]     = useState(false)
  const [mostrarToken, setMostrarToken] = useState(false)
  const [confirmando,  setConfirmando]  = useState(null) // 'regerar' | 'desativar'

  const urlWebhook  = `${import.meta.env.VITE_SUPABASE_URL || ''}/functions/v1/${ENDPOINT}`
  const bodyExemplo = '{ "instagram_username": "{{Usuário}}", "observacoes": "{{observações}}" }'

  useEffect(() => {
    if (!tenantId) return
    getConfig(tenantId)
      .then(cfg => setToken(cfg?.manychat_webhook_token || ''))
      .catch(e => showToast('Erro ao carregar integração: ' + e.message, 'error'))
      .finally(() => setCarregando(false))
  }, [tenantId, showToast])

  async function copiar(texto, nome) {
    try {
      await navigator.clipboard.writeText(texto)
      showToast(`${nome} copiado!`)
    } catch {
      showToast('Não foi possível copiar. Selecione e use Ctrl+C.', 'error')
    }
  }

  async function persistir(novoToken, mensagem) {
    setSalvando(true)
    try {
      await saveConfig(tenantId, { manychat_webhook_token: novoToken })
      setToken(novoToken || '')
      setConfirmando(null)
      showToast(mensagem)
    } catch (e) {
      showToast('Erro ao salvar: ' + e.message, 'error')
    } finally {
      setSalvando(false)
    }
  }

  if (carregando) {
    return <div style={{ padding: '24px 0', fontSize: 13, color: 'var(--muted)' }}>Carregando…</div>
  }

  const ativo = !!token

  return (
    <div style={{ maxWidth: 560, padding: '24px 0' }}>

      {/* ── Cabeçalho da integração ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-body)' }}>
          🤖 ManyChat — Solicitação de Envio
        </span>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
          color: ativo ? 'var(--green)' : 'var(--muted)',
          background: ativo ? 'rgba(52, 211, 153, 0.12)' : 'rgba(255, 255, 255, 0.06)',
          border: `1px solid ${ativo ? 'rgba(52, 211, 153, 0.35)' : 'var(--border-light)'}`,
        }}>
          {ativo ? 'ATIVA' : 'DESATIVADA'}
        </span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 20 }}>
        Quando a cliente encerra a sacolinha no Direct, o ManyChat avisa o sistema e o pedido
        entra sozinho na página de <strong>Produção</strong> — sem passar por planilha.
      </div>

      {!ativo && (
        <div style={{
          padding: 14, background: 'rgba(139, 180, 248, 0.1)',
          border: '1px solid rgba(139, 180, 248, 0.3)', borderRadius: 8, marginBottom: 18,
        }}>
          <div style={{ fontSize: 12, color: 'var(--blue)', marginBottom: 12 }}>
            Gere um token para ativar. Ele é a senha que o ManyChat usa para falar com o sistema.
          </div>
          <button
            className="btn-acao btn-green"
            onClick={() => persistir(gerarToken(), 'Integração ativada! Agora configure o ManyChat.')}
            disabled={salvando}
            style={{ padding: '0 18px', minHeight: 38, fontSize: 13, color: '#171717', fontWeight: 700 }}
          >
            {salvando ? 'Gerando…' : 'Ativar integração'}
          </button>
        </div>
      )}

      {ativo && (
        <>
          <CampoCopiavel
            label="1. URL do webhook"
            valor={urlWebhook}
            onCopiar={() => copiar(urlWebhook, 'URL')}
            ajuda="No ManyChat: ação External Request, método POST, cole nesta URL."
          />

          <CampoCopiavel
            label="2. Token (header x-webhook-secret)"
            valor={token}
            oculto={!mostrarToken}
            onToggleOculto={() => setMostrarToken(v => !v)}
            onCopiar={() => copiar(token, 'Token')}
            ajuda="Em Headers, adicione x-webhook-secret com este valor. Não compartilhe fora da sua equipe."
          />

          <CampoCopiavel
            label="3. Body (JSON)"
            valor={bodyExemplo}
            onCopiar={() => copiar(bodyExemplo, 'Body')}
            ajuda="Troque os campos entre chaves pelos dados da Manychat que você já usa hoje na planilha."
          />

          {/* ── Passo a passo ── */}
          <div style={{
            background: 'var(--card-bg)', border: '1px solid var(--border-light)',
            borderRadius: 8, padding: 14, marginBottom: 20,
          }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 8 }}>
              Como ligar no ManyChat
            </div>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text-body)', lineHeight: 1.9 }}>
              <li>Abra o fluxo que encerra a sacolinha e vá no bloco de Ações.</li>
              <li>Adicione a ação <strong>External Request</strong> (POST) com a URL acima.</li>
              <li>Em Headers, inclua <code>Content-Type: application/json</code> e o <code>x-webhook-secret</code>.</li>
              <li>Em Body, cole o JSON e mapeie os campos da cliente.</li>
              <li>Teste com uma cliente de verdade e confira se o pedido apareceu em Produção.</li>
            </ol>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10, lineHeight: 1.6 }}>
              Se a mesma cliente pedir duas vezes no mesmo dia, o sistema junta as observações no
              pedido que já existe em vez de duplicar a linha.
            </div>
          </div>

          {/* ── Ações de risco ── */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {confirmando === null && (
              <>
                <button
                  onClick={() => setConfirmando('regerar')}
                  style={{ background: 'var(--input-bg)', border: '1px solid var(--border-light)', borderRadius: 6, padding: '8px 14px', cursor: 'pointer', color: 'var(--yellow)', fontSize: 12, fontWeight: 600 }}
                >
                  Gerar novo token
                </button>
                <button
                  onClick={() => setConfirmando('desativar')}
                  style={{ background: 'var(--input-bg)', border: '1px solid var(--border-light)', borderRadius: 6, padding: '8px 14px', cursor: 'pointer', color: '#f28b82', fontSize: 12, fontWeight: 600 }}
                >
                  Desativar integração
                </button>
              </>
            )}

            {confirmando && (
              <div style={{
                width: '100%', padding: 12, borderRadius: 8,
                background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.3)',
              }}>
                <div style={{ fontSize: 12, color: 'var(--yellow)', marginBottom: 10, lineHeight: 1.6 }}>
                  {confirmando === 'regerar'
                    ? 'O token atual para de funcionar na hora. Você vai precisar atualizar o header no ManyChat com o token novo. Confirma?'
                    : 'A integração para de receber pedidos até você ativar de novo. Confirma?'}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn-acao btn-blue"
                    disabled={salvando}
                    onClick={() => confirmando === 'regerar'
                      ? persistir(gerarToken(), 'Token novo gerado. Atualize o ManyChat!')
                      : persistir(null, 'Integração desativada.')}
                    style={{ padding: '0 16px', minHeight: 34, fontSize: 12, color: '#171717', fontWeight: 700 }}
                  >
                    {salvando ? 'Aguarde…' : 'Confirmar'}
                  </button>
                  <button
                    onClick={() => setConfirmando(null)}
                    disabled={salvando}
                    style={{ background: 'var(--input-bg)', border: '1px solid var(--border-light)', borderRadius: 6, padding: '0 16px', minHeight: 34, cursor: 'pointer', color: 'var(--muted)', fontSize: 12 }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
