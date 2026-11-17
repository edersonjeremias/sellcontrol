import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import AppShell from '../../components/ui/AppShell'
import { jsPDF } from 'jspdf'
import 'jspdf-autotable'
import {
  getVendasFilaEspera,
  marcasDasVendas,
  agruparPorPeca,
  agruparPorProduto,
  agruparPorCliente,
  resumoFila,
  exibirCliente,
  fmtReal,
} from '../../services/filaEsperaService'
import './fila-espera.css'

// ============================================================================
// FILA DE ESPERA — relatório de compra
// ============================================================================
// Responde a pergunta da hora de comprar: o que o pessoal pediu e faltou.
// Cada nome em fila1/fila2/fila3 da venda é uma cliente que quis a peça e não
// levou, então a soma das filas é a quantidade que faltou no estoque.
//
//   Peças    — peça exata (cor e tamanho): é a linha que vira pedido
//   Grade    — o mesmo produto com a fila aberta por tamanho e por cor
//   Clientes — quem está esperando o quê, para avisar quando a peça entrar
// ============================================================================

const ABAS = [
  ['pecas',    'Peças'],
  ['grade',    'Grade'],
  ['clientes', 'Clientes'],
]

const S = {
  inp: { background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:6, color:'var(--input-text)', padding:'7px 10px', fontSize:13, outline:'none' },
  btn: { background:'var(--blue)', color:'#0f0f0f', border:'none', borderRadius:6, padding:'8px 16px', fontWeight:700, cursor:'pointer', fontSize:13 },
}

function fmtData(iso) {
  if (!iso) return '—'
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

// Começa nos últimos 60 dias: uma live só não dá base de compra, e o ano
// inteiro traz peça que saiu de linha
function hojeISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function faz60Dias() {
  const d = new Date()
  d.setDate(d.getDate() - 60)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export default function FilaEsperaPage() {
  const { profile }   = useAuth()
  const { showToast } = useApp()
  const tenantId      = profile?.tenant_id

  const [aba, setAba]         = useState('pecas')
  const [dataIni, setDataIni] = useState(faz60Dias)
  const [dataFim, setDataFim] = useState(hojeISO)
  const [marca, setMarca]     = useState('todas')
  const [minimo, setMinimo]   = useState('1')
  const [busca, setBusca]     = useState('')

  const [vendas, setVendas]       = useState([])
  const [carregando, setCarregando] = useState(false)
  const [isMobile, setIsMobile]   = useState(() => window.innerWidth <= 768)

  // O período vai ao banco; marca, mínimo e busca filtram na tela. Sem isso
  // cada tecla numa data dispararia uma consulta.
  const [aplicado, setAplicado] = useState(() => ({ dataInicio: faz60Dias(), dataFim: hojeISO() }))

  useEffect(() => {
    const aoRedimensionar = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', aoRedimensionar)
    return () => window.removeEventListener('resize', aoRedimensionar)
  }, [])

  const carregar = useCallback(async () => {
    if (!tenantId) return
    setCarregando(true)
    try {
      setVendas(await getVendasFilaEspera(tenantId, aplicado))
    } catch (e) {
      console.error('Fila de espera:', e)
      showToast('Erro ao carregar a fila de espera.', 'error')
    }
    setCarregando(false)
  }, [tenantId, aplicado, showToast])

  useEffect(() => { carregar() }, [carregar])

  const pendente = aplicado.dataInicio !== dataIni || aplicado.dataFim !== dataFim

  const aplicarFiltros = useCallback(() => {
    setAplicado({ dataInicio: dataIni, dataFim: dataFim })
  }, [dataIni, dataFim])

  const marcas = useMemo(() => marcasDasVendas(vendas), [vendas])

  // Marca e busca cortam as vendas ANTES de agregar: filtrar depois somaria a
  // fila de peça que a busca escondeu e o total não bateria com a lista
  const vendasFiltradas = useMemo(() => {
    let rows = vendas

    if (marca !== 'todas') {
      rows = rows.filter(v => String(v.marca || '').trim().toLowerCase() === marca.toLowerCase())
    }

    const termo = busca.trim().toLowerCase()
    if (termo) {
      const termos = termo.split(/[,\s]+/).filter(Boolean)
      rows = rows.filter(v => {
        const txt = [v.produto, v.modelo, v.marca, v.cor, v.tamanho, v.codigo,
                     v.cliente_nome, v.live_nome, v.fila1, v.fila2, v.fila3]
          .join(' ').toLowerCase()
        return termos.every(t => txt.includes(t))
      })
    }

    return rows
  }, [vendas, marca, busca])

  const resumo   = useMemo(() => resumoFila(vendasFiltradas), [vendasFiltradas])
  const minNum   = Math.max(1, Number(minimo) || 1)

  const linhasPecas = useMemo(
    () => agruparPorPeca(vendasFiltradas).filter(p => p.naFila >= minNum),
    [vendasFiltradas, minNum]
  )
  const linhasGrade = useMemo(
    () => agruparPorProduto(vendasFiltradas).filter(p => p.naFila >= minNum),
    [vendasFiltradas, minNum]
  )
  const linhasClientes = useMemo(() => agruparPorCliente(vendasFiltradas), [vendasFiltradas])

  const periodo = `${fmtData(aplicado.dataInicio)} a ${fmtData(aplicado.dataFim)}`

  // ── Exportações ───────────────────────────────────────────────────────────

  const gerarPDF = () => {
    const vazio = aba === 'clientes' ? !linhasClientes.length
      : aba === 'grade' ? !linhasGrade.length : !linhasPecas.length
    if (vazio) { showToast('Nada para imprimir nesta aba.', 'error'); return }

    const doc = new jsPDF()
    doc.setFontSize(15)
    doc.text('Fila de espera — o que faltou peça', 14, 15)
    doc.setFontSize(9)
    doc.text(`Período: ${periodo}`, 14, 22)
    doc.text(`Faltaram ${resumo.faltaram} peça(s) para ${resumo.clientes} cliente(s) · ${fmtReal(resumo.valorParado)} em venda não atendida`, 14, 27)

    let head, body, columnStyles

    if (aba === 'clientes') {
      head = [['Cliente', 'Peças', 'Esperando', 'Valor']]
      body = linhasClientes.map(c => [
        exibirCliente(c.cliente),
        String(c.quantas),
        c.pedidos.map(p => [p.produto, p.modelo, p.cor, p.tamanho].filter(Boolean).join(' ')).join(' | '),
        fmtReal(c.valorParado),
      ])
      columnStyles = { 0:{cellWidth:38}, 1:{cellWidth:14, halign:'center'}, 2:{cellWidth:'auto'}, 3:{cellWidth:24, halign:'right'} }
    } else if (aba === 'grade') {
      head = [['Comprar', 'Produto', 'Tamanhos', 'Cores', 'Vendidas', 'Valor']]
      body = linhasGrade.map(g => [
        String(g.naFila),
        g.nome,
        g.listaTamanhos.map(([t, n]) => `${t}:${n}`).join('  '),
        g.listaCores.map(([c, n]) => `${c}:${n}`).join('  '),
        String(g.vendidas),
        fmtReal(g.valorParado),
      ])
      columnStyles = { 0:{cellWidth:18, halign:'center', fontStyle:'bold'}, 1:{cellWidth:46}, 2:{cellWidth:38}, 3:{cellWidth:38}, 4:{cellWidth:18, halign:'center'}, 5:{cellWidth:24, halign:'right'} }
    } else {
      head = [['Comprar', 'Peça', 'Cor', 'Tam', 'Vendidas', 'Clientes esperando']]
      body = linhasPecas.map(p => [
        String(p.naFila),
        p.nome,
        p.cor || '—',
        p.tamanho || '—',
        String(p.vendidas),
        p.listaClientes.map(exibirCliente).join(', '),
      ])
      columnStyles = { 0:{cellWidth:18, halign:'center', fontStyle:'bold'}, 1:{cellWidth:44}, 2:{cellWidth:22}, 3:{cellWidth:14, halign:'center'}, 4:{cellWidth:18, halign:'center'}, 5:{cellWidth:'auto'} }
    }

    doc.autoTable({
      head, body, startY: 32,
      styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [41, 128, 185], fontStyle: 'bold' },
      columnStyles,
    })

    doc.save(`fila_espera_${aba}_${aplicado.dataInicio}_${aplicado.dataFim}.pdf`)
  }

  const exportarCSV = () => {
    const linhas = []
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`

    if (aba === 'clientes') {
      if (!linhasClientes.length) { showToast('Nada para exportar nesta aba.', 'error'); return }
      linhas.push(['Cliente','Peças esperando','Valor parado','Última live','Peças'].map(q).join(','))
      linhasClientes.forEach(c => linhas.push([
        q(exibirCliente(c.cliente)), c.quantas, c.valorParado.toFixed(2), q(fmtData(c.ultimaLive)),
        q(c.pedidos.map(p => [p.produto, p.modelo, p.cor, p.tamanho].filter(Boolean).join(' ')).join(' | ')),
      ].join(',')))
    } else if (aba === 'grade') {
      if (!linhasGrade.length) { showToast('Nada para exportar nesta aba.', 'error'); return }
      linhas.push(['Comprar','Produto','Modelo','Marca','Tamanhos','Cores','Vendidas','Clientes','Valor parado'].map(q).join(','))
      linhasGrade.forEach(g => linhas.push([
        g.naFila, q(g.produto), q(g.modelo), q(g.marca),
        q(g.listaTamanhos.map(([t, n]) => `${t}:${n}`).join(' ')),
        q(g.listaCores.map(([c, n]) => `${c}:${n}`).join(' ')),
        g.vendidas, g.pessoas, g.valorParado.toFixed(2),
      ].join(',')))
    } else {
      if (!linhasPecas.length) { showToast('Nada para exportar nesta aba.', 'error'); return }
      linhas.push(['Comprar','Produto','Modelo','Marca','Cor','Tamanho','Código','Preço','Vendidas','Clientes','Valor parado','Última live','Clientes esperando'].map(q).join(','))
      linhasPecas.forEach(p => linhas.push([
        p.naFila, q(p.produto), q(p.modelo), q(p.marca), q(p.cor), q(p.tamanho), q(p.codigo),
        p.preco.toFixed(2), p.vendidas, p.pessoas, p.valorParado.toFixed(2), q(fmtData(p.ultimaLive)),
        q(p.listaClientes.map(exibirCliente).join(' ')),
      ].join(',')))
    }

    const blob = new Blob(['﻿' + linhas.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `fila_espera_${aba}_${aplicado.dataInicio}_${aplicado.dataFim}.csv`
    link.click()
    URL.revokeObjectURL(url)
    showToast('CSV exportado. Abre no Excel e no Google Sheets.', 'success')
  }

  // Lista pronta para mandar no grupo do fornecedor
  const copiarLista = async () => {
    const fonte = aba === 'grade' ? linhasGrade : linhasPecas
    if (!fonte.length) { showToast('Nada para copiar nesta aba.', 'error'); return }

    const texto = aba === 'grade'
      ? fonte.map(g => `${g.naFila}x ${g.nome} — ${g.listaTamanhos.map(([t, n]) => `${t}:${n}`).join(' ')} — ${g.listaCores.map(([c, n]) => `${c}:${n}`).join(' ')}`).join('\n')
      : fonte.map(p => `${p.naFila}x ${p.nome}${p.cor ? ' ' + p.cor : ''}${p.tamanho ? ' tam ' + p.tamanho : ''}`).join('\n')

    const cabecalho = `Lista de compra — fila de espera (${periodo})\n\n`
    try {
      await navigator.clipboard.writeText(cabecalho + texto)
      showToast(`${fonte.length} item(ns) copiado(s).`, 'success')
    } catch {
      showToast('O navegador não liberou a área de transferência.', 'error')
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const abas = (
    <div className="fe-abas">
      {ABAS.map(([id, label]) => (
        <button key={id} className={`fe-aba${aba === id ? ' ativa' : ''}`} onClick={() => setAba(id)}>
          {label}
        </button>
      ))}
    </div>
  )

  const nenhumaVenda = !carregando && !vendas.length
  const semFila = !carregando && vendas.length > 0 && resumo.faltaram === 0

  function corpo() {
    if (carregando) return <p style={{ color:'var(--muted)' }}>Carregando…</p>
    if (nenhumaVenda) return <div className="fe-vazio">Nenhuma venda no período. Escolha outro período e clique em Filtrar.</div>
    if (semFila) {
      return (
        <div className="fe-vazio">
          Nenhuma cliente na fila de espera neste período — tudo que pediram tinha peça.
          <div style={{ marginTop:8, fontSize:11 }}>
            A fila é preenchida na tela de Vendas, no botão de fila da linha da peça.
          </div>
        </div>
      )
    }

    if (aba === 'clientes') return isMobile ? cardsClientes() : tabelaClientes()
    if (aba === 'grade')    return isMobile ? cardsGrade()    : tabelaGrade()
    return isMobile ? cardsPecas() : tabelaPecas()
  }

  // Peças ---------------------------------------------------------------
  function tabelaPecas() {
    return (
      <table className="fe-tabela">
        <thead>
          <tr>
            <th style={{ textAlign:'center' }}>Comprar</th>
            <th>Peça</th>
            <th>Cor</th>
            <th>Tam</th>
            <th>Cód.</th>
            <th style={{ textAlign:'center' }}>Vendidas</th>
            <th style={{ textAlign:'right' }}>Preço</th>
            <th style={{ textAlign:'right' }}>Venda parada</th>
            <th>Clientes esperando</th>
            <th>Última live</th>
          </tr>
        </thead>
        <tbody>
          {linhasPecas.map(p => (
            <tr key={p.k}>
              <td className="fe-comprar">{p.naFila}</td>
              <td className="fe-peca">{p.nome}</td>
              <td>{p.cor || '—'}</td>
              <td>{p.tamanho || '—'}</td>
              <td style={{ color:'var(--muted)' }}>{p.codigo || '—'}</td>
              <td className="fe-vendidas">{p.vendidas}</td>
              <td className="fe-num">{p.preco ? fmtReal(p.preco) : '—'}</td>
              <td className="fe-dinheiro">{fmtReal(p.valorParado)}</td>
              <td className="fe-livre">
                {p.listaClientes.map(c => (
                  <span key={c} className="fe-chip cliente">{exibirCliente(c)}</span>
                ))}
              </td>
              <td style={{ color:'var(--muted)' }}>{fmtData(p.ultimaLive)}</td>
            </tr>
          ))}
          {!linhasPecas.length && (
            <tr><td colSpan={10} className="fe-vazio">Nenhuma peça com fila de {minNum} ou mais.</td></tr>
          )}
        </tbody>
      </table>
    )
  }

  function cardsPecas() {
    return (
      <div className="fe-cards">
        {linhasPecas.map(p => (
          <div className="fe-mcard" key={p.k}>
            <div className="fe-mcard-topo">
              <span className="fe-mcard-nome">{p.nome}</span>
              <span className="fe-mcard-qtd">{p.naFila}x</span>
            </div>
            <div className="fe-mcard-linha">
              {p.cor && <span>{p.cor}</span>}
              {p.tamanho && <span>Tam {p.tamanho}</span>}
              <span>Vendidas: {p.vendidas}</span>
              <span style={{ color:'var(--green)' }}>{fmtReal(p.valorParado)} parados</span>
            </div>
            <div>
              {p.listaClientes.map(c => (
                <span key={c} className="fe-chip cliente">{exibirCliente(c)}</span>
              ))}
            </div>
          </div>
        ))}
        {!linhasPecas.length && <div className="fe-vazio">Nenhuma peça com fila de {minNum} ou mais.</div>}
      </div>
    )
  }

  // Grade ---------------------------------------------------------------
  function tabelaGrade() {
    return (
      <table className="fe-tabela">
        <thead>
          <tr>
            <th style={{ textAlign:'center' }}>Comprar</th>
            <th>Produto</th>
            <th>Marca</th>
            <th>Tamanhos que faltaram</th>
            <th>Cores que faltaram</th>
            <th style={{ textAlign:'center' }}>Vendidas</th>
            <th style={{ textAlign:'center' }}>Clientes</th>
            <th style={{ textAlign:'right' }}>Venda parada</th>
          </tr>
        </thead>
        <tbody>
          {linhasGrade.map(g => (
            <tr key={g.k}>
              <td className="fe-comprar">{g.naFila}</td>
              <td className="fe-peca">{[g.produto, g.modelo].filter(Boolean).join(' ') || '(sem nome)'}</td>
              <td>{g.marca || '—'}</td>
              <td className="fe-livre">
                {g.listaTamanhos.map(([t, n]) => (
                  <span key={t} className="fe-chip grade">{t} <b>{n}</b></span>
                ))}
              </td>
              <td className="fe-livre">
                {g.listaCores.map(([c, n]) => (
                  <span key={c} className="fe-chip cor">{c} <b>{n}</b></span>
                ))}
              </td>
              <td className="fe-vendidas">{g.vendidas}</td>
              <td className="fe-vendidas">{g.pessoas}</td>
              <td className="fe-dinheiro">{fmtReal(g.valorParado)}</td>
            </tr>
          ))}
          {!linhasGrade.length && (
            <tr><td colSpan={8} className="fe-vazio">Nenhum produto com fila de {minNum} ou mais.</td></tr>
          )}
        </tbody>
      </table>
    )
  }

  function cardsGrade() {
    return (
      <div className="fe-cards">
        {linhasGrade.map(g => (
          <div className="fe-mcard" key={g.k}>
            <div className="fe-mcard-topo">
              <span className="fe-mcard-nome">{g.nome}</span>
              <span className="fe-mcard-qtd">{g.naFila}x</span>
            </div>
            <div>
              {g.listaTamanhos.map(([t, n]) => (
                <span key={t} className="fe-chip grade">{t} <b>{n}</b></span>
              ))}
            </div>
            <div>
              {g.listaCores.map(([c, n]) => (
                <span key={c} className="fe-chip cor">{c} <b>{n}</b></span>
              ))}
            </div>
            <div className="fe-mcard-linha">
              <span>Vendidas: {g.vendidas}</span>
              <span>{g.pessoas} cliente(s)</span>
              <span style={{ color:'var(--green)' }}>{fmtReal(g.valorParado)}</span>
            </div>
          </div>
        ))}
        {!linhasGrade.length && <div className="fe-vazio">Nenhum produto com fila de {minNum} ou mais.</div>}
      </div>
    )
  }

  // Clientes ------------------------------------------------------------
  function tabelaClientes() {
    return (
      <table className="fe-tabela">
        <thead>
          <tr>
            <th>Cliente</th>
            <th style={{ textAlign:'center' }}>Peças esperando</th>
            <th>O que pediu e faltou</th>
            <th style={{ textAlign:'right' }}>Venda parada</th>
            <th>Última live</th>
          </tr>
        </thead>
        <tbody>
          {linhasClientes.map(c => (
            <tr key={c.k}>
              <td className="fe-peca">{exibirCliente(c.cliente)}</td>
              <td className="fe-comprar">{c.quantas}</td>
              <td className="fe-livre">
                {c.pedidos.map(p => (
                  <span key={p.id} className="fe-chip">
                    {[p.produto, p.modelo, p.cor].filter(Boolean).join(' ')}
                    {p.tamanho ? ` · ${p.tamanho}` : ''}
                  </span>
                ))}
              </td>
              <td className="fe-dinheiro">{fmtReal(c.valorParado)}</td>
              <td style={{ color:'var(--muted)' }}>{fmtData(c.ultimaLive)}</td>
            </tr>
          ))}
          {!linhasClientes.length && (
            <tr><td colSpan={5} className="fe-vazio">Nenhuma cliente na fila.</td></tr>
          )}
        </tbody>
      </table>
    )
  }

  function cardsClientes() {
    return (
      <div className="fe-cards">
        {linhasClientes.map(c => (
          <div className="fe-mcard" key={c.k}>
            <div className="fe-mcard-topo">
              <span className="fe-mcard-nome">{exibirCliente(c.cliente)}</span>
              <span className="fe-mcard-qtd">{c.quantas}x</span>
            </div>
            <div>
              {c.pedidos.map(p => (
                <span key={p.id} className="fe-chip">
                  {[p.produto, p.modelo, p.cor].filter(Boolean).join(' ')}
                  {p.tamanho ? ` · ${p.tamanho}` : ''}
                </span>
              ))}
            </div>
            <div className="fe-mcard-linha">
              <span style={{ color:'var(--green)' }}>{fmtReal(c.valorParado)}</span>
              <span>Última live: {fmtData(c.ultimaLive)}</span>
            </div>
          </div>
        ))}
        {!linhasClientes.length && <div className="fe-vazio">Nenhuma cliente na fila.</div>}
      </div>
    )
  }

  return (
    <AppShell title="Fila de Espera" hideTitle flush>
      <div className="fe-page">
        <div className="fe-filtros">
          <span className="fe-titulo">Fila de Espera</span>

          <div className="fe-f fe-f-busca">
            <label>Buscar</label>
            <input
              placeholder="produto, cor, tamanho, cliente…"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              style={S.inp}
            />
          </div>

          <div className="fe-f">
            <label>De</label>
            <input type="date" value={dataIni} onChange={e => setDataIni(e.target.value)} style={S.inp} />
          </div>

          <div className="fe-f">
            <label>Até</label>
            <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} style={S.inp} />
          </div>

          <div className="fe-f">
            <label>Marca</label>
            <select value={marca} onChange={e => setMarca(e.target.value)} style={{ ...S.inp, minWidth:120 }}>
              <option value="todas">Todas</option>
              {marcas.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className="fe-f">
            <label>Fila mínima</label>
            <select value={minimo} onChange={e => setMinimo(e.target.value)} style={{ ...S.inp, minWidth:90 }}>
              <option value="1">1 ou mais</option>
              <option value="2">2 ou mais</option>
              <option value="3">3 ou mais</option>
              <option value="5">5 ou mais</option>
            </select>
          </div>

          <div className="fe-acoes">
            <button
              onClick={aplicarFiltros}
              style={{ ...S.btn, ...(pendente ? { background:'var(--green)' } : {}) }}
              title={pendente ? 'O período mudou — clique para aplicar' : 'Período já aplicado'}
            >
              {pendente ? 'Filtrar •' : 'Filtrar'}
            </button>
            {aba !== 'clientes' && (
              <button onClick={copiarLista} style={{ ...S.btn, background:'var(--yellow)' }}>Copiar lista</button>
            )}
            <button onClick={gerarPDF} style={{ ...S.btn, background:'var(--green)' }}>PDF</button>
            <button onClick={exportarCSV} style={{ ...S.btn, background:'#217346', color:'#fff' }}>Exportar</button>
          </div>

          {abas}
        </div>

        <div className="fe-resumo">
          <div className="fe-card destaque">
            <div className="fe-card-label">Faltou peça</div>
            <div className="fe-card-valor">{resumo.faltaram}</div>
            <div className="fe-card-obs">pedidos sem atender</div>
          </div>
          <div className="fe-card">
            <div className="fe-card-label">Clientes na fila</div>
            <div className="fe-card-valor">{resumo.clientes}</div>
            <div className="fe-card-obs">para avisar quando chegar</div>
          </div>
          <div className="fe-card">
            <div className="fe-card-label">Peças diferentes</div>
            <div className="fe-card-valor">{resumo.pecas}</div>
            <div className="fe-card-obs">itens para repor</div>
          </div>
          <div className="fe-card dinheiro">
            <div className="fe-card-label">Venda parada</div>
            <div className="fe-card-valor">{fmtReal(resumo.valorParado)}</div>
            <div className="fe-card-obs">no preço da própria peça</div>
          </div>
          <div className="fe-card">
            <div className="fe-card-label">Demanda não atendida</div>
            <div className="fe-card-valor">{resumo.perdaPct.toFixed(1)}%</div>
            <div className="fe-card-obs">{resumo.vendidasTotal} vendidas no período</div>
          </div>
        </div>

        <div className="fe-conteudo">
          {corpo()}

          {!carregando && !nenhumaVenda && !semFila && (
            <div className="fe-legenda">
              <strong>Comprar</strong> é quanta gente ficou esperando aquela peça — uma unidade por nome na fila.
              {' '}<strong>Vendidas</strong> é quanto saiu no período, para dar a régua: 4 esperando numa peça que vendeu 2
              pede compra maior do que 4 numa que vendeu 30.
              {' '}<strong>Venda parada</strong> soma o preço de cada peça que faltou.
              {' '}A fila sai de fila1, fila2 e fila3 da tela de Vendas — o mesmo @ escrito com ou sem arroba conta como uma pessoa só.
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
