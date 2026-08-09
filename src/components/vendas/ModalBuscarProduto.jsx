import { useState, useMemo } from 'react'

export default function ModalBuscarProduto({ produtos = [], onSelecionar, onExcluir, onFechar }) {
  const [filtro, setFiltro] = useState('')

  // Filtro multi-termo (igual ao da página de vendas)
  const produtosFiltrados = useMemo(() => {
    if (!filtro.trim()) return produtos

    const termos = filtro.toLowerCase().split(',').map(t => t.trim()).filter(Boolean)

    return produtos.filter(p => {
      const txt = [
        p.produto,
        p.modelo,
        p.cor,
        p.marca,
        p.tamanho,
        p.codigo,
        p.condicao,
        p.genero
      ].join(' ').toLowerCase()

      return termos.every(t => txt.includes(t))
    })
  }, [produtos, filtro])

  return (
    <div className="modal-overlay" onClick={(e) => {
      if (e.target.classList.contains('modal-overlay')) onFechar()
    }}>
      <div className="modal-card" style={{ maxWidth: 1200, width: '95%', minHeight: 600, maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header" style={{ position: 'relative', paddingBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div>
              <h3 style={{ margin: 0, marginBottom: 4 }}>📦 Buscar Produto Cadastrado</h3>
              <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 400 }}>
                Produtos não vendidos (últimos 60 dias)
              </span>
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: 14, color: 'var(--blue)', fontWeight: 600 }}>
              {produtosFiltrados.length} produtos encontrados de {produtos.length} totais
            </span>
          </div>
          <button
            onClick={onFechar}
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              background: 'transparent',
              border: 'none',
              color: 'var(--blue)',
              fontSize: 24,
              cursor: 'pointer',
              padding: 0,
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 4,
              transition: 'background 0.2s'
            }}
            onMouseOver={(e) => e.target.style.background = 'rgba(139, 180, 248, 0.1)'}
            onMouseOut={(e) => e.target.style.background = 'transparent'}
            title="Fechar"
          >
            ×
          </button>
        </div>

        <div className="modal-body">
          {/* Filtro */}
          <div className="modal-field" style={{ marginBottom: 16 }}>
            <input
              type="text"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Digite para buscar (Ex: camiseta, verde, zara)"
              autoFocus
              style={{
                width: '100%',
                padding: 12,
                border: '1px solid var(--border-light)',
                borderRadius: 8,
                background: 'var(--input-bg)',
                color: 'var(--input-text)',
                fontSize: 14
              }}
            />
          </div>

          {/* Lista de Produtos */}
          <div style={{
            maxHeight: 400,
            overflowY: 'auto',
            border: '1px solid var(--border-light)',
            borderRadius: 8,
            background: 'var(--card-bg)',
            padding: '0 0 8px 0'
          }}>
            {produtosFiltrados.length === 0 ? (
              <div style={{
                padding: 40,
                textAlign: 'center',
                color: 'var(--muted)',
                fontSize: 14
              }}>
                {filtro.trim()
                  ? `Nenhum produto encontrado para: "${filtro}"`
                  : 'Nenhum produto disponível'}
              </div>
            ) : (
              <table style={{ width: '100%', fontSize: 13, tableLayout: 'fixed' }}>
                <thead style={{
                  position: 'sticky',
                  top: 0,
                  background: 'var(--header-bg)',
                  zIndex: 1
                }}>
                  <tr>
                    <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border-light)', width: '17%' }}>Produto</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border-light)', width: '17%' }}>Modelo</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border-light)', width: '14%' }}>Cor</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border-light)', width: '14%' }}>Marca</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border-light)', width: '7%' }}>Tam.</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border-light)', width: '9%' }}>Preço</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border-light)', width: '8%' }}>Cód.</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid var(--border-light)', width: '14%' }}>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {produtosFiltrados.map((p, idx) => (
                    <tr key={idx} style={{
                      borderBottom: '1px solid var(--border-light)',
                      ':hover': { background: 'var(--hover-bg)' }
                    }}>
                      <td style={{ padding: '6px 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.produto || '—'}</td>
                      <td style={{ padding: '6px 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.modelo || '—'}</td>
                      <td style={{ padding: '6px 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.cor || '—'}</td>
                      <td style={{ padding: '6px 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.marca || '—'}</td>
                      <td style={{ padding: '6px 8px' }}>{p.tamanho || '—'}</td>
                      <td style={{ padding: '6px 8px', fontWeight: 600, color: 'var(--green)' }}>
                        {p.preco || '—'}
                      </td>
                      <td style={{ padding: '6px 8px', color: 'var(--muted)', fontSize: 11 }}>{p.codigo || '—'}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <div className="acoes-wrapper" style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                          <button
                            type="button"
                            className="btn-action-sm copy"
                            onClick={() => onSelecionar(p)}
                            title="Importar produto para vendas"
                          >
                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="btn-action-sm del"
                            onClick={() => onExcluir?.(p)}
                            title="Excluir produto do banco"
                          >
                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"/>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
