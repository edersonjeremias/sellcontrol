import { useState, useRef, useEffect } from 'react'

export default function AutocompleteInput({
  value = '',
  onChange,
  onBlur,
  list = [],
  placeholder = '',
  className = '',
  disabled = false,
  showOnFocus = false,   // true: abre no foco mesmo sem texto (campo Live no topo)
  onEnterNewRow,
  style,
}) {
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const listRef = useRef(null)

  const filtered = (list || []).filter(item =>
    !value || item.toLowerCase().includes(value.toLowerCase())
  )

  // Dropdown abre: se showOnFocus → basta estar aberto com itens
  // Se não showOnFocus → só mostra quando o campo tem texto (igual ao original)
  const visible = open && filtered.length > 0 && (showOnFocus || value?.trim())

  // Rola o item ativo para ficar visível
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
      if (!visible) return
      // Circular: passa do último vai pro primeiro
      setActiveIdx(i => (i + 1) >= filtered.length ? 0 : i + 1)
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!visible) return
      // Circular: passa do primeiro vai pro último
      setActiveIdx(i => (i - 1) < 0 ? filtered.length - 1 : i - 1)
      return
    }

    if (e.key === 'Escape') {
      setOpen(false)
      setActiveIdx(-1)
      return
    }

    if (e.key === 'Enter' || e.key === 'Tab') {
      if (visible) {
        if (activeIdx >= 0) {
          // Usuário navegou com seta → seleciona o item destacado
          if (e.key === 'Enter') e.preventDefault()
          select(filtered[activeIdx])
          return
        } else if (value?.trim()) {
          // Usuário digitou mas não navegou → seleciona o primeiro da lista
          if (e.key === 'Enter') e.preventDefault()
          select(filtered[0])
          return
        }
      }
      // Dropdown fechado ou vazio: Enter chama onEnterNewRow se definido
      if (e.key === 'Enter' && onEnterNewRow) {
        e.preventDefault()
        onEnterNewRow()
      }
      // Tab sem seleção: fecha o dropdown e deixa o Tab agir normalmente
      if (e.key === 'Tab') {
        setOpen(false)
        setActiveIdx(-1)
      }
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
