import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import AppShell from '../../components/ui/AppShell'
import ModalFornecedor from '../../components/compras/ModalFornecedor'

// ─── HELPERS ────────────────────────────────────────
function formatMoney(value) {
  if (!value) return ''
  const num = parseFloat(value)
  if (isNaN(num)) return ''
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function parseMoney(value) {
  if (!value) return 0
  return parseFloat(value.replace(/\./g, '').replace(',', '.')) || 0
}

function formatDate(date) {
  if (!date) return ''
  const d = new Date(date + 'T00:00:00')
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
}

export default function ComprasPage() {
  const { toast } = useApp()
  const { user, profile } = useAuth()

  // Estados principais
  const [compras, setCompras] = useState([])
  const [fornecedores, setFornecedores] = useState([])
  const [totalDia, setTotalDia] = useState(0)
  const [loading, setLoading] = useState(true)

  // Estados do formulário
  const [descricao, setDescricao] = useState('')
  const [quantidade, setQuantidade] = useState('1')
  const [precoUnitario, setPrecoUnitario] = useState('')
  const [fornecedorId, setFornecedorId] = useState('')
  const [buscaFornecedor, setBuscaFornecedor] = useState('')

  // Estados do modal
  const [showModalFornecedor, setShowModalFornecedor] = useState(false)

  // ─── CARREGAR DADOS ────────────────────────────────────────
  useEffect(() => {
    carregarDados()
  }, [])

  async function carregarDados() {
    setLoading(true)
    try {
      await Promise.all([
        carregarCompras(),
        carregarFornecedores(),
        carregarTotalDia()
      ])
    } catch (error) {
      console.error('Erro ao carregar dados:', error)
      toast?.error('Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }

  async function carregarCompras() {
    const { data, error } = await supabase
      .from('compras')
      .select(`
        *,
        fornecedor:fornecedores(nome)
      `)
      .order('data', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('Erro ao carregar compras:', error)
      return
    }

    setCompras(data || [])
  }

  async function carregarFornecedores() {
    const { data, error } = await supabase
      .from('fornecedores')
      .select('*')
      .order('nome')

    if (error) {
      console.error('Erro ao carregar fornecedores:', error)
      return
    }

    setFornecedores(data || [])
  }

  async function carregarTotalDia() {
    const { data, error } = await supabase
      .rpc('get_total_compras_dia')

    if (error) {
      console.error('Erro ao carregar total do dia:', error)
      return
    }

    setTotalDia(data || 0)
  }

  // ─── ADICIONAR COMPRA ────────────────────────────────────────
  async function adicionarCompra(e) {
    e.preventDefault()

    if (!descricao.trim()) {
      toast?.error('Informe a descrição do produto')
      return
    }

    if (!quantidade || parseFloat(quantidade) <= 0) {
      toast?.error('Informe uma quantidade válida')
      return
    }

    if (!precoUnitario || parseMoney(precoUnitario) <= 0) {
      toast?.error('Informe um preço válido')
      return
    }

    try {
      const { error } = await supabase
        .from('compras')
        .insert({
          tenant_id: profile?.tenant_id,
          descricao: descricao.trim(),
          quantidade: parseFloat(quantidade),
          preco_unitario: parseMoney(precoUnitario),
          fornecedor_id: fornecedorId || null,
          usuario_id: user?.id
        })

      if (error) throw error

      toast?.success('Compra adicionada!')

      // Limpar formulário
      setDescricao('')
      setQuantidade('1')
      setPrecoUnitario('')
      setFornecedorId('')
      setBuscaFornecedor('')

      // Recarregar dados
      await carregarDados()
    } catch (error) {
      console.error('Erro ao adicionar compra:', error)
      toast?.error('Erro ao adicionar compra')
    }
  }

  // ─── EXCLUIR COMPRA ────────────────────────────────────────
  async function excluirCompra(id) {
    if (!confirm('Deseja realmente excluir esta compra?')) return

    try {
      const { error } = await supabase
        .from('compras')
        .delete()
        .eq('id', id)

      if (error) throw error

      toast?.success('Compra excluída!')
      await carregarDados()
    } catch (error) {
      console.error('Erro ao excluir compra:', error)
      toast?.error('Erro ao excluir compra')
    }
  }

  // ─── FORNECEDORES FILTRADOS ────────────────────────────────────────
  const fornecedoresFiltrados = fornecedores.filter(f =>
    f.nome.toLowerCase().includes(buscaFornecedor.toLowerCase())
  )

  // ─── CALCULAR TOTAL ────────────────────────────────────────
  const totalCalculado = quantidade && precoUnitario
    ? parseFloat(quantidade) * parseMoney(precoUnitario)
    : 0

  // ─── RENDER ────────────────────────────────────────
  return (
    <AppShell title="Compras">
      <div className="compras-page">
        {/* TOTAL DO DIA - FIXO NO TOPO */}
        <div className="total-dia-fixo">
          <div className="total-dia-label">Total de Compras Hoje:</div>
          <div className="total-dia-valor">R$ {formatMoney(totalDia)}</div>
        </div>

        {/* FORMULÁRIO DE COMPRA */}
        <form onSubmit={adicionarCompra} className="form-compra">
          <div className="form-group">
            <label>Descrição do Produto</label>
            <input
              type="text"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: calça listrada"
              autoFocus
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Qtde</label>
              <input
                type="number"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                step="0.01"
                min="0"
              />
            </div>

            <div className="form-group">
              <label>Preço Unit.</label>
              <input
                type="text"
                value={precoUnitario}
                onChange={(e) => setPrecoUnitario(e.target.value)}
                placeholder="0,00"
                onFocus={(e) => e.target.select()}
              />
            </div>

            <div className="form-group total-field">
              <label>Total</label>
              <div className="total-display">
                R$ {formatMoney(totalCalculado)}
              </div>
            </div>
          </div>

          <div className="form-group fornecedor-group">
            <label>Fornecedor</label>
            <div className="fornecedor-input-wrapper">
              <input
                type="text"
                value={buscaFornecedor}
                onChange={(e) => {
                  setBuscaFornecedor(e.target.value)
                  setFornecedorId('')
                }}
                placeholder="Buscar fornecedor..."
                list="fornecedores-list"
              />
              <button
                type="button"
                className="btn-add-fornecedor"
                onClick={() => setShowModalFornecedor(true)}
                title="Adicionar fornecedor"
              >
                +
              </button>
            </div>

            {buscaFornecedor && fornecedoresFiltrados.length > 0 && !fornecedorId && (
              <div className="fornecedores-dropdown">
                {fornecedoresFiltrados.map(f => (
                  <div
                    key={f.id}
                    className="fornecedor-item"
                    onClick={() => {
                      setFornecedorId(f.id)
                      setBuscaFornecedor(f.nome)
                    }}
                  >
                    {f.nome}
                  </div>
                ))}
              </div>
            )}
          </div>

          <button type="submit" className="btn-salvar-compra">
            Adicionar Compra
          </button>
        </form>

        {/* LISTA DE COMPRAS */}
        <div className="lista-compras">
          <h3>Últimas Compras</h3>

          {loading ? (
            <div className="loading">Carregando...</div>
          ) : compras.length === 0 ? (
            <div className="empty-state">Nenhuma compra cadastrada</div>
          ) : (
            compras.map(compra => (
              <div key={compra.id} className="compra-card">
                <div className="compra-header">
                  <div className="compra-data">{formatDate(compra.data)}</div>
                  <button
                    className="btn-excluir"
                    onClick={() => excluirCompra(compra.id)}
                    title="Excluir"
                  >
                    ×
                  </button>
                </div>

                <div className="compra-descricao">{compra.descricao}</div>

                <div className="compra-detalhes">
                  <div className="detalhe">
                    <span className="label">Qtde:</span>
                    <span className="valor">{compra.quantidade}</span>
                  </div>
                  <div className="detalhe">
                    <span className="label">Preço:</span>
                    <span className="valor">R$ {formatMoney(compra.preco_unitario)}</span>
                  </div>
                  <div className="detalhe total">
                    <span className="label">Total:</span>
                    <span className="valor">R$ {formatMoney(compra.total)}</span>
                  </div>
                </div>

                {compra.fornecedor && (
                  <div className="compra-fornecedor">
                    <span className="label">Fornecedor:</span> {compra.fornecedor.nome}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* MODAL FORNECEDOR */}
      {showModalFornecedor && (
        <ModalFornecedor
          onClose={() => setShowModalFornecedor(false)}
          onSave={async () => {
            await carregarFornecedores()
            setShowModalFornecedor(false)
          }}
        />
      )}

      <style>{`
        .compras-page {
          max-width: 600px;
          margin: 0 auto;
          padding: 0 0 80px 0;
        }

        /* TOTAL DO DIA FIXO NO TOPO */
        .total-dia-fixo {
          position: sticky;
          top: 0;
          z-index: 100;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 16px;
          margin: -16px -16px 16px -16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }

        .total-dia-label {
          font-size: 14px;
          font-weight: 500;
          opacity: 0.95;
        }

        .total-dia-valor {
          font-size: 24px;
          font-weight: 700;
          text-shadow: 0 1px 2px rgba(0,0,0,0.2);
        }

        /* FORMULÁRIO */
        .form-compra {
          background: var(--card-bg);
          padding: 16px;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          margin-bottom: 24px;
        }

        .form-group {
          margin-bottom: 16px;
        }

        .form-group label {
          display: block;
          margin-bottom: 6px;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .form-group input,
        .form-group select {
          width: 100%;
          padding: 12px;
          border: 1px solid var(--border);
          border-radius: 8px;
          font-size: 16px;
          background: var(--input-bg);
          color: var(--text-primary);
          -webkit-appearance: none;
        }

        .form-group input:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr 1.2fr;
          gap: 12px;
          margin-bottom: 16px;
        }

        .total-field {
          margin-bottom: 0;
        }

        .total-display {
          padding: 12px;
          background: rgba(102, 126, 234, 0.1);
          border-radius: 8px;
          font-size: 16px;
          font-weight: 700;
          color: #667eea;
          text-align: center;
          border: 1px solid rgba(102, 126, 234, 0.2);
        }

        /* FORNECEDOR */
        .fornecedor-group {
          position: relative;
        }

        .fornecedor-input-wrapper {
          display: flex;
          gap: 8px;
        }

        .fornecedor-input-wrapper input {
          flex: 1;
        }

        .btn-add-fornecedor {
          width: 44px;
          height: 44px;
          border: none;
          background: #667eea;
          color: white;
          border-radius: 8px;
          font-size: 24px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .btn-add-fornecedor:active {
          transform: scale(0.95);
          background: #5568d3;
        }

        .fornecedores-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 48px;
          background: var(--card-bg);
          border: 1px solid var(--border);
          border-radius: 8px;
          margin-top: 4px;
          max-height: 200px;
          overflow-y: auto;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          z-index: 1000;
        }

        .fornecedor-item {
          padding: 12px;
          cursor: pointer;
          border-bottom: 1px solid var(--border);
          font-size: 15px;
        }

        .fornecedor-item:last-child {
          border-bottom: none;
        }

        .fornecedor-item:active {
          background: rgba(102, 126, 234, 0.1);
        }

        .btn-salvar-compra {
          width: 100%;
          padding: 14px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
        }

        .btn-salvar-compra:active {
          transform: scale(0.98);
          box-shadow: 0 1px 4px rgba(102, 126, 234, 0.3);
        }

        /* LISTA DE COMPRAS */
        .lista-compras h3 {
          margin-bottom: 16px;
          font-size: 18px;
          color: var(--text-primary);
        }

        .compra-card {
          background: var(--card-bg);
          border-radius: 12px;
          padding: 14px;
          margin-bottom: 12px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.08);
        }

        .compra-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }

        .compra-data {
          font-size: 13px;
          color: var(--text-secondary);
          font-weight: 600;
        }

        .btn-excluir {
          width: 28px;
          height: 28px;
          border: none;
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
          border-radius: 6px;
          font-size: 20px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          line-height: 1;
        }

        .btn-excluir:active {
          background: rgba(239, 68, 68, 0.2);
        }

        .compra-descricao {
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 12px;
        }

        .compra-detalhes {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 8px;
          margin-bottom: 8px;
        }

        .detalhe {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .detalhe .label {
          font-size: 11px;
          color: var(--text-secondary);
          text-transform: uppercase;
          font-weight: 600;
        }

        .detalhe .valor {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .detalhe.total .valor {
          color: #667eea;
          font-size: 16px;
        }

        .compra-fornecedor {
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px solid var(--border);
          font-size: 13px;
          color: var(--text-secondary);
        }

        .compra-fornecedor .label {
          font-weight: 600;
        }

        .loading,
        .empty-state {
          text-align: center;
          padding: 40px;
          color: var(--text-secondary);
        }

        /* MOBILE ADJUSTMENTS */
        @media (max-width: 480px) {
          .compras-page {
            padding: 0 0 60px 0;
          }

          .form-row {
            grid-template-columns: 0.8fr 1fr 1.2fr;
            gap: 8px;
          }

          .form-group label {
            font-size: 12px;
          }

          .form-group input {
            padding: 10px;
            font-size: 15px;
          }

          .total-display {
            font-size: 14px;
            padding: 10px;
          }

          .total-dia-fixo {
            padding: 12px;
          }

          .total-dia-valor {
            font-size: 20px;
          }
        }
      `}</style>
    </AppShell>
  )
}
