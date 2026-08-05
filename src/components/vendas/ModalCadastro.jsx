import { useState, useEffect, useRef, useCallback } from 'react'

// ✅ Função para capitalizar primeira letra
function capitalizar(texto) {
  if (!texto) return texto
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

export default function ModalCadastro({ onSalvar, onAtualizar, onExcluir, onFechar, listas = {} }) {
  const [tipo, setTipo] = useState('cliente')
  const [valor, setValor] = useState('')
  const [celular, setCelular] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [searchVal, setSearchVal] = useState('')
  const [showDrop, setShowDrop] = useState(false)
  const [itemSelecionado, setItemSelecionado] = useState(null)
  const [activeIdx, setActiveIdx] = useState(-1)
  const [showConfirmacao, setShowConfirmacao] = useState(false)

  const searchRef = useRef(null)

  const isCliente = tipo === 'cliente'
  const deveCapitalizar = ['produto', 'modelo', 'cor', 'marca'].includes(tipo)
  const estaEditando = !!itemSelecionado

  // Lista de itens do tipo selecionado
  const itensDisponiveis = (() => {
    if (tipo === 'cliente') return listas.clientes || []
    if (tipo === 'produto') return listas.produtos || []
    if (tipo === 'modelo') return listas.modelos || []
    if (tipo === 'cor') return listas.cores || []
    if (tipo === 'marca') return listas.marcas || []
    return []
  })()

  // Filtra itens baseado na busca
  const itensFiltrados = searchVal.trim()
    ? isCliente
      ? itensDisponiveis.filter(c =>
          c.instagram.toLowerCase().includes(searchVal.toLowerCase())
        )
      : itensDisponiveis.filter(item =>
          item.toLowerCase().includes(searchVal.toLowerCase())
        )
    : []

  // Limpa ao trocar tipo
  useEffect(() => {
    resetForm()
  }, [tipo])

  const resetForm = useCallback(() => {
    setItemSelecionado(null)
    setValor('')
    setCelular('')
    setSearchVal('')
    setShowDrop(false)
    setActiveIdx(-1)
    setTimeout(() => searchRef.current?.focus(), 50)
  }, [])

  const selecionarItem = useCallback((item) => {
    if (isCliente) {
      setItemSelecionado(item.instagram)
      setValor(item.instagram)
      setCelular(item.whatsapp || '')
      setSearchVal(item.instagram)
    } else {
      setItemSelecionado(item)
      setValor(item)
      setSearchVal(item)
    }
    setShowDrop(false)
    setActiveIdx(-1)
  }, [isCliente])

  async function salvar() {
    const valorLimpo = valor.trim()
    const celularLimpo = celular.trim()

    if (!valorLimpo) return
    if (isCliente && !celularLimpo) return

    setSalvando(true)
    try {
      if (estaEditando) {
        await onAtualizar?.(tipo, itemSelecionado, valorLimpo, celularLimpo)
      } else {
        await onSalvar?.(tipo, valorLimpo, celularLimpo)
      }
      resetForm()
    } finally {
      setSalvando(false)
    }
  }

  function handleValorChange(e) {
    let texto = e.target.value.trimStart()
    if (deveCapitalizar && texto) {
      texto = capitalizar(texto)
    }
    setValor(texto)
  }

  async function handleExcluir() {
    if (!itemSelecionado) return

    setSalvando(true)
    try {
      await onExcluir?.(tipo, itemSelecionado)
      setShowConfirmacao(false)
      resetForm()
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => {
      // Só fecha se clicar fora do modal (no overlay)
      if (e.target.classList.contains('modal-overlay')) {
        onFechar()
      }
    }}>
      <div className="modal-card mini" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>{estaEditando ? 'Editar Cadastro' : 'Novo Cadastro'}</h3>
          <button onClick={resetForm} style={{
            background: 'var(--btn-cancel-bg)', color: 'var(--btn-cancel-text)',
            border: 'none', borderRadius: 6, cursor: 'pointer',
            fontWeight: 600, fontSize: '0.78rem', padding: '0 12px', height: 30,
          }}>
            + Novo
          </button>
        </div>

        <div className="modal-body">
          {/* Tipo */}
          <div className="modal-field">
            <label>Tipo de Cadastro</label>
            <select value={tipo} onChange={e => setTipo(e.target.value)}
              style={{ padding: 12, border: '1px solid var(--border-light)', borderRadius: 8, fontSize: 15, background: 'var(--input-bg)', color: 'var(--input-text)', width: '100%' }}>
              <option value="produto">Produto</option>
              <option value="modelo">Modelo</option>
              <option value="cor">Cor</option>
              <option value="marca">Marca</option>
              <option value="cliente">Cliente</option>
            </select>
          </div>

          {/* Busca para selecionar item existente */}
          <div className="modal-field" style={{ marginTop: 15, position: 'relative' }}>
            <label>Buscar para Editar (opcional)</label>
            <input
              ref={searchRef}
              value={searchVal}
              onChange={e => {
                e.stopPropagation()
                setSearchVal(e.target.value)
                setShowDrop(true)
                setActiveIdx(-1)
              }}
              onFocus={(e) => {
                e.stopPropagation()
                setShowDrop(true)
              }}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={e => {
                e.stopPropagation()
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setActiveIdx(i => (i + 1) >= itensFiltrados.length ? 0 : i + 1)
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setActiveIdx(i => (i - 1) < 0 ? itensFiltrados.length - 1 : i - 1)
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  if (activeIdx >= 0 && itensFiltrados[activeIdx]) {
                    selecionarItem(itensFiltrados[activeIdx])
                  }
                } else if (e.key === 'Escape') {
                  setShowDrop(false)
                  setActiveIdx(-1)
                }
              }}
              placeholder="Digite para buscar..."
              autoComplete="off"
              className="cell-input"
              style={{ width: '100%' }}
            />
            {showDrop && itensFiltrados.length > 0 && (
              <ul className="autocomplete-list" style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: 0,
                right: 0,
                zIndex: 200,
                background: 'var(--card-bg)',
                border: '1px solid var(--border-light)',
                borderRadius: 8,
                maxHeight: 200,
                overflowY: 'auto',
                listStyle: 'none',
                margin: 0,
                padding: 0,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              }}>
                {itensFiltrados.map((item, idx) => {
                  const nome = isCliente ? item.instagram : item
                  return (
                    <li key={nome}
                      className={idx === activeIdx ? 'dropdown-item-active' : ''}
                      onMouseDown={() => selecionarItem(item)}
                      onMouseEnter={() => setActiveIdx(idx)}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        borderBottom: idx < itensFiltrados.length - 1 ? '1px solid var(--border-light)' : 'none',
                        background: idx === activeIdx ? 'var(--blue)' : 'transparent',
                        color: idx === activeIdx ? '#171717' : 'var(--text-body)',
                        fontSize: 14,
                      }}
                    >
                      {nome}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--border-light)', margin: '15px 0' }} />

          {/* Campo principal */}
          <div className="modal-field">
            <label>{isCliente ? 'Instagram (@usuario)' : 'Nome do item'}</label>
            <input className="cell-input" value={valor} placeholder="Digite..."
              onChange={(e) => {
                e.stopPropagation()
                handleValorChange(e)
              }}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={e => {
                e.stopPropagation()
                if (e.key === 'Enter' && !isCliente) salvar()
              }}
              style={{ width: '100%' }} />
          </div>

          {/* WhatsApp (só para cliente) */}
          {isCliente && (
            <div className="modal-field" style={{ marginTop: 15 }}>
              <label>WhatsApp (apenas números)</label>
              <input className="cell-input" value={celular} placeholder="Apenas números..."
                onChange={(e) => {
                  e.stopPropagation()
                  setCelular(e.target.value.replace(/\D/g, '').trimStart())
                }}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={e => {
                  e.stopPropagation()
                  if (e.key === 'Enter') salvar()
                }}
                style={{ width: '100%' }} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-cancel" onClick={onFechar} disabled={salvando}>
              Cancelar
            </button>
            {estaEditando && (
              <button
                onClick={() => setShowConfirmacao(true)}
                disabled={salvando}
                style={{
                  background: 'rgba(242,139,130,0.1)',
                  border: '1px solid var(--red)',
                  color: 'var(--red)',
                  borderRadius: 6,
                  padding: '8px 16px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                Excluir
              </button>
            )}
          </div>
          <button className="btn-confirm" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : (estaEditando ? 'Atualizar' : 'Salvar no Banco')}
          </button>
        </div>
      </div>

      {/* Modal de Confirmação de Exclusão */}
      {showConfirmacao && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{
            background: 'var(--card-bg)',
            borderRadius: 12,
            padding: 24,
            maxWidth: 400,
            width: '90%',
            border: '1px solid var(--border-light)',
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18, color: 'var(--text-header)' }}>
              Confirmar Exclusão
            </h3>
            <p style={{ margin: '0 0 24px', color: 'var(--text-body)', fontSize: 14 }}>
              Deseja realmente excluir <strong style={{ color: 'var(--red)' }}>{itemSelecionado}</strong>?
              <br />
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>Esta ação não pode ser desfeita.</span>
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowConfirmacao(false)}
                disabled={salvando}
                style={{
                  background: 'var(--btn-cancel-bg)',
                  color: 'var(--btn-cancel-text)',
                  border: 'none',
                  borderRadius: 6,
                  padding: '8px 16px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleExcluir}
                disabled={salvando}
                style={{
                  background: 'var(--red)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '8px 16px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                {salvando ? 'Excluindo...' : 'Sim, Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
