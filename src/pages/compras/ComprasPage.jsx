import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import AppShell from '../../components/ui/AppShell'
import ModalFornecedor from '../../components/compras/ModalFornecedor'
import AutocompleteInput from '../../components/ui/AutocompleteInput'

// ─── HELPERS ────────────────────────────────────────
function formatMoney(value) {
  if (!value) return '0,00'
  const num = parseFloat(value)
  if (isNaN(num)) return '0,00'
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
  const [view, setView] = useState('compras') // 'compras' ou 'fornecedores'

  // Estados do formulário
  const [descricao, setDescricao] = useState('')
  const [quantidade, setQuantidade] = useState('1')
  const [precoUnitario, setPrecoUnitario] = useState('')
  const [fornecedorSelecionado, setFornecedorSelecionado] = useState(null)

  // Estados do modal
  const [showModalFornecedor, setShowModalFornecedor] = useState(false)
  const [fornecedorEdit, setFornecedorEdit] = useState(null)
  const [compraEdit, setCompraEdit] = useState(null)
  const [showModalEditarCompra, setShowModalEditarCompra] = useState(false)

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
        fornecedor:fornecedores(id, nome, endereco, whatsapp)
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
    // Calcular total do dia de TODAS as compras (não filtrar por usuário)
    const hoje = new Date().toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('compras')
      .select('total')
      .eq('data', hoje)

    if (error) {
      console.error('Erro ao carregar total do dia:', error)
      // Se der erro, tenta calcular a partir das compras já carregadas
      const totalLocal = compras
        .filter(c => c.data === hoje)
        .reduce((acc, c) => acc + parseFloat(c.total || 0), 0)
      setTotalDia(totalLocal)
      return
    }

    const total = data?.reduce((acc, item) => acc + parseFloat(item.total || 0), 0) || 0
    setTotalDia(total)
  }

  // ─── ADICIONAR/EDITAR COMPRA ────────────────────────────────────────
  async function salvarCompra(e) {
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
      const dados = {
        tenant_id: profile?.tenant_id,
        descricao: descricao.trim(),
        quantidade: parseFloat(quantidade),
        preco_unitario: parseMoney(precoUnitario),
        fornecedor_id: fornecedorSelecionado?.id || null,
        usuario_id: user?.id
      }

      if (compraEdit) {
        // Atualizar
        const { error } = await supabase
          .from('compras')
          .update(dados)
          .eq('id', compraEdit.id)

        if (error) throw error
        toast?.success('Compra atualizada!')
        setShowModalEditarCompra(false)
        setCompraEdit(null)
      } else {
        // Inserir
        const { error } = await supabase
          .from('compras')
          .insert(dados)

        if (error) throw error
        toast?.success('Compra adicionada!')
      }

      // Limpar formulário
      setDescricao('')
      setQuantidade('1')
      setPrecoUnitario('')
      setFornecedorSelecionado(null)

      // Recarregar dados
      await carregarDados()
    } catch (error) {
      console.error('Erro ao salvar compra:', error)
      toast?.error('Erro ao salvar compra')
    }
  }

  // ─── EDITAR COMPRA ────────────────────────────────────────
  function editarCompra(compra) {
    setCompraEdit(compra)
    setDescricao(compra.descricao)
    setQuantidade(String(compra.quantidade))
    setPrecoUnitario(formatMoney(compra.preco_unitario))
    setFornecedorSelecionado(compra.fornecedor)
    setShowModalEditarCompra(true)
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

  // ─── FORNECEDORES ────────────────────────────────────────
  function editarFornecedor(fornecedor) {
    setFornecedorEdit(fornecedor)
    setShowModalFornecedor(true)
  }

  async function excluirFornecedor(id) {
    if (!confirm('Deseja realmente excluir este fornecedor?')) return

    try {
      const { error } = await supabase
        .from('fornecedores')
        .delete()
        .eq('id', id)

      if (error) throw error

      toast?.success('Fornecedor excluído!')
      await carregarFornecedores()
    } catch (error) {
      console.error('Erro ao excluir fornecedor:', error)
      toast?.error('Erro ao excluir fornecedor')
    }
  }

  // ─── BUSCA INTELIGENTE DE FORNECEDORES ────────────────────────────────────────
  function formatarFornecedor(fornecedor) {
    if (!fornecedor) return ''
    const partes = [fornecedor.nome]
    if (fornecedor.whatsapp) partes.push(fornecedor.whatsapp)
    if (fornecedor.endereco) partes.push(fornecedor.endereco)
    return partes.join(' • ')
  }

  // Lista de fornecedores formatados para o autocomplete
  const fornecedoresFormatados = fornecedores.map(formatarFornecedor)

  function selecionarFornecedor(textoSelecionado) {
    const fornecedor = fornecedores.find(f => formatarFornecedor(f) === textoSelecionado)
    setFornecedorSelecionado(fornecedor || null)
  }

  // ─── CALCULAR TOTAL ────────────────────────────────────────
  const totalCalculado = quantidade && precoUnitario
    ? parseFloat(quantidade) * parseMoney(precoUnitario)
    : 0

  // ─── RENDER ────────────────────────────────────────
  return (
    <AppShell title="Compras" hideTitle={true}>
      <div className="compras-page">
        {/* TOTAL DO DIA - FIXO NO TOPO */}
        <div className="total-dia-fixo">
          <div className="total-dia-label">Total de Compras Hoje:</div>
          <div className="total-dia-valor">R$ {formatMoney(totalDia)}</div>
        </div>

        {/* TABS */}
        <div className="tabs">
          <button
            className={`tab ${view === 'compras' ? 'active' : ''}`}
            onClick={() => setView('compras')}
          >
            Compras
          </button>
          <button
            className={`tab ${view === 'fornecedores' ? 'active' : ''}`}
            onClick={() => setView('fornecedores')}
          >
            Fornecedores
          </button>
        </div>

        {/* VIEW: COMPRAS */}
        {view === 'compras' && (
          <>
            {/* FORMULÁRIO DE COMPRA */}
            <form onSubmit={salvarCompra} className="form-compra">
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

              <div className="form-group">
                <label>Fornecedor</label>
                <div className="fornecedor-input-wrapper">
                  <div style={{ flex: 1, position: 'relative' }}>
                    <AutocompleteInput
                      value={fornecedorSelecionado ? formatarFornecedor(fornecedorSelecionado) : ''}
                      onChange={(valor) => {
                        if (!valor) {
                          setFornecedorSelecionado(null)
                        }
                      }}
                      onSelect={(textoSelecionado) => selecionarFornecedor(textoSelecionado)}
                      list={fornecedoresFormatados}
                      placeholder="Buscar por nome, whatsapp ou endereço..."
                      showOnFocus={true}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn-add-fornecedor"
                    onClick={() => {
                      setFornecedorEdit(null)
                      setShowModalFornecedor(true)
                    }}
                    title="Adicionar fornecedor"
                  >
                    +
                  </button>
                </div>
              </div>

              <button type="submit" className="btn-salvar-compra">
                {compraEdit ? 'Atualizar Compra' : 'Adicionar Compra'}
              </button>

              {compraEdit && (
                <button
                  type="button"
                  className="btn-cancelar-edicao"
                  onClick={() => {
                    setCompraEdit(null)
                    setDescricao('')
                    setQuantidade('1')
                    setPrecoUnitario('')
                    setFornecedorSelecionado(null)
                  }}
                >
                  Cancelar Edição
                </button>
              )}
            </form>

            {/* LISTA DE COMPRAS */}
            <div className="lista-compras">
              <h3>Últimas Compras</h3>

              {loading ? (
                <div className="loading">Carregando...</div>
              ) : compras.length === 0 ? (
                <div className="empty-state">Nenhuma compra cadastrada</div>
              ) : (
                compras.map((compra, index) => (
                  <div key={compra.id} className="compra-card">
                    {/* HEADER: Data + Fornecedor + Botões */}
                    <div className="compra-header">
                      <div className="header-left">
                        <div className="compra-data">{formatDate(compra.data)}</div>
                        {compra.fornecedor && (
                          <div className="compra-fornecedor-header">
                            <strong>{compra.fornecedor.nome}</strong>
                            {compra.fornecedor.endereco && <span> • {compra.fornecedor.endereco}</span>}
                            {compra.fornecedor.whatsapp && <span> • {compra.fornecedor.whatsapp}</span>}
                          </div>
                        )}
                      </div>
                      <div className="compra-acoes">
                        {index === 0 && (
                          <button
                            className="btn-editar-compra"
                            onClick={() => editarCompra(compra)}
                            title="Editar última compra"
                          >
                            ✎
                          </button>
                        )}
                        <button
                          className="btn-excluir"
                          onClick={() => excluirCompra(compra.id)}
                          title="Excluir"
                        >
                          ×
                        </button>
                      </div>
                    </div>

                    {/* DETALHES: Descrição, Qtde, Preço, Total em UMA LINHA */}
                    <div className="compra-detalhes-inline">
                      <div className="descricao">{compra.descricao}</div>
                      <div className="valores">
                        <span className="qtde">{compra.quantidade}x</span>
                        <span className="preco">R$ {formatMoney(compra.preco_unitario)}</span>
                        <span className="total">= R$ {formatMoney(compra.total)}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* VIEW: FORNECEDORES */}
        {view === 'fornecedores' && (
          <div className="lista-fornecedores">
            <button
              className="btn-novo-fornecedor"
              onClick={() => {
                setFornecedorEdit(null)
                setShowModalFornecedor(true)
              }}
            >
              + Novo Fornecedor
            </button>

            {loading ? (
              <div className="loading">Carregando...</div>
            ) : fornecedores.length === 0 ? (
              <div className="empty-state">Nenhum fornecedor cadastrado</div>
            ) : (
              fornecedores.map(fornecedor => (
                <div key={fornecedor.id} className="fornecedor-card">
                  <div className="fornecedor-info">
                    <div className="fornecedor-nome">{fornecedor.nome}</div>
                    {fornecedor.endereco && (
                      <div className="fornecedor-detalhe">📍 {fornecedor.endereco}</div>
                    )}
                    {fornecedor.whatsapp && (
                      <div className="fornecedor-detalhe">📱 {fornecedor.whatsapp}</div>
                    )}
                  </div>
                  <div className="fornecedor-acoes">
                    <button
                      className="btn-editar"
                      onClick={() => editarFornecedor(fornecedor)}
                      title="Editar"
                    >
                      ✎
                    </button>
                    <button
                      className="btn-excluir-fornecedor"
                      onClick={() => excluirFornecedor(fornecedor.id)}
                      title="Excluir"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* MODAL FORNECEDOR */}
      {showModalFornecedor && (
        <ModalFornecedor
          fornecedorEdit={fornecedorEdit}
          onClose={() => {
            setShowModalFornecedor(false)
            setFornecedorEdit(null)
          }}
          onSave={async () => {
            await carregarFornecedores()
            setShowModalFornecedor(false)
            setFornecedorEdit(null)
          }}
        />
      )}

      <style>{`
        .compras-page {
          max-width: 600px;
          margin: 0 auto;
          padding: 0 0 80px 0;
        }

        /* TOTAL DO DIA FIXO NO TOPO - ENCOSTADO NO MENU */
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

        /* TABS */
        .tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
          background: var(--card-bg);
          padding: 8px;
          border-radius: 12px;
        }

        .tab {
          flex: 1;
          padding: 10px;
          background: transparent;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.2s;
        }

        .tab.active {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }

        .tab:active {
          transform: scale(0.98);
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
          grid-template-columns: 0.8fr 1fr 1.2fr;
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
        .fornecedor-input-wrapper {
          display: flex;
          gap: 8px;
        }

        .btn-add-fornecedor {
          width: 44px;
          height: 44px;
          flex-shrink: 0;
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

        .btn-salvar-compra,
        .btn-cancelar-edicao {
          width: 100%;
          padding: 14px;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          margin-bottom: 8px;
        }

        .btn-salvar-compra {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
        }

        .btn-salvar-compra:active {
          transform: scale(0.98);
          box-shadow: 0 1px 4px rgba(102, 126, 234, 0.3);
        }

        .btn-cancelar-edicao {
          background: rgba(128, 128, 128, 0.1);
          color: var(--text-primary);
          margin-bottom: 0;
        }

        .btn-cancelar-edicao:active {
          background: rgba(128, 128, 128, 0.15);
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
          padding: 12px;
          margin-bottom: 12px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.08);
        }

        .compra-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 10px;
          gap: 8px;
        }

        .header-left {
          flex: 1;
          min-width: 0;
        }

        .compra-acoes {
          display: flex;
          gap: 6px;
          flex-shrink: 0;
        }

        .compra-data {
          font-size: 12px;
          color: var(--text-secondary);
          font-weight: 600;
          margin-bottom: 4px;
        }

        .compra-fornecedor-header {
          font-size: 11px;
          color: var(--text-secondary);
          line-height: 1.4;
          word-break: break-word;
        }

        .compra-fornecedor-header strong {
          color: var(--text-primary);
          font-weight: 600;
        }

        .btn-editar-compra {
          width: 32px;
          height: 32px;
          flex-shrink: 0;
          border: 2px solid #667eea;
          background: rgba(102, 126, 234, 0.15);
          color: #667eea;
          border-radius: 6px;
          font-size: 18px;
          font-weight: bold;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .btn-editar-compra:active {
          background: rgba(102, 126, 234, 0.3);
          transform: scale(0.95);
        }

        .btn-excluir {
          width: 28px;
          height: 28px;
          flex-shrink: 0;
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

        /* DETALHES EM LINHA */
        .compra-detalhes-inline {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }

        .compra-detalhes-inline .descricao {
          flex: 1;
          font-size: 15px;
          font-weight: 600;
          color: var(--text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .compra-detalhes-inline .valores {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          flex-shrink: 0;
        }

        .compra-detalhes-inline .qtde {
          color: var(--text-secondary);
          font-weight: 600;
        }

        .compra-detalhes-inline .preco {
          color: var(--text-secondary);
        }

        .compra-detalhes-inline .total {
          color: #667eea;
          font-weight: 700;
          font-size: 14px;
        }

        /* LISTA DE FORNECEDORES */
        .lista-fornecedores {
          padding-top: 8px;
        }

        .btn-novo-fornecedor {
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
          margin-bottom: 16px;
        }

        .btn-novo-fornecedor:active {
          transform: scale(0.98);
        }

        .fornecedor-card {
          background: var(--card-bg);
          border-radius: 12px;
          padding: 14px;
          margin-bottom: 12px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.08);
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
        }

        .fornecedor-info {
          flex: 1;
          min-width: 0;
        }

        .fornecedor-nome {
          font-size: 16px;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 6px;
        }

        .fornecedor-detalhe {
          font-size: 13px;
          color: var(--text-secondary);
          margin-bottom: 4px;
          word-break: break-word;
        }

        .fornecedor-acoes {
          display: flex;
          gap: 8px;
          flex-shrink: 0;
        }

        .btn-editar {
          width: 36px;
          height: 36px;
          border: none;
          background: rgba(102, 126, 234, 0.1);
          color: #667eea;
          border-radius: 6px;
          font-size: 18px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .btn-editar:active {
          background: rgba(102, 126, 234, 0.2);
        }

        .btn-excluir-fornecedor {
          width: 36px;
          height: 36px;
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

        .btn-excluir-fornecedor:active {
          background: rgba(239, 68, 68, 0.2);
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
            grid-template-columns: 0.7fr 1fr 1fr;
            gap: 6px;
          }

          .form-group label {
            font-size: 12px;
          }

          .form-group input {
            padding: 10px 8px;
            font-size: 14px;
          }

          .total-display {
            font-size: 13px;
            padding: 10px 6px;
          }

          .total-dia-fixo {
            padding: 12px;
          }

          .total-dia-valor {
            font-size: 20px;
          }

          .compra-detalhes-inline {
            flex-direction: column;
            align-items: flex-start;
            gap: 8px;
          }

          .compra-detalhes-inline .descricao {
            white-space: normal;
          }

          .compra-detalhes-inline .valores {
            align-self: flex-end;
          }
        }
      `}</style>
    </AppShell>
  )
}
