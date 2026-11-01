import { useState, useEffect, useCallback } from 'react'
import {
  fmtR, fmtData, isoLocal, primeiroDiaMes, ultimoDiaMes,
  mascaraValor, parseValor, valorParaInput, abrirWhatsApp,
  getLancamentos, salvarLancamento, pagarLancamento, reabrirLancamento, excluirLancamento,
  resumoPorFuncionario, sinalTipo, TIPOS_LANCAMENTO, LABEL_TIPO,
} from '../../services/rhService'
import { S, Campo, Modal, ModalConfirma, IconCheck, IconClip, IconEdit, IconTrash, IconUndo, IconWhats } from './RhUI'
import ModalComprovantes from './ModalComprovantes'

const HOJE = isoLocal(new Date())

const FORMAS = ['PIX', 'Dinheiro', 'Transferência', 'Cartão', 'Desconto em folha']

const FORM_VAZIO = {
  funcionario_id: '', tipo: 'VALE', descricao: '', valor: '',
  data_prevista: HOJE, status: 'PENDENTE', data_pagamento: '',
  forma_pagamento: '', observacao: '',
}

// Extrato do período para mandar no WhatsApp
function mensagemExtrato(resumo, lancs, dataIni, dataFim) {
  const primeiroNome = String(resumo.nome).split(' ')[0]
  const linhas = [
    `Olá, ${primeiroNome}!`,
    '',
    `*Vales e pagamentos — ${fmtData(dataIni)} a ${fmtData(dataFim)}*`,
    '',
  ]
  lancs.forEach(l => {
    const sinal = l.tipo === 'DESCONTO' ? '-' : ''
    const situacao = l.status === 'PAGO'
      ? `pago${l.data_pagamento ? ' em ' + fmtData(l.data_pagamento) : ''}`
      : 'a pagar'
    linhas.push(`• ${fmtData(l.data_prevista)} — ${LABEL_TIPO[l.tipo] || l.tipo}` +
      `${l.descricao ? ` (${l.descricao})` : ''}: ${sinal}${fmtR(l.valor)} — ${situacao}`)
  })
  linhas.push(
    '',
    `Total já pago: ${fmtR(resumo.pago)}`,
    `Total a pagar: ${fmtR(resumo.pendente)}`,
    '',
    'Qualquer dúvida, me avise!',
  )
  return linhas.join('\n')
}

export default function AbaVales({ tenantId, showToast, funcionarios }) {
  const [lancs,      setLancs]      = useState([])
  const [carregando, setCarregando] = useState(false)
  const [dataIni,    setDataIni]    = useState(primeiroDiaMes)
  const [dataFim,    setDataFim]    = useState(ultimoDiaMes)
  const [busca,      setBusca]      = useState('')
  const [filtroFunc, setFiltroFunc] = useState('')
  const [filtroSt,   setFiltroSt]   = useState('Todos')
  const [abertos,    setAbertos]    = useState(new Set())

  const [modal,      setModal]      = useState(null)   // 'novo' | lançamento
  const [form,       setForm]       = useState(FORM_VAZIO)
  const [salvando,   setSalvando]   = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)
  const [modalPagar, setModalPagar] = useState(null)
  const [dataPag,    setDataPag]    = useState(HOJE)
  const [formaPag,   setFormaPag]   = useState('PIX')
  const [modalComp,  setModalComp]  = useState(null)   // lançamento dos comprovantes

  // Quick add
  const [qa, setQa] = useState({ funcionario_id:'', tipo:'VALE', descricao:'', valor:'', data_prevista:HOJE, pago:false })

  const carregar = useCallback(async () => {
    if (!tenantId) return
    setCarregando(true)
    try {
      const { data } = await getLancamentos(tenantId, {
        dataInicio: dataIni, dataFim, funcionarioId: filtroFunc || undefined,
      })
      setLancs(data)
    } catch (e) { showToast('Erro ao carregar lançamentos: ' + e.message, 'error') }
    setCarregando(false)
  }, [tenantId, dataIni, dataFim, filtroFunc, showToast])

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

  const totalPendente = filtrados.filter(l => l.status !== 'PAGO')
    .reduce((s, l) => s + (Number(l.valor) || 0) * sinalTipo(l.tipo), 0)
  const totalPago = filtrados.filter(l => l.status === 'PAGO')
    .reduce((s, l) => s + (Number(l.valor) || 0) * sinalTipo(l.tipo), 0)

  const resumos = resumoPorFuncionario(filtrados)

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
    setSalvando(true)
    try {
      await salvarLancamento(tenantId, {
        funcionario_id: qa.funcionario_id,
        tipo:           qa.tipo,
        descricao:      qa.descricao.trim() || null,
        valor:          parseValor(qa.valor),
        data_prevista:  qa.data_prevista || HOJE,
        status:         qa.pago ? 'PAGO' : 'PENDENTE',
        data_pagamento: qa.pago ? (qa.data_prevista || HOJE) : null,
      })
      showToast('Lançamento salvo!', 'success')
      setAbertos(prev => new Set([...prev, qa.funcionario_id]))
      if (filtroSt !== 'Todos' && filtroSt !== (qa.pago ? 'PAGO' : 'PENDENTE')) setFiltroSt('Todos')
      setQa(p => ({ ...p, descricao:'', valor:'', pago:false }))
      carregar()
    } catch (e) { showToast('Erro ao salvar: ' + e.message, 'error') }
    setSalvando(false)
  }

  function abrirNovo() {
    setForm({ ...FORM_VAZIO, funcionario_id: filtroFunc || '' })
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
    })
    setModal(l)
  }

  async function salvar() {
    if (!form.funcionario_id) return showToast('Escolha o funcionário.', 'error')
    if (!form.valor)          return showToast('Informe o valor.', 'error')
    setSalvando(true)
    try {
      await salvarLancamento(tenantId, {
        id:              modal === 'novo' ? undefined : modal.id,
        funcionario_id:  form.funcionario_id,
        tipo:            form.tipo,
        descricao:       form.descricao.trim() || null,
        valor:           parseValor(form.valor),
        data_prevista:   form.data_prevista || HOJE,
        status:          form.status,
        data_pagamento:  form.status === 'PAGO' ? (form.data_pagamento || form.data_prevista) : null,
        forma_pagamento: form.forma_pagamento || null,
        observacao:      form.observacao.trim() || null,
      })
      showToast(modal === 'novo' ? 'Lançamento salvo!' : 'Lançamento atualizado!', 'success')
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

  async function confirmarExclusao() {
    try {
      await excluirLancamento(confirmDel.id)
      showToast('Lançamento excluído.', 'success')
      carregar()
    } catch (e) { showToast('Erro: ' + e.message, 'error') }
    setConfirmDel(null)
  }

  function enviarExtrato(resumo) {
    const doFunc = filtrados
      .filter(l => l.funcionario_id === resumo.funcionario_id)
      .sort((a, b) => String(a.data_prevista).localeCompare(String(b.data_prevista)))
    if (!doFunc.length) return showToast('Nenhum lançamento no período.', 'error')
    const ok = abrirWhatsApp(resumo.whatsapp, mensagemExtrato(resumo, doFunc, dataIni, dataFim))
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
                        a pagar <b style={{ color:'var(--red)' }}>{fmtR(r.pendente)}</b>
                      </span>
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
                        </div>
                        <div className="rh-linha-sub">
                          {fmtData(l.data_prevista)}
                          {l.forma_pagamento ? ` • ${l.forma_pagamento}` : ''}
                          {l.status === 'PAGO' && l.data_pagamento && (
                            <span style={{ color:'var(--green)', marginLeft:6 }}>✓ pago {fmtData(l.data_pagamento)}</span>
                          )}
                        </div>
                      </div>
                      <span style={{ fontWeight:700, fontSize:14, flexShrink:0,
                        color: l.tipo === 'DESCONTO' ? 'var(--red)' : l.status === 'PAGO' ? 'var(--green)' : 'var(--yellow)' }}>
                        {l.tipo === 'DESCONTO' ? '-' : ''}{fmtR(l.valor)}
                      </span>
                      <span className={`rh-badge ${l.status === 'PAGO' ? 'ok' : 'pend'}`}>
                        {l.status === 'PAGO' ? 'Pago' : 'Pendente'}
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
                            className="btn-action-sm send" title="Marcar como pago">
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
            <Campo label="Data prevista">
              <input type="date" value={form.data_prevista}
                onChange={e => setForm(p => ({ ...p, data_prevista: e.target.value }))} style={S.inp} />
            </Campo>
            <Campo label="Status">
              <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} style={S.inp}>
                <option value="PENDENTE">Pendente</option>
                <option value="PAGO">Pago</option>
              </select>
            </Campo>
          </div>
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

      {modalComp && (
        <ModalComprovantes
          lancamento={modalComp}
          tenantId={tenantId}
          showToast={showToast}
          onFechar={() => setModalComp(null)}
          onAtualizar={carregar}
        />
      )}

      {confirmDel && (
        <ModalConfirma
          titulo="Excluir lançamento"
          texto={`Excluir ${LABEL_TIPO[confirmDel.tipo] || confirmDel.tipo} de ${fmtR(confirmDel.valor)}?`}
          onCancelar={() => setConfirmDel(null)}
          onConfirmar={confirmarExclusao}
        />
      )}
    </>
  )
}
