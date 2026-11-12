import { useState, useRef, useCallback, useEffect } from 'react'
import { uploadImagemProduto, deleteImagemProduto, atualizarImagensProduto } from '../../services/imagensService'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import './ModalImagensProduto.css'

const MAX_IMAGENS = 3

export default function ModalImagensProduto({ produto, onClose, onUpdate }) {
  const { profile } = useAuth()
  const { showToast } = useApp()
  const tenantId = profile?.tenant_id

  const [imagens, setImagens] = useState(produto.imagens || [])
  const [uploading, setUploading] = useState(false)
  const [imagemGrande, setImagemGrande] = useState(null)
  const fileInputRef = useRef(null)

  const restantes = MAX_IMAGENS - imagens.length
  const podeAdicionarMais = restantes > 0

  // Caminho único de envio: usado pelo botão, pelo arrastar e pelo colar
  const enviarArquivos = useCallback(async (files) => {
    if (uploading || files.length === 0) return

    const espacoDisponivel = MAX_IMAGENS - imagens.length
    if (espacoDisponivel === 0) {
      showToast(`Limite de ${MAX_IMAGENS} imagens atingido`, 'error')
      return
    }
    if (files.length > espacoDisponivel) {
      showToast(`Você pode adicionar no máximo ${espacoDisponivel} ${espacoDisponivel === 1 ? 'imagem' : 'imagens'}`, 'error')
      return
    }

    setUploading(true)

    try {
      const urlsNovas = []
      for (const file of files) {
        urlsNovas.push(await uploadImagemProduto(file, produto.id, tenantId))
      }

      const novasImagens = [...imagens, ...urlsNovas]
      setImagens(novasImagens)
      await atualizarImagensProduto(produto.id, novasImagens)

      showToast(`${urlsNovas.length} ${urlsNovas.length === 1 ? 'imagem adicionada' : 'imagens adicionadas'}!`, 'success')
      onUpdate?.()
    } catch (err) {
      showToast(err.message || 'Erro ao fazer upload', 'error')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [imagens, uploading, produto.id, tenantId, showToast, onUpdate])

  // Colar com Ctrl+V. O listener fica no documento porque o modal não
  // tem campo de texto onde o cursor pudesse estar
  useEffect(() => {
    const handlePaste = (e) => {
      const arquivos = Array.from(e.clipboardData?.items || [])
        .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
        .map(item => item.getAsFile())
        .filter(Boolean)

      if (arquivos.length === 0) return

      e.preventDefault()
      enviarArquivos(arquivos)
    }

    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [enviarArquivos])

  const handleFileChange = (e) => {
    enviarArquivos(Array.from(e.target.files))
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()

    const imageFiles = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    if (imageFiles.length === 0) {
      showToast('Nenhum arquivo de imagem detectado', 'error')
      return
    }
    enviarArquivos(imageFiles)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
  }

  // Remove imagem
  const handleRemover = async (url, index) => {
    if (!confirm('Remover esta imagem?')) return

    setUploading(true)

    try {
      await deleteImagemProduto(url)

      const novasImagens = imagens.filter((_, i) => i !== index)
      setImagens(novasImagens)
      await atualizarImagensProduto(produto.id, novasImagens)

      showToast('Imagem removida!', 'success')
      onUpdate?.()
    } catch (err) {
      showToast('Erro ao remover imagem', 'error')
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      {/* Modal de galeria */}
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-imagens" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2>📷 Imagens do Produto</h2>
            <button className="btn-close" onClick={onClose}>×</button>
          </div>

          <div className="modal-body">
            {/* Produto info */}
            <div className="produto-info">
              <strong>{produto.produto}</strong>
              {produto.modelo && <span> - {produto.modelo}</span>}
              {produto.codigo && <span className="codigo-badge">Cód: {produto.codigo}</span>}
            </div>

            {/* Galeria de imagens */}
            {imagens.length > 0 && (
              <div className="galeria-grid">
                {imagens.map((url, index) => (
                  <div key={index} className="imagem-card">
                    <img
                      src={url}
                      alt={`Imagem ${index + 1}`}
                      onClick={() => setImagemGrande(url)}
                    />
                    <button
                      className="btn-remover"
                      onClick={() => handleRemover(url, index)}
                      disabled={uploading}
                      title="Remover imagem"
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Área de upload */}
            {podeAdicionarMais && (
              <div
                className="upload-area"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={handleFileChange}
                  disabled={uploading}
                  style={{ display: 'none' }}
                />

                <button
                  className="btn-upload"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? 'Enviando...' : 'Adicionar Imagens'}
                </button>

                <p className="upload-info">
                  Arraste, cole com <kbd>Ctrl</kbd>+<kbd>V</kbd> ou clique para selecionar
                  <br />
                  <small>JPG, PNG ou WEBP • Máximo 5MB • {restantes} {restantes === 1 ? 'restante' : 'restantes'}</small>
                </p>
              </div>
            )}

            {imagens.length === 0 && (
              <div className="sem-imagens">
                <p>📷 Nenhuma imagem adicionada ainda</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de imagem grande (ao clicar na miniatura) */}
      {imagemGrande && (
        <div className="modal-overlay" onClick={() => setImagemGrande(null)}>
          <div className="modal-imagem-grande" onClick={e => e.stopPropagation()}>
            <button className="btn-close-grande" onClick={() => setImagemGrande(null)}>×</button>
            <img src={imagemGrande} alt="Imagem grande" />
          </div>
        </div>
      )}
    </>
  )
}
