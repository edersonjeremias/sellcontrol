import { useState, useEffect, useCallback, useRef } from 'react'
import { getVendas, excluirVenda, updateVendaEnviada, formatMoney } from '../../services/vendasService'
import { getListas } from '../../services/vendasService'
import { getDadosIniciais } from '../../services/vendasService'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import AppShell from '../../components/ui/AppShell'
import AutocompleteInput from '../../components/ui/AutocompleteInput'
import ModalConfirmacao from '../../components/ui/ModalConfirmacao'

export default function EditarVendasPage() {
  const { showToast } = useApp()
  const { profile } = useAuth()
  const tenantId = profile?.tenant_id

  const [vendas, setVendas] = useState([])
  const [listas, setListas] = useState({ produtos: [], modelos: [], cores: [], marcas: [], clientes: [] })
  const [globalDB, setGlobalDB] = useState({ lives: [] })
  const [busy, setBusy] = useState(false)
  const [dataFiltro, setDataFiltro] = useState('')
  const [liveFiltro, setLiveFiltro] = useState('')
  const [clienteFiltro, setClienteFiltro] = useState('')
  const [filtroRapido, setFiltroRapido] = useState('')
  const [modalEdicao, setModalEdicao] = useState(null)
  const [confirmacao, setConfirmacao] = useState(null)

  // ── Carrega dados iniciais ──
  useEffect(() => {
    if (!tenantId) return
    async function init() {
      setBusy(true)
      try {
        const [db, lst] = await Promise.all([
          getDadosIniciais(tenantId),
          getListas(tenantId)
        ])
        setGlobalDB(db)
        setListas(lst)
      } catch (err) {
        showToast('Erro ao carregar dados iniciais', 'error')
      } finally {
        setBusy(false)
      }
    }
    init()
  }, [tenantId])

  // ── Buscar vendas ──
  const buscar = useCallback(async () => {
    if (!tenantId) return
    setBusy(true)
    try {
      const rows = await getVendas(tenantId, dataFiltro || null, liveFiltro || null, {
        apenasComCliente: false,
        cliente: clienteFiltro || null
      })
      setVendas(rows)
      if (rows.length === 0) {
        showToast('Nenhuma venda encontrada', 'info')
      }
    } catch (err) {
      showToast('Erro ao buscar vendas', 'error')
    } finally {
      setBusy(false)
    }
  }, [tenantId, dataFiltro, liveFiltro, clienteFiltro])

  // ── Filtro rápido (multi-termo) ──
  const vendasFiltradas = vendas.filter(v => {
    if (!filtroRapido.trim()) return true
    const termos = filtroRapido.toLowerCase().split(',').map(t => t.trim()).filter(Boolean)
    const txt = [
      v.produto, v.modelo, v.cor, v.marca, v.tamanho, v.codigo,
      v.cliente_nome, v.data_live, v.live_nome, v.status
    ].join(' ').toLowerCase()
    return termos.every(t => txt.includes(t))
  })

  // ── Excluir venda ──
  const handleExcluir = useCallback((venda) => {
    setConfirmacao({
      titulo: '🗑️ Excluir Venda',
      mensagem: `Deseja realmente excluir esta venda?<br><br><b>${venda.produto || ''} ${venda.modelo || ''}</b><br>Cliente: <b>${venda.cliente_nome || 'sem cliente'}</b>`,
      onSim: async () => {
        setConfirmacao(null)
        setBusy(true)
        try {
          await excluirVenda(venda.id)
          setVendas(prev => prev.filter(v => v.id !== venda.id))
          showToast('Venda excluída com sucesso!', 'success')
        } catch (err) {
          showToast('Erro ao excluir venda', 'error')
        } finally {
          setBusy(false)
        }
      },
      onNao: () => setConfirmacao(null)
    })
  }, [])

  // ── Salvar edição ──
  const salvarEdicao = useCallback(async (vendaEditada) => {
    setBusy(true)
    try {
      await updateVendaEnviada(tenantId, vendaEditada)
      setVendas(prev => prev.map(v => v.id === vendaEditada.id ? { ...v, ...vendaEditada } : v))
      setModalEdicao(null)
      showToast('Venda atualizada com sucesso!', 'success')
    } catch (err) {
      showToast('Erro ao salvar venda', 'error')
    } finally {
      setBusy(false)
    }
  }, [tenantId])

  return (
    <AppShell title="Editar Vendas" hideTitle flush>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* TOOLBAR */}
        <div className="no-print">
          <div className="toolbar">
            <div className="field">
              <label>Data</label>
              <input type="date" value={dataFiltro} onChange={e => setDataFiltro(e.target.value)}
                onClick={e => { try { e.target.showPicker() } catch {} }} />
            </div>
            <div className="field">
              <label>Live</label>
              <AutocompleteInput value={liveFiltro} onChange={setLiveFiltro}
                list={globalDB.lives} placeholder="Buscar Live..." showOnFocus />
            </div>
            <div className="field">
              <label>Cliente (Opcional)</label>
              <AutocompleteInput value={clienteFiltro} onChange={setClienteFiltro}
                list={listas.clientes} placeholder="Todos os clientes..." showOnFocus />
            </div>
            <div className="actions">
              <button className="btn-acao btn-green" onClick={buscar} disabled={busy}>Buscar</button>
            </div>
          </div>

          {/* FILTRO RÁPIDO */}
          <div className="filter-header-bar">
            <input type="text" value={filtroRapido} onChange={e => setFiltroRapido(e.target.value)}
              placeholder="Filtro Rápido: Digite para buscar (Ex: camiseta, verde, zara)" />
          </div>
        </div>

        {/* TABELA */}
        <div id="tabela-container">
          <div className="table-responsive">
            {vendasFiltradas.length === 0 ? (
              <div id="tabela-msg">
                {vendas.length === 0
                  ? 'Use os filtros acima e clique em Buscar para ver as vendas.'
                  : 'Nenhuma venda encontrada com este filtro.'}
              </div>
            ) : (
              <table id="tabela">
                <thead>
                  <tr>
                    <th className="col-data">Data</th>
                    <th className="col-live">Live</th>
                    <th className="col-cod">Cód.</th>
                    <th className="col-sacola">Sacola</th>
                    <th className="col-produto">Produto</th>
                    <th className="col-modelo">Modelo</th>
                    <th className="col-cor">Cor</th>
                    <th>Marca</th>
                    <th className="col-tam">Tam.</th>
                    <th className="col-preco">Preço</th>
                    <th className="col-cliente">Cliente</th>
                    <th>Status</th>
                    <th className="col-acoes">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {vendasFiltradas.map(v => (
                    <tr key={v.id} onClick={() => setModalEdicao(v)}>
                      <td className="col-data">{v.data_live ? new Date(v.data_live + 'T00:00:00').toLocaleDateString('pt-BR') : ''}</td>
                      <td className="col-live">{v.live_nome}</td>
                      <td className="col-cod">{v.codigo}</td>
                      <td className="col-sacola">{v.sacolinha || ''}</td>
                      <td className="col-produto">{v.produto}</td>
                      <td className="col-modelo">{v.modelo}</td>
                      <td className="col-cor">{v.cor}</td>
                      <td>{v.marca}</td>
                      <td className="col-tam">{v.tamanho}</td>
                      <td className="col-preco">{formatMoney(v.preco)}</td>
                      <td className="col-cliente">{v.cliente_nome}</td>
                      <td>{v.status}</td>
                      <td className="col-acoes">
                        <button
                          className="btn-icon"
                          onClick={(e) => { e.stopPropagation(); handleExcluir(v) }}
                          title="Excluir venda"
                          style={{ color: 'var(--red)' }}
                        >
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* MODAL EDIÇÃO */}
        {modalEdicao && (
          <ModalEdicaoVenda
            venda={modalEdicao}
            listas={listas}
            onSalvar={salvarEdicao}
            onFechar={() => setModalEdicao(null)}
          />
        )}

        {/* MODAL CONFIRMAÇÃO */}
        {confirmacao && (
          <ModalConfirmacao
            titulo={confirmacao.titulo}
            mensagem={confirmacao.mensagem}
            onSim={confirmacao.onSim}
            onNao={confirmacao.onNao}
          />
        )}
      </div>
    </AppShell>
  )
}

// ── MODAL EDIÇÃO ──
function ModalEdicaoVenda({ venda, listas, onSalvar, onFechar }) {
  const [form, setForm] = useState({
    id: venda.id,
    produto: venda.produto || '',
    modelo: venda.modelo || '',
    cor: venda.cor || '',
    marca: venda.marca || '',
    tamanho: venda.tamanho || '',
    preco: formatMoney(venda.preco) || '',
    codigo: venda.codigo || '',
    cliente_nome: venda.cliente_nome || '',
    sacolinha: venda.sacolinha || '',
    status: venda.status || '',
    data_live: venda.data_live || '',
    live_nome: venda.live_nome || ''
  })

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = () => {
    onSalvar(form)
  }

  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
        <div className="modal-header">
          <h3>Editar Venda</h3>
        </div>
        <div className="modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Data</label>
              <input type="date" value={form.data_live} onChange={e => handleChange('data_live', e.target.value)}
                style={{ width: '100%', padding: '8px 12px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 14 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Live</label>
              <input type="text" value={form.live_nome} onChange={e => handleChange('live_nome', e.target.value)} list="dlLives"
                style={{ width: '100%', padding: '8px 12px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 14 }} />
              <datalist id="dlLives">{listas.lives?.map(l => <option key={l} value={l} />)}</datalist>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Código</label>
              <input type="text" value={form.codigo} onChange={e => handleChange('codigo', e.target.value)}
                style={{ width: '100%', padding: '8px 12px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 14 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Sacolinha</label>
              <input type="text" value={form.sacolinha} onChange={e => handleChange('sacolinha', e.target.value)}
                style={{ width: '100%', padding: '8px 12px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 14 }} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Produto</label>
              <input type="text" value={form.produto} onChange={e => handleChange('produto', e.target.value)} list="dlProdutos"
                style={{ width: '100%', padding: '8px 12px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 14 }} />
              <datalist id="dlProdutos">{listas.produtos?.map(p => <option key={p} value={p} />)}</datalist>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Modelo</label>
              <input type="text" value={form.modelo} onChange={e => handleChange('modelo', e.target.value)} list="dlModelos"
                style={{ width: '100%', padding: '8px 12px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 14 }} />
              <datalist id="dlModelos">{listas.modelos?.map(m => <option key={m} value={m} />)}</datalist>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Cor</label>
              <input type="text" value={form.cor} onChange={e => handleChange('cor', e.target.value)} list="dlCores"
                style={{ width: '100%', padding: '8px 12px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 14 }} />
              <datalist id="dlCores">{listas.cores?.map(c => <option key={c} value={c} />)}</datalist>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Marca</label>
              <input type="text" value={form.marca} onChange={e => handleChange('marca', e.target.value)} list="dlMarcas"
                style={{ width: '100%', padding: '8px 12px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 14 }} />
              <datalist id="dlMarcas">{listas.marcas?.map(m => <option key={m} value={m} />)}</datalist>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Tamanho</label>
              <input type="text" value={form.tamanho} onChange={e => handleChange('tamanho', e.target.value)}
                style={{ width: '100%', padding: '8px 12px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 14 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Preço</label>
              <input type="text" value={form.preco} onChange={e => handleChange('preco', e.target.value)}
                style={{ width: '100%', padding: '8px 12px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 14 }} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Cliente</label>
              <input type="text" value={form.cliente_nome} onChange={e => handleChange('cliente_nome', e.target.value)} list="dlClientes"
                style={{ width: '100%', padding: '8px 12px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 14 }} />
              <datalist id="dlClientes">{listas.clientes?.map(c => <option key={c} value={c} />)}</datalist>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Status</label>
              <select value={form.status} onChange={e => handleChange('status', e.target.value)}
                style={{ width: '100%', padding: '8px 12px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 14 }}>
                <option value="">Sem status</option>
                <option value="VENDIDO">Vendido</option>
                <option value="ENVIADO">Enviado</option>
                <option value="RESERVADO">Reservado</option>
                <option value="CANCELADO">Cancelado</option>
              </select>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" onClick={onFechar}>Cancelar</button>
          <button className="btn-confirm" onClick={handleSubmit}>Salvar</button>
        </div>
      </div>
    </div>
  )
}
