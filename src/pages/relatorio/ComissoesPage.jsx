import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import AppShell from '../../components/ui/AppShell'
import { supabase } from '../../lib/supabase'

const tid = (tenantId) => tenantId || import.meta.env.VITE_TENANT_ID

// Formata valor monetário
function fmtR(val) {
  if (!val && val !== 0) return 'R$ 0,00'
  const n = typeof val === 'string' ? parseFloat(val.replace(/\./g, '').replace(',', '.')) : Number(val)
  if (isNaN(n)) return 'R$ 0,00'
  return 'R$ ' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

// Formata data para exibição
function fmtData(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export default function ComissoesPage() {
  const { profile } = useAuth()
  const { showToast } = useApp()
  const tenantId = profile?.tenant_id

  const hoje = new Date().toISOString().split('T')[0]
  const primeiroDia = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]

  const [dataInicio, setDataInicio] = useState(primeiroDia)
  const [dataFim, setDataFim] = useState(hoje)
  const [vendedoraSel, setVendedoraSel] = useState('')
  const [dados, setDados] = useState([])
  const [vendedoras, setVendedoras] = useState([])
  const [comissoes, setComissoes] = useState({}) // { "chave": percentual }
  const [carregando, setCarregando] = useState(false)
  const [nomeEmpresa, setNomeEmpresa] = useState('')

  // Busca nome da empresa
  useEffect(() => {
    if (!tenantId) return
    const fetchEmpresa = async () => {
      const { data } = await supabase
        .from('tenants')
        .select('name')
        .eq('id', tid(tenantId))
        .single()

      if (data) {
        setNomeEmpresa(data.name)
      }
    }
    fetchEmpresa()
  }, [tenantId])

  // Busca lista de vendedoras (lives) únicas do período selecionado
  async function atualizarVendedoras(dataIni, dataFi) {
    if (!tenantId) return

    // Busca TODAS as vendas com paginação
    let todasVendas = []
    let pagina = 0
    const TAMANHO_PAGINA = 1000

    while (true) {
      const { data, error } = await supabase
        .from('vendas')
        .select('live_nome')
        .eq('tenant_id', tid(tenantId))
        .gte('data_live', dataIni)
        .lte('data_live', dataFi)
        .not('live_nome', 'is', null)
        .range(pagina * TAMANHO_PAGINA, (pagina + 1) * TAMANHO_PAGINA - 1)

      if (error) break
      if (!data || data.length === 0) break

      todasVendas = todasVendas.concat(data)
      if (data.length < TAMANHO_PAGINA) break
      pagina++
    }

    const unique = [...new Set(todasVendas.map(v => v.live_nome).filter(Boolean))]
    setVendedoras(unique)
  }

  // Atualiza vendedoras quando muda o período
  useEffect(() => {
    if (tenantId && dataInicio && dataFim) {
      atualizarVendedoras(dataInicio, dataFim)
    }
  }, [tenantId, dataInicio, dataFim])

  // Busca vendas e agrupa
  async function buscar() {
    if (!tenantId) return
    if (!dataInicio || !dataFim) {
      showToast('Selecione o período', 'error')
      return
    }

    setCarregando(true)
    try {
      // Busca TODAS as vendas com paginação (Supabase limita a 1000 por página)
      let todasVendas = []
      let pagina = 0
      const TAMANHO_PAGINA = 1000

      while (true) {
        let query = supabase
          .from('vendas')
          .select('data_live, live_nome, preco, preco_promocional, status, created_at, cliente_nome')
          .eq('tenant_id', tid(tenantId))
          .or(`and(data_live.gte.${dataInicio},data_live.lte.${dataFim}),and(data_live.is.null,created_at.gte.${dataInicio}T00:00:00,created_at.lte.${dataFim}T23:59:59)`)
          .range(pagina * TAMANHO_PAGINA, (pagina + 1) * TAMANHO_PAGINA - 1)

        if (vendedoraSel) {
          query = query.eq('live_nome', vendedoraSel)
        }

        const { data, error } = await query
        if (error) throw error
        if (!data || data.length === 0) break

        todasVendas = todasVendas.concat(data)
        if (data.length < TAMANHO_PAGINA) break
        pagina++
      }

      const vendas = todasVendas

      // Agrupar por data + vendedora
      const grouped = {}
      ;(vendas || []).forEach(v => {
        // Filtra apenas vendas com cliente
        if (!(v.cliente_nome || '').trim()) return

        const status = (v.status || '').toUpperCase()

        // Ignora CANCELADOS e DEVOLVIDOS (mesma lógica do dashboard)
        if (status === 'CANCELADO' || status === 'DEVOLVIDO') return

        // Usa data_live se disponível, senão usa created_at
        let dataVenda = v.data_live
        if (!dataVenda && v.created_at) {
          dataVenda = v.created_at.slice(0, 10)
        }
        if (!dataVenda) return

        const key = `${dataVenda}|${v.live_nome || '(sem live)'}`
        if (!grouped[key]) {
          grouped[key] = {
            data: dataVenda,
            vendedora: v.live_nome || '(sem live)',
            bruto: 0,
            cancelado: 0
          }
        }

        // Usa preço promocional se existir, senão usa preço normal
        const valor = Number(v.preco_promocional || v.preco) || 0
        grouped[key].bruto += valor
      })

      // Converter para array e calcular líquido
      const resultado = Object.entries(grouped).map(([key, item]) => ({
        chave: key,
        data: item.data,
        vendedora: item.vendedora,
        bruto: item.bruto,
        cancelado: item.cancelado,
        liquido: item.bruto - item.cancelado
      }))

      resultado.sort((a, b) => a.data.localeCompare(b.data))
      setDados(resultado)

      if (!resultado.length) {
        showToast('Nenhuma venda encontrada no período', 'info')
      }
    } catch (e) {
      showToast('Erro ao buscar dados: ' + e.message, 'error')
      console.error(e)
    } finally {
      setCarregando(false)
    }
  }

  // Atualiza percentual de comissão
  function setComissao(chave, valor) {
    setComissoes(prev => ({ ...prev, [chave]: valor }))
  }

  // Calcula valor a pagar baseado no percentual
  function calcValorPagar(liquido, chave) {
    const percent = Number(comissoes[chave]) || 0
    return (liquido * percent) / 100
  }

  // Calcula totais
  const totais = dados.reduce((acc, item) => ({
    bruto: acc.bruto + item.bruto,
    cancelado: acc.cancelado + item.cancelado,
    liquido: acc.liquido + item.liquido,
    comissao: acc.comissao + calcValorPagar(item.liquido, item.chave)
  }), { bruto: 0, cancelado: 0, liquido: 0, comissao: 0 })

  // Imprimir PDF
  function imprimirPDF() {
    window.print()
  }

  const S = {
    inp: { background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 6, color: 'var(--input-text)', padding: '7px 10px', fontSize: 13, outline: 'none' }
  }

  return (
    <AppShell title="Relatório de Comissões" hideTitle>
      {/* Header - esconde na impressão */}
      <div className="print:hidden" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--border-light)', background: 'var(--header-bg)' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-header)' }}>Relatório de Comissões</span>
        <div style={{ flex: 1 }} />

        <label style={{ fontSize: 12, color: 'var(--muted)' }}>De:</label>
        <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} style={S.inp} />

        <label style={{ fontSize: 12, color: 'var(--muted)' }}>Até:</label>
        <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} style={S.inp} />

        <label style={{ fontSize: 12, color: 'var(--muted)' }}>Vendedora:</label>
        <select value={vendedoraSel} onChange={e => setVendedoraSel(e.target.value)} style={{ ...S.inp, width: 150 }}>
          <option value="">Todas</option>
          {vendedoras.map(v => <option key={v} value={v}>{v}</option>)}
        </select>

        <button onClick={buscar} disabled={carregando} style={{
          background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 6,
          padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: carregando ? 'wait' : 'pointer'
        }}>
          {carregando ? 'Buscando...' : '🔍 Buscar'}
        </button>

        {dados.length > 0 && (
          <button onClick={imprimirPDF} style={{
            background: '#9b59b6', color: '#fff', border: 'none', borderRadius: 6,
            padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer'
          }}>
            💾 Salvar PDF
          </button>
        )}
      </div>

      {/* Conteúdo principal */}
      <div style={{ padding: '8px 16px' }} data-print-area>
        {/* Cabeçalho para impressão - só aparece ao imprimir */}
        <div className="hidden print:block" style={{ marginBottom: 16, textAlign: 'center' }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#000', margin: '0 0 4px 0' }}>
            Relatório de Comissões{nomeEmpresa && ` - ${nomeEmpresa}`}
          </h1>
          <p style={{ fontSize: 11, color: '#666', margin: 0 }}>
            Período: {fmtData(dataInicio)} a {fmtData(dataFim)}
            {vendedoraSel && ` | Vendedora: ${vendedoraSel}`}
          </p>
        </div>

        {dados.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
            {carregando ? 'Carregando...' : 'Selecione o período e clique em Buscar'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', maxWidth: '1000px', margin: '0 auto', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-light)' }}>
                  <th style={{ padding: '8px 6px', textAlign: 'center', color: 'var(--text-header)', fontWeight: 600, fontSize: 11 }}>Data</th>
                  <th style={{ padding: '8px 6px', textAlign: 'center', color: 'var(--text-header)', fontWeight: 600, fontSize: 11 }}>Vend.</th>
                  <th style={{ padding: '8px 6px', textAlign: 'center', color: 'var(--text-header)', fontWeight: 600, fontSize: 11 }}>Bruto</th>
                  <th style={{ padding: '8px 6px', textAlign: 'center', color: 'var(--text-header)', fontWeight: 600, fontSize: 11 }}>Cancel.</th>
                  <th style={{ padding: '8px 6px', textAlign: 'center', color: 'var(--text-header)', fontWeight: 600, fontSize: 11 }}>Líquido</th>
                  <th style={{ padding: '8px 6px', textAlign: 'center', color: 'var(--text-header)', fontWeight: 600, fontSize: 11 }}>%</th>
                  <th style={{ padding: '8px 6px', textAlign: 'center', color: 'var(--text-header)', fontWeight: 600, fontSize: 11 }}>A Pagar</th>
                </tr>
              </thead>
              <tbody>
                {dados.map(item => (
                  <tr key={item.chave} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '6px', color: 'var(--text-body)', fontSize: 11 }}>{fmtData(item.data)}</td>
                    <td style={{ padding: '6px', color: 'var(--text-body)', fontSize: 11 }}>{item.vendedora}</td>
                    <td style={{ padding: '6px', textAlign: 'right', color: 'var(--blue)', fontWeight: 600, fontSize: 11 }}>{fmtR(item.bruto)}</td>
                    <td style={{ padding: '6px', textAlign: 'right', color: 'var(--red)', fontWeight: 600, fontSize: 11 }}>{fmtR(item.cancelado)}</td>
                    <td style={{ padding: '6px', textAlign: 'right', color: 'var(--green)', fontWeight: 700, fontSize: 11 }}>{fmtR(item.liquido)}</td>
                    <td style={{ padding: '6px', textAlign: 'center' }}>
                      <input
                        className="print:hidden"
                        type="number"
                        value={comissoes[item.chave] || 0}
                        onChange={e => setComissao(item.chave, e.target.value)}
                        style={{
                          width: 60,
                          background: 'var(--input-bg)',
                          border: '1px solid var(--input-border)',
                          borderRadius: 4,
                          color: 'var(--input-text)',
                          padding: '4px 6px',
                          fontSize: 11,
                          textAlign: 'center'
                        }}
                        min="0"
                        max="100"
                        step="0.1"
                      />
                      <span className="hidden print:inline" style={{ fontSize: 11 }}>{comissoes[item.chave] || 0} %</span>
                    </td>
                    <td style={{ padding: '6px', textAlign: 'right', color: 'var(--yellow)', fontWeight: 700, fontSize: 11 }}>
                      {fmtR(calcValorPagar(item.liquido, item.chave))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '3px solid var(--border-light)', background: 'rgba(138,180,248,0.05)' }}>
                  <th colSpan="2" style={{ padding: '10px 6px', textAlign: 'left', color: 'var(--text-header)', fontWeight: 700, fontSize: 12 }}>TOTAIS:</th>
                  <th style={{ padding: '10px 6px', textAlign: 'right', color: 'var(--blue)', fontWeight: 700, fontSize: 12 }}>{fmtR(totais.bruto)}</th>
                  <th style={{ padding: '10px 6px', textAlign: 'right', color: 'var(--red)', fontWeight: 700, fontSize: 12 }}>{fmtR(totais.cancelado)}</th>
                  <th style={{ padding: '10px 6px', textAlign: 'right', color: 'var(--green)', fontWeight: 700, fontSize: 12 }}>{fmtR(totais.liquido)}</th>
                  <th style={{ padding: '10px 6px' }}></th>
                  <th style={{ padding: '10px 6px', textAlign: 'right', color: 'var(--yellow)', fontWeight: 700, fontSize: 12 }}>{fmtR(totais.comissao)}</th>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Estilos para impressão */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm 8mm;
          }

          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          html, body {
            margin: 0;
            padding: 0;
            background: white;
          }

          .app-container,
          .app-drawer,
          .app-drawer-overlay,
          .app-header,
          nav,
          header {
            display: none !important;
          }

          body * {
            visibility: hidden;
          }

          [data-print-area],
          [data-print-area] * {
            visibility: visible !important;
          }

          [data-print-area] {
            position: absolute;
            left: 0;
            top: 0;
            width: 100% !important;
            padding: 0 !important;
          }

          /* Cabeçalho profissional */
          [data-print-area] h1 {
            font-size: 14px !important;
            font-weight: 700 !important;
            text-align: center !important;
            margin: 0 0 4px 0 !important;
            color: #1a1a1a !important;
            letter-spacing: 0.3px !important;
          }

          [data-print-area] p {
            font-size: 8px !important;
            text-align: center !important;
            margin: 0 0 8px 0 !important;
            color: #666 !important;
            padding-bottom: 6px !important;
            border-bottom: 1px solid #ddd !important;
          }

          /* Tabela clean e profissional */
          table {
            width: 100% !important;
            table-layout: fixed !important;
            border-collapse: collapse !important;
            margin-top: 6px !important;
            font-size: 7.5px !important;
            color: #1a1a1a !important;
            border: none !important;
          }

          /* Cabeçalho da tabela */
          table thead th {
            background: #f5f5f5 !important;
            border: none !important;
            border-bottom: 2px solid #333 !important;
            padding: 4px 3px !important;
            text-align: center !important;
            font-size: 7px !important;
            font-weight: 700 !important;
            color: #333 !important;
            text-transform: uppercase !important;
            letter-spacing: 0.3px !important;
          }

          /* Células do corpo */
          table tbody td {
            border: none !important;
            border-bottom: 1px solid #e0e0e0 !important;
            padding: 5px 3px !important;
            font-size: 7.5px !important;
            color: #1a1a1a !important;
            line-height: 1.2 !important;
          }

          /* Alinhamentos */
          table tbody td:nth-child(1) {
            text-align: center !important;
            font-weight: 600 !important;
          }

          table tbody td:nth-child(2) {
            text-align: center !important;
            padding-left: 3px !important;
          }

          table tbody td:nth-child(3),
          table tbody td:nth-child(4),
          table tbody td:nth-child(5),
          table tbody td:nth-child(7) {
            text-align: right !important;
            font-family: 'Courier New', monospace !important;
            padding-right: 4px !important;
          }

          table tbody td:nth-child(6) {
            text-align: center !important;
            font-weight: 600 !important;
          }

          /* Rodapé totais */
          table tfoot tr {
            background: #f9f9f9 !important;
          }

          table tfoot th {
            border: none !important;
            border-top: 2px solid #333 !important;
            border-bottom: 2px solid #333 !important;
            padding: 6px 3px !important;
            font-size: 8px !important;
            font-weight: 700 !important;
            color: #1a1a1a !important;
          }

          table tfoot th:nth-child(1),
          table tfoot th:nth-child(2) {
            text-align: center !important;
            padding-left: 3px !important;
          }

          table tfoot th:nth-child(3),
          table tfoot th:nth-child(4),
          table tfoot th:nth-child(5),
          table tfoot th:nth-child(7) {
            text-align: right !important;
            font-family: 'Courier New', monospace !important;
            padding-right: 4px !important;
          }

          table tfoot th:nth-child(6) {
            text-align: center !important;
          }

          /* Larguras otimizadas para A4 - mais compactas */
          table th:nth-child(1),
          table td:nth-child(1) {
            width: 10% !important;
          }

          table th:nth-child(2),
          table td:nth-child(2) {
            width: 11% !important;
          }

          table th:nth-child(3),
          table td:nth-child(3) {
            width: 15% !important;
          }

          table th:nth-child(4),
          table td:nth-child(4) {
            width: 13% !important;
          }

          table th:nth-child(5),
          table td:nth-child(5) {
            width: 15% !important;
          }

          table th:nth-child(6),
          table td:nth-child(6) {
            width: 7% !important;
          }

          table th:nth-child(7),
          table td:nth-child(7) {
            width: 15% !important;
          }

          /* Previne quebras */
          tr {
            page-break-inside: avoid !important;
          }
        }
      `}</style>
    </AppShell>
  )
}
