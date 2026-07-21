import { useState, useRef, useEffect } from 'react'
import { searchClientes } from '../../services/clientesService'
import { navigateNext } from '../ui/AutocompleteInput'

export default function ClienteAutocomplete({
  value = '',
  tenantId,
  onChange,
  onSelect,
  onEnterKey,
  className = '',
  disabled = false,
}) {
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const searchTimeoutRef = useRef(null)

  // Busca sob demanda quando usuário digita
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    const trimmed = value?.trim()
    if (!trimmed || trimmed.length < 2) {
      setResults([])
      return
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const { data, error } = await searchClientes(tenantId, trimmed, 20)
        if (!error && data) {
          setResults(data.map(c => c.instagram))
        }
      } catch (err) {
        console.error('Erro ao buscar clientes:', err)
      } finally {
        setLoading(false)
      }
    }, 300) // 300ms de debounce

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [value, tenantId])

  useEffect(() => {
    if (activeIdx >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('li')
      items[activeIdx]?.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIdx])

  const visible = open && results.length > 0

  function select(item) {
    onChange(item)
    setOpen(false)
    setActiveIdx(-1)
    onSelect?.(item)
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) { setOpen(true); setActiveIdx(0); return }
      if (!visible) return
      setActiveIdx(i => (i + 1) >= results.length ? 0 : i + 1)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!visible) return
      setActiveIdx(i => (i - 1) < 0 ? results.length - 1 : i - 1)
      return
    }
    if (e.key === 'Escape') {
      setOpen(false); setActiveIdx(-1); return
    }
    if (e.key === 'Tab') {
      if (visible) {
        const chosen = activeIdx >= 0 ? results[activeIdx] : results[0]
        if (chosen) select(chosen)
      }
      setOpen(false); setActiveIdx(-1)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (visible) {
        const chosen = activeIdx >= 0 ? results[activeIdx] : results[0]
        if (chosen) {
          select(chosen)
          if (onEnterKey) {
            onEnterKey()
          } else {
            navigateNext(e.target)
          }
          return
        }
      }
      if (onEnterKey) {
        onEnterKey()
      } else {
        navigateNext(e.target)
      }
    }
  }

  return (
    <div className="autocomplete-wrapper">
      <input
        ref={inputRef}
        className={className}
        value={value}
        placeholder=""
        disabled={disabled}
        autoComplete="off"
        onChange={e => { onChange(e.target.value); setOpen(true); setActiveIdx(-1) }}
        onFocus={() => { setOpen(true); setActiveIdx(-1) }}
        onBlur={() => {
          setTimeout(() => { setOpen(false); setActiveIdx(-1) }, 150)
        }}
        onKeyDown={handleKeyDown}
      />
      {loading && open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, padding: '8px 12px',
          background: 'var(--card-bg)', border: '1px solid var(--border-light)',
          borderRadius: 8, marginTop: 4, fontSize: 12, color: 'var(--muted)'
        }}>
          Buscando...
        </div>
      )}
      {visible && !loading && (
        <ul className="autocomplete-list" ref={listRef}>
          {results.map((item, i) => (
            <li
              key={item}
              className={i === activeIdx ? 'dropdown-item-active' : ''}
              onMouseDown={e => { e.preventDefault(); select(item) }}
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
