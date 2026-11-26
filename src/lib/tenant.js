// ============================================================================
// A EMPRESA DA VEZ — o tenant_id é obrigatório, nunca tem padrão
// ============================================================================
// Vários serviços nasceram com `tenantId || import.meta.env.VITE_TENANT_ID`.
// Quando havia uma empresa só, isso era conveniência. Com o sistema vendido
// para várias, virou armadilha: a chamada que esquecia de passar o tenant não
// dava erro nenhum — lia e gravava na empresa do dono do sistema.
//
// Agora falta de tenant é erro na hora, com mensagem que a pessoa entende.
// Barulho na tela é melhor do que dado silenciosamente na empresa errada.
// ============================================================================

export function exigirTenant(tenantId, origem = '') {
  const id = typeof tenantId === 'string' ? tenantId.trim() : tenantId
  if (!id) {
    const onde = origem ? ` (${origem})` : ''
    throw new Error(
      `Empresa não identificada${onde}. Saia e entre de novo no sistema; ` +
      'se continuar, avise o suporte.'
    )
  }
  return id
}
