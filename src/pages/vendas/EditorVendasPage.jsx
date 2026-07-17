import { useState, useEffect, useCallback, useRef } from 'react'
import { useApp } from '../../context/AppContext'
import AppShell from '../../components/ui/AppShell'
import AutocompleteInput from '../../components/ui/AutocompleteInput'
import { supabase } from '../../lib/supabase'

export default function EditorVendasPage() {
  const { tenant, empresaSelecionada } = useApp()

  // Fallback: pega tenant_id do empresaSelecionada se tenant não existir
  const tenant = tenant || empresaSelecionada?.id

  // Estados principais
  const [busy, setBusy] = useState(false)
  const [vendas, setVendas] = useState([])
  const [listas, setListas] = useState({ produtos: [], modelos: [], cores: [], marcas: [], clientes: [], lives: [] })

  // Filtros
  const [filtros, setFiltros] = useState({
    data: '',
    live: '',
    cliente: '',
    busca: ''
  })

  // Modais
  const [modalEdicao, setModalEdicao] = useState(null)
  const [modalFila, setModalFila] = useState(null)

  // Carrega listas para autocomplete
  useEffect(() => {
    if (!tenant) return
    carregarListas()
  }, [tenant])

  async function carregarListas() {
    try {
      const [produtosRes, modelosRes, coresRes, marcasRes, clientesRes, livesRes] = await Promise.all([
        supabase.from('produtos').select('nome').eq('tenant_id', tenant).order('nome'),
        supabase.from('modelos').select('nome').eq('tenant_id', tenant).order('nome'),
        supabase.from('cores').select('nome').eq('tenant_id', tenant).order('nome'),
        supabase.from('marcas').select('nome').eq('tenant_id', tenant).order('nome'),
        supabase.from('clientes').select('instagram').eq('tenant_id', tenant).order('instagram'),
        supabase.from('vendas').select('live_nome').eq('tenant_id', tenant).order('live_nome')
      ])

      setListas({
        produtos: produtosRes.data?.map(p => p.nome) || [],
        modelos: modelosRes.data?.map(m => m.nome) || [],
        cores: coresRes.data?.map(c => c.nome) || [],
        marcas: marcasRes.data?.map(m => m.nome) || [],
        clientes: clientesRes.data?.map(c => c.instagram) || [],
        lives: [...new Set(livesRes.data?.map(v => v.live_nome).filter(Boolean))] || []
      })
    } catch (error) {
      console.error('Erro ao carregar listas:', error)
    }
  }

  async function buscarVendas() {
    if (!tenant) {
      alert('⚠️ Tenant ID não encontrado')
      return
    }

    setBusy(true)

    try {
      let query = supabase
        .from('vendas')
        .select('*')
        .eq('tenant_id', tenant)
        .eq('status', 'ENVIADO')
        .order('data_live', { ascending: false })
        .limit(500)

      // Aplica filtros se preenchidos
      if (filtros.data) {
        query = query.eq('data_live', filtros.data)
      }
      if (filtros.live && filtros.live.trim()) {
        query = query.ilike('live_nome', `%${filtros.live.trim()}%`)
      }
      if (filtros.cliente && filtros.cliente.trim()) {
        query = query.ilike('cliente_nome', `%${filtros.cliente.trim()}%`)
      }

      const { data, error } = await query

      if (error) {
        console.error('Erro na query:', error)
        throw error
      }

      console.log('Vendas encontradas:', data?.length || 0)
      setVendas(data || [])

      if (!data || data.length === 0) {
        alert('ℹ️ Nenhuma venda encontrada com esses filtros')
      }
    } catch (error) {
      console.error('Erro ao buscar vendas:', error)
      alert('❌ Erro ao buscar vendas: ' + error.message)
    } finally {
      setBusy(false)
    }
  }

  function adicionarNovaLinha() {
    const novaVenda = {
      id: `temp-${Date.now()}`, // ID temporário
      _isNew: true,
      data_live: filtros.data || new Date().toISOString().split('T')[0],
      live_nome: filtros.live || '',
      codigo: '',
      produto: '',
      modelo: '',
      cor: '',
      marca: '',
      tamanho: '',
      preco: '',
      cliente_nome: filtros.cliente || '',
      fila1: '',
      fila2: '',
      fila3: ''
    }
    setVendas(prev => [novaVenda, ...prev])
  }

  function atualizarVenda(id, campo, valor) {
    setVendas(prev => prev.map(v => v.id === id ? { ...v, [campo]: valor } : v))
  }

  async function salvarTodasAlteracoes() {
    if (!tenant) return
    setBusy(true)

    try {
      const novas = vendas.filter(v => v._isNew)
      const editadas = vendas.filter(v => !v._isNew)

      // Insere novas
      if (novas.length > 0) {
        const { data: inserted, error: insertError } = await supabase
          .from('vendas')
          .insert(novas.map(v => ({
            tenant_id: tenant,
            data_live: v.data_live,
            live_nome: v.live_nome,
            codigo: v.codigo,
            produto: v.produto,
            modelo: v.modelo,
            cor: v.cor,
            marca: v.marca,
            tamanho: v.tamanho,
            preco: v.preco,
            cliente_nome: v.cliente_nome,
            fila1: v.fila1,
            fila2: v.fila2,
            fila3: v.fila3,
            status: 'ENVIADO'
          })))
          .select()

        if (insertError) throw insertError

        // Atualiza IDs temporários com IDs reais
        setVendas(prev => prev.map(v => {
          if (v._isNew) {
            const novoId = inserted?.find(i => i.produto === v.produto && i.cliente_nome === v.cliente_nome)
            return novoId ? { ...v, id: novoId.id, _isNew: false } : v
          }
          return v
        }))
      }

      // Atualiza editadas
      for (const venda of editadas) {
        const { error } = await supabase
          .from('vendas')
          .update({
            produto: venda.produto,
            modelo: venda.modelo,
            cor: venda.cor,
            marca: venda.marca,
            tamanho: venda.tamanho,
            preco: venda.preco,
            codigo: venda.codigo,
            cliente_nome: venda.cliente_nome,
            fila1: venda.fila1,
            fila2: venda.fila2,
            fila3: venda.fila3
          })
          .eq('id', venda.id)

        if (error) throw error
      }

      alert(`✅ Salvos: ${editadas.length} editados, ${novas.length} novos`)
    } catch (error) {
      console.error('Erro ao salvar alterações:', error)
      alert('❌ Erro ao salvar alterações')
    } finally {
      setBusy(false)
    }
  }

  async function salvarVenda(venda) {
    if (!tenant) return
    setBusy(true)

    try {
      const { error } = await supabase
        .from('vendas')
        .update({
          produto: venda.produto,
          modelo: venda.modelo,
          cor: venda.cor,
          marca: venda.marca,
          tamanho: venda.tamanho,
          preco: venda.preco,
          codigo: venda.codigo,
          cliente_nome: venda.cliente_nome,
          fila1: venda.fila1,
          fila2: venda.fila2,
          fila3: venda.fila3
        })
        .eq('id', venda.id)

      if (error) throw error

      // Atualiza a lista local
      setVendas(prev => prev.map(v => v.id === venda.id ? venda : v))
      setModalEdicao(null)
    } catch (error) {
      console.error('Erro ao salvar venda:', error)
    } finally {
      setBusy(false)
    }
  }

  async function excluirVenda(id) {
    if (!confirm('Tem certeza que deseja excluir esta venda?')) return
    setBusy(true)

    try {
      const { error } = await supabase.from('vendas').delete().eq('id', id)
      if (error) throw error

      setVendas(prev => prev.filter(v => v.id !== id))
      setModalEdicao(null)
    } catch (error) {
      console.error('Erro ao excluir venda:', error)
    } finally {
      setBusy(false)
    }
  }

  // Aplica filtro de busca inteligente (múltiplas palavras)
  const vendasFiltradas = vendas.filter(venda => {
    if (!filtros.busca) return true

    const palavras = filtros.busca.toLowerCase().replace(/,/g, ' ').split(' ').filter(p => p.trim())
    const textoVenda = [
      venda.produto,
      venda.modelo,
      venda.cor,
      venda.marca,
      venda.tamanho,
      venda.preco,
      venda.codigo,
      venda.cliente_nome
    ].join(' ').toLowerCase()

    return palavras.every(palavra => textoVenda.includes(palavra))
  })

  return (
    <AppShell flush={true}>
      {/* Datalists para autocomplete */}
      <datalist id="dlProdutos">{listas.produtos.map(p => <option key={p} value={p} />)}</datalist>
      <datalist id="dlModelos">{listas.modelos.map(m => <option key={m} value={m} />)}</datalist>
      <datalist id="dlCores">{listas.cores.map(c => <option key={c} value={c} />)}</datalist>
      <datalist id="dlMarcas">{listas.marcas.map(m => <option key={m} value={m} />)}</datalist>
      <datalist id="dlClientes">{listas.clientes.map(c => <option key={c} value={c} />)}</datalist>
      <datalist id="dlLives">{listas.lives.map(l => <option key={l} value={l} />)}</datalist>

      {/* TOOLBAR DE FILTROS - GRUDADO NO TOPO */}
      <div style={{
        background: 'var(--panel)',
        borderBottom: '1px solid var(--border-light)',
        padding: '14px 20px',
        margin: 0
      }}>
        {/* Linha com campos e botões inline */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {/* Data - campo menor */}
          <div style={{ flex: '0 0 140px' }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Data
            </label>
            <input
              type="date"
              value={filtros.data}
              onChange={e => setFiltros(f => ({ ...f, data: e.target.value }))}
              style={{
                width: '100%',
                height: 40,
                padding: '0 10px',
                background: 'var(--input-bg)',
                border: '1px solid var(--border-light)',
                borderRadius: 6,
                color: 'var(--input-text)',
                fontSize: 13
              }}
            />
          </div>

          {/* Live */}
          <div style={{ flex: '1 1 160px', minWidth: 160 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Live
            </label>
            <input
              type="text"
              value={filtros.live}
              onChange={e => setFiltros(f => ({ ...f, live: e.target.value }))}
              list="dlLives"
              placeholder="Buscar Live..."
              style={{
                width: '100%',
                height: 40,
                padding: '0 12px',
                background: 'var(--input-bg)',
                border: '1px solid var(--border-light)',
                borderRadius: 6,
                color: 'var(--input-text)',
                fontSize: 13
              }}
            />
          </div>

          {/* Cliente */}
          <div style={{ flex: '1 1 180px', minWidth: 180 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Cliente (Opcional)
            </label>
            <input
              type="text"
              value={filtros.cliente}
              onChange={e => setFiltros(f => ({ ...f, cliente: e.target.value }))}
              list="dlClientes"
              placeholder="Todos..."
              style={{
                width: '100%',
                height: 40,
                padding: '0 12px',
                background: 'var(--input-bg)',
                border: '1px solid var(--border-light)',
                borderRadius: 6,
                color: 'var(--input-text)',
                fontSize: 13
              }}
            />
          </div>

          {/* Busca Inteligente */}
          <div style={{ flex: '1 1 220px', minWidth: 220 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Busca Inteligente
            </label>
            <input
              type="text"
              value={filtros.busca}
              onChange={e => setFiltros(f => ({ ...f, busca: e.target.value }))}
              placeholder="Ex: vestido verde, calça P..."
              style={{
                width: '100%',
                height: 40,
                padding: '0 12px',
                background: 'var(--input-bg)',
                border: '1px solid var(--border-light)',
                borderRadius: 6,
                color: 'var(--input-text)',
                fontSize: 13
              }}
            />
          </div>

          {/* Botões - mesma altura */}
          <button
            onClick={adicionarNovaLinha}
            disabled={busy}
            style={{
              height: 40,
              padding: '0 18px',
              background: 'var(--bg)',
              color: 'var(--input-text)',
              border: '1px solid var(--border-light)',
              borderRadius: 6,
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            + Novo
          </button>
          <button
            onClick={buscarVendas}
            disabled={busy}
            style={{
              height: 40,
              padding: '0 24px',
              background: 'var(--green)',
              color: '#000',
              border: 'none',
              borderRadius: 6,
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            Buscar
          </button>
          <button
            onClick={salvarTodasAlteracoes}
            disabled={busy}
            style={{
              height: 40,
              padding: '0 24px',
              background: 'var(--blue)',
              color: '#000',
              border: 'none',
              borderRadius: 6,
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            Salvar
          </button>
        </div>
      </div>

      {/* CONTEÚDO - SEM PADDING SUPERIOR */}
      <div style={{ padding: '0' }}>

        {/* TABELA DE VENDAS - SEM MARGEM SUPERIOR */}
        <div style={{
          background: 'var(--panel)',
          border: '1px solid var(--border-light)',
          borderLeft: 'none',
          borderRight: 'none',
          borderTop: 'none',
          overflow: 'hidden'
        }}>
          {vendasFiltradas.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
              {vendas.length === 0 ? 'Nenhuma venda encontrada. Clique em Buscar.' : 'Nenhum resultado com esses filtros.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border-light)' }}>
                    <th style={{ padding: '12px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Data</th>
                    <th style={{ padding: '12px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Live</th>
                    <th style={{ padding: '12px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Cód.</th>
                    <th style={{ padding: '12px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Produto</th>
                    <th style={{ padding: '12px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Modelo</th>
                    <th style={{ padding: '12px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Cor</th>
                    <th style={{ padding: '12px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Marca</th>
                    <th style={{ padding: '12px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Tam.</th>
                    <th style={{ padding: '12px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Preço</th>
                    <th style={{ padding: '12px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Cliente</th>
                    <th style={{ padding: '12px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {vendasFiltradas.map(venda => (
                    <tr
                      key={venda.id}
                      style={{
                        borderBottom: '1px solid var(--border-light)',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '6px' }}>
                        <input
                          type="date"
                          value={venda.data_live || ''}
                          onChange={e => atualizarVenda(venda.id, 'data_live', e.target.value)}
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            background: 'var(--input-bg)',
                            border: '1px solid var(--border-light)',
                            borderRadius: 6,
                            color: 'var(--input-text)',
                            fontSize: 13
                          }}
                        />
                      </td>
                      <td style={{ padding: '6px' }}>
                        <input
                          value={venda.live_nome || ''}
                          onChange={e => atualizarVenda(venda.id, 'live_nome', e.target.value)}
                          list="dlLives"
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            background: 'var(--input-bg)',
                            border: '1px solid var(--border-light)',
                            borderRadius: 6,
                            color: 'var(--input-text)',
                            fontSize: 13
                          }}
                        />
                      </td>
                      <td style={{ padding: '6px' }}>
                        <input
                          value={venda.codigo || ''}
                          onChange={e => atualizarVenda(venda.id, 'codigo', e.target.value)}
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            background: 'var(--input-bg)',
                            border: '1px solid var(--border-light)',
                            borderRadius: 6,
                            color: 'var(--input-text)',
                            fontSize: 13,
                            textAlign: 'center'
                          }}
                        />
                      </td>
                      <td style={{ padding: '6px' }}>
                        <input
                          value={venda.produto || ''}
                          onChange={e => atualizarVenda(venda.id, 'produto', e.target.value)}
                          list="dlProdutos"
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            background: 'var(--input-bg)',
                            border: '1px solid var(--border-light)',
                            borderRadius: 6,
                            color: 'var(--input-text)',
                            fontSize: 13
                          }}
                        />
                      </td>
                      <td style={{ padding: '6px' }}>
                        <input
                          value={venda.modelo || ''}
                          onChange={e => atualizarVenda(venda.id, 'modelo', e.target.value)}
                          list="dlModelos"
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            background: 'var(--input-bg)',
                            border: '1px solid var(--border-light)',
                            borderRadius: 6,
                            color: 'var(--input-text)',
                            fontSize: 13
                          }}
                        />
                      </td>
                      <td style={{ padding: '6px' }}>
                        <input
                          value={venda.cor || ''}
                          onChange={e => atualizarVenda(venda.id, 'cor', e.target.value)}
                          list="dlCores"
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            background: 'var(--input-bg)',
                            border: '1px solid var(--border-light)',
                            borderRadius: 6,
                            color: 'var(--input-text)',
                            fontSize: 13
                          }}
                        />
                      </td>
                      <td style={{ padding: '6px' }}>
                        <input
                          value={venda.marca || ''}
                          onChange={e => atualizarVenda(venda.id, 'marca', e.target.value)}
                          list="dlMarcas"
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            background: 'var(--input-bg)',
                            border: '1px solid var(--border-light)',
                            borderRadius: 6,
                            color: 'var(--input-text)',
                            fontSize: 13
                          }}
                        />
                      </td>
                      <td style={{ padding: '6px' }}>
                        <input
                          value={venda.tamanho || ''}
                          onChange={e => atualizarVenda(venda.id, 'tamanho', e.target.value)}
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            background: 'var(--input-bg)',
                            border: '1px solid var(--border-light)',
                            borderRadius: 6,
                            color: 'var(--input-text)',
                            fontSize: 13,
                            textAlign: 'center'
                          }}
                        />
                      </td>
                      <td style={{ padding: '6px' }}>
                        <input
                          value={venda.preco || ''}
                          onChange={e => atualizarVenda(venda.id, 'preco', e.target.value)}
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            background: 'var(--input-bg)',
                            border: '1px solid var(--border-light)',
                            borderRadius: 6,
                            color: 'var(--green)',
                            fontSize: 13,
                            fontWeight: 700,
                            textAlign: 'right'
                          }}
                        />
                      </td>
                      <td style={{ padding: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input
                            value={venda.cliente_nome || ''}
                            onChange={e => atualizarVenda(venda.id, 'cliente_nome', e.target.value)}
                            list="dlClientes"
                            style={{
                              flex: 1,
                              padding: '8px 10px',
                              background: 'var(--input-bg)',
                              border: '1px solid var(--border-light)',
                              borderRadius: 6,
                              color: 'var(--input-text)',
                              fontSize: 13
                            }}
                          />
                          <button
                            onClick={() => setModalFila(venda)}
                            style={{
                              background: (venda.fila1 || venda.fila2 || venda.fila3) ? 'rgba(147,197,253,0.15)' : 'var(--bg)',
                              border: `1px solid ${(venda.fila1 || venda.fila2 || venda.fila3) ? 'var(--blue)' : 'var(--border-light)'}`,
                              color: (venda.fila1 || venda.fila2 || venda.fila3) ? 'var(--blue)' : 'var(--muted)',
                              borderRadius: 6,
                              width: 36,
                              height: 36,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                              <circle cx="9" cy="7" r="4"/>
                              <line x1="19" y1="8" x2="19" y2="14"/>
                              <line x1="22" y1="11" x2="16" y2="11"/>
                            </svg>
                          </button>
                        </div>
                      </td>
                      <td style={{ padding: '6px', textAlign: 'center' }}>
                        <button
                          onClick={() => setModalEdicao(venda)}
                          style={{
                            background: 'transparent',
                            color: 'var(--muted)',
                            border: '1px solid var(--border-light)',
                            borderRadius: 6,
                            padding: '6px 10px',
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          ...
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* MODAL DE EDIÇÃO */}
        {modalEdicao && (
          <ModalEdicao
            venda={modalEdicao}
            listas={listas}
            onSalvar={salvarVenda}
            onExcluir={excluirVenda}
            onFechar={() => setModalEdicao(null)}
            onAbrirFila={() => setModalFila(modalEdicao)}
          />
        )}

        {/* MODAL DE FILA */}
        {modalFila && (
          <ModalFila
            venda={modalFila}
            listas={listas}
            onSalvar={venda => {
              salvarVenda(venda)
              setModalFila(null)
              if (modalEdicao?.id === venda.id) setModalEdicao(venda)
            }}
            onFechar={() => setModalFila(null)}
          />
        )}
      </div>
    </AppShell>
  )
}

// MODAL DE EDIÇÃO
function ModalEdicao({ venda: vendaInicial, listas, onSalvar, onExcluir, onFechar, onAbrirFila }) {
  const [venda, setVenda] = useState(vendaInicial)

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 20
      }}
      onClick={onFechar}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--border-light)',
          borderRadius: 12,
          maxWidth: 500,
          width: '100%',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-light)', background: 'var(--bg)' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Editar Venda</h3>
        </div>

        {/* Body */}
        <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase' }}>
                Código
              </label>
              <input
                value={venda.codigo || ''}
                onChange={e => setVenda({ ...venda, codigo: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: 'var(--input-bg)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 8,
                  color: 'var(--input-text)',
                  fontSize: 14
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase' }}>
                Preço
              </label>
              <input
                value={venda.preco || ''}
                onChange={e => setVenda({ ...venda, preco: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: 'var(--input-bg)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 8,
                  color: 'var(--input-text)',
                  fontSize: 14
                }}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase' }}>
                Produto
              </label>
              <AutocompleteInput
                value={venda.produto || ''}
                onChange={v => setVenda({ ...venda, produto: v })}
                list={listas.produtos}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase' }}>
                Modelo
              </label>
              <AutocompleteInput
                value={venda.modelo || ''}
                onChange={v => setVenda({ ...venda, modelo: v })}
                list={listas.modelos}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase' }}>
                Cor
              </label>
              <AutocompleteInput
                value={venda.cor || ''}
                onChange={v => setVenda({ ...venda, cor: v })}
                list={listas.cores}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase' }}>
                Marca
              </label>
              <AutocompleteInput
                value={venda.marca || ''}
                onChange={v => setVenda({ ...venda, marca: v })}
                list={listas.marcas}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase' }}>
                Tamanho
              </label>
              <input
                value={venda.tamanho || ''}
                onChange={e => setVenda({ ...venda, tamanho: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: 'var(--input-bg)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 8,
                  color: 'var(--input-text)',
                  fontSize: 14
                }}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase' }}>
                Cliente Principal
              </label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <AutocompleteInput
                    value={venda.cliente_nome || ''}
                    onChange={v => setVenda({ ...venda, cliente_nome: v })}
                    list={listas.clientes}
                  />
                </div>
                <button
                  onClick={onAbrirFila}
                  style={{
                    background: (venda.fila1 || venda.fila2 || venda.fila3) ? 'rgba(147,197,253,0.15)' : 'var(--bg)',
                    border: `1px solid ${(venda.fila1 || venda.fila2 || venda.fila3) ? 'var(--blue)' : 'var(--border-light)'}`,
                    color: (venda.fila1 || venda.fila2 || venda.fila3) ? 'var(--blue)' : 'var(--muted)',
                    borderRadius: 8,
                    width: 44,
                    height: 44,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <line x1="19" y1="8" x2="19" y2="14"/>
                    <line x1="22" y1="11" x2="16" y2="11"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-light)', background: 'var(--bg)', display: 'flex', gap: 10 }}>
          <button
            onClick={() => onExcluir(venda.id)}
            style={{
              flex: '0 0 auto',
              padding: '12px 16px',
              background: 'var(--red)',
              color: '#000',
              border: 'none',
              borderRadius: 8,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            🗑️ Excluir
          </button>
          <button
            onClick={onFechar}
            style={{
              flex: 1,
              padding: '12px 20px',
              background: 'var(--input-bg)',
              color: 'var(--input-text)',
              border: '1px solid var(--border-light)',
              borderRadius: 8,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Cancelar
          </button>
          <button
            onClick={() => onSalvar(venda)}
            style={{
              flex: 1,
              padding: '12px 20px',
              background: 'var(--green)',
              color: '#000',
              border: 'none',
              borderRadius: 8,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}

// MODAL DE FILA
function ModalFila({ venda: vendaInicial, listas, onSalvar, onFechar }) {
  const [venda, setVenda] = useState(vendaInicial)

  function puxarDaFila(numero) {
    const novoCliente = venda[`fila${numero}`]
    if (!novoCliente) return

    if (numero === 1) {
      setVenda({
        ...venda,
        cliente_nome: novoCliente,
        fila1: venda.fila2,
        fila2: venda.fila3,
        fila3: ''
      })
    } else if (numero === 2) {
      setVenda({
        ...venda,
        cliente_nome: novoCliente,
        fila2: venda.fila3,
        fila3: ''
      })
    } else if (numero === 3) {
      setVenda({
        ...venda,
        cliente_nome: novoCliente,
        fila3: ''
      })
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1001,
        padding: 20
      }}
      onClick={onFechar}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--border-light)',
          borderRadius: 12,
          maxWidth: 400,
          width: '100%'
        }}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-light)', background: 'var(--bg)' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Fila de Clientes</h3>
        </div>

        {/* Body */}
        <div style={{ padding: 20 }}>
          {[1, 2, 3].map(num => (
            <div key={num} style={{ marginBottom: num < 3 ? 15 : 0 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase' }}>
                Fila {num}
              </label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <AutocompleteInput
                    value={venda[`fila${num}`] || ''}
                    onChange={v => setVenda({ ...venda, [`fila${num}`]: v })}
                    list={listas.clientes}
                    placeholder="Cliente..."
                  />
                </div>
                <button
                  onClick={() => puxarDaFila(num)}
                  disabled={!venda[`fila${num}`]}
                  style={{
                    background: 'var(--blue)',
                    color: '#000',
                    border: 'none',
                    borderRadius: 8,
                    width: 44,
                    height: 44,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: venda[`fila${num}`] ? 1 : 0.3
                  }}
                  title="Passar para Cliente Principal"
                >
                  ⬆️
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-light)', background: 'var(--bg)', display: 'flex', gap: 10 }}>
          <button
            onClick={onFechar}
            style={{
              flex: 1,
              padding: '12px 20px',
              background: 'var(--input-bg)',
              color: 'var(--input-text)',
              border: '1px solid var(--border-light)',
              borderRadius: 8,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Voltar
          </button>
          <button
            onClick={() => onSalvar(venda)}
            style={{
              flex: 1,
              padding: '12px 20px',
              background: 'var(--green)',
              color: '#000',
              border: 'none',
              borderRadius: 8,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Salvar Fila
          </button>
        </div>
      </div>
    </div>
  )
}
