import { useState, useEffect, useRef, useMemo } from 'react'

export default function AutocompleteInput({
  value = '', onChange, onSelect, list = [],
  className = '', placeholder = '', readOnly = false,
  inputRef: externalRef, onEnterKey, ...props
}) {
  const [show,   setShow]   = useState(false)
  const [active, setActive] = useState(-1)
  const wrapRef  = useRef(null)
  const inputRef = externalRef || useRef(null)

  useEffect(() => { setActive(-1) }, [show])

  const filtered = useMemo(() => {
    if (!value.trim()) return []
    return list.filter(i => i.toLowerCase().includes(value.toLowerCase())).slice(0, 40)
  }, [list, value])

  function select(item) {
    onSelect?.(item)
    onChange?.(item)
    setShow(false)
  }

  function handleKey(e) {
    if (!show || filtered.length === 0) {
      if (e.key === 'Enter') { e.preventDefault(); onEnterKey?.() }
      return
    }
    if (e.key === 'ArrowDown')  { e.preventDefault(); setActive(a => Math.min(a + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      select(active >= 0 ? filtered[active] : filtered[0])
    }
    else if (e.key === 'Escape') setShow(false)
  }

  // fecha ao clicar fora
  useEffect(() => {
    function handler(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setShow(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="autocomplete-wrapper" ref={wrapRef}>
      <input
        ref={inputRef}
        className={`cell-input autocomplete-input ${className}`}
        value={value}
        readOnly={readOnly}
        placeholder={placeholder}
        autoComplete="off"
        onChange={e => { onChange?.(e.target.value); setShow(true) }}
        onFocus={() => value.trim() && setShow(true)}
        onKeyDown={handleKey}
        {...props}
      />
      {show && filtered.length > 0 && (
        <ul className="autocomplete-list">
          {filtered.map((item, i) => (
            <li
              key={item}
              className={i === active ? 'active' : ''}
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
