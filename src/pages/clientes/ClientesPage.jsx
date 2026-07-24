import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import AppShell from '../../components/ui/AppShell'
import ModalConfirmacao from '../../components/ui/ModalConfirmacao'
import {
  getClientes, saveCliente, toggleBloqueio,
  deleteCliente, saveDetalhes, searchClientes,
  searchClientesAvancada,
} from '../../services/clientesService'
import { supabase } from '../../lib/supabase'

const LABEL = {
  display: 'block', color: 'var(--muted)', fontSize: '0.78rem',
  fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.3px',
}

const EMPTY_DETALHES = {
  nomeCompleto: '', cpf: '', nasc: '', cep: '',
  rua: '', num: '', comp: '', bairro: '', cidade: '', estado: '', email: '',
}

function TabBtn({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      background: 'none', border: 'none', cursor: 'pointer',
      padding: '10px 18px', fontSize: 14, fontWeight: 600,
      color: active ? 'var(--blue)' : 'var(--muted)',
      borderBottom: active ? '2px solid var(--blue)' : '2px solid transparent',
      transition: 'all 0.15s',
    }}>
      {label}
    </button>
  )
}

export default function ClientesPage() {
  const { profile }   = useAuth()
  const { showToast } = useApp()
  const tenantId      = profile?.tenant_id

  const [aba,           setAba]           = useState('cadastro')
  const [clientes,      setClientes]      = useState([])
  const [saving,        setSaving]        = useState(false)
  const [confirmacao,   setConfirmacao]   = useState(null)
  const [showDados,     setShowDados]     = useState(false)
  const [showDrop,      setShowDrop]      = useState(false)
  const [needsMigration, setNeedsMigration] = useState(false)
  const [searchResults, setSearchResults] = useState([])
  const [searching,     setSearching]     = useState(false)
  const [activeIdx,     setActiveIdx]     = useState(-1)

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
    // Detecta se colunas individuais existem (migração necessária)
    const sample = data[0]
    const migrado = !sample || 'nome_completo' in sample
    setNeedsMigration(!migrado)
    setClientes(data)
  }, [tenantId, showToast])

  useEffect(() => { carregarClientes() }, [carregarClientes])

  // Busca sob demanda
  useEffect(() => {
    const trimmed = searchVal?.trim()
    if (!trimmed || trimmed.length < 2) {
      setSearchResults([])
      return
    }

    const timeoutId = setTimeout(async () => {
      setSearching(true)
      try {
        const { data, error } = await searchClientes(tenantId, trimmed, 20)
        if (!error && data) {
          setSearchResults(data)
        }
      } catch (err) {
        console.error('Erro ao buscar clientes:', err)
      } finally {
        setSearching(false)
      }
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [searchVal, tenantId])

  const filtrados = searchResults

  const selecionarCliente = useCallback((c) => {
    setCurrent(c.instagram)
    setNome(c.instagram)
    setWhatsapp(c.whatsapp || '')
    setObs(c.msg_bloqueio || '')
    setSenha(c.senha || '')
    setBloqueado(!!c.bloqueado)
    // Lê das colunas individuais (migração nova) ou do jsonb legado
    const d = c.detalhes && typeof c.detalhes === 'object' ? c.detalhes : {}
    setDetalhes({
      nomeCompleto: c.nome_completo   || d.nomeCompleto || '',
      cpf:          c.cpf             || d.cpf          || '',
      nasc:         c.data_nascimento || d.nasc         || '',
      cep:          c.cep             || d.cep          || '',
      rua:          c.rua             || d.rua          || '',
      num:          c.numero          || d.num          || '',
      comp:         c.complemento     || d.comp         || '',
      bairro:       c.bairro          || d.bairro       || '',
      cidade:       c.cidade          || d.cidade       || '',
      estado:       c.uf              || d.estado       || '',
      email:        c.email           || d.email        || '',
    })
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
      // NÃO limpar form - mantém campos para permitir múltiplas edições
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

  const enviarAcessoPortal = async () => {
    const phone = whatsapp.replace(/\D/g, '')
    if (!phone) { showToast('Preencha o WhatsApp do cliente!', 'error'); return }
    if (!nome.trim()) { showToast('Selecione um cliente!', 'error'); return }

    setPortalBtnLoading(true)
    try {
      const res = await fetch('/api/portal-cliente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instagram:     nome,
          whatsapp:      phone,
          nome_completo: detalhes.nomeCompleto || '',
        }),
      })
      const json = await res.json()

      if (!res.ok) {
        if (json.tableMissing) {
          setNeedsPortalSetup(true)
          showToast('Tabelas do portal não criadas. Clique em "Configurar Portal" abaixo.', 'error')
        } else {
          showToast('Erro: ' + (json.error || 'Falhou'), 'error')
        }
        return
      }

      // Buscar slug e nome da empresa
      const { data: config } = await supabase
        .from('configuracoes')
        .select('slug, nome_loja')
        .eq('tenant_id', tenantId)
        .single()

      const slug = config?.slug || ''
      const nomeEmpresa = config?.nome_loja || 'nossa loja'

      // Sucesso — abre WhatsApp com mensagem
      const primeiroNome = (detalhes.nomeCompleto || nome).split(' ')[0]
      const login        = json.login
      const senha        = json.senha
      const urlPortal    = slug
        ? `${window.location.origin}/portal/${slug}`
        : `${window.location.origin}/portal`
      let   phoneWa      = phone
      if (!phoneWa.startsWith('55')) phoneWa = '55' + phoneWa

      const msg =
`Olá, ${primeiroNome}! Tudo bem?

Segue o link exclusivo para acessar a sua Sacolinha Virtual e o seu Painel de Cliente da ${nomeEmpresa}:

🔗 Acesso: ${urlPortal}
👤 Login: ${login}
🔑 Senha: ${senha}

Lá você pode completar o seu cadastro, visualizar as peças que já estão garantidas na sua sacolinha, acompanhar as entregas, verificar pagamentos em aberto e, claro, encerrar a sua sacolinha quando quiser receber suas peças!

Lembrando que você pode alterar sua senha a qualquer momento diretamente no seu painel.

Qualquer dúvida, estamos à disposição! 😊`

      window.open(
        `https://api.whatsapp.com/send?phone=${phoneWa}&text=${encodeURIComponent(msg)}`,
        '_blank',
      )
      showToast('Conta criada e WhatsApp aberto!', 'success')
    } catch (e) {
      showToast('Erro de rede: ' + e.message, 'error')
    } finally {
      setPortalBtnLoading(false)
    }
  }

  const executarPortalMigracao = async () => {
    setPortalMigrating(true)
    try {
      const r = await fetch('/api/portal-migrar?secret=vmkids-migrate-2026')
      const json = await r.json()
      if (json.success) {
        showToast('Portal configurado! Tente enviar o acesso novamente.', 'success')
        setNeedsPortalSetup(false)
      } else {
        showToast('Erro: ' + (json.error || 'Falhou'), 'error')
        if (json.instrucoes) showToast(json.instrucoes, 'error')
      }
    } catch (e) {
      showToast('Erro de rede: ' + e.message, 'error')
    } finally {
      setPortalMigrating(false)
    }
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

  const SQL_MIGRATION = `ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS whatsapp        text DEFAULT '',
  ADD COLUMN IF NOT EXISTS senha           text DEFAULT '',
  ADD COLUMN IF NOT EXISTS nome_completo   text DEFAULT '',
  ADD COLUMN IF NOT EXISTS cpf             text DEFAULT '',
  ADD COLUMN IF NOT EXISTS data_nascimento text DEFAULT '',
  ADD COLUMN IF NOT EXISTS cep             text DEFAULT '',
  ADD COLUMN IF NOT EXISTS rua             text DEFAULT '',
  ADD COLUMN IF NOT EXISTS numero          text DEFAULT '',
  ADD COLUMN IF NOT EXISTS complemento     text DEFAULT '',
  ADD COLUMN IF NOT EXISTS bairro          text DEFAULT '',
  ADD COLUMN IF NOT EXISTS cidade          text DEFAULT '',
  ADD COLUMN IF NOT EXISTS uf              text DEFAULT '',
  ADD COLUMN IF NOT EXISTS email           text DEFAULT '';`

  const [migrating,        setMigrating]        = useState(false)
  const [sqlCopied,        setSqlCopied]        = useState(false)
  const [portalBtnLoading, setPortalBtnLoading] = useState(false)
  const [needsPortalSetup, setNeedsPortalSetup] = useState(false)
  const [portalMigrating,  setPortalMigrating]  = useState(false)

  const copiarSQL = () => {
    navigator.clipboard.writeText(SQL_MIGRATION).then(() => {
      setSqlCopied(true)
      setTimeout(() => setSqlCopied(false), 2500)
    })
  }

  const executarMigracao = async () => {
    setMigrating(true)
    try {
      const r = await fetch('/api/run-migration?secret=vmkids-migrate-2026')
      const json = await r.json()
      if (json.success) {
        showToast('Migração concluída! Recarregando...', 'success')
        setTimeout(() => window.location.reload(), 1500)
      } else {
        showToast('Erro: ' + (json.error || 'Falhou'), 'error')
      }
    } catch (e) {
      showToast('Erro de rede: ' + e.message, 'error')
    } finally {
      setMigrating(false)
    }
  }

  return (
    <AppShell title="Clientes">

      {/* Abas */}
      <div style={{ borderBottom: '1px solid var(--border-header)', marginBottom: 16, paddingLeft: 16 }}>
        <TabBtn label="Cadastro"       active={aba === 'cadastro'} onClick={() => setAba('cadastro')} />
        <TabBtn label="Busca Avançada" active={aba === 'busca'}    onClick={() => setAba('busca')} />
      </div>

      {/* Aba Cadastro */}
      {aba === 'cadastro' && (
        <>
      {/* Banner de migração pendente */}
      {needsMigration && (
        <div style={{
          background: 'rgba(251,188,4,0.12)', border: '1px solid rgba(251,188,4,0.5)',
          borderRadius: 8, padding: '14px 18px', margin: '0 16px 16px',
          maxWidth: 760, marginLeft: 'auto', marginRight: 'auto',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#fbbc04', fontWeight: 700, fontSize: '0.95rem' }}>
            <span className="material-icons" style={{ fontSize: 20 }}>warning</span>
            Migração pendente — colunas whatsapp, senha e detalhes ausentes na tabela clientes
          </div>

          {/* Opção 1: botão automático */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={executarMigracao}
              disabled={migrating}
              style={{
                background: '#fbbc04', color: '#171717', border: 'none', borderRadius: 6,
                padding: '8px 16px', fontWeight: 700, cursor: 'pointer', display: 'flex',
                alignItems: 'center', gap: 6, fontSize: '0.88rem',
              }}
            >
              <span className="material-icons" style={{ fontSize: 16 }}>bolt</span>
              {migrating ? 'Executando...' : 'Executar Migração Automática'}
            </button>
            <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>
              (requer SUPABASE_DB_URL no Vercel)
            </span>
          </div>

          {/* Opção 2: manual */}
          <div style={{ borderTop: '1px solid rgba(251,188,4,0.3)', paddingTop: 10 }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: 6 }}>
              Ou cole manualmente no <b>Supabase → SQL Editor → New query → Run:</b>
            </div>
            <div style={{ position: 'relative' }}>
              <div style={{
                background: 'var(--input-bg)', borderRadius: 6, padding: '10px 14px',
                fontFamily: 'monospace', fontSize: '0.82rem', color: 'var(--text-body)',
                whiteSpace: 'pre', overflowX: 'auto', border: '1px solid var(--border-light)',
              }}>
                {SQL_MIGRATION}
              </div>
              <button
                onClick={copiarSQL}
                style={{
                  position: 'absolute', top: 8, right: 8,
                  background: sqlCopied ? 'var(--green)' : 'var(--btn-cancel-bg)',
                  color: sqlCopied ? '#171717' : 'var(--text-body)',
                  border: 'none', borderRadius: 4, padding: '4px 10px',
                  fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.2s',
                }}
              >
                <span className="material-icons" style={{ fontSize: 14 }}>
                  {sqlCopied ? 'check' : 'content_copy'}
                </span>
                {sqlCopied ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Banner: configurar portal */}
      {needsPortalSetup && (
        <div style={{
          background: 'rgba(138,180,248,0.08)', border: '1px solid rgba(138,180,248,0.35)',
          borderRadius: 8, padding: '14px 18px', margin: '0 16px 16px',
          maxWidth: 760, marginLeft: 'auto', marginRight: 'auto',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, color:'var(--blue)', fontWeight:700, fontSize:'0.95rem' }}>
            <span className="material-icons" style={{ fontSize:20 }}>cloud_off</span>
            Tabelas do Portal do Cliente não encontradas
          </div>
          <div style={{ color:'var(--muted)', fontSize:'0.85rem' }}>
            Clique no botão abaixo para criar as tabelas automaticamente. Requer <b>SUPABASE_DB_URL</b> nas variáveis de ambiente do Vercel.
          </div>
          <button
            onClick={executarPortalMigracao}
            disabled={portalMigrating}
            style={{
              background: 'rgba(138,180,248,.18)', color: 'var(--blue)',
              border: '1px solid rgba(138,180,248,.35)', borderRadius: 6,
              padding: '8px 16px', fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.88rem',
              width: 'fit-content',
            }}
          >
            <span className="material-icons" style={{ fontSize:16 }}>settings</span>
            {portalMigrating ? 'Configurando...' : 'Configurar Portal Agora'}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', padding: '0 16px 20px' }}>
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
                onChange={e => { setSearchVal(e.target.value); setShowDrop(true); setActiveIdx(-1) }}
                onFocus={() => setShowDrop(true)}
                onBlur={() => setTimeout(() => setShowDrop(false), 150)}
                onKeyDown={e => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setActiveIdx(i => (i + 1) >= filtrados.length ? 0 : i + 1)
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setActiveIdx(i => (i - 1) < 0 ? filtrados.length - 1 : i - 1)
                  } else if (e.key === 'Enter') {
                    e.preventDefault()
                    if (activeIdx >= 0 && filtrados[activeIdx]) {
                      selecionarCliente(filtrados[activeIdx])
                      setShowDrop(false)
                    }
                  } else if (e.key === 'Escape') {
                    setShowDrop(false)
                    setActiveIdx(-1)
                  }
                }}
                placeholder="Digite para buscar..."
                autoComplete="off"
                className="cell-input"
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
              {showDrop && filtrados.length > 0 && (
                <ul className="autocomplete-list" style={{ top: 'calc(100% + 4px)', zIndex: 200 }}>
                  {filtrados.map((c, idx) => (
                    <li key={c.instagram}
                      className={idx === activeIdx ? 'dropdown-item-active' : ''}
                      onMouseDown={() => selecionarCliente(c)}
                      onMouseEnter={() => setActiveIdx(idx)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border-light)', color: idx === activeIdx ? '#171717' : 'var(--text-body)', fontSize: 14, background: idx === activeIdx ? 'var(--blue)' : '' }}
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
                  <button
                    onClick={enviarAcessoPortal}
                    disabled={portalBtnLoading}
                    title="Criar conta no portal e enviar acesso por WhatsApp"
                    style={{
                      background: portalBtnLoading ? 'rgba(138,180,248,.15)' : 'transparent',
                      border: '1px solid var(--border-light)',
                      borderRadius: 6, cursor: portalBtnLoading ? 'wait' : 'pointer',
                      color: 'var(--blue)',
                      width: 36, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.2s',
                    }}
                  >
                    <span className="material-icons" style={{ fontSize: 18 }}>
                      {portalBtnLoading ? 'sync' : 'key'}
                    </span>
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
            display: 'flex', flexWrap: 'wrap', gap: 8,
          }}>
            <button onClick={handleSalvar} disabled={saving} className="btn-acao btn-blue" style={{ flex: '2 1 120px', minWidth: 0 }}>
              <span className="material-icons" style={{ fontSize: 16 }}>save</span>
              SALVAR
            </button>
            {isEditing && (
              <>
                <button
                  onClick={() => setShowDados(true)}
                  className="btn-acao"
                  style={{ flex: '1 1 80px', minWidth: 0, background: 'transparent', border: '1px solid var(--blue)', color: 'var(--blue)' }}
                >
                  <span className="material-icons" style={{ fontSize: 16 }}>edit_document</span>
                  DADOS
                </button>
                {bloqueado
                  ? (
                    <button onClick={() => handleToggleBloqueio(false)} disabled={saving} className="btn-acao btn-green" style={{ flex: '1 1 80px', minWidth: 0 }}>
                      <span className="material-icons" style={{ fontSize: 16 }}>check</span>
                      LIBERAR
                    </button>
                  ) : (
                    <button onClick={() => handleToggleBloqueio(true)} disabled={saving} className="btn-acao" style={{ flex: '1 1 80px', minWidth: 0, background: '#fbbc04', color: '#171717' }}>
                      <span className="material-icons" style={{ fontSize: 16 }}>block</span>
                      BLOQ
                    </button>
                  )
                }
                <button onClick={handleExcluir} disabled={saving} className="btn-acao" style={{ flex: '1 1 80px', minWidth: 0, background: 'rgba(242,139,130,0.1)', border: '1px solid var(--red)', color: 'var(--red)' }}>
                  <span className="material-icons" style={{ fontSize: 16 }}>delete</span>
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
        </>
      )}

      {/* Aba Busca Avançada */}
      {aba === 'busca' && <AbaBuscaAvancada clientes={clientes} tenantId={tenantId} />}

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

// ── Aba: Busca Avançada ─────────────────────────────────────────
function AbaBuscaAvancada({ clientes, tenantId }) {
  const [filtros, setFiltros] = useState({
    instagram: '',
    nome: '',
    whatsapp: '',
    cpf: '',
    cep: '',
    cidade: '',
    estado: '',
    email: '',
    bloqueado: 'todos', // 'todos' | 'sim' | 'nao'
  })
  const [resultados, setResultados] = useState([])
  const [buscando, setBuscando] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const tableRef = useRef(null)

  const updateFiltro = (campo, valor) => {
    setFiltros(prev => ({ ...prev, [campo]: valor }))
    setActiveIdx(-1) // Reset índice ao mudar filtro
  }

  // Busca sob demanda quando filtros mudam
  useEffect(() => {
    // Verifica se há algum filtro ativo
    const algumFiltro = Object.entries(filtros).some(([key, val]) =>
      key !== 'bloqueado' ? val.trim() !== '' : val !== 'todos'
    )

    if (!algumFiltro) {
      setResultados([])
      return
    }

    const timeoutId = setTimeout(async () => {
      setBuscando(true)
      try {
        const { data, error } = await searchClientesAvancada(tenantId, filtros, 200)
        if (!error && data) {
          setResultados(data)
        }
      } catch (err) {
        console.error('Erro ao buscar clientes:', err)
      } finally {
        setBuscando(false)
      }
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [filtros, tenantId])

  // Scroll automático para item ativo
  useEffect(() => {
    if (activeIdx >= 0 && tableRef.current) {
      const rows = tableRef.current.querySelectorAll('tbody tr')
      rows[activeIdx]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [activeIdx])

  const limparFiltros = () => {
    setFiltros({
      instagram: '', nome: '', whatsapp: '', cpf: '',
      cep: '', cidade: '', estado: '', email: '', bloqueado: 'todos',
    })
    setResultados([])
    setActiveIdx(-1)
  }

  const totalFiltrosAtivos = Object.entries(filtros).filter(([key, val]) =>
    key !== 'bloqueado' ? val.trim() !== '' : val !== 'todos'
  ).length

  const handleKeyDown = (e) => {
    if (resultados.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => (i + 1) >= resultados.length ? 0 : i + 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => (i - 1) < 0 ? resultados.length - 1 : i - 1)
    }
  }

  return (
    <div
      style={{ padding: '0 16px 16px', maxWidth: 1100, margin: '0 auto' }}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >

      {/* Filtros */}
      <div style={{
        background: 'var(--card-bg)', border: '1px solid var(--border-light)',
        borderRadius: 8, padding: 14, marginBottom: 14
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-body)' }}>
            🔍 Filtros {totalFiltrosAtivos > 0 && `(${totalFiltrosAtivos})`}
          </h3>
          {totalFiltrosAtivos > 0 && (
            <button
              onClick={limparFiltros}
              style={{
                background: 'none', border: 'none', color: 'var(--red)',
                cursor: 'pointer', fontSize: 12, textDecoration: 'underline'
              }}>
              Limpar
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>

          <div>
            <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>
              Instagram
            </label>
            <input
              value={filtros.instagram}
              onChange={e => updateFiltro('instagram', e.target.value)}
              placeholder="@cliente"
              className="cell-input"
              style={{ fontSize: 13, padding: '7px 10px' }}
            />
          </div>

          <div>
            <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>
              Nome Completo
            </label>
            <input
              value={filtros.nome}
              onChange={e => updateFiltro('nome', e.target.value)}
              placeholder="Nome do cliente"
              className="cell-input"
              style={{ fontSize: 13, padding: '7px 10px' }}
            />
          </div>

          <div>
            <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>
              WhatsApp
            </label>
            <input
              value={filtros.whatsapp}
              onChange={e => updateFiltro('whatsapp', e.target.value)}
              placeholder="(00) 90000-0000"
              className="cell-input"
              style={{ fontSize: 13, padding: '7px 10px' }}
            />
          </div>

          <div>
            <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>
              CPF
            </label>
            <input
              value={filtros.cpf}
              onChange={e => updateFiltro('cpf', e.target.value)}
              placeholder="000.000.000-00"
              className="cell-input"
              style={{ fontSize: 13, padding: '7px 10px' }}
            />
          </div>

          <div>
            <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>
              CEP
            </label>
            <input
              value={filtros.cep}
              onChange={e => updateFiltro('cep', e.target.value)}
              placeholder="00000-000"
              className="cell-input"
              style={{ fontSize: 13, padding: '7px 10px' }}
            />
          </div>

          <div>
            <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>
              Cidade
            </label>
            <input
              value={filtros.cidade}
              onChange={e => updateFiltro('cidade', e.target.value)}
              placeholder="São Paulo"
              className="cell-input"
              style={{ fontSize: 13, padding: '7px 10px' }}
            />
          </div>

          <div>
            <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>
              Estado
            </label>
            <input
              value={filtros.estado}
              onChange={e => updateFiltro('estado', e.target.value.toUpperCase().slice(0, 2))}
              placeholder="SP"
              className="cell-input"
              maxLength={2}
              style={{ fontSize: 13, padding: '7px 10px' }}
            />
          </div>

          <div>
            <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>
              E-mail
            </label>
            <input
              value={filtros.email}
              onChange={e => updateFiltro('email', e.target.value)}
              placeholder="email@exemplo.com"
              className="cell-input"
              style={{ fontSize: 13, padding: '7px 10px' }}
            />
          </div>

          <div>
            <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>
              Bloqueado
            </label>
            <select
              value={filtros.bloqueado}
              onChange={e => updateFiltro('bloqueado', e.target.value)}
              className="cell-input"
              style={{ cursor: 'pointer', fontSize: 13, padding: '7px 10px' }}>
              <option value="todos">Todos</option>
              <option value="sim">Sim</option>
              <option value="nao">Não</option>
            </select>
          </div>

        </div>
      </div>

      {/* Resultados */}
      <div style={{
        background: 'var(--card-bg)', border: '1px solid var(--border-light)',
        borderRadius: 8, overflow: 'hidden'
      }}>
        <div style={{
          padding: '10px 14px', borderBottom: '1px solid var(--border-light)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-body)' }}>
            📋 Resultados {buscando && <span style={{ fontSize: 11, color: 'var(--muted)' }}>(Buscando...)</span>}
          </h3>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {resultados.length} cliente{resultados.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div style={{ maxHeight: 'calc(100vh - 340px)', overflowY: 'auto' }}>
          {totalFiltrosAtivos === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
              Preencha ao menos um filtro para buscar
            </div>
          ) : resultados.length === 0 && !buscando ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
              Nenhum cliente encontrado com os filtros aplicados.
            </div>
          ) : (
            <table ref={tableRef} style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--table-header-bg)', zIndex: 1 }}>
                <tr>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--muted)', fontWeight: 600, borderBottom: '1px solid var(--border-light)', fontSize: 11 }}>Instagram</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--muted)', fontWeight: 600, borderBottom: '1px solid var(--border-light)', fontSize: 11 }}>Nome</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--muted)', fontWeight: 600, borderBottom: '1px solid var(--border-light)', fontSize: 11 }}>WhatsApp</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--muted)', fontWeight: 600, borderBottom: '1px solid var(--border-light)', fontSize: 11 }}>CPF</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--muted)', fontWeight: 600, borderBottom: '1px solid var(--border-light)', fontSize: 11 }}>Cidade/UF</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--muted)', fontWeight: 600, borderBottom: '1px solid var(--border-light)', fontSize: 11 }}>CEP</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--muted)', fontWeight: 600, borderBottom: '1px solid var(--border-light)', fontSize: 11 }}>E-mail</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--muted)', fontWeight: 600, borderBottom: '1px solid var(--border-light)', fontSize: 11 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {resultados.map((c, idx) => (
                  <tr key={c.instagram}
                    style={{
                      borderBottom: '1px solid var(--border-light)',
                      transition: 'background 0.15s',
                      background: idx === activeIdx ? 'var(--blue)' : 'transparent',
                      color: idx === activeIdx ? '#171717' : 'inherit',
                    }}
                    onMouseEnter={e => { if (idx !== activeIdx) e.currentTarget.style.background = 'var(--table-row-hover)' }}
                    onMouseLeave={e => { if (idx !== activeIdx) e.currentTarget.style.background = 'transparent' }}
                    onClick={() => setActiveIdx(idx)}>
                    <td style={{ padding: '8px 12px', color: idx === activeIdx ? '#171717' : 'var(--blue)', fontWeight: 600 }}>
                      @{c.instagram}
                    </td>
                    <td style={{ padding: '8px 12px', color: idx === activeIdx ? '#171717' : 'var(--text-body)' }}>
                      {c.nome_completo || <span style={{ color: idx === activeIdx ? '#171717' : 'var(--muted)', fontSize: 11 }}>—</span>}
                    </td>
                    <td style={{ padding: '8px 12px', color: idx === activeIdx ? '#171717' : 'var(--text-body)' }}>
                      {c.whatsapp || <span style={{ color: idx === activeIdx ? '#171717' : 'var(--muted)', fontSize: 11 }}>—</span>}
                    </td>
                    <td style={{ padding: '8px 12px', color: idx === activeIdx ? '#171717' : 'var(--text-body)', fontFamily: 'monospace', fontSize: 11 }}>
                      {c.cpf || <span style={{ color: idx === activeIdx ? '#171717' : 'var(--muted)' }}>—</span>}
                    </td>
                    <td style={{ padding: '8px 12px', color: idx === activeIdx ? '#171717' : 'var(--text-body)' }}>
                      {c.cidade && c.uf ? `${c.cidade}/${c.uf}` : c.cidade || c.uf || <span style={{ color: idx === activeIdx ? '#171717' : 'var(--muted)', fontSize: 11 }}>—</span>}
                    </td>
                    <td style={{ padding: '8px 12px', color: idx === activeIdx ? '#171717' : 'var(--text-body)', fontFamily: 'monospace', fontSize: 11 }}>
                      {c.cep || <span style={{ color: idx === activeIdx ? '#171717' : 'var(--muted)' }}>—</span>}
                    </td>
                    <td style={{ padding: '8px 12px', color: idx === activeIdx ? '#171717' : 'var(--text-body)', fontSize: 11 }}>
                      {c.email || <span style={{ color: idx === activeIdx ? '#171717' : 'var(--muted)' }}>—</span>}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                      {c.bloqueado ? (
                        <span style={{ background: idx === activeIdx ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.15)', color: idx === activeIdx ? '#171717' : 'var(--red)', padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>
                          🔒 Bloqueado
                        </span>
                      ) : (
                        <span style={{ background: idx === activeIdx ? 'rgba(52,211,153,0.3)' : 'rgba(52,211,153,0.15)', color: idx === activeIdx ? '#171717' : 'var(--green)', padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>
                          ✅ Ativo
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

    </div>
  )
}
