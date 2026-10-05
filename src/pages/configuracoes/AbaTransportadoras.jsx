import { useState, useEffect } from 'react'
import { getConfig, saveConfig } from '../../services/configService'

const TRANSPORTADORAS_DISPONIVEIS = [
  { id: 'correios', nome: 'Correios (PAC e SEDEX)' },
  { id: 'jadlog', nome: 'Jadlog' },
  { id: 'azul', nome: 'Azul Cargo' },
  { id: 'latam', nome: 'Latam Cargo' },
  { id: 'loggi', nome: 'Loggi' },
  { id: 'sequoia', nome: 'Sequoia' },
]

export default function AbaTransportadoras({ tenantId, showToast }) {
  const [habilitadas, setHabilitadas] = useState(['correios'])
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!tenantId) return
    getConfig(tenantId).then(cfg => {
      if (cfg?.transportadoras_habilitadas) {
        // Se vier como array de strings (ex: ["Correios", "Jadlog"])
        // converte para lowercase para comparar com os IDs
        const habilitadasNormalizadas = cfg.transportadoras_habilitadas.map(t =>
          t.toLowerCase().includes('correios') ? 'correios' :
          t.toLowerCase().includes('jadlog') ? 'jadlog' :
          t.toLowerCase().includes('azul') ? 'azul' :
          t.toLowerCase().includes('latam') ? 'latam' :
          t.toLowerCase().includes('loggi') ? 'loggi' :
          t.toLowerCase().includes('sequoia') ? 'sequoia' : t
        )
        setHabilitadas(habilitadasNormalizadas)
      }
    })
  }, [tenantId])

  const toggleTransportadora = (id) => {
    setHabilitadas(prev => {
      if (prev.includes(id)) {
        // Sempre manter pelo menos uma habilitada
        if (prev.length === 1) {
          showToast('Mantenha pelo menos uma transportadora habilitada', 'error')
          return prev
        }
        return prev.filter(t => t !== id)
      } else {
        return [...prev, id]
      }
    })
  }

  const handleSalvar = async () => {
    setSalvando(true)
    try {
      // Salva os nomes das transportadoras (capitalizado)
      const transportadorasNomes = habilitadas.map(id => {
        const transp = TRANSPORTADORAS_DISPONIVEIS.find(t => t.id === id)
        return transp ? transp.nome.split(' ')[0] : id // Pega só o primeiro nome
      })

      await saveConfig(tenantId, {
        transportadoras_habilitadas: transportadorasNomes
      })
      showToast('Transportadoras atualizadas!', 'success')
    } catch (e) {
      showToast('Erro ao salvar: ' + e.message, 'error')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid var(--border-light)',
      borderRadius: 12,
      padding: 24,
      marginTop: 20
    }}>
      <h3 style={{ margin: '0 0 8px 0', color: 'var(--blue)', fontSize: 16 }}>
        🚚 Transportadoras Habilitadas
      </h3>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 20 }}>
        Selecione quais transportadoras deseja usar nas cotações de frete
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {TRANSPORTADORAS_DISPONIVEIS.map(transp => (
          <label
            key={transp.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: 12,
              background: habilitadas.includes(transp.id)
                ? 'rgba(138, 180, 248, 0.1)'
                : 'rgba(255,255,255,0.02)',
              border: `1px solid ${habilitadas.includes(transp.id) ? 'var(--blue)' : 'var(--border-light)'}`,
              borderRadius: 8,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <input
              type="checkbox"
              checked={habilitadas.includes(transp.id)}
              onChange={() => toggleTransportadora(transp.id)}
              style={{
                width: 18,
                height: 18,
                cursor: 'pointer',
                accentColor: 'var(--blue)'
              }}
            />
            <span style={{
              color: habilitadas.includes(transp.id) ? '#e8eaed' : 'var(--muted)',
              fontWeight: habilitadas.includes(transp.id) ? 600 : 400,
              fontSize: 14
            }}>
              {transp.nome}
            </span>
          </label>
        ))}
      </div>

      <button
        onClick={handleSalvar}
        disabled={salvando}
        style={{
          marginTop: 20,
          width: '100%',
          padding: 12,
          background: 'var(--blue)',
          color: '#0f0f0f',
          border: 'none',
          borderRadius: 8,
          fontWeight: 700,
          fontSize: 14,
          cursor: salvando ? 'wait' : 'pointer',
          opacity: salvando ? 0.6 : 1,
        }}
      >
        {salvando ? 'Salvando...' : '✅ Salvar Configurações'}
      </button>

      <div style={{
        marginTop: 16,
        padding: 12,
        background: 'rgba(138, 180, 248, 0.1)',
        border: '1px solid rgba(138, 180, 248, 0.3)',
        borderRadius: 8,
        fontSize: 12,
        color: 'var(--muted)'
      }}>
        💡 <strong>Dica:</strong> Mantenha apenas as transportadoras que você realmente usa para facilitar a escolha na cotação de frete.
      </div>
    </div>
  )
}
