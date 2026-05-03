import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import AppShell from '../../components/ui/AppShell'
import { supabase } from '../../lib/supabase'
import { getConfig } from '../../services/configService'

function fmtDateBr(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = String(dateStr).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

function fmtPreco(val) {
  const n = parseFloat(String(val).replace(',', '.')) || 0
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
}

export default function ImpressaoPedidosPage() {
  const { profile } = useAuth()
  const tenantId = profile?.tenant_id

  const [nomeLoja,      setNomeLoja]      = useState('')
  const [dataFiltro,    setDataFiltro]    = useState('')
  const [liveOpts,      setLiveOpts]      = useState([])
  const [liveNome,      setLiveNome]      = useState('')
  const [clienteOpts,   setClienteOpts]   = useState([])
  const [clienteFiltro, setClienteFiltro] = useState('')
  const [clientes,      setClientes]      = useState([])
  const [gerado,        setGerado]        = useState(false)
  const [loading,       setLoading]       = useState(false)
  const [err,           setErr]           = useState(null)

  // Injeta @page correto para esta página (100x150) e remove ao sair
  useEffect(() => {
    const style = document.createElement('style')
    style.id = 'print-pedidos-page'
    style.textContent = '@media print { @page { size: 100mm 150mm; margin: 0; } }'
    document.head.appendChild(style)
    return () => { if (document.getElementById('print-pedidos-page')) document.head.removeChild(style) }
  }, [])

  // Carrega nome da loja
  useEffect(() => {
    if (!tenantId) return
    getConfig(tenantId).then(cfg => { if (cfg?.nome_loja) setNomeLoja(cfg.nome_loja) })
  }, [tenantId])

  // Quando muda a data: carrega lives disponíveis
  useEffect(() => {
    setLiveOpts([]); setLiveNome(''); setClienteOpts([]); setClienteFiltro('')
    setGerado(false); setClientes([])
    if (!tenantId || !dataFiltro) return
    supabase
      .from('vendas')
      .select('live_nome')
      .eq('tenant_id', tenantId)
      .eq('data_live', dataFiltro)
      .not('live_nome', 'is', null)
      .then(({ data: rows }) => {
        const unicas = [...new Set((rows || []).map(r => r.live_nome).filter(Boolean))].sort()
        setLiveOpts(unicas)
        if (unicas.length === 1) setLiveNome(unicas[0])
      })
  }, [tenantId, dataFiltro])

  // Quando muda data+live: carrega clientes disponíveis
  useEffect(() => {
    setClienteOpts([]); setClienteFiltro('')
    setGerado(false); setClientes([])
    if (!tenantId || !dataFiltro || !liveNome) return
    supabase
      .from('vendas')
      .select('cliente_nome')
      .eq('tenant_id', tenantId)
      .eq('data_live', dataFiltro)
      .eq('live_nome', liveNome)
      .not('cliente_nome', 'is', null)
      .then(({ data: rows }) => {
        const unicas = [...new Set((rows || []).map(r => r.cliente_nome).filter(Boolean))].sort()
        setClienteOpts(unicas)
      })
  }, [tenantId, dataFiltro, liveNome])

  const gerar = useCallback(async () => {
    if (!dataFiltro || !liveNome) { setErr('Selecione a data e a live.'); return }
    setLoading(true); setErr(null); setGerado(false)
    try {
      let q = supabase
        .from('vendas')
        .select('cliente_nome, produto, modelo, cor, marca, tamanho, preco, codigo, data_live')
        .eq('tenant_id', tenantId)
        .eq('data_live', dataFiltro)
        .eq('live_nome', liveNome)
      if (clienteFiltro) q = q.eq('cliente_nome', clienteFiltro)

      const { data: rows, error } = await q
      if (error) throw error

      const mapa = new Map()
      ;(rows || []).forEach(r => {
        if (!r.cliente_nome) return
        if (!mapa.has(r.cliente_nome)) {
          mapa.set(r.cliente_nome, {
            nome: r.cliente_nome,
            data: fmtDateBr(r.data_live),
            itens: [],
            total: 0,
          })
        }
        const entry = mapa.get(r.cliente_nome)
        const preco = parseFloat(String(r.preco).replace(',', '.')) || 0
        const desc = [r.produto, r.modelo, r.cor, r.marca, r.tamanho].filter(Boolean).join(' ')
        entry.itens.push({ codigo: r.codigo || '', desc, preco, precoFmt: fmtPreco(r.preco) })
        entry.total += preco
      })

      const lista = [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome))
      setClientes(lista)
      setGerado(true)
    } catch (e) {
      setErr(e.message || 'Erro ao carregar dados.')
    } finally {
      setLoading(false)
    }
  }, [tenantId, dataFiltro, liveNome, clienteFiltro])

  const limpar = () => {
    setDataFiltro(''); setLiveNome(''); setClienteFiltro('')
    setClientes([]); setGerado(false); setErr(null)
  }

  const SI = {
    background: 'linear-gradient(180deg,#111b28,#0f1621)',
    border: '1px solid rgba(255,255,255,.12)',
    color: '#e6edf3', borderRadius: 8, padding: '0 12px',
    height: 44, fontSize: 14, outline: 'none', width: '100%',
    colorScheme: 'dark',
  }

  return (
    <AppShell flush hideTitle>
      {/* ── Toolbar ── */}
      <div className="sacol-toolbar no-print">
        <div className="sacol-field">
          <label>DATA</label>
          <input type="date" value={dataFiltro} onChange={e => setDataFiltro(e.target.value)} style={SI} />
        </div>

        {liveOpts.length >= 1 && (
          <div className="sacol-field">
            <label>LIVE</label>
            <select value={liveNome} onChange={e => setLiveNome(e.target.value)} style={SI}>
              <option value="">-- Selecione a live --</option>
              {liveOpts.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        )}

        {clienteOpts.length > 0 && (
          <div className="sacol-field">
            <label>CLIENTE (FILTRO)</label>
            <select value={clienteFiltro} onChange={e => setClienteFiltro(e.target.value)} style={SI}>
              <option value="">-- Todos os clientes --</option>
              {clienteOpts.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}

        <div className="sacol-actions">
          <button
            className="sacol-btn sacol-btn-green"
            onClick={gerar}
            disabled={loading || !dataFiltro || !liveNome}
          >
            {loading ? 'Carregando…' : 'Gerar'}
          </button>
          <button className="sacol-btn sacol-btn-blue" onClick={() => window.print()} disabled={!gerado}>
            Imprimir
          </button>
          <button className="sacol-btn sacol-btn-ghost" onClick={limpar}>
            Limpar
          </button>
        </div>

        {err && <span style={{ color: '#f28b82', fontSize: 13, alignSelf: 'center' }}>{err}</span>}
      </div>

      {/* ── Resultado ── */}
      <div id="pedidos-resultado">
        {!gerado && (
          <div className="pedidos-placeholder">
            Selecione a data e a live e clique em Gerar.
          </div>
        )}
        {gerado && clientes.length === 0 && (
          <div className="pedidos-placeholder">
            Nenhum registro encontrado.
          </div>
        )}
        {gerado && clientes.map((c, i) => (
          <div key={i} className="pedido-card">
            <div className="pedido-header">
              <div className="pedido-header-top">
                <span className="pedido-empresa">{nomeLoja || 'VM KIDS'}</span>
                <span className="pedido-data-txt">{c.data}</span>
              </div>
            </div>
            <div className="pedido-cliente-nome">{c.nome}</div>
            <div className="pedido-itens">
              {c.itens.map((it, j) => (
                <div key={j} className="pedido-item-row">
                  <span className="pedido-item-desc">
                    {it.codigo ? `${it.codigo} - ` : ''}{it.desc}
                  </span>
                  <span className="pedido-item-preco">{it.precoFmt}</span>
                </div>
              ))}
            </div>
            <div className="pedido-rodape">
              <span>ITENS: {c.itens.length}</span>
              <span>TOTAL: R$ {c.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  )
}
