import { useState } from 'react'
import AppShell from '../components/ui/AppShell'
import { useApp } from '../context/AppContext'
import { createTenantAndAdmin } from '../services/masterService'

const INITIAL_FORM = {
  empresaNome: '',
  empresaCnpj: '',
  adminNome: '',
  adminEmail: '',
  adminCpf: '',
  adminCelular: '',
  adminSenha: '',
}

export default function MasterEmpresasPage() {
  const { showToast } = useApp()
  const [form, setForm] = useState(INITIAL_FORM)
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState(null)
  const [requestError, setRequestError] = useState('')

  const getErrorMessage = (err) => {
    if (!err) return 'Erro ao criar empresa e administrador.'
    if (typeof err === 'string') return err
    if (err.message) return err.message
    if (err.name === 'FunctionsHttpError') return 'A função retornou erro HTTP. Verifique os logs da Edge Function create-tenant-admin.'
    if (err.name === 'FunctionsFetchError') return 'Não foi possível conectar com a Edge Function. Verifique se ela foi publicada no Supabase.'
    if (err.name === 'FunctionsRelayError') return 'Erro de relay da função no Supabase. Tente novamente e confira os logs.'
    return 'Erro ao criar empresa e administrador.'
  }

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setCreated(null)
    setRequestError('')

    if (!form.empresaNome.trim() || !form.empresaCnpj.trim()) {
      showToast('Informe nome e CNPJ da empresa.', 'error')
      return
    }

    if (!form.adminNome.trim() || !form.adminEmail.trim() || !form.adminCpf.trim() || !form.adminCelular.trim()) {
      showToast('Preencha todos os dados do administrador.', 'error')
      return
    }

    if (form.adminSenha.length < 6) {
      showToast('A senha inicial do admin deve ter no mínimo 6 caracteres.', 'error')
      return
    }

    setSaving(true)
    try {
      const payload = {
        empresaNome: form.empresaNome.trim(),
        empresaCnpj: form.empresaCnpj.trim(),
        adminNome: form.adminNome.trim(),
        adminEmail: form.adminEmail.trim().toLowerCase(),
        adminCpf: form.adminCpf.trim(),
        adminCelular: form.adminCelular.trim(),
        adminSenha: form.adminSenha,
      }

      const { data, error } = await createTenantAndAdmin(payload)
      if (error) throw error
      if (!data?.ok) throw new Error(data?.message || 'Falha ao criar empresa e administrador.')

      setCreated({
        tenantId: data.tenantId,
        adminId: data.adminId,
        adminEmail: payload.adminEmail,
      })
      setForm(INITIAL_FORM)
      showToast('Empresa e administrador criados com sucesso.', 'success')
    } catch (err) {
      const msg = getErrorMessage(err)
      setRequestError(msg)
      showToast(msg, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppShell title="Cadastro de Empresa (Master)">
      <section className="admin-panel">
        <div className="admin-card">
          <h2>Novo cliente SaaS</h2>
          <p style={{ color: 'var(--muted)', marginTop: '6px' }}>
            Somente usuário master pode cadastrar uma nova empresa e o administrador responsável.
          </p>

          <form className="login-form" onSubmit={handleSubmit}>
            <label htmlFor="empresaNome">Nome da empresa</label>
            <input id="empresaNome" name="empresaNome" type="text" value={form.empresaNome} onChange={handleChange} placeholder="Ex: SellControl Matriz" />

            <label htmlFor="empresaCnpj">CNPJ</label>
            <input id="empresaCnpj" name="empresaCnpj" type="text" value={form.empresaCnpj} onChange={handleChange} placeholder="00.000.000/0001-00" />

            <label htmlFor="adminNome">Nome completo do admin</label>
            <input id="adminNome" name="adminNome" type="text" value={form.adminNome} onChange={handleChange} placeholder="Nome completo" />

            <label htmlFor="adminEmail">Email do admin</label>
            <input id="adminEmail" name="adminEmail" type="email" value={form.adminEmail} onChange={handleChange} placeholder="admin@empresa.com" />

            <label htmlFor="adminCpf">CPF do admin</label>
            <input id="adminCpf" name="adminCpf" type="text" value={form.adminCpf} onChange={handleChange} placeholder="000.000.000-00" />

            <label htmlFor="adminCelular">Celular do admin</label>
            <input id="adminCelular" name="adminCelular" type="text" value={form.adminCelular} onChange={handleChange} placeholder="(00) 90000-0000" />

            <label htmlFor="adminSenha">Senha inicial do admin</label>
            <input id="adminSenha" name="adminSenha" type="password" value={form.adminSenha} onChange={handleChange} placeholder="Mínimo 6 caracteres" />

            <button type="submit" className="btn-acao btn-blue" disabled={saving}>
              {saving ? 'Criando empresa...' : 'Criar empresa + admin'}
            </button>
          </form>

          {created && (
            <div style={{ marginTop: '16px', color: 'var(--green)', padding: '10px 12px', borderRadius: '10px', background: 'rgba(74, 222, 128, 0.12)', fontWeight: 600 }}>
              Cadastro concluído. Tenant: {created.tenantId}. Admin: {created.adminEmail}.
            </div>
          )}

          {requestError && (
            <div style={{ marginTop: '16px', color: 'var(--red)', padding: '10px 12px', borderRadius: '10px', background: 'rgba(242, 139, 130, 0.12)', fontWeight: 600 }}>
              {requestError}
            </div>
          )}
        </div>
      </section>
    </AppShell>
  )
}
