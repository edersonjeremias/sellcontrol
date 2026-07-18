import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import AppShell from '../../components/ui/AppShell'
import DateSearchInput from '../../components/ui/DateSearchInput'
import SearchableSelect from '../../components/ui/SearchableSelect'
import { supabase } from '../../lib/supabase'
import { getConfig } from '../../services/configService'

function fmtDateBr(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = String(dateStr).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

export default function ImpressaoSacolinhaClientePage() {
  const { profile } = useAuth()
  const tenantId = profile?.tenant_id

  useEffect(() => {
    const style = document.createElement('style')
    style.id = 'print-sacol-cli-page'
    style.textContent = '@media print { @page { size: 100mm 150mm; margin: 0; } }'
    document.head.appendChild(style)
    return () => { if (document.getElementById('print-sacol-cli-page')) document.head.removeChild(style) }
  }, [])

  const [nomeLoja,      setNomeLoja]      = useState('')
  const [datasRaw,      setDatasRaw]      = useState([])
  const [dataFiltro,    setDataFiltro]    = useState('')
  const [liveOpts,      setLiveOpts]      = useState([])
  const [liveNome,      setLiveNome]      = useState('')
  const [clientes,      setClientes]      = useState([])
  const [gerado,        setGerado]        = useState(false)
  const [loading,       setLoading]       = useState(false)
  const [err,           setErr]           = useState(null)

  // Carrega nome da loja e datas com live
  useEffect(() => {
    if (!tenantId) return
    getConfig(tenantId).then(cfg => { if (cfg?.nome_loja) setNomeLoja(cfg.nome_loja) })
    supabase
      .from('vendas')
      .select('data_live')
      .eq('tenant_id', tenantId)
      .not('data_live', 'is', null)
      .order('data_live', { ascending: false })
      .then(({ data: rows }) => {
        const unicas = [...new Set((rows || []).map(r => r.data_live))].slice(0, 90)
        setDatasRaw(unicas)
      })
  }, [tenantId])

  // Quando muda a data: carrega lives disponíveis
  useEffect(() => {
    setLiveOpts([]); setLiveNome(''); setGerado(false); setClientes([])
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

  const gerar = useCallback(async () => {
    if (!dataFiltro || !liveNome) { setErr('Selecione a data e a live.'); return }
    setLoading(true); setErr(null); setGerado(false)
    try {
      const { data: rows, error } = await supabase
        .from('vendas')
        .select('cliente_nome, produto, modelo, cor, marca, tamanho, codigo, data_live, live_nome, sacolinha')
        .eq('tenant_id', tenantId)
        .eq('data_live', dataFiltro)
        .eq('live_nome', liveNome)

      if (error) throw error

      // Agrupa por cliente; mantém o sacolinha do primeiro registro
      const mapa = new Map()
      ;(rows || []).forEach(r => {
        if (!r.cliente_nome) return
        if (!mapa.has(r.cliente_nome)) {
          mapa.set(r.cliente_nome, {
            nome:      r.cliente_nome,
            sacolinha: r.sacolinha,
            data:      fmtDateBr(r.data_live),
            live:      r.live_nome || liveNome,
            itens:     [],
          })
        }
        const entry = mapa.get(r.cliente_nome)
        const desc = [r.produto, r.modelo, r.cor, r.marca, r.tamanho].filter(Boolean).join(' ')
        entry.itens.push({ codigo: r.codigo || '', desc })
      })

      // Ordena por número de sacolinha; sem número vai para o final por nome
      const lista = [...mapa.values()].sort((a, b) => {
        const na = Number(a.sacolinha) || 9999
        const nb = Number(b.sacolinha) || 9999
        if (na !== nb) return na - nb
        return a.nome.localeCompare(b.nome)
      })

      setClientes(lista)
      setGerado(true)
    } catch (e) {
      setErr(e.message || 'Erro ao carregar dados.')
    } finally {
      setLoading(false)
    }
  }, [tenantId, dataFiltro, liveNome])

  const limpar = () => {
    setDataFiltro(''); setLiveNome('')
    setClientes([]); setGerado(false); setErr(null)
  }

  return (
    <AppShell flush hideTitle>
      {/* ── Toolbar ── */}
      <div className="sacol-toolbar no-print">
        <div className="sacol-field" style={{ flex: '0 0 160px' }}>
          <label>DATA DA LIVE</label>
          <DateSearchInput
            value={dataFiltro}
            onChange={setDataFiltro}
            options={datasRaw}
            placeholder="DD/MM/AAAA"
          />
        </div>

        {liveOpts.length >= 1 && (
          <div className="sacol-field" style={{ flex: '0 0 180px' }}>
            <label>LIVE</label>
            <SearchableSelect
              value={liveNome}
              onChange={setLiveNome}
              options={liveOpts}
              emptyLabel="-- Selecione a live --"
            />
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
      <div id="sacol-cli-resultado">
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
        {gerado && clientes.map((c, i) => {
          const txtPecas = c.itens.length === 1 ? 'PEÇA' : 'PEÇAS'
          return (
            <div key={i} className="sacol-cli-card">
              {/* Cabeçalho */}
              <div className="sacol-cli-header">
                <div className="sacol-cli-header-top">
                  <span className="sacol-cli-nome">{c.nome}</span>
                  <span className="sacol-cli-data">{c.data}</span>
                </div>
                <div className="sacol-cli-info">
                  <span>SACOLINHA: <strong>{c.sacolinha || '—'}</strong></span>
                  <span><strong>{c.itens.length}</strong> {txtPecas}</span>
                  <span>LIVE: <strong>{c.live}</strong></span>
                </div>
              </div>

              {/* Lista de itens */}
              <div className="sacol-cli-itens">
                {c.itens.map((it, j) => (
                  <div key={j} className="sacol-cli-item">
                    {it.codigo && <span className="sacol-cli-cod">{it.codigo}</span>}
                    <span className="sacol-cli-desc">{it.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </AppShell>
  )
}
