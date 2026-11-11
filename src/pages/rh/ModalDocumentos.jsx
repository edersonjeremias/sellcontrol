import { useState, useEffect, useRef } from 'react'
import {
  fmtData, ehPdf, LIMITE_DOCUMENTOS,
  uploadDocumentoFuncionario, excluirComprovante, atualizarDocumentos, assinarComprovantes,
} from '../../services/rhService'
import { S, ModalConfirma, IconTrash, IconEdit } from './RhUI'

/**
 * Papéis do funcionário: contrato assinado, RG, CPF, exame admissional.
 * Mesmo bucket privado dos comprovantes de pagamento — documento de
 * funcionário não pode ficar em URL pública, e aqui a tela abre por link
 * temporário que expira em uma hora.
 */
export default function ModalDocumentos({ funcionario, tenantId, showToast, onFechar, onAtualizar }) {
  const [docs,     setDocs]     = useState(() => funcionario.documentos || [])
  const [urls,     setUrls]     = useState({})
  const [enviando, setEnviando] = useState(false)
  const [zoom,     setZoom]     = useState(null)
  const [confirm,  setConfirm]  = useState(null)   // { doc, index }
  const [renome,   setRenome]   = useState(null)   // { index, nome }
  const [arrasta,  setArrasta]  = useState(false)
  const inputRef = useRef(null)

  const restantes = LIMITE_DOCUMENTOS - docs.length

  // Mesma guarda do modal de comprovantes: um caminho que volte sem URL não
  // pode disparar o efeito de novo em laço.
  const pedidos = useRef(new Set())
  useEffect(() => {
    const faltam = docs.map(d => d.caminho).filter(c => c && !pedidos.current.has(c))
    if (!faltam.length) return
    faltam.forEach(c => pedidos.current.add(c))

    let ativo = true
    assinarComprovantes(faltam)
      .then(mapa => { if (ativo) setUrls(prev => ({ ...prev, ...mapa })) })
      .catch(e => {
        faltam.forEach(c => pedidos.current.delete(c))
        showToast(e.message, 'error')
      })
    return () => { ativo = false }
  }, [docs, showToast])

  async function gravar(lista, msg) {
    await atualizarDocumentos(funcionario.id, lista)
    setDocs(lista)
    if (msg) showToast(msg, 'success')
    onAtualizar?.()
  }

  async function enviar(files) {
    const lista = Array.from(files)
    if (!lista.length) return
    if (lista.length > restantes) {
      showToast(`Você pode anexar no máximo ${restantes} ${restantes === 1 ? 'arquivo' : 'arquivos'}.`, 'error')
      return
    }

    setEnviando(true)
    try {
      const novos = []
      for (const file of lista) {
        novos.push(await uploadDocumentoFuncionario(file, funcionario.id, tenantId))
      }
      await gravar([...docs, ...novos],
        novos.length === 1 ? 'Documento anexado!' : `${novos.length} documentos anexados!`)
    } catch (e) {
      showToast(e.message || 'Erro ao anexar.', 'error')
    }
    setEnviando(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function remover() {
    const { doc, index } = confirm
    setConfirm(null)
    setEnviando(true)
    try {
      await gravar(docs.filter((_, i) => i !== index), 'Documento removido.')
      await excluirComprovante(doc.caminho)
    } catch (e) {
      showToast('Erro ao remover: ' + e.message, 'error')
    }
    setEnviando(false)
  }

  async function salvarNome() {
    const nome = renome.nome.trim()
    if (!nome) return showToast('Informe um nome para o documento.', 'error')
    setEnviando(true)
    try {
      await gravar(docs.map((d, i) => i === renome.index ? { ...d, nome } : d), 'Nome atualizado.')
      setRenome(null)
    } catch (e) { showToast('Erro: ' + e.message, 'error') }
    setEnviando(false)
  }

  function soltar(e) {
    e.preventDefault()
    setArrasta(false)
    const aceitos = Array.from(e.dataTransfer.files)
      .filter(f => f.type.startsWith('image/') || f.type === 'application/pdf')
    if (!aceitos.length) return showToast('Arraste imagens ou PDF.', 'error')
    enviar(aceitos)
  }

  return (
    <>
      <div className="modal-overlay" onClick={onFechar}>
        <div className="modal-card" style={{ maxWidth:560 }} onClick={e => e.stopPropagation()}>
          <div className="modal-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <h3 style={{ margin:0, fontSize:16 }}>Documentos</h3>
            <button onClick={onFechar} style={{ background:'none', border:'none', color:'var(--muted)', fontSize:18, cursor:'pointer' }}>✕</button>
          </div>

          <div className="modal-body" style={{ padding:20, paddingBottom:20 }}>
            <div style={{ background:'var(--card-bg)', border:'1px solid var(--border-light)', borderRadius:8, padding:'10px 14px', marginBottom:14 }}>
              <div style={{ fontSize:14, fontWeight:600, color:'var(--text-header)' }}>
                {funcionario.apelido || funcionario.nome}
              </div>
              <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>
                {[funcionario.cargo, funcionario.tipo_contrato].filter(Boolean).join(' • ') || 'Sem cargo informado'}
              </div>
            </div>

            {docs.length > 0 && (
              <div className="rh-doc-lista">
                {docs.map((doc, index) => {
                  const url = urls[doc.caminho]
                  const pdf = ehPdf(doc.caminho)
                  return (
                    <div key={doc.caminho} className="rh-doc-item">
                      <div className={`rh-doc-tag${pdf ? '' : ' img'}`}
                        onClick={() => { if (!url) return; pdf ? window.open(url, '_blank') : setZoom(url) }}>
                        {pdf ? 'PDF' : 'IMG'}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <a
                          href={url || '#'} target="_blank" rel="noreferrer"
                          onClick={e => { if (!url) e.preventDefault(); else if (!pdf) { e.preventDefault(); setZoom(url) } }}
                          className="rh-doc-nome"
                        >
                          {doc.nome || 'Documento'}
                        </a>
                        <div className="rh-doc-sub">
                          {url ? 'Toque para abrir' : 'Carregando…'}
                          {doc.enviado_em && ` • anexado ${fmtData(String(doc.enviado_em).slice(0, 10))}`}
                        </div>
                      </div>
                      <button className="btn-action-sm copy" disabled={enviando}
                        onClick={() => setRenome({ index, nome: doc.nome || '' })} title="Renomear">
                        <IconEdit />
                      </button>
                      <button className="btn-action-sm del" disabled={enviando}
                        onClick={() => setConfirm({ doc, index })} title="Remover">
                        <IconTrash />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {restantes > 0 ? (
              <div
                className={`rh-comp-upload${arrasta ? ' arrasta' : ''}`}
                onDrop={soltar}
                onDragOver={e => { e.preventDefault(); setArrasta(true) }}
                onDragLeave={() => setArrasta(false)}
              >
                <input ref={inputRef} type="file" multiple
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={e => enviar(e.target.files)} disabled={enviando}
                  style={{ display:'none' }} />
                <button onClick={() => inputRef.current?.click()} disabled={enviando}
                  style={{ ...S.btn, padding:'9px 16px' }}>
                  {enviando ? 'Enviando…' : 'Anexar documento'}
                </button>
                <p style={{ color:'var(--muted)', fontSize:12, margin:'10px 0 0', textAlign:'center' }}>
                  Contrato assinado, RG, CPF, exame admissional…<br />
                  JPG, PNG, WEBP ou PDF • até 10MB • {restantes} {restantes === 1 ? 'vaga restante' : 'vagas restantes'}
                </p>
              </div>
            ) : (
              <p style={{ color:'var(--muted)', fontSize:12, textAlign:'center', marginTop:12 }}>
                Limite de {LIMITE_DOCUMENTOS} documentos atingido. Remova um para anexar outro.
              </p>
            )}
          </div>
        </div>
      </div>

      {zoom && (
        <div className="modal-overlay" style={{ zIndex:10001 }} onClick={() => setZoom(null)}>
          <img src={zoom} alt="Documento"
            style={{ maxWidth:'92vw', maxHeight:'88vh', borderRadius:8, boxShadow:'var(--shadow-heavy)' }} />
        </div>
      )}

      {renome && (
        <div className="modal-overlay" style={{ zIndex:10001 }} onClick={() => setRenome(null)}>
          <div className="modal-card mini" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3 style={{ fontSize:16 }}>Nome do documento</h3></div>
            <div className="modal-body" style={{ padding:20 }}>
              <input
                value={renome.nome}
                onChange={e => setRenome(p => ({ ...p, nome: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && salvarNome()}
                style={S.inp}
                placeholder="Ex: Contrato de trabalho assinado"
                autoFocus
              />
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setRenome(null)}>Cancelar</button>
              <button className="btn-confirm" onClick={salvarNome} disabled={enviando}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {confirm && (
        <ModalConfirma
          titulo="Remover documento"
          texto={`"${confirm.doc.nome || 'Documento'}" será apagado definitivamente. Continuar?`}
          onCancelar={() => setConfirm(null)}
          onConfirmar={remover}
          textoBotao="Remover"
        />
      )}
    </>
  )
}
