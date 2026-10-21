/**
 * Peso do romaneio em quilos, como o Melhor Envio espera.
 *
 * A balança da loja mostra gramas e é comum digitar 1168 em vez de 1,168.
 * Nenhum serviço dos Correios aceita acima de 30 kg, então um valor maior
 * que isso só pode estar em gramas.
 */
export function pesoEmKg(peso) {
  const n = Number(peso)
  if (!n || n <= 0) return 0
  return n > 30 ? n / 1000 : n
}
