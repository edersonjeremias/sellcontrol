import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import PortalToastProvider, { usePortalToast } from '../../components/portal/PortalToast'
import {
  buscarDados,
  salvarEndereco,
  cotarFrete,
  gerarPix,
  consultarStatus,
} from '../../services/fretePublicoService'
import { linkRastreio } from '../../lib/rastreio'
import '../../styles/portal.css'

const STATUS_PAGOS = ['frete_pago', 'etiqueta_gerada', 'despachado']

const card = {
  background: 'rgba(255,255,255,.03)',
  border: '1px solid rgba(255,255,255,.08)',
  borderRadius: 12,
  padding: 16,
  marginBottom: 14,
}

const titulo = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: .6,
  textTransform: 'uppercase',
  color: 'var(--p-muted)',
  marginBottom: 10,
}

const moeda = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// data_live vem como YYYY-MM-DD: formatar sem Date() para não voltar um dia
const fmtDataLive = (d) => {
  if (!d) return ''
  const [ano, mes, dia] = String(d).slice(0, 10).split('-')
  return dia ? `${dia}/${mes}/${ano}` : ''
}

// codigo produto modelo cor marca (tamanho)
const descricaoPeca = (i) => {
  const partes = [i.codigo, i.produto, i.modelo, i.cor, i.marca]
    .map(v => String(v || '').trim())
    .filter(Boolean)
    .join(' ')
  const tamanho = String(i.tamanho || '').trim()
  return tamanho ? `${partes} (${tamanho})` : partes
}

// Uma data por live, com as peças daquela live abaixo dela
const agruparPorLive = (itens) => {
  const grupos = new Map()
  for (const i of itens) {
    const chave = String(i.data_live || '').slice(0, 10)
    if (!grupos.has(chave)) grupos.set(chave, [])
    grupos.get(chave).push(i)
  }
  // Peças sem data da live ficam por último
  return [...grupos.entries()]
    .sort(([a], [b]) => (a && b ? a.localeCompare(b) : a ? -1 : 1))
    .map(([data, pecas]) => ({ data, pecas }))
}

const mascaraCep = v => v.replace(/\D/g, '').slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2')

const mascaraTelefone = v => {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 10) return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2')
  return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2')
}

const mascaraCpf = v => v.replace(/\D/g, '').slice(0, 11)
  .replace(/^(\d{3})(\d)/, '$1.$2')
  .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
  .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2')

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// Mesma checagem do servidor: o Melhor Envio recusa CPF inválido na etiqueta
const cpfValido = (valor) => {
  const cpf = String(valor || '').replace(/\D/g, '')
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false

  for (const corte of [9, 10]) {
    let soma = 0
    for (let i = 0; i < corte; i++) soma += Number(cpf[i]) * (corte + 1 - i)
    let digito = (soma * 10) % 11
    if (digito === 10) digito = 0
    if (digito !== Number(cpf[corte])) return false
  }
  return true
}

const dadosFiscaisOk = (endereco) =>
  Boolean(endereco && cpfValido(endereco.cpf) && EMAIL_RE.test(String(endereco.email || '')))

// Endereços antigos guardam telefone de preenchimento ("(00) 00000-0000")
const telefoneUtil = (t) => {
  const d = String(t || '').replace(/\D/g, '')
  return d.length >= 10 && !/^(\d)\1+$/.test(d)
}

const formDoEndereco = (e, cliente = {}) => ({
  apelido: e.apelido || 'Entrega',
  destinatario: e.destinatario || cliente.nome || '',
  telefone: mascaraTelefone(telefoneUtil(e.telefone) ? e.telefone : (cliente.telefone || '')),
  cpf: mascaraCpf(e.cpf || cliente.cpf || ''),
  email: e.email || cliente.email || '',
  cep: mascaraCep(e.cep || ''),
  rua: e.rua || '',
  numero: e.numero || '',
  complemento: e.complemento || '',
  bairro: e.bairro || '',
  cidade: e.cidade || '',
  estado: e.estado || '',
})

const FORM_VAZIO = {
  apelido: 'Entrega',
  destinatario: '',
  telefone: '',
  cpf: '',
  email: '',
  cep: '',
  rua: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  estado: '',
}

function FretePublico() {
  // /frete/:token (uuid antigo) ou /f/:codigo (curto)
  const { token: tokenLongo, codigo } = useParams()
  const token = codigo || tokenLongo
  const showToast = usePortalToast()

  const [loading, setLoading] = useState(true)
  const [erroFatal, setErroFatal] = useState('')
  const [dados, setDados] = useState(null)
  const [itensAbertos, setItensAbertos] = useState(false)

  const [enderecoSel, setEnderecoSel] = useState(null)
  const [editandoEndereco, setEditandoEndereco] = useState(false)
  const [enderecoEditId, setEnderecoEditId] = useState(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [salvando, setSalvando] = useState(false)

  const [cotacoes, setCotacoes] = useState([])
  const [cotando, setCotando] = useState(false)
  const [cotacaoSel, setCotacaoSel] = useState(null)
  const [gerandoPix, setGerandoPix] = useState(false)
  const [pagamento, setPagamento] = useState(null)
  const [pago, setPago] = useState(false)

  const pollRef = useRef(null)

  // ── Carrega tudo ──────────────────────────────────────────────────────────
  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const d = await buscarDados(token)
      setDados(d)
      setCotacoes(d.cotacoes || [])
      setPagamento(d.pagamento?.status === 'pendente' ? d.pagamento : null)
      setPago(STATUS_PAGOS.includes(d.romaneio.status))

      const padrao = d.romaneio.endereco_id
        ? d.enderecos.find(e => e.id === d.romaneio.endereco_id)
        : d.enderecos.find(e => e.padrao) || d.enderecos[0]

      setEnderecoSel(padrao?.id || null)

      // Endereço antigo sem CPF/e-mail: já abre o formulário para completar
      if (!padrao) {
        setEditandoEndereco(true)
      } else if (!dadosFiscaisOk(padrao) && !STATUS_PAGOS.includes(d.romaneio.status)) {
        setForm(formDoEndereco(padrao, d.cliente))
        setEnderecoEditId(padrao.id)
        setEditandoEndereco(true)
      }
    } catch (err) {
      setErroFatal(err.message || 'Não conseguimos abrir este link')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { carregar() }, [carregar])

  // ── Polling enquanto o PIX está pendente ──────────────────────────────────
  useEffect(() => {
    if (!pagamento || pago) return

    pollRef.current = setInterval(async () => {
      try {
        const s = await consultarStatus(token)
        if (s.pago) {
          setPago(true)
          setPagamento(null)
          showToast('Pagamento confirmado! 🎉', 'success')
        }
      } catch {
        // rede instável no celular do cliente: tenta de novo no próximo ciclo
      }
    }, 8000)

    return () => clearInterval(pollRef.current)
  }, [pagamento, pago, token, showToast])

  // ── Endereço ──────────────────────────────────────────────────────────────
  const abrirNovoEndereco = () => {
    // Começa com o que já existe no cadastro do cliente
    setForm(formDoEndereco({}, dados?.cliente || {}))
    setEnderecoEditId(null)
    setEditandoEndereco(true)
  }

  const abrirEdicaoEndereco = () => {
    const e = dados.enderecos.find(x => x.id === enderecoSel)
    if (!e) return abrirNovoEndereco()
    setForm(formDoEndereco(e, dados.cliente || {}))
    setEnderecoEditId(e.id)
    setEditandoEndereco(true)
  }

  const buscarCep = async (valor) => {
    const cep = valor.replace(/\D/g, '')
    if (cep.length !== 8) return
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
      const d = await res.json()
      if (d.erro) return showToast('CEP não encontrado', 'error')
      setForm(p => ({
        ...p,
        rua: d.logradouro || p.rua,
        bairro: d.bairro || p.bairro,
        cidade: d.localidade || p.cidade,
        estado: d.uf || p.estado,
      }))
    } catch {
      showToast('Não conseguimos buscar o CEP agora', 'error')
    }
  }

  const handleSalvarEndereco = async () => {
    if (!cpfValido(form.cpf)) return showToast('CPF inválido. Confira os números.', 'error')
    if (!EMAIL_RE.test(form.email.trim())) return showToast('Informe um e-mail válido.', 'error')

    setSalvando(true)
    try {
      const r = await salvarEndereco(token, form, enderecoEditId)
      setDados(p => ({ ...p, enderecos: r.enderecos }))
      setEnderecoSel(r.endereco_id)
      setEditandoEndereco(false)
      setCotacoes([])
      setCotacaoSel(null)
      showToast('Endereço salvo!', 'success')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSalvando(false)
    }
  }

  // ── Frete ─────────────────────────────────────────────────────────────────
  const handleCotar = async () => {
    if (!enderecoSel) return showToast('Confirme o endereço de entrega', 'error')
    setCotando(true)
    setCotacaoSel(null)
    try {
      const r = await cotarFrete(token, enderecoSel)
      setCotacoes(r.cotacoes || [])
      if (r.cotacoes?.length) setCotacaoSel(r.cotacoes[0].id)
      showToast('Opções de frete atualizadas', 'success')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setCotando(false)
    }
  }

  const handlePagar = async () => {
    if (!cotacaoSel) return showToast('Escolha uma opção de frete', 'error')
    setGerandoPix(true)
    try {
      const r = await gerarPix(token, cotacaoSel)
      setPagamento(r.pagamento)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setGerandoPix(false)
    }
  }

  const copiarRastreio = async () => {
    try {
      await navigator.clipboard.writeText(dados.romaneio.codigo_rastreio)
      showToast('Código de rastreio copiado!', 'success')
    } catch {
      showToast('Copie o código manualmente', 'error')
    }
  }

  const copiarPix = async () => {
    try {
      await navigator.clipboard.writeText(pagamento.qr_code)
      showToast('Código PIX copiado!', 'success')
    } catch {
      showToast('Copie o código manualmente', 'error')
    }
  }

  // ── Telas de estado ───────────────────────────────────────────────────────
  if (loading) {
    return <Centro>Carregando seu pedido...</Centro>
  }

  if (erroFatal) {
    return (
      <Centro>
        <div style={{ fontSize: 44, marginBottom: 12 }}>🔍</div>
        <h2 style={{ color: '#e8eaed', margin: '0 0 8px' }}>Link não encontrado</h2>
        <p style={{ color: 'var(--p-muted)', margin: 0, maxWidth: 320 }}>
          {erroFatal}<br />Fale com a loja para receber um link novo.
        </p>
      </Centro>
    )
  }

  const { loja, romaneio, itens, enderecos } = dados
  const endereco = enderecos.find(e => e.id === enderecoSel)

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '20px 16px 40px' }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ color: 'var(--p-blue)', fontWeight: 800, fontSize: 18 }}>{loja}</div>
        <div style={{ color: 'var(--p-muted)', fontSize: 13, marginTop: 2 }}>
          Pedido {romaneio.numero} · @{romaneio.cliente_instagram}
        </div>
      </div>

      {/* ── Pago ───────────────────────────────────────────────────────── */}
      {pago && (
        <div style={{ ...card, borderColor: 'rgba(129,201,149,.4)', background: 'rgba(129,201,149,.08)', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
          <div style={{ color: 'var(--p-green)', fontWeight: 800, fontSize: 17, marginBottom: 6 }}>
            Frete pago!
          </div>
          <div style={{ color: '#e8eaed', fontSize: 13, lineHeight: 1.5 }}>
            {romaneio.transportadora && (
              <>Enviaremos pela <b>{romaneio.transportadora}</b>
                {romaneio.prazo_entrega ? ` em até ${romaneio.prazo_entrega} dias úteis` : ''}.<br /></>
            )}
            {romaneio.codigo_rastreio
              ? 'Seu pedido já foi postado. Acompanhe pelo código abaixo.'
              : 'Agora é só aguardar: assim que a loja postar, o código de rastreio aparece aqui.'}
          </div>

          {romaneio.codigo_rastreio && (
            <div style={{ marginTop: 14 }}>
              <div style={{ color: 'var(--p-muted)', fontSize: 11, marginBottom: 4 }}>
                CÓDIGO DE RASTREIO
              </div>
              <div style={{
                fontFamily: 'monospace',
                color: '#e8eaed',
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: .5,
              }}>
                {romaneio.codigo_rastreio}
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 10 }}>
                <a
                  className="portal-btn portal-btn-blue"
                  href={linkRastreio(romaneio.codigo_rastreio, romaneio.transportadora)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ textDecoration: 'none' }}
                >
                  Acompanhar entrega
                </a>
                <button className="portal-btn portal-btn-gray" onClick={copiarRastreio}>
                  Copiar código
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Itens (fechado por padrão: a lista pode ser longa) ─────────── */}
      <div style={card}>
        <button
          onClick={() => setItensAbertos(v => !v)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <span>
            <span style={{ color: '#e8eaed', fontWeight: 700, fontSize: 15 }}>
              {romaneio.numero}
            </span>
            <span style={{ color: 'var(--p-muted)', fontSize: 13 }}>
              {' '}· {itens.length} {itens.length === 1 ? 'peça' : 'peças'}
            </span>
          </span>
          <span style={{
            color: 'var(--p-muted)',
            fontSize: 11,
            transform: itensAbertos ? 'rotate(180deg)' : 'none',
            transition: 'transform .2s',
          }}>
            ▼
          </span>
        </button>

        {itensAbertos && (
          <div style={{ marginTop: 12 }}>
            {agruparPorLive(itens).map(({ data, pecas }, idx) => (
              <div key={data || 'sem-data'} style={{ marginTop: idx === 0 ? 0 : 14 }}>
                {fmtDataLive(data) && (
                  <div style={{ color: 'var(--p-muted)', fontSize: 11, marginBottom: 4 }}>
                    {fmtDataLive(data)}
                  </div>
                )}
                {pecas.map(p => (
                  <div key={p.id} style={{ color: '#e8eaed', fontSize: 13, lineHeight: 1.5 }}>
                    {descricaoPeca(p)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Endereço ───────────────────────────────────────────────────── */}
      <div style={card}>
        <div style={titulo}>Endereço de entrega</div>

        {!editandoEndereco && endereco && (
          <>
            {enderecos.length > 1 && (
              <select
                className="portal-select"
                value={enderecoSel || ''}
                onChange={e => { setEnderecoSel(e.target.value); setCotacoes([]); setCotacaoSel(null) }}
                style={{ width: '100%', marginBottom: 10 }}
                disabled={pago}
              >
                {enderecos.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.apelido || 'Entrega'} — {e.rua}, {e.numero}
                  </option>
                ))}
              </select>
            )}

            <div style={{ color: '#e8eaed', fontSize: 13, lineHeight: 1.6 }}>
              <b>{endereco.destinatario}</b><br />
              {endereco.rua}, {endereco.numero}
              {endereco.complemento ? ` — ${endereco.complemento}` : ''}<br />
              {endereco.bairro} · {endereco.cidade}/{endereco.estado}<br />
              CEP {mascaraCep(endereco.cep)}
              {endereco.cpf && <><br />CPF {mascaraCpf(endereco.cpf)}</>}
              {endereco.email && <><br />{endereco.email}</>}
            </div>

            {!pago && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="portal-btn portal-btn-gray portal-btn-sm" onClick={abrirEdicaoEndereco}>
                  Corrigir
                </button>
                <button className="portal-btn portal-btn-gray portal-btn-sm" onClick={abrirNovoEndereco}>
                  Outro endereço
                </button>
              </div>
            )}
          </>
        )}

        {!editandoEndereco && !endereco && (
          <div>
            <p style={{ color: 'var(--p-muted)', fontSize: 13, margin: '0 0 10px' }}>
              Você ainda não tem endereço cadastrado.
            </p>
            <button className="portal-btn portal-btn-blue" onClick={abrirNovoEndereco}>
              Cadastrar endereço
            </button>
          </div>
        )}

        {editandoEndereco && (
          <div style={{ display: 'grid', gap: 10 }}>
            <Campo label="Quem recebe *">
              <input className="portal-input" value={form.destinatario}
                onChange={e => setForm(p => ({ ...p, destinatario: e.target.value }))} />
            </Campo>

            <Campo label="Telefone *">
              <input className="portal-input" inputMode="numeric" value={form.telefone}
                onChange={e => setForm(p => ({ ...p, telefone: mascaraTelefone(e.target.value) }))} />
            </Campo>

            <Campo label="CPF de quem recebe *">
              <input className="portal-input" inputMode="numeric" value={form.cpf}
                onChange={e => setForm(p => ({ ...p, cpf: mascaraCpf(e.target.value) }))} />
            </Campo>

            <Campo label="E-mail *">
              <input className="portal-input" type="email" autoCapitalize="none" spellCheck={false}
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value.toLowerCase().replace(/\s/g, '') }))} />
            </Campo>

            <div style={{ color: 'var(--p-muted)', fontSize: 11, lineHeight: 1.5, marginTop: -2 }}>
              O CPF e o e-mail são exigidos pela transportadora para emitir a etiqueta de envio.
            </div>

            <Campo label="CEP *">
              <input className="portal-input" inputMode="numeric" value={form.cep}
                onChange={e => {
                  const v = mascaraCep(e.target.value)
                  setForm(p => ({ ...p, cep: v }))
                  if (v.replace(/\D/g, '').length === 8) buscarCep(v)
                }} />
            </Campo>

            <Campo label="Rua *">
              <input className="portal-input" value={form.rua}
                onChange={e => setForm(p => ({ ...p, rua: e.target.value }))} />
            </Campo>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 10 }}>
              <Campo label="Número *">
                <input className="portal-input" value={form.numero}
                  onChange={e => setForm(p => ({ ...p, numero: e.target.value }))} />
              </Campo>
              <Campo label="Complemento">
                <input className="portal-input" value={form.complemento}
                  onChange={e => setForm(p => ({ ...p, complemento: e.target.value }))} />
              </Campo>
            </div>

            <Campo label="Bairro *">
              <input className="portal-input" value={form.bairro}
                onChange={e => setForm(p => ({ ...p, bairro: e.target.value }))} />
            </Campo>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
              <Campo label="Cidade *">
                <input className="portal-input" value={form.cidade}
                  onChange={e => setForm(p => ({ ...p, cidade: e.target.value }))} />
              </Campo>
              <Campo label="UF *">
                <input className="portal-input" maxLength={2} value={form.estado}
                  onChange={e => setForm(p => ({ ...p, estado: e.target.value.toUpperCase() }))} />
              </Campo>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button className="portal-btn portal-btn-blue" style={{ flex: 1 }}
                onClick={handleSalvarEndereco} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar endereço'}
              </button>
              {endereco && (
                <button className="portal-btn portal-btn-gray"
                  onClick={() => setEditandoEndereco(false)} disabled={salvando}>
                  Cancelar
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Pedido sem peso/medidas: não dá para cotar ─────────────────── */}
      {!pago && !dados.medidas_ok && (
        <div style={{ ...card, borderColor: 'rgba(242,139,130,.4)', background: 'rgba(242,139,130,.08)' }}>
          <div style={{ color: 'var(--p-red)', fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
            ⚠️ Não conseguimos calcular o frete
          </div>
          <div style={{ color: '#e8eaed', fontSize: 13, lineHeight: 1.6 }}>
            Este pedido ainda está sem o peso e as medidas da caixa, então o cálculo sairia errado.
            Fale com a equipe da loja: assim que ajustarem, este mesmo link volta a funcionar.
          </div>
        </div>
      )}

      {/* ── Frete ──────────────────────────────────────────────────────── */}
      {!pago && dados.medidas_ok && !editandoEndereco && endereco && (
        <div style={card}>
          <div style={titulo}>Frete</div>

          {cotacoes.length === 0 && (
            <p style={{ color: 'var(--p-muted)', fontSize: 13, margin: '0 0 12px' }}>
              Calcule o frete para o endereço acima e escolha como quer receber.
            </p>
          )}

          <button className="portal-btn portal-btn-blue" style={{ width: '100%', marginBottom: cotacoes.length ? 14 : 0 }}
            onClick={handleCotar} disabled={cotando}>
            {cotando ? 'Calculando...' : cotacoes.length ? 'Calcular de novo' : 'Calcular frete'}
          </button>

          {cotacoes.map(c => {
            const ativo = cotacaoSel === c.id
            return (
              <button
                key={c.id}
                onClick={() => setCotacaoSel(c.id)}
                style={{
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 10,
                  textAlign: 'left',
                  background: ativo ? 'rgba(138,180,248,.14)' : 'rgba(255,255,255,.03)',
                  border: `1px solid ${ativo ? 'var(--p-blue)' : 'rgba(255,255,255,.08)'}`,
                  borderRadius: 10,
                  padding: '12px 14px',
                  marginBottom: 8,
                  cursor: 'pointer',
                }}
              >
                <span>
                  <span style={{ color: '#e8eaed', fontWeight: 700, fontSize: 14 }}>
                    {c.transportadora} · {c.servico}
                  </span><br />
                  <span style={{ color: 'var(--p-muted)', fontSize: 12 }}>
                    Entrega em até {c.prazo} {c.prazo === 1 ? 'dia útil' : 'dias úteis'}
                  </span>
                </span>
                <span style={{ color: ativo ? 'var(--p-blue)' : '#e8eaed', fontWeight: 800, fontSize: 15, whiteSpace: 'nowrap' }}>
                  {moeda(c.valor)}
                </span>
              </button>
            )
          })}

          {cotacoes.length > 0 && (
            <button className="portal-btn portal-btn-green" style={{ width: '100%', marginTop: 6 }}
              onClick={handlePagar} disabled={gerandoPix || !cotacaoSel}>
              {gerandoPix ? 'Gerando PIX...' : 'Pagar com PIX'}
            </button>
          )}
        </div>
      )}

      <p style={{ color: 'var(--p-muted)', fontSize: 11, textAlign: 'center', marginTop: 18 }}>
        Pagamento processado pelo Mercado Pago. A loja não recebe os dados do seu banco.
      </p>

      {/* ── PIX ────────────────────────────────────────────────────────── */}
      {pagamento && !pago && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.92)', zIndex: 10000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
            overflowY: 'auto',
          }}
        >
          <div style={{
            background: '#1a2230', border: '2px solid var(--p-blue)', borderRadius: 16,
            padding: 22, maxWidth: 380, width: '100%', textAlign: 'center',
          }}>
            <h3 style={{ margin: '0 0 4px', color: 'var(--p-blue)' }}>💳 Pague com PIX</h3>
            <div style={{ color: '#e8eaed', fontWeight: 800, fontSize: 20, marginBottom: 14 }}>
              {moeda(pagamento.valor_cobrado)}
            </div>

            {pagamento.qr_code_base64 ? (
              <div style={{ background: '#fff', padding: 14, borderRadius: 12, marginBottom: 14 }}>
                <img
                  src={`data:image/png;base64,${pagamento.qr_code_base64}`}
                  alt="QR Code PIX"
                  style={{ width: '100%', maxWidth: 230, margin: '0 auto', display: 'block' }}
                />
              </div>
            ) : (
              <p style={{ color: 'var(--p-muted)', fontSize: 13 }}>
                Use o código copia e cola abaixo.
              </p>
            )}

            <button className="portal-btn portal-btn-blue" style={{ width: '100%', marginBottom: 10 }}
              onClick={copiarPix}>
              Copiar código PIX
            </button>

            {pagamento.expiracao && (
              <p style={{ color: 'var(--p-yellow)', fontSize: 12, margin: '0 0 10px' }}>
                ⏰ Válido até {new Date(pagamento.expiracao).toLocaleString('pt-BR')}
              </p>
            )}

            <p style={{ color: 'var(--p-muted)', fontSize: 12, margin: '0 0 14px' }}>
              Assim que o pagamento cair, esta tela confirma sozinha. Pode deixar aberta.
            </p>

            <button className="portal-btn portal-btn-gray" style={{ width: '100%' }}
              onClick={() => setPagamento(null)}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Campo({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, color: 'var(--p-muted)', marginBottom: 4, fontWeight: 600 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function Centro({ children }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 6,
      color: 'var(--p-muted)', textAlign: 'center', padding: 20,
    }}>
      {children}
    </div>
  )
}

export default function FretePublicoPage() {
  return (
    <PortalToastProvider>
      <div className="portal-root">
        <FretePublico />
      </div>
    </PortalToastProvider>
  )
}
