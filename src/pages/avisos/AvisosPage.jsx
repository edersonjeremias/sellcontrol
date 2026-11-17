import { useEffect, useMemo, useRef, useState } from 'react'
import AppShell from '../../components/ui/AppShell'
import ModalConfirmacao from '../../components/ui/ModalConfirmacao'
import EditorTexto from '../../components/avisos/EditorTexto'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import { getUsuarios } from '../../services/configService'
import { sanitizarHtml, htmlParaTexto, primeiraImagem } from '../../lib/htmlSeguro'
import '../../styles/avisos.css'
import {
  getAvisos,
  getLeiturasDoTenant,
  criarAviso,
  atualizarAviso,
  excluirAviso,
  uploadImagemAviso,
  corDoAviso,
  CORES_AVISO,
} from '../../services/avisosService'

const FORM_VAZIO = {
  titulo: '',
  corpo: '',
  imagem_url: '',
  cor: 'blue',
  fixado: false,
  abrir_automatico: false,
  ativo: true,
  inicio_em: '',
  fim_em: '',
}

function dataBr(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('pt-BR')
}

export default function AvisosPage() {
  const { profile } = useAuth()
  const { showToast } = useApp()
  const tenantId = profile?.tenant_id

  const [avisos, setAvisos] = useState([])
  const [leituras, setLeituras] = useState([])
  const [totalEquipe, setTotalEquipe] = useState(0)
  const [carregando, setCarregando] = useState(true)

  const [form, setForm] = useState(FORM_VAZIO)
  const [editando, setEditando] = useState(null)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [enviandoImagem, setEnviandoImagem] = useState(false)
  const [excluir, setExcluir] = useState(null)
  const [verLeitores, setVerLeitores] = useState(null)

  const capaRef = useRef(null)

  useEffect(() => { carregar() }, [tenantId])

  async function carregar() {
    if (!tenantId) return
    setCarregando(true)
    try {
      const [lista, lidos, usuarios] = await Promise.all([
        getAvisos(tenantId),
        getLeiturasDoTenant(tenantId),
        getUsuarios(tenantId).catch(() => []),
      ])
      setAvisos(lista)
      setLeituras(lidos)
      setTotalEquipe(usuarios.filter(u => u.ativo !== false).length)
    } catch (err) {
      showToast('Erro ao carregar avisos: ' + err.message, 'error')
    } finally {
      setCarregando(false)
    }
  }

  // Leituras agrupadas por aviso: a lista e pequena e evita uma query por card.
  const leitoresPorAviso = useMemo(() => {
    const mapa = {}
    for (const l of leituras) {
      if (!mapa[l.aviso_id]) mapa[l.aviso_id] = []
      mapa[l.aviso_id].push(l)
    }
    return mapa
  }, [leituras])

  function campo(nome, valor) {
    setForm(prev => ({ ...prev, [nome]: valor }))
  }

  function novoAviso() {
    setEditando(null)
    setForm(FORM_VAZIO)
    setMostrarForm(true)
  }

  function editarAviso(aviso) {
    setEditando(aviso)
    setForm({
      titulo: aviso.titulo || '',
      corpo: aviso.corpo || '',
      imagem_url: aviso.imagem_url || '',
      cor: aviso.cor || 'blue',
      fixado: !!aviso.fixado,
      abrir_automatico: !!aviso.abrir_automatico,
      ativo: aviso.ativo !== false,
      inicio_em: aviso.inicio_em || '',
      fim_em: aviso.fim_em || '',
    })
    setMostrarForm(true)
  }

  async function enviarImagemDoTexto(file) {
    setEnviandoImagem(true)
    try {
      return await uploadImagemAviso(file, tenantId)
    } catch (err) {
      showToast(err.message, 'error')
      return ''
    } finally {
      setEnviandoImagem(false)
    }
  }

  async function escolherCapa(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setEnviandoImagem(true)
    try {
      const url = await uploadImagemAviso(file, tenantId)
      campo('imagem_url', url)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setEnviandoImagem(false)
    }
  }

  async function salvar() {
    if (!form.titulo.trim()) {
      showToast('O aviso precisa de um título', 'error')
      return
    }
    if (!htmlParaTexto(form.corpo) && !form.imagem_url) {
      showToast('Escreva o texto do aviso ou anexe uma imagem', 'error')
      return
    }
    if (form.inicio_em && form.fim_em && form.fim_em < form.inicio_em) {
      showToast('A data final não pode ser antes da inicial', 'error')
      return
    }

    setSalvando(true)
    try {
      const dados = {
        titulo: form.titulo.trim(),
        corpo: sanitizarHtml(form.corpo),
        imagem_url: form.imagem_url || null,
        cor: form.cor,
        fixado: form.fixado,
        abrir_automatico: form.abrir_automatico,
        ativo: form.ativo,
        inicio_em: form.inicio_em || null,
        fim_em: form.fim_em || null,
      }

      if (editando) {
        await atualizarAviso(editando.id, dados)
        showToast('Aviso atualizado', 'success')
      } else {
        await criarAviso(tenantId, dados, profile)
        showToast('Aviso publicado para a equipe', 'success')
      }

      setMostrarForm(false)
      setEditando(null)
      setForm(FORM_VAZIO)
      carregar()
    } catch (err) {
      showToast('Erro ao salvar: ' + err.message, 'error')
    } finally {
      setSalvando(false)
    }
  }

  async function alternarAtivo(aviso) {
    try {
      await atualizarAviso(aviso.id, { ativo: !aviso.ativo })
      showToast(aviso.ativo ? 'Aviso tirado do mural' : 'Aviso de volta ao mural', 'success')
      carregar()
    } catch (err) {
      showToast('Erro: ' + err.message, 'error')
    }
  }

  async function confirmarExclusao() {
    const aviso = excluir
    setExcluir(null)
    try {
      await excluirAviso(aviso.id)
      showToast('Aviso excluído', 'success')
      carregar()
    } catch (err) {
      showToast('Erro ao excluir: ' + err.message, 'error')
    }
  }

  const leitoresDoAviso = verLeitores ? (leitoresPorAviso[verLeitores.id] || []) : []

  return (
    <AppShell title="Mural de Avisos">
      <div className="avisos-page">
        <div className="avisos-topo">
          <div>
            <h2>Mural de Avisos</h2>
            <p>O que você publicar aqui aparece na tela inicial de todo mundo da empresa.</p>
          </div>
          <button type="button" className="btn-acao btn-blue avisos-novo" onClick={novoAviso}>
            + Novo Aviso
          </button>
        </div>

        {carregando ? (
          <div className="avisos-vazio">Carregando...</div>
        ) : avisos.length === 0 ? (
          <div className="avisos-vazio">
            <div style={{ fontSize: 40, marginBottom: 12 }}>📢</div>
            <p>Nenhum aviso publicado ainda</p>
            <button type="button" className="btn-acao btn-blue" style={{ marginTop: 14 }} onClick={novoAviso}>
              + Criar o primeiro aviso
            </button>
          </div>
        ) : (
          <div className="avisos-lista">
            {avisos.map(aviso => {
              const leram = (leitoresPorAviso[aviso.id] || []).length
              // Mesma regra do mural: sem capa, mostra a primeira foto do texto.
              const foto = aviso.imagem_url || primeiraImagem(aviso.corpo)
              return (
                <div
                  key={aviso.id}
                  className={`avisos-item${aviso.ativo ? '' : ' inativo'}`}
                  style={{ borderLeftColor: corDoAviso(aviso.cor) }}
                >
                  {foto && (
                    <img className="avisos-item-thumb" src={foto} alt="" loading="lazy" />
                  )}

                  <div className="avisos-item-corpo">
                    <div className="avisos-item-titulo" style={{ color: corDoAviso(aviso.cor) }}>
                      {aviso.fixado && <span title="Fixado">📌 </span>}
                      {aviso.titulo}
                    </div>
                    <div className="avisos-item-texto">{htmlParaTexto(aviso.corpo)}</div>
                    <div className="avisos-item-meta">
                      <span>{aviso.criado_por_nome || 'Equipe'} · {dataBr(aviso.created_at)}</span>
                      {(aviso.inicio_em || aviso.fim_em) && (
                        <span>
                          Exibir {aviso.inicio_em ? `de ${dataBr(aviso.inicio_em)}` : ''}
                          {aviso.fim_em ? ` até ${dataBr(aviso.fim_em)}` : ''}
                        </span>
                      )}
                      {aviso.abrir_automatico && <span className="avisos-tag">Abre sozinho</span>}
                      {!aviso.ativo && <span className="avisos-tag off">Fora do mural</span>}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="avisos-leram"
                    onClick={() => setVerLeitores(aviso)}
                    title="Ver quem leu"
                  >
                    <strong>{leram}</strong>
                    <span>de {totalEquipe || leram} leram</span>
                  </button>

                  <div className="avisos-item-acoes">
                    <button type="button" className="btn-acao btn-dark" onClick={() => editarAviso(aviso)}>Editar</button>
                    <button
                      type="button"
                      className="btn-acao btn-ghost"
                      onClick={() => alternarAtivo(aviso)}
                    >
                      {aviso.ativo ? 'Tirar do mural' : 'Publicar'}
                    </button>
                    <button type="button" className="btn-acao avisos-excluir" onClick={() => setExcluir(aviso)}>
                      Excluir
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Formulário ─────────────────────────────────────────────── */}
      {mostrarForm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setMostrarForm(false)}>
          <div className="modal-card avisos-form-card">
            <div className="modal-header">
              <h3>{editando ? 'Editar aviso' : 'Novo aviso'}</h3>
            </div>

            <div className="modal-body avisos-form-body">
              <label className="avisos-label">Título</label>
              <input
                className="avisos-input"
                value={form.titulo}
                onChange={e => campo('titulo', e.target.value)}
                placeholder="Ex: Mudança no horário da live de sexta"
                maxLength={120}
              />

              <label className="avisos-label">Texto do aviso</label>
              <EditorTexto
                docKey={editando?.id || 'novo'}
                valor={form.corpo}
                onChange={html => campo('corpo', html)}
                onEnviarImagem={enviarImagemDoTexto}
                enviando={enviandoImagem}
              />

              <label className="avisos-label">Imagem de capa (aparece no card)</label>
              {form.imagem_url ? (
                <div className="avisos-capa">
                  <img src={form.imagem_url} alt="" />
                  <button type="button" className="btn-acao btn-dark" onClick={() => campo('imagem_url', '')}>
                    Remover capa
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn-acao btn-ghost avisos-capa-btn"
                  onClick={() => capaRef.current?.click()}
                  disabled={enviandoImagem}
                >
                  {enviandoImagem ? 'Enviando...' : 'Escolher imagem'}
                </button>
              )}
              <input
                ref={capaRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={{ display: 'none' }}
                onChange={escolherCapa}
              />

              <label className="avisos-label">Cor do aviso</label>
              <div className="avisos-cores">
                {CORES_AVISO.map(c => (
                  <button
                    key={c.valor}
                    type="button"
                    className={`avisos-cor${form.cor === c.valor ? ' ativa' : ''}`}
                    style={{ background: c.css }}
                    title={c.label}
                    onClick={() => campo('cor', c.valor)}
                  />
                ))}
              </div>

              <div className="avisos-datas">
                <div>
                  <label className="avisos-label">Começa a aparecer em</label>
                  <input
                    type="date"
                    className="avisos-input"
                    value={form.inicio_em}
                    onChange={e => campo('inicio_em', e.target.value)}
                  />
                </div>
                <div>
                  <label className="avisos-label">Sai do mural em</label>
                  <input
                    type="date"
                    className="avisos-input"
                    value={form.fim_em}
                    onChange={e => campo('fim_em', e.target.value)}
                  />
                </div>
              </div>

              <label className="avisos-check">
                <input type="checkbox" checked={form.fixado} onChange={e => campo('fixado', e.target.checked)} />
                <span>Fixar na frente dos outros avisos</span>
              </label>

              <label className="avisos-check">
                <input
                  type="checkbox"
                  checked={form.abrir_automatico}
                  onChange={e => campo('abrir_automatico', e.target.checked)}
                />
                <span>Abrir sozinho para quem ainda não leu</span>
              </label>

              <label className="avisos-check">
                <input type="checkbox" checked={form.ativo} onChange={e => campo('ativo', e.target.checked)} />
                <span>Publicar no mural agora</span>
              </label>

              {/* Prévia: o card do dashboard é estreito e o texto formatado
                  muda de cara lá dentro — melhor ver antes de publicar. */}
              <label className="avisos-label">Como vai aparecer</label>
              <div className="avisos-previa" style={{ borderLeftColor: corDoAviso(form.cor) }}>
                {form.imagem_url && <img src={form.imagem_url} alt="" />}
                <strong style={{ color: corDoAviso(form.cor) }}>{form.titulo || 'Título do aviso'}</strong>
                <div
                  className="mural-conteudo"
                  dangerouslySetInnerHTML={{ __html: sanitizarHtml(form.corpo) }}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn-confirm" onClick={salvar} disabled={salvando}>
                {salvando ? 'Salvando...' : editando ? 'Salvar alterações' : 'Publicar aviso'}
              </button>
              <button type="button" className="btn-cancel" onClick={() => setMostrarForm(false)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Quem leu ───────────────────────────────────────────────── */}
      {verLeitores && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setVerLeitores(null)}>
          <div className="modal-card">
            <div className="modal-header"><h3>Quem leu: {verLeitores.titulo}</h3></div>
            <div className="modal-body">
              {leitoresDoAviso.length === 0 ? (
                <p style={{ color: 'var(--muted)' }}>Ninguém abriu este aviso ainda.</p>
              ) : (
                <ul className="avisos-leitores">
                  {leitoresDoAviso.map(l => (
                    <li key={l.user_id}>
                      <span>{l.usuario_nome || 'Usuário'}</span>
                      <span>{new Date(l.lido_em).toLocaleString('pt-BR')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-cancel" onClick={() => setVerLeitores(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {excluir && (
        <ModalConfirmacao
          titulo="Excluir aviso"
          mensagem={`Excluir <b>${excluir.titulo}</b>? O registro de quem leu vai junto.`}
          onSim={confirmarExclusao}
          onNao={() => setExcluir(null)}
        />
      )}
    </AppShell>
  )
}
