import { useState, useRef, useEffect } from 'react'

function fmtBr(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export default function DateSearchInput({ value, onChange, options = [], placeholder = 'DD/MM/AAAA' }) {
  const [inputVal,   setInputVal]   = useState(value ? fmtBr(value) : '')
  const [open,       setOpen]       = useState(false)
  const [activeIdx,  setActiveIdx]  = useState(-1)
  const wrapRef  = useRef(null)
  const listRef  = useRef(null)

  useEffect(() => {
    setInputVal(value ? fmtBr(value) : '')
  }, [value])

  const digits   = inputVal.replace(/\D/g, '')
  const filtered = options.filter(iso => {
    if (!digits) return true
    return fmtBr(iso).replace(/\D/g, '').startsWith(digits)
  })

  function select(iso) {
    setInputVal(fmtBr(iso))
    onChange(iso)
    setOpen(false)
    setActiveIdx(-1)
  }

  function handleChange(e) {
    const v = e.target.value
    setInputVal(v)
    setOpen(true)
    setActiveIdx(-1)
    const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    onChange(m ? `${m[3]}-${m[2]}-${m[1]}` : '')
  }

  function handleKeyDown(e) {
    if (!open && e.key !== 'ArrowDown') return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) { setOpen(true); setActiveIdx(0); return }
      setActiveIdx(i => (i + 1 >= filtered.length ? 0 : i + 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => (i - 1 < 0 ? filtered.length - 1 : i - 1))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const idx = activeIdx >= 0 ? activeIdx : 0
      if (filtered[idx]) select(filtered[idx])
      return
    }
    if (e.key === 'Escape') {
      setOpen(false)
      setActiveIdx(-1)
    }
  }

  // Mantém o item ativo visível no scroll
  useEffect(() => {
    if (activeIdx >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('li')
      items[activeIdx]?.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIdx])

  useEffect(() => {
    function handler(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const SI = {
    background: 'linear-gradient(180deg,#111b28,#0f1621)',
    border: '1px solid rgba(255,255,255,.12)',
    color: '#e6edf3', borderRadius: 8, padding: '0 12px',
    height: 44, fontSize: 14, outline: 'none', width: '100%',
    colorScheme: 'dark', boxSizing: 'border-box',
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <input
        value={inputVal}
        onChange={handleChange}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        style={SI}
      />
      {open && filtered.length > 0 && (
        <ul ref={listRef} style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0,
          minWidth: '100%', zIndex: 200,
          background: '#111b28', border: '1px solid rgba(255,255,255,.18)',
          borderRadius: 8, margin: 0, padding: '4px 0', listStyle: 'none',
          maxHeight: 220, overflowY: 'auto',
          boxShadow: '0 8px 28px rgba(0,0,0,.55)',
        }}>
          {filtered.map((iso, i) => (
            <li
              key={iso}
              onMouseDown={e => { e.preventDefault(); select(iso) }}
              onMouseEnter={() => setActiveIdx(i)}
              style={{
                padding: '8px 14px', fontSize: 14, cursor: 'pointer',
                color: value === iso ? '#60a5fa' : '#e6edf3',
                fontWeight: value === iso ? 700 : 400,
                borderBottom: '1px solid rgba(255,255,255,.05)',
                background: i === activeIdx ? 'rgba(255,255,255,.1)' : 'transparent',
              }}
            >
              {fmtBr(iso)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
