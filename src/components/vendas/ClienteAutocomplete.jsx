import { useState, useRef, useEffect } from 'react'
import { navigateNext } from '../ui/AutocompleteInput'

export default function ClienteAutocomplete({
  value = '',
  onChange,
  onSelect,
  onEnterKey,
  onBlur,
  className = '',
  disabled = false,
  list = [],  // ✅ Recebe lista de clientes já carregada
}) {
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  // ✅ Normaliza clientes (string ou objeto) e filtra localmente
  const results = (list || [])
    .map(c => typeof c === 'string' ? c : c?.instagram)  // Converte objeto → string
    .filter(c => c && typeof c === 'string')  // Remove null/undefined
    .filter(item => !value?.trim() || item.toLowerCase().includes(value.toLowerCase()))
    .slice(0, 50)  // Máximo 50 sugestões

  // DEBUG: Log quando digita
  if (value?.trim()) {
    console.log('🔍 ClienteAutocomplete filtro:', {
      digitado: value,
      total_lista: list?.length || 0,
      encontrados: results.length,
      primeiros_3: results.slice(0, 3)
    })
  }

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
      // ✅ AUTO-SELECIONA o primeiro se tiver resultados (mesmo sem navegar com setas)
      if (visible && results.length > 0) {
        e.preventDefault()
        const chosen = activeIdx >= 0 ? results[activeIdx] : results[0]
        select(chosen)
      }
      setOpen(false); setActiveIdx(-1)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      // ✅ AUTO-SELECIONA o primeiro se tiver resultados (mesmo sem navegar com setas)
      if (visible && results.length > 0) {
        const chosen = activeIdx >= 0 ? results[activeIdx] : results[0]
        select(chosen)
        if (onEnterKey) {
          onEnterKey()
        } else {
          navigateNext(e.target)
        }
        return
      }
      // Se não tem resultados, só navega
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
        onFocus={() => { setActiveIdx(-1) }}
        onBlur={() => {
          setTimeout(() => {
            setOpen(false)
            setActiveIdx(-1)

            // ✅ VALIDA: Se digitou algo que NÃO existe na lista, LIMPA
            const valorDigitado = value?.trim().toLowerCase()
            if (valorDigitado) {
              const existe = list.some(c => {
                const instagram = typeof c === 'string' ? c : c?.instagram
                return instagram && instagram.toLowerCase() === valorDigitado
              })

              // Se não existe exatamente, limpa o campo
              if (!existe) {
                onChange('')
              }
            }
          }, 150)
          onBlur?.()
        }}
        onKeyDown={handleKeyDown}
      />
      {visible && (
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
