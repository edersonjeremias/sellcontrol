import { useEffect, useMemo, useState } from 'react'
import AppShell from '../../components/ui/AppShell'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import {
  STATUS_ENTREGA_OPTS,
  STATUS_PROD_OPTS,
  PACOTE_OPTS,
  createProducaoPedido,
  duplicateProducaoPedido,
  getProducaoData,
  saveProducaoPedido,
} from '../../services/producaoService'

function modeFilter(row, mode) {
  const statusProd = row.status_prod || ''
  const statusEntrega = row.status_entrega || ''

  if (mode === 'prontos') {
    return (statusProd === 'Pronto' || statusProd === 'Liberado') && statusEntrega !== 'Enviado' && statusEntrega !== 'Retirou'
  }
  if (mode === 'finalizados') {
    return statusEntrega === 'Enviado' || statusEntrega === 'Retirou' || statusProd === 'Repetido'
  }

  if (statusProd === 'Pronto' || statusProd === 'Liberado' || statusProd === 'Repetido') return false
  if (statusEntrega === 'Enviado' || statusEntrega === 'Retirou') return false
  return true
}

function textFilter(row, searchTerms) {
  if (!searchTerms.length) return true
  const text = [
    row.cliente_nome,
    row.obs_cliente,
    row.obs_prod,
    row.pedido_codigo,
    row.msg_cobranca,
    row.rastreio,
  ].join(' ').toLowerCase()

  return searchTerms.every((term) => text.includes(term))
}

export default function ProducaoPage() {
  const { profile } = useAuth()
  const { showToast } = useApp()

  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState([])
  const [clientes, setClientes] = useState([])

  const [mode, setMode] = useState('producao')
  const [busca, setBusca] = useState('')
  const [filtroEntrega, setFiltroEntrega] = useState('')
  const [novoCliente, setNovoCliente] = useState('')

  const tenantId = profile?.tenant_id

  const loadData = async () => {
    if (!tenantId) return
    setLoading(true)
    try {
      const data = await getProducaoData(tenantId)
      setRows(data.rows)
      setClientes(data.clientes)
    } catch (error) {
      console.error(error)
      showToast(error.message || 'Erro ao carregar produção.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [tenantId])

  const filteredRows = useMemo(() => {
    const terms = busca.toLowerCase().split(',').map((v) => v.trim()).filter(Boolean)
    return rows.filter((row) => {
      if (!modeFilter(row, mode)) return false
      if (filtroEntrega && row.status_entrega !== filtroEntrega) return false
      return textFilter(row, terms)
    })
  }, [rows, mode, busca, filtroEntrega])

  const stats = useMemo(() => {
    const hoje = new Date().toLocaleDateString('pt-BR')
    const prontosHoje = rows.filter((r) => r.data_pronto_fmt === hoje && r.status_prod !== 'Repetido').length
    const pendentesGeral = rows.filter((r) => modeFilter(r, 'producao')).length
    const prontosPeriodo = rows.filter((r) => r.status_prod === 'Pronto' || r.status_prod === 'Liberado').length
    const entraramPeriodo = rows.length
    return { prontosHoje, pendentesGeral, prontosPeriodo, entraramPeriodo }
  }, [rows])

  const handleSave = async (row) => {
    try {
      await saveProducaoPedido(tenantId, row)
      await loadData()
      showToast('Pedido atualizado.', 'success')
    } catch (error) {
      console.error(error)
      showToast(error.message || 'Erro ao salvar pedido.', 'error')
    }
  }

  const handleInlineChange = (id, field, value) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)))
  }

  const handleNovoPedido = async () => {
    if (!novoCliente.trim()) {
      showToast('Digite o cliente para criar novo pedido.', 'error')
      return
    }
    try {
      await createProducaoPedido(tenantId, novoCliente)
      setNovoCliente('')
      await loadData()
      showToast('Pedido criado com sucesso.', 'success')
    } catch (error) {
      console.error(error)
      showToast(error.message || 'Erro ao criar pedido.', 'error')
    }
  }

  const handleDuplicar = async (id) => {
    try {
      await duplicateProducaoPedido(tenantId, id)
      await loadData()
      showToast('Pedido duplicado.', 'success')
    } catch (error) {
      console.error(error)
      showToast(error.message || 'Erro ao duplicar pedido.', 'error')
    }
  }

  return (
    <AppShell title="Produção">
      <section className="prod-page">
        <div className="prod-toolbar">
          <div className="prod-left-actions">
            <input
              className="prod-input"
              list="prod-clientes-list"
              placeholder="Cliente para novo pedido"
              value={novoCliente}
              onChange={(e) => setNovoCliente(e.target.value)}
            />
            <button className="btn-acao btn-green" onClick={handleNovoPedido} disabled={loading}>+ Novo</button>
          </div>

          <input
            className="prod-input"
            placeholder="Buscar (nome, obs, pacote, rastreio...)"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />

          <select className="prod-input" value={filtroEntrega} onChange={(e) => setFiltroEntrega(e.target.value)}>
            <option value="">Status Entrega (Todos)</option>
            {STATUS_ENTREGA_OPTS.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>

          <div className="prod-mode-buttons">
            <button className={mode === 'producao' ? 'mode-btn active' : 'mode-btn'} onClick={() => setMode('producao')}>EM PRODUÇÃO</button>
            <button className={mode === 'prontos' ? 'mode-btn active' : 'mode-btn'} onClick={() => setMode('prontos')}>PRONTOS</button>
            <button className={mode === 'finalizados' ? 'mode-btn active' : 'mode-btn'} onClick={() => setMode('finalizados')}>ENVIADOS</button>
          </div>

          <div className="prod-counter">{filteredRows.length} REGISTROS</div>
        </div>

        <datalist id="prod-clientes-list">
          {clientes.map((c) => <option key={c} value={c} />)}
        </datalist>

        <div className="prod-stats-cards">
          <div className="stats-card"><div className="stats-card-title">Prontos Hoje</div><div className="stats-card-value val-hoje">{stats.prontosHoje}</div></div>
          <div className="stats-card"><div className="stats-card-title">Entraram</div><div className="stats-card-value val-entrou">{stats.entraramPeriodo}</div></div>
          <div className="stats-card"><div className="stats-card-title">Prontos</div><div className="stats-card-value val-pronto">{stats.prontosPeriodo}</div></div>
          <div className="stats-card"><div className="stats-card-title">Pendentes</div><div className="stats-card-value val-pendente">{stats.pendentesGeral}</div></div>
        </div>

        <div className="prod-table-wrap">
          {loading && <div className="empty-state">Carregando produção...</div>}
          {!loading && filteredRows.length === 0 && <div className="empty-state">Nenhum registro encontrado.</div>}

          {!loading && filteredRows.length > 0 && (
            <table className="prod-table2">
              <thead>
                <tr>
                  <th>Solicitado</th>
                  <th>Dias</th>
                  <th>Cliente</th>
                  <th>Status Prod.</th>
                  <th>Obs Cliente</th>
                  <th>Obs Prod.</th>
                  <th>Peso</th>
                  <th>Pacote</th>
                  <th>Data Pronto</th>
                  <th>Status Entrega</th>
                  <th>Pedido</th>
                  <th>V.Frete</th>
                  <th>Msg Cobrança</th>
                  <th>Data Enviado</th>
                  <th>Rastreio</th>
                  <th>Link Rastreio</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id} className={row.bloqueado ? 'row-blocked' : row.atrasado ? 'row-delayed' : ''}>
                    <td>{row.data_solicitado_fmt}</td>
                    <td>{row.dias_u}</td>
                    <td>
                      <input className="table-input2" value={row.cliente_nome || ''} onChange={(e) => handleInlineChange(row.id, 'cliente_nome', e.target.value)} onBlur={() => handleSave(row)} list="prod-clientes-list" />
                    </td>
                    <td>
                      <select className="table-input2" value={row.status_prod || ''} onChange={(e) => handleInlineChange(row.id, 'status_prod', e.target.value)} onBlur={() => handleSave(row)}>
                        <option value="">--</option>
                        {STATUS_PROD_OPTS.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                    </td>
                    <td><input className="table-input2" value={row.obs_cliente || ''} onChange={(e) => handleInlineChange(row.id, 'obs_cliente', e.target.value)} onBlur={() => handleSave(row)} /></td>
                    <td><input className="table-input2" value={row.obs_prod || ''} onChange={(e) => handleInlineChange(row.id, 'obs_prod', e.target.value)} onBlur={() => handleSave(row)} /></td>
                    <td><input className="table-input2" value={row.peso || ''} onChange={(e) => handleInlineChange(row.id, 'peso', e.target.value)} onBlur={() => handleSave(row)} /></td>
                    <td>
                      <select className="table-input2" value={row.pacote || ''} onChange={(e) => handleInlineChange(row.id, 'pacote', e.target.value)} onBlur={() => handleSave(row)}>
                        <option value="">--</option>
                        {PACOTE_OPTS.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                    </td>
                    <td>{row.data_pronto_fmt || '-'}</td>
                    <td>
                      <select className="table-input2" value={row.status_entrega || ''} onChange={(e) => handleInlineChange(row.id, 'status_entrega', e.target.value)} onBlur={() => handleSave(row)}>
                        <option value="">--</option>
                        {STATUS_ENTREGA_OPTS.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                    </td>
                    <td><input className="table-input2" value={row.pedido_codigo || ''} onChange={(e) => handleInlineChange(row.id, 'pedido_codigo', e.target.value)} onBlur={() => handleSave(row)} /></td>
                    <td><input className="table-input2" value={row.valor_frete || ''} onChange={(e) => handleInlineChange(row.id, 'valor_frete', e.target.value)} onBlur={() => handleSave(row)} /></td>
                    <td><input className="table-input2" value={row.msg_cobranca || ''} onChange={(e) => handleInlineChange(row.id, 'msg_cobranca', e.target.value)} onBlur={() => handleSave(row)} /></td>
                    <td>{row.data_enviado_fmt || '-'}</td>
                    <td><input className="table-input2" value={row.rastreio || ''} onChange={(e) => handleInlineChange(row.id, 'rastreio', e.target.value)} onBlur={() => handleSave(row)} /></td>
                    <td>{row.link_rastreio ? <a href={row.link_rastreio} target="_blank" rel="noreferrer">Abrir</a> : '-'}</td>
                    <td>
                      <button className="btn-acao btn-ghost" onClick={() => handleDuplicar(row.id)}>Duplicar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </AppShell>
  )
}
