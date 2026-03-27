import { useState, useCallback } from 'react'

let _addToast = null

export function useToast() {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((message, type = 'success') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3300)
  }, [])

  _addToast = addToast
  return { toasts, addToast }
}

export function showToast(message, type = 'success') {
  _addToast?.(message, type)
}

export function ToastContainer({ toasts }) {
  const icons = { error: '❌', info: 'ℹ️', success: '✅' }
  return (
    <div id="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type} show`}>
          <span>{icons[t.type] || '✅'}</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  )
}
