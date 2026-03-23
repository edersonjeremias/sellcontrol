import { useState, useRef } from 'react'

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

  const filtered = (list || []).filter(item =>
    !value || item.toLowerCase().includes(value.toLowerCase())
  )

  const visible = open && filtered.length > 0 && (showOnFocus || value?.trim())

  function select(item) {
    onChange(item)
    setOpen(false)
    setActiveIdx(-1)
  }

  function handleKeyDown(e) {
    if (!visible) {
      if (e.key === 'Enter' && onEnterNewRow) {
        e.preventDefault()
        onEnterNewRow()
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      const chosen = activeIdx >= 0 ? filtered[activeIdx] : filtered[0]
      if (chosen) {
        if (e.key === 'Enter') e.preventDefault()
        select(chosen)
      } else if (e.key === 'Enter' && onEnterNewRow) {
        e.preventDefault()
        onEnterNewRow()
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
        <ul className="autocomplete-list">
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
