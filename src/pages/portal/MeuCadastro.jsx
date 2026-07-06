import { useState } from 'react'
import { usePortalAuth } from '../../context/PortalAuthContext'
import { usePortalToast } from '../../components/portal/PortalToast'
import { atualizarCadastro } from '../../services/portalService'

function maskCpf(v) {
  return v.replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d{1,2})/, '$1.$2.$3-$4')
}

function maskCelular(v) {
  return v.replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{4,5})(\d{4})$/, '$1-$2')
}

function maskCep(v) {
  return v.replace(/\D/g, '').slice(0, 8)
    .replace(/(\d{5})(\d)/, '$1-$2')
}

async function buscarCep(cep, setForm) {
  const c = cep.replace(/\D/g, '')
  if (c.length !== 8) return
  try {
    const res  = await fetch(`https://viacep.com.br/ws/${c}/json/`)
    const data = await res.json()
    if (!data.erro) {
      setForm(f => ({
        ...f,
        rua:    data.logradouro || '',
        bairro: data.bairro     || '',
        cidade: data.localidade || '',
        estado: data.uf         || '',
      }))
    }
  } catch {}
}

export default function MeuCadastro() {
  const { cliente, refreshCliente } = usePortalAuth()
  const toast = usePortalToast()

  const [form, setForm] = useState({
    nome_completo:   cliente?.nome_completo   || '',
    cpf:             cliente?.cpf             || '',
    data_nascimento: cliente?.data_nascimento || '',
    celular:         cliente?.celular         || '',
    cep:             cliente?.cep             || '',
    rua:             cliente?.rua             || '',
    numero:          cliente?.numero          || '',
    complemento:     cliente?.complemento     || '',
    bairro:          cliente?.bairro          || '',
    cidade:          cliente?.cidade          || '',
    estado:          cliente?.estado          || '',
  })
  const [saving, setSaving] = useState(false)

  function upd(field, val) {
    setForm(f => ({ ...f, [field]: val }))
  }

  async function salvar(e) {
    e.preventDefault()
    if (!form.nome_completo.trim()) {
      toast('Informe o nome completo.', 'error')
      return
    }
    setSaving(true)
    try {
      await atualizarCadastro(cliente.user_id, form)
      await refreshCliente()
      toast('Cadastro salvo com sucesso!', 'success')
    } catch {
      toast('Erro ao salvar. Tente novamente.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ padding:'14px 16px 0', maxHeight:'calc(100vh - 120px)', overflowY:'auto' }}>
      <form onSubmit={salvar}>

        <div className="portal-section-title">Informações Pessoais</div>

        <div className="portal-field">
          <label className="portal-label">Instagram</label>
          <input className="portal-input" value={cliente?.instagram || ''} readOnly
            style={{ opacity:0.5, cursor:'default' }} />
        </div>

        <div className="portal-field">
          <label className="portal-label">Nome Completo *</label>
          <input className="portal-input" placeholder="Seu nome"
            value={form.nome_completo}
            onChange={e => upd('nome_completo', e.target.value)} />
        </div>

        <div className="portal-form-row">
          <div className="portal-field">
            <label className="portal-label">CPF</label>
            <input className="portal-input" placeholder="000.000.000-00"
              value={form.cpf}
              onChange={e => upd('cpf', maskCpf(e.target.value))}
              inputMode="numeric" />
          </div>
          <div className="portal-field">
            <label className="portal-label">Data de Nascimento</label>
            <input className="portal-input" type="date"
              value={form.data_nascimento}
              onChange={e => upd('data_nascimento', e.target.value)} />
          </div>
        </div>

        <div className="portal-field">
          <label className="portal-label">Celular / WhatsApp</label>
          <input className="portal-input" placeholder="(00) 00000-0000"
            value={form.celular}
            onChange={e => upd('celular', maskCelular(e.target.value))}
            inputMode="numeric" />
        </div>

        <div className="portal-section-title">Endereço</div>

        <div className="portal-form-row">
          <div className="portal-field">
            <label className="portal-label">CEP</label>
            <input className="portal-input" placeholder="00000-000"
              value={form.cep}
              onChange={e => upd('cep', maskCep(e.target.value))}
              onBlur={e => buscarCep(e.target.value, setForm)}
              inputMode="numeric" />
          </div>
          <div className="portal-field">
            <label className="portal-label">Estado</label>
            <input className="portal-input" placeholder="UF"
              value={form.estado}
              onChange={e => upd('estado', e.target.value.toUpperCase().slice(0,2))}
              maxLength={2} />
          </div>
        </div>

        <div className="portal-field">
          <label className="portal-label">Rua / Logradouro</label>
          <input className="portal-input" placeholder="Nome da rua"
            value={form.rua}
            onChange={e => upd('rua', e.target.value)} />
        </div>

        <div className="portal-form-row">
          <div className="portal-field">
            <label className="portal-label">Número</label>
            <input className="portal-input" placeholder="000"
              value={form.numero}
              onChange={e => upd('numero', e.target.value)} />
          </div>
          <div className="portal-field">
            <label className="portal-label">Complemento</label>
            <input className="portal-input" placeholder="Apto, bloco..."
              value={form.complemento}
              onChange={e => upd('complemento', e.target.value)} />
          </div>
        </div>

        <div className="portal-form-row">
          <div className="portal-field">
            <label className="portal-label">Bairro</label>
            <input className="portal-input" placeholder="Bairro"
              value={form.bairro}
              onChange={e => upd('bairro', e.target.value)} />
          </div>
          <div className="portal-field">
            <label className="portal-label">Cidade</label>
            <input className="portal-input" placeholder="Cidade"
              value={form.cidade}
              onChange={e => upd('cidade', e.target.value)} />
          </div>
        </div>

        <button type="submit" className="portal-btn portal-btn-blue"
          style={{ width:'100%', marginTop:8 }} disabled={saving}>
          {saving ? 'Salvando...' : '💾 Salvar Cadastro'}
        </button>
      </form>
    </div>
  )
}
