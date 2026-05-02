import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import AppShell from '../../components/ui/AppShell'
import { supabase } from '../../lib/supabase'

function fmtDateBr(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = String(dateStr).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

export default function ImpressaoSacolinhaPage() {
  const { profile } = useAuth()
  const tenantId = profile?.tenant_id

  const [dataFiltro, setDataFiltro] = useState('')
  const [liveOpts,   setLiveOpts]   = useState([])
  const [liveNome,   setLiveNome]   = useState('')
  const [clientes,   setClientes]   = useState([])
  const [gerado,     setGerado]     = useState(false)
  const [loading,    setLoading]    = useState(false)
  const [err,        setErr]        = useState(null)

  // Quando muda a data, carrega as lives disponíveis nessa data
  useEffect(() => {
    if (!tenantId || !dataFiltro) { setLiveOpts([]); setLiveNome(''); return }
    supabase
      .from('vendas')
      .select('live_nome')
      .eq('tenant_id', tenantId)
      .eq('data_live', dataFiltro)
      .not('live_nome', 'is', null)
      .then(({ data: rows }) => {
        const unicas = [...new Set((rows || []).map(r => r.live_nome).filter(Boolean))].sort()
        setLiveOpts(unicas)
        setLiveNome(unicas.length === 1 ? unicas[0] : '')
      })
    setGerado(false)
    setClientes([])
  }, [tenantId, dataFiltro])

  const gerar = useCallback(async () => {
    if (!dataFiltro) { setErr('Selecione a data da live.'); return }
    setLoading(true)
    setErr(null)
    setGerado(false)
    try {
      let q = supabase
        .from('vendas')
        .select('cliente_nome, data_live, live_nome, sacolinha')
        .eq('tenant_id', tenantId)
        .eq('data_live', dataFiltro)
      if (liveNome) q = q.eq('live_nome', liveNome)

      const { data: rows, error } = await q
      if (error) throw error

      // Agrupa por cliente: mantém o primeiro sacolinha encontrado
      const mapa = new Map()
      ;(rows || []).forEach(r => {
        if (!r.cliente_nome) return
        if (!mapa.has(r.cliente_nome)) {
          mapa.set(r.cliente_nome, { nome: r.cliente_nome, sacolinha: r.sacolinha, data: fmtDateBr(r.data_live) })
        }
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

  const SI = {
    background: 'linear-gradient(180deg,#111b28,#0f1621)',
    border: '1px solid rgba(255,255,255,.12)',
    color: '#e6edf3', borderRadius: 8, padding: '0 12px',
    height: 44, fontSize: 14, outline: 'none', width: '100%',
    colorScheme: 'dark',
  }

  return (
    <AppShell>
      {/* ── Toolbar ── */}
      <div className="sacol-toolbar no-print">
        <div className="sacol-field">
          <label>DATA DA LIVE</label>
          <input
            type="date"
            value={dataFiltro}
            onChange={e => setDataFiltro(e.target.value)}
            style={SI}
          />
        </div>

        {liveOpts.length > 1 && (
          <div className="sacol-field">
            <label>LIVE</label>
            <select value={liveNome} onChange={e => setLiveNome(e.target.value)} style={SI}>
              <option value="">-- Todas --</option>
              {liveOpts.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        )}

        <div className="sacol-actions">
          <button className="sacol-btn sacol-btn-green" onClick={gerar} disabled={loading || !dataFiltro}>
            {loading ? 'Carregando…' : 'Gerar'}
          </button>
          <button className="sacol-btn sacol-btn-blue" onClick={() => window.print()} disabled={!gerado}>
            Imprimir
          </button>
        </div>

        {err && <span style={{ color: '#f28b82', fontSize: 13, alignSelf: 'center' }}>{err}</span>}
      </div>

      {/* ── Resultado ── */}
      <div id="sacol-resultado">
        {!gerado && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6b7280', fontSize: 14 }}>
            Selecione a data e clique em Gerar para visualizar as etiquetas.
          </div>
        )}

        {gerado && clientes.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6b7280', fontSize: 14 }}>
            Nenhum cliente encontrado para os filtros selecionados.
          </div>
        )}

        {gerado && clientes.length > 0 && (
          <>
            {/* 1ª Sequência: Identificação */}
            <div className="sacol-divisor no-print">
              1ª Sequência — Identificação ({clientes.length} etiquetas)
            </div>
            {clientes.map((c, i) => (
              <div key={`id-${i}`} className="etiqueta-sacola">
                <div className="sacol-nome">{c.nome}</div>
                <div className="sacol-num">{c.sacolinha ?? i + 1}</div>
                <div className="sacol-data">{c.data}</div>
              </div>
            ))}

            {/* 2ª Sequência: Números gigantes */}
            <div className="sacol-divisor no-print">
              2ª Sequência — Números Gigantes ({clientes.length} etiquetas)
            </div>
            {clientes.map((c, i) => (
              <div key={`num-${i}`} className="etiqueta-sacola">
                <div className="sacol-num-gigante">{c.sacolinha ?? i + 1}</div>
              </div>
            ))}
          </>
        )}
      </div>
    </AppShell>
  )
}
