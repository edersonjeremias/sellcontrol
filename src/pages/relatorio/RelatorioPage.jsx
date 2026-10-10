import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import AppShell from '../../components/ui/AppShell'
import { fmtR, getVendasRelatorio } from '../../services/relatorioService'
import { getStatusExpedicao } from '../../services/statusExpedicaoService'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

const S = {
  inp: { background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:6, color:'var(--input-text)', padding:'7px 10px', fontSize:13, outline:'none' },
  th:  { background:'var(--table-header-bg)', color:'var(--table-header-text)', fontSize:11, fontWeight:700, textAlign:'left', padding:'8px 10px', textTransform:'uppercase', letterSpacing:'0.4px', whiteSpace:'nowrap' },
  td:  { padding:'7px 10px', color:'var(--text-body)', fontSize:12, whiteSpace:'nowrap' },
  btn: { background:'var(--blue)', color:'#0f0f0f', border:'none', borderRadius:6, padding:'8px 16px', fontWeight:700, cursor:'pointer', fontSize:13 },
}

const STATUS_COR = { CANCELADO:'var(--red)', DEVOLVIDO:'var(--yellow)', ENVIADO:'var(--green)' }

function fmtData(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

function primeiroDiaMes() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`
}

function ultimoDiaMes() {
  const d = new Date()
  const fim = new Date(d.getFullYear(), d.getMonth()+1, 0)
  return `${fim.getFullYear()}-${String(fim.getMonth()+1).padStart(2,'0')}-${String(fim.getDate()).padStart(2,'0')}`
}

export default function RelatorioPage() {
  const { profile }   = useAuth()
  const { showToast } = useApp()
  const tenantId      = profile?.tenant_id

  const [dataIni, setDataIni]       = useState(primeiroDiaMes)
  const [dataFim, setDataFim]       = useState(ultimoDiaMes)
  const [busca, setBusca]           = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos') // 'todos' | 'vendidos' | 'cadastrados' | 'ENVIADO' | 'CANCELADO' | 'DEVOLVIDO'
  const [filtroStatusExpedicao, setFiltroStatusExpedicao] = useState('todos') // Filtro de status da expedição
  const [statusExpedicaoList, setStatusExpedicaoList] = useState([]) // Lista de status de expedição
  const [vendasBase, setVendasBase] = useState([])  // todos do período (sem filtro de busca)
  const [carregando, setCarregando] = useState(false)

  // Carrega do servidor apenas por período (sem busca — busca é client-side)
  const carregar = useCallback(async () => {
    if (!tenantId) return
    setCarregando(true)
    try {
      const rows = await getVendasRelatorio(tenantId, { dataInicio: dataIni, dataFim })
      setVendasBase(rows)
    } catch { showToast('Erro ao carregar vendas.', 'error') }
    setCarregando(false)
  }, [tenantId, dataIni, dataFim, showToast])

  useEffect(() => { carregar() }, [carregar])

  // Carrega status de expedição disponíveis
  useEffect(() => {
    if (!tenantId) return
    getStatusExpedicao(tenantId)
      .then(setStatusExpedicaoList)
      .catch(() => {})
  }, [tenantId])

  // Filtro de busca aplicado CLIENT-SIDE em tempo real (sem chamada ao servidor)
  const vendas = useMemo(() => {
    let resultado = vendasBase

    // ✅ Filtro por STATUS (vendidos/cadastrados/ENVIADO/CANCELADO/DEVOLVIDO)
    if (filtroStatus === 'vendidos') {
      resultado = resultado.filter(v => {
        const st = (v.status || '').toUpperCase()
        return v.cliente_nome?.trim() && st !== 'CANCELADO' && st !== 'DEVOLVIDO'
      })
    } else if (filtroStatus === 'cadastrados') {
      resultado = resultado.filter(v => !v.cliente_nome?.trim())
    } else if (['ENVIADO', 'CANCELADO', 'DEVOLVIDO'].includes(filtroStatus)) {
      resultado = resultado.filter(v => (v.status || '').toUpperCase() === filtroStatus)
    }

    // ✅ Filtro por STATUS DA EXPEDIÇÃO (Comprar, Vendido, Comprar URGENTE, etc)
    if (filtroStatusExpedicao !== 'todos') {
      resultado = resultado.filter(v => (v.status || '') === filtroStatusExpedicao)
    }

    // ✅ Filtro por BUSCA
    const termo = busca.trim().toLowerCase()
    if (termo) {
      const termos = termo.split(/[,\s]+/).filter(Boolean)
      resultado = resultado.filter(v => {
        const txt = [v.produto, v.modelo, v.cor, v.marca, v.tamanho, v.cliente_nome, v.live_nome, v.codigo]
          .join(' ').toLowerCase()
        return termos.every(t => txt.includes(t))
      })
    }

    return resultado
  }, [vendasBase, busca, filtroStatus, filtroStatusExpedicao])

  // Soma TUDO que está na lista filtrada usando preço final (preco_promocional se houver, senão preco)
  const totalLiquido = vendas.reduce((s, v) => {
    const precoPromocional = Number(v.preco_promocional) || 0
    const preco = Number(v.preco) || 0
    return s + (precoPromocional > 0 ? precoPromocional : preco)
  }, 0)

  // Agrupa produtos iguais e conta quantidades
  const produtosAgrupados = useMemo(() => {
    const grupos = {}

    vendas.forEach(v => {
      const st = (v.status || '').toUpperCase()
      if (st === 'CANCELADO' || st === 'DEVOLVIDO') return

      const chave = [
        v.codigo || '',
        v.produto || '',
        v.modelo || '',
        v.marca || '',
        v.cor || '',
        v.tamanho || ''
      ].join('|')

      if (!grupos[chave]) {
        grupos[chave] = {
          codigo: v.codigo,
          produto: v.produto,
          modelo: v.modelo,
          marca: v.marca,
          cor: v.cor,
          tamanho: v.tamanho,
          quantidade: 0,
          preco: Number(v.preco) || 0
        }
      }
      grupos[chave].quantidade++
    })

    return Object.values(grupos).sort((a, b) => b.quantidade - a.quantidade)
  }, [vendas])

  const gerarPDF = () => {
    const doc = new jsPDF()

    // Título
    doc.setFontSize(16)
    doc.text('Relatório de Vendas - Agrupado', 14, 15)

    // Período
    doc.setFontSize(10)
    doc.text(`Período: ${fmtData(dataIni)} até ${fmtData(dataFim)}`, 14, 22)
    doc.text(`Total de produtos: ${produtosAgrupados.reduce((s, p) => s + p.quantidade, 0)}`, 14, 28)

    // Tabela
    const colunas = ['Qtd', 'Código', 'Produto', 'Modelo', 'Marca', 'Cor', 'Tam']
    const linhas = produtosAgrupados.map(p => [
      p.quantidade,
      p.codigo || '—',
      p.produto || '—',
      p.modelo || '—',
      p.marca || '—',
      p.cor || '—',
      p.tamanho || '—'
    ])

    doc.autoTable({
      head: [colunas],
      body: linhas,
      startY: 32,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [41, 128, 185], fontStyle: 'bold' },
      columnStyles: {
        0: { halign: 'center', cellWidth: 15 }, // Qtd
        1: { cellWidth: 20 }, // Código
        2: { cellWidth: 35 }, // Produto
        3: { cellWidth: 30 }, // Modelo
        4: { cellWidth: 30 }, // Marca
        5: { cellWidth: 25 }, // Cor
        6: { halign: 'center', cellWidth: 15 } // Tam
      }
    })

    // Salvar
    const nomeArquivo = `relatorio_${dataIni}_${dataFim}.pdf`
    doc.save(nomeArquivo)
  }

  const exportarExcel = () => {
    try {
      if (!vendas || vendas.length === 0) {
        showToast('Nenhuma venda para exportar!', 'error')
        return
      }

      // Cabeçalhos
      const headers = ['Data', 'Live', 'Cliente', 'Produto', 'Modelo', 'Marca', 'Cor', 'Tamanho', 'Código', 'Sacolinha', 'Preço', 'Status', 'ID', 'Created At', 'Data Live']

      // Converte dados para CSV
      const csvRows = []
      csvRows.push(headers.join(','))

      vendas.forEach(v => {
        const precoPromocional = Number(v.preco_promocional) || 0
        const preco = Number(v.preco) || 0
        const precoFinal = precoPromocional > 0 ? precoPromocional : preco

        const row = [
          `"${fmtData(v.data_live) || ''}"`,
          `"${v.live_nome || ''}"`,
          `"${v.cliente_nome || ''}"`,
          `"${v.produto || ''}"`,
          `"${v.modelo || ''}"`,
          `"${v.marca || ''}"`,
          `"${v.cor || ''}"`,
          `"${v.tamanho || ''}"`,
          `"${v.codigo || ''}"`,
          `"${v.sacolinha || ''}"`,
          precoFinal,
          `"${v.status || ''}"`,
          `"${v.id || ''}"`,
          `"${v.created_at || ''}"`,
          `"${v.data_live || ''}"`
        ]
        csvRows.push(row.join(','))
      })

      // Linha de total
      csvRows.push([
        '"TOTAL"', '""', '""', '""', '""', '""', '""', '""', '""', '""',
        totalLiquido, '""', '""', '""', '""'
      ].join(','))

      // Cria o CSV
      const csvContent = csvRows.join('\n')

      // Cria blob e download (funciona sem biblioteca!)
      const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `vendas_${dataIni}_${dataFim}.csv`
      link.click()
      URL.revokeObjectURL(url)

      showToast('CSV exportado! Abre no Excel e Google Sheets', 'success')
    } catch (error) {
      console.error('Erro ao exportar:', error)
      showToast(`Erro: ${error.message}`, 'error')
    }
  }

  return (
    <AppShell title="Relatório" hideTitle>
      {/* Filtros de período */}
      <div style={{ display:'flex', alignItems:'center', flexWrap:'wrap', gap:8, padding:'12px 16px', borderBottom:'1px solid var(--border-light)', background:'var(--header-bg)' }}>
        <span style={{ fontSize:14, fontWeight:700, color:'var(--text-header)' }}>Relatório de Vendas</span>
        <div style={{ flex:1 }} />
        <label style={{ fontSize:12, color:'var(--muted)' }}>De</label>
        <input type="date" value={dataIni} onChange={e => setDataIni(e.target.value)} style={S.inp} />
        <label style={{ fontSize:12, color:'var(--muted)' }}>Até</label>
        <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} style={S.inp} />
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} style={{ ...S.inp, minWidth:160 }}>
          <option value="todos">Todos</option>
          <option value="vendidos">✅ Vendidos</option>
          <option value="cadastrados">📦 Cadastrados</option>
          <option value="ENVIADO">📤 Enviado</option>
          <option value="CANCELADO">❌ Cancelado</option>
          <option value="DEVOLVIDO">↩️ Devolvido</option>
        </select>
        <select value={filtroStatusExpedicao} onChange={e => setFiltroStatusExpedicao(e.target.value)} style={{ ...S.inp, minWidth:160 }}>
          <option value="todos">📦 Status Expedição: Todos</option>
          {statusExpedicaoList.map(status => (
            <option key={status.id} value={status.nome}>{status.nome}</option>
          ))}
        </select>
        <button onClick={carregar} style={S.btn}>Filtrar</button>
        <button onClick={gerarPDF} style={{ ...S.btn, background:'var(--green)' }}>📄 Gerar PDF</button>
        <button onClick={exportarExcel} style={{ ...S.btn, background:'#217346' }}>Exportar</button>
      </div>

      {/* Contador de registros filtrados */}
      {!carregando && (
        <div style={{ padding:'8px 16px', background:'var(--bg-secondary)', borderBottom:'1px solid var(--border-light)' }}>
          <span style={{ fontSize:13, color:'var(--text-body)', fontWeight:600 }}>
            Total: {vendas.length} registro(s)
          </span>
          <span style={{ marginLeft:12, fontSize:13, color:'var(--green)', fontWeight:700 }}>
            • Soma: {fmtR(totalLiquido)}
          </span>
          {busca.trim() && (
            <span style={{ marginLeft:12, fontSize:12, color:'var(--muted)' }}>
              filtrado por "{busca.trim()}"
            </span>
          )}
        </div>
      )}

      <div style={{ padding:16 }}>
        {/* Busca inteligente em tempo real */}
        <div style={{ marginBottom:12 }}>
          <input
            placeholder="Busca inteligente: produto, cliente, live, código… (separe termos por vírgula ou espaço)"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            style={{ ...S.inp, width:'100%', fontSize:13 }}
          />
        </div>

        {carregando ? (
          <p style={{ color:'var(--muted)' }}>Carregando…</p>
        ) : (
          <>
            <div style={{ overflowX:'auto', maxHeight:'calc(100vh - 200px)', overflowY:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead style={{ position:'sticky', top:0, zIndex:10 }}>
                  <tr>
                    {['Data','Live','Cliente','Produto','Modelo','Marca','Cor','Tam','Cód.','Sacolinha','Preço','Status'].map(h => (
                      <th key={h} style={S.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vendas.map(v => (
                    <tr key={v.id} style={{ borderBottom:'1px solid var(--border-light)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--table-row-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}>
                      <td style={S.td}>{fmtData(v.data_live)}</td>
                      <td style={S.td}>{v.live_nome}</td>
                      <td style={S.td}>{v.cliente_nome}</td>
                      <td style={S.td}>{v.produto}</td>
                      <td style={S.td}>{v.modelo}</td>
                      <td style={S.td}>{v.marca}</td>
                      <td style={S.td}>{v.cor}</td>
                      <td style={S.td}>{v.tamanho}</td>
                      <td style={S.td}>{v.codigo}</td>
                      <td style={{ ...S.td, color: v.sacolinha ? 'var(--blue)' : 'var(--muted)' }}>
                        {v.sacolinha ?? '—'}
                      </td>
                      <td style={{ ...S.td, color:'var(--green)', fontWeight:600 }}>{fmtR(v.preco)}</td>
                      <td style={{ ...S.td, color: STATUS_COR[(v.status||'').toUpperCase()] || 'var(--muted)', fontSize:11 }}>
                        {v.status || '—'}
                      </td>
                    </tr>
                  ))}
                  {!vendas.length && (
                    <tr>
                      <td colSpan={12} style={{ textAlign:'center', padding:24, color:'var(--muted)' }}>
                        {busca.trim()
                          ? `Nenhum resultado para "${busca.trim()}"`
                          : 'Nenhum registro encontrado no período.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}
