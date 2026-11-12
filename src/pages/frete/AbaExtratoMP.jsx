import { useState, useEffect, useCallback, useMemo } from 'react'
import { fmtR } from '../../services/relatorioService'
import {
  getExtratoMP, sincronizarExtratoMP, classificarExtrato, totaisExtrato,
} from '../../services/freteFinanceiroService'
import {
  S, LABEL_METODO, primeiroDiaMes, ultimoDiaMes, fmtDataHora, partesDataHora,
  casaBusca, descreveMetodo, descreveParcelas,
} from './freteUi'

const ORIGENS = [
  ['todos', 'Origem: todas'],
  ['frete', 'Só frete'],
  ['venda', 'Só vendas'],
  ['outro', 'Não classificados'],
]

const LABEL_ORIGEM = { frete: 'Frete', venda: 'Venda', outro: 'A definir' }

/** Peso da taxa do MP sobre o bruto, para saber se está caro */
function pctTaxa(g) {
  if (!g.bruto) return '0%'
  return (g.taxa / g.bruto * 100).toFixed(1).replace('.', ',') + '%'
}

/** Quanto o Mercado Pago ficou da linha, em percentual do bruto */
function descontoMp(l) {
  const bruto = Number(l.valor) || 0
  // Taxa ausente não é taxa zero: sem o dado, melhor não afirmar nada
  if (!bruto || l.taxa === null || l.taxa === undefined) return ''
  return (Number(l.taxa) / bruto * 100).toFixed(2).replace('.', ',') + '%'
}

export default function AbaExtratoMP({ tenantId, showToast, isMobile, abas }) {
  const [dataIni, setDataIni] = useState(primeiroDiaMes)
  const [dataFim, setDataFim] = useState(ultimoDiaMes)
  const [origem, setOrigem] = useState('todos')
  const [busca, setBusca] = useState('')

  const [aplicado, setAplicado] = useState(() => ({ dataIni: primeiroDiaMes(), dataFim: ultimoDiaMes() }))
  const [jaFiltrou, setJaFiltrou] = useState(false)

  const [linhas, setLinhas] = useState([])
  const [carregando, setCarregando] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)

  const carregar = useCallback(async () => {
    if (!tenantId || !jaFiltrou) return
    setCarregando(true)
    try {
      setLinhas(await getExtratoMP(tenantId, aplicado))
    } catch (e) {
      showToast('Erro ao carregar o extrato: ' + (e.message || ''), 'error')
    }
    setCarregando(false)
  }, [tenantId, aplicado, jaFiltrou, showToast])

  useEffect(() => { carregar() }, [carregar])

  const pendente = !jaFiltrou || aplicado.dataIni !== dataIni || aplicado.dataFim !== dataFim

  function aplicarFiltros() {
    setJaFiltrou(true)
    setAplicado({ dataIni, dataFim })
  }

  async function sincronizar() {
    setSincronizando(true)
    try {
      const r = await sincronizarExtratoMP(tenantId, { dataIni, dataFim })
      setJaFiltrou(true)
      setAplicado({ dataIni, dataFim })
      if (r.total === 0) {
        showToast('Nenhum pagamento aprovado no período.', 'info')
      } else {
        showToast(
          `${r.total} pagamento(s): ${r.frete} de frete, ${r.venda} de venda, ${r.outro} a classificar.`,
          'success'
        )
      }
      if (r.truncado) {
        showToast('O período tem mais pagamentos do que o Mercado Pago devolve de uma vez. Consulte em intervalos menores.', 'error')
      }
      // setAplicado devolve um objeto novo, então a releitura do banco sai pelo
      // efeito de carregar — inclusive quando o período não mudou
    } catch (e) {
      showToast('Erro ao sincronizar: ' + (e.message || ''), 'error')
    }
    setSincronizando(false)
  }

  async function trocarOrigem(linha, nova) {
    if (nova === linha.origem) return
    try {
      await classificarExtrato(linha.id, nova)
      setLinhas(prev => prev.map(l => (l.id === linha.id ? { ...l, origem: nova, origem_auto: false } : l)))
      showToast('Classificação salva.', 'success')
    } catch (e) {
      showToast('Erro ao classificar: ' + (e.message || ''), 'error')
    }
  }

  const visiveis = useMemo(() => {
    return linhas.filter(l => {
      if (origem !== 'todos' && l.origem !== origem) return false
      const texto = [
        l.mp_payment_id, l.descricao, l.payer_email, l.pagador_nome, l.pagador_doc,
        LABEL_METODO[l.metodo] || l.metodo, descreveMetodo(l), descreveParcelas(l),
        LABEL_ORIGEM[l.origem], l.romaneios?.numero, l.romaneios?.cliente_instagram,
      ].join(' ')
      return casaBusca(texto, busca)
    })
  }, [linhas, origem, busca])

  const totais = useMemo(() => totaisExtrato(visiveis), [visiveis])

  return (
    <>
      {/* ── Título, filtros e abas na mesma linha ── */}
      <div className="ff-filtros">
        <span className="ff-titulo">Frete e Romaneios</span>
        <div className="ff-f ff-f-busca">
          <label>Buscar</label>
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Id do MP, descrição, e-mail... (separe por vírgula)"
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
          <label>Origem</label>
          <select value={origem} onChange={e => setOrigem(e.target.value)} style={{ ...S.inp, minWidth: 160 }}>
            {ORIGENS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
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
          <button disabled={sincronizando} onClick={sincronizar} style={S.sec}
            title="Baixa do Mercado Pago os pagamentos aprovados do período">
            {sincronizando ? 'Buscando…' : 'Buscar no MP'}
          </button>
        </div>
        {abas}
      </div>

      {/* ── Resumo ── */}
      {jaFiltrou && !carregando && (
        <div className="ff-resumo">
          <div className="ff-card">
            <div className="ff-card-label">Entrou de frete</div>
            <div className="ff-card-valor" style={{ color: 'var(--blue)' }}>{fmtR(totais.frete.liquido)}</div>
            <div className="ff-card-obs">{totais.frete.qtd} pagamento(s) · bruto {fmtR(totais.frete.bruto)}</div>
          </div>
          <div className="ff-card">
            <div className="ff-card-label">Entrou de venda</div>
            <div className="ff-card-valor" style={{ color: 'var(--green)' }}>{fmtR(totais.venda.liquido)}</div>
            <div className="ff-card-obs">{totais.venda.qtd} pagamento(s) · bruto {fmtR(totais.venda.bruto)}</div>
          </div>
          <div className="ff-card">
            <div className="ff-card-label">A classificar</div>
            <div className="ff-card-valor" style={{ color: 'var(--yellow)' }}>{fmtR(totais.outro.liquido)}</div>
            <div className="ff-card-obs">{totais.outro.qtd} pagamento(s) · bruto {fmtR(totais.outro.bruto)}</div>
          </div>
          <div className="ff-card ff-card-sep">
            <div className="ff-card-label">Total bruto</div>
            <div className="ff-card-valor">{fmtR(totais.geral.bruto)}</div>
            <div className="ff-card-obs">{totais.geral.qtd} pagamento(s)</div>
          </div>
          <div className="ff-card">
            <div className="ff-card-label">Total de taxas</div>
            <div className="ff-card-valor" style={{ color: 'var(--red)' }}>− {fmtR(totais.geral.taxa)}</div>
            <div className="ff-card-obs">{pctTaxa(totais.geral)} do bruto</div>
          </div>
          <div className="ff-card">
            <div className="ff-card-label">Total líquido</div>
            <div className="ff-card-valor" style={{ color: 'var(--blue)' }}>{fmtR(totais.geral.liquido)}</div>
            <div className="ff-card-obs">foi o que caiu na conta</div>
          </div>
        </div>
      )}

      {/* ── Lista ── */}
      <div className="ff-conteudo">
        {!jaFiltrou ? (
          <p className="ff-vazio">
            Escolha o período e clique em Buscar no MP. Depois disso, Filtrar só lê o que já foi baixado.
          </p>
        ) : carregando ? (
          <p className="ff-vazio">Carregando…</p>
        ) : isMobile ? (
          <div className="ff-cards">
            {visiveis.map(l => (
              <div key={l.id} className="ff-mcard" style={{ cursor: 'default' }}>
                <div className="ff-mcard-topo">
                  <span className="ff-mcard-nome">{l.descricao || LABEL_METODO[l.metodo] || 'Pagamento'}</span>
                  <span style={{ fontSize: 15, fontWeight: 800, flexShrink: 0, color: 'var(--blue)' }}>
                    {fmtR(l.liquido)}
                  </span>
                </div>
                <div className="ff-mcard-linha">
                  <span>{fmtDataHora(l.data_aprovacao)}</span>
                  <span>{descreveMetodo(l)}</span>
                  {descreveParcelas(l) && (
                    <span style={{ color: Number(l.parcelas) > 1 ? 'var(--yellow)' : 'var(--muted)' }}>
                      {descreveParcelas(l)}
                      {Number(l.parcelas) > 1 && l.valor_parcela ? ` de ${fmtR(l.valor_parcela)}` : ''}
                    </span>
                  )}
                </div>
                <div className="ff-mcard-linha">
                  <span>bruto {fmtR(l.valor)}</span>
                  <span>taxa <strong style={{ color: 'var(--red)' }}>{fmtR(l.taxa)}</strong> ({descontoMp(l)})</span>
                  {(l.pagador_nome || l.payer_email) && <span>{l.pagador_nome || l.payer_email}</span>}
                </div>
                {l.romaneios?.numero && (
                  <div className="ff-mcard-linha">
                    <span>{l.romaneios.numero} · {l.romaneios.cliente_instagram}</span>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={`ff-chip ${l.origem}`}>{LABEL_ORIGEM[l.origem]}</span>
                  <select
                    value={l.origem}
                    onChange={e => trocarOrigem(l, e.target.value)}
                    style={{ ...S.inp, padding: '5px 8px', fontSize: 12, marginLeft: 'auto' }}
                  >
                    <option value="frete">Frete</option>
                    <option value="venda">Venda</option>
                    <option value="outro">A definir</option>
                  </select>
                </div>
              </div>
            ))}
            {linhas.length === 0 && <p className="ff-vazio">Nada baixado para este período.</p>}
            {linhas.length > 0 && visiveis.length === 0 && <p className="ff-vazio">Nenhum resultado para o filtro.</p>}
          </div>
        ) : (
          <>
            <table className="ff-tabela">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th>Forma</th>
                  <th>Parcelas</th>
                  <th>Pagador</th>
                  <th className="ff-num">Bruto</th>
                  <th className="ff-num">Taxa</th>
                  <th className="ff-num">% MP</th>
                  <th className="ff-num">Líquido</th>
                  <th>Romaneio</th>
                  <th style={{ textAlign: 'center' }}>Origem</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map(l => (
                  <tr key={l.id}>
                    <td className="ff-data">
                      <div>{partesDataHora(l.data_aprovacao).data}</div>
                      <div style={{ color: 'var(--muted)' }}>{partesDataHora(l.data_aprovacao).hora}</div>
                    </td>
                    <td className="ff-desc">
                      <div>{l.descricao || '—'}</div>
                      <div style={{ color: 'var(--muted)', fontSize: 10 }}>#{l.mp_payment_id}</div>
                    </td>
                    <td>{descreveMetodo(l)}</td>
                    <td style={{ color: Number(l.parcelas) > 1 ? 'var(--yellow)' : 'var(--muted)' }}>
                      {descreveParcelas(l) || '—'}
                      {Number(l.parcelas) > 1 && l.valor_parcela
                        ? <span style={{ color: 'var(--muted)', marginLeft: 6 }}>de {fmtR(l.valor_parcela)}</span>
                        : null}
                    </td>
                    <td style={{ maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis' }}
                      title={[l.pagador_nome, l.payer_email, l.pagador_doc].filter(Boolean).join(' · ')}>
                      {l.pagador_nome || l.payer_email || <span style={{ color: 'var(--muted)' }}>não informado</span>}
                    </td>
                    <td className="ff-num">{fmtR(l.valor)}</td>
                    <td className="ff-num" style={{ color: 'var(--red)' }}>{fmtR(l.taxa)}</td>
                    <td className="ff-num" style={{ color: 'var(--red)' }}>{descontoMp(l) || '—'}</td>
                    <td className="ff-num" style={{ color: 'var(--blue)', fontWeight: 600 }}>{fmtR(l.liquido)}</td>
                    <td>
                      {l.romaneios?.numero
                        ? `${l.romaneios.numero} · ${l.romaneios.cliente_instagram || ''}`
                        : <span style={{ color: 'var(--muted)' }}>—</span>}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <select
                        value={l.origem}
                        onChange={e => trocarOrigem(l, e.target.value)}
                        style={{ ...S.inp, padding: '4px 6px', fontSize: 11 }}
                        title={l.origem_auto ? 'Classificado automaticamente' : 'Classificado à mão'}
                      >
                        <option value="frete">Frete</option>
                        <option value="venda">Venda</option>
                        <option value="outro">A definir</option>
                      </select>
                    </td>
                  </tr>
                ))}
                {linhas.length === 0 && (
                  <tr><td colSpan={11} className="ff-vazio">Nada baixado para este período.</td></tr>
                )}
                {linhas.length > 0 && visiveis.length === 0 && (
                  <tr><td colSpan={11} className="ff-vazio">Nenhum resultado para o filtro.</td></tr>
                )}
              </tbody>
            </table>
          </>
        )}

        {jaFiltrou && !carregando && (
          <div className="ff-legenda">
            <div>Frete e vendas caem na mesma conta do Mercado Pago. Aqui cada entrada é separada.</div>
            <div><strong>% MP</strong> é quanto o Mercado Pago ficou daquele pagamento: taxa dividida pelo bruto. No PIX fica perto de 1%; no crédito parcelado sobe conforme o número de parcelas.</div>
            <div><strong>Frete</strong> sai do PIX que o sistema gerou para um romaneio. <strong>Venda</strong> sai de uma cobrança.</div>
            <div>O que não deu match fica como <strong>A definir</strong> — troque na coluna Origem e a escolha não é desfeita na próxima busca.</div>
          </div>
        )}
      </div>
    </>
  )
}
