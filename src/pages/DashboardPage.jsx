import { useEffect, useState } from 'react'
import AppShell from '../components/ui/AppShell'
import { useAuth } from '../context/AuthContext'
import { getConfig } from '../services/configService'

export default function DashboardPage() {
  const { profile } = useAuth()
  const [nomeEmpresa, setNomeEmpresa] = useState('SellControl')

  useEffect(() => {
    if (profile?.tenant_id) {
      getConfig(profile.tenant_id)
        .then(config => {
          if (config?.nome_loja) {
            setNomeEmpresa(config.nome_loja)
          }
        })
        .catch(() => {})
    }
  }, [profile?.tenant_id])

  return (
    <AppShell title="Dashboard" hideTitle>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '70vh',
      }}>
        <h1 style={{
          fontSize: '6rem',
          fontWeight: 700,
          color: 'var(--blue)',
          textAlign: 'center',
          margin: 0,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          {nomeEmpresa}
        </h1>
      </div>
    </AppShell>
  )
}
