// Status de peça que não vai ser enviada: ou já saiu, ou virou crédito, ou
// caiu. Cada loja cadastra os próprios nomes em status_expedicao, então a
// comparação é feita em maiúsculas e sem acento — comparar com o texto exato
// deixava passar variantes como "Crédito gerado", que a loja criou depois.
//
// A mesma regra roda no banco, na função producao_pecas_pendentes, para a
// contagem da coluna PEÇAS bater com o que as telas mostram.
const FORA_DA_SACOLINHA = [
  'ENVIADO', 'CANCELADO', 'DEVOLUCAO', 'GERAR CREDITO', 'CREDITO GERADO',
]

export function normalizaStatus(valor) {
  return (valor || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
}

// A tela de Vendas grava 'ENVIADO', em maiúsculas, ao disparar a cobrança da
// peça; a Expedição grava 'Enviado' junto com a data do despacho. Como a
// comparação acima é feita em maiúsculas, os dois caíam na mesma regra: a peça
// que só teve a cobrança enviada sumia da fila de separação e aparecia como
// enviada no portal da cliente.
const COBRANCA_ENVIADA = 'ENVIADO'

// A peça ainda está na sacolinha da cliente, esperando envio?
export function pecaNaSacolinha(status) {
  const bruto = String(status || '').trim()
  if (bruto === COBRANCA_ENVIADA) return true
  return !FORA_DA_SACOLINHA.includes(normalizaStatus(bruto))
}

// Lista literal para o PostgREST já devolver menos linhas. Não substitui
// pecaNaSacolinha: o banco compara texto exato, então quem decide é o filtro
// aplicado no resultado.
export const STATUS_FORA_SQL =
  '("Enviado","Cancelado","Devolução","Gerar Crédito","Crédito gerado")'
