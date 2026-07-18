import { useState, useRef, useEffect } from 'react'

/**
 * Dropdown pesquisável com tema escuro.
 * value/onChange: string simples (o que é exibido = o que é armazenado).
 * emptyLabel: texto da opção "vazia" (ex: "-- Todas --").
 */
export default function SearchableSelect({
  value = '',
  onChange,
  options = [],
  emptyLabel = '-- Selecione --',
  placeholder,
  disabled = false,
}) {
  const [inputVal, setInputVal] = useState(value)
  const [open,     setOpen]     = useState(false)
  const wrapRef = useRef(null)

  // Sincroniza valor externo
  useEffect(() => { setInputVal(value) }, [value])

  const query    = inputVal.trim().toLowerCase()
  const filtered = options.filter(o => !query || o.toLowerCase().includes(query))

  function select(opt) {
    setInputVal(opt)
    onChange(opt)
    setOpen(false)
  }

  function clear() {
    setInputVal('')
    onChange('')
    setOpen(false)
  }

  function handleChange(e) {
    const v = e.target.value
    setInputVal(v)
    setOpen(true)
    // Se o texto foi apagado completamente, limpa o valor
    if (!v.trim()) onChange('')
  }

  function handleBlur() {
    setTimeout(() => {
      if (wrapRef.current && !wrapRef.current.querySelector(':focus')) {
        // Se o que está no input não é uma opção válida, resets para o último valor válido
        if (!options.includes(inputVal)) {
          setInputVal(value)
        }
        setOpen(false)
      }
    }, 150)
  }

  const SI = {
    background: 'linear-gradient(180deg,#111b28,#0f1621)',
    border: '1px solid rgba(255,255,255,.12)',
    color: inputVal ? '#e6edf3' : 'rgba(255,255,255,.35)',
    borderRadius: 8, padding: '0 32px 0 12px',
    height: 44, fontSize: 14, outline: 'none', width: '100%',
    boxSizing: 'border-box', cursor: disabled ? 'not-allowed' : 'text',
    opacity: disabled ? 0.5 : 1,
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }} onBlur={handleBlur}>
      <input
        value={inputVal}
        onChange={handleChange}
        onFocus={() => !disabled && setOpen(true)}
        placeholder={placeholder || emptyLabel}
        autoComplete="off"
        disabled={disabled}
        style={SI}
      />
      {/* seta */}
      <span style={{
        position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
        pointerEvents: 'none', color: 'rgba(255,255,255,.4)', fontSize: 11,
      }}>▼</span>

      {open && !disabled && (
        <ul style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0,
          minWidth: '100%', zIndex: 300,
          background: '#111b28', border: '1px solid rgba(255,255,255,.18)',
          borderRadius: 8, margin: 0, padding: '4px 0', listStyle: 'none',
          maxHeight: 220, overflowY: 'auto',
          boxShadow: '0 8px 28px rgba(0,0,0,.55)',
        }}>
          {/* Opção vazia */}
          <li
            onMouseDown={e => { e.preventDefault(); clear() }}
            style={{
              padding: '8px 14px', fontSize: 13, cursor: 'pointer',
              color: 'rgba(255,255,255,.45)', borderBottom: '1px solid rgba(255,255,255,.08)',
              fontStyle: 'italic',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.06)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            {emptyLabel}
          </li>
          {filtered.length === 0 && (
            <li style={{ padding: '8px 14px', fontSize: 13, color: 'rgba(255,255,255,.3)' }}>
              Nenhum resultado
            </li>
          )}
          {filtered.map(opt => (
            <li
              key={opt}
              onMouseDown={e => { e.preventDefault(); select(opt) }}
              style={{
                padding: '8px 14px', fontSize: 14, cursor: 'pointer',
                color: value === opt ? '#60a5fa' : '#e6edf3',
                fontWeight: value === opt ? 700 : 400,
                borderBottom: '1px solid rgba(255,255,255,.04)',
                background: 'transparent',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.08)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
