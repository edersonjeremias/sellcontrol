import { useState, useEffect, useCallback } from 'react'
import {
  fmtR, fmtData, isoLocal, primeiroDiaMes, ultimoDiaMes,
  mascaraValor, parseValor, valorParaInput, abrirWhatsApp,
  getLancamentos, salvarLancamento, pagarLancamento, reabrirLancamento, excluirLancamento,
  criarLancamentoParcelado, excluirGrupoLancamentos,
  resumoPorFuncionario, ehDesconto, labelStatus,
  competenciaDe, formatarCompetencia, competenciaCurta, moverParaCompetencia,
  TIPOS_LANCAMENTO, LABEL_TIPO, FREQUENCIAS, MAX_PARCELAS,
} from '../../services/rhService'
import { S, Campo, Modal, ModalConfirma, IconCheck, IconClip, IconEdit, IconRecibo, IconTrash, IconUndo, IconWhats } from './RhUI'
import { gerarReciboPdf } from './reciboPdf'
import ModalComprovantes from './ModalComprovantes'

const HOJE = isoLocal(new Date())

const FORMAS = ['PIX', 'Dinheiro', 'Transferência', 'Cartão', 'Desconto em folha']

const FORM_VAZIO = {
  funcionario_id: '', tipo: 'VALE', descricao: '', valor: '',
  data_prevista: HOJE, status: 'PENDENTE', data_pagamento: '',
  forma_pagamento: '', observacao: '', parcelas: 1, freq: 'mensal',
  competencia: HOJE.slice(0, 7),
}

// Extrato do período para mandar no WhatsApp
function mensagemExtrato(resumo, lancs, periodoTexto) {
  const primeiroNome = String(resumo.nome).split(' ')[0]
  const linhas = [
    `Olá, ${primeiroNome}!`,
    '',
    `*Vales e pagamentos — ${periodoTexto}*`,
    '',
  ]
  lancs.forEach(l => {
    const desconto = ehDesconto(l.tipo)
    const situacao = l.status === 'PAGO'
      ? `${desconto ? 'descontado' : 'pago'}${l.data_pagamento ? ' em ' + fmtData(l.data_pagamento) : ''}`
      : desconto ? 'a descontar' : 'a pagar'
    linhas.push(`• ${fmtData(l.data_prevista)} — ${LABEL_TIPO[l.tipo] || l.tipo}` +
      `${l.descricao ? ` (${l.descricao})` : ''}: ${desconto ? '-' : ''}${fmtR(l.valor)} — ${situacao}`)
  })

  linhas.push('', `Total já pago: ${fmtR(resumo.pago)}`)
  if (resumo.descontado) linhas.push(`Total já descontado: ${fmtR(resumo.descontado)}`)
  linhas.push(`Total a receber: ${fmtR(resumo.aReceber)}`)
  if (resumo.aDescontar) {
    linhas.push(`Descontos a aplicar: -${fmtR(resumo.aDescontar)}`)
    linhas.push(`*Saldo: ${fmtR(resumo.saldo)}*`)
  }
  linhas.push('', 'Qualquer dúvida, me avise!')
  return linhas.join('\n')
}

export default function AbaVales({ tenantId, showToast, funcionarios, empresa }) {
  const [lancs,      setLancs]      = useState([])
  const [carregando, setCarregando] = useState(false)
  const [dataIni,    setDataIni]    = useState(primeiroDiaMes)
  const [dataFim,    setDataFim]    = useState(ultimoDiaMes)
  const [busca,      setBusca]      = useState('')
  const [filtroFunc, setFiltroFunc] = useState('')
  const [filtroSt,   setFiltroSt]   = useState('Todos')
  const [abertos,    setAbertos]    = useState(new Set())
  // yyyy-MM do <input type="month">; vazio = filtra pelas datas
  const [competencia, setCompetencia] = useState('')

  const [modal,      setModal]      = useState(null)   // 'novo' | lançamento
  const [form,       setForm]       = useState(FORM_VAZIO)
  const [salvando,   setSalvando]   = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)
  const [modalPagar, setModalPagar] = useState(null)
  const [dataPag,    setDataPag]    = useState(HOJE)
  const [formaPag,   setFormaPag]   = useState('PIX')
  const [modalComp,  setModalComp]  = useState(null)   // lançamento dos comprovantes
  // Trazer lançamentos de outro acerto para o acerto filtrado
  const [modalTrazer, setModalTrazer] = useState(null) // { origem, itens, sel, carregando }

  // Quick add
  const [qa, setQa] = useState({
    funcionario_id:'', tipo:'VALE', descricao:'', valor:'',
    data_prevista:HOJE, pago:false, parcelas:1, freq:'mensal',
  })

  const carregar = useCallback(async () => {
    if (!tenantId) return
    setCarregando(true)
    try {
      const { data } = await getLancamentos(tenantId, {
        dataInicio: dataIni,
        dataFim,
        funcionarioId: filtroFunc || undefined,
        competencia:   competencia ? `${competencia}-01` : undefined,
      })
      setLancs(data)
    } catch (e) { showToast('Erro ao carregar lançamentos: ' + e.message, 'error') }
    setCarregando(false)
  }, [tenantId, dataIni, dataFim, filtroFunc, competencia, showToast])

  useEffect(() => { carregar() }, [carregar])

  const filtrados = lancs.filter(l => {
    if (filtroSt !== 'Todos' && l.status !== filtroSt) return false
    if (!busca.trim()) return true
    const termos = busca.toLowerCase().split(/[\s,]+/).filter(Boolean)
    const f = l.funcionarios || {}
    const txt = [f.nome, f.apelido, l.descricao, LABEL_TIPO[l.tipo], l.observacao, l.forma_pagamento]
      .join(' ').toLowerCase()
    return termos.every(t => txt.includes(t))
  })

  const soma = (fn) => filtrados.filter(fn).reduce((s, l) => s + (Number(l.valor) || 0), 0)
  const totalPendente  = soma(l => l.status !== 'PAGO' && !ehDesconto(l.tipo))
  const totalPago      = soma(l => l.status === 'PAGO' && !ehDesconto(l.tipo))
  const totalDescontar = soma(l => l.status !== 'PAGO' &&  ehDesconto(l.tipo))

  const resumos = resumoPorFuncionario(filtrados)

  const rotuloPeriodo = competencia
    ? formatarCompetencia(`${competencia}-01`)
    : `${fmtData(dataIni)} a ${fmtData(dataFim)}`

  function toggleFunc(id) {
    setAbertos(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  async function salvarQA() {
    if (!qa.funcionario_id) return showToast('Escolha o funcionário.', 'error')
    if (!qa.valor)          return showToast('Informe o valor.', 'error')
    const parcelas = Math.max(1, parseInt(qa.parcelas, 10) || 1)
    setSalvando(true)
    try {
      await criarLancamentoParcelado(tenantId, {
        funcionario_id: qa.funcionario_id,
        tipo:           qa.tipo,
        descricao:      qa.descricao.trim() || null,
        valor:          parseValor(qa.valor),
        data_prevista:  qa.data_prevista || HOJE,
        status:         qa.pago ? 'PAGO' : 'PENDENTE',
        data_pagamento: qa.pago ? (qa.data_prevista || HOJE) : null,
        // Com um acerto filtrado, o lançamento rápido cai nele
        competencia:    competencia ? `${competencia}-01` : competenciaDe(qa.data_prevista || HOJE),
      }, { freq: qa.freq, parcelas })
      showToast(parcelas > 1 ? `${parcelas} parcelas lançadas!` : 'Lançamento salvo!', 'success')
      setAbertos(prev => new Set([...prev, qa.funcionario_id]))
      if (filtroSt !== 'Todos' && filtroSt !== (qa.pago ? 'PAGO' : 'PENDENTE')) setFiltroSt('Todos')
      setQa(p => ({ ...p, descricao:'', valor:'', pago:false, parcelas:1 }))
      carregar()
    } catch (e) { showToast('Erro ao salvar: ' + e.message, 'error') }
    setSalvando(false)
  }

  function abrirNovo() {
    setForm({
      ...FORM_VAZIO,
      funcionario_id: filtroFunc || '',
      competencia:    competencia || HOJE.slice(0, 7),
    })
    setModal('novo')
  }

  function abrirEditar(l) {
    setForm({
      funcionario_id:  l.funcionario_id,
      tipo:            l.tipo,
      descricao:       l.descricao || '',
      valor:           valorParaInput(l.valor),
      data_prevista:   l.data_prevista || HOJE,
      status:          l.status,
      data_pagamento:  l.data_pagamento || '',
      forma_pagamento: l.forma_pagamento || '',
      observacao:      l.observacao || '',
      parcelas:        1,          // edição mexe só nesta parcela
      freq:            'mensal',
      competencia:     (l.competencia || l.data_prevista || HOJE).slice(0, 7),
    })
    setModal(l)
  }

  async function salvar() {
    if (!form.funcionario_id) return showToast('Escolha o funcionário.', 'error')
    if (!form.valor)          return showToast('Informe o valor.', 'error')
    const novo = modal === 'novo'
    const parcelas = novo ? Math.max(1, parseInt(form.parcelas, 10) || 1) : 1
    setSalvando(true)
    try {
      const base = {
        id:              novo ? undefined : modal.id,
        funcionario_id:  form.funcionario_id,
        tipo:            form.tipo,
        descricao:       form.descricao.trim() || null,
        valor:           parseValor(form.valor),
        data_prevista:   form.data_prevista || HOJE,
        status:          form.status,
        data_pagamento:  form.status === 'PAGO' ? (form.data_pagamento || form.data_prevista) : null,
        forma_pagamento: form.forma_pagamento || null,
        observacao:      form.observacao.trim() || null,
        competencia:     form.competencia ? `${form.competencia}-01` : competenciaDe(form.data_prevista || HOJE),
      }
      if (novo) await criarLancamentoParcelado(tenantId, base, { freq: form.freq, parcelas })
      else      await salvarLancamento(tenantId, base)

      showToast(
        parcelas > 1 ? `${parcelas} parcelas lançadas!`
          : novo ? 'Lançamento salvo!' : 'Lançamento atualizado!',
        'success',
      )
      setAbertos(prev => new Set([...prev, form.funcionario_id]))
      setModal(null)
      carregar()
    } catch (e) { showToast('Erro: ' + e.message, 'error') }
    setSalvando(false)
  }

  async function confirmarPagamento() {
    try {
      await pagarLancamento(modalPagar.id, dataPag, formaPag)
      showToast('Pagamento registrado!', 'success')
      setModalPagar(null)
      carregar()
    } catch (e) { showToast('Erro: ' + e.message, 'error') }
  }

  async function reabrir(l) {
    try {
      await reabrirLancamento(l.id)
      showToast('Lançamento reaberto.', 'success')
      carregar()
    } catch (e) { showToast('Erro: ' + e.message, 'error') }
  }

  async function confirmarExclusao(grupoInteiro = false) {
    try {
      if (grupoInteiro && confirmDel.grupo_id) {
        await excluirGrupoLancamentos(confirmDel.grupo_id)
        showToast('Parcelas excluídas.', 'success')
      } else {
        await excluirLancamento(confirmDel.id)
        showToast('Lançamento excluído.', 'success')
      }
      carregar()
    } catch (e) { showToast('Erro: ' + e.message, 'error') }
    setConfirmDel(null)
  }

  // ── Trazer lançamentos de outro acerto ──────────────────────
  function mesAnterior(comp) {
    const [ano, mes] = comp.split('-').map(Number)
    const d = new Date(ano, mes - 2, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  async function abrirTrazer(origem) {
    const mes = origem || mesAnterior(competencia)
    setModalTrazer({ origem: mes, itens: [], sel: new Set(), carregando: true })
    try {
      const { data } = await getLancamentos(tenantId, {
        competencia:   `${mes}-01`,
        funcionarioId: filtroFunc || undefined,
      })
      setModalTrazer(p => (p ? { ...p, itens: data, carregando: false } : p))
    } catch (e) {
      showToast('Erro ao buscar: ' + e.message, 'error')
      setModalTrazer(p => (p ? { ...p, carregando: false } : p))
    }
  }

  function alternarSelTrazer(id) {
    setModalTrazer(p => {
      const sel = new Set(p.sel)
      sel.has(id) ? sel.delete(id) : sel.add(id)
      return { ...p, sel }
    })
  }

  async function confirmarTrazer() {
    const ids = [...modalTrazer.sel]
    if (!ids.length) return showToast('Marque os lançamentos que vão entrar neste acerto.', 'error')
    try {
      await moverParaCompetencia(ids, `${competencia}-01`)
      showToast(`${ids.length} ${ids.length === 1 ? 'lançamento movido' : 'lançamentos movidos'} para ${formatarCompetencia(`${competencia}-01`)}.`, 'success')
      setModalTrazer(null)
      carregar()
    } catch (e) { showToast('Erro ao mover: ' + e.message, 'error') }
  }

  function gerarRecibo(resumo) {
    const doFunc = filtrados.filter(l => l.funcionario_id === resumo.funcionario_id)
    if (!doFunc.length) return showToast('Nenhum lançamento no período.', 'error')
    const func = funcionarios.find(f => f.id === resumo.funcionario_id) || { nome: resumo.nome }
    try {
      gerarReciboPdf({
        empresa:      empresa || {},
        funcionario:  func,
        dataInicio:   dataIni,
        dataFim,
        periodoTexto: competencia ? formatarCompetencia(`${competencia}-01`) : null,
        lancamentos:  doFunc,
      })
      showToast('Recibo gerado!', 'success')
    } catch (e) {
      showToast('Erro ao gerar o recibo: ' + e.message, 'error')
    }
  }

  function enviarExtrato(resumo) {
    const doFunc = filtrados
      .filter(l => l.funcionario_id === resumo.funcionario_id)
      .sort((a, b) => String(a.data_prevista).localeCompare(String(b.data_prevista)))
    if (!doFunc.length) return showToast('Nenhum lançamento no período.', 'error')
    const ok = abrirWhatsApp(resumo.whatsapp, mensagemExtrato(resumo, doFunc, rotuloPeriodo))
    if (!ok) showToast('Funcionário sem WhatsApp cadastrado.', 'error')
  }

  const ativos = funcionarios.filter(f => f.ativo)

  return (
    <>
      <div className="rh-filtros">
        <div className="rh-f rh-f-busca">
          <label>Buscar</label>
          <input value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Busca inteligente (termo1 termo2)" style={S.inpS} />
        </div>
        <div className="rh-f" style={{ minWidth:150 }}>
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
        <div className="rh-f" style={{ minWidth:140 }}>
          <label>Acerto (competência)</label>
          <input type="month" value={competencia} onChange={e => setCompetencia(e.target.value)}
            title="Mostra tudo que entra no acerto deste mês, qualquer que seja a data" style={S.inpS} />
        </div>
        <div className="rh-f" style={{ opacity: competencia ? 0.4 : 1 }}>
          <label>Início</label>
          <input type="date" value={dataIni} onChange={e => setDataIni(e.target.value)}
            disabled={!!competencia} style={S.inpS} />
        </div>
        <div className="rh-f" style={{ opacity: competencia ? 0.4 : 1 }}>
          <label>Fim</label>
          <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
            disabled={!!competencia} style={S.inpS} />
        </div>
        <div className="rh-acoes">
          <button onClick={carregar} style={{ ...S.btn, padding:'5px 14px' }}>Filtrar</button>
          {competencia && (
            <button onClick={() => abrirTrazer()} style={{ ...S.sec, padding:'5px 14px' }}
              title="Puxar lançamentos de outro mês para este acerto">
              Trazer de outro mês
            </button>
          )}
          <button onClick={abrirNovo} style={{ ...S.ok, padding:'5px 14px' }}>+ Novo</button>
        </div>
      </div>

      <div className="rh-resumo">
        <div className="rh-card">
          <div className="rh-card-label">A pagar (período)</div>
          <div className="rh-card-valor" style={{ color:'var(--red)' }}>{fmtR(totalPendente)}</div>
        </div>
        <div className="rh-card">
          <div className="rh-card-label">Pago (período)</div>
          <div className="rh-card-valor" style={{ color:'var(--green)' }}>{fmtR(totalPago)}</div>
        </div>
        <div className="rh-card">
          <div className="rh-card-label">A descontar</div>
          <div className="rh-card-valor" style={{ color:'var(--yellow)' }}>{fmtR(totalDescontar)}</div>
        </div>
        <div className="rh-card">
          <div className="rh-card-label">Lançamentos</div>
          <div className="rh-card-valor" style={{ color:'var(--blue)' }}>{filtrados.length}</div>
        </div>
      </div>

      {/* Quick add — oculto no celular pelo CSS, lá usa o botão "+ Novo" */}
      <div className="rh-qa" style={{ background:'var(--card-bg)', borderBottom:'1px solid var(--border-light)', padding:'6px 16px', display:'flex', flexWrap:'wrap', gap:6, alignItems:'center' }}>
        <select value={qa.funcionario_id} onChange={e => setQa(p => ({ ...p, funcionario_id: e.target.value }))}
          style={{ ...S.inpS, minWidth:150 }}>
          <option value="">Funcionário…</option>
          {ativos.map(f => <option key={f.id} value={f.id}>{f.apelido || f.nome}</option>)}
        </select>
        <select value={qa.tipo} onChange={e => setQa(p => ({ ...p, tipo: e.target.value }))} style={{ ...S.inpS, minWidth:130 }}>
          {TIPOS_LANCAMENTO.map(t => <option key={t} value={t}>{LABEL_TIPO[t]}</option>)}
        </select>
        <input value={qa.descricao} onChange={e => setQa(p => ({ ...p, descricao: e.target.value }))}
          placeholder="Descrição" style={{ ...S.inpS, flex:2, minWidth:120 }}
          onKeyDown={e => e.key === 'Enter' && salvarQA()} />
        <input value={qa.valor} onChange={e => setQa(p => ({ ...p, valor: mascaraValor(e.target.value) }))}
          placeholder="0,00" style={{ ...S.inpS, width:90 }} inputMode="numeric"
          onKeyDown={e => e.key === 'Enter' && salvarQA()} />
        <input type="date" value={qa.data_prevista} onChange={e => setQa(p => ({ ...p, data_prevista: e.target.value }))}
          style={{ ...S.inpS, minWidth:110 }} />
        <div style={{ display:'flex', alignItems:'center', gap:4, background:'rgba(0,0,0,0.15)', padding:'3px 8px', borderRadius:6, border:'1px solid var(--border-light)' }}>
          <input type="number" min="1" max={MAX_PARCELAS} value={qa.parcelas}
            onChange={e => setQa(p => ({ ...p, parcelas: e.target.value }))}
            onFocus={e => e.target.select()} title="Quantidade de parcelas"
            style={{ ...S.inpS, width:44, padding:'3px 4px', fontSize:12, fontWeight:700, textAlign:'center' }} />
          <span style={{ fontSize:12, fontWeight:700, color:'var(--muted)' }}>x</span>
          {Number(qa.parcelas) > 1 && (
            <select value={qa.freq} onChange={e => setQa(p => ({ ...p, freq: e.target.value }))}
              style={{ ...S.inpS, padding:'3px 4px', fontSize:12 }}>
              {FREQUENCIAS.map(f => <option key={f.v} value={f.v}>{f.l}</option>)}
            </select>
          )}
        </div>
        <label style={{ display:'flex', alignItems:'center', gap:4, fontSize:12, fontWeight:700, color:'var(--green)', cursor:'pointer', whiteSpace:'nowrap' }}>
          <input type="checkbox" checked={qa.pago} onChange={e => setQa(p => ({ ...p, pago: e.target.checked }))}
            style={{ width:13, height:13 }} /> Pago
        </label>
        <button onClick={salvarQA} disabled={salvando} style={{ ...S.ok, padding:'5px 12px' }}>
          {salvando ? '…' : 'Inserir'}
        </button>
      </div>

      <div className="rh-conteudo">
        {carregando ? (
          <p style={{ color:'var(--muted)' }}>Carregando…</p>
        ) : resumos.length === 0 ? (
          <p className="rh-vazio">Nenhum lançamento no período.</p>
        ) : (
          <div style={{ display:'grid', gap:2 }}>
            {resumos.map(r => {
              const doFunc = filtrados
                .filter(l => l.funcionario_id === r.funcionario_id)
                .sort((a, b) => String(b.data_prevista).localeCompare(String(a.data_prevista)))
              const open = abertos.has(r.funcionario_id)
              return (
                <div key={r.funcionario_id}>
                  <div className="rh-grupo-head" onClick={() => toggleFunc(r.funcionario_id)}>
                    <span style={{ color:'var(--blue)', fontWeight:700, fontSize:13 }}>
                      {r.nome}
                      <small style={{ color:'var(--muted)', fontWeight:400, marginLeft:8 }}>
                        ({doFunc.length} {doFunc.length === 1 ? 'lançamento' : 'lançamentos'})
                      </small>
                    </span>
                    <span style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <span style={{ fontSize:12, color:'var(--muted)' }}>
                        pago <b style={{ color:'var(--green)' }}>{fmtR(r.pago)}</b>
                      </span>
                      <span style={{ fontSize:12, color:'var(--muted)' }}>
                        a pagar <b style={{ color:'var(--red)' }}>{fmtR(r.aReceber)}</b>
                      </span>
                      {r.aDescontar > 0 && (
                        <>
                          <span style={{ fontSize:12, color:'var(--muted)' }}>
                            a descontar <b style={{ color:'var(--yellow)' }}>{fmtR(r.aDescontar)}</b>
                          </span>
                          <span style={{ fontSize:12, color:'var(--muted)' }}>
                            saldo <b style={{ color: r.saldo < 0 ? 'var(--red)' : 'var(--green)' }}>{fmtR(r.saldo)}</b>
                          </span>
                        </>
                      )}
                      <button onClick={e => { e.stopPropagation(); gerarRecibo(r) }}
                        className="btn-action-sm copy" title="Gerar recibo em PDF">
                        <IconRecibo />
                      </button>
                      <button onClick={e => { e.stopPropagation(); enviarExtrato(r) }}
                        className="btn-action-sm wpp" title="Enviar extrato no WhatsApp">
                        <IconWhats />
                      </button>
                      <span style={{ fontSize:10, transform: open ? 'rotate(180deg)' : 'none' }}>▼</span>
                    </span>
                  </div>

                  {open && doFunc.map(l => (
                    <div key={l.id} className="rh-linha">
                      <div className="rh-linha-info">
                        <div className="rh-linha-nome">
                          {LABEL_TIPO[l.tipo] || l.tipo}{l.descricao ? ` — ${l.descricao}` : ''}
                          {l.total_parcelas > 1 && (
                            <span className="rh-badge off" style={{ marginLeft:8 }}>
                              {l.parcela}/{l.total_parcelas}
                            </span>
                          )}
                        </div>
                        <div className="rh-linha-sub">
                          {fmtData(l.data_prevista)}
                          {l.competencia && l.competencia.slice(0, 7) !== String(l.data_prevista).slice(0, 7) && (
                            <span style={{ color:'var(--blue)', marginLeft:6 }}>
                              acerto {competenciaCurta(l.competencia)}
                            </span>
                          )}
                          {l.forma_pagamento ? ` • ${l.forma_pagamento}` : ''}
                          {l.status === 'PAGO' && l.data_pagamento && (
                            <span style={{ color:'var(--green)', marginLeft:6 }}>
                              ✓ {ehDesconto(l.tipo) ? 'descontado' : 'pago'} {fmtData(l.data_pagamento)}
                            </span>
                          )}
                        </div>
                      </div>
                      <span style={{ fontWeight:700, fontSize:14, flexShrink:0,
                        color: ehDesconto(l.tipo) ? 'var(--red)' : l.status === 'PAGO' ? 'var(--green)' : 'var(--yellow)' }}>
                        {ehDesconto(l.tipo) ? '-' : ''}{fmtR(l.valor)}
                      </span>
                      <span className={`rh-badge ${l.status === 'PAGO' ? 'ok' : 'pend'}`}>
                        {labelStatus(l)}
                      </span>
                      <div className="rh-row-acoes">
                        <button onClick={() => setModalComp(l)}
                          className={`btn-action-sm anexo${(l.comprovantes?.length || 0) ? ' tem' : ''}`}
                          title="Comprovantes de pagamento">
                          <IconClip />
                          {(l.comprovantes?.length || 0) > 0 && (
                            <span className="rh-anexo-qtd">{l.comprovantes.length}</span>
                          )}
                        </button>
                        {l.status !== 'PAGO' ? (
                          <button onClick={() => { setModalPagar(l); setDataPag(HOJE); setFormaPag('PIX') }}
                            className="btn-action-sm send"
                            title={ehDesconto(l.tipo) ? 'Marcar como descontado' : 'Marcar como pago'}>
                            <IconCheck />
                          </button>
                        ) : (
                          <button onClick={() => reabrir(l)} className="btn-action-sm fila" title="Reabrir">
                            <IconUndo />
                          </button>
                        )}
                        <button onClick={() => abrirEditar(l)} className="btn-action-sm copy" title="Editar">
                          <IconEdit />
                        </button>
                        <button onClick={() => setConfirmDel(l)} className="btn-action-sm del" title="Excluir">
                          <IconTrash />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {modal && (
        <Modal
          titulo={modal === 'novo' ? 'Novo Lançamento' : 'Editar Lançamento'}
          onFechar={() => setModal(null)}
          footer={
            <>
              <button className="btn-cancel" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn-confirm" onClick={salvar} disabled={salvando}>
                {salvando ? 'Salvando…' : 'Salvar'}
              </button>
            </>
          }
        >
          <Campo label="Funcionário *">
            <select value={form.funcionario_id} onChange={e => setForm(p => ({ ...p, funcionario_id: e.target.value }))} style={S.inp}>
              <option value="">Selecione…</option>
              {funcionarios.map(f => <option key={f.id} value={f.id}>{f.apelido || f.nome}</option>)}
            </select>
          </Campo>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Campo label="Tipo">
              <select value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))} style={S.inp}>
                {TIPOS_LANCAMENTO.map(t => <option key={t} value={t}>{LABEL_TIPO[t]}</option>)}
              </select>
            </Campo>
            <Campo label="Valor *">
              <input value={form.valor} onChange={e => setForm(p => ({ ...p, valor: mascaraValor(e.target.value) }))}
                style={S.inp} placeholder="0,00" inputMode="numeric" />
            </Campo>
          </div>
          <Campo label="Descrição">
            <input value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))}
              style={S.inp} placeholder="Ex: Vale do dia 10" />
          </Campo>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Campo label={modal === 'novo' && Number(form.parcelas) > 1 ? 'Primeira parcela em' : 'Data prevista'}>
              <input type="date" value={form.data_prevista}
                onChange={e => setForm(p => ({ ...p, data_prevista: e.target.value }))} style={S.inp} />
            </Campo>
            <Campo label="Status">
              <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} style={S.inp}>
                <option value="PENDENTE">{ehDesconto(form.tipo) ? 'A descontar' : 'Pendente'}</option>
                <option value="PAGO">{ehDesconto(form.tipo) ? 'Descontado' : 'Pago'}</option>
              </select>
            </Campo>
          </div>

          <Campo label="Entra no acerto de">
            <input type="month" value={form.competencia}
              onChange={e => setForm(p => ({ ...p, competencia: e.target.value }))} style={S.inp} />
            <span style={{ fontSize:11, color:'var(--muted)' }}>
              Mês do acerto, não do vencimento. Salário de outubro pago em novembro fica em outubro,
              junto dos vales do mês.
            </span>
          </Campo>

          {modal === 'novo' && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <Campo label="Parcelas">
                <input type="number" min="1" max={MAX_PARCELAS} value={form.parcelas}
                  onChange={e => setForm(p => ({ ...p, parcelas: e.target.value }))}
                  onFocus={e => e.target.select()} style={S.inp} />
              </Campo>
              {Number(form.parcelas) > 1 && (
                <Campo label="Repetir a cada">
                  <select value={form.freq} onChange={e => setForm(p => ({ ...p, freq: e.target.value }))} style={S.inp}>
                    {FREQUENCIAS.map(f => <option key={f.v} value={f.v}>{f.l}</option>)}
                  </select>
                </Campo>
              )}
            </div>
          )}

          {modal === 'novo' && Number(form.parcelas) > 1 && (
            <p style={{ color:'var(--muted)', fontSize:12, margin:0 }}>
              O valor informado é o de <b>cada parcela</b>: {form.parcelas}x de {fmtR(parseValor(form.valor))} ={' '}
              <b style={{ color:'var(--text-body)' }}>{fmtR(parseValor(form.valor) * Number(form.parcelas))}</b> no total.
            </p>
          )}
          {form.status === 'PAGO' && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <Campo label="Data do pagamento">
                <input type="date" value={form.data_pagamento}
                  onChange={e => setForm(p => ({ ...p, data_pagamento: e.target.value }))} style={S.inp} />
              </Campo>
              <Campo label="Forma">
                <select value={form.forma_pagamento}
                  onChange={e => setForm(p => ({ ...p, forma_pagamento: e.target.value }))} style={S.inp}>
                  <option value="">—</option>
                  {FORMAS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </Campo>
            </div>
          )}
          <Campo label="Observação">
            <textarea value={form.observacao} onChange={e => setForm(p => ({ ...p, observacao: e.target.value }))}
              style={{ ...S.inp, minHeight:60, resize:'vertical' }} />
          </Campo>
        </Modal>
      )}

      {modalPagar && (
        <Modal
          titulo="Registrar pagamento"
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
          <Campo label="Forma de pagamento">
            <select value={formaPag} onChange={e => setFormaPag(e.target.value)} style={S.inp}>
              {FORMAS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </Campo>
        </Modal>
      )}

      {modalTrazer && (
        <Modal
          titulo={`Trazer para o acerto de ${formatarCompetencia(`${competencia}-01`)}`}
          onFechar={() => setModalTrazer(null)}
          largura={620}
          footer={
            <>
              <button className="btn-cancel" onClick={() => setModalTrazer(null)}>Cancelar</button>
              <button className="btn-confirm" onClick={confirmarTrazer}>
                Mover {modalTrazer.sel.size || ''}
              </button>
            </>
          }
        >
          <Campo label="Buscar no acerto de">
            <input type="month" value={modalTrazer.origem}
              onChange={e => abrirTrazer(e.target.value)} style={S.inp} />
          </Campo>

          {modalTrazer.carregando ? (
            <p style={{ color:'var(--muted)', margin:0 }}>Carregando…</p>
          ) : !modalTrazer.itens.length ? (
            <p style={{ color:'var(--muted)', margin:0 }}>Nenhum lançamento nesse acerto.</p>
          ) : (
            <>
              <button
                onClick={() => setModalTrazer(p => ({
                  ...p,
                  sel: p.sel.size === p.itens.length ? new Set() : new Set(p.itens.map(i => i.id)),
                }))}
                style={{ ...S.sec, padding:'5px 12px', fontSize:12, justifySelf:'start' }}>
                {modalTrazer.sel.size === modalTrazer.itens.length ? 'Desmarcar todos' : 'Marcar todos'}
              </button>

              <div style={{ display:'grid', gap:2 }}>
                {modalTrazer.itens.map(l => {
                  const f = l.funcionarios || {}
                  const marcado = modalTrazer.sel.has(l.id)
                  return (
                    <label key={l.id} style={{
                      display:'flex', alignItems:'center', gap:10, padding:'8px 10px',
                      background: marcado ? 'rgba(138,180,248,0.1)' : 'var(--card-bg)',
                      border:'1px solid var(--border-light)', borderRadius:6, cursor:'pointer',
                    }}>
                      <input type="checkbox" checked={marcado}
                        onChange={() => alternarSelTrazer(l.id)} style={{ width:14, height:14 }} />
                      <span style={{ flex:1, minWidth:0 }}>
                        <span style={{ fontSize:13, color:'var(--text-header)' }}>
                          {f.apelido || f.nome} — {LABEL_TIPO[l.tipo] || l.tipo}
                          {l.descricao ? ` (${l.descricao})` : ''}
                        </span>
                        <span style={{ display:'block', fontSize:11, color:'var(--muted)' }}>
                          {fmtData(l.data_prevista)} • {labelStatus(l)}
                        </span>
                      </span>
                      <span style={{ fontWeight:700, fontSize:13, whiteSpace:'nowrap',
                        color: ehDesconto(l.tipo) ? 'var(--red)' : 'var(--green)' }}>
                        {ehDesconto(l.tipo) ? '-' : ''}{fmtR(l.valor)}
                      </span>
                    </label>
                  )
                })}
              </div>
            </>
          )}
        </Modal>
      )}

      {modalComp && (
        <ModalComprovantes
          lancamento={modalComp}
          tenantId={tenantId}
          showToast={showToast}
          onFechar={() => setModalComp(null)}
          onAtualizar={carregar}
        />
      )}

      {confirmDel && (confirmDel.grupo_id ? (
        <Modal
          titulo="Excluir lançamento parcelado"
          onFechar={() => setConfirmDel(null)}
          largura={460}
          footer={
            <>
              <button className="btn-cancel" onClick={() => setConfirmDel(null)}>Cancelar</button>
              <button className="btn-danger" onClick={() => confirmarExclusao(false)}>Só esta</button>
              <button className="btn-danger" onClick={() => confirmarExclusao(true)}>
                Todas ({confirmDel.total_parcelas})
              </button>
            </>
          }
        >
          <p style={{ margin:0 }}>
            {LABEL_TIPO[confirmDel.tipo] || confirmDel.tipo}
            {confirmDel.descricao ? ` — ${confirmDel.descricao}` : ''} de {fmtR(confirmDel.valor)}.
            <br /><br />
            Excluir somente a parcela {confirmDel.parcela} ou todas as {confirmDel.total_parcelas} parcelas
            deste lançamento, inclusive as já quitadas?
          </p>
        </Modal>
      ) : (
        <ModalConfirma
          titulo="Excluir lançamento"
          texto={`Excluir ${LABEL_TIPO[confirmDel.tipo] || confirmDel.tipo} de ${fmtR(confirmDel.valor)}?`}
          onCancelar={() => setConfirmDel(null)}
          onConfirmar={() => confirmarExclusao(false)}
        />
      ))}
    </>
  )
}
