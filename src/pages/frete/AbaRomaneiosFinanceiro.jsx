import { useState, useEffect, useCallback, useMemo } from 'react'
import { fmtR } from '../../services/relatorioService'
import {
  getRomaneiosFinanceiro, marcarTransferido, salvarRecebidoManual, totaisRomaneios,
} from '../../services/freteFinanceiroService'
import {
  S, LABEL_STATUS, COR_STATUS, LABEL_METODO,
  primeiroDiaMes, ultimoDiaMes, fmtData, fmtDataHora,
  parseValor, mascaraValor, casaBusca,
} from './freteUi'

const IconEdit = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
const IconInfo = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>

const SITUACOES = [
  ['todos',      'Situação: todas'],
  ['a_transferir', 'A transferir'],
  ['transferidos', 'Já transferidos'],
  ['falta',      'Recebi menos que o frete'],
  ['sobra',      'Recebi mais que o frete'],
  ['sem_receber', 'Sem nada recebido'],
]

const CENT = 0.009 // tolerância de centavo nas comparações

function corDiferenca(d) {
  if (d > CENT) return 'var(--red)'
  if (d < -CENT) return 'var(--green)'
  return 'var(--muted)'
}

export default function AbaRomaneiosFinanceiro({ tenantId, showToast, profile, isMobile }) {
  const [dataIni, setDataIni] = useState(primeiroDiaMes)
  const [dataFim, setDataFim] = useState(ultimoDiaMes)
  const [situacao, setSituacao] = useState('todos')
  const [busca, setBusca] = useState('')

  // Só o período vai ao servidor. Busca e situação filtram o array local, para
  // seguir filtrando a cada tecla sem ida ao banco.
  const [aplicado, setAplicado] = useState(() => ({ dataIni: primeiroDiaMes(), dataFim: ultimoDiaMes() }))
  const [jaFiltrou, setJaFiltrou] = useState(false)

  const [linhas, setLinhas] = useState([])
  const [carregando, setCarregando] = useState(false)
  const [selecionados, setSelecionados] = useState(() => new Set())
  const [salvandoLote, setSalvandoLote] = useState(false)

  const [detalhe, setDetalhe] = useState(null)      // modal de detalhe do romaneio
  const [manual, setManual] = useState(null)        // { romaneio, valor, obs }
  const [salvandoManual, setSalvandoManual] = useState(false)

  const carregar = useCallback(async () => {
    if (!tenantId || !jaFiltrou) return
    setCarregando(true)
    try {
      setLinhas(await getRomaneiosFinanceiro(tenantId, aplicado))
      setSelecionados(new Set())
    } catch (e) {
      showToast('Erro ao carregar romaneios: ' + (e.message || ''), 'error')
    }
    setCarregando(false)
  }, [tenantId, aplicado, jaFiltrou, showToast])

  useEffect(() => { carregar() }, [carregar])

  const pendente = !jaFiltrou || aplicado.dataIni !== dataIni || aplicado.dataFim !== dataFim

  function aplicarFiltros() {
    setJaFiltrou(true)
    setAplicado({ dataIni, dataFim })
  }

  // ── Filtro em memória ─────────────────────────────────────────────────────
  const visiveis = useMemo(() => {
    return linhas.filter(l => {
      if (situacao === 'a_transferir' && (l.frete_transferido || l.recebido <= CENT)) return false
      if (situacao === 'transferidos' && !l.frete_transferido) return false
      if (situacao === 'falta' && l.diferenca <= CENT) return false
      if (situacao === 'sobra' && l.diferenca >= -CENT) return false
      if (situacao === 'sem_receber' && l.recebido > CENT) return false

      const texto = [
        l.numero, l.cliente_instagram, LABEL_STATUS[l.status] || l.status,
        l.transportadora, l.servico, l.codigo_rastreio, l.frete_recebido_obs,
        l.frete_transferido ? 'transferido' : 'pendente',
      ].join(' ')

      return casaBusca(texto, busca)
    })
  }, [linhas, situacao, busca])

  const totais = useMemo(() => totaisRomaneios(visiveis), [visiveis])

  const idsVisiveis = useMemo(() => visiveis.map(l => l.id), [visiveis])
  const selecionadosVisiveis = useMemo(
    () => idsVisiveis.filter(id => selecionados.has(id)),
    [idsVisiveis, selecionados]
  )
  const totalSelecionado = useMemo(() => {
    const sel = new Set(selecionadosVisiveis)
    return Number(visiveis.filter(l => sel.has(l.id)).reduce((s, l) => s + l.recebido, 0).toFixed(2))
  }, [visiveis, selecionadosVisiveis])

  function alternarSelecao(id) {
    setSelecionados(prev => {
      const nova = new Set(prev)
      if (nova.has(id)) nova.delete(id)
      else nova.add(id)
      return nova
    })
  }

  function alternarTodos() {
    setSelecionados(prev => {
      const todosMarcados = idsVisiveis.length > 0 && idsVisiveis.every(id => prev.has(id))
      const nova = new Set(prev)
      for (const id of idsVisiveis) {
        if (todosMarcados) nova.delete(id)
        else nova.add(id)
      }
      return nova
    })
  }

  // ── Transferência ─────────────────────────────────────────────────────────
  async function transferir(ids, valor) {
    if (!ids.length) return
    try {
      await marcarTransferido(ids, valor, { id: profile?.id, nome: profile?.nome })
      const agora = new Date().toISOString()
      setLinhas(prev => prev.map(l => ids.includes(l.id)
        ? {
            ...l,
            frete_transferido: valor,
            frete_transferido_em: valor ? agora : null,
            frete_transferido_por_nome: valor ? (profile?.nome || null) : null,
          }
        : l
      ))
      setDetalhe(d => (d && ids.includes(d.id) ? { ...d, frete_transferido: valor } : d))
      showToast(
        valor
          ? `${ids.length === 1 ? 'Romaneio marcado' : ids.length + ' romaneios marcados'} como transferido.`
          : 'Transferência desmarcada.',
        'success'
      )
    } catch (e) {
      showToast('Erro ao marcar transferência: ' + (e.message || ''), 'error')
    }
  }

  async function transferirLote(valor) {
    setSalvandoLote(true)
    await transferir(selecionadosVisiveis, valor)
    setSelecionados(new Set())
    setSalvandoLote(false)
  }

  // ── Recebimento fora do PIX ───────────────────────────────────────────────
  function abrirManual(l) {
    setManual({
      id: l.id,
      numero: l.numero,
      cliente: l.cliente_instagram,
      valor: l.recebidoManual ? mascaraValor(String(Math.round(l.recebidoManual * 100))) : '',
      obs: l.frete_recebido_obs || '',
    })
  }

  async function salvarManual() {
    if (!manual) return
    setSalvandoManual(true)
    try {
      const valor = manual.valor === '' ? null : parseValor(manual.valor)
      await salvarRecebidoManual(manual.id, valor, manual.obs)
      showToast('Recebimento registrado.', 'success')
      setManual(null)
      await carregar()
    } catch (e) {
      showToast('Erro ao salvar: ' + (e.message || ''), 'error')
    }
    setSalvandoManual(false)
  }

  // ── Exportar ──────────────────────────────────────────────────────────────
  function exportarCsv() {
    if (!visiveis.length) return showToast('Nada para exportar.', 'error')

    const cab = ['Romaneio', 'Cliente', 'Data', 'Status', 'Frete', 'Recebido', 'Taxa MP', 'Frete - Recebido', 'Transferido', 'Transferido em']
    const linhasCsv = [cab.join(';')]

    for (const l of visiveis) {
      linhasCsv.push([
        `"${l.numero || ''}"`,
        `"${l.cliente_instagram || ''}"`,
        `"${fmtData(l.created_at)}"`,
        `"${LABEL_STATUS[l.status] || l.status || ''}"`,
        l.frete.toFixed(2).replace('.', ','),
        l.recebido.toFixed(2).replace('.', ','),
        l.taxaMp.toFixed(2).replace('.', ','),
        l.diferenca.toFixed(2).replace('.', ','),
        l.frete_transferido ? 'Sim' : 'Nao',
        `"${l.frete_transferido_em ? fmtDataHora(l.frete_transferido_em) : ''}"`,
      ].join(';'))
    }

    linhasCsv.push([
      '"TOTAL"', '""', '""', '""',
      totais.frete.toFixed(2).replace('.', ','),
      totais.recebido.toFixed(2).replace('.', ','),
      totais.taxa.toFixed(2).replace('.', ','),
      (totais.frete - totais.recebido).toFixed(2).replace('.', ','),
      '""', '""',
    ].join(';'))

    const blob = new Blob(['﻿' + linhasCsv.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `frete_romaneios_${aplicado.dataIni}_${aplicado.dataFim}.csv`
    link.click()
    URL.revokeObjectURL(url)
    showToast('CSV exportado.', 'success')
  }

  const todosMarcados = idsVisiveis.length > 0 && idsVisiveis.every(id => selecionados.has(id))

  return (
    <>
      {/* ── Filtros ── */}
      <div className="ff-filtros">
        <div className="ff-f ff-f-busca">
          <label>Buscar</label>
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Romaneio, cliente, rastreio... (separe por vírgula)"
            style={S.inp}
          />
        </div>
        <div className="ff-f">
          <label>De</label>
          <input type="date" value={dataIni} onChange={e => setDataIni(e.target.value)} style={S.inp} />
        </div>
        <div className="ff-f">
          <label>Até</label>
          <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} style={S.inp} />
        </div>
        <div className="ff-f">
          <label>Situação</label>
          <select value={situacao} onChange={e => setSituacao(e.target.value)} style={{ ...S.inp, minWidth: 180 }}>
            {SITUACOES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="ff-acoes">
          <button
            onClick={aplicarFiltros}
            style={{ ...S.btn, ...(pendente ? { background: 'var(--green)' } : {}) }}
            title={pendente ? 'Há filtros alterados — clique para aplicar' : 'Filtros já aplicados'}
          >
            {pendente ? 'Filtrar •' : 'Filtrar'}
          </button>
          <button onClick={exportarCsv} style={S.sec}>Exportar</button>
        </div>
      </div>

      {/* ── Resumo ── */}
      {jaFiltrou && !carregando && (
        <div className="ff-resumo">
          <div className="ff-card">
            <div className="ff-card-label">Romaneios</div>
            <div className="ff-card-valor">{totais.qtd}</div>
          </div>
          <div className="ff-card">
            <div className="ff-card-label">Frete (custo)</div>
            <div className="ff-card-valor" style={{ color: 'var(--yellow)' }}>{fmtR(totais.frete)}</div>
          </div>
          <div className="ff-card">
            <div className="ff-card-label">Recebido</div>
            <div className="ff-card-valor" style={{ color: 'var(--blue)' }}>{fmtR(totais.recebido)}</div>
            <div className="ff-card-obs">taxa do MP: {fmtR(totais.taxa)}</div>
          </div>
          <div className="ff-card">
            <div className="ff-card-label">Falta cobrir</div>
            <div className="ff-card-valor" style={{ color: 'var(--red)' }}>{fmtR(totais.falta)}</div>
          </div>
          <div className="ff-card">
            <div className="ff-card-label">Sobrou</div>
            <div className="ff-card-valor" style={{ color: 'var(--green)' }}>{fmtR(totais.sobra)}</div>
          </div>
          <div className="ff-card">
            <div className="ff-card-label">A transferir</div>
            <div className="ff-card-valor" style={{ color: 'var(--purple)' }}>{fmtR(totais.aTransferir)}</div>
            <div className="ff-card-obs">já transferido: {fmtR(totais.transferido)}</div>
          </div>
        </div>
      )}

      {/* ── Ações em lote ── */}
      {selecionadosVisiveis.length > 0 && (
        <div className="ff-lote">
          <strong>{selecionadosVisiveis.length} selecionado(s)</strong>
          <span>Soma do recebido: <strong style={{ color: 'var(--purple)' }}>{fmtR(totalSelecionado)}</strong></span>
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <button disabled={salvandoLote} onClick={() => transferirLote(true)} style={S.ok}>Marcar transferido</button>
            <button disabled={salvandoLote} onClick={() => transferirLote(false)} style={S.sec}>Desmarcar</button>
          </div>
        </div>
      )}

      {/* ── Lista ── */}
      <div className="ff-conteudo">
        {!jaFiltrou ? (
          <p className="ff-vazio">Escolha o período e clique em Filtrar.</p>
        ) : carregando ? (
          <p className="ff-vazio">Carregando…</p>
        ) : isMobile ? (
          <div className="ff-cards">
            {visiveis.map(l => (
              <div key={l.id} className="ff-mcard" onClick={() => setDetalhe(l)}>
                <div className="ff-mcard-topo">
                  <span className="ff-mcard-nome">{l.numero} · {l.cliente_instagram}</span>
                  <span style={{ fontSize: 15, fontWeight: 800, flexShrink: 0, color: corDiferenca(l.diferenca) }}>
                    {fmtR(l.diferenca)}
                  </span>
                </div>
                <div className="ff-mcard-linha">
                  <span>{fmtData(l.created_at)}</span>
                  <span style={{ color: COR_STATUS[l.status] || 'var(--muted)' }}>
                    {LABEL_STATUS[l.status] || l.status}
                  </span>
                </div>
                <div className="ff-mcard-linha">
                  <span>Frete <strong style={{ color: 'var(--yellow)' }}>{fmtR(l.frete)}</strong></span>
                  <span>Recebido <strong style={{ color: 'var(--blue)' }}>{fmtR(l.recebido)}</strong></span>
                </div>
                <div className="ff-mcard-linha" style={{ justifyContent: 'space-between' }}>
                  <span className={`ff-chip ${l.frete_transferido ? 'venda' : 'outro'}`}>
                    {l.frete_transferido ? 'Transferido' : 'A transferir'}
                  </span>
                  {l.recebidoManual > 0 && <span className="ff-chip manual">Manual {fmtR(l.recebidoManual)}</span>}
                </div>
              </div>
            ))}
            {linhas.length === 0 && <p className="ff-vazio">Nenhum romaneio no período.</p>}
            {linhas.length > 0 && visiveis.length === 0 && <p className="ff-vazio">Nenhum resultado para o filtro.</p>}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="ff-tabela">
              <thead>
                <tr>
                  <th style={{ width: 28 }}>
                    <input
                      type="checkbox"
                      checked={todosMarcados}
                      onChange={alternarTodos}
                      title="Selecionar todos"
                    />
                  </th>
                  <th>Romaneio</th>
                  <th>Cliente</th>
                  <th>Data</th>
                  <th>Status</th>
                  <th className="ff-num">Frete</th>
                  <th className="ff-num">Recebido</th>
                  <th className="ff-num">Taxa MP</th>
                  <th className="ff-num">Frete − Recebido</th>
                  <th style={{ textAlign: 'center' }}>Transferido</th>
                  <th style={{ textAlign: 'center' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map(l => (
                  <tr key={l.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selecionados.has(l.id)}
                        onChange={() => alternarSelecao(l.id)}
                      />
                    </td>
                    <td style={{ fontWeight: 700, color: 'var(--text-header)' }}>{l.numero}</td>
                    <td>{l.cliente_instagram}</td>
                    <td>{fmtData(l.created_at)}</td>
                    <td style={{ color: COR_STATUS[l.status] || 'var(--muted)' }}>
                      {LABEL_STATUS[l.status] || l.status}
                    </td>
                    <td className="ff-num" style={{ color: 'var(--yellow)', fontWeight: 600 }}>{fmtR(l.frete)}</td>
                    <td className="ff-num" style={{ color: 'var(--blue)', fontWeight: 600 }}>
                      {fmtR(l.recebido)}
                      {l.recebidoManual > 0 && (
                        <span className="ff-chip manual" style={{ marginLeft: 6 }}>manual</span>
                      )}
                      {l.semDinheiroNoMp && (
                        <span className="ff-chip outro" style={{ marginLeft: 6 }}>
                          {LABEL_METODO[l.metodosBaixa[0]] || 'baixa'}
                        </span>
                      )}
                    </td>
                    <td className="ff-num" style={{ color: 'var(--muted)' }}>{fmtR(l.taxaMp)}</td>
                    <td className="ff-num" style={{ color: corDiferenca(l.diferenca), fontWeight: 700 }}>
                      {fmtR(l.diferenca)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        className={`ff-transf${l.frete_transferido ? ' ok' : ''}`}
                        onClick={() => transferir([l.id], !l.frete_transferido)}
                        title={l.frete_transferido
                          ? `Transferido ${fmtDataHora(l.frete_transferido_em)}${l.frete_transferido_por_nome ? ' por ' + l.frete_transferido_por_nome : ''} — clique para desmarcar`
                          : 'Clique para marcar que já transferiu'}
                      >
                        {l.frete_transferido ? 'Sim' : 'Não'}
                      </button>
                    </td>
                    <td>
                      <div className="acoes-wrapper">
                        <button className="btn-action-sm copy-txt" title="Detalhe dos pagamentos"
                          onClick={() => setDetalhe(l)}><IconInfo /></button>
                        <button className="btn-action-sm copy" title="Registrar recebimento fora do PIX"
                          onClick={() => abrirManual(l)}><IconEdit /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {linhas.length === 0 && (
                  <tr><td colSpan={11} className="ff-vazio">Nenhum romaneio no período.</td></tr>
                )}
                {linhas.length > 0 && visiveis.length === 0 && (
                  <tr><td colSpan={11} className="ff-vazio">Nenhum resultado para o filtro.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {jaFiltrou && !carregando && visiveis.length > 0 && (
        <div className="ff-legenda">
          <div><strong>Frete</strong> é o valor da cotação escolhida (o que a postagem custa).</div>
          <div><strong>Recebido</strong> é o que caiu na conta do Mercado Pago já sem a taxa, mais o que foi registrado à mão.</div>
          <div><strong>Frete − Recebido</strong> em vermelho = faltou dinheiro para cobrir a postagem; em verde = sobrou.</div>
        </div>
      )}

      {/* ── Modal: detalhe ── */}
      {detalhe && (
        <div className="modal-overlay" onClick={() => setDetalhe(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}
            style={{ maxWidth: 560, height: 'auto', maxHeight: '90vh', borderRadius: 12, overflow: 'auto' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>{detalhe.numero} · {detalhe.cliente_instagram}</h3>
              <button onClick={() => setDetalhe(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            <div className="modal-body" style={{ padding: 16, display: 'grid', gap: 14 }}>
              <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
                <Linha rotulo="Status" valor={LABEL_STATUS[detalhe.status] || detalhe.status} />
                <Linha rotulo="Criado em" valor={fmtDataHora(detalhe.created_at)} />
                {detalhe.transportadora && (
                  <Linha rotulo="Transportadora" valor={`${detalhe.transportadora} ${detalhe.servico || ''}`} />
                )}
                {detalhe.codigo_rastreio && <Linha rotulo="Rastreio" valor={detalhe.codigo_rastreio} />}
                <Linha rotulo="Frete (custo)" valor={fmtR(detalhe.frete)} cor="var(--yellow)" />
                <Linha rotulo="Recebido bruto no MP" valor={fmtR(detalhe.recebidoBruto)} />
                <Linha rotulo="Taxa do MP" valor={fmtR(detalhe.taxaMp)} cor="var(--red)" />
                <Linha rotulo="Líquido no MP" valor={fmtR(detalhe.liquidoMp)} cor="var(--blue)" />
                {detalhe.recebidoManual > 0 && (
                  <Linha rotulo="Recebido fora do PIX" valor={fmtR(detalhe.recebidoManual)} cor="var(--purple)" />
                )}
                <Linha rotulo="Total recebido" valor={fmtR(detalhe.recebido)} cor="var(--blue)" forte />
                <Linha rotulo="Frete − Recebido" valor={fmtR(detalhe.diferenca)} cor={corDiferenca(detalhe.diferenca)} forte />
              </div>

              {detalhe.frete_recebido_obs && (
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  Observação do recebimento manual: {detalhe.frete_recebido_obs}
                </div>
              )}

              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>
                  Pagamentos aprovados
                </div>
                {detalhe.pagamentosPagos.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>Nenhum pagamento aprovado registrado.</div>
                ) : detalhe.pagamentosPagos.map(p => (
                  <div key={p.id} style={{
                    display: 'flex', justifyContent: 'space-between', gap: 10,
                    padding: '8px 0', borderBottom: '1px solid var(--border-light)', fontSize: 12,
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }}>{LABEL_METODO[p.metodo] || p.metodo}</div>
                      <div style={{ color: 'var(--muted)', fontSize: 11 }}>
                        {fmtDataHora(p.pago_em)}
                        {p.gateway_transaction_id ? ` · MP ${p.gateway_transaction_id}` : ''}
                      </div>
                      {p.observacao && <div style={{ color: 'var(--muted)', fontSize: 11 }}>{p.observacao}</div>}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: 700 }}>{fmtR(p.valor)}</div>
                      {p.valor_liquido !== null && p.valor_liquido !== undefined && (
                        <div style={{ color: 'var(--blue)', fontSize: 11 }}>líquido {fmtR(p.valor_liquido)}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{
                padding: '10px 12px', borderRadius: 8,
                background: detalhe.frete_transferido ? 'rgba(129,201,149,0.1)' : 'rgba(251,188,4,0.1)',
                fontSize: 12,
                color: detalhe.frete_transferido ? 'var(--green)' : 'var(--yellow)',
              }}>
                {detalhe.frete_transferido
                  ? `Transferido para a outra conta ${fmtDataHora(detalhe.frete_transferido_em)}${detalhe.frete_transferido_por_nome ? ' por ' + detalhe.frete_transferido_por_nome : ''}.`
                  : 'Esse dinheiro ainda não foi transferido para a conta que gera crédito no Melhor Envio.'}
              </div>
            </div>
            <div className="modal-footer" style={{ gap: 8 }}>
              <button onClick={() => { abrirManual(detalhe); setDetalhe(null) }} style={S.sec}>Recebimento manual</button>
              <button
                onClick={() => transferir([detalhe.id], !detalhe.frete_transferido)}
                style={detalhe.frete_transferido ? S.sec : S.ok}
              >
                {detalhe.frete_transferido ? 'Desmarcar transferência' : 'Marcar como transferido'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: recebimento fora do PIX ── */}
      {manual && (
        <div className="modal-overlay" onClick={() => setManual(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}
            style={{ maxWidth: 420, height: 'auto', maxHeight: '90vh', borderRadius: 12 }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Recebimento fora do PIX</h3>
              <button onClick={() => setManual(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            <div className="modal-body" style={{ padding: 16, display: 'grid', gap: 14 }}>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                {manual.numero} · {manual.cliente}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                Use quando o frete entrou por fora do PIX do sistema: dinheiro, junto com o
                pagamento da venda ou abatido de crédito. Deixe vazio para apagar.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  Valor recebido
                </label>
                <input
                  value={manual.valor}
                  onChange={e => setManual(m => ({ ...m, valor: mascaraValor(e.target.value) }))}
                  placeholder="0,00"
                  inputMode="decimal"
                  style={S.inp}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  Como entrou
                </label>
                <input
                  value={manual.obs}
                  onChange={e => setManual(m => ({ ...m, obs: e.target.value }))}
                  placeholder="ex. junto com a venda, dinheiro, crédito"
                  style={S.inp}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setManual(null)} style={{ ...S.sec, flex: 1 }}>Cancelar</button>
              <button disabled={salvandoManual} onClick={salvarManual} style={{ ...S.ok, flex: 1 }}>
                {salvandoManual ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Linha({ rotulo, valor, cor, forte }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ color: 'var(--muted)' }}>{rotulo}</span>
      <strong style={{ color: cor || 'var(--text-body)', fontSize: forte ? 15 : 13, textAlign: 'right' }}>{valor}</strong>
    </div>
  )
}
