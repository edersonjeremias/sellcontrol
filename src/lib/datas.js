// ── Datas no fuso local ────────────────────────────────────────
// Dois enganos fáceis com datas aqui, os dois já viraram bug em tela:
//
// 1. Colunas DATE do Postgres chegam como 'YYYY-MM-DD'. new Date('2026-10-15')
//    é meia-noite UTC — no Brasil (-03) isso ainda é dia 14, e a tela mostrava
//    um dia a menos.
// 2. new Date().toISOString().slice(0, 10) devolve o dia em UTC. Depois das
//    21h no Brasil, isso já é o dia seguinte, e o registro nascia com a data
//    de amanhã.
//
// Os helpers abaixo trabalham sempre no fuso de quem está usando o sistema.
// Valores com hora (TIMESTAMPTZ) não precisam disso: new Date() já os converte
// corretamente.

// Converte para Date respeitando o fuso local. Sempre devolve uma cópia,
// porque quem chama costuma reaproveitar o mesmo Date entre as linhas.
export function parseDateLocal(dateValue) {
  if (!dateValue) return null
  if (dateValue instanceof Date) {
    return Number.isNaN(dateValue.getTime()) ? null : new Date(dateValue.getTime())
  }
  const str = String(dateValue)
  const puro = str.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (puro) return new Date(Number(puro[1]), Number(puro[2]) - 1, Number(puro[3]))
  const date = new Date(str)
  return Number.isNaN(date.getTime()) ? null : date
}

// 'YYYY-MM-DD' do dia local — use no lugar de toISOString().slice(0, 10)
export function toDateOnly(dateValue) {
  const date = parseDateLocal(dateValue)
  if (!date) return null
  const mes = String(date.getMonth() + 1).padStart(2, '0')
  const dia = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${mes}-${dia}`
}

// Data de hoje em 'YYYY-MM-DD'
export function hojeISO() {
  return toDateOnly(new Date())
}

// 'YYYY-MM-DD' ou Date → '15/10/2026'
export function formatDateBr(dateValue) {
  const date = parseDateLocal(dateValue)
  if (!date) return ''
  return date.toLocaleDateString('pt-BR')
}
