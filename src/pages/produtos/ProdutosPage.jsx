import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  getProdutos, criarProduto, atualizarProduto, desativarProduto, reativarProduto,
  getProximoCodigo, verificarCodigoExiste, formatMoney, parseMoney
} from '../../services/produtosService'
import { getListas } from '../../services/vendasService'
import { getConfig } from '../../services/configService'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import AppShell from '../../components/ui/AppShell'
import AutocompleteInput from '../../components/ui/AutocompleteInput'
import { formatarAoDigitar, parsearMoedaInput } from '../../utils/moeda'
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
    // Converte de reais (banco) para centavos formatados (ex: 139.90 -> "13990" -> "139,90")
    custo: p.custo ? formatarAoDigitar(String(Math.round(p.custo * 100))) : '',
    preco: p.preco ? formatarAoDigitar(String(Math.round(p.preco * 100))) : '',
    preco_promocional: p.preco_promocional ? formatarAoDigitar(String(Math.round(p.preco_promocional * 100))) : '',
    quantidade: p.quantidade ? String(p.quantidade) : '',
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
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [mostrarInativos, setMostrarInativos] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pronto, setPronto] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [produtoEditando, setProdutoEditando] = useState(null) // Modal mobile
  const [confirmarExclusao, setConfirmarExclusao] = useState(false) // Modal confirmação exclusão
  const [config, setConfig] = useState({
    produtos_codigo_automatico: false,
    produtos_proximo_codigo: 100,
    produtos_permitir_duplicado: false
  })
  const [cols, setCols] = useState({
    genero: true,
    condicao: true,
    custo: true,
    preco_promocional: true,
  })

  // Estados de paginação
  const [paginaAtual, setPaginaAtual] = useState(1)
  const [totalPaginas, setTotalPaginas] = useState(1)
  const [totalRegistros, setTotalRegistros] = useState(0)
  const itensPorPagina = 100

  // Estados de ordenação
  const [ordenarPor, setOrdenarPor] = useState(null) // 'preco' | 'quantidade' | 'codigo' | null
  const [ordenarDirecao, setOrdenarDirecao] = useState('asc') // 'asc' | 'desc'

  const produtosRef = useRef(produtos)
  useEffect(() => { produtosRef.current = produtos }, [produtos])

  // Refs para salvamento automático
  const saveTimerRef = useRef(null)
  const isSavingRef = useRef(false)

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

  // Carrega configurações
  useEffect(() => {
    if (!tenantId) return
    getConfig(tenantId).then(cfg => {
      if (cfg) {
        const novaConfig = {
          produtos_codigo_automatico: cfg.produtos_codigo_automatico || false,
          produtos_proximo_codigo: cfg.produtos_proximo_codigo || 100,
          produtos_permitir_duplicado: cfg.produtos_permitir_duplicado || false
        }
        console.log('🔧 Config de produtos carregada:', novaConfig)
        setConfig(novaConfig)
      }
    })
  }, [tenantId])

  // Carrega produtos e listas
  useEffect(() => {
    async function carregar() {
      if (!tenantId) return
      setBusy(true)
      try {
        const [resultado, lst] = await Promise.all([
          getProdutos(tenantId, {
            ativo: !mostrarInativos,
            busca: filtro.trim() || undefined,
            dataInicio: dataInicio || undefined,
            dataFim: dataFim || undefined,
            page: paginaAtual,
            limit: itensPorPagina
          }),
          getListas(tenantId)
        ])
        setProdutos(resultado.data.map(mapProduto))
        setTotalPaginas(resultado.totalPages)
        setTotalRegistros(resultado.total)
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
  }, [tenantId, mostrarInativos, filtro, dataInicio, dataFim, paginaAtual, showToast])

  // Filtro de busca (apenas remove deletados localmente)
  const produtosFiltrados = useMemo(() => {
    let resultado = produtos.filter(p => !p.deleted)

    // Aplica ordenação
    if (ordenarPor) {
      resultado = [...resultado].sort((a, b) => {
        let valorA, valorB

        if (ordenarPor === 'preco') {
          // Converte "139,90" para número 139.90
          valorA = parseFloat((a.preco || '0').replace(',', '.')) || 0
          valorB = parseFloat((b.preco || '0').replace(',', '.')) || 0
        } else if (ordenarPor === 'quantidade') {
          valorA = parseInt(a.quantidade) || 0
          valorB = parseInt(b.quantidade) || 0
        } else if (ordenarPor === 'codigo') {
          // Tenta converter para número, se não conseguir compara como string
          const numA = parseInt(a.codigo)
          const numB = parseInt(b.codigo)
          if (!isNaN(numA) && !isNaN(numB)) {
            valorA = numA
            valorB = numB
          } else {
            // Comparação alfabética
            return ordenarDirecao === 'asc'
              ? (a.codigo || '').localeCompare(b.codigo || '')
              : (b.codigo || '').localeCompare(a.codigo || '')
          }
        }

        if (ordenarDirecao === 'asc') {
          return valorA - valorB
        } else {
          return valorB - valorA
        }
      })
    }

    return resultado
  }, [produtos, ordenarPor, ordenarDirecao])

  // Toggle ordenação
  const toggleOrdenacao = (campo) => {
    if (ordenarPor === campo) {
      // Se já está ordenando por este campo, inverte a direção
      setOrdenarDirecao(ordenarDirecao === 'asc' ? 'desc' : 'asc')
    } else {
      // Se é um campo novo, ordena crescente
      setOrdenarPor(campo)
      setOrdenarDirecao('asc')
    }
  }

  // Salvamento automático com debounce
  const salvarAgora = useCallback(() => {
    // Limpa timer anterior
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
    }

    // Debounce de 300ms
    saveTimerRef.current = setTimeout(async () => {
      if (isSavingRef.current || busy) return

      // PRESERVA O FOCO antes de salvar
      const elementoAtivo = document.activeElement
      const ehInput = elementoAtivo?.tagName === 'INPUT' || elementoAtivo?.tagName === 'SELECT'
      const focusKey = ehInput ? elementoAtivo?.getAttribute('data-key') : null
      const focusField = ehInput ? elementoAtivo?.getAttribute('data-field') : null
      const cursorPos = ehInput ? elementoAtivo?.selectionStart : null

      // Filtra produtos que precisam ser salvos (não vazios e modificados)
      const produtosParaSalvar = produtosRef.current.filter(p =>
        !p.deleted &&
        p.produto?.trim() &&
        p.codigo?.trim()
      )

      if (produtosParaSalvar.length === 0) return

      isSavingRef.current = true

      try {
        for (const p of produtosParaSalvar) {
          // Verifica se código já existe (apenas para produtos novos E se não permitir duplicado)
          if (p.isNew && !config.produtos_permitir_duplicado) {
            const existe = await verificarCodigoExiste(tenantId, p.codigo, p.id)
            if (existe) {
              showToast(`Código ${p.codigo} já existe! Ative "Permitir duplicado" ou use outro código.`, 'error')
              continue
            }
          }

          // Converte letra para texto completo
          const condicaoCompleta = p.condicao === 'N' ? 'Novo' : p.condicao === 'U' ? 'Usado' : ''

          // Converte valores formatados para reais
          const custoEmCentavos = parsearMoedaInput(p.custo || '0')
          const precoEmCentavos = parsearMoedaInput(p.preco || '0')
          const promoEmCentavos = parsearMoedaInput(p.preco_promocional || '0')

          const dados = {
            ...p,
            condicao: condicaoCompleta,
            custo: parseInt(custoEmCentavos || 0) / 100,
            preco: parseInt(precoEmCentavos || 0) / 100,
            preco_promocional: parseInt(promoEmCentavos || 0) / 100,
          }

          if (p.isNew) {
            // Criar
            const novo = await criarProduto(tenantId, dados)
            setProdutos(prev => prev.map(pr =>
              pr._key === p._key ? mapProduto(novo) : pr
            ))
          } else {
            // Atualizar
            const atualizado = await atualizarProduto(p.id, dados)
            setProdutos(prev => prev.map(pr =>
              pr._key === p._key ? mapProduto(atualizado) : pr
            ))
          }
        }

        // RESTAURA O FOCO depois de salvar
        if (focusKey && focusField) {
          requestAnimationFrame(() => {
            const input = document.querySelector(`[data-key="${focusKey}"][data-field="${focusField}"]`)
            if (input) {
              input.focus()
              if (cursorPos !== null && input.setSelectionRange) {
                input.setSelectionRange(cursorPos, cursorPos)
              }
            }
          })
        }
      } catch (err) {
        console.error('Erro no salvamento automático:', err)
      } finally {
        isSavingRef.current = false
      }
    }, 300)
  }, [busy, tenantId, config, showToast])

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

    // Se código automático, busca próximo código
    let codigoInicial = ''

    console.log('➕ Criando novo produto. Config:', {
      automatico: config.produtos_codigo_automatico,
      proximo_codigo: config.produtos_proximo_codigo
    })

    if (config.produtos_codigo_automatico) {
      let proximoCodigo = config.produtos_proximo_codigo || 100

      // Verifica o maior código em memória (produtos não salvos)
      const codigosEmMemoria = produtosRef.current
        .map(pr => parseInt(pr.codigo))
        .filter(c => !isNaN(c))
        .sort((a, b) => b - a)

      if (codigosEmMemoria.length > 0 && codigosEmMemoria[0] >= proximoCodigo) {
        proximoCodigo = codigosEmMemoria[0] + 1
      }

      codigoInicial = String(proximoCodigo)
      console.log('✅ Código automático ativado. Código gerado:', codigoInicial)
    } else {
      console.log('❌ Código automático desativado. Campo vazio.')
    }

    const produto = novoProduto(codigoInicial)

    if (isMobile) {
      // Mobile: adiciona no array E abre modal
      setProdutos(prev => [produto, ...prev])
      setProdutoEditando(produto)
      return
    }

    // Desktop: cria linha na tabela
    setProdutos(prev => [produto, ...prev])

    setTimeout(() => {
      const input = document.querySelector('#tabela-produtos tbody tr:first-child .col-produto .cell-input')
      input?.focus()
    }, 100)
  }, [busy, tenantId, config])

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

    // Se código automático, busca próximo código
    let codigoInicial = ''

    if (config.produtos_codigo_automatico) {
      let proximoCodigo = config.produtos_proximo_codigo || 100

      // Verifica o maior código em memória (produtos não salvos)
      const codigosEmMemoria = produtosRef.current
        .map(pr => parseInt(pr.codigo))
        .filter(c => !isNaN(c))
        .sort((a, b) => b - a)

      if (codigosEmMemoria.length > 0 && codigosEmMemoria[0] >= proximoCodigo) {
        proximoCodigo = codigosEmMemoria[0] + 1
      }

      codigoInicial = String(proximoCodigo)
    }

    setProdutos(prev => [novoProduto(codigoInicial), ...prev])

    // Foca no campo PRODUTO da primeira linha (nova linha criada)
    setTimeout(() => {
      const firstRow = document.querySelector('#tabela-produtos tbody tr:first-child')
      const produtoInput = firstRow?.querySelector('.col-produto .cell-input')
      produtoInput?.focus()
      // Scroll para o topo
      document.querySelector('.tabela-scroll')?.scrollTo({ top: 0, behavior: 'smooth' })
    }, 50)
  }, [busy, tenantId, config])

  // Atualiza campo
  const handleChange = useCallback((key, field, value) => {
    setProdutos(prev => prev.map(p => {
      if (p._key !== key) return p

      // Formata valores monetários enquanto digita (ex: "13990" -> "139,90")
      if (field === 'custo' || field === 'preco' || field === 'preco_promocional') {
        value = formatarAoDigitar(value)
      }

      // Limita quantidade a 3 dígitos
      if (field === 'quantidade') {
        value = value.replace(/\D/g, '') // Remove tudo que não é número
        if (value.length > 3) value = value.slice(0, 3) // Max 999
      }

      return { ...p, [field]: value }
    }))

    // NÃO salva automaticamente no campo código (causa cursor jump)
    // Código só salva no onBlur
    if (field !== 'codigo') {
      salvarAgora()
    }
  }, [salvarAgora])

  // Ao sair do campo PRODUTO, cria linha nova se tiver produto digitado
  // REMOVIDO: não cria mais linha automaticamente ao sair do campo produto
  // Nova linha só é criada ao dar Enter no campo QUANTIDADE
  const handleProdutoBlur = useCallback((key) => {
    // Salva automaticamente quando sair do campo (com debounce)
    salvarAgora()
  }, [salvarAgora])

  // Ao sair do campo CÓDIGO, salva automaticamente
  const handleCodigoBlur = useCallback((key) => {
    salvarAgora()
  }, [salvarAgora])

  // Salvar produto
  const salvar = useCallback(async (key) => {
    const p = produtosRef.current.find(pr => pr._key === key)
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

    // Verifica se código já existe (apenas se não permitir duplicado)
    if (!config.produtos_permitir_duplicado) {
      const existe = await verificarCodigoExiste(tenantId, p.codigo, p.id)
      if (existe) {
        showToast(`Código ${p.codigo} já existe!`, 'error')
        return
      }
    }

    setBusy(true)
    try {
      // Converte letra para texto completo (ou vazio se não preenchido)
      const condicaoCompleta = p.condicao === 'N' ? 'Novo' : p.condicao === 'U' ? 'Usado' : ''

      // Converte valores formatados (ex: "139,90") para centavos (13990) e depois para reais (139.90)
      const custoEmCentavos = parsearMoedaInput(p.custo || '0')
      const precoEmCentavos = parsearMoedaInput(p.preco || '0')
      const promoEmCentavos = parsearMoedaInput(p.preco_promocional || '0')

      const dados = {
        ...p,
        condicao: condicaoCompleta,
        custo: parseInt(custoEmCentavos || 0) / 100, // Converte centavos para reais como número
        preco: parseInt(precoEmCentavos || 0) / 100,
        preco_promocional: parseInt(promoEmCentavos || 0) / 100,
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
  }, [produtos, tenantId, showToast, config])

  // Copiar produto
  const copiar = useCallback(async (key) => {
    const p = produtos.find(pr => pr._key === key)
    if (!p) return

    // Se código automático, busca próximo código
    let codigoInicial = ''

    if (config.produtos_codigo_automatico) {
      let proximoCodigo = config.produtos_proximo_codigo || 100

      // Verifica o maior código em memória (produtos não salvos)
      const codigosEmMemoria = produtos
        .map(pr => parseInt(pr.codigo))
        .filter(c => !isNaN(c))
        .sort((a, b) => b - a)

      if (codigosEmMemoria.length > 0 && codigosEmMemoria[0] >= proximoCodigo) {
        proximoCodigo = codigosEmMemoria[0] + 1
      }

      codigoInicial = String(proximoCodigo)
    }

    const copia = {
      ...novoProduto(codigoInicial),
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
  }, [produtos, tenantId, showToast, config])

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
        {/* Header com Título e Controles */}
        <div style={{ padding: '2px 24px 4px' }}>
          {/* Desktop Layout */}
          <div className="desktop-only">
            {/* Primeira linha: Título + Busca + Controles */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
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
                  onChange={e => {
                    setFiltro(e.target.value)
                    setPaginaAtual(1)
                  }}
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
                    onChange={e => {
                      setMostrarInativos(e.target.checked)
                      setPaginaAtual(1)
                    }}
                  />
                  Inativos
                </label>

                <button onClick={() => setShowSettings(!showSettings)} title="Configurações" style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                </button>

                <button onClick={novo} disabled={busy} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: 'var(--blue)', color: '#171717', fontWeight: 600, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  + Novo
                </button>
              </div>
            </div>

            {/* Segunda linha: Filtros de Data */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#888', fontSize: '13px', whiteSpace: 'nowrap' }}>
                Data inicial:
                <input
                  type="date"
                  value={dataInicio}
                  onChange={e => {
                    setDataInicio(e.target.value)
                    setPaginaAtual(1)
                  }}
                  style={{
                    padding: '6px 10px',
                    background: '#2a2a2a',
                    border: '1px solid var(--border-light)',
                    borderRadius: 6,
                    color: '#e0e0e0',
                    fontSize: '13px'
                  }}
                />
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#888', fontSize: '13px', whiteSpace: 'nowrap' }}>
                Data final:
                <input
                  type="date"
                  value={dataFim}
                  onChange={e => {
                    setDataFim(e.target.value)
                    setPaginaAtual(1)
                  }}
                  style={{
                    padding: '6px 10px',
                    background: '#2a2a2a',
                    border: '1px solid var(--border-light)',
                    borderRadius: 6,
                    color: '#e0e0e0',
                    fontSize: '13px'
                  }}
                />
              </label>

              {(dataInicio || dataFim) && (
                <button
                  onClick={() => {
                    setDataInicio('')
                    setDataFim('')
                    setPaginaAtual(1)
                  }}
                  style={{
                    padding: '6px 12px',
                    background: '#444',
                    border: 'none',
                    borderRadius: 6,
                    color: '#e0e0e0',
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  Limpar Datas
                </button>
              )}
            </div>
          </div>

          {/* Mobile Layout */}
          <div className="mobile-only">
            {/* Linha 1: Título + Engrenagem + Botão Novo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#e0e0e0', flex: 1 }}>
                Cadastro de Produtos
              </h1>

              <button onClick={() => setShowSettings(!showSettings)} title="Configurações" style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
              </button>

              <button onClick={novo} disabled={busy} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: 'var(--blue)', color: '#171717', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                + Novo
              </button>
            </div>

            {/* Linha 2: Busca (largura total) */}
            <div style={{ marginBottom: '8px' }}>
              <input
                type="text"
                placeholder="Buscar produtos..."
                value={filtro}
                onChange={e => {
                  setFiltro(e.target.value)
                  setPaginaAtual(1)
                }}
                className="filtro-rapido"
                style={{ width: '100%', fontSize: '14px', padding: '8px 12px' }}
              />
            </div>

            {/* Linha 3: Inativos + Filtros de Data */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#888', whiteSpace: 'nowrap' }}>
                <input
                  type="checkbox"
                  checked={mostrarInativos}
                  onChange={e => {
                    setMostrarInativos(e.target.checked)
                    setPaginaAtual(1)
                  }}
                />
                Inativos
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#888', whiteSpace: 'nowrap' }}>
                Dt in:
                <input
                  type="date"
                  value={dataInicio}
                  onChange={e => {
                    setDataInicio(e.target.value)
                    setPaginaAtual(1)
                  }}
                  style={{
                    padding: '4px 6px',
                    background: '#2a2a2a',
                    border: '1px solid var(--border-light)',
                    borderRadius: 4,
                    color: '#e0e0e0',
                    fontSize: '12px',
                    width: '110px'
                  }}
                />
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#888', whiteSpace: 'nowrap' }}>
                Dt fi:
                <input
                  type="date"
                  value={dataFim}
                  onChange={e => {
                    setDataFim(e.target.value)
                    setPaginaAtual(1)
                  }}
                  style={{
                    padding: '4px 6px',
                    background: '#2a2a2a',
                    border: '1px solid var(--border-light)',
                    borderRadius: 4,
                    color: '#e0e0e0',
                    fontSize: '12px',
                    width: '110px'
                  }}
                />
              </label>

              {(dataInicio || dataFim) && (
                <button
                  onClick={() => {
                    setDataInicio('')
                    setDataFim('')
                    setPaginaAtual(1)
                  }}
                  style={{
                    padding: '4px 8px',
                    background: '#444',
                    border: 'none',
                    borderRadius: 4,
                    color: '#e0e0e0',
                    fontSize: '11px',
                    cursor: 'pointer'
                  }}
                >
                  Limpar
                </button>
              )}
            </div>
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
                  <th>Produto</th>
                  <th>Modelo</th>
                  {cols.genero && <th className="th-genero">Gên.</th>}
                  <th>Cor</th>
                  <th>Marca</th>
                  <th className="th-tam">Tam.</th>
                  {cols.condicao && <th className="th-condicao">Cond.</th>}
                  {cols.custo && <th className="th-preco">Custo</th>}
                  <th
                    className="th-preco"
                    onClick={() => toggleOrdenacao('preco')}
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                  >
                    Preço {ordenarPor === 'preco' && (ordenarDirecao === 'asc' ? '▲' : '▼')}
                  </th>
                  <th
                    className="th-codigo"
                    onClick={() => toggleOrdenacao('codigo')}
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                  >
                    Cód. {ordenarPor === 'codigo' && (ordenarDirecao === 'asc' ? '▲' : '▼')}
                  </th>
                  {cols.preco_promocional && <th className="th-preco">Promo</th>}
                  <th
                    className="th-qtd"
                    onClick={() => toggleOrdenacao('quantidade')}
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                  >
                    Qtd. {ordenarPor === 'quantidade' && (ordenarDirecao === 'asc' ? '▲' : '▼')}
                  </th>
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

        {/* Paginação Desktop */}
        {pronto && totalRegistros > 0 && (
          <div className="desktop-only paginacao-desktop" style={{
            padding: '16px 24px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '8px',
            borderTop: '1px solid var(--border-light)',
            background: 'var(--bg-main)'
          }}>
            {/* Primeira */}
            <button
              onClick={() => setPaginaAtual(1)}
              disabled={paginaAtual === 1}
              style={{
                padding: '6px 12px',
                background: paginaAtual === 1 ? '#2a2a2a' : '#3a3a3a',
                border: 'none',
                borderRadius: 4,
                color: paginaAtual === 1 ? '#666' : '#e0e0e0',
                fontSize: '13px',
                cursor: paginaAtual === 1 ? 'not-allowed' : 'pointer'
              }}
            >
              Primeira
            </button>

            {/* Anterior */}
            <button
              onClick={() => setPaginaAtual(prev => Math.max(1, prev - 1))}
              disabled={paginaAtual === 1}
              style={{
                padding: '6px 12px',
                background: paginaAtual === 1 ? '#2a2a2a' : '#3a3a3a',
                border: 'none',
                borderRadius: 4,
                color: paginaAtual === 1 ? '#666' : '#e0e0e0',
                fontSize: '13px',
                cursor: paginaAtual === 1 ? 'not-allowed' : 'pointer'
              }}
            >
              Anterior
            </button>

            {/* Número da Página */}
            <select
              value={paginaAtual}
              onChange={e => setPaginaAtual(Number(e.target.value))}
              style={{
                padding: '6px 12px',
                background: '#3a3a3a',
                border: '1px solid var(--border-light)',
                borderRadius: 4,
                color: '#e0e0e0',
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              {Array.from({ length: totalPaginas }, (_, i) => i + 1).map(pagina => (
                <option key={pagina} value={pagina}>
                  {pagina}
                </option>
              ))}
            </select>

            {/* Próxima */}
            <button
              onClick={() => setPaginaAtual(prev => Math.min(totalPaginas, prev + 1))}
              disabled={paginaAtual === totalPaginas}
              style={{
                padding: '6px 12px',
                background: paginaAtual === totalPaginas ? '#2a2a2a' : '#3a3a3a',
                border: 'none',
                borderRadius: 4,
                color: paginaAtual === totalPaginas ? '#666' : '#e0e0e0',
                fontSize: '13px',
                cursor: paginaAtual === totalPaginas ? 'not-allowed' : 'pointer'
              }}
            >
              Próxima
            </button>

            {/* Última */}
            <button
              onClick={() => setPaginaAtual(totalPaginas)}
              disabled={paginaAtual === totalPaginas}
              style={{
                padding: '6px 12px',
                background: paginaAtual === totalPaginas ? '#2a2a2a' : '#3a3a3a',
                border: 'none',
                borderRadius: 4,
                color: paginaAtual === totalPaginas ? '#666' : '#e0e0e0',
                fontSize: '13px',
                cursor: paginaAtual === totalPaginas ? 'not-allowed' : 'pointer'
              }}
            >
              Última
            </button>

            {/* Informação de Registros */}
            <span style={{ marginLeft: '16px', color: '#888', fontSize: '13px', whiteSpace: 'nowrap' }}>
              {((paginaAtual - 1) * itensPorPagina) + 1} - {Math.min(paginaAtual * itensPorPagina, totalRegistros)} de {totalRegistros}
            </span>
          </div>
        )}

        {/* Paginação Mobile */}
        {pronto && totalRegistros > 0 && (
          <div className="mobile-only" style={{
            padding: '12px 16px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '6px',
            borderTop: '1px solid var(--border-light)',
            background: 'var(--bg-main)',
            fontSize: '12px'
          }}>
            {/* Anterior */}
            <button
              onClick={() => setPaginaAtual(prev => Math.max(1, prev - 1))}
              disabled={paginaAtual === 1}
              style={{
                padding: '6px 10px',
                background: paginaAtual === 1 ? '#2a2a2a' : '#3a3a3a',
                border: 'none',
                borderRadius: 4,
                color: paginaAtual === 1 ? '#666' : '#e0e0e0',
                fontSize: '12px',
                cursor: paginaAtual === 1 ? 'not-allowed' : 'pointer'
              }}
            >
              Anterior
            </button>

            {/* Número da Página */}
            <select
              value={paginaAtual}
              onChange={e => setPaginaAtual(Number(e.target.value))}
              style={{
                padding: '6px 10px',
                background: '#3a3a3a',
                border: '1px solid var(--border-light)',
                borderRadius: 4,
                color: '#e0e0e0',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              {Array.from({ length: totalPaginas }, (_, i) => i + 1).map(pagina => (
                <option key={pagina} value={pagina}>
                  {pagina}
                </option>
              ))}
            </select>

            {/* Próxima */}
            <button
              onClick={() => setPaginaAtual(prev => Math.min(totalPaginas, prev + 1))}
              disabled={paginaAtual === totalPaginas}
              style={{
                padding: '6px 10px',
                background: paginaAtual === totalPaginas ? '#2a2a2a' : '#3a3a3a',
                border: 'none',
                borderRadius: 4,
                color: paginaAtual === totalPaginas ? '#666' : '#e0e0e0',
                fontSize: '12px',
                cursor: paginaAtual === totalPaginas ? 'not-allowed' : 'pointer'
              }}
            >
              Próxima
            </button>

            {/* Informação de Registros */}
            <span style={{ color: '#888', fontSize: '11px', whiteSpace: 'nowrap' }}>
              {((paginaAtual - 1) * itensPorPagina) + 1}-{Math.min(paginaAtual * itensPorPagina, totalRegistros)} de {totalRegistros}
            </span>
          </div>
        )}

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
                {/* Código Produto Modelo Cor Marca (Tamanho) Preço Estoque */}
                <div style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--text-header)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontWeight: 700, color: 'var(--blue)' }}>#{p.codigo}</span>
                  <span style={{ fontWeight: 700 }}>{p.produto || 'Produto'}</span>
                  {p.modelo && <span>{p.modelo}</span>}
                  {p.cor && <span>{p.cor}</span>}
                  {p.marca && <span>{p.marca}</span>}
                  {p.tamanho && <span>({p.tamanho})</span>}
                  <span style={{ fontWeight: 700, color: 'var(--green)' }}>R$ {p.preco || '0,00'}</span>
                  <span style={{ color: 'var(--muted)' }}>Estoque: {p.quantidade || 0}</span>
                  {!p.ativo && <span style={{ color: 'var(--red)', fontWeight: 600 }}>· INATIVO</span>}
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

              {/* Modelo e Marca - SEMPRE VISÍVEIS */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
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
              </div>

              {/* Cor e Tamanho - SEMPRE VISÍVEIS */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
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
              </div>

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
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Custo (R$)</label>
                    <input
                      type="text"
                      value={produtoEditando.custo}
                      onChange={e => setProdutoEditando({...produtoEditando, custo: formatarAoDigitar(e.target.value)})}
                      style={{ width: '100%', padding: '10px 12px', background: '#2a2a2a', border: '1px solid var(--border-light)', borderRadius: 6, color: 'var(--text-header)', fontSize: 14 }}
                      placeholder="0,00"
                    />
                  </div>
                )}
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Preço (R$) *</label>
                  <input
                    type="text"
                    value={produtoEditando.preco}
                    onChange={e => setProdutoEditando({...produtoEditando, preco: formatarAoDigitar(e.target.value)})}
                    style={{ width: '100%', padding: '10px 12px', background: '#2a2a2a', border: '1px solid var(--border-light)', borderRadius: 6, color: 'var(--green)', fontSize: 14, fontWeight: 700 }}
                    placeholder="0,00"
                  />
                </div>
              </div>

              {/* Preço Promocional e Quantidade */}
              <div style={{ display: 'grid', gridTemplateColumns: cols.preco_promocional ? '1fr 1fr' : '1fr', gap: 8, marginBottom: 12 }}>
                {cols.preco_promocional && (
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Preço Promocional (R$)</label>
                    <input
                      type="text"
                      value={produtoEditando.preco_promocional}
                      onChange={e => setProdutoEditando({...produtoEditando, preco_promocional: formatarAoDigitar(e.target.value)})}
                      style={{ width: '100%', padding: '10px 12px', background: '#2a2a2a', border: '1px solid var(--border-light)', borderRadius: 6, color: 'var(--text-header)', fontSize: 14 }}
                      placeholder="0,00"
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
                  <>
                    <button
                      onClick={() => setConfirmarExclusao(true)}
                      style={{ flex: 1, padding: 12, background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                    >
                      🗑️ Excluir
                    </button>
                    <button
                      onClick={async () => {
                        await copiar(produtoEditando._key)
                        setProdutoEditando(null)
                      }}
                      style={{ flex: 1, padding: 12, background: '#666', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                    >
                      📋 Duplicar
                    </button>
                  </>
                )}
                {!produtoEditando.ativo && (
                  <button
                    onClick={async () => {
                      await reativar(produtoEditando._key)
                      setProdutoEditando(null)
                    }}
                    style={{ flex: 1, padding: 12, background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                  >
                    ♻️ Reativar
                  </button>
                )}
                <button
                  onClick={async () => {
                    if (!produtoEditando.produto || !produtoEditando.preco) {
                      alert('Preencha Produto e Preço')
                      return
                    }
                    // Atualiza produtosRef PRIMEIRO (síncrono)
                    produtosRef.current = produtosRef.current.map(pr =>
                      pr._key === produtoEditando._key ? produtoEditando : pr
                    )
                    // Depois atualiza o estado
                    setProdutos(produtosRef.current)
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

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO */}
      {confirmarExclusao && produtoEditando && (
        <div className="modal-overlay" onClick={() => setConfirmarExclusao(false)}>
          <div className="modal-card" style={{ maxWidth: 400, padding: 24 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: 'var(--text-header)' }}>Confirmar Exclusão</h3>
            <p style={{ margin: '0 0 24px 0', fontSize: 14, color: 'var(--muted)', lineHeight: 1.5 }}>
              Tem certeza que deseja excluir o produto <strong style={{ color: 'var(--text-header)' }}>{produtoEditando.produto}</strong>?
              <br />Esta ação não pode ser desfeita.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setConfirmarExclusao(false)}
                style={{ flex: 1, padding: 12, background: '#444', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  await excluir(produtoEditando._key)
                  setConfirmarExclusao(false)
                  setProdutoEditando(null)
                }}
                style={{ flex: 1, padding: 12, background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
              >
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}

// ─── LINHA DA TABELA ──
// ═══════════════════════════════════════════════════════════════
// FUNÇÃO AUXILIAR: Copiar para área de transferência
// ═══════════════════════════════════════════════════════════════
function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text)
  }
  return new Promise((res, rej) => {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.cssText = 'position:fixed;left:-999999px;top:-999999px'
    document.body.appendChild(ta)
    ta.focus(); ta.select()
    document.execCommand('copy') ? res() : rej()
    ta.remove()
  })
}

function ProdutoRow({ produto, listas, cols, onChange, onProdutoBlur, onEnterNoQuantidade, onSalvar, onCopiar, onExcluir, onReativar }) {
  const p = produto
  const desabilitado = !p.ativo && !p.isNew
  const [txtCopiado, setTxtCopiado] = useState(false)

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

  // Função para copiar texto formatado da linha
  const copiarTexto = (e) => {
    e.stopPropagation()
    const partes = []
    if (p.codigo?.trim())      partes.push(`Código: ${p.codigo.trim()}`)
    if (p.produto?.trim())     partes.push(p.produto.trim())
    if (p.modelo?.trim())      partes.push(p.modelo.trim())
    if (p.cor?.trim())         partes.push(p.cor.trim())
    if (p.marca?.trim())       partes.push(p.marca.trim())
    if (p.tamanho?.trim())     partes.push(`(${p.tamanho.trim()})`)
    if (p.preco?.trim())       partes.push(`R$ ${p.preco}`)
    const texto = partes.join(' ').replace(/\s+/g, ' ')
    copyToClipboard(texto)
      .then(() => { setTxtCopiado(true); setTimeout(() => setTxtCopiado(false), 1000) })
      .catch(() => {})
  }

  return (
    <tr className={p.isNew ? 'linha-nova' : ''} style={{ opacity: desabilitado ? 0.5 : 1 }}>
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
          data-key={p._key}
          data-field="produto"
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
          data-key={p._key}
          data-field="modelo"
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
            data-key={p._key}
            data-field="genero"
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
          data-key={p._key}
          data-field="cor"
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
          data-key={p._key}
          data-field="marca"
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
          data-key={p._key}
          data-field="tamanho"
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
            data-key={p._key}
            data-field="condicao"
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
            type="text"
            className="cell-input"
            value={p.custo}
            onChange={e => onChange(p._key, 'custo', e.target.value)}
            onKeyDown={navegarProximo}
            placeholder="0,00"
            disabled={desabilitado}
            style={{ textAlign: 'right' }}
            data-key={p._key}
            data-field="custo"
          />
        </td>
      )}

      {/* PREÇO */}
      <td className="col-preco">
        <input
          type="text"
          className="cell-input"
          value={p.preco}
          onChange={e => onChange(p._key, 'preco', e.target.value)}
          onKeyDown={navegarProximo}
          placeholder="0,00"
          disabled={desabilitado}
          style={{ textAlign: 'right' }}
          data-key={p._key}
          data-field="preco"
        />
      </td>

      {/* CÓDIGO */}
      <td className="col-codigo">
        <input
          className="cell-input"
          value={p.codigo}
          onChange={e => onChange(p._key, 'codigo', e.target.value)}
          onBlur={() => handleCodigoBlur(p._key)}
          onKeyDown={navegarProximo}
          disabled={desabilitado}
          placeholder="100"
          data-key={p._key}
          data-field="codigo"
        />
      </td>

      {/* PREÇO PROMOCIONAL */}
      {cols.preco_promocional && (
        <td className="col-preco">
          <input
            type="text"
            className="cell-input"
            value={p.preco_promocional}
            onChange={e => onChange(p._key, 'preco_promocional', e.target.value)}
            onKeyDown={navegarProximo}
            placeholder="0,00"
            disabled={desabilitado}
            style={{ textAlign: 'right' }}
            data-key={p._key}
            data-field="preco_promocional"
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
          data-key={p._key}
          data-field="quantidade"
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

          {/* Copiar texto da linha */}
          <button
            type="button"
            className="btn-action-sm copy-txt"
            title="Copiar texto da linha"
            onClick={copiarTexto}
            disabled={desabilitado}
            style={txtCopiado ? { color: 'var(--green)' } : undefined}
          >
            {txtCopiado
              ? <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              : <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
            }
          </button>

          {/* Copiar produto (duplicar) */}
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
