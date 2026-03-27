import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { getDadosIniciais, getListas } from '../services/vendasService'

const AppContext = createContext(null)

// ── Toast global simples ──────────────────────────────────────
let _setToasts = null
export function showGlobalToast(msg, type = 'success') {
  _setToasts?.(prev => {
    const id = Date.now()
    setTimeout(() => _setToasts?.(p => p.filter(t => t.id !== id)), 3300)
    return [...prev, { id, msg, type }]
  })
}

export function AppProvider({ children }) {
  const [toasts, setToasts] = useState([])
  _setToasts = setToasts

  const [lives,      setLives]      = useState([])
  const [bloqueados, setBloqueados] = useState({})

  const showToast = useCallback((msg, type = 'success') => showGlobalToast(msg, type), [])

  const carregarDados = useCallback(async () => {
    const [dados] = await Promise.all([ getDadosIniciais() ])
    setLives(dados.lives)
    setBloqueados(dados.bloqueados)
  }, [])

  return (
    <AppContext.Provider value={{ lives, bloqueados, showToast, carregarDados }}>
      {/* Toast container */}
      <div id="toast-container">
        {toasts.map(t => {
          const icon = t.type === 'error' ? '❌' : t.type === 'info' ? 'ℹ️' : '✅'
          return (
            <div key={t.id} className={`toast ${t.type} show`}>
              <span>{icon}</span><span>{t.msg}</span>
            </div>
          )
        })}
      </div>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp deve ser usado dentro de AppProvider')
  return ctx
}
