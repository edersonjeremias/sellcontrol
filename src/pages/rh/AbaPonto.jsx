import { useState, useEffect, useCallback, useRef } from 'react'
import {
  isoLocal, fmtData, diaSemana, formatarCompetencia, abrirWhatsApp, getFeriados,
} from '../../services/rhService'
import {
  getMarcacoes, getAjustes, getFechamentos, salvarFechamento,
  registrarAjuste, assinarUrlsPonto, montarEspelho, expurgarFotosAntigas,
  hashArquivo, enviarEspelhoAssinado, definirPinPonto, pegarLocalizacao,
  TIPOS_BATIDA, LABEL_BATIDA, horaDe, fmtHoras, tabelaFaltaPonto,
} from '../../services/pontoService'
import { saveConfig } from '../../services/configService'
import { gerarEspelhoPdf } from './espelhoPontoPdf'
import { S, Campo, Modal, IconCheck, IconEdit, IconRecibo, IconWhats } from './RhUI'

const HOJE = isoLocal(new Date())

function mesAtual() {
  return HOJE.slice(0, 7)
}

function primeiroDiaDe(comp) {
  return `${comp}-01`
}

function ultimoDiaDe(comp) {
  const [ano, mes] = comp.split('-').map(Number)
  return isoLocal(new Date(ano, mes, 0))
}

export default function AbaPonto({ tenantId, showToast, funcionarios, empresa, profile }) {
  const [competencia, setCompetencia] = useState(mesAtual)
  const [filtroFunc,  setFiltroFunc]  = useState('')
  const [marcacoes,   setMarcacoes]   = useState([])
  const [ajustes,     setAjustes]     = useState([])
  const [feriados,    setFeriados]    = useState([])
  const [fechamentos, setFechamentos] = useState([])
  const [carregando,  setCarregando]  = useState(false)
  const [semEstrutura, setSemEstrutura] = useState(false)

  const [urls,       setUrls]       = useState({})
  const [modalDia,   setModalDia]   = useState(null)   // { funcionario, dia }
  const [modalAjuste, setModalAjuste] = useState(null) // { funcionario, dia, tipo, atual }
  const [formAjuste, setFormAjuste] = useState({ hora: '', motivo: '' })
  const [modalPin,   setModalPin]   = useState(null)   // funcionário
  const [modalCerca, setModalCerca] = useState(false)
  const [cerca,      setCerca]      = useState({})
  const [formCerca,  setFormCerca]  = useState({ latitude:'', longitude:'', raio:150, exigir:true })
  const [buscandoLocal, setBuscandoLocal] = useState(false)
  const [pin,        setPin]        = useState('')
  const [salvando,   setSalvando]   = useState(false)
  const [expandido,  setExpandido]  = useState(null)   // id do funcionário aberto
  const inputAssinado = useRef(null)
  const [enviandoAssinado, setEnviandoAssinado] = useState(null) // funcionario_id

  const dataIni = primeiroDiaDe(competencia)
  const dataFim = ultimoDiaDe(competencia)

  const carregar = useCallback(async () => {
    if (!tenantId) return
    setCarregando(true)
    try {
      const [ms, ajs, fes, fechs] = await Promise.all([
        getMarcacoes(tenantId, { dataInicio: dataIni, dataFim, funcionarioId: filtroFunc || undefined }),
        getAjustes(tenantId,   { dataInicio: dataIni, dataFim, funcionarioId: filtroFunc || undefined }),
        getFeriados(tenantId,  { dataInicio: dataIni, dataFim }),
        getFechamentos(tenantId, { competencia: dataIni }),
      ])
      setMarcacoes(ms.data)
      setAjustes(ajs.data)
      setFeriados(fes.data)
      setFechamentos(fechs.data)
      setSemEstrutura(ms.semEstrutura || ajs.semEstrutura)
    } catch (e) {
      if (tabelaFaltaPonto(e)) setSemEstrutura(true)
      else showToast('Erro ao carregar o ponto: ' + e.message, 'error')
    }
    setCarregando(false)
  }, [tenantId, dataIni, dataFim, filtroFunc, showToast])

  useEffect(() => { carregar() }, [carregar])

  // A cerca vem junto das configurações da empresa
  useEffect(() => { if (empresa) setCerca(empresa) }, [empresa])

  // Selfies com mais de 6 meses somem; a batida permanece
  useEffect(() => {
    if (semEstrutura) return
    expurgarFotosAntigas().catch(() => {})
  }, [semEstrutura])

  // Quem não bate ponto fica de fora, mas continua aparecendo se já tiver
  // marcação no período — histórico não some ao desmarcar a opção.
  const bateOuTemHistorico = (f) =>
    f.bate_ponto !== false || marcacoes.some(m => m.funcionario_id === f.id)

  const daLista = funcionarios.filter(f =>
    (filtroFunc ? f.id === filtroFunc : true) &&
    bateOuTemHistorico(f) &&
    (f.ativo || marcacoes.some(m => m.funcionario_id === f.id))
  )

  function espelhoDe(func) {
    return montarEspelho({
      funcionario: func,
      dataInicio:  dataIni,
      dataFim,
      marcacoes:   marcacoes.filter(m => m.funcionario_id === func.id),
      ajustes:     ajustes.filter(a => a.funcionario_id === func.id),
      feriados,
    })
  }

  function fechamentoDe(funcId) {
    return fechamentos.find(f => f.funcionario_id === funcId)
  }

  // ── Detalhe do dia (com as fotos) ───────────────────────────
  async function abrirDia(func, dia) {
    setModalDia({ funcionario: func, dia })
    const caminhos = marcacoes
      .filter(m => m.funcionario_id === func.id && String(m.dia).slice(0, 10) === dia.dia && m.foto_path)
      .map(m => m.foto_path)
    if (!caminhos.length) return
    try {
      const mapa = await assinarUrlsPonto(caminhos)
      setUrls(prev => ({ ...prev, ...mapa }))
    } catch (e) { showToast(e.message, 'error') }
  }

  // ── Ajuste de batida ────────────────────────────────────────
  function abrirAjuste(func, dia, tipo) {
    const atual = dia.horarios[tipo]
    setModalAjuste({ funcionario: func, dia, tipo, atual })
    setFormAjuste({ hora: atual ? horaDe(atual) : '', motivo: '' })
  }

  async function salvarAjuste() {
    const { funcionario, dia, tipo, atual } = modalAjuste
    if (!formAjuste.motivo.trim()) return showToast('Descreva o motivo do ajuste.', 'error')
    if (formAjuste.hora && !/^\d{2}:\d{2}$/.test(formAjuste.hora)) {
      return showToast('Informe a hora como HH:MM.', 'error')
    }
    setSalvando(true)
    try {
      // Hora vazia = desconsiderar a batida
      const novo = formAjuste.hora
        ? new Date(`${dia.dia}T${formAjuste.hora}:00`).toISOString()
        : null
      await registrarAjuste(tenantId, {
        funcionario_id: funcionario.id,
        marcacao_id:    dia.marcacoes[tipo]?.id || null,
        dia:            dia.dia,
        tipo,
        valor_anterior: atual || null,
        valor_novo:     novo,
        motivo:         formAjuste.motivo.trim(),
        autor:          profile?.id || null,
        autor_nome:     profile?.nome || null,
      })
      showToast('Ajuste registrado. A marcação original foi mantida.', 'success')
      setModalAjuste(null)
      setModalDia(null)
      carregar()
    } catch (e) { showToast('Erro: ' + e.message, 'error') }
    setSalvando(false)
  }

  // ── Cerca de localização ────────────────────────────────────
  function abrirCerca() {
    setModalCerca(true)
    setFormCerca({
      latitude:  cerca.ponto_latitude  ?? '',
      longitude: cerca.ponto_longitude ?? '',
      raio:      cerca.ponto_raio_metros ?? 150,
      exigir:    cerca.ponto_exigir_local !== false,
    })
  }

  async function usarLocalAtual() {
    setBuscandoLocal(true)
    const pos = await pegarLocalizacao()
    setBuscandoLocal(false)
    if (!pos) {
      return showToast('Não consegui a localização. Libere o acesso no navegador e tente de novo.', 'error')
    }
    setFormCerca(p => ({ ...p, latitude: pos.latitude.toFixed(7), longitude: pos.longitude.toFixed(7) }))
    showToast(`Posição capturada com precisão de ${pos.precisao} m.`, 'success')
  }

  async function salvarCerca() {
    const lat = formCerca.latitude === '' ? null : Number(formCerca.latitude)
    const lng = formCerca.longitude === '' ? null : Number(formCerca.longitude)
    if ((lat === null) !== (lng === null)) {
      return showToast('Informe latitude e longitude, ou deixe as duas em branco.', 'error')
    }
    if (lat !== null && (Math.abs(lat) > 90 || Math.abs(lng) > 180)) {
      return showToast('Coordenada inválida.', 'error')
    }
    setSalvando(true)
    try {
      const campos = {
        ponto_latitude:     lat,
        ponto_longitude:    lng,
        ponto_raio_metros:  Number(formCerca.raio) || 150,
        ponto_exigir_local: !!formCerca.exigir,
      }
      await saveConfig(tenantId, campos)
      setCerca(c => ({ ...c, ...campos }))
      showToast(lat === null ? 'Cerca desligada.' : 'Local da loja salvo!', 'success')
      setModalCerca(false)
    } catch (e) { showToast('Erro: ' + e.message, 'error') }
    setSalvando(false)
  }

  // ── PIN ─────────────────────────────────────────────────────
  async function salvarPin() {
    if (!/^\d{4}$/.test(pin)) return showToast('O PIN deve ter 4 dígitos.', 'error')
    setSalvando(true)
    try {
      await definirPinPonto(modalPin.id, pin)
      showToast(`PIN de ${modalPin.apelido || modalPin.nome} definido!`, 'success')
      setModalPin(null)
      setPin('')
    } catch (e) { showToast('Erro: ' + e.message, 'error') }
    setSalvando(false)
  }

  // ── Espelho em PDF + hash ───────────────────────────────────
  async function gerarEspelho(func, enviarWhats = false) {
    const espelho = espelhoDe(func)
    try {
      const { arrayBuffer, blob, nomeArquivo } = gerarEspelhoPdf({
        empresa: empresa || {},
        funcionario: func,
        competencia: dataIni,
        espelho,
      })
      const hash = await hashArquivo(arrayBuffer)

      await salvarFechamento(tenantId, {
        funcionario_id:  func.id,
        competencia:     dataIni,
        horas_previstas: espelho.totais.previstas,
        horas_apuradas:  espelho.totais.trabalhadas,
        saldo_horas:     espelho.totais.saldo,
        faltas:          espelho.totais.faltas,
        pdf_hash:        hash,
        gerado_em:       new Date().toISOString(),
        enviado_em:      enviarWhats ? new Date().toISOString() : null,
      })

      // Baixa o arquivo para você anexar no WhatsApp
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = nomeArquivo
      a.click()
      URL.revokeObjectURL(url)

      if (enviarWhats) {
        const msg = `Olá, ${String(func.apelido || func.nome).split(' ')[0]}!\n\n` +
          `Segue o espelho de ponto de ${formatarCompetencia(dataIni)} para conferência e assinatura.\n\n` +
          `Horas trabalhadas: ${fmtHoras(espelho.totais.trabalhadas)}\n` +
          `Saldo do mês: ${fmtHoras(espelho.totais.saldo)}\n` +
          (espelho.totais.faltas ? `Faltas: ${espelho.totais.faltas}\n` : '') +
          `\nConfere e me devolve assinado, por favor. Qualquer divergência, me avise.`
        if (!abrirWhatsApp(func.whatsapp, msg)) {
          showToast('Funcionário sem WhatsApp. O PDF foi baixado mesmo assim.', 'error')
        }
      }
      showToast('Espelho gerado e registrado.', 'success')
      carregar()
    } catch (e) { showToast('Erro ao gerar o espelho: ' + e.message, 'error') }
  }

  async function receberAssinado(func, file) {
    if (!file) return
    setEnviandoAssinado(func.id)
    try {
      const caminho = await enviarEspelhoAssinado(file, tenantId, func.id, competencia)
      await salvarFechamento(tenantId, {
        funcionario_id: func.id,
        competencia:    dataIni,
        assinado_path:  caminho,
        assinado_em:    new Date().toISOString(),
      })
      showToast('Espelho assinado guardado!', 'success')
      carregar()
    } catch (e) { showToast('Erro: ' + e.message, 'error') }
    setEnviandoAssinado(null)
  }

  async function verAssinado(fech) {
    try {
      const mapa = await assinarUrlsPonto([fech.assinado_path])
      const url = mapa[fech.assinado_path]
      if (url) window.open(url, '_blank')
      else showToast('Arquivo não encontrado.', 'error')
    } catch (e) { showToast(e.message, 'error') }
  }

  if (semEstrutura) {
    return (
      <div className="rh-migracao">
        <h4>Migração pendente</h4>
        As tabelas do ponto ainda não existem no banco. Rode o arquivo abaixo
        no SQL Editor do Supabase e recarregue a página.
        <code>supabase/migrations/20261102_rh_ponto.sql</code>
      </div>
    )
  }

  return (
    <>
      <div className="rh-filtros">
        <div className="rh-f" style={{ minWidth:150 }}>
          <label>Competência</label>
          <input type="month" value={competencia} onChange={e => setCompetencia(e.target.value)} style={S.inpS} />
        </div>
        <div className="rh-f" style={{ minWidth:170 }}>
          <label>Funcionário</label>
          <select value={filtroFunc} onChange={e => setFiltroFunc(e.target.value)} style={S.inpS}>
            <option value="">Todos</option>
            {funcionarios.filter(bateOuTemHistorico).map(f => (
              <option key={f.id} value={f.id}>{f.apelido || f.nome}</option>
            ))}
          </select>
        </div>
        <div className="rh-acoes">
          <button onClick={abrirCerca} style={{ ...S.btn, padding:'5px 14px' }}>Local da loja</button>
          <button onClick={carregar} style={{ ...S.btn, padding:'5px 14px' }}>Atualizar</button>
        </div>
      </div>

      <div className="rh-conteudo">
        {carregando ? (
          <p style={{ color:'var(--muted)' }}>Carregando…</p>
        ) : !daLista.length ? (
          <p className="rh-vazio">Ninguém com ponto neste mês. Marque "Bate ponto" no cadastro de quem controla jornada.</p>
        ) : (
          <div style={{ display:'grid', gap:14 }}>
            {daLista.map(func => {
              const espelho = espelhoDe(func)
              const fech    = fechamentoDe(func.id)
              const aberto  = expandido === func.id
              return (
                <div key={func.id} className="pt-bloco">
                  <div className="pt-bloco-topo" onClick={() => setExpandido(aberto ? null : func.id)}>
                    <div>
                      <div className="pt-bloco-nome">{func.apelido || func.nome}</div>
                      <div className="pt-bloco-sub">
                        {fmtHoras(espelho.totais.trabalhadas)} trabalhadas de {fmtHoras(espelho.totais.previstas)}
                        {' • '}
                        <span style={{ color: espelho.totais.saldo < 0 ? 'var(--red)' : 'var(--green)' }}>
                          saldo {fmtHoras(espelho.totais.saldo)}
                        </span>
                        {espelho.totais.faltas > 0 && (
                          <span style={{ color:'var(--red)' }}> • {espelho.totais.faltas} falta(s)</span>
                        )}
                      </div>
                    </div>
                    <div className="pt-bloco-acoes" onClick={e => e.stopPropagation()}>
                      {fech?.assinado_path ? (
                        <span className="rh-badge ok">Assinado {fmtData(String(fech.assinado_em).slice(0,10))}</span>
                      ) : fech?.gerado_em ? (
                        <span className="rh-badge pend">Aguardando assinatura</span>
                      ) : null}
                      <button onClick={() => setModalPin(func)} className="btn-action-sm copy" title="Definir PIN do ponto">
                        <IconEdit />
                      </button>
                      <button onClick={() => gerarEspelho(func, false)} className="btn-action-sm copy" title="Gerar espelho em PDF">
                        <IconRecibo />
                      </button>
                      <button onClick={() => gerarEspelho(func, true)} className="btn-action-sm wpp" title="Gerar e enviar no WhatsApp">
                        <IconWhats />
                      </button>
                      {fech?.assinado_path ? (
                        <button onClick={() => verAssinado(fech)} className="btn-action-sm send" title="Ver assinado">
                          <IconCheck />
                        </button>
                      ) : (
                        <button
                          onClick={() => { setEnviandoAssinado(func.id); inputAssinado.current?.click() }}
                          className="btn-action-sm fila"
                          title="Anexar o espelho assinado"
                          disabled={enviandoAssinado === func.id}>
                          <IconCheck />
                        </button>
                      )}
                      <span className="pt-seta">{aberto ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {aberto && (
                    <div className="pt-dias">
                      <div className="pt-dias-head">
                        <span>Dia</span>
                        {TIPOS_BATIDA.map(t => <span key={t}>{LABEL_BATIDA[t]}</span>)}
                        <span>Horas</span>
                        <span>Saldo</span>
                      </div>
                      {espelho.dias.map(d => (
                        <div
                          key={d.dia}
                          className={`pt-dia-linha${!d.diaUtil ? ' folga' : ''}${d.falta ? ' falta' : ''}`}
                          onClick={() => abrirDia(func, d)}
                        >
                          <span>
                            {String(d.dia).slice(8, 10)}/{String(d.dia).slice(5, 7)}
                            <small> {diaSemana(d.dia)}</small>
                          </span>
                          {TIPOS_BATIDA.map(t => (
                            <span key={t} className={[d.ajustadas?.[t] ? 'ajustada' : '', t === 'ENTRADA' && d.atrasoMin ? 'atrasada' : ''].filter(Boolean).join(' ')} title={t === 'ENTRADA' && d.atrasoMin ? `${d.atrasoMin} min de atraso` : undefined}>
                              {horaDe(d.horarios[t]) || '—'}
                            </span>
                          ))}
                          <span>{d.trabalhadas ? fmtHoras(d.trabalhadas) : '—'}</span>
                          <span style={{ color: d.saldo < 0 ? 'var(--red)' : d.saldo > 0 ? 'var(--green)' : 'var(--muted)' }}>
                            {d.saldo ? fmtHoras(d.saldo) : '—'}
                          </span>
                        </div>
                      ))}
                      <p style={{ fontSize:11, color:'var(--muted)', marginTop:8 }}>
                        Toque num dia para ver as fotos das batidas e corrigir horário.
                        Hora em azul foi ajustada; a marcação original fica guardada.
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* input único para o upload do assinado */}
      <input ref={inputAssinado} type="file" accept="application/pdf,image/jpeg,image/png"
        style={{ display:'none' }}
        onChange={e => {
          const func = daLista.find(f => f.id === enviandoAssinado)
          const file = e.target.files?.[0]
          e.target.value = ''
          if (func && file) receberAssinado(func, file)
          else setEnviandoAssinado(null)
        }} />

      {modalDia && (
        <Modal
          titulo={`${modalDia.funcionario.apelido || modalDia.funcionario.nome} — ${fmtData(modalDia.dia.dia)}`}
          onFechar={() => setModalDia(null)}
          largura={560}
        >
          {TIPOS_BATIDA.map(tipo => {
            const marc   = modalDia.dia.marcacoes[tipo]
            const ajuste = modalDia.dia.ajustadas?.[tipo]
            const hora   = horaDe(modalDia.dia.horarios[tipo])
            return (
              <div key={tipo} className="pt-batida">
                <div className="pt-batida-foto">
                  {marc?.foto_path && urls[marc.foto_path]
                    ? <img src={urls[marc.foto_path]} alt="" onClick={() => window.open(urls[marc.foto_path], '_blank')} />
                    : <span>{marc?.foto_expirada ? 'foto expirada' : marc ? 'sem foto' : '—'}</span>}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--text-header)' }}>
                    {LABEL_BATIDA[tipo]} {hora && <span style={{ color: ajuste ? 'var(--blue)' : 'var(--green)' }}>{hora}</span>}
                  </div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>
                    {marc
                      ? `${marc.origem || 'QUIOSQUE'} • comprovante ${marc.comprovante}`
                      : 'Sem marcação'}
                    {marc && marc.distancia_metros != null && (
                      <span style={{ color: marc.fora_da_cerca ? 'var(--yellow)' : 'var(--muted)' }}>
                        {' • '}{marc.distancia_metros} m da loja
                        {marc.fora_da_cerca && ' (fora da cerca)'}
                      </span>
                    )}
                    {marc && marc.distancia_metros == null && marc.latitude == null && ' • sem localização'}
                    {ajuste && (
                      <><br />Ajustado por {ajuste.autor_nome || 'usuário'}: {ajuste.motivo}</>
                    )}
                  </div>
                </div>
                <button onClick={() => abrirAjuste(modalDia.funcionario, modalDia.dia, tipo)}
                  className="btn-action-sm copy" title="Corrigir este horário">
                  <IconEdit />
                </button>
              </div>
            )
          })}
          {modalDia.dia.extras?.length > 0 && (
            <p style={{ fontSize:11, color:'var(--yellow)', margin:0 }}>
              {modalDia.dia.extras.length} batida(s) repetida(s) neste dia, mantidas no histórico mas fora do cálculo.
            </p>
          )}
        </Modal>
      )}

      {modalAjuste && (
        <Modal
          titulo={`Corrigir ${LABEL_BATIDA[modalAjuste.tipo].toLowerCase()}`}
          onFechar={() => setModalAjuste(null)}
          largura={440}
          footer={
            <>
              <button className="btn-cancel" onClick={() => setModalAjuste(null)}>Cancelar</button>
              <button className="btn-confirm" onClick={salvarAjuste} disabled={salvando}>
                {salvando ? 'Salvando…' : 'Registrar ajuste'}
              </button>
            </>
          }
        >
          <p style={{ margin:0, fontSize:13, color:'var(--muted)' }}>
            {fmtData(modalAjuste.dia.dia)} — valor atual:{' '}
            <b style={{ color:'var(--text-body)' }}>{horaDe(modalAjuste.atual) || 'sem marcação'}</b>
          </p>
          <Campo label="Novo horário (vazio = desconsiderar)">
            <input type="time" value={formAjuste.hora}
              onChange={e => setFormAjuste(p => ({ ...p, hora: e.target.value }))} style={S.inp} />
          </Campo>
          <Campo label="Motivo *">
            <textarea value={formAjuste.motivo}
              onChange={e => setFormAjuste(p => ({ ...p, motivo: e.target.value }))}
              placeholder="Ex: esqueceu de bater a saída, confirmado pela gerente"
              style={{ ...S.inp, minHeight:70, resize:'vertical' }} />
          </Campo>
          <p style={{ fontSize:11, color:'var(--muted)', margin:0 }}>
            A batida original não é apagada: o ajuste entra como correção, com seu nome e a data.
          </p>
        </Modal>
      )}

      {modalCerca && (
        <Modal
          titulo="Local da loja"
          onFechar={() => setModalCerca(false)}
          largura={460}
          footer={
            <>
              <button className="btn-cancel" onClick={() => setModalCerca(false)}>Cancelar</button>
              <button className="btn-confirm" onClick={salvarCerca} disabled={salvando}>
                {salvando ? 'Salvando…' : 'Salvar'}
              </button>
            </>
          }
        >
          <p style={{ margin:0, fontSize:13, color:'var(--muted)' }}>
            Estando <b style={{ color:'var(--text-body)' }}>dentro da loja</b>, toque no botão abaixo
            para gravar a posição. É contra ela que cada batida é conferida.
          </p>

          <button onClick={usarLocalAtual} disabled={buscandoLocal}
            style={{ ...S.btn, width:'100%', padding:'10px', fontWeight:700 }}>
            {buscandoLocal ? 'Procurando…' : 'Usar a localização atual'}
          </button>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Campo label="Latitude">
              <input value={formCerca.latitude}
                onChange={e => setFormCerca(p => ({ ...p, latitude: e.target.value }))}
                style={S.inp} placeholder="-23.5505199" inputMode="decimal" />
            </Campo>
            <Campo label="Longitude">
              <input value={formCerca.longitude}
                onChange={e => setFormCerca(p => ({ ...p, longitude: e.target.value }))}
                style={S.inp} placeholder="-46.6333094" inputMode="decimal" />
            </Campo>
          </div>

          <Campo label="Distância aceita (metros)">
            <input type="number" min="30" max="2000" step="10" value={formCerca.raio}
              onChange={e => setFormCerca(p => ({ ...p, raio: e.target.value }))}
              style={S.inp} />
          </Campo>

          <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, fontWeight:700, color:'var(--text-body)', cursor:'pointer' }}>
            <input type="checkbox" checked={formCerca.exigir}
              onChange={e => setFormCerca(p => ({ ...p, exigir: e.target.checked }))}
              style={{ width:14, height:14 }} />
            Recusar a batida fora da loja
          </label>
          <p style={{ fontSize:11, color:'var(--muted)', margin:0, lineHeight:1.5 }}>
            Desmarcado, a batida é aceita de qualquer lugar, mas fica
            <b style={{ color:'var(--yellow)' }}> marcada como fora da cerca</b> para você conferir.
            Deixar latitude e longitude em branco desliga a conferência.
            <br />
            O GPS dentro de loja costuma errar de 20 a 60 metros — por isso 150 m é um bom começo.
            Apertar demais faz a batida ser recusada com a funcionária parada no balcão.
          </p>
        </Modal>
      )}

      {modalPin && (
        <Modal
          titulo={`PIN de ${modalPin.apelido || modalPin.nome}`}
          onFechar={() => { setModalPin(null); setPin('') }}
          largura={400}
          footer={
            <>
              <button className="btn-cancel" onClick={() => { setModalPin(null); setPin('') }}>Cancelar</button>
              <button className="btn-confirm" onClick={salvarPin} disabled={salvando}>
                {salvando ? 'Salvando…' : 'Definir PIN'}
              </button>
            </>
          }
        >
          <Campo label="PIN de 4 dígitos">
            <input value={pin} inputMode="numeric" maxLength={4}
              onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              style={{ ...S.inp, fontSize:22, letterSpacing:10, textAlign:'center' }} />
          </Campo>
          <p style={{ fontSize:11, color:'var(--muted)', margin:0 }}>
            É com esse PIN que ela bate o ponto no celular da loja. Definir um novo substitui o anterior;
            o PIN não fica visível depois de salvo.
          </p>
        </Modal>
      )}
    </>
  )
}
