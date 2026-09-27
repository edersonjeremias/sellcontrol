import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  getProdutos, criarProduto, atualizarProduto, desativarProduto, reativarProduto,
  getProximoCodigo, verificarCodigoExiste, formatMoney, parseMoney
} from '../../services/produtosService'
import { getListas } from '../../services/vendasService'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import AppShell from '../../components/ui/AppShell'
import AutocompleteInput from '../../components/ui/AutocompleteInput'
import './produtos.css'

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
    condicao: '', // Vazio por padrão, usuário escolhe
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
    condicao: p.condicao === 'Novo' ? 'N' : p.condicao === 'Usado' ? 'U' : p.condicao || '',
    custo: p.custo ? String(Math.round(p.custo)) : '',
    preco: p.preco ? String(Math.round(p.preco)) : '',
    preco_promocional: p.preco_promocional ? String(Math.round(p.preco_promocional)) : '',
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
  const [listas, setListas] = useState({ produtos: [], modelos: [], cores: [], marcas: [] })
  const [filtro, setFiltro] = useState('')
  const [mostrarInativos, setMostrarInativos] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pronto, setPronto] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [cols, setCols] = useState({
    genero: true,
    condicao: true,
    custo: true,
    preco_promocional: true,
  })

  const produtosRef = useRef(produtos)
  useEffect(() => { produtosRef.current = produtos }, [produtos])

  // Carrega configuração de colunas do localStorage
  useEffect(() => {
    if (!tenantId) return
    try {
      const saved = localStorage.getItem(`sc_cols_produtos_${tenantId}`)
      if (saved) setCols(JSON.parse(saved))
    } catch {}
  }, [tenantId])

  // Salva configuração de colunas
  useEffect(() => {
    if (!tenantId) return
    localStorage.setItem(`sc_cols_produtos_${tenantId}`, JSON.stringify(cols))
  }, [cols, tenantId])

  // Carrega produtos e listas
  useEffect(() => {
    async function carregar() {
      if (!tenantId) return
      setBusy(true)
      try {
        const [data, lst] = await Promise.all([
          getProdutos(tenantId, { ativo: !mostrarInativos }),
          getListas(tenantId)
        ])
        setProdutos(data.map(mapProduto))
        setListas(lst)
        setPronto(true)
      } catch (err) {
        console.error('Erro ao carregar:', err)
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
      const input = document.querySelector('#tabela-produtos tbody tr:first-child .col-codigo .cell-input')
      input?.focus()
    }, 100)
  }, [busy, tenantId])

  // Nova linha ao dar Enter no último campo (quantidade)
  const handleEnterNoQuantidade = useCallback(async () => {
    if (busy) return

    // Verifica se já existe linha vazia no topo
    const temLinhaVazia = produtosRef.current.some(pr =>
      pr.isNew && !pr.produto?.trim()
    )

    if (temLinhaVazia) {
      // Já tem linha vazia, apenas foca nela
      setTimeout(() => {
        const firstRow = document.querySelector('#tabela-produtos tbody tr:first-child')
        const produtoInput = firstRow?.querySelector('.col-produto .cell-input')
        produtoInput?.focus()
        document.querySelector('.tabela-scroll')?.scrollTo({ top: 0, behavior: 'smooth' })
      }, 50)
      return
    }

    // Busca próximo código automático
    const proximoCodigo = await getProximoCodigo(tenantId)

    setProdutos(prev => [novoProduto(String(proximoCodigo)), ...prev])

    // Foca no campo CÓDIGO da primeira linha (nova linha criada)
    setTimeout(() => {
      const firstRow = document.querySelector('#tabela-produtos tbody tr:first-child')
      const codigoInput = firstRow?.querySelector('.col-codigo .cell-input')
      codigoInput?.focus()
      // Scroll para o topo
      document.querySelector('.tabela-scroll')?.scrollTo({ top: 0, behavior: 'smooth' })
    }, 50)
  }, [busy, tenantId])

  // Atualiza campo
  const handleChange = useCallback((key, field, value) => {
    setProdutos(prev => prev.map(p => {
      if (p._key !== key) return p

      // Limpa formatação de valores (só números)
      if (field === 'custo' || field === 'preco' || field === 'preco_promocional') {
        value = value.replace(/\D/g, '') // Remove tudo que não é número
      }

      return { ...p, [field]: value }
    }))
  }, [])

  // Ao sair do campo PRODUTO, cria linha nova se tiver produto digitado
  const handleProdutoBlur = useCallback(async (key) => {
    const p = produtosRef.current.find(pr => pr._key === key)
    if (!p || !p.produto?.trim() || !p.isNew) return

    // Verifica se já existe linha vazia no topo
    const temLinhaVazia = produtosRef.current.some(pr =>
      pr.isNew && !pr.produto?.trim() && pr._key !== key
    )

    if (temLinhaVazia) {
      // Já tem linha vazia, não cria outra
      setTimeout(() => salvar(key), 300)
      return
    }

    // Produto preenchido - cria nova linha no topo
    const proximoCodigo = await getProximoCodigo(tenantId)
    setProdutos(prev => [novoProduto(String(proximoCodigo)), ...prev])

    // Salva automaticamente o produto atual
    setTimeout(() => salvar(key), 300)
  }, [tenantId, salvar])

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
    const existe = await verificarCodigoExiste(tenantId, p.codigo, p.id)
    if (existe) {
      showToast(`Código ${p.codigo} já existe!`, 'error')
      return
    }

    setBusy(true)
    try {
      // Converte letra para texto completo (ou vazio se não preenchido)
      const condicaoCompleta = p.condicao === 'N' ? 'Novo' : p.condicao === 'U' ? 'Usado' : ''

      const dados = {
        ...p,
        condicao: condicaoCompleta,
        custo: p.custo || '0',
        preco: p.preco || '0',
        preco_promocional: p.preco_promocional || '0',
      }

      if (p.isNew) {
        // Criar
        const novo = await criarProduto(tenantId, dados)
        setProdutos(prev => prev.map(pr =>
          pr._key === key ? mapProduto(novo) : pr
        ))
        showToast('Produto cadastrado!', 'success')
      } else {
        // Atualizar
        const atualizado = await atualizarProduto(p.id, dados)
        setProdutos(prev => prev.map(pr =>
          pr._key === key ? mapProduto(atualizado) : pr
        ))
        showToast('Produto atualizado!', 'success')
      }
    } catch (err) {
      console.error('Erro ao salvar:', err)
      showToast('Erro ao salvar produto', 'error')
    } finally {
      setBusy(false)
    }
  }, [produtos, tenantId, showToast])

  // Copiar produto
  const copiar = useCallback(async (key) => {
    const p = produtos.find(pr => pr._key === key)
    if (!p) return

    const proximoCodigo = await getProximoCodigo(tenantId)
    const copia = {
      ...novoProduto(String(proximoCodigo)),
      produto: p.produto,
      modelo: p.modelo,
      cor: p.cor,
      marca: p.marca,
      tamanho: p.tamanho,
      genero: p.genero,
      condicao: p.condicao,
      custo: p.custo,
      preco: p.preco,
      preco_promocional: p.preco_promocional,
    }

    setProdutos(prev => [copia, ...prev])
    showToast('Produto copiado!', 'success')
  }, [produtos, tenantId, showToast])

  // Excluir (desativa)
  const excluir = useCallback(async (key) => {
    const p = produtos.find(pr => pr._key === key)
    if (!p) return

    if (p.isNew) {
      // Remove da lista (ainda não foi salvo)
      setProdutos(prev => prev.filter(pr => pr._key !== key))
    } else {
      // Desativa no banco
      setBusy(true)
      try {
        await desativarProduto(p.id)
        setProdutos(prev => prev.filter(pr => pr._key !== key))
        showToast('Produto removido', 'success')
      } catch (err) {
        showToast('Erro ao remover produto', 'error')
      } finally {
        setBusy(false)
      }
    }
  }, [produtos, showToast])

  return (
    <AppShell title="Cadastro de Produtos">
      <div className="vendas-container">
        {/* Header */}
        <div className="vendas-header">
          <div className="busca-wrapper" style={{ flex: 1, maxWidth: '600px' }}>
            <input
              type="text"
              placeholder="Buscar produtos (código, nome, cor, marca...)"
              value={filtro}
              onChange={e => setFiltro(e.target.value)}
              className="filtro-rapido"
              style={{ width: '100%' }}
            />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#888', fontSize: '13px' }}>
            <input
              type="checkbox"
              checked={mostrarInativos}
              onChange={e => setMostrarInativos(e.target.checked)}
            />
            Inativos
          </label>

          <button className="btn-config" onClick={() => setShowSettings(!showSettings)} title="Configurações">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>

          <button onClick={novo} disabled={busy} className="btn-primary">
            + Novo
          </button>
        </div>

        {/* Modal de Configurações */}
        {showSettings && (
          <div className="modal-overlay" onClick={() => setShowSettings(false)}>
            <div className="modal-config" onClick={e => e.stopPropagation()}>
              <h3>Colunas Visíveis</h3>
              <label>
                <input type="checkbox" checked={cols.genero} onChange={e => setCols(c => ({ ...c, genero: e.target.checked }))} />
                Gênero
              </label>
              <label>
                <input type="checkbox" checked={cols.condicao} onChange={e => setCols(c => ({ ...c, condicao: e.target.checked }))} />
                Condição
              </label>
              <label>
                <input type="checkbox" checked={cols.custo} onChange={e => setCols(c => ({ ...c, custo: e.target.checked }))} />
                Custo
              </label>
              <label>
                <input type="checkbox" checked={cols.preco_promocional} onChange={e => setCols(c => ({ ...c, preco_promocional: e.target.checked }))} />
                Preço Promoção
              </label>
              <button onClick={() => setShowSettings(false)} className="btn-primary" style={{ marginTop: '16px' }}>
                Fechar
              </button>
            </div>
          </div>
        )}

        {/* Tabela */}
        <div className="tabela-scroll">
          <table id="tabela-produtos" className="tabela-vendas">
            <thead>
              <tr>
                <th className="th-codigo">Cód.</th>
                <th>Produto</th>
                <th>Modelo</th>
                {cols.genero && <th className="th-genero">Gên.</th>}
                <th>Cor</th>
                <th>Marca</th>
                <th className="th-tam">Tam.</th>
                {cols.condicao && <th className="th-condicao">Cond.</th>}
                {cols.custo && <th className="th-preco">Custo</th>}
                <th className="th-preco">Preço</th>
                {cols.preco_promocional && <th className="th-preco">Promo</th>}
                <th className="th-qtd">Qtd.</th>
                <th className="th-acoes">Ações</th>
              </tr>
            </thead>
            <tbody>
              {!pronto && (
                <tr>
                  <td colSpan={20} style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
                    Carregando produtos...
                  </td>
                </tr>
              )}

              {pronto && produtosFiltrados.length === 0 && (
                <tr>
                  <td colSpan={20} style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
                    {filtro ? 'Nenhum produto encontrado' : 'Clique em "+ Novo" para começar'}
                  </td>
                </tr>
              )}

              {produtosFiltrados.map(p => (
                <ProdutoRow
                  key={p._key}
                  produto={p}
                  listas={listas}
                  cols={cols}
                  onChange={handleChange}
                  onProdutoBlur={handleProdutoBlur}
                  onEnterNoQuantidade={handleEnterNoQuantidade}
                  onSalvar={salvar}
                  onCopiar={copiar}
                  onExcluir={excluir}
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
function ProdutoRow({ produto, listas, cols, onChange, onProdutoBlur, onEnterNoQuantidade, onSalvar, onCopiar, onExcluir }) {
  const p = produto
  const desabilitado = !p.ativo && !p.isNew

  // Navegação entre campos com Tab/Enter
  const navegarProximo = (e) => {
    if (e.key !== 'Enter' && e.key !== 'Tab') return
    e.preventDefault()

    const tr = e.target.closest('tr')
    if (!tr) return

    const inputs = Array.from(tr.querySelectorAll('input:not([disabled]), select:not([disabled])'))
    const currentIndex = inputs.indexOf(e.target)

    if (currentIndex >= 0 && currentIndex < inputs.length - 1) {
      inputs[currentIndex + 1]?.focus()
    }
  }

  // Detecta Enter no último campo (quantidade) para salvar e criar nova linha
  const handleQuantidadeKeyDown = async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      // Salva o produto atual antes de criar nova linha
      await onSalvar?.(p._key)
      // Aguarda um pouco para garantir que salvou
      setTimeout(() => {
        onEnterNoQuantidade?.()
      }, 100)
    } else if (e.key === 'Tab') {
      // Tab no último campo também salva e cria nova linha
      if (!e.shiftKey) {
        e.preventDefault()
        await onSalvar?.(p._key)
        setTimeout(() => {
          onEnterNoQuantidade?.()
        }, 100)
      }
    }
  }

  return (
    <tr className={p.isNew ? 'linha-nova' : ''} style={{ opacity: desabilitado ? 0.5 : 1 }}>
      {/* CÓDIGO */}
      <td className="col-codigo">
        <input
          className="cell-input"
          value={p.codigo}
          onChange={e => onChange(p._key, 'codigo', e.target.value)}
          onKeyDown={navegarProximo}
          disabled={desabilitado}
          placeholder="100"
        />
      </td>

      {/* PRODUTO */}
      <td className="col-produto">
        <AutocompleteInput
          className="cell-input"
          value={p.produto}
          list={listas.produtos}
          onChange={v => onChange(p._key, 'produto', v)}
          onBlur={() => onProdutoBlur(p._key)}
          disabled={desabilitado}
          placeholder="Nome do produto"
        />
      </td>

      {/* MODELO */}
      <td className="col-modelo">
        <AutocompleteInput
          className="cell-input"
          value={p.modelo}
          list={listas.modelos}
          onChange={v => onChange(p._key, 'modelo', v)}
          disabled={desabilitado}
        />
      </td>

      {/* GÊNERO */}
      {cols.genero && (
        <td className="col-genero">
          <select
            className="cell-input cell-select"
            value={p.genero}
            onChange={e => onChange(p._key, 'genero', e.target.value)}
            onKeyDown={navegarProximo}
            disabled={desabilitado}
          >
            <option value=""></option>
            <option value="M">M</option>
            <option value="F">F</option>
            <option value="U">U</option>
          </select>
        </td>
      )}

      {/* COR */}
      <td className="col-cor">
        <AutocompleteInput
          className="cell-input"
          value={p.cor}
          list={listas.cores}
          onChange={v => onChange(p._key, 'cor', v)}
          disabled={desabilitado}
        />
      </td>

      {/* MARCA */}
      <td className="col-marca">
        <AutocompleteInput
          className="cell-input"
          value={p.marca}
          list={listas.marcas}
          onChange={v => onChange(p._key, 'marca', v)}
          disabled={desabilitado}
        />
      </td>

      {/* TAMANHO */}
      <td className="col-tam">
        <input
          className="cell-input"
          value={p.tamanho}
          onChange={e => onChange(p._key, 'tamanho', e.target.value)}
          onKeyDown={navegarProximo}
          disabled={desabilitado}
        />
      </td>

      {/* CONDIÇÃO */}
      {cols.condicao && (
        <td className="col-condicao">
          <select
            className="cell-input cell-select"
            value={p.condicao}
            onChange={e => onChange(p._key, 'condicao', e.target.value)}
            onKeyDown={navegarProximo}
            disabled={desabilitado}
          >
            <option value=""></option>
            <option value="N">N</option>
            <option value="U">U</option>
          </select>
        </td>
      )}

      {/* CUSTO */}
      {cols.custo && (
        <td className="col-preco">
          <input
            className="cell-input"
            value={p.custo}
            onChange={e => onChange(p._key, 'custo', e.target.value)}
            onKeyDown={navegarProximo}
            placeholder="0"
            disabled={desabilitado}
            style={{ textAlign: 'right' }}
          />
        </td>
      )}

      {/* PREÇO */}
      <td className="col-preco">
        <input
          className="cell-input"
          value={p.preco}
          onChange={e => onChange(p._key, 'preco', e.target.value)}
          onKeyDown={navegarProximo}
          placeholder="0"
          disabled={desabilitado}
          style={{ textAlign: 'right' }}
        />
      </td>

      {/* PREÇO PROMOCIONAL */}
      {cols.preco_promocional && (
        <td className="col-preco">
          <input
            className="cell-input"
            value={p.preco_promocional}
            onChange={e => onChange(p._key, 'preco_promocional', e.target.value)}
            onKeyDown={navegarProximo}
            placeholder="0"
            disabled={desabilitado}
            style={{ textAlign: 'right' }}
          />
        </td>
      )}

      {/* QUANTIDADE */}
      <td className="col-qtd">
        <input
          type="number"
          className="cell-input"
          value={p.quantidade}
          onChange={e => onChange(p._key, 'quantidade', e.target.value)}
          onKeyDown={handleQuantidadeKeyDown}
          disabled={desabilitado}
          style={{ textAlign: 'center' }}
        />
      </td>

      {/* AÇÕES */}
      <td className="col-acoes">
        <div className="acoes-wrapper">
          {/* Salvar */}
          <button
            type="button"
            className="btn-action-sm send"
            title="Salvar"
            onClick={() => onSalvar(p._key)}
            disabled={desabilitado}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
            </svg>
          </button>

          {/* Copiar */}
          <button
            type="button"
            className="btn-action-sm copy"
            title="Copiar produto"
            onClick={() => onCopiar(p._key)}
            disabled={desabilitado}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>

          {/* Excluir */}
          <button
            type="button"
            className="btn-action-sm del"
            title="Excluir produto"
            onClick={() => onExcluir(p._key)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </td>
    </tr>
  )
}
