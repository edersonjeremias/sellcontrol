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

  // Busca lista de vendedoras (lives) únicas
  useEffect(() => {
    if (!tenantId) return
    const fetchVendedoras = async () => {
      const { data } = await supabase
        .from('vendas')
        .select('live_nome')
        .eq('tenant_id', tid(tenantId))
        .not('live_nome', 'is', null)
        .order('live_nome')

      if (data) {
        const unique = [...new Set(data.map(v => v.live_nome).filter(Boolean))]
        setVendedoras(unique)
      }
    }
    fetchVendedoras()
  }, [tenantId])

  // Busca vendas e agrupa
  async function buscar() {
    if (!tenantId) return
    if (!dataInicio || !dataFim) {
      showToast('Selecione o período', 'error')
      return
    }

    setCarregando(true)
    try {
      let query = supabase
        .from('vendas')
        .select('data_live, live_nome, preco, preco_promocional, status')
        .eq('tenant_id', tid(tenantId))
        .gte('data_live', dataInicio)
        .lte('data_live', dataFim)
        .in('status', ['ENVIADO', 'Vendido', 'VENDIDO', 'CANCELADO'])

      if (vendedoraSel) {
        query = query.eq('live_nome', vendedoraSel)
      }

      const { data: vendas, error } = await query

      if (error) throw error

      // Agrupar por data + vendedora
      const grouped = {}
      ;(vendas || []).forEach(v => {
        const key = `${v.data_live}|${v.live_nome || '(sem live)'}`
        if (!grouped[key]) {
          grouped[key] = {
            data: v.data_live,
            vendedora: v.live_nome || '(sem live)',
            bruto: 0,
            cancelado: 0
          }
        }

        // Usa preço promocional se existir, senão usa preço normal
        const valor = Number(v.preco_promocional || v.preco) || 0
        grouped[key].bruto += valor

        const status = (v.status || '').toUpperCase()
        if (status === 'CANCELADO' || status.includes('CANCEL')) {
          grouped[key].cancelado += valor
        }
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
      <div style={{ padding: 16 }} data-print-area>
        {/* Cabeçalho para impressão - só aparece ao imprimir */}
        <div className="hidden print:block" style={{ marginBottom: 16, textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#000', marginBottom: 4 }}>
            Relatório de Comissões
          </h1>
          <p style={{ fontSize: 12, color: '#666' }}>
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
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-light)' }}>
                  <th style={{ padding: '10px 8px', textAlign: 'left', color: 'var(--text-header)', fontWeight: 600 }}>Data</th>
                  <th style={{ padding: '10px 8px', textAlign: 'left', color: 'var(--text-header)', fontWeight: 600 }}>Vendedora (Live)</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--text-header)', fontWeight: 600 }}>Vendido Bruto</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--text-header)', fontWeight: 600 }}>Cancelados</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--text-header)', fontWeight: 600 }}>Líquido Base</th>
                  <th className="print:hidden" style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--text-header)', fontWeight: 600 }}>% Comissão</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--text-header)', fontWeight: 600 }}>Valor a Pagar</th>
                </tr>
              </thead>
              <tbody>
                {dados.map(item => (
                  <tr key={item.chave} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '8px', color: 'var(--text-body)' }}>{fmtData(item.data)}</td>
                    <td style={{ padding: '8px', color: 'var(--text-body)' }}>{item.vendedora}</td>
                    <td style={{ padding: '8px', textAlign: 'right', color: 'var(--blue)', fontWeight: 600 }}>{fmtR(item.bruto)}</td>
                    <td style={{ padding: '8px', textAlign: 'right', color: 'var(--red)', fontWeight: 600 }}>{fmtR(item.cancelado)}</td>
                    <td style={{ padding: '8px', textAlign: 'right', color: 'var(--green)', fontWeight: 700 }}>{fmtR(item.liquido)}</td>
                    <td className="print:hidden" style={{ padding: '8px', textAlign: 'center' }}>
                      <input
                        type="number"
                        value={comissoes[item.chave] || 0}
                        onChange={e => setComissao(item.chave, e.target.value)}
                        style={{
                          width: 70,
                          background: 'var(--input-bg)',
                          border: '1px solid var(--input-border)',
                          borderRadius: 4,
                          color: 'var(--input-text)',
                          padding: '4px 6px',
                          fontSize: 12,
                          textAlign: 'center'
                        }}
                        min="0"
                        max="100"
                        step="0.1"
                      />
                    </td>
                    <td style={{ padding: '8px', textAlign: 'right', color: 'var(--yellow)', fontWeight: 700 }}>
                      {fmtR(calcValorPagar(item.liquido, item.chave))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '3px solid var(--border-light)', background: 'rgba(138,180,248,0.05)' }}>
                  <th colSpan="2" style={{ padding: '12px 8px', textAlign: 'left', color: 'var(--text-header)', fontWeight: 700 }}>TOTAIS:</th>
                  <th style={{ padding: '12px 8px', textAlign: 'right', color: 'var(--blue)', fontWeight: 700, fontSize: 14 }}>{fmtR(totais.bruto)}</th>
                  <th style={{ padding: '12px 8px', textAlign: 'right', color: 'var(--red)', fontWeight: 700, fontSize: 14 }}>{fmtR(totais.cancelado)}</th>
                  <th style={{ padding: '12px 8px', textAlign: 'right', color: 'var(--green)', fontWeight: 700, fontSize: 14 }}>{fmtR(totais.liquido)}</th>
                  <th className="print:hidden" style={{ padding: '12px 8px' }}></th>
                  <th style={{ padding: '12px 8px', textAlign: 'right', color: 'var(--yellow)', fontWeight: 700, fontSize: 14 }}>{fmtR(totais.comissao)}</th>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Estilos para impressão */}
      <style>{`
        @media print {
          /* Esconde tudo do sistema */
          .app-container,
          .app-drawer,
          .app-drawer-overlay,
          .app-header,
          nav,
          header {
            display: none !important;
          }

          /* Ajusta o corpo da página */
          body {
            background: white !important;
            margin: 0 !important;
            padding: 10mm !important;
          }

          /* Força o conteúdo a ocupar toda largura */
          body * {
            visibility: hidden;
          }

          /* Mostra apenas o conteúdo da impressão */
          [data-print-area],
          [data-print-area] * {
            visibility: visible !important;
          }

          [data-print-area] {
            position: absolute;
            left: 0;
            top: 0;
            width: 100% !important;
            max-width: 100% !important;
          }

          /* Ajusta tabela */
          table {
            width: 100% !important;
            font-size: 11px !important;
            color: #000 !important;
            border-collapse: collapse !important;
          }

          table th {
            color: #000 !important;
            border-bottom: 2px solid #333 !important;
            padding: 6px 4px !important;
            font-size: 10px !important;
          }

          table td {
            color: #000 !important;
            border-bottom: 1px solid #ddd !important;
            padding: 5px 4px !important;
            font-size: 11px !important;
          }

          table tfoot th {
            border-top: 3px solid #000 !important;
            background: #f5f5f5 !important;
            padding: 8px 4px !important;
          }

          /* Ajusta larguras das colunas */
          table th:nth-child(1),
          table td:nth-child(1) {
            width: 12% !important;
          }

          table th:nth-child(2),
          table td:nth-child(2) {
            width: 20% !important;
          }

          table th:nth-child(3),
          table td:nth-child(3),
          table th:nth-child(4),
          table td:nth-child(4),
          table th:nth-child(5),
          table td:nth-child(5),
          table th:nth-child(6),
          table td:nth-child(6) {
            width: 17% !important;
          }
        }
      `}</style>
    </AppShell>
  )
}
