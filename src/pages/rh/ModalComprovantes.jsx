import { useState, useEffect, useRef } from 'react'
import {
  fmtR, fmtData, ehPdf, LIMITE_COMPROVANTES, LABEL_TIPO,
  uploadComprovante, excluirComprovante, atualizarComprovantes, assinarComprovantes,
} from '../../services/rhService'
import { S, ModalConfirma, IconTrash } from './RhUI'

export default function ModalComprovantes({ lancamento, tenantId, showToast, onFechar, onAtualizar }) {
  // O registro guarda o caminho do arquivo; a exibição usa URL assinada
  const [arquivos, setArquivos] = useState(lancamento.comprovantes || [])
  const [urls,     setUrls]     = useState({})
  const [enviando, setEnviando] = useState(false)
  const [zoom,     setZoom]     = useState(null)
  const [confirm,  setConfirm]  = useState(null)   // { caminho, index }
  const [arrasta,  setArrasta]  = useState(false)
  const inputRef = useRef(null)

  const restantes = LIMITE_COMPROVANTES - arquivos.length
  const func = lancamento.funcionarios || {}

  // Assina os caminhos novos. O controle fica numa ref porque um caminho que
  // volte sem URL não pode disparar o efeito de novo em loop.
  const pedidos = useRef(new Set())
  useEffect(() => {
    const faltam = arquivos.filter(c => !pedidos.current.has(c))
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
  }, [arquivos, showToast])

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
        novos.push(await uploadComprovante(file, lancamento.id, tenantId))
      }
      const atualizado = [...arquivos, ...novos]
      await atualizarComprovantes(lancamento.id, atualizado)
      setArquivos(atualizado)
      showToast(novos.length === 1 ? 'Comprovante anexado!' : `${novos.length} comprovantes anexados!`, 'success')
      onAtualizar?.()
    } catch (e) {
      showToast(e.message || 'Erro ao anexar.', 'error')
    }
    setEnviando(false)
    if (inputRef.current) inputRef.current.value = ''
  }


  // Colar direto no modal: print do comprovante do banco vai para a área de
  // transferência, e salvar em arquivo só para anexar é passo perdido.
  // Sem lista de dependências de propósito: o efeito é refeito a cada
  // render para a função de envio enxergar os anexos atuais.
  useEffect(() => {
    function colar(e) {
      const itens = Array.from(e.clipboardData?.items || [])
      const arquivos = itens
        .filter(i => i.kind === 'file')
        .map(i => i.getAsFile())
        .filter(f => f && (f.type.startsWith('image/') || f.type === 'application/pdf'))
      if (!arquivos.length) return
      e.preventDefault()
      enviar(arquivos)
    }
    window.addEventListener('paste', colar)
    return () => window.removeEventListener('paste', colar)
  })

  async function remover() {
    const { caminho, index } = confirm
    setConfirm(null)
    setEnviando(true)
    try {
      const atualizado = arquivos.filter((_, i) => i !== index)
      await atualizarComprovantes(lancamento.id, atualizado)
      await excluirComprovante(caminho)
      setArquivos(atualizado)
      showToast('Comprovante removido.', 'success')
      onAtualizar?.()
    } catch (e) {
      showToast('Erro ao remover: ' + e.message, 'error')
    }
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
            <h3 style={{ margin:0, fontSize:16 }}>Comprovantes</h3>
            <button onClick={onFechar} style={{ background:'none', border:'none', color:'var(--muted)', fontSize:18, cursor:'pointer' }}>✕</button>
          </div>

          <div className="modal-body" style={{ padding:20, paddingBottom:20 }}>
            <div style={{ background:'var(--card-bg)', border:'1px solid var(--border-light)', borderRadius:8, padding:'10px 14px', marginBottom:14 }}>
              <div style={{ fontSize:14, fontWeight:600, color:'var(--text-header)' }}>
                {func.apelido || func.nome || 'Funcionário'}
              </div>
              <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>
                {LABEL_TIPO[lancamento.tipo] || lancamento.tipo}
                {lancamento.descricao ? ` — ${lancamento.descricao}` : ''}
                {' • '}{fmtR(lancamento.valor)}
                {lancamento.data_pagamento ? ` • pago ${fmtData(lancamento.data_pagamento)}` : ''}
              </div>
            </div>

            {arquivos.length > 0 && (
              <div className="rh-comp-grid">
                {arquivos.map((caminho, index) => {
                  const url = urls[caminho]
                  return (
                    <div key={caminho} className="rh-comp-item">
                      {ehPdf(caminho) ? (
                        <a href={url || '#'} target="_blank" rel="noreferrer" className="rh-comp-pdf"
                          onClick={e => { if (!url) e.preventDefault() }}>
                          <span className="rh-comp-pdf-ext">PDF</span>
                          <span className="rh-comp-pdf-txt">{url ? 'Abrir comprovante' : 'Carregando…'}</span>
                        </a>
                      ) : url ? (
                        <img src={url} alt={`Comprovante ${index + 1}`} onClick={() => setZoom(url)} />
                      ) : (
                        <div className="rh-comp-pdf"><span className="rh-comp-pdf-txt">Carregando…</span></div>
                      )}
                      <button className="rh-comp-del" disabled={enviando}
                        onClick={() => setConfirm({ caminho, index })} title="Remover">
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
                  {enviando ? 'Enviando…' : 'Anexar comprovante'}
                </button>
                <p style={{ color:'var(--muted)', fontSize:12, margin:'10px 0 0', textAlign:'center' }}>
                  Recibo do banco, recibo assinado, foto do PIX…<br />
                  Arraste aqui ou cole com Ctrl+V<br />
                  JPG, PNG, WEBP ou PDF • até 5MB • {restantes} {restantes === 1 ? 'vaga restante' : 'vagas restantes'}
                </p>
              </div>
            ) : (
              <p style={{ color:'var(--muted)', fontSize:12, textAlign:'center', marginTop:12 }}>
                Limite de {LIMITE_COMPROVANTES} comprovantes atingido. Remova um para anexar outro.
              </p>
            )}
          </div>
        </div>
      </div>

      {zoom && (
        <div className="modal-overlay" style={{ zIndex:10001 }} onClick={() => setZoom(null)}>
          <img src={zoom} alt="Comprovante"
            style={{ maxWidth:'92vw', maxHeight:'88vh', borderRadius:8, boxShadow:'var(--shadow-heavy)' }} />
        </div>
      )}

      {confirm && (
        <ModalConfirma
          titulo="Remover comprovante"
          texto="O arquivo será apagado definitivamente. Continuar?"
          onCancelar={() => setConfirm(null)}
          onConfirmar={remover}
          textoBotao="Remover"
        />
      )}
    </>
  )
}
