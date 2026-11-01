import { useState } from 'react'
import {
  fmtR, fmtData, valorParaInput, parseValor, mascaraValor,
  mascaraTelefone, mascaraCpf, abrirWhatsApp,
  salvarFuncionario, alternarAtivoFuncionario, excluirFuncionario,
  DIAS_SEMANA, diasTrabalhoSet,
} from '../../services/rhService'
import { S, Campo, Modal, ModalConfirma, IconEdit, IconTrash, IconUndo, IconWhats } from './RhUI'

const TIPOS_CONTRATO = ['CLT', 'PJ', 'Diarista', 'Freelancer', 'Estágio', 'Temporário']

const FORM_VAZIO = {
  nome: '', apelido: '', cpf: '', rg: '', whatsapp: '', email: '',
  cargo: '', setor: '', nome_live: '', comissao_percentual: '', data_admissao: '', data_demissao: '',
  salario: '', tipo_contrato: 'CLT', dia_pagamento: '',
  chave_pix: '', banco: '', endereco: '',
  dias_trabalho: '1,2,3,4,5', vt_valor_ida: '', vt_valor_volta: '',
  observacoes: '', ativo: true,
}

export default function AbaFuncionarios({ tenantId, showToast, funcionarios, recarregarFuncionarios, carregando }) {
  const [busca,      setBusca]      = useState('')
  const [filtroAtivo, setFiltroAtivo] = useState('ativos')
  const [modal,      setModal]      = useState(null)   // 'novo' | funcionario em edição
  const [form,       setForm]       = useState(FORM_VAZIO)
  const [salvando,   setSalvando]   = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)

  const lista = funcionarios.filter(f => {
    if (filtroAtivo === 'ativos'   && !f.ativo) return false
    if (filtroAtivo === 'inativos' &&  f.ativo) return false
    if (!busca.trim()) return true
    const termos = busca.toLowerCase().split(/[\s,]+/).filter(Boolean)
    const txt = [f.nome, f.apelido, f.cargo, f.setor, f.cpf, f.whatsapp, f.email, f.tipo_contrato]
      .join(' ').toLowerCase()
    return termos.every(t => txt.includes(t))
  })

  const totalSalarios = lista.filter(f => f.ativo).reduce((s, f) => s + (Number(f.salario) || 0), 0)

  function abrirNovo() {
    setForm(FORM_VAZIO)
    setModal('novo')
  }

  function abrirEditar(f) {
    setForm({
      nome: f.nome || '', apelido: f.apelido || '', cpf: f.cpf || '', rg: f.rg || '',
      whatsapp: mascaraTelefone(f.whatsapp || ''), email: f.email || '',
      cargo: f.cargo || '', setor: f.setor || '', nome_live: f.nome_live || '',
      comissao_percentual: f.comissao_percentual ?? '',
      data_admissao: f.data_admissao || '', data_demissao: f.data_demissao || '',
      salario: valorParaInput(f.salario), tipo_contrato: f.tipo_contrato || 'CLT',
      dia_pagamento: f.dia_pagamento ?? '',
      chave_pix: f.chave_pix || '', banco: f.banco || '', endereco: f.endereco || '',
      dias_trabalho: f.dias_trabalho || '1,2,3,4,5',
      vt_valor_ida: valorParaInput(f.vt_valor_ida), vt_valor_volta: valorParaInput(f.vt_valor_volta),
      observacoes: f.observacoes || '', ativo: f.ativo !== false,
    })
    setModal(f)
  }

  function toggleDia(n) {
    const atual = diasTrabalhoSet({ dias_trabalho: form.dias_trabalho })
    atual.has(n) ? atual.delete(n) : atual.add(n)
    setForm(p => ({ ...p, dias_trabalho: [...atual].sort().join(',') }))
  }

  async function salvar() {
    if (!form.nome.trim()) return showToast('Informe o nome do funcionário.', 'error')
    setSalvando(true)
    try {
      await salvarFuncionario(tenantId, {
        id:             modal === 'novo' ? undefined : modal.id,
        nome:           form.nome.trim(),
        apelido:        form.apelido.trim() || null,
        cpf:            form.cpf.replace(/\D/g, '') || null,
        rg:             form.rg.trim() || null,
        whatsapp:       form.whatsapp.replace(/\D/g, '') || null,
        email:          form.email.trim() || null,
        cargo:          form.cargo.trim() || null,
        setor:          form.setor.trim() || null,
        nome_live:      form.nome_live.trim() || null,
        comissao_percentual: form.comissao_percentual === '' ? 0 : Number(form.comissao_percentual) || 0,
        data_admissao:  form.data_admissao || null,
        data_demissao:  form.data_demissao || null,
        salario:        parseValor(form.salario),
        tipo_contrato:  form.tipo_contrato,
        dia_pagamento:  form.dia_pagamento === '' ? null : parseInt(form.dia_pagamento, 10),
        chave_pix:      form.chave_pix.trim() || null,
        banco:          form.banco.trim() || null,
        endereco:       form.endereco.trim() || null,
        dias_trabalho:  form.dias_trabalho || '1,2,3,4,5',
        vt_valor_ida:   parseValor(form.vt_valor_ida),
        vt_valor_volta: parseValor(form.vt_valor_volta),
        observacoes:    form.observacoes.trim() || null,
        ativo:          form.ativo,
      })
      showToast(modal === 'novo' ? 'Funcionário cadastrado!' : 'Funcionário atualizado!', 'success')
      setModal(null)
      recarregarFuncionarios()
    } catch (e) {
      showToast('Erro ao salvar: ' + e.message, 'error')
    }
    setSalvando(false)
  }

  async function alternarAtivo(f) {
    try {
      await alternarAtivoFuncionario(f.id, !f.ativo)
      showToast(f.ativo ? 'Funcionário inativado.' : 'Funcionário reativado!', 'success')
      recarregarFuncionarios()
    } catch (e) { showToast('Erro: ' + e.message, 'error') }
  }

  async function confirmarExclusao() {
    try {
      await excluirFuncionario(confirmDel.id)
      showToast('Funcionário excluído.', 'success')
      recarregarFuncionarios()
    } catch (e) { showToast('Erro ao excluir: ' + e.message, 'error') }
    setConfirmDel(null)
  }

  function whats(f) {
    if (!abrirWhatsApp(f.whatsapp)) showToast('Funcionário sem WhatsApp cadastrado.', 'error')
  }

  return (
    <>
      <div className="rh-filtros">
        <div className="rh-f rh-f-busca">
          <label>Buscar</label>
          <input value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Nome, cargo, setor, CPF…" style={S.inpS} />
        </div>
        <div className="rh-f" style={{ minWidth:130 }}>
          <label>Situação</label>
          <select value={filtroAtivo} onChange={e => setFiltroAtivo(e.target.value)} style={S.inpS}>
            <option value="ativos">Ativos</option>
            <option value="inativos">Inativos</option>
            <option value="todos">Todos</option>
          </select>
        </div>
        <div className="rh-acoes">
          <button onClick={abrirNovo} style={{ ...S.ok, padding:'5px 14px' }}>+ Novo funcionário</button>
        </div>
      </div>

      <div className="rh-resumo">
        <div className="rh-card">
          <div className="rh-card-label">Funcionários listados</div>
          <div className="rh-card-valor" style={{ color:'var(--blue)' }}>{lista.length}</div>
        </div>
        <div className="rh-card">
          <div className="rh-card-label">Folha (ativos listados)</div>
          <div className="rh-card-valor" style={{ color:'var(--green)' }}>{fmtR(totalSalarios)}</div>
        </div>
      </div>

      <div className="rh-conteudo">
        {carregando ? (
          <p style={{ color:'var(--muted)' }}>Carregando…</p>
        ) : lista.length === 0 ? (
          <p className="rh-vazio">Nenhum funcionário encontrado.</p>
        ) : (
          <div>
            {lista.map(f => (
              <div key={f.id} className="rh-linha">
                <div className="rh-linha-info">
                  <div className="rh-linha-nome">
                    {f.nome}{f.apelido ? ` (${f.apelido})` : ''}
                  </div>
                  <div className="rh-linha-sub">
                    {[f.cargo, f.setor, f.tipo_contrato].filter(Boolean).join(' • ')}
                    {f.data_admissao && ` • desde ${fmtData(f.data_admissao)}`}
                    {Number(f.salario) > 0 && ` • ${fmtR(f.salario)}`}
                  </div>
                </div>
                {!f.ativo && <span className="rh-badge off">Inativo</span>}
                <div className="rh-row-acoes">
                  <button onClick={() => whats(f)} className="btn-action-sm wpp" title="Abrir WhatsApp">
                    <IconWhats />
                  </button>
                  <button onClick={() => abrirEditar(f)} className="btn-action-sm copy" title="Editar">
                    <IconEdit />
                  </button>
                  <button onClick={() => alternarAtivo(f)}
                    className={`btn-action-sm ${f.ativo ? 'fila' : 'send'}`}
                    title={f.ativo ? 'Inativar' : 'Reativar'}>
                    <IconUndo />
                  </button>
                  <button onClick={() => setConfirmDel(f)} className="btn-action-sm del" title="Excluir">
                    <IconTrash />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && (
        <Modal
          titulo={modal === 'novo' ? 'Novo Funcionário' : 'Editar Funcionário'}
          onFechar={() => setModal(null)}
          largura={620}
          footer={
            <>
              <button className="btn-cancel" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn-confirm" onClick={salvar} disabled={salvando}>
                {salvando ? 'Salvando…' : 'Salvar'}
              </button>
            </>
          }
        >
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Campo label="Nome *" span={2}>
              <input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))}
                style={S.inp} placeholder="Nome completo" />
            </Campo>
            <Campo label="Apelido">
              <input value={form.apelido} onChange={e => setForm(p => ({ ...p, apelido: e.target.value }))}
                style={S.inp} placeholder="Como é chamado" />
            </Campo>
            <Campo label="WhatsApp">
              <input value={form.whatsapp} onChange={e => setForm(p => ({ ...p, whatsapp: mascaraTelefone(e.target.value) }))}
                style={S.inp} placeholder="(00) 00000-0000" inputMode="numeric" />
            </Campo>
            <Campo label="CPF">
              <input value={form.cpf} onChange={e => setForm(p => ({ ...p, cpf: mascaraCpf(e.target.value) }))}
                style={S.inp} placeholder="000.000.000-00" inputMode="numeric" />
            </Campo>
            <Campo label="RG">
              <input value={form.rg} onChange={e => setForm(p => ({ ...p, rg: e.target.value }))} style={S.inp} />
            </Campo>
            <Campo label="E-mail" span={2}>
              <input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                style={S.inp} type="email" />
            </Campo>
            <Campo label="Cargo">
              <input value={form.cargo} onChange={e => setForm(p => ({ ...p, cargo: e.target.value }))}
                style={S.inp} placeholder="Ex: Costureira" />
            </Campo>
            <Campo label="Setor">
              <input value={form.setor} onChange={e => setForm(p => ({ ...p, setor: e.target.value }))}
                style={S.inp} placeholder="Ex: Produção" />
            </Campo>
            <Campo label="Nome nas lives">
              <input value={form.nome_live} onChange={e => setForm(p => ({ ...p, nome_live: e.target.value }))}
                style={S.inp} placeholder="Como aparece no relatório de comissões" />
            </Campo>
            <Campo label="% de comissão">
              <input type="number" min="0" max="100" step="0.5" value={form.comissao_percentual}
                onChange={e => setForm(p => ({ ...p, comissao_percentual: e.target.value }))}
                style={S.inp} placeholder="Ex: 3" />
            </Campo>
            <Campo label="Tipo de contrato">
              <select value={form.tipo_contrato} onChange={e => setForm(p => ({ ...p, tipo_contrato: e.target.value }))} style={S.inp}>
                {TIPOS_CONTRATO.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Campo>
            <Campo label="Salário">
              <input value={form.salario} onChange={e => setForm(p => ({ ...p, salario: mascaraValor(e.target.value) }))}
                style={S.inp} placeholder="0,00" inputMode="numeric" />
            </Campo>
            <Campo label="Admissão">
              <input type="date" value={form.data_admissao}
                onChange={e => setForm(p => ({ ...p, data_admissao: e.target.value }))} style={S.inp} />
            </Campo>
            <Campo label="Demissão">
              <input type="date" value={form.data_demissao}
                onChange={e => setForm(p => ({ ...p, data_demissao: e.target.value }))} style={S.inp} />
            </Campo>
            <Campo label="Dia do pagamento">
              <input type="number" min="1" max="31" value={form.dia_pagamento}
                onChange={e => setForm(p => ({ ...p, dia_pagamento: e.target.value }))}
                style={S.inp} placeholder="Ex: 5" />
            </Campo>
            <Campo label="Banco">
              <input value={form.banco} onChange={e => setForm(p => ({ ...p, banco: e.target.value }))} style={S.inp} />
            </Campo>
            <Campo label="Chave PIX" span={2}>
              <input value={form.chave_pix} onChange={e => setForm(p => ({ ...p, chave_pix: e.target.value }))} style={S.inp} />
            </Campo>
            <Campo label="Endereço" span={2}>
              <input value={form.endereco} onChange={e => setForm(p => ({ ...p, endereco: e.target.value }))} style={S.inp} />
            </Campo>

            <Campo label="Dias de trabalho na semana" span={2}>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {DIAS_SEMANA.map((d, i) => {
                  const marcado = diasTrabalhoSet({ dias_trabalho: form.dias_trabalho }).has(i)
                  return (
                    <button key={d} type="button" onClick={() => toggleDia(i)}
                      style={{
                        background: marcado ? 'var(--blue)' : 'var(--input-bg)',
                        color: marcado ? '#0f0f0f' : 'var(--muted)',
                        border: '1px solid var(--input-border)', borderRadius:6,
                        padding:'7px 10px', fontSize:12, fontWeight:700, cursor:'pointer',
                      }}>
                      {d}
                    </button>
                  )
                })}
              </div>
            </Campo>

            <Campo label="Vale transporte — ida">
              <input value={form.vt_valor_ida}
                onChange={e => setForm(p => ({ ...p, vt_valor_ida: mascaraValor(e.target.value) }))}
                style={S.inp} placeholder="0,00" inputMode="numeric" />
            </Campo>
            <Campo label="Vale transporte — volta">
              <input value={form.vt_valor_volta}
                onChange={e => setForm(p => ({ ...p, vt_valor_volta: mascaraValor(e.target.value) }))}
                style={S.inp} placeholder="0,00" inputMode="numeric" />
            </Campo>

            <Campo label="Observações" span={2}>
              <textarea value={form.observacoes}
                onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))}
                style={{ ...S.inp, minHeight:70, resize:'vertical' }} />
            </Campo>

            <label style={{ gridColumn:'span 2', display:'flex', alignItems:'center', gap:8, fontSize:13, fontWeight:700, color:'var(--text-body)', cursor:'pointer' }}>
              <input type="checkbox" checked={form.ativo}
                onChange={e => setForm(p => ({ ...p, ativo: e.target.checked }))}
                style={{ width:14, height:14 }} />
              Funcionário ativo
            </label>
          </div>
        </Modal>
      )}

      {confirmDel && (
        <ModalConfirma
          titulo="Excluir funcionário"
          texto={`Excluir ${confirmDel.nome}? Os vales, faltas e períodos de vale transporte dele também serão apagados.`}
          onCancelar={() => setConfirmDel(null)}
          onConfirmar={confirmarExclusao}
        />
      )}
    </>
  )
}
