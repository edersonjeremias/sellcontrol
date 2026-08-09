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
      <div className="modal-card" style={{ maxWidth: 1200, width: '95%' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ margin: 0, marginBottom: 4 }}>📦 Buscar Produto Cadastrado</h3>
            <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 400, display: 'block', marginBottom: 4 }}>
              Produtos não vendidos (últimos 60 dias)
            </span>
            <span style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 600 }}>
              {produtosFiltrados.length} produtos encontrados de {produtos.length} totais
            </span>
          </div>
          <button
            onClick={onFechar}
            style={{
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
            background: 'var(--card-bg)'
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
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                          <button
                            onClick={() => onSelecionar(p)}
                            style={{
                              background: 'var(--blue)',
                              color: '#171717',
                              border: 'none',
                              borderRadius: 4,
                              padding: '4px 8px',
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer',
                              whiteSpace: 'nowrap'
                            }}
                            title="Importar produto"
                          >
                            Usar
                          </button>
                          <button
                            onClick={() => onExcluir?.(p)}
                            style={{
                              background: 'rgba(239,68,68,0.1)',
                              color: 'var(--red)',
                              border: '1px solid var(--red)',
                              borderRadius: 4,
                              padding: '4px 8px',
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer',
                              whiteSpace: 'nowrap'
                            }}
                            title="Excluir do banco"
                          >
                            🗑️
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
