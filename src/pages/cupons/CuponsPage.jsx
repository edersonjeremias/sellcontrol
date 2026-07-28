import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import AppShell from '../../components/ui/AppShell'
import { getCupons, criarCupom, atualizarCupom, excluirCupom } from '../../services/cuponsService'

export default function CuponsPage() {
  const { profile } = useAuth()
  const { showToast } = useApp()
  const tenantId = profile?.tenant_id

  const [cupons, setCupons] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState(null)

  // Form
  const [codigo, setCodigo] = useState('')
  const [percentual, setPercentual] = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [horaInicio, setHoraInicio] = useState('')
  const [horaFim, setHoraFim] = useState('')
  const [limiteUsos, setLimiteUsos] = useState('')
  const [ativo, setAtivo] = useState(true)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    carregar()
  }, [tenantId])

  async function carregar() {
    if (!tenantId) return
    setLoading(true)
    try {
      const data = await getCupons(tenantId)
      setCupons(data)
    } catch (err) {
      showToast('Erro ao carregar cupons: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  function novoCupom() {
    setEditando(null)
    setCodigo('')
    setPercentual('')
    setDataInicio('')
    setDataFim('')
    setHoraInicio('')
    setHoraFim('')
    setLimiteUsos('')
    setAtivo(true)
    setShowForm(true)
  }

  function editarCupom(cupom) {
    setEditando(cupom)
    setCodigo(cupom.codigo)
    setPercentual(cupom.percentual)
    setDataInicio(cupom.data_inicio)
    setDataFim(cupom.data_fim)
    setHoraInicio(cupom.hora_inicio || '')
    setHoraFim(cupom.hora_fim || '')
    setLimiteUsos(cupom.limite_usos || '')
    setAtivo(cupom.ativo)
    setShowForm(true)
  }

  async function handleSalvar() {
    if (!codigo.trim()) {
      showToast('Código é obrigatório', 'error')
      return
    }
    if (!percentual || percentual <= 0 || percentual > 100) {
      showToast('Percentual deve ser entre 1 e 100', 'error')
      return
    }
    if (!dataInicio || !dataFim) {
      showToast('Preencha as datas', 'error')
      return
    }
    if (dataFim < dataInicio) {
      showToast('Data fim não pode ser menor que data início', 'error')
      return
    }

    // Validar horários
    if (dataInicio === dataFim && horaInicio && horaFim && horaFim <= horaInicio) {
      showToast('No mesmo dia, hora fim deve ser maior que hora início', 'error')
      return
    }

    setSalvando(true)
    try {
      const dados = {
        codigo: codigo.toUpperCase().trim(),
        percentual: Number(percentual),
        data_inicio: dataInicio,
        data_fim: dataFim,
        hora_inicio: horaInicio || null,
        hora_fim: horaFim || null,
        limite_usos: limiteUsos ? Number(limiteUsos) : null,
        ativo,
      }

      if (editando) {
        await atualizarCupom(editando.id, dados)
        showToast('Cupom atualizado!', 'success')
      } else {
        await criarCupom(tenantId, dados)
        showToast('Cupom criado!', 'success')
      }

      setShowForm(false)
      carregar()
    } catch (err) {
      showToast('Erro: ' + err.message, 'error')
    } finally {
      setSalvando(false)
    }
  }

  async function handleExcluir(cupom) {
    if (!confirm(`Excluir cupom ${cupom.codigo}?`)) return
    try {
      await excluirCupom(cupom.id)
      showToast('Cupom excluído!', 'success')
      carregar()
    } catch (err) {
      showToast('Erro ao excluir: ' + err.message, 'error')
    }
  }

  async function toggleAtivo(cupom) {
    try {
      await atualizarCupom(cupom.id, { ativo: !cupom.ativo })
      showToast(cupom.ativo ? 'Cupom desativado' : 'Cupom ativado', 'success')
      carregar()
    } catch (err) {
      showToast('Erro: ' + err.message, 'error')
    }
  }

  // Data e hora atual no horário de Brasília
  const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const [dataStr, horaStr] = agora.split(', ')
  const hoje = dataStr.split('/').reverse().join('-') // DD/MM/YYYY → YYYY-MM-DD
  const horaAtual = horaStr.substring(0, 5) // HH:MM (remove segundos)

  // Função para verificar se cupom está expirado (considera data + hora)
  const cupomExpirado = (cupom) => {
    if (hoje > cupom.data_fim) return true
    if (hoje < cupom.data_fim) return false
    // Se é o dia de fim, verificar horário
    if (cupom.hora_fim && horaAtual > cupom.hora_fim) return true
    return false
  }

  // Função para verificar se cupom é futuro (considera data + hora)
  const cupomFuturo = (cupom) => {
    if (hoje < cupom.data_inicio) return true
    if (hoje > cupom.data_inicio) return false
    // Se é o dia de início, verificar horário
    if (cupom.hora_inicio && horaAtual < cupom.hora_inicio) return true
    return false
  }

  return (
    <AppShell title="Cupons de Desconto">
      <div style={{ padding: 16, maxWidth: 1200, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 20, color: 'var(--text-header)' }}>
            🎟️ Cupons de Desconto
          </h2>
          <button
            onClick={novoCupom}
            className="btn-acao btn-blue"
            style={{
              padding: '8px 16px',
              fontSize: 14,
              width: 'auto',
              flex: 'none',
              minWidth: 'auto',
              whiteSpace: 'nowrap'
            }}
          >
            + Novo Cupom
          </button>
        </div>

        {/* Lista de Cupons */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
            Carregando...
          </div>
        ) : cupons.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎟️</div>
            <p>Nenhum cupom cadastrado</p>
            <button onClick={novoCupom} className="btn-acao btn-blue" style={{ marginTop: 16 }}>
              + Criar Primeiro Cupom
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {cupons.map(cupom => {
              const expirado = cupomExpirado(cupom)
              const futuro = cupomFuturo(cupom)
              const vigente = !expirado && !futuro

              return (
                <div key={cupom.id} style={{
                  background: 'var(--card-bg)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 8,
                  padding: 16,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  opacity: cupom.ativo ? 1 : 0.5,
                }}>

                  {/* Código */}
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: 20,
                      fontWeight: 700,
                      color: 'var(--blue)',
                      fontFamily: 'monospace',
                      letterSpacing: 2,
                    }}>
                      {cupom.codigo}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                      {cupom.data_inicio.split('-').reverse().join('/')}
                      {cupom.hora_inicio && ` ${cupom.hora_inicio}`}
                      {' até '}
                      {cupom.data_fim.split('-').reverse().join('/')}
                      {cupom.hora_fim && ` ${cupom.hora_fim}`}
                    </div>
                    {cupom.limite_usos && (
                      <div style={{
                        fontSize: 12,
                        color: (cupom.usos_realizados >= cupom.limite_usos) ? 'var(--red)' : 'var(--blue)',
                        marginTop: 6,
                        fontWeight: 600
                      }}>
                        {cupom.usos_realizados >= cupom.limite_usos ? '❌ ' : '🔢 '}
                        Usado {cupom.usos_realizados || 0}/{cupom.limite_usos} vezes
                      </div>
                    )}
                  </div>

                  {/* Desconto */}
                  <div style={{
                    fontSize: 24,
                    fontWeight: 800,
                    color: 'var(--green)',
                  }}>
                    {cupom.percentual}%
                  </div>

                  {/* Status */}
                  <div style={{ display: 'flex', gap: 6 }}>
                    {vigente && cupom.ativo && (
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: 12,
                        fontSize: 11,
                        fontWeight: 600,
                        background: 'rgba(129,201,149,0.15)',
                        color: 'var(--green)',
                      }}>
                        VIGENTE
                      </span>
                    )}
                    {expirado && (
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: 12,
                        fontSize: 11,
                        fontWeight: 600,
                        background: 'rgba(242,139,130,0.15)',
                        color: 'var(--red)',
                      }}>
                        EXPIRADO
                      </span>
                    )}
                    {futuro && (
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: 12,
                        fontSize: 11,
                        fontWeight: 600,
                        background: 'rgba(251,188,4,0.15)',
                        color: '#fbbc04',
                      }}>
                        FUTURO
                      </span>
                    )}
                    {!cupom.ativo && (
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: 12,
                        fontSize: 11,
                        fontWeight: 600,
                        background: 'rgba(156,163,175,0.15)',
                        color: 'var(--muted)',
                      }}>
                        INATIVO
                      </span>
                    )}
                  </div>

                  {/* Ações */}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => toggleAtivo(cupom)}
                      className="btn-acao"
                      style={{
                        padding: '6px 12px',
                        fontSize: 12,
                        background: cupom.ativo ? 'rgba(242,139,130,0.1)' : 'rgba(129,201,149,0.1)',
                        color: cupom.ativo ? 'var(--red)' : 'var(--green)',
                        border: `1px solid ${cupom.ativo ? 'var(--red)' : 'var(--green)'}`,
                      }}
                    >
                      {cupom.ativo ? 'Desativar' : 'Ativar'}
                    </button>
                    <button
                      onClick={() => editarCupom(cupom)}
                      className="btn-acao"
                      style={{ padding: '6px 12px', fontSize: 12 }}
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleExcluir(cupom)}
                      className="btn-acao"
                      style={{
                        padding: '6px 12px',
                        fontSize: 12,
                        background: 'rgba(242,139,130,0.1)',
                        color: 'var(--red)',
                        border: '1px solid var(--red)',
                      }}
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Modal Formulário */}
        {showForm && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16,
          }} onClick={e => e.target === e.currentTarget && setShowForm(false)}>
            <div style={{
              background: 'var(--card-bg)',
              border: '1px solid var(--border-light)',
              borderRadius: 12,
              padding: 24,
              width: '100%',
              maxWidth: 500,
            }}>
              <h3 style={{ margin: '0 0 20px', fontSize: 18, color: 'var(--text-header)' }}>
                {editando ? '✏️ Editar Cupom' : '➕ Novo Cupom'}
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Código */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>
                    Código do Cupom
                  </label>
                  <input
                    type="text"
                    value={codigo}
                    onChange={e => setCodigo(e.target.value.toUpperCase())}
                    placeholder="Ex: PROMO10"
                    className="cell-input"
                    style={{ width: '100%', textTransform: 'uppercase' }}
                    maxLength={20}
                  />
                </div>

                {/* Percentual */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>
                    Desconto (%)
                  </label>
                  <input
                    type="number"
                    value={percentual}
                    onChange={e => setPercentual(e.target.value)}
                    placeholder="Ex: 10"
                    className="cell-input"
                    style={{ width: '100%' }}
                    min="1"
                    max="100"
                  />
                </div>

                {/* Datas */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>
                      Data Início
                    </label>
                    <input
                      type="date"
                      value={dataInicio}
                      onChange={e => setDataInicio(e.target.value)}
                      className="cell-input"
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>
                      Data Fim
                    </label>
                    <input
                      type="date"
                      value={dataFim}
                      onChange={e => setDataFim(e.target.value)}
                      className="cell-input"
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>

                {/* Horários (Opcional) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>
                      ⏰ Hora Início (opcional)
                    </label>
                    <input
                      type="time"
                      value={horaInicio}
                      onChange={e => setHoraInicio(e.target.value)}
                      className="cell-input"
                      style={{ width: '100%' }}
                      placeholder="00:00"
                    />
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
                      Se vazio, vale desde 00:00
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>
                      ⏰ Hora Fim (opcional)
                    </label>
                    <input
                      type="time"
                      value={horaFim}
                      onChange={e => setHoraFim(e.target.value)}
                      className="cell-input"
                      style={{ width: '100%' }}
                      placeholder="23:59"
                    />
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
                      Se vazio, vale até 23:59
                    </div>
                  </div>
                </div>

                {/* Limite de Usos */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>
                    🔢 Limite de Usos (opcional)
                  </label>
                  <input
                    type="number"
                    value={limiteUsos}
                    onChange={e => setLimiteUsos(e.target.value)}
                    placeholder="Ex: 10 (vazio = ilimitado)"
                    className="cell-input"
                    style={{ width: '100%' }}
                    min="1"
                  />
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
                    Quantas vezes o cupom pode ser usado. Ex: 10 = apenas 10 clientes
                  </div>
                </div>

                {/* Ativo */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={ativo}
                    onChange={e => setAtivo(e.target.checked)}
                    id="cupom-ativo"
                  />
                  <label htmlFor="cupom-ativo" style={{ fontSize: 14, color: 'var(--text-body)', cursor: 'pointer' }}>
                    Cupom ativo
                  </label>
                </div>

                {/* Botões */}
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button
                    onClick={() => setShowForm(false)}
                    className="btn-acao"
                    style={{ flex: 1 }}
                    disabled={salvando}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSalvar}
                    className="btn-acao btn-blue"
                    style={{ flex: 1 }}
                    disabled={salvando}
                  >
                    {salvando ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </AppShell>
  )
}
