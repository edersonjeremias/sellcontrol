import { createContext, useContext, useState, useCallback } from 'react'

const AppContext = createContext(null)

// ── Toast global simples ──────────────────────────────────────
let _setToasts = null
export function showGlobalToast(msg, type = 'success', duration = 3300) {
  _setToasts?.(prev => {
    const id = Date.now()
    setTimeout(() => _setToasts?.(p => p.filter(t => t.id !== id)), duration)
    return [...prev, { id, msg, type }]
  })
}

export function AppProvider({ children }) {
  const [toasts, setToasts] = useState([])
  _setToasts = setToasts

  const showToast = useCallback((msg, type = 'success', duration = 3300) => showGlobalToast(msg, type, duration), [])

  // `lives`, `bloqueados` e `carregarDados` moravam aqui e ninguém consumia:
  // as telas carregam isso por conta própria, já com o tenant da pessoa. O
  // `carregarDados` daqui era a única chamada do sistema que buscava dados
  // sem dizer de qual empresa — saiu junto.
  return (
    <AppContext.Provider value={{ showToast }}>
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
