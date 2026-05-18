import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import AppShell from '../../components/ui/AppShell'
import DateSearchInput from '../../components/ui/DateSearchInput'
import SearchableSelect from '../../components/ui/SearchableSelect'
import { supabase } from '../../lib/supabase'

const STORAGE_KEY = 'sellcontrol_etiquetas_layout_v1'

const DEFAULT_LAYOUT = {
  paperW: 60,
  paperH: 40,
  cols: 1,
  fields: [
    { id: 'textoLivre',      label: 'Texto Livre',       show: false, text: '', top: 2,  left: 2, width: 56, height: 6,  fontSize: 7,  barWidth: 1.5, align: 'center' },
    { id: 'codigo',          label: 'Código',            show: true,  text: '', top: 2,  left: 2, width: 56, height: 5,  fontSize: 8,  barWidth: 1.5, align: 'center' },
    { id: 'produtoCompleto', label: 'Produto Completo',  show: true,  text: '', top: 8,  left: 2, width: 56, height: 14, fontSize: 7,  barWidth: 1.5, align: 'center' },
    { id: 'barcode',         label: 'Código de Barras',  show: false, text: '', top: 22, left: 2, width: 56, height: 10, fontSize: 8,  barWidth: 1.5, barHeight: 35, align: 'center' },
    { id: 'preco',           label: 'Preço',             show: true,  text: '', top: 33, left: 2, width: 56, height: 6,  fontSize: 12, barWidth: 1.5, align: 'center' },
  ],
}

function fmtPreco(val) {
  const n = parseFloat(String(val ?? '').replace(',', '.')) || 0
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
}

function buildLabelHtml(item, layout, labelW) {
  const { paperH, fields } = layout
  const fieldDivs = fields.filter(f => f.show).map(f => {
    if (f.id === 'barcode') {
      const code = item.codigo || ''
      if (!code) return ''
      // Div posicionado controla tamanho; SVG preenchimento 100% evita que JsBarcode
      // sobrescreva as dimensões em px e quebre o layout
      return `<div style="position:absolute;top:${f.top}mm;left:${f.left}mm;width:${f.width}mm;height:${f.height}mm;overflow:hidden;display:flex;align-items:center;justify-content:center;">` +
             `<svg data-barcode="${code}" data-bw="${f.barWidth || 1.5}" data-bh="${f.barHeight || 35}" style="width:100%;height:100%;display:block;"></svg>` +
             `</div>`
    }
    let text = ''
    if      (f.id === 'textoLivre')      text = f.text || ''
    else if (f.id === 'codigo')          text = item.codigo || ''
    else if (f.id === 'produtoCompleto') text = item.desc || ''
    else if (f.id === 'preco')           text = item.precoFmt ? `R$ ${item.precoFmt}` : ''
    const align = f.align || 'center'
    const jc    = align === 'center' ? 'center' : 'flex-start'
    return `<div style="position:absolute;top:${f.top}mm;left:${f.left}mm;width:${f.width}mm;height:${f.height}mm;font-size:${f.fontSize}pt;line-height:1.2;overflow:hidden;word-wrap:break-word;display:flex;align-items:center;justify-content:${jc};text-align:${align};">${text}</div>`
  }).join('')
  return `<div style="position:relative;width:${labelW}mm;height:${paperH}mm;overflow:hidden;box-sizing:border-box;display:inline-block;vertical-align:top;">${fieldDivs}</div>`
}

function buildPrintHtml(labels, layout) {
  const { paperW, paperH, cols } = layout
  const labelW = cols === 2 ? paperW / 2 : paperW
  let pages = ''
  for (let i = 0; i < labels.length; i += cols) {
    const group = labels.slice(i, i + cols)
    const isLast = i + cols >= labels.length
    const labelsHtml = group.map(item => buildLabelHtml(item, layout, labelW)).join('')
    pages += `<div style="width:${paperW}mm;height:${paperH}mm;page-break-after:${isLast ? 'auto' : 'always'};overflow:hidden;">${labelsHtml}</div>`
  }
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
* { box-sizing: border-box; margin: 0; padding: 0; font-family: Arial, sans-serif; }
@page { size: ${paperW}mm ${paperH}mm; margin: 0; }
body { background: white; }
</style>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
</head><body>
${pages}
<script>
window.addEventListener('load', function() {
  try {
    document.querySelectorAll('[data-barcode]').forEach(function(el) {
      var code = el.getAttribute('data-barcode')
      if (!code || !window.JsBarcode) return
      JsBarcode(el, code, { format: 'CODE128', displayValue: false, width: parseFloat(el.getAttribute('data-bw')) || 1.5, height: parseFloat(el.getAttribute('data-bh')) || 35, margin: 2, textMargin: 0 })
      // JsBarcode seta width/height em px — captura como viewBox e reseta para 100%
      var w = el.width && el.width.baseVal ? el.width.baseVal.value : 200
      var h = el.height && el.height.baseVal ? el.height.baseVal.value : 60
      if (!el.getAttribute('viewBox')) el.setAttribute('viewBox', '0 0 ' + w + ' ' + h)
      el.setAttribute('width', '100%')
      el.setAttribute('height', '100%')
      el.setAttribute('preserveAspectRatio', 'xMidYMid meet')
    })
  } catch(e) {}
  window.print()
})
<\/script>
</body></html>`
}

export default function EtiquetasPage() {
  const { profile } = useAuth()
  const tenantId = profile?.tenant_id

  const [layout, setLayout] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
      if (!saved) return DEFAULT_LAYOUT
      // Merge: defaults first, then saved values override; garante height/align nos campos
      const mergedFields = DEFAULT_LAYOUT.fields.map(df => {
        const sf = (saved.fields || []).find(f => f.id === df.id)
        if (!sf) return df
        return { ...df, ...sf, height: sf.height > 0 ? sf.height : df.height }
      })
      return { ...DEFAULT_LAYOUT, ...saved, fields: mergedFields }
    } catch { return DEFAULT_LAYOUT }
  })

  const [datasRaw,   setDatasRaw]   = useState([])
  const [dataFiltro, setDataFiltro] = useState('')
  const [liveOpts,   setLiveOpts]   = useState([])
  const [liveNome,   setLiveNome]   = useState('')
  const [rows,       setRows]       = useState([])
  const [filtro,     setFiltro]     = useState('')
  const [selected,   setSelected]   = useState({})
  const [qtds,       setQtds]       = useState({})
  const [fonte,      setFonte]      = useState('nao_vendidas')
  const [loading,    setLoading]    = useState(false)
  const [err,        setErr]        = useState(null)
  const [gerado,     setGerado]     = useState(false)

  useEffect(() => {
    if (!tenantId) return
    supabase
      .from('vendas').select('data_live')
      .eq('tenant_id', tenantId).not('data_live', 'is', null)
      .order('data_live', { ascending: false })
      .then(({ data }) => {
        const unicas = [...new Set((data || []).map(r => r.data_live))].slice(0, 90)
        setDatasRaw(unicas)
      })
  }, [tenantId])

  useEffect(() => {
    setLiveOpts([]); setLiveNome(''); setRows([]); setGerado(false); setSelected({}); setQtds({})
    if (!tenantId || !dataFiltro) return
    supabase
      .from('vendas').select('live_nome')
      .eq('tenant_id', tenantId).eq('data_live', dataFiltro).not('live_nome', 'is', null)
      .then(({ data }) => {
        const unicas = [...new Set((data || []).map(r => r.live_nome).filter(Boolean))].sort()
        setLiveOpts(unicas)
        if (unicas.length === 1) setLiveNome(unicas[0])
      })
  }, [tenantId, dataFiltro])

  const puxarVendas = useCallback(async (fonteOverride) => {
    if (!dataFiltro || !liveNome) { setErr('Selecione data e live.'); return }
    const fonteAtual = fonteOverride ?? fonte
    setLoading(true); setErr(null); setGerado(false); setRows([])
    try {
      const { data, error } = await supabase
        .from('vendas')
        .select('id, produto, modelo, cor, marca, tamanho, preco, codigo, cliente_nome')
        .eq('tenant_id', tenantId)
        .eq('data_live', dataFiltro)
        .eq('live_nome', liveNome)
      if (error) throw error
      const allRows = (data || []).map(r => ({
        uid:         r.id,
        codigo:      r.codigo || '',
        desc:        [r.produto, r.modelo, r.cor, r.marca, r.tamanho].filter(Boolean).join(' '),
        preco:       r.preco,
        precoFmt:    fmtPreco(r.preco),
        clienteNome: r.cliente_nome || '',
      }))
      const processed = fonteAtual === 'nao_vendidas'
        ? allRows.filter(r => !r.clienteNome.trim())
        : allRows.filter(r => !!r.clienteNome.trim())
      setRows(processed)
      const sel = {}; const q = {}
      processed.forEach(r => { sel[r.uid] = true; q[r.uid] = 1 })
      setSelected(sel); setQtds(q); setGerado(true)
    } catch (e) {
      setErr(e.message || 'Erro ao carregar.')
    } finally {
      setLoading(false)
    }
  }, [tenantId, dataFiltro, liveNome, fonte])

  const terms = filtro.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
  const filteredRows = rows.filter(r => {
    if (!terms.length) return true
    const hay = [r.desc, r.codigo, r.precoFmt].join(' ').toLowerCase()
    return terms.every(t => hay.includes(t))
  })

  const allChecked = filteredRows.length > 0 && filteredRows.every(r => selected[r.uid])

  function toggleAll() {
    const next = !allChecked
    setSelected(prev => {
      const updated = { ...prev }
      filteredRows.forEach(r => { updated[r.uid] = next })
      return updated
    })
  }

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))
  }, [layout])

  function updatePaper(key, val) {
    setLayout(prev => ({ ...prev, [key]: parseFloat(val) || 0 }))
  }

  function updateField(idx, key, val) {
    setLayout(prev => {
      const fields = [...prev.fields]
      fields[idx] = { ...fields[idx], [key]: val }
      return { ...prev, fields }
    })
  }

  function moveField(idx, dir) {
    setLayout(prev => {
      const fields = [...prev.fields]
      const target = idx + dir
      if (target < 0 || target >= fields.length) return prev
      ;[fields[idx], fields[target]] = [fields[target], fields[idx]]
      return { ...prev, fields }
    })
  }

  function imprimir() {
    const selecionados = filteredRows.filter(r => selected[r.uid])
    if (!selecionados.length) { setErr('Selecione ao menos um item.'); return }
    const labels = []
    selecionados.forEach(r => {
      const qty = Math.max(1, parseInt(qtds[r.uid]) || 1)
      for (let i = 0; i < qty; i++) labels.push(r)
    })
    const html = buildPrintHtml(labels, layout)
    const win = window.open('', '_blank')
    if (!win) { setErr('Pop-ups bloqueados. Permita pop-ups para imprimir.'); return }
    win.document.write(html)
    win.document.close()
  }

  function limpar() {
    setDataFiltro(''); setLiveNome(''); setRows([])
    setGerado(false); setSelected({}); setQtds({}); setFiltro(''); setErr(null)
  }

  return (
    <AppShell flush hideTitle>
      <div className="eti-page">

        {/* ── Sidebar ── */}
        <aside className="eti-sidebar">
          <div className="eti-sidebar-title">Layout da Etiqueta</div>

          <div className="eti-section">
            <div className="eti-section-label">PAPEL (mm)</div>
            <div className="eti-grid2">
              <div className="eti-pi">
                <label>Largura</label>
                <input type="number" value={layout.paperW} min={10} max={300}
                  onChange={e => updatePaper('paperW', e.target.value)} />
              </div>
              <div className="eti-pi">
                <label>Altura</label>
                <input type="number" value={layout.paperH} min={10} max={300}
                  onChange={e => updatePaper('paperH', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="eti-section">
            <div className="eti-section-label">COLUNAS</div>
            <div className="eti-cols-btns">
              <button className={`eti-col-btn${layout.cols === 1 ? ' active' : ''}`}
                onClick={() => setLayout(p => ({ ...p, cols: 1 }))}>1 coluna</button>
              <button className={`eti-col-btn${layout.cols === 2 ? ' active' : ''}`}
                onClick={() => setLayout(p => ({ ...p, cols: 2 }))}>2 colunas</button>
            </div>
          </div>

          <div className="eti-section-label">CAMPOS</div>

          {layout.fields.map((f, i) => (
            <div key={f.id} className="eti-field-card">
              <div className="eti-field-header">
                <label className="eti-field-toggle">
                  <input type="checkbox" checked={f.show}
                    onChange={e => updateField(i, 'show', e.target.checked)} />
                  <span>{f.label}</span>
                </label>
                <div className="eti-move-btns">
                  <button className="eti-move-btn" onClick={() => moveField(i, -1)} disabled={i === 0}>▲</button>
                  <button className="eti-move-btn" onClick={() => moveField(i, 1)} disabled={i === layout.fields.length - 1}>▼</button>
                </div>
              </div>
              {f.show && (
                <div className="eti-field-body">
                  {f.id === 'textoLivre' && (
                    <input className="eti-text-input" type="text" value={f.text}
                      onChange={e => updateField(i, 'text', e.target.value)}
                      placeholder="Texto fixo..." />
                  )}
                  <div className="eti-grid2">
                    <div className="eti-pi"><label>Topo</label>
                      <input type="number" value={f.top} onChange={e => updateField(i, 'top', parseFloat(e.target.value) || 0)} /></div>
                    <div className="eti-pi"><label>Marg.E</label>
                      <input type="number" value={f.left} onChange={e => updateField(i, 'left', parseFloat(e.target.value) || 0)} /></div>
                    <div className="eti-pi"><label>Larg</label>
                      <input type="number" value={f.width} onChange={e => updateField(i, 'width', parseFloat(e.target.value) || 0)} /></div>
                    <div className="eti-pi"><label>Alt (mm)</label>
                      <input type="number" value={f.height} onChange={e => updateField(i, 'height', parseFloat(e.target.value) || 0)} /></div>
                    {f.id !== 'barcode' && (
                      <div className="eti-pi"><label>Fonte (pt)</label>
                        <input type="number" value={f.fontSize} onChange={e => updateField(i, 'fontSize', parseFloat(e.target.value) || 0)} /></div>
                    )}
                    {f.id === 'barcode' && (<>
                      <div className="eti-pi"><label>Esp. barra</label>
                        <input type="number" step="0.1" value={f.barWidth}
                          onChange={e => updateField(i, 'barWidth', parseFloat(e.target.value) || 1)} /></div>
                      <div className="eti-pi"><label>Alt barras (px)</label>
                        <input type="number" min={5} value={f.barHeight ?? 35}
                          onChange={e => updateField(i, 'barHeight', parseFloat(e.target.value) || 20)} /></div>
                    </>)}
                  </div>
                  {f.id !== 'barcode' && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                      <button
                        className={`eti-col-btn${(f.align || 'center') === 'left' ? ' active' : ''}`}
                        onClick={() => updateField(i, 'align', 'left')}
                        style={{ flex: 1 }}>
                        ≡ Esquerda
                      </button>
                      <button
                        className={`eti-col-btn${(f.align || 'center') === 'center' ? ' active' : ''}`}
                        onClick={() => updateField(i, 'align', 'center')}
                        style={{ flex: 1 }}>
                        ⊙ Centro
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

        </aside>

        {/* ── Content ── */}
        <div className="eti-content">

          {/* Toolbar */}
          <div className="sacol-toolbar">
            <div className="sacol-field" style={{ flex: '0 0 160px' }}>
              <label>DATA DA LIVE</label>
              <DateSearchInput value={dataFiltro} onChange={setDataFiltro}
                options={datasRaw} placeholder="DD/MM/AAAA" />
            </div>
            {liveOpts.length >= 1 && (
              <div className="sacol-field" style={{ flex: '0 0 180px' }}>
                <label>LIVE</label>
                <SearchableSelect value={liveNome} onChange={setLiveNome}
                  options={liveOpts} emptyLabel="-- Selecione a live --" />
              </div>
            )}
            <div className="sacol-field" style={{ flex: '0 0 auto' }}>
              <label>PEÇAS</label>
              <div style={{ display: 'flex', gap: 4, height: 44 }}>
                <button
                  className={`sacol-btn${fonte === 'nao_vendidas' ? ' sacol-btn-green' : ' sacol-btn-ghost'}`}
                  onClick={() => { setFonte('nao_vendidas'); if (dataFiltro && liveNome) puxarVendas('nao_vendidas') }}
                  style={{ fontSize: 13, padding: '0 12px' }}
                >
                  Não Vendidas
                </button>
                <button
                  className={`sacol-btn${fonte === 'vendidas' ? ' sacol-btn-green' : ' sacol-btn-ghost'}`}
                  onClick={() => { setFonte('vendidas'); if (dataFiltro && liveNome) puxarVendas('vendidas') }}
                  style={{ fontSize: 13, padding: '0 12px' }}
                >
                  Vendidas
                </button>
              </div>
            </div>
            <div className="sacol-actions">
              <button className="sacol-btn sacol-btn-green" onClick={puxarVendas}
                disabled={loading || !dataFiltro || !liveNome}>
                {loading ? 'Carregando…' : 'Puxar'}
              </button>
              <button className="sacol-btn sacol-btn-blue" onClick={imprimir} disabled={!gerado}>
                Imprimir
              </button>
              <button className="sacol-btn sacol-btn-ghost" onClick={limpar}>
                Limpar
              </button>
            </div>
            {err && <span style={{ color: '#f28b82', fontSize: 13, alignSelf: 'center' }}>{err}</span>}
          </div>

          {/* Filter */}
          {gerado && (
            <div className="eti-filter-bar">
              <input className="eti-filter-input" type="text" value={filtro}
                onChange={e => setFiltro(e.target.value)}
                placeholder="Filtrar por produto, código, preço… (separe termos por vírgula)" />
            </div>
          )}

          {/* Table */}
          <div className="eti-table-wrap">
            {!gerado && (
              <div className="pedidos-placeholder">Selecione data e live e clique em Puxar Vendas.</div>
            )}
            {gerado && filteredRows.length === 0 && (
              <div className="pedidos-placeholder">Nenhum item encontrado.</div>
            )}
            {gerado && filteredRows.length > 0 && (
              <table className="eti-table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>
                      <input type="checkbox" checked={allChecked} onChange={toggleAll} />
                    </th>
                    <th style={{ width: 64 }}>QTD</th>
                    <th>DESCRIÇÃO</th>
                    <th style={{ width: 84 }}>PREÇO</th>
                    <th style={{ width: 100 }}>CÓDIGO</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map(r => (
                    <tr key={r.uid} className={selected[r.uid] ? '' : 'eti-row-off'}>
                      <td>
                        <input type="checkbox" checked={!!selected[r.uid]}
                          onChange={e => setSelected(prev => ({ ...prev, [r.uid]: e.target.checked }))} />
                      </td>
                      <td>
                        <input className="eti-qty" type="number" min={1} max={99}
                          value={qtds[r.uid] ?? 1}
                          onChange={e => setQtds(prev => ({ ...prev, [r.uid]: parseInt(e.target.value) || 1 }))}
                          disabled={!selected[r.uid]} />
                      </td>
                      <td>{r.desc}</td>
                      <td>{r.precoFmt}</td>
                      <td>{r.codigo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
