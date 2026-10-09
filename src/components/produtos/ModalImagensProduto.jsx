import { useState, useRef } from 'react'
import { uploadImagemProduto, deleteImagemProduto, atualizarImagensProduto } from '../../services/imagensService'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import './ModalImagensProduto.css'

export default function ModalImagensProduto({ produto, onClose, onUpdate }) {
  const { profile } = useAuth()
  const { showToast } = useApp()
  const tenantId = profile?.tenant_id

  const [imagens, setImagens] = useState(produto.imagens || [])
  const [uploading, setUploading] = useState(false)
  const [imagemGrande, setImagemGrande] = useState(null)
  const fileInputRef = useRef(null)

  const podeAdicionarMais = imagens.length < 3

  // Upload de arquivo
  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files)

    if (files.length === 0) return

    // Verifica quantas imagens pode adicionar
    const espacoDisponivel = 3 - imagens.length
    if (files.length > espacoDisponivel) {
      showToast(`Você pode adicionar no máximo ${espacoDisponivel} ${espacoDisponivel === 1 ? 'imagem' : 'imagens'}`, 'error')
      return
    }

    setUploading(true)

    try {
      const urlsNovas = []

      for (const file of files) {
        const url = await uploadImagemProduto(file, produto.id, tenantId)
        urlsNovas.push(url)
      }

      const novasImagens = [...imagens, ...urlsNovas]
      setImagens(novasImagens)

      // Salva no banco
      await atualizarImagensProduto(produto.id, novasImagens)

      showToast(`${urlsNovas.length} ${urlsNovas.length === 1 ? 'imagem adicionada' : 'imagens adicionadas'}!`, 'success')

      // Atualiza lista de produtos
      onUpdate?.()
    } catch (err) {
      showToast(err.message || 'Erro ao fazer upload', 'error')
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // Remove imagem
  const handleRemover = async (url, index) => {
    if (!confirm('Remover esta imagem?')) return

    setUploading(true)

    try {
      // Remove do storage
      await deleteImagemProduto(url)

      // Remove do array
      const novasImagens = imagens.filter((_, i) => i !== index)
      setImagens(novasImagens)

      // Salva no banco
      await atualizarImagensProduto(produto.id, novasImagens)

      showToast('Imagem removida!', 'success')

      // Atualiza lista de produtos
      onUpdate?.()
    } catch (err) {
      showToast('Erro ao remover imagem', 'error')
    } finally {
      setUploading(false)
    }
  }

  // Drag & Drop
  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()

    const files = Array.from(e.dataTransfer.files)
    const imageFiles = files.filter(f => f.type.startsWith('image/'))

    if (imageFiles.length === 0) {
      showToast('Nenhum arquivo de imagem detectado', 'error')
      return
    }

    // Simula seleção de arquivo
    const dataTransfer = new DataTransfer()
    imageFiles.forEach(file => dataTransfer.items.add(file))
    fileInputRef.current.files = dataTransfer.files
    handleFileChange({ target: fileInputRef.current })
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
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
                  {uploading ? '⏳ Enviando...' : '📷 Adicionar Imagens'}
                </button>

                <p className="upload-info">
                  Arraste imagens aqui ou clique para selecionar
                  <br />
                  <small>JPG, PNG ou WEBP • Máximo 5MB • {3 - imagens.length} {3 - imagens.length === 1 ? 'restante' : 'restantes'}</small>
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
