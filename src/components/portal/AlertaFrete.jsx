import { useState, useRef } from 'react'
import { usePortalToast } from './PortalToast'
import { uploadComprovante, salvarComprovante } from '../../services/portalService'

export default function AlertaFrete({ producao, instagram, onAtualizar }) {
  const [uploading, setUploading] = useState(false)
  const toast = usePortalToast()
  const ref = useRef()

  if (!producao?.msg_frete_cobranca) return null

  if (producao.status_entrega === 'Conferir pg' || producao.link_comprovante_frete) {
    return (
      <div className="portal-alerta-frete"
        style={{ borderColor:'rgba(129,201,149,.35)', background:'rgba(129,201,149,.06)' }}>
        <div style={{ color:'var(--p-green)', fontWeight:700, fontSize:14 }}>
          ✅ Comprovante recebido! Aguardando conferência.
        </div>
      </div>
    )
  }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadComprovante(instagram, file)
      await salvarComprovante(producao.id, url)
      toast('Comprovante enviado com sucesso!', 'success')
      onAtualizar?.()
    } catch {
      toast('Erro ao enviar o comprovante. Tente novamente.', 'error')
    } finally {
      setUploading(false)
      if (ref.current) ref.current.value = ''
    }
  }

  return (
    <div className="portal-alerta-frete">
      <div style={{ fontSize:13, fontWeight:700, color:'var(--p-blue)' }}>
        📦 Informação de Frete
      </div>
      <div style={{ fontSize:14, color:'var(--p-text)', lineHeight:1.5 }}>
        {producao.msg_frete_cobranca}
      </div>
      <div className="portal-upload-area"
        onClick={() => !uploading && ref.current?.click()}>
        <input
          ref={ref}
          type="file"
          accept="image/*,.pdf"
          onChange={handleFile}
          onClick={e => e.stopPropagation()}
          style={{ display:'none' }}
        />
        {uploading ? (
          <span style={{ color:'var(--p-muted)', fontSize:13 }}>⏳ Enviando...</span>
        ) : (
          <>
            <div style={{ fontSize:22, marginBottom:6 }}>📎</div>
            <div style={{ color:'var(--p-blue)', fontSize:13, fontWeight:600 }}>
              Clique para enviar o comprovante do frete
            </div>
            <div style={{ color:'var(--p-muted)', fontSize:11, marginTop:3 }}>
              Imagem ou PDF
            </div>
          </>
        )}
      </div>
    </div>
  )
}
