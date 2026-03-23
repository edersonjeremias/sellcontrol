import { createContext, useContext, useState, useCallback } from 'react'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const showToast = useCallback((message, type = 'success') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3000)
  }, [])

  return (
    <AppContext.Provider value={{ showToast }}>
      {children}
      <ToastContainer toasts={toasts} />
    </AppContext.Provider>
  )
}

function ToastContainer({ toasts }) {
  const icons = { success: '✅', error: '❌', info: 'ℹ️' }
  return (
    <div id="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type} show`}>
          <span>{icons[t.type] ?? '✅'}</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  )
}

export const useApp = () => useContext(AppContext)
