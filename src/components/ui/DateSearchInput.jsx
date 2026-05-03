import { useState, useRef, useEffect } from 'react'

function fmtBr(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export default function DateSearchInput({ value, onChange, options = [], placeholder = 'DD/MM/AAAA' }) {
  const [inputVal, setInputVal] = useState(value ? fmtBr(value) : '')
  const [open, setOpen]         = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    setInputVal(value ? fmtBr(value) : '')
  }, [value])

  const digits = inputVal.replace(/\D/g, '')
  const filtered = options.filter(iso => {
    if (!digits) return true
    return fmtBr(iso).replace(/\D/g, '').startsWith(digits)
  })

  function select(iso) {
    setInputVal(fmtBr(iso))
    onChange(iso)
    setOpen(false)
  }

  function handleChange(e) {
    const v = e.target.value
    setInputVal(v)
    setOpen(true)
    // tenta parsear DD/MM/AAAA completo
    const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    onChange(m ? `${m[3]}-${m[2]}-${m[1]}` : '')
  }

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
        placeholder={placeholder}
        autoComplete="off"
        style={SI}
      />
      {open && filtered.length > 0 && (
        <ul style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0,
          minWidth: '100%', zIndex: 200,
          background: '#111b28', border: '1px solid rgba(255,255,255,.18)',
          borderRadius: 8, margin: 0, padding: '4px 0', listStyle: 'none',
          maxHeight: 220, overflowY: 'auto',
          boxShadow: '0 8px 28px rgba(0,0,0,.55)',
        }}>
          {filtered.map(iso => (
            <li
              key={iso}
              onMouseDown={e => { e.preventDefault(); select(iso) }}
              style={{
                padding: '8px 14px', fontSize: 14, cursor: 'pointer',
                color: value === iso ? '#60a5fa' : '#e6edf3',
                fontWeight: value === iso ? 700 : 400,
                borderBottom: '1px solid rgba(255,255,255,.05)',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.08)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {fmtBr(iso)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
