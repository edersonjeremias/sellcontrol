import { useEffect, useMemo, useState } from 'react'
import AppShell from '../components/ui/AppShell'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import {
  getTenantPages,
  getTenantUsers,
  getUserPageIds,
  saveUserPageAccess,
  createPage,
} from '../services/authService'

export default function AdminPage() {
  const { profile } = useAuth()
  const { showToast } = useApp()
  const [users, setUsers] = useState([])
  const [pages, setPages] = useState([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [userPageIds, setUserPageIds] = useState([])
  const [newPageLabel, setNewPageLabel] = useState('')
  const [newPageSlug, setNewPageSlug] = useState('')
  const [saving, setSaving] = useState(false)

  const tenantId = profile?.tenant_id

  useEffect(() => {
    if (!tenantId) return
    loadTenantData()
  }, [tenantId])

  const loadTenantData = async () => {
    const [pagesRes, usersRes] = await Promise.all([getTenantPages(tenantId), getTenantUsers(tenantId)])
    if (pagesRes.error || usersRes.error) {
      showToast('Erro ao carregar dados de administração.', 'error')
      return
    }
    setPages(pagesRes.data || [])
    setUsers(usersRes.data || [])
    if (usersRes.data?.[0]) {
      setSelectedUserId(usersRes.data[0].id)
    }
  }

  useEffect(() => {
    if (!selectedUserId) {
      setUserPageIds([])
      return
    }
    fetchUserAccess(selectedUserId)
  }, [selectedUserId])

  const fetchUserAccess = async (userId) => {
    const result = await getUserPageIds(userId)
    if (result.error) {
      showToast('Erro ao carregar permissões do usuário.', 'error')
      setUserPageIds([])
      return
    }
    setUserPageIds(result.data || [])
  }

  const availablePages = useMemo(() => pages || [], [pages])

  const handleTogglePage = (pageId) => {
    const next = userPageIds.includes(pageId)
      ? userPageIds.filter((id) => id !== pageId)
      : [...userPageIds, pageId]
    setUserPageIds(next)
  }

  const handleSaveAccess = async () => {
    if (!selectedUserId) {
      showToast('Selecione um usuário.', 'error')
      return
    }
    setSaving(true)
    try {
      const result = await saveUserPageAccess(selectedUserId, tenantId, userPageIds)
      if (result.error) throw result.error
      showToast('Permissões atualizadas!', 'success')
    } catch (error) {
      showToast(error.message || 'Erro ao salvar permissões.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleCreatePage = async () => {
    if (!newPageSlug.trim() || !newPageLabel.trim()) {
      showToast('Preencha slug e nome da página.', 'error')
      return
    }
    const page = {
      slug: newPageSlug.trim().replace(/\s+/g, '-').toLowerCase(),
      label: newPageLabel.trim(),
      category: 'Configuração',
      icon: 'settings',
      order_index: pages.length * 10 + 10,
    }
    const result = await createPage(tenantId, page)
    if (result.error) {
      showToast(result.error.message || 'Erro ao criar página.', 'error')
      return
    }
    setPages((prev) => [...prev, { id: result.data[0].id, ...page }])
    setNewPageLabel('')
    setNewPageSlug('')
    showToast('Página criada!', 'success')
  }

  return (
    <AppShell title="Administração">
      <section className="admin-panel">
        <div className="admin-card">
          <h2>Usuário</h2>
          <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.nome || user.id} ({user.role})
              </option>
            ))}
          </select>

          <div className="admin-pages-list">
            <h3>Permissões de página</h3>
            {availablePages.length === 0 ? (
              <div className="empty-state">Nenhuma página cadastrada ainda. Crie uma página abaixo.</div>
            ) : (
              availablePages.map((page) => (
                <label key={page.id} className="admin-checkbox">
                  <input
                    type="checkbox"
                    checked={userPageIds.includes(page.id)}
                    onChange={() => handleTogglePage(page.id)}
                  />
                  {page.label}
                </label>
              ))
            )}
            <button className="btn-acao btn-blue" onClick={handleSaveAccess} disabled={saving || !selectedUserId || availablePages.length === 0}>
              {saving ? 'Salvando...' : 'Salvar permissões'}
            </button>
          </div>
        </div>

        <div className="admin-card">
          <h2>Nova página</h2>
          <input
            type="text"
            placeholder="Nome da página"
            value={newPageLabel}
            onChange={(e) => setNewPageLabel(e.target.value)}
          />
          <input
            type="text"
            placeholder="Slug (ex: relatorios)"
            value={newPageSlug}
            onChange={(e) => setNewPageSlug(e.target.value)}
          />
          <button className="btn-acao btn-green" onClick={handleCreatePage}>
            Criar página
          </button>
        </div>
      </section>
    </AppShell>
  )
}
