import { useState, useMemo } from 'react'

export default function ModalBuscarProduto({ produtos = [], onSelecionar, onFechar }) {
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
        <div className="modal-header">
          <h3>📦 Buscar Produto Cadastrado</h3>
          <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 400 }}>
            Produtos não vendidos (últimos 60 dias)
          </span>
        </div>

        <div className="modal-body">
          {/* Filtro */}
          <div className="modal-field" style={{ marginBottom: 16 }}>
            <label>Filtro Rápido</label>
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
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
              {produtosFiltrados.length} produtos encontrados de {produtos.length} totais
            </div>
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
                    <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border-light)', width: '18%' }}>Produto</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border-light)', width: '18%' }}>Modelo</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border-light)', width: '15%' }}>Cor</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border-light)', width: '15%' }}>Marca</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border-light)', width: '8%' }}>Tam.</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border-light)', width: '10%' }}>Preço</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border-light)', width: '8%' }}>Cód.</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid var(--border-light)', width: '8%' }}>Ação</th>
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
                        <button
                          onClick={() => onSelecionar(p)}
                          style={{
                            background: 'var(--blue)',
                            color: '#171717',
                            border: 'none',
                            borderRadius: 4,
                            padding: '4px 10px',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          Usar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-cancel" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  )
}
