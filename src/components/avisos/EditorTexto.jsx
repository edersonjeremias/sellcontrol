import { useEffect, useRef, useState } from 'react'
import { CORES_AVISO } from '../../services/avisosService'

// Editor do corpo do aviso: contentEditable + execCommand.
//
// O conteúdo NÃO é controlado pelo React. Reescrever o innerHTML a cada
// digitação jogaria o cursor para o começo do texto a cada letra; por isso o
// HTML só é injetado quando muda o aviso em edição (docKey).

const TAMANHOS = [
  { label: 'Pequeno', valor: '2' },
  { label: 'Normal',  valor: '3' },
  { label: 'Grande',  valor: '5' },
  { label: 'Enorme',  valor: '7' },
]

// Fora do componente de propósito: declarado dentro, o React remontaria todos
// os botões da barra a cada tecla digitada no texto.
function BotaoBarra({ titulo, aoClicar, aoSegurar, children }) {
  return (
    <button
      type="button"
      title={titulo}
      className="editor-btn"
      onMouseDown={e => { e.preventDefault(); aoSegurar() }}
      onClick={aoClicar}
    >
      {children}
    </button>
  )
}

export default function EditorTexto({ valor, onChange, onEnviarImagem, docKey = 'novo', enviando = false }) {
  const areaRef = useRef(null)
  const arquivoRef = useRef(null)
  const selecaoRef = useRef(null)
  const [mostrarLink, setMostrarLink] = useState(false)
  const [urlLink, setUrlLink] = useState('')

  // Injeta o HTML só na troca de aviso — ver comentário do topo.
  useEffect(() => {
    if (areaRef.current) areaRef.current.innerHTML = valor || ''
  }, [docKey])

  function avisarMudanca() {
    onChange(areaRef.current?.innerHTML || '')
  }

  // A seleção se perde quando o foco vai para um botão da barra ou para o
  // seletor de arquivo. Guardar o range permite devolver o cursor ao lugar.
  function guardarSelecao() {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0 && areaRef.current?.contains(sel.anchorNode)) {
      selecaoRef.current = sel.getRangeAt(0).cloneRange()
    }
  }

  function restaurarSelecao() {
    areaRef.current?.focus()
    const range = selecaoRef.current
    if (!range) return
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
  }

  function comando(cmd, argumento = null) {
    restaurarSelecao()
    document.execCommand(cmd, false, argumento)
    avisarMudanca()
  }

  // Lê a cor direto da variável do tema, para o texto do aviso usar
  // exatamente o mesmo verde/azul do resto do sistema.
  function corDoTema(nome, reserva) {
    const valor = getComputedStyle(document.documentElement).getPropertyValue(`--${nome}`).trim()
    return valor || reserva
  }

  function aplicarLink() {
    const url = urlLink.trim()
    setMostrarLink(false)
    setUrlLink('')
    if (!url) return
    const completa = /^https?:\/\//i.test(url) ? url : `https://${url}`
    comando('createLink', completa)
  }

  async function escolherImagem(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const url = await onEnviarImagem(file)
    if (!url) return

    restaurarSelecao()
    document.execCommand('insertImage', false, url)

    // execCommand insere <img> sem limite de largura: uma foto de celular
    // estoura o card inteiro. O estilo entra logo depois da inserção.
    areaRef.current?.querySelectorAll('img:not([style])').forEach(img => {
      img.setAttribute('style', 'max-width: 100%')
    })
    avisarMudanca()
  }

  return (
    <div className="editor-wrap">
      <div className="editor-barra">
        <BotaoBarra titulo="Negrito"    aoSegurar={guardarSelecao} aoClicar={() => comando('bold')}><b>N</b></BotaoBarra>
        <BotaoBarra titulo="Itálico"    aoSegurar={guardarSelecao} aoClicar={() => comando('italic')}><i>I</i></BotaoBarra>
        <BotaoBarra titulo="Sublinhado" aoSegurar={guardarSelecao} aoClicar={() => comando('underline')}><u>S</u></BotaoBarra>

        <span className="editor-sep" />

        <select
          className="editor-select"
          defaultValue=""
          onMouseDown={guardarSelecao}
          onChange={e => { comando('fontSize', e.target.value); e.target.value = '' }}
        >
          <option value="" disabled>Tamanho</option>
          {TAMANHOS.map(t => <option key={t.valor} value={t.valor}>{t.label}</option>)}
        </select>

        <span className="editor-sep" />

        <span className="editor-cores">
          {CORES_AVISO.map(c => (
            <button
              key={c.valor}
              type="button"
              title={`Texto ${c.label.toLowerCase()}`}
              className="editor-cor"
              style={{ background: c.css }}
              onMouseDown={e => { e.preventDefault(); guardarSelecao() }}
              onClick={() => comando('foreColor', corDoTema(c.valor, '#8ab4f8'))}
            />
          ))}
          <button
            type="button"
            title="Texto branco"
            className="editor-cor"
            style={{ background: '#e8eaed' }}
            onMouseDown={e => { e.preventDefault(); guardarSelecao() }}
            onClick={() => comando('foreColor', '#e8eaed')}
          />
        </span>

        <span className="editor-sep" />

        <BotaoBarra titulo="Lista com marcadores" aoSegurar={guardarSelecao} aoClicar={() => comando('insertUnorderedList')}>• Lista</BotaoBarra>
        <BotaoBarra titulo="Lista numerada"       aoSegurar={guardarSelecao} aoClicar={() => comando('insertOrderedList')}>1. Lista</BotaoBarra>

        <span className="editor-sep" />

        <BotaoBarra titulo="Alinhar à esquerda" aoSegurar={guardarSelecao} aoClicar={() => comando('justifyLeft')}>⬅</BotaoBarra>
        <BotaoBarra titulo="Centralizar"        aoSegurar={guardarSelecao} aoClicar={() => comando('justifyCenter')}>↔</BotaoBarra>
        <BotaoBarra titulo="Alinhar à direita"  aoSegurar={guardarSelecao} aoClicar={() => comando('justifyRight')}>➡</BotaoBarra>

        <span className="editor-sep" />

        <BotaoBarra titulo="Inserir link" aoSegurar={guardarSelecao} aoClicar={() => setMostrarLink(v => !v)}>Link</BotaoBarra>
        <BotaoBarra titulo="Inserir imagem no meio do texto" aoSegurar={guardarSelecao} aoClicar={() => arquivoRef.current?.click()}>
          {enviando ? 'Enviando...' : 'Imagem'}
        </BotaoBarra>
        <BotaoBarra titulo="Limpar formatação" aoSegurar={guardarSelecao} aoClicar={() => comando('removeFormat')}>Limpar</BotaoBarra>
      </div>

      {mostrarLink && (
        <div className="editor-link-bar">
          <input
            autoFocus
            value={urlLink}
            onChange={e => setUrlLink(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); aplicarLink() } }}
            placeholder="Cole o endereço e tecle Enter (ex: sellcontrol.app)"
          />
          <button type="button" className="btn-acao btn-blue" onClick={aplicarLink}>Aplicar</button>
        </div>
      )}

      <div
        ref={areaRef}
        className="editor-area"
        contentEditable
        suppressContentEditableWarning
        onInput={avisarMudanca}
        onBlur={() => { guardarSelecao(); avisarMudanca() }}
        onKeyUp={guardarSelecao}
        onMouseUp={guardarSelecao}
      />

      <input
        ref={arquivoRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={escolherImagem}
      />
    </div>
  )
}
