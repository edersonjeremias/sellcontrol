import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useApp } from '../../context/AppContext'

export default function ModalFornecedor({ onClose, onSave, fornecedorEdit = null }) {
  const { toast } = useApp()

  const [nome, setNome] = useState(fornecedorEdit?.nome || '')
  const [endereco, setEndereco] = useState(fornecedorEdit?.endereco || '')
  const [whatsapp, setWhatsapp] = useState(fornecedorEdit?.whatsapp || '')
  const [saving, setSaving] = useState(false)

  async function handleSave(e) {
    e.preventDefault()

    if (!nome.trim()) {
      toast?.error('Informe o nome do fornecedor')
      return
    }

    setSaving(true)
    try {
      if (fornecedorEdit) {
        // Atualizar
        const { error } = await supabase
          .from('fornecedores')
          .update({
            nome: nome.trim(),
            endereco: endereco.trim() || null,
            whatsapp: whatsapp.trim() || null
          })
          .eq('id', fornecedorEdit.id)

        if (error) throw error
        toast?.success('Fornecedor atualizado!')
      } else {
        // Inserir
        const { error } = await supabase
          .from('fornecedores')
          .insert({
            nome: nome.trim(),
            endereco: endereco.trim() || null,
            whatsapp: whatsapp.trim() || null
          })

        if (error) throw error
        toast?.success('Fornecedor cadastrado!')
      }

      onSave?.()
    } catch (error) {
      console.error('Erro ao salvar fornecedor:', error)
      toast?.error('Erro ao salvar fornecedor')
    } finally {
      setSaving(false)
    }
  }

  function formatWhatsApp(value) {
    // Remove tudo que não é número
    const numbers = value.replace(/\D/g, '')

    // Formata (99) 99999-9999
    if (numbers.length <= 2) {
      return numbers
    } else if (numbers.length <= 7) {
      return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`
    } else if (numbers.length <= 11) {
      return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7)}`
    }
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7, 11)}`
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-fornecedor" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{fornecedorEdit ? 'Editar Fornecedor' : 'Novo Fornecedor'}</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSave}>
          <div className="form-group">
            <label>Nome *</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome do fornecedor"
              autoFocus
              required
            />
          </div>

          <div className="form-group">
            <label>Endereço</label>
            <textarea
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
              placeholder="Endereço completo (opcional)"
              rows={3}
            />
          </div>

          <div className="form-group">
            <label>WhatsApp</label>
            <input
              type="tel"
              value={whatsapp}
              onChange={(e) => setWhatsapp(formatWhatsApp(e.target.value))}
              placeholder="(99) 99999-9999"
            />
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-cancelar" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn-salvar" disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: flex-end;
          justify-content: center;
          z-index: 9999;
          padding: 0;
          animation: fadeIn 0.2s;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }

        .modal-fornecedor {
          background: var(--card-bg);
          width: 100%;
          max-width: 500px;
          border-radius: 20px 20px 0 0;
          box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.3);
          animation: slideUp 0.3s ease-out;
          max-height: 90vh;
          overflow-y: auto;
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 20px 16px 20px;
          border-bottom: 1px solid var(--border);
        }

        .modal-header h2 {
          margin: 0;
          font-size: 20px;
          color: var(--text-primary);
          font-weight: 700;
        }

        .btn-close {
          width: 32px;
          height: 32px;
          border: none;
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
          border-radius: 8px;
          font-size: 24px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          line-height: 1;
        }

        .btn-close:active {
          background: rgba(239, 68, 68, 0.2);
        }

        .modal-fornecedor form {
          padding: 20px;
        }

        .form-group {
          margin-bottom: 20px;
        }

        .form-group label {
          display: block;
          margin-bottom: 8px;
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .form-group input,
        .form-group textarea {
          width: 100%;
          padding: 12px;
          border: 1px solid var(--border);
          border-radius: 8px;
          font-size: 16px;
          background: var(--input-bg);
          color: var(--text-primary);
          font-family: inherit;
        }

        .form-group textarea {
          resize: vertical;
          min-height: 80px;
        }

        .form-group input:focus,
        .form-group textarea:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .modal-footer {
          display: flex;
          gap: 12px;
          padding-top: 20px;
          border-top: 1px solid var(--border);
        }

        .btn-cancelar,
        .btn-salvar {
          flex: 1;
          padding: 14px;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-cancelar {
          background: rgba(128, 128, 128, 0.1);
          color: var(--text-primary);
        }

        .btn-cancelar:active {
          background: rgba(128, 128, 128, 0.15);
        }

        .btn-salvar {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
        }

        .btn-salvar:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-salvar:active:not(:disabled) {
          transform: scale(0.98);
        }

        @media (min-width: 768px) {
          .modal-overlay {
            align-items: center;
          }

          .modal-fornecedor {
            border-radius: 16px;
            max-height: 80vh;
          }
        }
      `}</style>
    </div>
  )
}
