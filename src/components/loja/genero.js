// ============================================================================
// Para quem a peça é
// ============================================================================
// No cadastro o público é uma letra (M, F, U, INF, BB) porque a coluna da
// planilha é estreita e quem digita o dia inteiro não quer escolher texto
// comprido. Na vitrine ninguém procura "F": o rótulo vai por extenso.
// ============================================================================

const ROTULOS = {
  m: 'Masculino',
  f: 'Feminino',
  u: 'Unissex',
  inf: 'Infantil',
  bb: 'Bebê',
}

export function rotuloGenero(valor) {
  const chave = String(valor || '').trim().toLowerCase()
  if (!chave) return ''
  // Valor cadastrado por extenso aparece como a loja escreveu
  return ROTULOS[chave] || String(valor).trim()
}
