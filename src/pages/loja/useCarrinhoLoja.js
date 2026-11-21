import { useState, useEffect, useCallback, useRef } from 'react'
import { buscarCarrinho, reservarPeca, liberarPeca } from '../../services/lojaService'

// ============================================================================
// Carrinho da loja pública
// ============================================================================
// Quem guarda a reserva é o banco; aqui fica só o id do pedido, no
// localStorage, para a cliente não perder o carrinho ao recarregar a página ou
// ao abrir a peça pelo link do Instagram.
//
// O id do pedido é a credencial do carrinho. Fica por loja: duas lojas no
// mesmo navegador não se misturam.
// ============================================================================

const chaveDe = (slug) => `sc_loja_pedido_${slug}`

export function lerPedidoSalvo(slug) {
  try {
    return localStorage.getItem(chaveDe(slug)) || null
  } catch {
    return null // navegador com armazenamento bloqueado: o carrinho vive só nesta visita
  }
}

function salvarPedido(slug, id) {
  try {
    if (id) localStorage.setItem(chaveDe(slug), id)
    else localStorage.removeItem(chaveDe(slug))
  } catch {}
}

export default function useCarrinhoLoja(slug, avisar) {
  const [carrinho, setCarrinho] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [restante, setRestante] = useState(0) // segundos até a reserva cair

  const pedidoRef = useRef(lerPedidoSalvo(slug))
  const avisarRef = useRef(avisar)
  useEffect(() => { avisarRef.current = avisar }, [avisar])

  const aplicar = useCallback((resposta) => {
    const novo = resposta?.carrinho || null
    setCarrinho(novo)
    pedidoRef.current = novo?.pedido_id || null
    salvarPedido(slug, pedidoRef.current)
    return novo
  }, [slug])

  // Carrinho da visita anterior
  useEffect(() => {
    if (!slug || !pedidoRef.current) return
    let vivo = true
    buscarCarrinho(slug, pedidoRef.current)
      .then(r => { if (vivo) aplicar(r) })
      .catch(() => {}) // carrinho vencido não é erro para quem está chegando
    return () => { vivo = false }
  }, [slug, aplicar])

  // Cronômetro da reserva
  useEffect(() => {
    const limite = carrinho?.reserva_expira_em ? new Date(carrinho.reserva_expira_em).getTime() : 0
    if (!limite) {
      setRestante(0)
      return
    }

    const tique = () => {
      const segundos = Math.max(0, Math.round((limite - Date.now()) / 1000))
      setRestante(segundos)
      if (segundos === 0) {
        // A reserva caiu: as peças voltaram ao catálogo e o carrinho morreu
        setCarrinho(null)
        pedidoRef.current = null
        salvarPedido(slug, null)
        avisarRef.current?.('O tempo da reserva acabou e as peças voltaram para a loja', 'error')
      }
    }

    tique()
    const timer = setInterval(tique, 1000)
    return () => clearInterval(timer)
  }, [carrinho?.reserva_expira_em, slug])

  const adicionar = useCallback(async (produtoId) => {
    if (ocupado) return false
    setOcupado(true)
    try {
      const r = await reservarPeca(slug, produtoId, pedidoRef.current)
      aplicar(r)
      avisarRef.current?.('Peça guardada no seu carrinho', 'success')
      return true
    } catch (err) {
      // 409: outra cliente levou a peça, ou ela saiu do ar
      avisarRef.current?.(err.message || 'Não foi possível guardar a peça', 'error')
      // O id devolvido no conflito é o carrinho que continua valendo
      if (err.dados?.pedido_id) {
        pedidoRef.current = err.dados.pedido_id
        salvarPedido(slug, err.dados.pedido_id)
      }
      return false
    } finally {
      setOcupado(false)
    }
  }, [slug, ocupado, aplicar])

  const remover = useCallback(async (produtoId) => {
    if (ocupado || !pedidoRef.current) return
    setOcupado(true)
    try {
      const r = await liberarPeca(slug, produtoId, pedidoRef.current)
      aplicar(r)
      avisarRef.current?.('Peça devolvida para a loja', 'info')
    } catch (err) {
      avisarRef.current?.(err.message || 'Não foi possível tirar a peça', 'error')
    } finally {
      setOcupado(false)
    }
  }, [slug, ocupado, aplicar])

  const itens = carrinho?.itens || []
  const temNoCarrinho = useCallback(
    (produtoId) => itens.some(i => i.produto_id === produtoId),
    [itens]
  )

  return {
    carrinho,
    itens,
    quantidade: itens.length,
    valorItens: carrinho?.valor_itens || 0,
    restante,
    ocupado,
    adicionar,
    remover,
    temNoCarrinho,
  }
}
