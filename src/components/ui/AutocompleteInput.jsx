import { useState, useRef, useEffect } from 'react'

export default function AutocompleteInput({
  value = '',
  onChange,
  onBlur,
  list = [],
  placeholder = '',
  className = '',
  disabled = false,
  showOnFocus = false,   // true: abre no foco mesmo sem texto (ex: campo Live)
  onEnterNewRow,         // chamado quando Enter é pressionado no último campo
  style,
}) {
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const listRef = useRef(null)

  const filtered = (list || []).filter(item =>
    !value || item.toLowerCase().includes(value.toLowerCase())
  )

  const visible = open && filtered.length > 0 && (showOnFocus || value?.trim())

  // Rola o item ativo para ficar visível na lista
  useEffect(() => {
    if (activeIdx >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('li')
      items[activeIdx]?.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIdx])

  function select(item) {
    onChange(item)
    setOpen(false)
    setActiveIdx(-1)
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) { setOpen(true); setActiveIdx(0); return }
      setActiveIdx(i => Math.min(i + 1, filtered.length - 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, 0))
      return
    }
    if (!visible) {
      if (e.key === 'Enter' && onEnterNewRow) {
        e.preventDefault()
        onEnterNewRow()
      }
      return
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      // Só seleciona se o usuário navegou explicitamente com as setas (activeIdx >= 0)
      if (activeIdx >= 0) {
        const chosen = filtered[activeIdx]
        if (chosen) {
          if (e.key === 'Enter') e.preventDefault()
          select(chosen)
        }
      } else if (e.key === 'Enter' && onEnterNewRow) {
        e.preventDefault()
        onEnterNewRow()
      }
      // Tab sem item selecionado: fecha dropdown e deixa Tab agir normalmente
      if (e.key === 'Tab') {
        setOpen(false)
        setActiveIdx(-1)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      setActiveIdx(-1)
    }
  }

  return (
    <div className="autocomplete-wrapper" style={style}>
      <input
        className={className}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        onChange={e => { onChange(e.target.value); setOpen(true); setActiveIdx(-1) }}
        onFocus={() => { setOpen(true); setActiveIdx(-1) }}
        onBlur={() => {
          setTimeout(() => { setOpen(false); setActiveIdx(-1) }, 150)
          onBlur?.()
        }}
        onKeyDown={handleKeyDown}
      />
      {visible && (
        <ul className="autocomplete-list" ref={listRef}>
          {filtered.map((item, i) => (
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
