import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import AppShell from '../../components/ui/AppShell'
import AbaRomaneiosFinanceiro from './AbaRomaneiosFinanceiro'
import AbaExtratoMP from './AbaExtratoMP'
import './frete-financeiro.css'

// ============================================================================
// FRETE E ROMANEIOS
// ============================================================================
// A mesma conta do Mercado Pago recebe o frete dos romaneios e o dinheiro das
// vendas. Duas abas resolvem os dois lados do problema:
//
//   Romaneios  — por romaneio: quanto o frete custou, quanto entrou, a
//                diferença, e a marcação de que o valor já foi transferido
//                para a conta que gera crédito no Melhor Envio
//   Extrato MP — o extrato do Mercado Pago separado em frete x venda
// ============================================================================

const ABAS = [
  ['romaneios', 'Romaneios'],
  ['extrato',   'Extrato Mercado Pago'],
]

export default function FreteFinanceiroPage() {
  const { profile } = useAuth()
  const { showToast } = useApp()
  const tenantId = profile?.tenant_id

  const [aba, setAba] = useState('romaneios')
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768)

  useEffect(() => {
    const aoRedimensionar = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', aoRedimensionar)
    return () => window.removeEventListener('resize', aoRedimensionar)
  }, [])

  const props = { tenantId, showToast, profile, isMobile }

  return (
    <AppShell title="Frete e Romaneios" hideTitle>
      <div className="ff-topbar">
        <span className="ff-titulo">Frete e Romaneios</span>
        <div className="ff-abas">
          {ABAS.map(([id, label]) => (
            <button
              key={id}
              className={`ff-aba${aba === id ? ' ativa' : ''}`}
              onClick={() => setAba(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {aba === 'romaneios' && <AbaRomaneiosFinanceiro {...props} />}
      {aba === 'extrato' && <AbaExtratoMP {...props} />}
    </AppShell>
  )
}
