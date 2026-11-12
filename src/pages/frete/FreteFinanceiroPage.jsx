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

// "Extrato MP" em vez de "Extrato Mercado Pago": o nome inteiro empurrava as
// abas para a linha de baixo quando a faixa ficava cheia
const ABAS = [
  ['romaneios', 'Romaneios'],
  ['extrato',   'Extrato MP'],
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

  // As abas vão para dentro da barra de filtros de cada aba: título, campos e
  // abas numa linha só, em vez de duas faixas. Quem monta a barra é a aba,
  // porque os campos são dela — aqui só viajam os botões prontos.
  const abas = (
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
  )

  const props = { tenantId, showToast, profile, isMobile, abas }

  // A página ocupa a altura da janela e só a lista rola. É o que mantém o
  // cabeçalho da tabela travado: o sticky gruda no container que rola, e aqui
  // quem rola é .ff-conteudo, não a janela.
  return (
    <AppShell title="Frete e Romaneios" hideTitle flush>
      <div className="ff-page">
        {aba === 'romaneios' && <AbaRomaneiosFinanceiro {...props} />}
        {aba === 'extrato' && <AbaExtratoMP {...props} />}
      </div>
    </AppShell>
  )
}
