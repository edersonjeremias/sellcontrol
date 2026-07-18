import { createContext, useContext, useState, useCallback } from 'react'

const ToastCtx = createContext(() => {})
export const usePortalToast = () => useContext(ToastCtx)

export default function PortalToastProvider({ children }) {
  const [list, setList] = useState([])

  const toast = useCallback((msg, type = 'info', ms = 3200) => {
    const id = Date.now() + Math.random()
    setList(p => [...p, { id, msg, type, visible: false }])
    setTimeout(() => setList(p => p.map(t => t.id === id ? { ...t, visible: true } : t)), 20)
    setTimeout(() => setList(p => p.map(t => t.id === id ? { ...t, visible: false } : t)), ms)
    setTimeout(() => setList(p => p.filter(t => t.id !== id)), ms + 400)
  }, [])

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="portal-toast-container">
        {list.map(t => (
          <div key={t.id} className={`portal-toast ${t.type}${t.visible ? ' show' : ''}`}>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
