/**
 * Formata valor em centavos para exibição (ex: 13990 -> "139,90")
 * @param {string|number} valor - Valor em centavos
 * @returns {string} - Valor formatado
 */
export function formatarMoedaInput(valor) {
  if (!valor && valor !== 0) return ''

  // Remove tudo que não é número
  const apenasNumeros = String(valor).replace(/\D/g, '')

  // Limita a 6 dígitos (9999,99 = 999999 centavos)
  const limitado = apenasNumeros.slice(0, 6)

  if (!limitado) return ''

  // Converte para número e divide por 100 para obter reais
  const numero = parseInt(limitado) / 100

  // Formata com vírgula
  return numero.toFixed(2).replace('.', ',')
}

/**
 * Remove formatação e retorna apenas números (centavos)
 * @param {string} valor - Valor formatado (ex: "139,90")
 * @returns {string} - Apenas números representando centavos (ex: "13990")
 */
export function parsearMoedaInput(valor) {
  if (!valor) return ''

  // Remove tudo que não é número
  const apenasNumeros = String(valor).replace(/\D/g, '')

  // Limita a 6 dígitos
  return apenasNumeros.slice(0, 6)
}

/**
 * Formata valor enquanto o usuário digita
 * @param {string} valorAtual - Valor atual do input
 * @param {string} novoValor - Novo valor digitado
 * @returns {string} - Valor formatado
 */
export function formatarAoDigitar(novoValor) {
  // Remove tudo que não é número
  const apenasNumeros = novoValor.replace(/\D/g, '')

  // Limita a 6 dígitos (max 9999,99)
  const limitado = apenasNumeros.slice(0, 6)

  if (!limitado) return ''

  // Converte para número e divide por 100
  const numero = parseInt(limitado) / 100

  // Formata com vírgula
  return numero.toFixed(2).replace('.', ',')
}
