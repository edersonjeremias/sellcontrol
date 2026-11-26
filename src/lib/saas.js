// ============================================================================
// DADOS DO SAAS — quem vende o sistema
// ============================================================================
// O sistema é assinado por várias empresas. Este arquivo guarda o contato de
// quem vende, usado quando a empresa tenta abrir um módulo que não contratou.
//
// O número fica em variável de ambiente (VITE_SAAS_WHATSAPP, só dígitos com
// DDI e DDD, ex: 5547999999999) para não ficar escrito no código que vai para
// o navegador de todas as empresas. Sem a variável, a tela de módulo não
// contratado some o botão e só mostra o aviso.
// ============================================================================

export const NOME_SISTEMA = import.meta.env.VITE_SAAS_NOME || 'SellControl'

export const whatsappSuporte = () =>
  String(import.meta.env.VITE_SAAS_WHATSAPP || '').replace(/\D/g, '')

export function linkWhatsappSuporte(mensagem = '') {
  const numero = whatsappSuporte()
  if (!numero) return ''
  const texto = mensagem ? `?text=${encodeURIComponent(mensagem)}` : ''
  return `https://wa.me/${numero}${texto}`
}
