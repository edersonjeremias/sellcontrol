// Pedaços de interface compartilhados pelas abas de Frete e Romaneios

export const S = {
  inp: {
    background: 'var(--input-bg)', border: '1px solid var(--input-border)',
    borderRadius: 6, color: 'var(--input-text)', padding: '7px 10px',
    fontSize: 13, outline: 'none',
  },
  btn: {
    background: 'var(--blue)', color: '#0f0f0f', border: 'none', borderRadius: 6,
    padding: '8px 16px', fontWeight: 700, cursor: 'pointer', fontSize: 13,
  },
  ok: {
    background: 'var(--green)', color: '#0f0f0f', border: 'none', borderRadius: 6,
    padding: '8px 16px', fontWeight: 700, cursor: 'pointer', fontSize: 13,
  },
  sec: {
    background: 'var(--btn-cancel-bg)', color: 'var(--btn-cancel-text)', border: 'none',
    borderRadius: 6, padding: '8px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 13,
  },
}

export const LABEL_STATUS = {
  preparando: 'Preparando',
  pronto: 'Pronto',
  frete_cotado: 'Cotado',
  frete_pago: 'Frete Pago',
  etiqueta_gerada: 'Etiqueta Gerada',
  despachado: 'Despachado',
  em_transito: 'Em trânsito',
  entregue: 'Entregue',
  retirado: 'Retirado na loja',
  cancelado: 'Cancelado',
}

export const COR_STATUS = {
  entregue: '#81c995',
  retirado: '#ce93d8',
  despachado: '#4caf50',
  etiqueta_gerada: '#2196f3',
  frete_pago: '#ffc107',
  frete_cotado: '#9c27b0',
  cancelado: '#f44336',
}

export const LABEL_METODO = {
  pix: 'PIX',
  cartao: 'Cartão',
  boleto: 'Boleto',
  manual: 'Baixa manual',
  credito: 'Crédito',
  cortesia: 'Cortesia',
  credit_card: 'Cartão de crédito',
  debit_card: 'Cartão de débito',
  account_money: 'Saldo MP',
  bolbradesco: 'Boleto',
}

// ── Datas ───────────────────────────────────────────────────────────────────
// yyyy-mm-dd no fuso local: toISOString() devolve o dia seguinte à noite,
// porque converte para UTC e o Brasil fica atrás dele.
export function isoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function primeiroDiaMes() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export function ultimoDiaMes() {
  const d = new Date()
  const fim = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return isoLocal(fim)
}

export function fmtData(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

export function fmtDataHora(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const data = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  const hora = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return `${data} ${hora}`
}

// ── Valores ─────────────────────────────────────────────────────────────────
export function parseValor(s) {
  if (s === null || s === undefined || s === '') return ''
  return parseFloat(String(s).replace(/\./g, '').replace(',', '.')) || 0
}

export function mascaraValor(s) {
  let v = String(s).replace(/\D/g, '')
  if (!v) return ''
  v = (parseInt(v, 10) / 100).toFixed(2)
  return v.replace('.', ',').replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1.')
}

/** Busca multi-termo por vírgula: todos os termos precisam aparecer na linha */
export function casaBusca(texto, busca) {
  if (!busca?.trim()) return true
  const termos = busca.toLowerCase().split(',').map(t => t.trim()).filter(Boolean)
  if (!termos.length) return true
  const alvo = String(texto || '').toLowerCase()
  return termos.every(t => alvo.includes(t))
}
