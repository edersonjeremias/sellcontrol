import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import AppShell from '../../components/ui/AppShell'
import { getFuncionarios } from '../../services/rhService'
import AbaFuncionarios from './AbaFuncionarios'
import AbaVales from './AbaVales'
import AbaOcorrencias from './AbaOcorrencias'
import AbaValeTransporte from './AbaValeTransporte'
import './rh.css'

const ABAS = [
  ['funcionarios', 'Funcionários'],
  ['vales',        'Vales e Pagamentos'],
  ['ocorrencias',  'Faltas e Atrasos'],
  ['vt',           'Vale Transporte'],
]

export default function RhPage() {
  const { profile }   = useAuth()
  const { showToast } = useApp()
  const tenantId      = profile?.tenant_id

  const [aba,          setAba]          = useState('funcionarios')
  const [funcionarios, setFuncionarios] = useState([])
  const [semTabela,    setSemTabela]    = useState(false)
  const [carregando,   setCarregando]   = useState(true)

  const carregarFuncionarios = useCallback(async () => {
    if (!tenantId) return
    setCarregando(true)
    try {
      const { data, tabelaFalta } = await getFuncionarios(tenantId)
      setFuncionarios(data)
      setSemTabela(tabelaFalta)
    } catch (e) {
      showToast('Erro ao carregar funcionários: ' + e.message, 'error')
    }
    setCarregando(false)
  }, [tenantId, showToast])

  useEffect(() => { carregarFuncionarios() }, [carregarFuncionarios])

  const props = { tenantId, showToast, funcionarios, recarregarFuncionarios: carregarFuncionarios }

  return (
    <AppShell title="RH" hideTitle>
      <div className="rh-topbar">
        <div className="rh-abas">
          {ABAS.map(([id, label]) => (
            <button
              key={id}
              className={`rh-aba${aba === id ? ' ativa' : ''}`}
              onClick={() => setAba(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {semTabela ? (
        <div className="rh-migracao">
          <h4>Migração pendente</h4>
          As tabelas do módulo RH ainda não existem no banco. Rode o arquivo abaixo
          no SQL Editor do Supabase e recarregue a página.
          <code>supabase/migrations/20261031_create_rh.sql</code>
        </div>
      ) : (
        <>
          {aba === 'funcionarios' && <AbaFuncionarios {...props} carregando={carregando} />}
          {aba === 'vales'        && <AbaVales {...props} />}
          {aba === 'ocorrencias'  && <AbaOcorrencias {...props} />}
          {aba === 'vt'           && <AbaValeTransporte {...props} />}
        </>
      )}
    </AppShell>
  )
}
