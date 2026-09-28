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
    quantidade: '', // Vazio por padrão
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
  const [produtoEditando, setProdutoEditando] = useState(null) // Modal mobile
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

    // Detecta mobile
    const isMobile = window.innerWidth <= 768

    // Mobile: verifica se já tem modal aberto
    if (isMobile && produtoEditando) {
      showToast('Salve ou feche o produto atual antes de criar novo', 'error')
      return
    }

    // Desktop: verifica se já tem produto não salvo
    const temNaoSalvo = produtosRef.current.some(pr => pr.isNew && !pr.id)
    if (!isMobile && temNaoSalvo) {
      showToast('Salve ou exclua o produto em branco antes de criar novo', 'error')
      return
    }

    // Busca o maior código do banco
    let proximoCodigo = await getProximoCodigo(tenantId)

    // Verifica o maior código em memória (produtos não salvos)
    const codigosEmMemoria = produtosRef.current
      .map(pr => parseInt(pr.codigo))
      .filter(c => !isNaN(c))
      .sort((a, b) => b - a)

    if (codigosEmMemoria.length > 0 && codigosEmMemoria[0] >= proximoCodigo) {
      proximoCodigo = codigosEmMemoria[0] + 1
    }

    const produto = novoProduto(String(proximoCodigo))

    if (isMobile) {
      // Mobile: adiciona no array E abre modal
      setProdutos(prev => [produto, ...prev])
      setProdutoEditando(produto)
      return
    }

    // Desktop: cria linha na tabela
    setProdutos(prev => [produto, ...prev])

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

    // Busca o maior código do banco
    let proximoCodigo = await getProximoCodigo(tenantId)

    // Verifica o maior código em memória (produtos não salvos)
    const codigosEmMemoria = produtosRef.current
      .map(pr => parseInt(pr.codigo))
      .filter(c => !isNaN(c))
      .sort((a, b) => b - a)

    if (codigosEmMemoria.length > 0 && codigosEmMemoria[0] >= proximoCodigo) {
      proximoCodigo = codigosEmMemoria[0] + 1
    }

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

      // Limpa formatação de valores (só números) e limita a 4 dígitos
      if (field === 'custo' || field === 'preco' || field === 'preco_promocional') {
        value = value.replace(/\D/g, '') // Remove tudo que não é número
        if (value.length > 4) value = value.slice(0, 4) // Max 9999
      }

      // Limita quantidade a 3 dígitos
      if (field === 'quantidade') {
        value = value.replace(/\D/g, '') // Remove tudo que não é número
        if (value.length > 3) value = value.slice(0, 3) // Max 999
      }

      return { ...p, [field]: value }
    }))
  }, [])

  // Ao sair do campo PRODUTO, cria linha nova se tiver produto digitado
  // REMOVIDO: não cria mais linha automaticamente ao sair do campo produto
  // Nova linha só é criada ao dar Enter no campo QUANTIDADE
  const handleProdutoBlur = useCallback(() => {
    // Função vazia - mantida para não quebrar a interface
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

    // Busca o maior código do banco
    let proximoCodigo = await getProximoCodigo(tenantId)

    // Verifica o maior código em memória (produtos não salvos)
    const codigosEmMemoria = produtos
      .map(pr => parseInt(pr.codigo))
      .filter(c => !isNaN(c))
      .sort((a, b) => b - a)

    if (codigosEmMemoria.length > 0 && codigosEmMemoria[0] >= proximoCodigo) {
      proximoCodigo = codigosEmMemoria[0] + 1
    }

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

  // Reativar produto
  const reativar = useCallback(async (key) => {
    const p = produtos.find(pr => pr._key === key)
    if (!p || !p.id) return

    setBusy(true)
    try {
      await reativarProduto(p.id)
      setProdutos(prev => prev.map(pr => pr._key === key ? { ...pr, ativo: true } : pr))
      showToast('Produto reativado!', 'success')
    } catch (err) {
      showToast('Erro ao reativar produto', 'error')
    } finally {
      setBusy(false)
    }
  }, [produtos, showToast])

  return (
    <AppShell>
      <div className="vendas-container">
        {/* Header com Título e Controles na mesma linha */}
        <div style={{ padding: '4px 24px 6px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Título */}
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: '#e0e0e0', whiteSpace: 'nowrap' }}>
            Cadastro de Produtos
          </h1>

          {/* Busca */}
          <div style={{ flex: 1, maxWidth: '600px' }}>
            <input
              type="text"
              placeholder="Buscar produtos (código, nome, cor, marca...)"
              value={filtro}
              onChange={e => setFiltro(e.target.value)}
              className="filtro-rapido"
              style={{ width: '100%' }}
            />
          </div>

          {/* Grupo: Checkbox Inativos + Engrenagem + Botão Novo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#888', fontSize: '13px', whiteSpace: 'nowrap' }}>
              <input
                type="checkbox"
                checked={mostrarInativos}
                onChange={e => setMostrarInativos(e.target.checked)}
              />
              Inativos
            </label>

            {/* Botão Configurações SEM BORDA */}
            <button onClick={() => setShowSettings(!showSettings)} title="Configurações" style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>

            {/* Botão Novo - compacto */}
            <button onClick={novo} disabled={busy} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: 'var(--blue)', color: '#171717', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              + Novo
            </button>
          </div>
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
          <div>
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
                  onReativar={reativar}
                />
              ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* CARDS MOBILE (só aparece em telas pequenas) */}
        <div className="mobile-only">
          {produtosFiltrados.length === 0 ? (
            <div className="mobile-empty">
              {filtro ? 'Nenhum produto encontrado' : 'Clique em "+ Novo" para começar'}
            </div>
          ) : (
            produtosFiltrados.map(p => (
              <div
                key={p._key}
                className={`produto-card-mobile ${!p.ativo ? 'inativo' : ''}`}
                onClick={() => setProdutoEditando(p)}
              >
                <div className="card-header">
                  <div className="card-titulo">
                    {p.produto || 'Nome do produto'}
                    {p.modelo && <div style={{ fontWeight: 400, fontSize: 12, marginTop: 2 }}>{p.modelo}</div>}
                  </div>
                  <div className="card-preco">R$ {p.preco || 0}</div>
                </div>
                <div className="card-detalhes">
                  {p.marca && <span>{p.marca}</span>}
                  {p.cor && <span> · {p.cor}</span>}
                  {p.tamanho && <span> · Tam {p.tamanho}</span>}
                  {!p.ativo && <span style={{ color: 'var(--red)', marginLeft: 8 }}>INATIVO</span>}
                </div>
                <div className="card-footer">
                  <div className="card-codigo">#{p.codigo}</div>
                  <div className="card-qtd">Estoque: {p.quantidade || 0}</div>
                </div>
              </div>
            ))
          )}
        </div>

      </div>

      {/* MODAL MOBILE DE EDIÇÃO COMPLETO */}
      {produtoEditando && (
        <div className="modal-overlay" onClick={() => setProdutoEditando(null)}>
          <div className="modal-card" style={{ maxWidth: 500, maxHeight: '95vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border-light)' }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>{produtoEditando.isNew ? '✨ Novo Produto' : '✏️ Editar Produto'}</h3>
              <button onClick={() => setProdutoEditando(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 24, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            <div className="modal-body" style={{ padding: '16px' }}>

              {/* Código */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Código</label>
                <input
                  value={produtoEditando.codigo}
                  onChange={e => setProdutoEditando({...produtoEditando, codigo: e.target.value})}
                  style={{ width: '100%', padding: '10px 12px', background: '#2a2a2a', border: '1px solid var(--border-light)', borderRadius: 6, color: 'var(--text-header)', fontSize: 14 }}
                  placeholder="100"
                />
              </div>

              {/* Produto */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Produto *</label>
                <input
                  list="lista-produtos"
                  value={produtoEditando.produto}
                  onChange={e => setProdutoEditando({...produtoEditando, produto: e.target.value})}
                  style={{ width: '100%', padding: '10px 12px', background: '#2a2a2a', border: '1px solid var(--border-light)', borderRadius: 6, color: 'var(--text-header)', fontSize: 14 }}
                  placeholder="Nome do produto"
                />
                <datalist id="lista-produtos">
                  {listas.produtos?.map(item => <option key={item} value={item} />)}
                </datalist>
              </div>

              {/* Modelo e Marca */}
              {(cols.modelo || cols.marca) && (
                <div style={{ display: 'grid', gridTemplateColumns: cols.modelo && cols.marca ? '1fr 1fr' : '1fr', gap: 8, marginBottom: 12 }}>
                  {cols.modelo && (
                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Modelo</label>
                      <input
                        list="lista-modelos"
                        value={produtoEditando.modelo}
                        onChange={e => setProdutoEditando({...produtoEditando, modelo: e.target.value})}
                        style={{ width: '100%', padding: '10px 12px', background: '#2a2a2a', border: '1px solid var(--border-light)', borderRadius: 6, color: 'var(--text-header)', fontSize: 14 }}
                      />
                      <datalist id="lista-modelos">
                        {listas.modelos?.map(item => <option key={item} value={item} />)}
                      </datalist>
                    </div>
                  )}
                  {cols.marca && (
                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Marca</label>
                      <input
                        list="lista-marcas"
                        value={produtoEditando.marca}
                        onChange={e => setProdutoEditando({...produtoEditando, marca: e.target.value})}
                        style={{ width: '100%', padding: '10px 12px', background: '#2a2a2a', border: '1px solid var(--border-light)', borderRadius: 6, color: 'var(--text-header)', fontSize: 14 }}
                      />
                      <datalist id="lista-marcas">
                        {listas.marcas?.map(item => <option key={item} value={item} />)}
                      </datalist>
                    </div>
                  )}
                </div>
              )}

              {/* Cor e Tamanho */}
              {(cols.cor || cols.tamanho) && (
                <div style={{ display: 'grid', gridTemplateColumns: cols.cor && cols.tamanho ? '1fr 1fr' : '1fr', gap: 8, marginBottom: 12 }}>
                  {cols.cor && (
                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Cor</label>
                      <input
                        list="lista-cores"
                        value={produtoEditando.cor}
                        onChange={e => setProdutoEditando({...produtoEditando, cor: e.target.value})}
                        style={{ width: '100%', padding: '10px 12px', background: '#2a2a2a', border: '1px solid var(--border-light)', borderRadius: 6, color: 'var(--text-header)', fontSize: 14 }}
                      />
                      <datalist id="lista-cores">
                        {listas.cores?.map(item => <option key={item} value={item} />)}
                      </datalist>
                    </div>
                  )}
                  {cols.tamanho && (
                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Tamanho</label>
                      <input
                        list="lista-tamanhos"
                        value={produtoEditando.tamanho}
                        onChange={e => setProdutoEditando({...produtoEditando, tamanho: e.target.value})}
                        style={{ width: '100%', padding: '10px 12px', background: '#2a2a2a', border: '1px solid var(--border-light)', borderRadius: 6, color: 'var(--text-header)', fontSize: 14 }}
                      />
                      <datalist id="lista-tamanhos">
                        {listas.tamanhos?.map(item => <option key={item} value={item} />)}
                      </datalist>
                    </div>
                  )}
                </div>
              )}

              {/* Gênero e Condição */}
              {(cols.genero || cols.condicao) && (
                <div style={{ display: 'grid', gridTemplateColumns: cols.genero && cols.condicao ? '1fr 1fr' : '1fr', gap: 8, marginBottom: 12 }}>
                  {cols.genero && (
                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Gênero</label>
                      <select
                        value={produtoEditando.genero}
                        onChange={e => setProdutoEditando({...produtoEditando, genero: e.target.value})}
                        style={{ width: '100%', padding: '10px 12px', background: '#2a2a2a', border: '1px solid var(--border-light)', borderRadius: 6, color: 'var(--text-header)', fontSize: 14 }}
                      >
                        <option value="">-</option>
                        <option value="M">M</option>
                        <option value="F">F</option>
                        <option value="U">U</option>
                      </select>
                    </div>
                  )}
                  {cols.condicao && (
                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Condição</label>
                      <select
                        value={produtoEditando.condicao}
                        onChange={e => setProdutoEditando({...produtoEditando, condicao: e.target.value})}
                        style={{ width: '100%', padding: '10px 12px', background: '#2a2a2a', border: '1px solid var(--border-light)', borderRadius: 6, color: 'var(--text-header)', fontSize: 14 }}
                      >
                        <option value="">-</option>
                        <option value="Novo">Novo</option>
                        <option value="Usado">Usado</option>
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* Custo e Preço */}
              <div style={{ display: 'grid', gridTemplateColumns: cols.custo ? '1fr 1fr' : '1fr', gap: 8, marginBottom: 12 }}>
                {cols.custo && (
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Custo</label>
                    <input
                      type="number"
                      value={produtoEditando.custo}
                      onChange={e => setProdutoEditando({...produtoEditando, custo: e.target.value})}
                      style={{ width: '100%', padding: '10px 12px', background: '#2a2a2a', border: '1px solid var(--border-light)', borderRadius: 6, color: 'var(--text-header)', fontSize: 14 }}
                      placeholder="0"
                    />
                  </div>
                )}
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Preço *</label>
                  <input
                    type="number"
                    value={produtoEditando.preco}
                    onChange={e => setProdutoEditando({...produtoEditando, preco: e.target.value})}
                    style={{ width: '100%', padding: '10px 12px', background: '#2a2a2a', border: '1px solid var(--border-light)', borderRadius: 6, color: 'var(--green)', fontSize: 14, fontWeight: 700 }}
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Preço Promocional e Quantidade */}
              <div style={{ display: 'grid', gridTemplateColumns: cols.preco_promocional ? '1fr 1fr' : '1fr', gap: 8, marginBottom: 12 }}>
                {cols.preco_promocional && (
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Preço Promocional</label>
                    <input
                      type="number"
                      value={produtoEditando.preco_promocional}
                      onChange={e => setProdutoEditando({...produtoEditando, preco_promocional: e.target.value})}
                      style={{ width: '100%', padding: '10px 12px', background: '#2a2a2a', border: '1px solid var(--border-light)', borderRadius: 6, color: 'var(--text-header)', fontSize: 14 }}
                      placeholder="0"
                    />
                  </div>
                )}
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Quantidade</label>
                  <input
                    type="number"
                    value={produtoEditando.quantidade}
                    onChange={e => setProdutoEditando({...produtoEditando, quantidade: e.target.value})}
                    style={{ width: '100%', padding: '10px 12px', background: '#2a2a2a', border: '1px solid var(--border-light)', borderRadius: 6, color: 'var(--text-header)', fontSize: 14 }}
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Botões */}
              <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                {!produtoEditando.isNew && (
                  <button
                    onClick={() => { excluir(produtoEditando._key); setProdutoEditando(null) }}
                    style={{ flex: 1, padding: 12, background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                  >
                    🗑️ Excluir
                  </button>
                )}
                <button
                  onClick={async () => {
                    if (!produtoEditando.produto || !produtoEditando.preco) {
                      alert('Preencha Produto e Preço')
                      return
                    }
                    // Atualiza o produto no array antes de salvar
                    setProdutos(prev => {
                      const novoProdutos = prev.map(pr =>
                        pr._key === produtoEditando._key ? produtoEditando : pr
                      )
                      produtosRef.current = novoProdutos
                      return novoProdutos
                    })
                    // Agora salva
                    await salvar(produtoEditando._key)
                    setProdutoEditando(null)
                  }}
                  style={{ flex: 2, padding: 12, background: 'var(--green)', color: '#000', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
                >
                  💾 Salvar
                </button>
              </div>

            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}

// ─── LINHA DA TABELA ──
function ProdutoRow({ produto, listas, cols, onChange, onProdutoBlur, onEnterNoQuantidade, onSalvar, onCopiar, onExcluir, onReativar }) {
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

    // Shift+Tab = volta para campo anterior
    if (e.shiftKey && e.key === 'Tab') {
      if (currentIndex > 0) {
        inputs[currentIndex - 1]?.focus()
      }
      return
    }

    // Tab/Enter = próximo campo
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
          type="text"
          className="cell-input"
          value={p.quantidade}
          onChange={e => onChange(p._key, 'quantidade', e.target.value)}
          onKeyDown={handleQuantidadeKeyDown}
          disabled={desabilitado}
          placeholder=""
          maxLength={3}
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

          {/* Reativar (só aparece se inativo) */}
          {!p.ativo && !p.isNew && (
            <button
              type="button"
              className="btn-action-sm"
              style={{ color: '#81c995' }}
              title="Reativar produto"
              onClick={() => onReativar(p._key)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          )}

          {/* Excluir (só aparece se ativo) */}
          {p.ativo && (
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
          )}
        </div>
      </td>
    </tr>
  )
}
