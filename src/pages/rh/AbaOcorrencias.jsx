import { useState, useEffect, useCallback } from 'react'
import {
  fmtR, fmtData, isoLocal, primeiroDiaMes, ultimoDiaMes, diaSemana,
  mascaraValor, parseValor, valorParaInput,
  getOcorrencias, salvarOcorrencia, excluirOcorrencia,
  getFeriados, salvarFeriado, excluirFeriado,
  TIPOS_OCORRENCIA, LABEL_OCORRENCIA,
} from '../../services/rhService'
import { S, Campo, Modal, ModalConfirma, IconEdit, IconTrash } from './RhUI'

const HOJE = isoLocal(new Date())

const FORM_VAZIO = {
  funcionario_id: '', data: HOJE, tipo: 'FALTA', minutos: '',
  justificada: false, descontar: true, valor_desconto: '', observacao: '',
}

const COR_TIPO = {
  FALTA:            'var(--red)',
  ATRASO:           'var(--yellow)',
  SAIDA_ANTECIPADA: 'var(--yellow)',
  ATESTADO:         'var(--blue)',
  FOLGA:            'var(--muted)',
}

export default function AbaOcorrencias({ tenantId, showToast, funcionarios }) {
  const [sub,        setSub]        = useState('ocorrencias')
  const [ocs,        setOcs]        = useState([])
  const [feriados,   setFeriados]   = useState([])
  const [carregando, setCarregando] = useState(false)

  const [dataIni,    setDataIni]    = useState(primeiroDiaMes)
  const [dataFim,    setDataFim]    = useState(ultimoDiaMes)
  const [busca,      setBusca]      = useState('')
  const [filtroFunc, setFiltroFunc] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')

  const [modal,      setModal]      = useState(null)   // 'novo' | ocorrência
  const [form,       setForm]       = useState(FORM_VAZIO)
  const [salvando,   setSalvando]   = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)

  // Feriados
  const [novoFeriado, setNovoFeriado] = useState({ data: HOJE, descricao: '' })
  const [delFeriado,  setDelFeriado]  = useState(null)

  const carregar = useCallback(async () => {
    if (!tenantId) return
    setCarregando(true)
    try {
      const [oc, fe] = await Promise.all([
        getOcorrencias(tenantId, {
          dataInicio: dataIni, dataFim,
          funcionarioId: filtroFunc || undefined,
          tipo: filtroTipo || undefined,
        }),
        getFeriados(tenantId, { dataInicio: dataIni, dataFim }),
      ])
      setOcs(oc.data)
      setFeriados(fe.data)
    } catch (e) { showToast('Erro ao carregar: ' + e.message, 'error') }
    setCarregando(false)
  }, [tenantId, dataIni, dataFim, filtroFunc, filtroTipo, showToast])

  useEffect(() => { carregar() }, [carregar])

  const filtrados = ocs.filter(o => {
    if (!busca.trim()) return true
    const termos = busca.toLowerCase().split(/[\s,]+/).filter(Boolean)
    const f = o.funcionarios || {}
    const txt = [f.nome, f.apelido, LABEL_OCORRENCIA[o.tipo], o.observacao].join(' ').toLowerCase()
    return termos.every(t => txt.includes(t))
  })

  const totFaltas   = filtrados.filter(o => o.tipo === 'FALTA').length
  const totAtrasos  = filtrados.filter(o => o.tipo === 'ATRASO' || o.tipo === 'SAIDA_ANTECIPADA')
  const minAtrasos  = totAtrasos.reduce((s, o) => s + (Number(o.minutos) || 0), 0)
  const totDesconto = filtrados.reduce((s, o) => s + (Number(o.valor_desconto) || 0), 0)

  function abrirNovo() {
    setForm({ ...FORM_VAZIO, funcionario_id: filtroFunc || '' })
    setModal('novo')
  }

  function abrirEditar(o) {
    setForm({
      funcionario_id: o.funcionario_id,
      data:           o.data,
      tipo:           o.tipo,
      minutos:        o.minutos ?? '',
      justificada:    !!o.justificada,
      descontar:      o.descontar !== false,
      valor_desconto: valorParaInput(o.valor_desconto),
      observacao:     o.observacao || '',
    })
    setModal(o)
  }

  async function salvar() {
    if (!form.funcionario_id) return showToast('Escolha o funcionário.', 'error')
    if (!form.data)           return showToast('Informe a data.', 'error')
    setSalvando(true)
    try {
      await salvarOcorrencia(tenantId, {
        id:             modal === 'novo' ? undefined : modal.id,
        funcionario_id: form.funcionario_id,
        data:           form.data,
        tipo:           form.tipo,
        minutos:        form.minutos === '' ? 0 : parseInt(form.minutos, 10) || 0,
        justificada:    form.justificada,
        descontar:      form.descontar,
        valor_desconto: parseValor(form.valor_desconto),
        observacao:     form.observacao.trim() || null,
      })
      showToast(modal === 'novo' ? 'Ocorrência registrada!' : 'Ocorrência atualizada!', 'success')
      setModal(null)
      carregar()
    } catch (e) { showToast('Erro: ' + e.message, 'error') }
    setSalvando(false)
  }

  async function confirmarExclusao() {
    try {
      await excluirOcorrencia(confirmDel.id)
      showToast('Ocorrência excluída.', 'success')
      carregar()
    } catch (e) { showToast('Erro: ' + e.message, 'error') }
    setConfirmDel(null)
  }

  async function adicionarFeriado() {
    if (!novoFeriado.data) return showToast('Informe a data do feriado.', 'error')
    try {
      await salvarFeriado(tenantId, {
        data: novoFeriado.data,
        descricao: novoFeriado.descricao.trim() || null,
      })
      showToast('Feriado cadastrado!', 'success')
      setNovoFeriado({ data: HOJE, descricao: '' })
      carregar()
    } catch (e) {
      // índice único (tenant_id, data)
      const msg = e.code === '23505' ? 'Esse feriado já está cadastrado.' : 'Erro: ' + e.message
      showToast(msg, 'error')
    }
  }

  async function confirmarExclusaoFeriado() {
    try {
      await excluirFeriado(delFeriado.id)
      showToast('Feriado excluído.', 'success')
      carregar()
    } catch (e) { showToast('Erro: ' + e.message, 'error') }
    setDelFeriado(null)
  }

  const ehAtraso = form.tipo === 'ATRASO' || form.tipo === 'SAIDA_ANTECIPADA'

  return (
    <>
      <div className="rh-filtros">
        <div className="rh-f rh-f-busca">
          <label>Buscar</label>
          <input value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Funcionário, tipo, observação…" style={S.inpS} />
        </div>
        <div className="rh-f" style={{ minWidth:150 }}>
          <label>Funcionário</label>
          <select value={filtroFunc} onChange={e => setFiltroFunc(e.target.value)} style={S.inpS}>
            <option value="">Todos</option>
            {funcionarios.map(f => <option key={f.id} value={f.id}>{f.apelido || f.nome}</option>)}
          </select>
        </div>
        <div className="rh-f" style={{ minWidth:130 }}>
          <label>Tipo</label>
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={S.inpS}>
            <option value="">Todos</option>
            {TIPOS_OCORRENCIA.map(t => <option key={t} value={t}>{LABEL_OCORRENCIA[t]}</option>)}
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
          <button onClick={abrirNovo} style={{ ...S.ok, padding:'5px 14px' }}>+ Nova ocorrência</button>
          <div className="rh-abas">
            {[['ocorrencias','Ocorrências'],['feriados','Feriados']].map(([id, label]) => (
              <button key={id} className={`rh-aba${sub === id ? ' ativa' : ''}`} onClick={() => setSub(id)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rh-resumo">
        <div className="rh-card">
          <div className="rh-card-label">Faltas</div>
          <div className="rh-card-valor" style={{ color:'var(--red)' }}>{totFaltas}</div>
        </div>
        <div className="rh-card">
          <div className="rh-card-label">Atrasos / saídas</div>
          <div className="rh-card-valor" style={{ color:'var(--yellow)' }}>
            {totAtrasos.length} <small style={{ fontSize:12, fontWeight:600, color:'var(--muted)' }}>({minAtrasos} min)</small>
          </div>
        </div>
        <div className="rh-card">
          <div className="rh-card-label">Descontos lançados</div>
          <div className="rh-card-valor" style={{ color:'var(--red)' }}>{fmtR(totDesconto)}</div>
        </div>
        <div className="rh-card">
          <div className="rh-card-label">Feriados no período</div>
          <div className="rh-card-valor" style={{ color:'var(--blue)' }}>{feriados.length}</div>
        </div>
      </div>

      <div className="rh-conteudo">
        {sub === 'ocorrencias' ? (
          carregando ? (
            <p style={{ color:'var(--muted)' }}>Carregando…</p>
          ) : filtrados.length === 0 ? (
            <p className="rh-vazio">Nenhuma ocorrência no período.</p>
          ) : (
            <div>
              {filtrados.map(o => {
                const f = o.funcionarios || {}
                return (
                  <div key={o.id} className="rh-linha">
                    <div className="rh-linha-info">
                      <div className="rh-linha-nome">
                        {f.apelido || f.nome || 'Funcionário'}
                        <span style={{ color: COR_TIPO[o.tipo] || 'var(--muted)', marginLeft:8, fontWeight:700, fontSize:13 }}>
                          {LABEL_OCORRENCIA[o.tipo] || o.tipo}
                          {Number(o.minutos) > 0 ? ` ${o.minutos} min` : ''}
                        </span>
                      </div>
                      <div className="rh-linha-sub">
                        {fmtData(o.data)} ({diaSemana(o.data)})
                        {o.observacao ? ` • ${o.observacao}` : ''}
                        {Number(o.valor_desconto) > 0 && (
                          <span style={{ color:'var(--red)', marginLeft:6 }}>desconto {fmtR(o.valor_desconto)}</span>
                        )}
                      </div>
                    </div>
                    {o.justificada && <span className="rh-badge ok">Justificada</span>}
                    {!o.descontar && <span className="rh-badge off">Sem desconto</span>}
                    <div className="rh-row-acoes">
                      <button onClick={() => abrirEditar(o)} className="btn-action-sm copy" title="Editar">
                        <IconEdit />
                      </button>
                      <button onClick={() => setConfirmDel(o)} className="btn-action-sm del" title="Excluir">
                        <IconTrash />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        ) : (
          <>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'flex-end', marginBottom:14 }}>
              <Campo label="Data do feriado">
                <input type="date" value={novoFeriado.data}
                  onChange={e => setNovoFeriado(p => ({ ...p, data: e.target.value }))} style={S.inpS} />
              </Campo>
              <Campo label="Descrição">
                <input value={novoFeriado.descricao}
                  onChange={e => setNovoFeriado(p => ({ ...p, descricao: e.target.value }))}
                  placeholder="Ex: Proclamação da República" style={{ ...S.inpS, minWidth:220 }} />
              </Campo>
              <button onClick={adicionarFeriado} style={{ ...S.ok, padding:'7px 14px' }}>Adicionar</button>
            </div>

            {feriados.length === 0 ? (
              <p className="rh-vazio">Nenhum feriado cadastrado no período filtrado.</p>
            ) : (
              <div>
                {feriados.map(f => (
                  <div key={f.id} className="rh-linha">
                    <div className="rh-linha-info">
                      <div className="rh-linha-nome">{f.descricao || 'Feriado'}</div>
                      <div className="rh-linha-sub">{fmtData(f.data)} ({diaSemana(f.data)})</div>
                    </div>
                    <div className="rh-row-acoes">
                      <button onClick={() => setDelFeriado(f)} className="btn-action-sm del" title="Excluir">
                        <IconTrash />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p style={{ color:'var(--muted)', fontSize:12, marginTop:14 }}>
              Os feriados cadastrados aqui são descontados automaticamente ao gerar o período de vale transporte.
            </p>
          </>
        )}
      </div>

      {modal && (
        <Modal
          titulo={modal === 'novo' ? 'Nova Ocorrência' : 'Editar Ocorrência'}
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
            <select value={form.funcionario_id}
              onChange={e => setForm(p => ({ ...p, funcionario_id: e.target.value }))} style={S.inp}>
              <option value="">Selecione…</option>
              {funcionarios.map(f => <option key={f.id} value={f.id}>{f.apelido || f.nome}</option>)}
            </select>
          </Campo>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Campo label="Data *">
              <input type="date" value={form.data}
                onChange={e => setForm(p => ({ ...p, data: e.target.value }))} style={S.inp} />
            </Campo>
            <Campo label="Tipo">
              <select value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))} style={S.inp}>
                {TIPOS_OCORRENCIA.map(t => <option key={t} value={t}>{LABEL_OCORRENCIA[t]}</option>)}
              </select>
            </Campo>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            {ehAtraso && (
              <Campo label="Minutos">
                <input type="number" min="0" value={form.minutos}
                  onChange={e => setForm(p => ({ ...p, minutos: e.target.value }))}
                  style={S.inp} placeholder="Ex: 30" />
              </Campo>
            )}
            <Campo label="Valor do desconto">
              <input value={form.valor_desconto}
                onChange={e => setForm(p => ({ ...p, valor_desconto: mascaraValor(e.target.value) }))}
                style={S.inp} placeholder="0,00" inputMode="numeric" />
            </Campo>
          </div>
          <Campo label="Observação">
            <textarea value={form.observacao}
              onChange={e => setForm(p => ({ ...p, observacao: e.target.value }))}
              style={{ ...S.inp, minHeight:60, resize:'vertical' }} />
          </Campo>
          <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, fontWeight:700, color:'var(--text-body)', cursor:'pointer' }}>
            <input type="checkbox" checked={form.justificada}
              onChange={e => setForm(p => ({ ...p, justificada: e.target.checked }))}
              style={{ width:14, height:14 }} />
            Ocorrência justificada
          </label>
          <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, fontWeight:700, color:'var(--text-body)', cursor:'pointer' }}>
            <input type="checkbox" checked={form.descontar}
              onChange={e => setForm(p => ({ ...p, descontar: e.target.checked }))}
              style={{ width:14, height:14 }} />
            Descontar do vale transporte
          </label>
        </Modal>
      )}

      {confirmDel && (
        <ModalConfirma
          titulo="Excluir ocorrência"
          texto={`Excluir ${LABEL_OCORRENCIA[confirmDel.tipo] || confirmDel.tipo} de ${fmtData(confirmDel.data)}?`}
          onCancelar={() => setConfirmDel(null)}
          onConfirmar={confirmarExclusao}
        />
      )}

      {delFeriado && (
        <ModalConfirma
          titulo="Excluir feriado"
          texto={`Excluir o feriado de ${fmtData(delFeriado.data)}?`}
          onCancelar={() => setDelFeriado(null)}
          onConfirmar={confirmarExclusaoFeriado}
        />
      )}
    </>
  )
}
