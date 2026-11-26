// ============================================================================
// Link da bio — página aberta  (/bio/:slug)
// ============================================================================
// É o link que vai na bio do Instagram: abre sem login, no celular, e não
// carrega nada do sistema além do necessário. Os dados vêm de uma chamada só
// (bio_publica), que devolve apenas o que esta página mostra.
// ============================================================================

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import BioRender from '../../components/bio/BioRender'
import { buscarBioPublica, registrarCliqueBio } from '../../services/bioService'

function Aviso({ titulo, texto }) {
  return (
    <div className="bio-aviso">
      <b>{titulo}</b>
      <p>{texto}</p>
    </div>
  )
}

export default function BioPage() {
  const { slug } = useParams()
  const [estado, setEstado] = useState('carregando') // carregando|ok|vazia|fora|erro
  const [dados, setDados] = useState(null)
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    let vivo = true
    setEstado('carregando')

    buscarBioPublica(slug)
      .then(r => {
        if (!vivo) return
        if (!r?.encontrada) { setEstado('vazia'); return }
        if (!r?.ativa)      { setEstado('fora'); return }
        setDados(r)
        setEstado('ok')
      })
      .catch(() => { if (vivo) setEstado('erro') })

    return () => { vivo = false }
  }, [slug])

  // O nome na aba do navegador e a cor da barra do celular: é a marca da loja
  // que a cliente tem de ver, não "SellControl".
  useEffect(() => {
    const p = dados?.pagina
    if (!p) return
    const anterior = document.title
    document.title = p.titulo || 'Links'

    const meta = document.querySelector('meta[name="theme-color"]')
      || document.head.appendChild(Object.assign(document.createElement('meta'), { name: 'theme-color' }))
    const corAnterior = meta.getAttribute('content')
    meta.setAttribute('content', p.cor_fundo || '#121212')

    return () => {
      document.title = anterior
      if (corAnterior) meta.setAttribute('content', corAnterior)
    }
  }, [dados])

  function mostrarAviso(texto) {
    setAviso(texto)
    setTimeout(() => setAviso(''), 2400)
  }

  function aoClicar({ link, copiado, pix, mensagem }) {
    if (link?.id) registrarCliqueBio(link.id)
    if (!copiado) return
    mostrarAviso(pix ? 'Chave Pix copiada' : mensagem ? 'Mensagem e link copiados' : 'Link copiado')
  }

  if (estado === 'carregando') {
    return <Aviso titulo="Carregando…" texto="Um instante." />
  }
  if (estado === 'vazia') {
    return <Aviso titulo="Página não encontrada" texto="Confira o endereço que você digitou." />
  }
  if (estado === 'fora') {
    return <Aviso titulo="Página fora do ar" texto="Esta página de links está desativada no momento." />
  }
  if (estado === 'erro') {
    return <Aviso titulo="Não foi possível abrir" texto="Confira sua conexão e tente de novo." />
  }

  return (
    <>
      <BioRender pagina={dados.pagina} links={dados.links || []} onClique={aoClicar} />
      {aviso && (
        <div style={{
          position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)',
          background: '#1e1e1e', color: '#fff', padding: '12px 20px', borderRadius: 8,
          fontSize: 14, fontFamily: 'system-ui, -apple-system, sans-serif',
          boxShadow: '0 8px 24px rgba(0,0,0,0.8)', zIndex: 100,
        }}>
          {aviso}
        </div>
      )}
    </>
  )
}
