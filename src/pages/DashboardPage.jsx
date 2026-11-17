import { useEffect, useState } from 'react'
import AppShell from '../components/ui/AppShell'
import MuralAvisos from '../components/avisos/MuralAvisos'
import { useAuth } from '../context/AuthContext'
import { getConfig } from '../services/configService'

export default function DashboardPage() {
  const { profile } = useAuth()
  const [nomeEmpresa, setNomeEmpresa] = useState('SellControl')
  // Sem aviso nenhum o nome da empresa continua tomando a tela inteira, como
  // sempre foi. Com avisos ele encolhe e vira cabeçalho do mural.
  const [temAvisos, setTemAvisos] = useState(false)

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
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: temAvisos ? 'flex-start' : 'center',
        minHeight: temAvisos ? 0 : '70vh',
        padding: temAvisos ? '8px 16px 32px' : 0,
      }}>
        <h1 className={temAvisos ? 'dash-marca compacta' : 'dash-marca'}>
          {nomeEmpresa}
        </h1>

        <MuralAvisos onTemAvisos={setTemAvisos} />
      </div>
    </AppShell>
  )
}
