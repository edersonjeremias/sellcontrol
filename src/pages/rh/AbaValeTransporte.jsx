import { useState, useEffect, useCallback } from 'react'
import {
  fmtR, fmtData, isoLocal, primeiroDiaMes, ultimoDiaMes, diaSemana, dataLocal, DIAS_SEMANA,
  mascaraValor, parseValor, valorParaInput, abrirWhatsApp,
  getFeriados, getOcorrencias,
  getPeriodosVT, getDiasVT, salvarPeriodoVT, pagarPeriodoVT, reabrirPeriodoVT,
  excluirPeriodoVT, lancarVTComoPagamento,
  montarDiasVT, calcularTotaisVT, mensagemVT, LABEL_MOTIVO_VT, urlWhatsApp,
} from '../../services/rhService'
import { S, Campo, Modal, ModalConfirma, IconCheck, IconEdit, IconTrash, IconUndo, IconWhats } from './RhUI'

const HOJE = isoLocal(new Date())

const MOTIVOS = ['', 'NAO_USOU', 'FALTA', 'ATESTADO', 'FERIADO', 'FOLGA']

const NOMES_MES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

/**
 * Agrupa os dias por mês e devolve quantas células vazias entram antes do
 * primeiro dia, para ele cair na coluna certa da semana (domingo primeiro).
 */
function montarCalendario(dias) {
  const meses = []
  dias.forEach(d => {
    const data  = dataLocal(d.data)
    const chave = `${data.getFullYear()}-${data.getMonth()}`
    let mes = meses.find(m => m.chave === chave)
    if (!mes) {
      mes = {
        chave,
        label:       `${NOMES_MES[data.getMonth()]} de ${data.getFullYear()}`,
        vaziosInicio: data.getDay(),
        celulas:     [],
      }
      meses.push(mes)
    }
    mes.celulas.push(d)
  })
  return meses
}

const EDITOR_VAZIO = {
  id: null, funcionario_id: '', data_inicio: primeiroDiaMes(), data_fim: ultimoDiaMes(),
  valor_ida: '', valor_volta: '', status: 'PENDENTE', data_pagamento: '', observacao: '',
  dias: [],
}

export default function AbaValeTransporte({ tenantId, showToast, funcionarios }) {
  const [periodos,   setPeriodos]   = useState([])
  const [carregando, setCarregando] = useState(false)

  const [dataIni,    setDataIni]    = useState(primeiroDiaMes)
  const [dataFim,    setDataFim]    = useState(ultimoDiaMes)
  const [filtroFunc, setFiltroFunc] = useState('')
  const [filtroSt,   setFiltroSt]   = useState('Todos')

  const [editor,     setEditor]     = useState(null)
  const [gerando,    setGerando]    = useState(false)
  const [salvando,   setSalvando]   = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)
  const [modalPagar, setModalPagar] = useState(null)
  const [dataPag,    setDataPag]    = useState(HOJE)

  const carregar = useCallback(async () => {
    if (!tenantId) return
    setCarregando(true)
    try {
      const { data } = await getPeriodosVT(tenantId, {
        dataInicio: dataIni, dataFim, funcionarioId: filtroFunc || undefined,
      })
      setPeriodos(data)
    } catch (e) { showToast('Erro ao carregar períodos: ' + e.message, 'error') }
    setCarregando(false)
  }, [tenantId, dataIni, dataFim, filtroFunc, showToast])

  useEffect(() => { carregar() }, [carregar])

  const lista = periodos.filter(p => filtroSt === 'Todos' || p.status === filtroSt)

  const totalPendente = lista.filter(p => p.status !== 'PAGO')
    .reduce((s, p) => s + (Number(p.total_liquido) || 0), 0)
  const totalPago = lista.filter(p => p.status === 'PAGO')
    .reduce((s, p) => s + (Number(p.total_liquido) || 0), 0)

  // ── Editor ──────────────────────────────────────────────────
  function abrirNovo() {
    const func = funcionarios.find(f => f.id === filtroFunc)
    setEditor({
      ...EDITOR_VAZIO,
      data_inicio:    dataIni,
      data_fim:       dataFim,
      funcionario_id: filtroFunc || '',
      valor_ida:      valorParaInput(func?.vt_valor_ida),
      valor_volta:    valorParaInput(func?.vt_valor_volta),
    })
  }

  // Ao trocar o funcionário, puxa os valores de ida/volta do cadastro dele
  function trocarFuncionario(id) {
    const func = funcionarios.find(f => f.id === id)
    setEditor(p => ({
      ...p,
      funcionario_id: id,
      valor_ida:      valorParaInput(func?.vt_valor_ida),
      valor_volta:    valorParaInput(func?.vt_valor_volta),
      dias:           [],
    }))
  }

  async function gerarDias() {
    if (!editor.funcionario_id) return showToast('Escolha o funcionário.', 'error')
    if (!editor.data_inicio || !editor.data_fim) return showToast('Informe a data inicial e a final.', 'error')
    if (editor.data_fim < editor.data_inicio) return showToast('A data final é anterior à inicial.', 'error')

    const func = funcionarios.find(f => f.id === editor.funcionario_id)
    setGerando(true)
    try {
      const [fe, oc] = await Promise.all([
        getFeriados(tenantId, { dataInicio: editor.data_inicio, dataFim: editor.data_fim }),
        getOcorrencias(tenantId, {
          dataInicio: editor.data_inicio, dataFim: editor.data_fim,
          funcionarioId: editor.funcionario_id,
        }),
      ])
      const dias = montarDiasVT({
        funcionario: func,
        dataInicio:  editor.data_inicio,
        dataFim:     editor.data_fim,
        feriados:    fe.data,
        ocorrencias: oc.data,
      })
      setEditor(p => ({ ...p, dias }))
      showToast(`${dias.length} dias gerados — faltas e feriados já descontados.`, 'success')
    } catch (e) { showToast('Erro ao gerar dias: ' + e.message, 'error') }
    setGerando(false)
  }

  async function abrirPeriodo(p) {
    try {
      const dias = await getDiasVT(p.id)
      setEditor({
        id:             p.id,
        funcionario_id: p.funcionario_id,
        data_inicio:    p.data_inicio,
        data_fim:       p.data_fim,
        valor_ida:      valorParaInput(p.valor_ida),
        valor_volta:    valorParaInput(p.valor_volta),
        status:         p.status,
        data_pagamento: p.data_pagamento || '',
        observacao:     p.observacao || '',
        dias: dias.map(d => ({
          data:       String(d.data).slice(0, 10),
          ida:        !!d.ida,
          volta:      !!d.volta,
          motivo:     d.motivo === 'FOLGA' ? 'FOLGA' : (d.motivo || ''),
          // FOLGA é dia fora da escala: não entra no valor cheio do período
          dia_util:   d.motivo !== 'FOLGA',
          ajuste:     !!d.ajuste,
          observacao: d.observacao || '',
        })),
      })
    } catch (e) { showToast('Erro ao abrir período: ' + e.message, 'error') }
  }

  function setDia(data, patch) {
    setEditor(p => ({
      ...p,
      dias: p.dias.map(d => (d.data === data ? { ...d, ...patch } : d)),
    }))
  }

  // Desmarcar um trecho sem motivo definido = o funcionário não usou aquele trecho
  function toggleTrecho(dia, campo) {
    const novoValor = !dia[campo]
    const outro = campo === 'ida' ? dia.volta : dia.ida
    let motivo = dia.motivo
    if (!novoValor && !motivo) motivo = 'NAO_USOU'
    if (novoValor && (motivo === 'NAO_USOU' || !motivo) && outro) motivo = ''
    setDia(dia.data, { [campo]: novoValor, motivo })
  }

  function trocarMotivo(dia, motivo) {
    if (motivo === 'FOLGA')  return setDia(dia.data, { motivo, ida:false, volta:false, dia_util:false })
    if (motivo === '')       return setDia(dia.data, { motivo, ida:true,  volta:true,  dia_util:true })
    if (motivo === 'NAO_USOU') return setDia(dia.data, { motivo, dia_util:true })
    // FALTA, ATESTADO, FERIADO zeram o dia, mas ele continua contando no valor cheio
    return setDia(dia.data, { motivo, ida:false, volta:false, dia_util:true })
  }

  // ── Ajustes de dias anteriores ──────────────────────────────
  // Dia de um período já pago que só agora está sendo descontado.
  function adicionarAjuste() {
    const vespera = isoLocal(new Date(dataLocal(editor.data_inicio).getTime() - 86400000))
    setEditor(p => ({
      ...p,
      dias: [...p.dias, {
        data: vespera, ida: true, volta: false,
        motivo: 'NAO_USOU', dia_util: true, ajuste: true, observacao: '',
      }],
    }))
  }

  function patchAjuste(indice, patch) {
    setEditor(p => ({ ...p, dias: p.dias.map((d, i) => (i === indice ? { ...d, ...patch } : d)) }))
  }

  function removerAjuste(indice) {
    setEditor(p => ({ ...p, dias: p.dias.filter((_, i) => i !== indice) }))
  }

  function marcarTodos(valor) {
    setEditor(p => ({
      ...p,
      dias: p.dias.map(d => {
        if (d.ajuste || d.dia_util === false) return d
        if (valor) return { ...d, ida:true, volta:true, motivo: d.motivo === 'NAO_USOU' ? '' : d.motivo }
        return { ...d, ida:false, volta:false, motivo: d.motivo || 'NAO_USOU' }
      }),
    }))
  }

  const vIda    = editor ? parseValor(editor.valor_ida)   : 0
  const vVolta  = editor ? parseValor(editor.valor_volta) : 0
  const totais  = editor ? calcularTotaisVT(editor.dias, vIda, vVolta) : null
  const funcEd  = editor ? funcionarios.find(f => f.id === editor.funcionario_id) : null

  async function salvar({ lancarPagamento = false } = {}) {
    if (!editor.funcionario_id) return showToast('Escolha o funcionário.', 'error')
    if (!editor.dias.length)    return showToast('Gere os dias do período antes de salvar.', 'error')

    // Cada data entra uma vez só no período (há índice único periodo+data)
    const datasPeriodo = new Set(editor.dias.filter(d => !d.ajuste).map(d => d.data))
    const vistas = new Set()
    for (const a of editor.dias.filter(d => d.ajuste)) {
      if (!a.data) return showToast('Informe a data de todos os ajustes.', 'error')
      if (datasPeriodo.has(a.data)) {
        return showToast(`${fmtData(a.data)} está dentro do período — desmarque a ida ou a volta no calendário.`, 'error')
      }
      if (vistas.has(a.data)) {
        return showToast(`Há dois ajustes em ${fmtData(a.data)}. Use um só por dia.`, 'error')
      }
      vistas.add(a.data)
    }
    setSalvando(true)
    try {
      const periodo = {
        id:              editor.id || undefined,
        funcionario_id:  editor.funcionario_id,
        data_inicio:     editor.data_inicio,
        data_fim:        editor.data_fim,
        valor_ida:       vIda,
        valor_volta:     vVolta,
        dias_uteis:      totais.diasUteis,
        total_bruto:     totais.totalBruto,
        total_descontos: totais.totalDescontos,
        total_liquido:   totais.totalLiquido,
        status:          editor.status,
        data_pagamento:  editor.status === 'PAGO' ? (editor.data_pagamento || editor.data_fim) : null,
        observacao:      editor.observacao?.trim() || null,
      }
      const id = await salvarPeriodoVT(tenantId, periodo, editor.dias)

      if (lancarPagamento) {
        await lancarVTComoPagamento(tenantId, { ...periodo, id }, funcEd?.apelido || funcEd?.nome)
        showToast('Período salvo e lançado em Vales e Pagamentos!', 'success')
      } else {
        showToast('Período de vale transporte salvo!', 'success')
      }

      setEditor(null)
      carregar()
    } catch (e) { showToast('Erro ao salvar: ' + e.message, 'error') }
    setSalvando(false)
  }

  function enviarWhats() {
    const msg = mensagemVT({
      funcionario: funcEd,
      dataInicio:  editor.data_inicio,
      dataFim:     editor.data_fim,
      valorIda:    vIda,
      valorVolta:  vVolta,
      totais,
    })
    if (!abrirWhatsApp(funcEd?.whatsapp, msg)) {
      showToast('Funcionário sem WhatsApp cadastrado.', 'error')
    }
  }

  // WhatsApp a partir da lista: remonta os totais com os dias salvos
  async function enviarWhatsDaLista(p) {
    const func = p.funcionarios || funcionarios.find(f => f.id === p.funcionario_id)
    if (!func?.whatsapp) return showToast('Funcionário sem WhatsApp cadastrado.', 'error')
    // A aba é aberta já no clique: depois do await o navegador trata como popup
    const aba = window.open('', '_blank')
    try {
      const dias = await getDiasVT(p.id)
      const normalizados = dias.map(d => ({
        data:       String(d.data).slice(0, 10),
        ida:        !!d.ida,
        volta:      !!d.volta,
        motivo:     d.motivo || '',
        dia_util:   d.motivo !== 'FOLGA',
        ajuste:     !!d.ajuste,
        observacao: d.observacao || '',
      }))
      const totaisP = calcularTotaisVT(normalizados, p.valor_ida, p.valor_volta)
      const url = urlWhatsApp(func.whatsapp, mensagemVT({
        funcionario: func,
        dataInicio:  p.data_inicio,
        dataFim:     p.data_fim,
        valorIda:    p.valor_ida,
        valorVolta:  p.valor_volta,
        totais:      totaisP,
      }))
      if (aba) aba.location.href = url
      else window.open(url, '_blank')
    } catch (e) {
      if (aba) aba.close()
      showToast('Erro ao montar a mensagem: ' + e.message, 'error')
    }
  }

  async function confirmarPagamento() {
    try {
      await pagarPeriodoVT(modalPagar.id, dataPag)
      showToast('Vale transporte marcado como pago!', 'success')
      setModalPagar(null)
      carregar()
    } catch (e) { showToast('Erro: ' + e.message, 'error') }
  }

  async function reabrir(p) {
    try {
      await reabrirPeriodoVT(p.id)
      showToast('Período reaberto.', 'success')
      carregar()
    } catch (e) { showToast('Erro: ' + e.message, 'error') }
  }

  async function confirmarExclusao() {
    try {
      await excluirPeriodoVT(confirmDel.id)
      showToast('Período excluído.', 'success')
      carregar()
    } catch (e) { showToast('Erro: ' + e.message, 'error') }
    setConfirmDel(null)
  }

  // ════════════════════════════════════════════════════════════
  // EDITOR DE PERÍODO
  // ════════════════════════════════════════════════════════════
  if (editor) {
    return (
      <>
        <div className="rh-filtros">
          <div className="rh-f" style={{ minWidth:170 }}>
            <label>Funcionário *</label>
            <select value={editor.funcionario_id} onChange={e => trocarFuncionario(e.target.value)} style={S.inpS}>
              <option value="">Selecione…</option>
              {funcionarios.map(f => <option key={f.id} value={f.id}>{f.apelido || f.nome}</option>)}
            </select>
          </div>
          <div className="rh-f">
            <label>Data inicial *</label>
            <input type="date" value={editor.data_inicio}
              onChange={e => setEditor(p => ({ ...p, data_inicio: e.target.value }))} style={S.inpS} />
          </div>
          <div className="rh-f">
            <label>Data final *</label>
            <input type="date" value={editor.data_fim}
              onChange={e => setEditor(p => ({ ...p, data_fim: e.target.value }))} style={S.inpS} />
          </div>
          <div className="rh-f" style={{ minWidth:100 }}>
            <label>Valor ida</label>
            <input value={editor.valor_ida}
              onChange={e => setEditor(p => ({ ...p, valor_ida: mascaraValor(e.target.value) }))}
              style={S.inpS} placeholder="0,00" inputMode="numeric" />
          </div>
          <div className="rh-f" style={{ minWidth:100 }}>
            <label>Valor volta</label>
            <input value={editor.valor_volta}
              onChange={e => setEditor(p => ({ ...p, valor_volta: mascaraValor(e.target.value) }))}
              style={S.inpS} placeholder="0,00" inputMode="numeric" />
          </div>
          <div className="rh-acoes">
            <button onClick={gerarDias} disabled={gerando} style={{ ...S.btn, padding:'5px 14px' }}>
              {gerando ? 'Gerando…' : editor.dias.length ? 'Gerar novamente' : 'Gerar dias'}
            </button>
            <button onClick={() => setEditor(null)} style={{ ...S.sec, padding:'5px 14px' }}>Voltar</button>
          </div>
        </div>

        <div className="rh-resumo">
          <div className="rh-card">
            <div className="rh-card-label">Dias de trabalho</div>
            <div className="rh-card-valor" style={{ color:'var(--blue)' }}>{totais.diasUteis}</div>
          </div>
          <div className="rh-card">
            <div className="rh-card-label">Valor cheio</div>
            <div className="rh-card-valor" style={{ color:'var(--text-body)' }}>{fmtR(totais.totalBruto)}</div>
          </div>
          <div className="rh-card">
            <div className="rh-card-label">Descontos</div>
            <div className="rh-card-valor" style={{ color:'var(--red)' }}>-{fmtR(totais.totalDescontos)}</div>
          </div>
          <div className="rh-card">
            <div className="rh-card-label">Total a pagar</div>
            <div className="rh-card-valor" style={{ color:'var(--green)' }}>{fmtR(totais.totalLiquido)}</div>
          </div>
        </div>

        <div className="rh-conteudo">
          {!editor.dias.length ? (
            <p className="rh-vazio">
              Escolha o funcionário, o período e clique em <b>Gerar dias</b>.<br />
              Dias fora da escala, feriados e faltas já vêm descontados.
            </p>
          ) : (
            <>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginBottom:12 }}>
                <button onClick={() => marcarTodos(true)} style={{ ...S.sec, padding:'6px 12px', fontSize:13 }}>
                  Marcar ida e volta em todos
                </button>
                <button onClick={() => marcarTodos(false)} style={{ ...S.sec, padding:'6px 12px', fontSize:13 }}>
                  Desmarcar todos
                </button>
                <span style={{ color:'var(--muted)', fontSize:12 }}>
                  Desmarque a ida ou a volta do dia que o funcionário não usou.
                </span>
              </div>

              {montarCalendario(editor.dias.filter(d => !d.ajuste)).map(mes => (
                <div key={mes.chave} className="rh-cal-mes">
                  <div className="rh-cal-titulo">{mes.label}</div>
                  <div className="rh-cal-dows">
                    {DIAS_SEMANA.map(d => <span key={d} className="rh-cal-dow">{d}</span>)}
                  </div>
                  <div className="rh-cal">
                    {Array.from({ length: mes.vaziosInicio }).map((_, i) => (
                      <div key={`vazio-${i}`} className="rh-cal-vazio" />
                    ))}
                    {mes.celulas.map(d => {
                      const folga = d.dia_util === false
                      const valorDia = folga ? 0 : (d.ida ? vIda : 0) + (d.volta ? vVolta : 0)
                      const descontado = !folga && (!d.ida || !d.volta)
                      return (
                        <div key={d.data} className={`rh-dia${folga ? ' folga' : ''}${descontado ? ' descontado' : ''}`}>
                          <div className="rh-dia-top">
                            <span className="rh-dia-num">{Number(d.data.slice(8, 10))}</span>
                            <span className="rh-dia-dow">{diaSemana(d.data)}</span>
                          </div>
                          <div className="rh-dia-checks">
                            <label className="rh-dia-check">
                              <input type="checkbox" checked={!!d.ida} disabled={folga}
                                onChange={() => toggleTrecho(d, 'ida')} />
                              Ida
                            </label>
                            <label className="rh-dia-check">
                              <input type="checkbox" checked={!!d.volta} disabled={folga}
                                onChange={() => toggleTrecho(d, 'volta')} />
                              Volta
                            </label>
                          </div>
                          <select value={d.motivo || ''} onChange={e => trocarMotivo(d, e.target.value)}>
                            {MOTIVOS.map(m => (
                              <option key={m || 'normal'} value={m}>
                                {m === '' ? 'Dia normal' : LABEL_MOTIVO_VT[m] || m}
                              </option>
                            ))}
                          </select>
                          <span className={`rh-dia-valor${valorDia ? '' : ' zero'}`}>{fmtR(valorDia)}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}

              {/* Dias de períodos já pagos, descontados agora com a data original */}
              <div className="rh-ajustes">
                <div className="rh-ajustes-top">
                  <div>
                    <div className="rh-ajustes-titulo">Ajustes de dias anteriores</div>
                    <div className="rh-ajustes-sub">
                      Dia de um período já pago que só agora vai ser descontado. Entra com a data
                      original e não muda o valor cheio deste período.
                    </div>
                  </div>
                  <button onClick={adicionarAjuste} style={{ ...S.sec, padding:'6px 12px', fontSize:13, whiteSpace:'nowrap' }}>
                    + Adicionar ajuste
                  </button>
                </div>

                {editor.dias.map((d, i) => ({ d, i })).filter(x => x.d.ajuste).map(({ d, i }) => {
                  const valor = (d.ida ? 0 : vIda) + (d.volta ? 0 : vVolta)
                  return (
                    <div key={`ajuste-${i}`} className="rh-ajuste">
                      <input type="date" value={d.data}
                        onChange={e => patchAjuste(i, { data: e.target.value })}
                        style={{ ...S.inpS, minWidth:140 }} />
                      <label className="rh-dia-check">
                        <input type="checkbox" checked={!d.ida}
                          onChange={e => patchAjuste(i, { ida: !e.target.checked })} />
                        Descontar ida
                      </label>
                      <label className="rh-dia-check">
                        <input type="checkbox" checked={!d.volta}
                          onChange={e => patchAjuste(i, { volta: !e.target.checked })} />
                        Descontar volta
                      </label>
                      <select value={d.motivo || 'NAO_USOU'}
                        onChange={e => patchAjuste(i, { motivo: e.target.value })}
                        style={{ ...S.inpS, minWidth:130 }}>
                        {MOTIVOS.filter(m => m).map(m => (
                          <option key={m} value={m}>{LABEL_MOTIVO_VT[m] || m}</option>
                        ))}
                      </select>
                      <input value={d.observacao || ''}
                        onChange={e => patchAjuste(i, { observacao: e.target.value })}
                        placeholder="Observação (opcional)"
                        style={{ ...S.inpS, flex:1, minWidth:120 }} />
                      <span style={{ fontWeight:700, fontSize:13, color: valor ? 'var(--red)' : 'var(--muted)', whiteSpace:'nowrap' }}>
                        -{fmtR(valor)}
                      </span>
                      <button onClick={() => removerAjuste(i)} className="btn-action-sm del" title="Remover ajuste">
                        <IconTrash />
                      </button>
                    </div>
                  )
                })}
              </div>

              {(totais.descontos.length > 0 || totais.descontosAjuste.length > 0) && (
                <div style={{ marginTop:18, background:'var(--card-bg)', border:'1px solid var(--border-light)', borderRadius:8, padding:'12px 16px' }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:8 }}>
                    Descontos do período
                  </div>
                  {totais.descontos.map(d => (
                    <div key={d.data} style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'var(--text-body)', padding:'3px 0' }}>
                      <span>
                        {fmtData(d.data)} — {LABEL_MOTIVO_VT[d.motivo] || 'Desconto'}
                        <small style={{ color:'var(--muted)', marginLeft:6 }}>
                          ({d.ida && d.volta ? 'ida e volta' : d.ida ? 'ida' : 'volta'})
                        </small>
                      </span>
                      <span style={{ color:'var(--red)', fontWeight:700 }}>-{fmtR(d.valor)}</span>
                    </div>
                  ))}

                  {totais.descontosAjuste.length > 0 && (
                    <>
                      <div style={{ fontSize:12, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.4px', margin:'10px 0 4px' }}>
                        Dias anteriores
                      </div>
                      {totais.descontosAjuste.map(d => (
                        <div key={`aj-${d.data}`} style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'var(--text-body)', padding:'3px 0' }}>
                          <span>
                            {fmtData(d.data)} — {LABEL_MOTIVO_VT[d.motivo] || 'Desconto'}
                            <small style={{ color:'var(--muted)', marginLeft:6 }}>
                              ({d.ida && d.volta ? 'ida e volta' : d.ida ? 'ida' : 'volta'})
                              {d.observacao ? ` • ${d.observacao}` : ''}
                            </small>
                          </span>
                          <span style={{ color:'var(--red)', fontWeight:700 }}>-{fmtR(d.valor)}</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}

              <div style={{ marginTop:18, display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:12 }}>
                <Campo label="Status">
                  <select value={editor.status} onChange={e => setEditor(p => ({ ...p, status: e.target.value }))} style={S.inp}>
                    <option value="PENDENTE">Pendente</option>
                    <option value="PAGO">Pago</option>
                  </select>
                </Campo>
                {editor.status === 'PAGO' && (
                  <Campo label="Data do pagamento">
                    <input type="date" value={editor.data_pagamento}
                      onChange={e => setEditor(p => ({ ...p, data_pagamento: e.target.value }))} style={S.inp} />
                  </Campo>
                )}
                <Campo label="Observação">
                  <input value={editor.observacao}
                    onChange={e => setEditor(p => ({ ...p, observacao: e.target.value }))} style={S.inp} />
                </Campo>
              </div>

              <div style={{ marginTop:18, display:'flex', gap:8, flexWrap:'wrap' }}>
                <button onClick={() => salvar()} disabled={salvando} style={{ ...S.ok, padding:'10px 18px' }}>
                  {salvando ? 'Salvando…' : 'Salvar período'}
                </button>
                {/* Abre o WhatsApp antes de salvar: window.open depois de um await
                    é tratado como popup e o navegador bloqueia. */}
                <button onClick={() => { enviarWhats(); salvar() }} disabled={salvando}
                  style={{ ...S.wpp, padding:'10px 18px', display:'inline-flex', alignItems:'center', gap:8 }}>
                  <span style={{ width:15, height:15, display:'inline-flex' }}><IconWhats /></span>
                  Salvar e enviar no WhatsApp
                </button>
                <button onClick={() => salvar({ lancarPagamento: true })} disabled={salvando}
                  style={{ ...S.btn, padding:'10px 18px' }}>
                  Salvar e lançar em pagamentos
                </button>
                <button onClick={enviarWhats} style={{ ...S.sec, padding:'10px 18px' }}>
                  Só enviar no WhatsApp
                </button>
              </div>
            </>
          )}
        </div>
      </>
    )
  }

  // ════════════════════════════════════════════════════════════
  // LISTA DE PERÍODOS
  // ════════════════════════════════════════════════════════════
  return (
    <>
      <div className="rh-filtros">
        <div className="rh-f" style={{ minWidth:170 }}>
          <label>Funcionário</label>
          <select value={filtroFunc} onChange={e => setFiltroFunc(e.target.value)} style={S.inpS}>
            <option value="">Todos</option>
            {funcionarios.map(f => <option key={f.id} value={f.id}>{f.apelido || f.nome}</option>)}
          </select>
        </div>
        <div className="rh-f" style={{ minWidth:120 }}>
          <label>Status</label>
          <select value={filtroSt} onChange={e => setFiltroSt(e.target.value)} style={S.inpS}>
            <option value="Todos">Todos</option>
            <option value="PENDENTE">Pendentes</option>
            <option value="PAGO">Pagos</option>
          </select>
        </div>
        <div className="rh-f">
          <label>Início</label>
          <input type="date" value={dataIni} onChange={e => setDataIni(e.target.value)} style={S.inpS} />
        </div>
        <div className="rh-f">
          <label>Fim</label>
          <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} style={S.inpS} />
        </div>
        <div className="rh-acoes">
          <button onClick={carregar} style={{ ...S.btn, padding:'5px 14px' }}>Filtrar</button>
          <button onClick={abrirNovo} style={{ ...S.ok, padding:'5px 14px' }}>+ Novo período</button>
        </div>
      </div>

      <div className="rh-resumo">
        <div className="rh-card">
          <div className="rh-card-label">A pagar</div>
          <div className="rh-card-valor" style={{ color:'var(--red)' }}>{fmtR(totalPendente)}</div>
        </div>
        <div className="rh-card">
          <div className="rh-card-label">Pago</div>
          <div className="rh-card-valor" style={{ color:'var(--green)' }}>{fmtR(totalPago)}</div>
        </div>
        <div className="rh-card">
          <div className="rh-card-label">Períodos</div>
          <div className="rh-card-valor" style={{ color:'var(--blue)' }}>{lista.length}</div>
        </div>
      </div>

      <div className="rh-conteudo">
        {carregando ? (
          <p style={{ color:'var(--muted)' }}>Carregando…</p>
        ) : lista.length === 0 ? (
          <p className="rh-vazio">Nenhum período de vale transporte no filtro.</p>
        ) : (
          <div>
            {lista.map(p => {
              const f = p.funcionarios || {}
              return (
                <div key={p.id} className="rh-linha">
                  <div className="rh-linha-info">
                    <div className="rh-linha-nome">
                      {f.apelido || f.nome || 'Funcionário'}
                      <small style={{ color:'var(--muted)', fontWeight:400, marginLeft:8 }}>
                        {fmtData(p.data_inicio)} a {fmtData(p.data_fim)}
                      </small>
                    </div>
                    <div className="rh-linha-sub">
                      {p.dias_uteis} dias • cheio {fmtR(p.total_bruto)} •
                      <span style={{ color:'var(--red)' }}> desconto {fmtR(p.total_descontos)}</span>
                      {p.status === 'PAGO' && p.data_pagamento && (
                        <span style={{ color:'var(--green)', marginLeft:6 }}>✓ pago {fmtData(p.data_pagamento)}</span>
                      )}
                    </div>
                  </div>
                  <span style={{ fontWeight:700, fontSize:14, flexShrink:0,
                    color: p.status === 'PAGO' ? 'var(--green)' : 'var(--yellow)' }}>
                    {fmtR(p.total_liquido)}
                  </span>
                  <span className={`rh-badge ${p.status === 'PAGO' ? 'ok' : 'pend'}`}>
                    {p.status === 'PAGO' ? 'Pago' : 'Pendente'}
                  </span>
                  <div className="rh-row-acoes">
                    <button onClick={() => enviarWhatsDaLista(p)} className="btn-action-sm wpp"
                      title="Enviar valores no WhatsApp">
                      <IconWhats />
                    </button>
                    {p.status !== 'PAGO' ? (
                      <button onClick={() => { setModalPagar(p); setDataPag(HOJE) }}
                        className="btn-action-sm send" title="Marcar como pago">
                        <IconCheck />
                      </button>
                    ) : (
                      <button onClick={() => reabrir(p)} className="btn-action-sm fila" title="Reabrir">
                        <IconUndo />
                      </button>
                    )}
                    <button onClick={() => abrirPeriodo(p)} className="btn-action-sm copy" title="Abrir / editar">
                      <IconEdit />
                    </button>
                    <button onClick={() => setConfirmDel(p)} className="btn-action-sm del" title="Excluir">
                      <IconTrash />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {modalPagar && (
        <Modal
          titulo="Registrar pagamento do VT"
          onFechar={() => setModalPagar(null)}
          largura={420}
          footer={
            <>
              <button className="btn-cancel" onClick={() => setModalPagar(null)}>Cancelar</button>
              <button className="btn-confirm" onClick={confirmarPagamento}>Confirmar</button>
            </>
          }
        >
          <Campo label="Data do pagamento">
            <input type="date" value={dataPag} onChange={e => setDataPag(e.target.value)} style={S.inp} />
          </Campo>
          <p style={{ color:'var(--muted)', fontSize:12, margin:0 }}>
            Valor: <b style={{ color:'var(--green)' }}>{fmtR(modalPagar.total_liquido)}</b>
          </p>
        </Modal>
      )}

      {confirmDel && (
        <ModalConfirma
          titulo="Excluir período"
          texto={`Excluir o vale transporte de ${fmtData(confirmDel.data_inicio)} a ${fmtData(confirmDel.data_fim)}?`}
          onCancelar={() => setConfirmDel(null)}
          onConfirmar={confirmarExclusao}
        />
      )}
    </>
  )
}
