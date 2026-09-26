import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  getProdutos, criarProduto, atualizarProduto, desativarProduto, reativarProduto,
  getProximoCodigo, verificarCodigoExiste, formatMoney, parseMoney
} from '../../services/produtosService'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import AppShell from '../../components/ui/AppShell'

// ─── HELPERS ──
function gerarId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

function novoProduto(codigo = '') {
  return {
    _key: gerarId(),
    id: null,
    codigo,
    produto: '',
    modelo: '',
    cor: '',
    marca: '',
    tamanho: '',
    genero: '',
    condicao: 'Novo',
    custo: '',
    preco: '',
    preco_promocional: '',
    quantidade: '0',
    ativo: true,
    isNew: true,
    deleted: false,
  }
}

function mapProduto(p) {
  return {
    _key: p.id || gerarId(),
    id: p.id,
    codigo: p.codigo || '',
    produto: p.produto || '',
    modelo: p.modelo || '',
    cor: p.cor || '',
    marca: p.marca || '',
    tamanho: p.tamanho || '',
    genero: p.genero || '',
    condicao: p.condicao || 'Novo',
    custo: formatMoney(p.custo),
    preco: formatMoney(p.preco),
    preco_promocional: formatMoney(p.preco_promocional),
    quantidade: String(p.quantidade || 0),
    ativo: p.ativo !== false,
    isNew: false,
    deleted: false,
  }
}

// ─── COMPONENT ──
export default function ProdutosPage() {
  const { showToast } = useApp()
  const { profile } = useAuth()
  const tenantId = profile?.tenant_id

  const [produtos, setProdutos] = useState([])
  const [filtro, setFiltro] = useState('')
  const [mostrarInativos, setMostrarInativos] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pronto, setPronto] = useState(false)

  // Carrega produtos ao abrir a página
  useEffect(() => {
    async function carregar() {
      if (!tenantId) return
      setBusy(true)
      try {
        const data = await getProdutos(tenantId, { ativo: !mostrarInativos })
        setProdutos(data.map(mapProduto))
        setPronto(true)
      } catch (err) {
        console.error('Erro ao carregar produtos:', err)
        showToast('Erro ao carregar produtos', 'error')
      } finally {
        setBusy(false)
      }
    }
    carregar()
  }, [tenantId, mostrarInativos, showToast])

  // Filtro de busca
  const produtosFiltrados = useMemo(() => {
    if (!filtro.trim()) return produtos

    const termos = filtro.toLowerCase().split(',').map(t => t.trim()).filter(Boolean)

    return produtos.filter(p => {
      if (p.deleted) return false

      const txt = [
        p.codigo, p.produto, p.modelo, p.cor, p.marca,
        p.tamanho, p.genero, p.condicao
      ].join(' ').toLowerCase()

      return termos.every(t => txt.includes(t))
    })
  }, [produtos, filtro])

  // Novo produto
  const novo = useCallback(async () => {
    if (busy) return

    // Busca próximo código automático
    const proximoCodigo = await getProximoCodigo(tenantId)

    setProdutos(prev => [novoProduto(String(proximoCodigo)), ...prev])

    setTimeout(() => {
      const input = document.querySelector('#tabela-produtos tbody tr:first-child .cell-input')
      input?.focus()
    }, 100)
  }, [busy, tenantId])

  // Atualiza campo
  const handleChange = useCallback((key, field, value) => {
    setProdutos(prev => prev.map(p => {
      if (p._key !== key) return p

      // Limpa formatação de valores
      if (field === 'custo' || field === 'preco' || field === 'preco_promocional') {
        value = value.replace(/[^\d,]/g, '')
      }

      return { ...p, [field]: value }
    }))
  }, [])

  // Salvar produto
  const salvar = useCallback(async (key) => {
    const p = produtos.find(pr => pr._key === key)
    if (!p) return

    // Validações
    if (!p.produto?.trim()) {
      showToast('Preencha o nome do produto', 'error')
      return
    }

    if (!p.codigo?.trim()) {
      showToast('Preencha o código do produto', 'error')
      return
    }

    // Verifica se código já existe
    if (p.isNew || p.codigo !== p.codigoOriginal) {
      const existe = await verificarCodigoExiste(tenantId, p.codigo, p.id)
      if (existe) {
        showToast(`Código ${p.codigo} já existe!`, 'error')
        return
      }
    }

    setBusy(true)
    try {
      if (p.isNew) {
        // Criar
        const novo = await criarProduto(tenantId, p)
        setProdutos(prev => prev.map(pr =>
          pr._key === key ? mapProduto(novo) : pr
        ))
        showToast('Produto cadastrado!', 'success')
      } else {
        // Atualizar
        const atualizado = await atualizarProduto(p.id, p)
        setProdutos(prev => prev.map(pr =>
          pr._key === key ? mapProduto(atualizado) : pr
        ))
        showToast('Produto atualizado!', 'success')
      }
    } catch (err) {
      showToast('Erro ao salvar produto', 'error')
    } finally {
      setBusy(false)
    }
  }, [produtos, tenantId, showToast])

  // Desativar/Reativar
  const toggleAtivo = useCallback(async (key) => {
    const p = produtos.find(pr => pr._key === key)
    if (!p || !p.id) return

    setBusy(true)
    try {
      if (p.ativo) {
        await desativarProduto(p.id)
        showToast('Produto desativado', 'success')
      } else {
        await reativarProduto(p.id)
        showToast('Produto reativado', 'success')
      }

      // Atualiza estado local
      setProdutos(prev => prev.map(pr =>
        pr._key === key ? { ...pr, ativo: !pr.ativo } : pr
      ))
    } catch (err) {
      showToast('Erro ao alterar status', 'error')
    } finally {
      setBusy(false)
    }
  }, [produtos, showToast])

  // Excluir (marca como deleted, depois salva desativando)
  const excluir = useCallback((key) => {
    const p = produtos.find(pr => pr._key === key)
    if (!p) return

    if (p.isNew) {
      // Remove da lista (ainda não foi salvo)
      setProdutos(prev => prev.filter(pr => pr._key !== key))
    } else {
      // Marca como deleted
      setProdutos(prev => prev.map(pr =>
        pr._key === key ? { ...pr, deleted: true } : pr
      ))
      toggleAtivo(key)
    }
  }, [produtos, toggleAtivo])

  return (
    <AppShell title="Cadastro de Produtos">
      <div style={{ padding: '20px' }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '20px',
          alignItems: 'center',
          flexWrap: 'wrap'
        }}>
          <input
            type="text"
            placeholder="Buscar produtos (código, nome, cor, marca...)"
            value={filtro}
            onChange={e => setFiltro(e.target.value)}
            style={{
              flex: 1,
              minWidth: '300px',
              padding: '10px 14px',
              background: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: '6px',
              color: '#e0e0e0',
              fontSize: '14px',
            }}
          />

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#888' }}>
            <input
              type="checkbox"
              checked={mostrarInativos}
              onChange={e => setMostrarInativos(e.target.checked)}
            />
            Mostrar Inativos
          </label>

          <button
            onClick={novo}
            disabled={busy}
            style={{
              padding: '10px 20px',
              background: '#4a9eff',
              border: 'none',
              borderRadius: '6px',
              color: '#fff',
              fontWeight: 600,
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.6 : 1,
            }}
          >
            + Novo Produto
          </button>
        </div>

        {/* Tabela */}
        <div style={{
          background: '#0d0d0d',
          borderRadius: '8px',
          overflow: 'auto',
          maxHeight: 'calc(100vh - 200px)',
        }}>
          <table id="tabela-produtos" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#1a1a1a', position: 'sticky', top: 0, zIndex: 1 }}>
                <th style={thStyle}>Código</th>
                <th style={thStyle}>Produto</th>
                <th style={thStyle}>Modelo</th>
                <th style={thStyle}>Cor</th>
                <th style={thStyle}>Marca</th>
                <th style={thStyle}>Tam.</th>
                <th style={thStyle}>Gênero</th>
                <th style={thStyle}>Condição</th>
                <th style={thStyle}>Custo</th>
                <th style={thStyle}>Preço</th>
                <th style={thStyle}>Promoção</th>
                <th style={thStyle}>Qtd.</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {!pronto && (
                <tr>
                  <td colSpan={14} style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
                    Carregando produtos...
                  </td>
                </tr>
              )}

              {pronto && produtosFiltrados.length === 0 && (
                <tr>
                  <td colSpan={14} style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
                    {filtro ? 'Nenhum produto encontrado' : 'Clique em "+ Novo Produto" para começar'}
                  </td>
                </tr>
              )}

              {produtosFiltrados.map(p => (
                <ProdutoRow
                  key={p._key}
                  produto={p}
                  onChange={handleChange}
                  onSalvar={salvar}
                  onExcluir={excluir}
                  onToggleAtivo={toggleAtivo}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  )
}

// ─── LINHA DA TABELA ──
function ProdutoRow({ produto, onChange, onSalvar, onExcluir, onToggleAtivo }) {
  const p = produto
  const desabilitado = !p.ativo && !p.isNew

  return (
    <tr
      style={{
        opacity: desabilitado ? 0.5 : 1,
        background: p.isNew ? 'rgba(74, 158, 255, 0.05)' : 'transparent',
      }}
    >
      <td style={tdStyle}>
        <input
          className="cell-input"
          value={p.codigo}
          onChange={e => onChange(p._key, 'codigo', e.target.value)}
          disabled={desabilitado}
          style={inputStyle}
        />
      </td>

      <td style={tdStyle}>
        <input
          className="cell-input"
          value={p.produto}
          onChange={e => onChange(p._key, 'produto', e.target.value)}
          placeholder="Nome do produto"
          disabled={desabilitado}
          style={inputStyle}
        />
      </td>

      <td style={tdStyle}>
        <input
          value={p.modelo}
          onChange={e => onChange(p._key, 'modelo', e.target.value)}
          disabled={desabilitado}
          style={inputStyle}
        />
      </td>

      <td style={tdStyle}>
        <input
          value={p.cor}
          onChange={e => onChange(p._key, 'cor', e.target.value)}
          disabled={desabilitado}
          style={inputStyle}
        />
      </td>

      <td style={tdStyle}>
        <input
          value={p.marca}
          onChange={e => onChange(p._key, 'marca', e.target.value)}
          disabled={desabilitado}
          style={inputStyle}
        />
      </td>

      <td style={tdStyle}>
        <input
          value={p.tamanho}
          onChange={e => onChange(p._key, 'tamanho', e.target.value)}
          disabled={desabilitado}
          style={{ ...inputStyle, width: '60px' }}
        />
      </td>

      <td style={tdStyle}>
        <select
          value={p.genero}
          onChange={e => onChange(p._key, 'genero', e.target.value)}
          disabled={desabilitado}
          style={inputStyle}
        >
          <option value="">-</option>
          <option value="M">Masculino</option>
          <option value="F">Feminino</option>
          <option value="U">Unissex</option>
        </select>
      </td>

      <td style={tdStyle}>
        <select
          value={p.condicao}
          onChange={e => onChange(p._key, 'condicao', e.target.value)}
          disabled={desabilitado}
          style={inputStyle}
        >
          <option value="Novo">Novo</option>
          <option value="Usado">Usado</option>
        </select>
      </td>

      <td style={tdStyle}>
        <input
          value={p.custo}
          onChange={e => onChange(p._key, 'custo', e.target.value)}
          placeholder="0,00"
          disabled={desabilitado}
          style={{ ...inputStyle, width: '80px', textAlign: 'right' }}
        />
      </td>

      <td style={tdStyle}>
        <input
          value={p.preco}
          onChange={e => onChange(p._key, 'preco', e.target.value)}
          placeholder="0,00"
          disabled={desabilitado}
          style={{ ...inputStyle, width: '80px', textAlign: 'right' }}
        />
      </td>

      <td style={tdStyle}>
        <input
          value={p.preco_promocional}
          onChange={e => onChange(p._key, 'preco_promocional', e.target.value)}
          placeholder="0,00"
          disabled={desabilitado}
          style={{ ...inputStyle, width: '80px', textAlign: 'right' }}
        />
      </td>

      <td style={tdStyle}>
        <input
          type="number"
          value={p.quantidade}
          onChange={e => onChange(p._key, 'quantidade', e.target.value)}
          disabled={desabilitado}
          style={{ ...inputStyle, width: '60px', textAlign: 'center' }}
        />
      </td>

      <td style={tdStyle}>
        <span style={{
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '11px',
          fontWeight: 600,
          background: p.ativo ? '#1a4d2e' : '#4a1a1a',
          color: p.ativo ? '#4ade80' : '#f87171',
        }}>
          {p.ativo ? 'ATIVO' : 'INATIVO'}
        </span>
      </td>

      <td style={tdStyle}>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={() => onSalvar(p._key)}
            disabled={desabilitado}
            title="Salvar"
            style={btnStyle('#4ade80')}
          >
            💾
          </button>

          {!p.isNew && (
            <button
              onClick={() => onToggleAtivo(p._key)}
              title={p.ativo ? 'Desativar' : 'Reativar'}
              style={btnStyle(p.ativo ? '#f59e0b' : '#4ade80')}
            >
              {p.ativo ? '⏸️' : '▶️'}
            </button>
          )}

          <button
            onClick={() => onExcluir(p._key)}
            title="Excluir"
            style={btnStyle('#ef4444')}
          >
            🗑️
          </button>
        </div>
      </td>
    </tr>
  )
}

// ─── ESTILOS ──
const thStyle = {
  padding: '12px 8px',
  textAlign: 'left',
  fontSize: '12px',
  fontWeight: 600,
  color: '#888',
  borderBottom: '1px solid #222',
  whiteSpace: 'nowrap',
}

const tdStyle = {
  padding: '8px',
  borderBottom: '1px solid #1a1a1a',
}

const inputStyle = {
  width: '100%',
  padding: '6px 8px',
  background: '#1a1a1a',
  border: '1px solid #333',
  borderRadius: '4px',
  color: '#e0e0e0',
  fontSize: '13px',
}

const btnStyle = (color) => ({
  padding: '4px 8px',
  background: 'transparent',
  border: `1px solid ${color}`,
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '14px',
  transition: 'all 0.2s',
})
