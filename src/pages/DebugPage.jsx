import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import AppShell from '../components/ui/AppShell'

export default function DebugPage() {
  const { profile, menuItems } = useAuth()
  const [pagesDb, setPagesDb] = useState([])
  const [accessDb, setAccessDb] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      if (!profile?.tenant_id) return

      // Busca páginas do tenant
      const { data: pages } = await supabase
        .from('pages')
        .select('*')
        .eq('tenant_id', profile.tenant_id)
        .order('slug')

      // Busca acessos do usuário
      const { data: access } = await supabase
        .from('pages_access')
        .select('*, pages(slug, label)')
        .eq('user_id', profile.id)

      setPagesDb(pages || [])
      setAccessDb(access || [])
      setLoading(false)
    }
    load()
  }, [profile])

  if (!profile) return <AppShell title="Debug"><p>Não logado</p></AppShell>

  return (
    <AppShell title="🔍 Debug - Informações do Sistema">
      <div style={{ padding: 20, fontFamily: 'monospace', fontSize: 12 }}>

        {/* Informações do usuário */}
        <div style={{ background: '#1a1a1a', padding: 20, borderRadius: 8, marginBottom: 20 }}>
          <h3 style={{ color: '#00d4ff', marginTop: 0 }}>👤 Usuário Logado</h3>
          <pre style={{ color: '#fff', lineHeight: 1.6 }}>
            ID:        {profile.id}
            {'\n'}Nome:      {profile.nome}
            {'\n'}Role:      {profile.role}
            {'\n'}Tenant ID: {profile.tenant_id}
          </pre>
        </div>

        {/* Menu items do contexto */}
        <div style={{ background: '#1a1a1a', padding: 20, borderRadius: 8, marginBottom: 20 }}>
          <h3 style={{ color: '#00d4ff', marginTop: 0 }}>📋 Menu Items (Context) - {menuItems.length} itens</h3>
          <pre style={{ color: '#fff', lineHeight: 1.6 }}>
            {menuItems.map(m => `${m.slug.padEnd(30)} → ${m.label}`).join('\n')}
          </pre>
        </div>

        {/* Páginas no banco */}
        <div style={{ background: '#1a1a1a', padding: 20, borderRadius: 8, marginBottom: 20 }}>
          <h3 style={{ color: '#00d4ff', marginTop: 0 }}>🗄️ Páginas no Banco (tenant) - {pagesDb.length} páginas</h3>
          {loading ? (
            <p style={{ color: '#888' }}>Carregando...</p>
          ) : (
            <pre style={{ color: '#fff', lineHeight: 1.6, maxHeight: 400, overflow: 'auto' }}>
              {pagesDb.map(p => `${p.slug.padEnd(30)} → ${p.label}`).join('\n')}
            </pre>
          )}
        </div>

        {/* Acessos do usuário */}
        <div style={{ background: '#1a1a1a', padding: 20, borderRadius: 8, marginBottom: 20 }}>
          <h3 style={{ color: '#00d4ff', marginTop: 0 }}>🔐 Acessos do Usuário - {accessDb.length} acessos</h3>
          {loading ? (
            <p style={{ color: '#888' }}>Carregando...</p>
          ) : (
            <pre style={{ color: '#fff', lineHeight: 1.6, maxHeight: 400, overflow: 'auto' }}>
              {accessDb.map(a => `${a.pages?.slug?.padEnd(30) || 'N/A'} → ${a.pages?.label || 'N/A'}`).join('\n')}
            </pre>
          )}
        </div>

        {/* Verifica se notificacoes está em algum lugar */}
        <div style={{ background: '#1a1a1a', padding: 20, borderRadius: 8 }}>
          <h3 style={{ color: '#00d4ff', marginTop: 0 }}>✅ Checklist "notificacoes"</h3>
          <pre style={{ color: '#fff', lineHeight: 1.8 }}>
            No menu (context):     {menuItems.some(m => m.slug === 'notificacoes') ? '✅ SIM' : '❌ NÃO'}
            {'\n'}No banco (pages):    {pagesDb.some(p => p.slug === 'notificacoes') ? '✅ SIM' : '❌ NÃO'}
            {'\n'}Com acesso (access): {accessDb.some(a => a.pages?.slug === 'notificacoes') ? '✅ SIM' : '❌ NÃO'}
          </pre>
        </div>

      </div>
    </AppShell>
  )
}
