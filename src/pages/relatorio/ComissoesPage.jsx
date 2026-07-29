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
      // Busca vendas ENVIADAS/VENDIDAS e também CANCELADAS
      let query = supabase
        .from('vendas')
        .select('data_live, live_nome, preco, preco_promocional, status')
        .eq('tenant_id', tid(tenantId))
        .gte('data_live', dataInicio)
        .lte('data_live', dataFim)

      if (vendedoraSel) {
        query = query.eq('live_nome', vendedoraSel)
      }

      const { data: vendas, error } = await query

      if (error) throw error

      // Agrupar por data + vendedora
      const grouped = {}
      ;(vendas || []).forEach(v => {
        const status = (v.status || '').toUpperCase()

        // Só conta vendas enviadas/vendidas ou canceladas
        const isVendido = ['ENVIADO', 'VENDIDO'].includes(status)
        const isCancelado = status === 'CANCELADO' || status.includes('CANCEL')

        if (!isVendido && !isCancelado) return // Ignora vendas apenas cadastradas

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

        if (isCancelado) {
          grouped[key].cancelado += valor
        } else if (isVendido) {
          grouped[key].bruto += valor
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
      <div className="print:hidden flex items-center flex-wrap gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--border-light)', background: 'var(--header-bg)' }}>
        <span className="text-sm font-bold" style={{ color: 'var(--text-header)' }}>Relatório de Comissões</span>
        <div className="flex-1" />

        <label className="text-xs" style={{ color: 'var(--muted)' }}>De:</label>
        <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} style={S.inp} className="print:hidden" />

        <label className="text-xs" style={{ color: 'var(--muted)' }}>Até:</label>
        <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} style={S.inp} className="print:hidden" />

        <label className="text-xs" style={{ color: 'var(--muted)' }}>Vendedora:</label>
        <select value={vendedoraSel} onChange={e => setVendedoraSel(e.target.value)} style={{ ...S.inp, width: 150 }} className="print:hidden">
          <option value="">Todas</option>
          {vendedoras.map(v => <option key={v} value={v}>{v}</option>)}
        </select>

        <button onClick={buscar} disabled={carregando} className="print:hidden px-4 py-2 text-xs font-semibold text-white rounded-md" style={{ background: 'var(--blue)', cursor: carregando ? 'wait' : 'pointer' }}>
          {carregando ? 'Buscando...' : '🔍 Buscar'}
        </button>

        {dados.length > 0 && (
          <button onClick={imprimirPDF} className="print:hidden px-4 py-2 text-xs font-semibold text-white rounded-md" style={{ background: '#9b59b6' }}>
            💾 Salvar PDF
          </button>
        )}
      </div>

      {/* Conteúdo principal */}
      <div className="p-4">
        {/* Cabeçalho para impressão - só aparece ao imprimir */}
        <div className="hidden print:block text-center mb-6 pb-4 border-b-2 border-gray-300 print:text-black">
          <h1 className="text-lg font-bold text-black mb-1 print:text-black">
            Relatório de Comissões{nomeEmpresa && ` - ${nomeEmpresa}`}
          </h1>
          <p className="text-xs text-gray-600 print:text-black">
            Período: {fmtData(dataInicio)} a {fmtData(dataFim)}
            {vendedoraSel && ` | Vendedora: ${vendedoraSel}`}
          </p>
        </div>

        {dados.length === 0 ? (
          <div className="text-center py-10" style={{ color: 'var(--muted)' }}>
            {carregando ? 'Carregando...' : 'Selecione o período e clique em Buscar'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full max-w-4xl mx-auto border-collapse text-xs print:text-black print:border-gray-400">
              <thead className="bg-gray-800 print:bg-gray-200 print:text-black" style={{ colorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
                <tr>
                  <th className="border border-gray-300 print:border-gray-400 print:text-black print:p-2 px-2 py-2 text-left text-white print:text-black text-[11px] font-semibold">Data</th>
                  <th className="border border-gray-300 print:border-gray-400 print:text-black print:p-2 px-2 py-2 text-left text-white print:text-black text-[11px] font-semibold">Vendedora</th>
                  <th className="border border-gray-300 print:border-gray-400 print:text-black print:p-2 px-2 py-2 text-right text-white print:text-black text-[11px] font-semibold">Vendido Bruto</th>
                  <th className="border border-gray-300 print:border-gray-400 print:text-black print:p-2 px-2 py-2 text-right text-white print:text-black text-[11px] font-semibold">Cancelados</th>
                  <th className="border border-gray-300 print:border-gray-400 print:text-black print:p-2 px-2 py-2 text-right text-white print:text-black text-[11px] font-semibold">Líquido Base</th>
                  <th className="border border-gray-300 print:border-gray-400 print:text-black print:p-2 px-2 py-2 text-center text-white print:text-black text-[11px] font-semibold">% Com.</th>
                  <th className="border border-gray-300 print:border-gray-400 print:text-black print:p-2 px-2 py-2 text-right text-white print:text-black text-[11px] font-semibold">Valor a Pagar</th>
                </tr>
              </thead>
              <tbody>
                {dados.map(item => (
                  <tr key={item.chave}>
                    <td className="border border-gray-300 print:border-gray-400 print:text-black print:p-2 px-2 py-1.5 text-[11px]" style={{ color: 'var(--text-body)' }}>{fmtData(item.data)}</td>
                    <td className="border border-gray-300 print:border-gray-400 print:text-black print:p-2 px-2 py-1.5 text-[11px]" style={{ color: 'var(--text-body)' }}>{item.vendedora}</td>
                    <td className="border border-gray-300 print:border-gray-400 print:text-black print:p-2 px-2 py-1.5 text-right text-[11px] font-semibold" style={{ color: 'var(--blue)' }}>
                      <span className="print:text-black">{fmtR(item.bruto)}</span>
                    </td>
                    <td className="border border-gray-300 print:border-gray-400 print:text-black print:p-2 px-2 py-1.5 text-right text-[11px] font-semibold" style={{ color: 'var(--red)' }}>
                      <span className="print:text-black">{fmtR(item.cancelado)}</span>
                    </td>
                    <td className="border border-gray-300 print:border-gray-400 print:text-black print:p-2 px-2 py-1.5 text-right text-[11px] font-bold" style={{ color: 'var(--green)' }}>
                      <span className="print:text-black">{fmtR(item.liquido)}</span>
                    </td>
                    <td className="border border-gray-300 print:border-gray-400 print:text-black print:p-2 px-2 py-1.5 text-center">
                      <input
                        type="number"
                        value={comissoes[item.chave] || 0}
                        onChange={e => setComissao(item.chave, e.target.value)}
                        className="w-16 p-1 border rounded text-center text-[11px] print:border-none print:bg-transparent print:p-0 print:w-auto print:inline-block print:appearance-none print:text-black"
                        style={{
                          background: 'var(--input-bg)',
                          borderColor: 'var(--input-border)',
                          color: 'var(--input-text)'
                        }}
                        min="0"
                        max="100"
                        step="0.1"
                      />
                      <span className="print:inline text-[11px] print:text-black"> %</span>
                    </td>
                    <td className="border border-gray-300 print:border-gray-400 print:text-black print:p-2 px-2 py-1.5 text-right text-[11px] font-bold" style={{ color: 'var(--yellow)' }}>
                      <span className="print:text-black">{fmtR(calcValorPagar(item.liquido, item.chave))}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-blue-50 print:bg-gray-100" style={{ colorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
                <tr className="border-t-2 border-gray-400">
                  <th colSpan="2" className="border border-gray-300 print:border-gray-400 print:text-black print:p-2 px-2 py-2.5 text-left text-xs font-bold" style={{ color: 'var(--text-header)' }}>
                    <span className="print:text-black">TOTAIS:</span>
                  </th>
                  <th className="border border-gray-300 print:border-gray-400 print:text-black print:p-2 px-2 py-2.5 text-right text-xs font-bold" style={{ color: 'var(--blue)' }}>
                    <span className="print:text-black">{fmtR(totais.bruto)}</span>
                  </th>
                  <th className="border border-gray-300 print:border-gray-400 print:text-black print:p-2 px-2 py-2.5 text-right text-xs font-bold" style={{ color: 'var(--red)' }}>
                    <span className="print:text-black">{fmtR(totais.cancelado)}</span>
                  </th>
                  <th className="border border-gray-300 print:border-gray-400 print:text-black print:p-2 px-2 py-2.5 text-right text-xs font-bold" style={{ color: 'var(--green)' }}>
                    <span className="print:text-black">{fmtR(totais.liquido)}</span>
                  </th>
                  <th className="border border-gray-300 print:border-gray-400 print:text-black print:p-2 px-2 py-2.5"></th>
                  <th className="border border-gray-300 print:border-gray-400 print:text-black print:p-2 px-2 py-2.5 text-right text-xs font-bold" style={{ color: 'var(--yellow)' }}>
                    <span className="print:text-black">{fmtR(totais.comissao)}</span>
                  </th>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Estilos mínimos para impressão */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm;
          }

          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .app-container,
          .app-drawer,
          .app-drawer-overlay,
          .app-header,
          nav,
          header {
            display: none !important;
          }

          table {
            table-layout: fixed !important;
          }

          tr {
            page-break-inside: avoid;
          }
        }
      `}</style>
    </AppShell>
  )
}
