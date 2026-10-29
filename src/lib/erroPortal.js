// Traduz erros do Supabase/Postgres para algo que o cliente entenda, mantendo
// o código original entre parênteses — é por ele que a loja consegue
// identificar a causa quando o cliente manda print da tela.
const POR_CODIGO = {
  '23505': 'Já existe um cadastro com esses dados.',
  '23503': 'Não foi possível vincular ao seu cadastro.',
  '23502': 'Faltou preencher um campo obrigatório.',
  '22001': 'Algum campo ficou maior que o permitido.',
  '22007': 'Alguma data está em formato inválido.',
  '42501': 'Sem permissão para salvar. Saia e entre de novo no portal.',
  '42703': 'O aplicativo está desatualizado. Recarregue a página.',
  'PGRST204': 'O aplicativo está desatualizado. Recarregue a página.',
  'PGRST301': 'Sua sessão expirou. Entre de novo no portal.',
}

export function mensagemErro(err, padrao = 'Não foi possível concluir') {
  if (!err) return padrao

  const texto = err.message || String(err)

  if (/failed to fetch|networkerror|load failed/i.test(texto)) {
    return 'Sem conexão com a internet. Confira a rede e tente de novo.'
  }

  const conhecido = POR_CODIGO[err.code]
  if (conhecido) return `${conhecido} (${err.code})`

  return `${padrao}: ${texto}`
}
