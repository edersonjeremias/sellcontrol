import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import {
  getAvisosVigentes,
  getAvisosLidos,
  marcarAvisoLido,
  corDoAviso,
} from '../../services/avisosService'
import { sanitizarHtml, htmlParaTexto } from '../../lib/htmlSeguro'
import '../../styles/avisos.css'

function dataCurta(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export default function MuralAvisos({ onTemAvisos }) {
  const { profile } = useAuth()
  const tenantId = profile?.tenant_id

  const [avisos, setAvisos] = useState([])
  const [lidos, setLidos] = useState([])
  const [aberto, setAberto] = useState(null)
  const [carregado, setCarregado] = useState(false)

  const carregar = useCallback(async () => {
    if (!tenantId) return
    try {
      const [lista, jaLidos] = await Promise.all([
        getAvisosVigentes(tenantId),
        getAvisosLidos(tenantId, profile?.id),
      ])
      setAvisos(lista)
      setLidos(jaLidos)
      onTemAvisos?.(lista.length > 0)

      // Aviso marcado para abrir sozinho só interrompe quem ainda não leu —
      // senão o mesmo modal apareceria toda vez que a pessoa abre o sistema.
      const pendente = lista.find(a => a.abrir_automatico && !jaLidos.includes(a.id))
      if (pendente) setAberto(pendente)
    } catch (err) {
      console.error('Erro ao carregar o mural de avisos:', err)
    } finally {
      setCarregado(true)
    }
  // onTemAvisos fica fora das dependências de propósito: se o pai passar uma
  // função nova a cada render, recarregar o mural viraria laço infinito.
  }, [tenantId, profile?.id])

  useEffect(() => { carregar() }, [carregar])

  async function registrarLeitura(aviso) {
    if (!aviso || lidos.includes(aviso.id)) return
    setLidos(prev => [...prev, aviso.id])
    try {
      await marcarAvisoLido(tenantId, aviso.id, profile)
    } catch (err) {
      console.error('Erro ao registrar a leitura do aviso:', err)
    }
  }

  function abrir(aviso) {
    setAberto(aviso)
    registrarLeitura(aviso)
  }

  // O aviso que abre sozinho não passa por abrir(): sem registrar a leitura
  // no fechamento, o mesmo modal voltaria a aparecer em toda entrada.
  function fechar() {
    const aviso = aberto
    setAberto(null)
    registrarLeitura(aviso)
  }

  if (!carregado || avisos.length === 0) return null

  return (
    <>
      <div className="mural-grid">
        {avisos.map(aviso => {
          const naoLido = !lidos.includes(aviso.id)
          return (
            <button
              key={aviso.id}
              type="button"
              className={`mural-card${naoLido ? ' nao-lido' : ''}`}
              style={{ borderLeftColor: corDoAviso(aviso.cor) }}
              onClick={() => abrir(aviso)}
            >
              {aviso.imagem_url && (
                <div className="mural-card-foto">
                  <img src={aviso.imagem_url} alt="" />
                </div>
              )}

              <div className="mural-card-topo">
                <h3 style={{ color: corDoAviso(aviso.cor) }}>{aviso.titulo}</h3>
                {aviso.fixado && <span className="mural-pin" title="Fixado">📌</span>}
              </div>

              <p className="mural-card-texto">{htmlParaTexto(aviso.corpo)}</p>

              <div className="mural-card-rodape">
                <span>{aviso.criado_por_nome || 'Equipe'} · {dataCurta(aviso.created_at)}</span>
                {naoLido && <span className="mural-badge">NOVO</span>}
              </div>
            </button>
          )
        })}
      </div>

      {aberto && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && fechar()}>
          <div className="modal-card mural-modal">
            <div className="modal-header" style={{ borderLeft: `4px solid ${corDoAviso(aberto.cor)}` }}>
              <h3 style={{ color: corDoAviso(aberto.cor) }}>{aberto.titulo}</h3>
              <span className="mural-modal-autor">
                {aberto.criado_por_nome || 'Equipe'} · {new Date(aberto.created_at).toLocaleDateString('pt-BR')}
              </span>
            </div>

            <div className="modal-body mural-modal-body">
              {aberto.imagem_url && (
                <img className="mural-modal-foto" src={aberto.imagem_url} alt="" />
              )}
              <div
                className="mural-conteudo"
                dangerouslySetInnerHTML={{ __html: sanitizarHtml(aberto.corpo) }}
              />
            </div>

            <div className="modal-footer">
              <button type="button" className="btn-confirm" onClick={fechar}>Entendi</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
