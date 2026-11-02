import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import AppShell from '../../components/ui/AppShell'
import {
  getFuncionariosPonto, registrarPonto, enviarFotoPonto, getMarcacoes,
  TIPOS_BATIDA, LABEL_BATIDA, horaDe,
} from '../../services/pontoService'
import { isoLocal } from '../../services/rhService'
import './ponto.css'

const HOJE = isoLocal(new Date())

// Ordem das batidas do dia: a próxima é sempre a primeira que faltar
function proximaBatida(feitas) {
  return TIPOS_BATIDA.find(t => !feitas.includes(t)) || null
}

export default function PontoQuiosquePage() {
  const { profile }   = useAuth()
  const { showToast } = useApp()
  const tenantId      = profile?.tenant_id

  const [funcionarios, setFuncionarios] = useState([])
  const [semEstrutura, setSemEstrutura] = useState(false)
  const [doDia,        setDoDia]        = useState([])   // marcações de hoje
  const [carregando,   setCarregando]   = useState(true)

  const [escolhido, setEscolhido] = useState(null)  // funcionário selecionado
  const [pin,       setPin]       = useState('')
  const [tipo,      setTipo]      = useState(null)
  const [enviando,  setEnviando]  = useState(false)
  const [recibo,    setRecibo]    = useState(null)  // comprovante na tela
  const [camOk,     setCamOk]     = useState(false)

  const videoRef  = useRef(null)
  const streamRef = useRef(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const [fs, ms] = await Promise.all([
        getFuncionariosPonto(),
        getMarcacoes(tenantId, { dataInicio: HOJE, dataFim: HOJE }),
      ])
      setFuncionarios(fs.data)
      setDoDia(ms.data)
      setSemEstrutura(fs.semEstrutura || ms.semEstrutura)
    } catch (e) {
      showToast('Erro ao carregar: ' + e.message, 'error')
    }
    setCarregando(false)
  }, [tenantId, showToast])

  useEffect(() => { carregar() }, [carregar])

  // A câmera só liga na tela do PIN, e desliga ao sair dela
  useEffect(() => {
    if (!escolhido) return
    let cancelado = false

    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'user', width: 640 }, audio: false })
      .then(stream => {
        if (cancelado) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
        setCamOk(true)
      })
      .catch(() => setCamOk(false))   // sem câmera a batida continua valendo

    return () => {
      cancelado = true
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
      setCamOk(false)
    }
  }, [escolhido])

  function capturarFoto() {
    const video = videoRef.current
    if (!video || !camOk || !video.videoWidth) return Promise.resolve(null)
    const canvas = document.createElement('canvas')
    canvas.width  = 480
    canvas.height = Math.round((video.videoHeight / video.videoWidth) * 480)
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
    return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.75))
  }

  // Teclado próprio: o teclado do sistema sobe e empurra a câmera para fora
  // da tela. Com estas teclas a tela fica parada do começo ao fim.
  const digitar = useCallback(d => setPin(p => (p + d).slice(0, 4)), [])
  const apagar  = useCallback(() => setPin(p => p.slice(0, -1)), [])

  function batidasDe(funcionarioId) {
    return doDia.filter(m => m.funcionario_id === funcionarioId).map(m => m.tipo)
  }

  function abrir(func) {
    const feitas = batidasDe(func.id)
    if (!func.tem_pin) {
      return showToast('Essa funcionária ainda não tem PIN. Defina em RH → Ponto.', 'error')
    }
    setEscolhido(func)
    setPin('')
    setRecibo(null)
    setTipo(proximaBatida(feitas) || 'SAIDA')
  }

  function fechar() {
    setEscolhido(null)
    setPin('')
    setRecibo(null)
  }

  async function confirmar() {
    if (pin.length !== 4) return showToast('Digite os 4 dígitos do PIN.', 'error')
    setEnviando(true)
    try {
      // A foto vai antes para já entrar junto da batida; se falhar, a
      // marcação acontece do mesmo jeito (o service devolve null).
      const blob = await capturarFoto()
      const fotoPath = await enviarFotoPonto(blob, tenantId, escolhido.id)

      const res = await registrarPonto({
        funcionarioId: escolhido.id,
        pin,
        tipo,
        fotoPath,
      })

      setRecibo({
        comprovante: res.comprovante,
        hora:        horaDe(res.registrado_em),
        tipo,
        nome:        escolhido.apelido || escolhido.nome,
        semFoto:     !fotoPath,
      })
      setPin('')
      carregar()
    } catch (e) {
      const msg = String(e.message || '')
      showToast(msg.includes('PIN incorreto') ? 'PIN incorreto.' : 'Erro: ' + msg, 'error')
      setPin('')
    }
    setEnviando(false)
  }

  // No computador o teclado físico continua valendo
  useEffect(() => {
    if (!escolhido || recibo) return
    function aoTeclar(e) {
      if (/^[0-9]$/.test(e.key))      digitar(e.key)
      else if (e.key === 'Backspace') apagar()
      else if (e.key === 'Enter' && pin.length === 4) confirmar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  })

  // ── Comprovante ─────────────────────────────────────────────
  if (recibo) {
    return (
      <AppShell title="Bater Ponto" hideTitle>
        <div className="pt-recibo">
          <div className="pt-recibo-check">✓</div>
          <h2>{LABEL_BATIDA[recibo.tipo]} registrada</h2>
          <div className="pt-recibo-hora">{recibo.hora}</div>
          <div className="pt-recibo-nome">{recibo.nome}</div>
          <div className="pt-recibo-cod">
            Comprovante <b>{recibo.comprovante}</b>
          </div>
          <p className="pt-recibo-dica">
            Guarde ou fotografe este código — ele identifica a sua marcação.
            {recibo.semFoto && <><br />A foto não pôde ser registrada desta vez.</>}
          </p>
          <button className="pt-btn-grande" onClick={fechar}>Concluir</button>
        </div>
      </AppShell>
    )
  }

  // ── PIN + câmera ────────────────────────────────────────────
  if (escolhido) {
    const feitas = batidasDe(escolhido.id)
    return (
      <AppShell title="Bater Ponto" hideTitle>
        <div className="pt-pin">
          <div className="pt-pin-topo">
            <button className="pt-voltar" onClick={fechar}>‹ Voltar</button>
            <span className="pt-pin-nome">{escolhido.apelido || escolhido.nome}</span>
            <div className="pt-camera">
              <video ref={videoRef} autoPlay playsInline muted />
              {!camOk && <span className="pt-camera-off">sem câmera</span>}
            </div>
          </div>

          <div className="pt-tipos">
            {TIPOS_BATIDA.map(t => (
              <button key={t}
                className={`pt-tipo${tipo === t ? ' ativo' : ''}${feitas.includes(t) ? ' feito' : ''}`}
                onClick={() => setTipo(t)}>
                {LABEL_BATIDA[t]}
                {feitas.includes(t) && <span className="pt-tipo-ok">já registrada</span>}
              </button>
            ))}
          </div>

          <div className="pt-pin-dots" aria-label={`PIN: ${pin.length} de 4 dígitos`}>
            {[0, 1, 2, 3].map(i => (
              <span key={i} className={`pt-dot${pin.length > i ? ' cheio' : ''}`} />
            ))}
          </div>

          <div className="pt-teclado">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
              <button key={d} className="pt-tecla" onClick={() => digitar(d)}>{d}</button>
            ))}
            <button className="pt-tecla pt-tecla-aux" onClick={() => setPin('')} disabled={!pin}>
              limpar
            </button>
            <button className="pt-tecla" onClick={() => digitar('0')}>0</button>
            <button className="pt-tecla pt-tecla-aux" onClick={apagar} disabled={!pin}>
              apagar
            </button>
          </div>

          <button className="pt-btn-grande" onClick={confirmar} disabled={enviando || pin.length !== 4}>
            {enviando ? 'Registrando…' : `Registrar ${LABEL_BATIDA[tipo]?.toLowerCase()}`}
          </button>

          <p className="pt-aviso">
            Uma foto sua é registrada para conferência e guardada por até 6 meses.
            O horário é o do sistema, não o do aparelho.
          </p>
        </div>
      </AppShell>
    )
  }

  // ── Lista de funcionários ───────────────────────────────────
  return (
    <AppShell title="Bater Ponto" hideTitle>
      <div className="pt-home">
        <div className="pt-home-topo">
          <h1>Bater ponto</h1>
          <span>{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</span>
        </div>

        {semEstrutura ? (
          <div className="rh-migracao">
            <h4>Migração pendente</h4>
            As tabelas do ponto ainda não existem no banco. Rode o arquivo abaixo
            no SQL Editor do Supabase e recarregue a página.
            <code>supabase/migrations/20261102_rh_ponto.sql</code>
          </div>
        ) : carregando ? (
          <p className="pt-vazio">Carregando…</p>
        ) : !funcionarios.length ? (
          <p className="pt-vazio">Nenhum funcionário ativo cadastrado.</p>
        ) : (
          <div className="pt-lista">
            {funcionarios.map(f => {
              const feitas   = batidasDe(f.id)
              const proxima  = proximaBatida(feitas)
              const ultima   = doDia.filter(m => m.funcionario_id === f.id).slice(-1)[0]
              return (
                <button key={f.id} className="pt-card" onClick={() => abrir(f)}>
                  <span className="pt-card-nome">{f.apelido || f.nome}</span>
                  <span className="pt-card-status">
                    {feitas.length === 0
                      ? 'Nenhuma batida hoje'
                      : `${feitas.length} de 4 • última ${LABEL_BATIDA[ultima?.tipo] || ''} ${horaDe(ultima?.registrado_em)}`}
                  </span>
                  <span className="pt-card-proxima">
                    {proxima ? `Próxima: ${LABEL_BATIDA[proxima]}` : 'Dia completo'}
                  </span>
                  {!f.tem_pin && <span className="pt-card-alerta">sem PIN</span>}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </AppShell>
  )
}
