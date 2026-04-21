import { useState, useRef, useEffect } from 'react'

export function navigateNext(input) {
  const tr = input.closest('tr')
  if (!tr) return
  const inputs = Array.from(tr.querySelectorAll(
    'input:not([readonly]):not([type="hidden"]):not([disabled]), select:not([disabled])'
  ))
  const i = inputs.indexOf(input)
  if (i >= 0 && i < inputs.length - 1) inputs[i + 1].focus()
}

export default function AutocompleteInput({
  value = '',
  onChange,
  onBlur,
  onSelect,
  isBlocked,        // (value: string) => boolean — verificação síncrona de bloqueio
  list = [],
  placeholder = '',
  className = '',
  disabled = false,
  showOnFocus = false,
  onEnterNewRow,
  style,
}) {
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const filtered = (list || []).filter(item =>
    !value || item.toLowerCase().includes(value.toLowerCase())
  )

  const visible = open && filtered.length > 0 && (showOnFocus || value?.trim())

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
    onSelect?.(item)
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) { setOpen(true); setActiveIdx(0); return }
      if (!visible) return
      setActiveIdx(i => (i + 1) >= filtered.length ? 0 : i + 1)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!visible) return
      setActiveIdx(i => (i - 1) < 0 ? filtered.length - 1 : i - 1)
      return
    }
    if (e.key === 'Escape') {
      setOpen(false); setActiveIdx(-1); return
    }
    if (e.key === 'Tab') {
      if (visible) {
        const chosen = activeIdx >= 0 ? filtered[activeIdx] : value?.trim() ? filtered[0] : null
        if (chosen) select(chosen)
      }
      setOpen(false); setActiveIdx(-1); return
    }
    if (e.key === 'Enter') {
      e.preventDefault()

      if (visible) {
        const chosen = activeIdx >= 0 ? filtered[activeIdx] : value?.trim() ? filtered[0] : null
        if (chosen) {
          select(chosen)
          // Após selecionar: se há handler de nova linha, só pula se NÃO estiver bloqueado
          if (onEnterNewRow) {
            if (!isBlocked?.(chosen)) onEnterNewRow()
          } else {
            navigateNext(e.target)
          }
          return
        }
      }

      if (onEnterNewRow) {
        onEnterNewRow()
      } else {
        navigateNext(e.target)
      }
    }
  }

  return (
    <div className="autocomplete-wrapper" style={style}>
      <input
        ref={inputRef}
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
