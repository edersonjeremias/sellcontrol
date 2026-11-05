import { supabase } from '../lib/supabase'

// ════════════════════════════════════════════════════════════════
// Anexos de mensagens (Contatos, Notificações e Portal do cliente)
// Guarda os arquivos no bucket público `anexos` do Supabase Storage
// e devolve um objeto { url, nome, tipo, tamanho } que é salvo na
// coluna jsonb `anexos` da mensagem.
// ════════════════════════════════════════════════════════════════

export const BUCKET_ANEXOS = 'anexos'
export const MAX_ANEXO_BYTES = 10 * 1024 * 1024   // 10MB por arquivo
export const MAX_ANEXOS      = 5                  // por mensagem

export const TIPOS_IMAGEM = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
export const TIPOS_ACEITOS = [...TIPOS_IMAGEM, 'application/pdf']
export const ACCEPT_ANEXO  = 'image/jpeg,image/png,image/webp,image/gif,application/pdf'

export function ehImagem(tipo) {
  return TIPOS_IMAGEM.includes(String(tipo || '').toLowerCase())
}

export function ehPdf(tipo) {
  return String(tipo || '').toLowerCase() === 'application/pdf'
}

export function fmtTamanho(bytes) {
  const n = Number(bytes) || 0
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

// Devolve string com o erro, ou null quando o arquivo está ok
export function validarAnexo(file) {
  if (!file) return 'Arquivo inválido.'
  const tipo = String(file.type || '').toLowerCase()
  if (!TIPOS_ACEITOS.includes(tipo)) {
    return `"${file.name || 'arquivo'}" não é suportado. Envie imagem (JPG, PNG, WEBP, GIF) ou PDF.`
  }
  if (file.size > MAX_ANEXO_BYTES) {
    return `"${file.name || 'arquivo'}" tem ${fmtTamanho(file.size)}. O limite é 10MB.`
  }
  return null
}

function extensaoDe(file) {
  const tipo = String(file.type || '').toLowerCase()
  if (tipo === 'application/pdf') return 'pdf'
  if (tipo === 'image/png')  return 'png'
  if (tipo === 'image/webp') return 'webp'
  if (tipo === 'image/gif')  return 'gif'
  if (tipo === 'image/jpeg' || tipo === 'image/jpg') return 'jpg'
  const pelosNome = String(file.name || '').split('.').pop()
  return (pelosNome && pelosNome.length <= 5) ? pelosNome.toLowerCase() : 'bin'
}

function idUnico() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

// Imagem colada da área de transferência chega sem nome útil ("image.png")
export function nomeAmigavel(file) {
  const nome = String(file?.name || '').trim()
  if (nome && nome.toLowerCase() !== 'image.png' && nome.toLowerCase() !== 'blob') return nome
  const ext = extensaoDe(file)
  const d = new Date()
  const pad = (v) => String(v).padStart(2, '0')
  return `colado-${pad(d.getDate())}${pad(d.getMonth() + 1)}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.${ext}`
}

/**
 * Sobe um arquivo e devolve o registro do anexo.
 * @param {File} file
 * @param {string} pasta  'contatos' | 'notificacoes' — só organiza o bucket
 * @param {object} client cliente Supabase (use portalSb no portal do cliente)
 */
export async function uploadAnexo(file, pasta = 'mensagens', client = supabase) {
  const erro = validarAnexo(file)
  if (erro) throw new Error(erro)

  const d = new Date()
  const competencia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  const caminho = `${pasta}/${competencia}/${idUnico()}.${extensaoDe(file)}`

  const { data, error } = await client.storage
    .from(BUCKET_ANEXOS)
    .upload(caminho, file, { cacheControl: '31536000', upsert: false, contentType: file.type })

  if (error) {
    console.error('Erro ao subir anexo:', error)
    throw new Error('Não foi possível enviar o anexo. Tente novamente.')
  }

  const { data: pub } = client.storage.from(BUCKET_ANEXOS).getPublicUrl(data.path)

  return {
    url: pub.publicUrl,
    nome: nomeAmigavel(file),
    tipo: String(file.type || '').toLowerCase(),
    tamanho: file.size,
  }
}

export async function uploadAnexos(files, pasta = 'mensagens', client = supabase) {
  const lista = Array.from(files || [])
  if (!lista.length) return []
  return Promise.all(lista.map(f => uploadAnexo(f, pasta, client)))
}

// Normaliza o que vem do banco — jsonb pode voltar como array, string ou null
export function normalizarAnexos(valor) {
  if (!valor) return []
  if (Array.isArray(valor)) return valor.filter(a => a && a.url)
  if (typeof valor === 'string') {
    try { return normalizarAnexos(JSON.parse(valor)) } catch { return [] }
  }
  return []
}

// Resumo de uma mensagem que pode ser só anexo (usado em listas e cards)
export function resumoMensagem(texto, anexos) {
  const t = String(texto || '').trim()
  if (t) return t
  const lista = normalizarAnexos(anexos)
  if (!lista.length) return ''
  if (lista.length > 1) return `${lista.length} anexos`
  return ehImagem(lista[0].tipo) ? 'Imagem' : (lista[0].nome || 'Arquivo')
}
