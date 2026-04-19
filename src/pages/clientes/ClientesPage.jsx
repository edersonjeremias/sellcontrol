import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import AppShell from '../../components/ui/AppShell'
import ModalConfirmacao from '../../components/ui/ModalConfirmacao'
import {
  getClientes, saveCliente, toggleBloqueio,
  deleteCliente, saveDetalhes,
} from '../../services/clientesService'

const LABEL = {
  display: 'block', color: 'var(--muted)', fontSize: '0.78rem',
  fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.3px',
}

const EMPTY_DETALHES = {
  nomeCompleto: '', cpf: '', nasc: '', cep: '',
  rua: '', num: '', comp: '', bairro: '', cidade: '', estado: '', email: '',
}

export default function ClientesPage() {
  const { profile }   = useAuth()
  const { showToast } = useApp()
  const tenantId      = profile?.tenant_id

  const [clientes,   setClientes]   = useState([])
  const [saving,     setSaving]     = useState(false)
  const [confirmacao, setConfirmacao] = useState(null)
  const [showDados,  setShowDados]  = useState(false)
  const [showDrop,   setShowDrop]   = useState(false)

  // Form fields
  const [searchVal,  setSearchVal]  = useState('')
  const [current,    setCurrent]    = useState(null) // instagram original ao editar
  const [nome,       setNome]       = useState('')
  const [whatsapp,   setWhatsapp]   = useState('')
  const [obs,        setObs]        = useState('')
  const [senha,      setSenha]      = useState('')
  const [bloqueado,  setBloqueado]  = useState(false)
  const [detalhes,   setDetalhes]   = useState(EMPTY_DETALHES)

  const searchRef = useRef(null)

  const carregarClientes = useCallback(async () => {
    if (!tenantId) return
    const { data, error } = await getClientes(tenantId)
    if (error) {
      showToast('Erro ao carregar clientes: ' + error.message, 'error')
      return
    }
    setClientes(data)
  }, [tenantId, showToast])

  useEffect(() => { carregarClientes() }, [carregarClientes])

  const filtrados = searchVal
    ? clientes.filter(c => c.instagram.toLowerCase().includes(searchVal.toLowerCase()))
    : clientes

  const selecionarCliente = useCallback((c) => {
    setCurrent(c.instagram)
    setNome(c.instagram)
    setWhatsapp(c.whatsapp || '')
    setObs(c.msg_bloqueio || '')
    setSenha(c.senha || '')
    setBloqueado(!!c.bloqueado)
    setDetalhes(c.detalhes && typeof c.detalhes === 'object' ? { ...EMPTY_DETALHES, ...c.detalhes } : EMPTY_DETALHES)
    setSearchVal(c.instagram)
    setShowDrop(false)
  }, [])

  const resetForm = useCallback(() => {
    setCurrent(null)
    setNome(''); setWhatsapp(''); setObs(''); setSenha('')
    setBloqueado(false); setDetalhes(EMPTY_DETALHES)
    setSearchVal(''); setShowDrop(false)
    setTimeout(() => document.getElementById('cli-nome')?.focus(), 50)
  }, [])

  const handleSalvar = async () => {
    if (!nome.trim()) { showToast('Nome/Instagram obrigatório!', 'error'); return }
    setSaving(true)
    try {
      const { error } = await saveCliente(tenantId, {
        instagram: nome.trim(),
        whatsapp: whatsapp.replace(/\D/g, ''),
        msg_bloqueio: obs,
        senha,
        oldInstagram: current,
      })
      if (error) throw error
      showToast(current ? 'Atualizado com sucesso!' : 'Cadastrado com sucesso!', 'success')
      await carregarClientes()
      resetForm()
    } catch (e) {
      showToast('Erro: ' + (e.message || String(e)), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleBloqueio = async (bloquear) => {
    if (!current) return
    setSaving(true)
    try {
      const { error } = await toggleBloqueio(tenantId, current, bloquear)
      if (error) throw error
      setBloqueado(bloquear)
      // Atualiza lista local sem recarregar
      setClientes(prev => prev.map(c =>
        c.instagram === current ? { ...c, bloqueado: bloquear } : c
      ))
      showToast(bloquear ? 'Cliente BLOQUEADO!' : 'Cliente LIBERADO!', bloquear ? 'error' : 'success')
    } catch (e) {
      showToast('Erro: ' + e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleExcluir = () => {
    if (!current) return
    setConfirmacao({
      titulo: 'Excluir Cliente',
      mensagem: `Confirma a exclusão de <b style="color:var(--red)">${current}</b>?<br>Esta ação não pode ser desfeita.`,
      onSim: async () => {
        setConfirmacao(null)
        const { error } = await deleteCliente(tenantId, current)
        if (error) { showToast('Erro ao excluir: ' + error.message, 'error'); return }
        showToast('Excluído com sucesso!', 'success')
        setClientes(prev => prev.filter(c => c.instagram !== current))
        resetForm()
      },
      onNao: () => setConfirmacao(null),
    })
  }

  const handleSalvarDetalhes = async () => {
    if (!current) return
    if (detalhes.email && !detalhes.email.includes('@')) {
      showToast('E-mail inválido.', 'error'); return
    }
    setSaving(true)
    try {
      const { error } = await saveDetalhes(tenantId, current, detalhes)
      if (error) throw error
      showToast('Dados salvos!', 'success')
      setShowDados(false)
      await carregarClientes()
    } catch (e) {
      showToast('Erro: ' + e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const enviarWhatsApp = () => {
    let phone = whatsapp.replace(/\D/g, '')
    if (!phone) { showToast('Preencha o WhatsApp!', 'error'); return }
    if (!phone.startsWith('55')) phone = '55' + phone
    window.open(`https://api.whatsapp.com/send?phone=${phone}`, '_blank')
  }

  const buscarCep = async () => {
    const cep = (detalhes.cep || '').replace(/\D/g, '')
    if (cep.length !== 8) return
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
      const d = await r.json()
      if (!d.erro) {
        setDetalhes(p => ({ ...p, rua: d.logradouro, bairro: d.bairro, cidade: d.localidade, estado: d.uf }))
        showToast('CEP preenchido!', 'success')
      } else {
        showToast('CEP não encontrado.', 'error')
      }
    } catch { showToast('Erro ao buscar CEP.', 'error') }
  }

  const mascaraCpf = (val) => {
    let v = val.replace(/\D/g, '').slice(0, 11)
    v = v.replace(/(\d{3})(\d)/, '$1.$2')
    v = v.replace(/(\d{3})(\d)/, '$1.$2')
    v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2')
    return v
  }

  const isEditing = !!current

  return (
    <AppShell title="Clientes">
      <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 16px' }}>
        <div style={{
          width: '100%', maxWidth: 560,
          background: 'var(--card-bg)', borderRadius: 12,
          border: '1px solid var(--border-light)',
          display: 'flex', flexDirection: 'column',
          boxShadow: 'var(--shadow)',
        }}>

          {/* ── Header ── */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '14px 20px', borderBottom: '1px solid var(--border-light)',
            background: 'var(--header-bg)', borderRadius: '12px 12px 0 0',
          }}>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-header)' }}>
              Cadastro de Cliente
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {isEditing && (
                <span style={{
                  fontSize: '0.7rem', fontWeight: 700, padding: '3px 10px',
                  borderRadius: 4, textTransform: 'uppercase',
                  color: bloqueado ? 'var(--red)' : 'var(--green)',
                  border: `1px solid ${bloqueado ? 'var(--red)' : 'var(--green)'}`,
                  background: bloqueado ? 'rgba(242,139,130,0.1)' : 'rgba(129,201,149,0.1)',
                }}>
                  {bloqueado ? 'BLOQUEADO' : 'ATIVO'}
                </span>
              )}
              <button onClick={resetForm} style={{
                background: 'var(--btn-cancel-bg)', color: 'var(--btn-cancel-text)',
                border: 'none', borderRadius: 6, cursor: 'pointer',
                fontWeight: 600, fontSize: '0.78rem', padding: '0 12px', height: 30,
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                + Novo
              </button>
            </div>
          </div>

          {/* ── Conteúdo ── */}
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Busca */}
            <div style={{ position: 'relative' }}>
              <label style={LABEL}>Buscar / Selecionar Cliente</label>
              <input
                ref={searchRef}
                value={searchVal}
                onChange={e => { setSearchVal(e.target.value); setShowDrop(true) }}
                onFocus={() => setShowDrop(true)}
                onBlur={() => setTimeout(() => setShowDrop(false), 150)}
                placeholder="Digite para buscar..."
                autoComplete="off"
                className="cell-input"
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
              {showDrop && filtrados.length > 0 && (
                <ul className="autocomplete-list" style={{ top: 'calc(100% + 4px)', zIndex: 200 }}>
                  {filtrados.map(c => (
                    <li key={c.instagram}
                      onMouseDown={() => selecionarCliente(c)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border-light)', color: 'var(--text-body)', fontSize: 14 }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--table-row-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}
                    >
                      {c.instagram}
                      {c.bloqueado && (
                        <span style={{
                          fontSize: '0.6rem', background: 'var(--red)', color: '#171717',
                          padding: '2px 6px', borderRadius: 4, fontWeight: 700,
                        }}>BLOQ</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div style={{ borderTop: '1px solid var(--border-light)' }} />

            {/* Nome + WhatsApp */}
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={LABEL}>Nome / Instagram</label>
                <input
                  id="cli-nome"
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  placeholder="Ex: maria_loja"
                  className="cell-input"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={LABEL}>WhatsApp</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    value={whatsapp}
                    onChange={e => setWhatsapp(e.target.value.replace(/\D/g, ''))}
                    placeholder="11999999999"
                    className="cell-input"
                    style={{ flex: 1, minWidth: 0 }}
                  />
                  <button
                    onClick={enviarWhatsApp}
                    title="Abrir WhatsApp"
                    style={{
                      background: 'transparent', border: '1px solid var(--border-light)',
                      borderRadius: 6, cursor: 'pointer', color: '#25D366',
                      width: 36, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.2s',
                    }}
                  >
                    <span className="material-icons" style={{ fontSize: 18 }}>chat</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Obs + Senha */}
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={LABEL}>Observação</label>
                <textarea
                  value={obs}
                  onChange={e => setObs(e.target.value)}
                  placeholder="Detalhes sobre o cliente..."
                  className="cell-input"
                  style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 38 }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={LABEL}>Senha do Painel</label>
                <input
                  value={senha}
                  onChange={e => setSenha(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSalvar() }}
                  placeholder="Senha do cliente"
                  className="cell-input"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </div>
            </div>
          </div>

          {/* ── Footer / Botões ── */}
          <div style={{
            padding: '14px 20px', borderTop: '1px solid var(--border-light)',
            display: 'flex', gap: 8,
          }}>
            <button onClick={handleSalvar} disabled={saving} className="btn-acao btn-blue" style={{ flex: 2 }}>
              <span className="material-icons" style={{ fontSize: 18 }}>save</span>
              SALVAR
            </button>
            {isEditing && (
              <>
                <button
                  onClick={() => setShowDados(true)}
                  className="btn-acao"
                  style={{ flex: 1, background: 'transparent', border: '1px solid var(--blue)', color: 'var(--blue)' }}
                >
                  <span className="material-icons" style={{ fontSize: 18 }}>edit_document</span>
                  DADOS
                </button>
                {bloqueado
                  ? (
                    <button onClick={() => handleToggleBloqueio(false)} disabled={saving} className="btn-acao btn-green" style={{ flex: 1 }}>
                      <span className="material-icons" style={{ fontSize: 18 }}>check</span>
                      LIBERAR
                    </button>
                  ) : (
                    <button onClick={() => handleToggleBloqueio(true)} disabled={saving} className="btn-acao" style={{ flex: 1, background: '#fbbc04', color: '#171717' }}>
                      <span className="material-icons" style={{ fontSize: 18 }}>block</span>
                      BLOQ
                    </button>
                  )
                }
                <button onClick={handleExcluir} disabled={saving} className="btn-acao" style={{ flex: 1, background: 'rgba(242,139,130,0.1)', border: '1px solid var(--red)', color: 'var(--red)' }}>
                  <span className="material-icons" style={{ fontSize: 18 }}>delete</span>
                  EXCLUIR
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Modal DADOS ── */}
      {showDados && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9000 }}
          onClick={e => e.target === e.currentTarget && setShowDados(false)}
        >
          <div style={{
            background: 'var(--card-bg)', borderRadius: 12, border: '1px solid var(--border-light)',
            width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto',
            padding: 20, margin: '0 16px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: 12, marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-header)', fontWeight: 700 }}>Dados para Envio</h3>
              <button onClick={() => setShowDados(false)} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 4 }}>
                <span className="material-icons">close</span>
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input value={nome} readOnly className="cell-input" placeholder="Instagram" style={{ opacity: 0.6, cursor: 'not-allowed' }} />
              <input
                value={detalhes.nomeCompleto}
                onChange={e => setDetalhes(p => ({ ...p, nomeCompleto: e.target.value }))}
                placeholder="Nome Completo"
                className="cell-input"
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={detalhes.cpf}
                  onChange={e => setDetalhes(p => ({ ...p, cpf: mascaraCpf(e.target.value) }))}
                  placeholder="CPF"
                  className="cell-input"
                  style={{ flex: 1 }}
                  maxLength={14}
                />
                <input
                  type="date"
                  value={detalhes.nasc}
                  onChange={e => setDetalhes(p => ({ ...p, nasc: e.target.value }))}
                  className="cell-input"
                  style={{ flex: 1 }}
                  title="Data de Nascimento"
                />
              </div>
              <input
                value={detalhes.cep}
                onChange={e => setDetalhes(p => ({ ...p, cep: e.target.value }))}
                onBlur={buscarCep}
                placeholder="CEP (busca automática)"
                className="cell-input"
              />
              <input
                value={detalhes.rua}
                onChange={e => setDetalhes(p => ({ ...p, rua: e.target.value }))}
                placeholder="Rua"
                className="cell-input"
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={detalhes.num}
                  onChange={e => setDetalhes(p => ({ ...p, num: e.target.value }))}
                  placeholder="Número"
                  className="cell-input"
                  style={{ flex: 1 }}
                />
                <input
                  value={detalhes.comp}
                  onChange={e => setDetalhes(p => ({ ...p, comp: e.target.value }))}
                  placeholder="Complemento"
                  className="cell-input"
                  style={{ flex: 1 }}
                />
              </div>
              <input
                value={detalhes.bairro}
                onChange={e => setDetalhes(p => ({ ...p, bairro: e.target.value }))}
                placeholder="Bairro"
                className="cell-input"
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={detalhes.cidade}
                  onChange={e => setDetalhes(p => ({ ...p, cidade: e.target.value }))}
                  placeholder="Cidade"
                  className="cell-input"
                  style={{ flex: 1 }}
                />
                <input
                  value={detalhes.estado}
                  onChange={e => setDetalhes(p => ({ ...p, estado: e.target.value.toUpperCase().slice(0, 2) }))}
                  placeholder="UF"
                  className="cell-input"
                  style={{ maxWidth: 70 }}
                  maxLength={2}
                />
              </div>
              <input
                type="email"
                value={detalhes.email}
                onChange={e => setDetalhes(p => ({ ...p, email: e.target.value.toLowerCase().replace(/\s/g, '') }))}
                placeholder="E-mail"
                className="cell-input"
              />
              <button onClick={handleSalvarDetalhes} disabled={saving} className="btn-acao btn-blue" style={{ marginTop: 8 }}>
                Salvar Alterações
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirmação ── */}
      {confirmacao && (
        <ModalConfirmacao
          titulo={confirmacao.titulo}
          mensagem={confirmacao.mensagem}
          onSim={confirmacao.onSim}
          onNao={confirmacao.onNao}
        />
      )}
    </AppShell>
  )
}
