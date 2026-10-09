import { supabase } from '../lib/supabase'

const BUCKET_NAME = 'produtos-imagens'
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/**
 * Faz upload de uma imagem para o Supabase Storage
 * @param {File} file - Arquivo de imagem
 * @param {string} produtoId - ID do produto
 * @param {string} tenantId - ID do tenant
 * @returns {Promise<string>} URL pública da imagem
 */
export async function uploadImagemProduto(file, produtoId, tenantId) {
  // Validação de tipo
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Formato não suportado. Use JPG, PNG ou WEBP.')
  }

  // Validação de tamanho
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('Imagem muito grande. Máximo 5MB.')
  }

  // Gera nome único para o arquivo
  const timestamp = Date.now()
  const extensao = file.name.split('.').pop()
  const fileName = `${tenantId}/${produtoId}/${timestamp}.${extensao}`

  // Upload para o Supabase Storage
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false
    })

  if (error) {
    console.error('Erro ao fazer upload:', error)
    throw new Error('Erro ao fazer upload da imagem')
  }

  // Retorna URL pública
  const { data: publicUrl } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(data.path)

  return publicUrl.publicUrl
}

/**
 * Remove uma imagem do Supabase Storage
 * @param {string} url - URL da imagem
 */
export async function deleteImagemProduto(url) {
  try {
    // Extrai o path da URL
    const urlObj = new URL(url)
    const path = urlObj.pathname.split(`/${BUCKET_NAME}/`)[1]

    if (!path) {
      throw new Error('URL inválida')
    }

    // Remove do storage
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([path])

    if (error) {
      console.error('Erro ao deletar imagem:', error)
      throw error
    }
  } catch (err) {
    console.error('Erro ao deletar imagem:', err)
    throw new Error('Erro ao deletar imagem')
  }
}

/**
 * Atualiza as imagens de um produto no banco
 * @param {string} produtoId - ID do produto
 * @param {string[]} imagens - Array de URLs das imagens
 */
export async function atualizarImagensProduto(produtoId, imagens) {
  const { error } = await supabase
    .from('produtos')
    .update({ imagens })
    .eq('id', produtoId)

  if (error) {
    console.error('Erro ao atualizar imagens:', error)
    throw new Error('Erro ao salvar imagens no banco')
  }
}

/**
 * Busca as imagens de um produto
 * @param {string} produtoId - ID do produto
 * @returns {Promise<string[]>} Array de URLs das imagens
 */
export async function getImagensProduto(produtoId) {
  const { data, error } = await supabase
    .from('produtos')
    .select('imagens')
    .eq('id', produtoId)
    .single()

  if (error) {
    console.error('Erro ao buscar imagens:', error)
    return []
  }

  return data?.imagens || []
}
