// ============================================================================
// Aba: Link da Bio
// ============================================================================
// Monta a página de links que a loja põe na bio do Instagram — o que o
// Linktree faz, só que dentro do sistema, sem propaganda de terceiro e com o
// endereço da própria empresa.
//
// Multi-tenant: cada empresa tem a sua página, com slug único, e esta tela
// mexe só na do tenant de quem está logado.
//
// A pré-visualização ao lado é o MESMO componente que desenha a página
// pública. O que aparece aqui é o que a cliente vê — não uma imitação.
// ============================================================================

import { useState, useEffect, useMemo, useRef } from 'react'
import { getConfig } from '../../services/configService'
import {
  BIO_PADRAO, getBioPagina, getBioLinks, salvarBioPagina, salvarBioLinks,
  uploadLogoBio, removerLogoBio, normalizarSlug, linkBio,
} from '../../services/bioService'
import { montarUrlBio, valorVisivelBio, textoCompartilhar } from '../../lib/bioUrl'
import { rotuloTipo } from '../../components/bio/IconesBio'
import EditorLinks from '../../components/bio/EditorLinks'
import BioRender from '../../components/bio/BioRender'

// ── Estilos locais, no padrão das outras abas ───────────────────────────────
const inputStyle = {
  width: '100%', padding: '10px 12px', background: '#1e1e1e',
  border: '1px solid #333', borderRadius: 8, color: '#fff', fontSize: 14,
  colorScheme: 'dark',
}

const labelStyle = { display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }

const cardStyle = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid var(--border-light)',
  borderRadius: 12,
  padding: 24,
  marginTop: 20,
}

const tituloCard = { margin: '0 0 8px 0', color: 'var(--blue)', fontSize: 16 }
const textoCard  = { color: 'var(--muted)', fontSize: 13, marginBottom: 20 }

const botaoLeve = {
  padding: '10px 15px', borderRadius: 8, border: '1px solid var(--border-light)',
  background: 'rgba(255,255,255,0.03)', color: 'var(--blue)', fontSize: 14,
  fontWeight: 600, cursor: 'pointer',
}

// ── Temas prontos ───────────────────────────────────────────────────────────
// Quem está configurando não quer escolher seis cores: quer que fique bonito.
// As cores soltas continuam ali embaixo para quem quiser ajustar.
const TEMAS = [
  { nome: 'Preto',   fundo_tipo: 'cor',       cor_fundo: '#000000', cor_fundo2: '#000000', cor_texto: '#ffffff', cor_botao: '#121212', cor_texto_botao: '#ffffff' },
  { nome: 'Grafite', fundo_tipo: 'cor',       cor_fundo: '#121212', cor_fundo2: '#121212', cor_texto: '#ffffff', cor_botao: '#1e1e1e', cor_texto_botao: '#ffffff' },
  { nome: 'Claro',   fundo_tipo: 'cor',       cor_fundo: '#f4f4f5', cor_fundo2: '#f4f4f5', cor_texto: '#18181b', cor_botao: '#ffffff', cor_texto_botao: '#18181b' },
  { nome: 'Areia',   fundo_tipo: 'cor',       cor_fundo: '#efe7dd', cor_fundo2: '#efe7dd', cor_texto: '#3a322a', cor_botao: '#3a322a', cor_texto_botao: '#efe7dd' },
  { nome: 'Noite',   fundo_tipo: 'gradiente', cor_fundo: '#0f172a', cor_fundo2: '#1e293b', cor_texto: '#e2e8f0', cor_botao: '#38bdf8', cor_texto_botao: '#0f172a' },
  { nome: 'Rosé',    fundo_tipo: 'gradiente', cor_fundo: '#2b1b24', cor_fundo2: '#4a2b3a', cor_texto: '#f3e3ea', cor_botao: '#e8b4c8', cor_texto_botao: '#2b1b24' },
  { nome: 'Verde',   fundo_tipo: 'gradiente', cor_fundo: '#0f1f17', cor_fundo2: '#1b3a2a', cor_texto: '#e6f2ea', cor_botao: '#81c995', cor_texto_botao: '#0f1f17' },
]

const ESTILOS_BOTAO = [
  { valor: 'solido',   rotulo: 'Sólido' },
  { valor: 'contorno', rotulo: 'Contorno' },
  { valor: 'suave',    rotulo: 'Suave' },
]

const RAIOS = [
  { valor: 'reto',         rotulo: 'Reto' },
  { valor: 'arredondado',  rotulo: 'Arredondado' },
  { valor: 'pilula',       rotulo: 'Pílula' },
]

function Chip({ ativo, children, onClick, cor }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '7px 14px', borderRadius: 999, cursor: 'pointer', fontSize: 13,
        fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8,
        border: '1px solid ' + (ativo ? 'var(--blue)' : 'var(--border-light)'),
        background: ativo ? 'rgba(138,180,248,0.12)' : 'rgba(255,255,255,0.03)',
        color: ativo ? 'var(--blue)' : 'var(--text-body)',
        transition: 'all .15s',
      }}
    >
      {cor && (
        <span style={{
          width: 14, height: 14, borderRadius: '50%', background: cor,
          border: '1px solid rgba(255,255,255,0.2)', display: 'inline-block',
        }} />
      )}
      {children}
    </button>
  )
}

function CampoCor({ rotulo, valor, onChange }) {
  return (
    <div>
      <label style={labelStyle}>{rotulo}</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="color"
          value={valor || '#000000'}
          onChange={e => onChange(e.target.value)}
          style={{
            width: 42, height: 38, padding: 2, borderRadius: 8, cursor: 'pointer',
            background: '#1e1e1e', border: '1px solid #333', flexShrink: 0,
          }}
        />
        <input
          value={valor || ''}
          onChange={e => onChange(e.target.value)}
          style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 13 }}
          placeholder="#121212"
        />
      </div>
    </div>
  )
}

function novoId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export default function AbaBio({ tenantId, showToast }) {
  const [pagina, setPagina]   = useState(BIO_PADRAO)
  const [links, setLinks]     = useState([])
  const [removidos, setRemovidos] = useState([])
  const [cfgLoja, setCfgLoja] = useState({ slug: '', nome_loja: '', whatsapp: '', loja_ativa: false })
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [enviandoLogo, setEnviandoLogo] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const arquivoRef = useRef(null)

  // ── Carga inicial ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tenantId) return
    let vivo = true

    Promise.all([getConfig(tenantId), getBioPagina(tenantId), getBioLinks(tenantId)])
      .then(([cfg, bio, lista]) => {
        if (!vivo) return

        setCfgLoja({
          slug: cfg?.slug || '',
          nome_loja: cfg?.nome_loja || '',
          whatsapp: cfg?.whatsapp || '',
          loja_ativa: cfg?.loja_ativa === true,
        })

        // Página que ainda não existe começa com o que o sistema já sabe:
        // o endereço e o nome da loja. Ninguém precisa redigitar.
        setPagina(bio || {
          ...BIO_PADRAO,
          slug: cfg?.slug || '',
          titulo: cfg?.nome_loja || '',
        })

        setLinks((lista || []).map(l => ({
          id: l.id,
          grupo: l.grupo,
          tipo: l.tipo,
          titulo: l.titulo || '',
          subtitulo: l.subtitulo || '',
          valor: valorVisivelBio(l.tipo, l.url),
          ativo: l.ativo,
          destaque: l.destaque,
          cliques: l.cliques || 0,
        })))
      })
      .catch(e => showToast('Erro ao carregar: ' + e.message, 'error'))
      .finally(() => { if (vivo) setCarregando(false) })

    return () => { vivo = false }
  }, [tenantId, showToast])

  // ── Listas separadas por grupo, preservando a ordem ───────────────────────
  const sociais = links.filter(l => l.grupo === 'social')
  const botoes  = links.filter(l => l.grupo !== 'social')

  // O que a pré-visualização mostra: o endereço já montado, como vai para o ar
  const previa = useMemo(() => links
    .filter(l => l.ativo !== false)
    .map(l => ({
      ...l,
      titulo: l.titulo || rotuloTipo(l.tipo),
      url: montarUrlBio(l.tipo, l.valor),
    })), [links])

  const endereco = linkBio(normalizarSlug(pagina.slug))

  // ── Mexidas na lista ──────────────────────────────────────────────────────
  function mudarPagina(campos) {
    setPagina(p => ({ ...p, ...campos }))
  }

  function mudarLink(id, campos) {
    setLinks(prev => prev.map(l => (l.id === id ? { ...l, ...campos } : l)))
  }

  /** Sobe ou desce dentro do próprio grupo: um ícone nunca vira botão por engano */
  function moverLink(id, passo) {
    setLinks(prev => {
      const alvo = prev.find(l => l.id === id)
      if (!alvo) return prev
      const grupo = prev.filter(l => (l.grupo === 'social') === (alvo.grupo === 'social'))
      const outros = prev.filter(l => (l.grupo === 'social') !== (alvo.grupo === 'social'))

      const i = grupo.findIndex(l => l.id === id)
      const j = i + passo
      if (j < 0 || j >= grupo.length) return prev

      const novo = [...grupo]
      ;[novo[i], novo[j]] = [novo[j], novo[i]]

      // Sociais sempre antes dos botões: é a ordem em que a página desenha
      return alvo.grupo === 'social' ? [...novo, ...outros] : [...outros, ...novo]
    })
  }

  function excluirLink(id) {
    // Só vale mandar apagar o que já existe no banco: um link criado agora e
    // excluído antes de salvar nunca chegou lá.
    const alvo = links.find(l => l.id === id)
    if (alvo && !alvo.novo) setRemovidos(prev => [...prev, id])
    setLinks(prev => prev.filter(l => l.id !== id))
  }

  function adicionar(grupo, extras = {}) {
    setLinks(prev => [...prev, {
      id: novoId(),
      grupo,
      tipo: 'link',
      titulo: '',
      subtitulo: '',
      valor: '',
      ativo: true,
      destaque: false,
      cliques: 0,
      novo: true,
      ...extras,
    }])
  }

  // ── Atalhos: o que o sistema já sabe vira botão num clique ────────────────
  const temLoja = botoes.some(l => l.tipo === 'loja')
  const temZap  = links.some(l => l.tipo === 'whatsapp')

  function adicionarLoja() {
    if (!cfgLoja.slug) {
      showToast('Defina o endereço da loja na aba Loja antes', 'error')
      return
    }
    adicionar('botao', {
      tipo: 'loja',
      titulo: 'Loja online',
      subtitulo: 'Peças disponíveis agora',
      valor: `/loja/${cfgLoja.slug}`,
      destaque: true,
    })
    if (!cfgLoja.loja_ativa) {
      showToast('O botão foi criado, mas a loja está fora do ar na aba Loja', 'info')
    }
  }

  function adicionarWhats() {
    adicionar('botao', {
      tipo: 'whatsapp',
      titulo: 'WhatsApp',
      subtitulo: 'Fale com a gente',
      valor: cfgLoja.whatsapp || '',
    })
  }

  // ── Logo ──────────────────────────────────────────────────────────────────
  async function enviarLogo(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // escolher o mesmo arquivo de novo tem de disparar
    if (!file) return

    setEnviandoLogo(true)
    try {
      const url = await uploadLogoBio(file, tenantId)
      const antigo = pagina.logo_url
      mudarPagina({ logo_url: url })
      // O arquivo antigo some junto: logo trocado dez vezes não pode virar
      // dez arquivos pagos no Storage.
      if (antigo && antigo.includes('/bio-imagens/')) removerLogoBio(antigo)
      showToast('Logo enviado! Salve para publicar.')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setEnviandoLogo(false)
    }
  }

  function tirarLogo() {
    const antigo = pagina.logo_url
    mudarPagina({ logo_url: '' })
    if (antigo && antigo.includes('/bio-imagens/')) removerLogoBio(antigo)
  }

  // ── Salvar ────────────────────────────────────────────────────────────────
  async function salvar() {
    const slug = normalizarSlug(pagina.slug)

    if (!slug) {
      showToast('Defina o endereço da página', 'error')
      return
    }
    if (slug.length < 3) {
      showToast('O endereço precisa de pelo menos 3 letras', 'error')
      return
    }
    if (pagina.ativa && !(pagina.titulo || '').trim()) {
      showToast('Dê um nome à página antes de colocá-la no ar', 'error')
      return
    }

    // Link sem destino não vira botão: na página ele seria um botão morto
    const semDestino = links.filter(l => l.ativo !== false && !montarUrlBio(l.tipo, l.valor))
    if (semDestino.length) {
      showToast(`Preencha o destino de "${semDestino[0].titulo || rotuloTipo(semDestino[0].tipo)}"`, 'error')
      return
    }

    setSalvando(true)
    try {
      await salvarBioPagina(tenantId, {
        slug,
        ativa: pagina.ativa === true,
        titulo: (pagina.titulo || '').trim() || null,
        descricao: (pagina.descricao || '').trim() || null,
        logo_url: pagina.logo_url || null,
        logo_formato: pagina.logo_formato || 'circulo',
        fundo_tipo: pagina.fundo_tipo || 'cor',
        cor_fundo: pagina.cor_fundo,
        cor_fundo2: pagina.cor_fundo2,
        cor_texto: pagina.cor_texto,
        cor_botao: pagina.cor_botao,
        cor_texto_botao: pagina.cor_texto_botao,
        botao_estilo: pagina.botao_estilo || 'solido',
        botao_raio: pagina.botao_raio || 'arredondado',
        mostrar_compartilhar: pagina.mostrar_compartilhar !== false,
        mostrar_marca: pagina.mostrar_marca !== false,
        mensagem_compartilhar: (pagina.mensagem_compartilhar || '').trim() || null,
      })

      const gravados = await salvarBioLinks(
        tenantId,
        links.map(l => ({
          ...l,
          titulo: l.titulo || rotuloTipo(l.tipo),
          url: montarUrlBio(l.tipo, l.valor),
        })),
        removidos,
      )

      // Volta do banco com a contagem de cliques e sem a marca de "criado agora"
      const porId = new Map((gravados || []).map(g => [g.id, g]))
      setLinks(prev => prev.map(l => {
        const g = porId.get(l.id)
        return g ? { ...l, novo: false, titulo: g.titulo || '', cliques: g.cliques || 0 } : l
      }))

      setRemovidos([])
      setPagina(p => ({ ...p, slug }))
      showToast('Página salva!')
    } catch (e) {
      showToast('Erro ao salvar: ' + e.message, 'error')
    } finally {
      setSalvando(false)
    }
  }

  function copiarLink() {
    if (!endereco) return
    navigator.clipboard?.writeText(endereco)
      .then(() => {
        setCopiado(true)
        setTimeout(() => setCopiado(false), 1500)
      })
      .catch(() => showToast('Não foi possível copiar o link', 'error'))
  }

  if (carregando) {
    return <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 24 }}>Carregando…</p>
  }

  return (
    <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start', flexWrap: 'wrap' }}>

      {/* ══ Coluna de configuração ══════════════════════════════════════════ */}
      <div style={{ flex: '1 1 520px', minWidth: 320 }}>

        {/* ── Endereço ───────────────────────────────────────────────────── */}
        <div style={cardStyle}>
          <h3 style={tituloCard}>Link da bio</h3>
          <p style={textoCard}>
            A página de links que vai na bio do Instagram: logo, redes e os botões que
            você escolher. É o seu endereço, sem propaganda de ninguém.
          </p>

          <label style={labelStyle}>Endereço da página</label>
          <input
            value={pagina.slug || ''}
            onChange={e => mudarPagina({ slug: e.target.value })}
            onBlur={e => mudarPagina({ slug: normalizarSlug(e.target.value) })}
            style={inputStyle}
            placeholder="ea-second-hand"
          />
          {endereco && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--muted)', wordBreak: 'break-all' }}>{endereco}</span>
              <button type="button" onClick={copiarLink} style={{
                padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border-light)',
                background: 'rgba(255,255,255,0.03)', color: copiado ? 'var(--green)' : 'var(--blue)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
              }}>
                {copiado ? 'Copiado' : 'Copiar'}
              </button>
              <a href={endereco} target="_blank" rel="noopener noreferrer" style={{
                padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border-light)',
                background: 'rgba(255,255,255,0.03)', color: 'var(--blue)',
                fontSize: 12, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap',
              }}>
                Abrir
              </a>
            </div>
          )}
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
            Pode ser o mesmo nome da loja. Só não pode repetir o de outra empresa.
          </p>

          <label style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: 12, marginTop: 16,
            background: pagina.ativa ? 'rgba(129,201,149,0.1)' : 'rgba(255,255,255,0.02)',
            border: '1px solid var(--border-light)', borderRadius: 8, cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={pagina.ativa === true}
              onChange={e => mudarPagina({ ativa: e.target.checked })}
            />
            <span style={{ fontSize: 14, color: 'var(--text-header)' }}>
              Página no ar
              <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>
                Desligada, quem abre o link vê um aviso. Seus links continuam salvos aqui.
              </span>
            </span>
          </label>
        </div>

        {/* ── Identidade ─────────────────────────────────────────────────── */}
        <div style={cardStyle}>
          <h3 style={tituloCard}>Logo e nome</h3>
          <p style={textoCard}>
            É o que a cliente vê primeiro. A imagem aparece redonda ou quadrada, do
            jeito que você escolher — JPG, PNG ou WEBP, até 5MB.
          </p>

          <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 18 }}>
            {pagina.logo_url ? (
              <img
                src={pagina.logo_url}
                alt="Logo"
                style={{
                  width: 72, height: 72, objectFit: 'cover', flexShrink: 0,
                  borderRadius: pagina.logo_formato === 'quadrado' ? 14 : '50%',
                  border: '1px solid var(--border-light)',
                }}
              />
            ) : (
              <div style={{
                width: 72, height: 72, flexShrink: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                borderRadius: pagina.logo_formato === 'quadrado' ? 14 : '50%',
                border: '1px dashed var(--border-light)', color: 'var(--muted)', fontSize: 11,
              }}>
                sem logo
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                ref={arquivoRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={enviarLogo}
                style={{ display: 'none' }}
              />
              <button type="button" onClick={() => arquivoRef.current?.click()}
                      disabled={enviandoLogo} style={{ ...botaoLeve, opacity: enviandoLogo ? 0.6 : 1 }}>
                {enviandoLogo ? 'Enviando…' : pagina.logo_url ? 'Trocar logo' : 'Enviar logo'}
              </button>
              {pagina.logo_url && (
                <button type="button" onClick={tirarLogo} style={{ ...botaoLeve, color: 'var(--red)' }}>
                  Remover
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            <Chip ativo={pagina.logo_formato !== 'quadrado'} onClick={() => mudarPagina({ logo_formato: 'circulo' })}>
              Redondo
            </Chip>
            <Chip ativo={pagina.logo_formato === 'quadrado'} onClick={() => mudarPagina({ logo_formato: 'quadrado' })}>
              Quadrado
            </Chip>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Nome que aparece</label>
            <input
              value={pagina.titulo || ''}
              onChange={e => mudarPagina({ titulo: e.target.value })}
              style={inputStyle}
              placeholder="easecondhand"
            />
          </div>

          <div>
            <label style={labelStyle}>Frase embaixo do nome (opcional)</label>
            <textarea
              value={pagina.descricao || ''}
              onChange={e => mudarPagina({ descricao: e.target.value })}
              rows={2}
              style={{ ...inputStyle, resize: 'vertical' }}
              placeholder="Brechó em São Paulo · Envios para todo o Brasil"
            />
          </div>
        </div>

        {/* ── Aparência ──────────────────────────────────────────────────── */}
        <div style={cardStyle}>
          <h3 style={tituloCard}>Aparência</h3>
          <p style={textoCard}>
            Escolha um tema pronto e, se quiser, ajuste as cores uma a uma. Tudo o que
            você mexer aparece na hora na pré-visualização.
          </p>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
            {TEMAS.map(t => (
              <Chip
                key={t.nome}
                cor={t.cor_fundo}
                ativo={pagina.cor_fundo === t.cor_fundo && pagina.cor_botao === t.cor_botao}
                onClick={() => mudarPagina({
                  fundo_tipo: t.fundo_tipo,
                  cor_fundo: t.cor_fundo,
                  cor_fundo2: t.cor_fundo2,
                  cor_texto: t.cor_texto,
                  cor_botao: t.cor_botao,
                  cor_texto_botao: t.cor_texto_botao,
                })}
              >
                {t.nome}
              </Chip>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <Chip ativo={pagina.fundo_tipo !== 'gradiente'} onClick={() => mudarPagina({ fundo_tipo: 'cor' })}>
              Cor única
            </Chip>
            <Chip ativo={pagina.fundo_tipo === 'gradiente'} onClick={() => mudarPagina({ fundo_tipo: 'gradiente' })}>
              Degradê
            </Chip>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <CampoCor rotulo="Fundo" valor={pagina.cor_fundo} onChange={v => mudarPagina({ cor_fundo: v })} />
            {pagina.fundo_tipo === 'gradiente' && (
              <CampoCor rotulo="Fundo (fim do degradê)" valor={pagina.cor_fundo2} onChange={v => mudarPagina({ cor_fundo2: v })} />
            )}
            <CampoCor rotulo="Texto" valor={pagina.cor_texto} onChange={v => mudarPagina({ cor_texto: v })} />
            <CampoCor rotulo="Botão" valor={pagina.cor_botao} onChange={v => mudarPagina({ cor_botao: v })} />
            <CampoCor rotulo="Texto do botão" valor={pagina.cor_texto_botao} onChange={v => mudarPagina({ cor_texto_botao: v })} />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Acabamento do botão</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ESTILOS_BOTAO.map(e => (
                <Chip key={e.valor} ativo={(pagina.botao_estilo || 'solido') === e.valor}
                      onClick={() => mudarPagina({ botao_estilo: e.valor })}>
                  {e.rotulo}
                </Chip>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>Cantos</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {RAIOS.map(r => (
                <Chip key={r.valor} ativo={(pagina.botao_raio || 'arredondado') === r.valor}
                      onClick={() => mudarPagina({ botao_raio: r.valor })}>
                  {r.rotulo}
                </Chip>
              ))}
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text-body)', cursor: 'pointer', marginBottom: 10 }}>
            <input
              type="checkbox"
              checked={pagina.mostrar_compartilhar !== false}
              onChange={e => mudarPagina({ mostrar_compartilhar: e.target.checked })}
            />
            Botão de compartilhar no topo
          </label>

          {/* Só faz sentido com o botão ligado: é a frase que ele envia */}
          {pagina.mostrar_compartilhar !== false && (
            <div style={{ margin: '0 0 16px 28px' }}>
              <label style={labelStyle}>Mensagem que vai junto com o link</label>
              <textarea
                value={pagina.mensagem_compartilhar || ''}
                onChange={e => mudarPagina({ mensagem_compartilhar: e.target.value })}
                rows={2}
                style={{ ...inputStyle, resize: 'vertical' }}
                placeholder={textoCompartilhar({ titulo: pagina.titulo })}
              />
              <div style={{
                marginTop: 8, padding: '10px 12px', borderRadius: 8,
                border: '1px solid var(--border-light)', background: 'rgba(255,255,255,0.02)',
                fontSize: 12, color: 'var(--muted)', whiteSpace: 'pre-line', lineHeight: 1.6,
              }}>
                {textoCompartilhar(pagina)}
                {'\n\n'}
                <span style={{ color: 'var(--blue)', wordBreak: 'break-all' }}>
                  {endereco || 'o link da sua página'}
                </span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                É assim que a mensagem chega em quem recebe. Em branco, vale a frase de cima.
              </p>
            </div>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text-body)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={pagina.mostrar_marca !== false}
              onChange={e => mudarPagina({ mostrar_marca: e.target.checked })}
            />
            Mostrar “feito com SellControl” no rodapé
          </label>
        </div>

        {/* ── Redes sociais ──────────────────────────────────────────────── */}
        <div style={cardStyle}>
          <h3 style={tituloCard}>Redes sociais</h3>
          <p style={textoCard}>
            Os ícones pequenos logo abaixo do nome. Só o ícone: quem clica já sabe o
            que é o desenho do Instagram.
          </p>

          <EditorLinks
            links={sociais}
            completo={false}
            onMudar={mudarLink}
            onMover={moverLink}
            onExcluir={excluirLink}
            vazio="Nenhuma rede social ainda."
          />

          <button type="button" onClick={() => adicionar('social', { tipo: 'instagram' })}
                  style={{ ...botaoLeve, marginTop: 12 }}>
            Adicionar rede social
          </button>
        </div>

        {/* ── Botões ─────────────────────────────────────────────────────── */}
        <div style={cardStyle}>
          <h3 style={tituloCard}>Botões</h3>
          <p style={textoCard}>
            Os links grandes, na ordem em que aparecem. Use as setas para trocar a ordem
            e o interruptor para tirar um do ar sem perder o que já foi digitado.
          </p>

          <EditorLinks
            links={botoes}
            completo
            onMudar={mudarLink}
            onMover={moverLink}
            onExcluir={excluirLink}
            vazio="Nenhum botão ainda. Comece pela loja online."
          />

          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => adicionar('botao')} style={botaoLeve}>
              Adicionar botão
            </button>
            {!temLoja && (
              <button type="button" onClick={adicionarLoja} style={botaoLeve}>
                Adicionar a loja online
              </button>
            )}
            {!temZap && (
              <button type="button" onClick={adicionarWhats} style={botaoLeve}>
                Adicionar o WhatsApp
              </button>
            )}
          </div>
        </div>

        <div style={{ marginTop: 20, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={salvar}
            disabled={salvando}
            style={{
              padding: '12px 24px', borderRadius: 8, border: 'none',
              background: 'var(--green)', color: '#121212', fontSize: 15, fontWeight: 600,
              cursor: salvando ? 'not-allowed' : 'pointer', opacity: salvando ? 0.6 : 1,
            }}
          >
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
          {!pagina.ativa && (
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              A página só abre para o público depois de ligar “Página no ar”.
            </span>
          )}
        </div>
      </div>

      {/* ══ Pré-visualização ════════════════════════════════════════════════ */}
      <div style={{ flex: '0 0 auto', position: 'sticky', top: 20, paddingTop: 20 }}>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10, textAlign: 'center' }}>
          Como a cliente vê
        </div>
        <div className="bio-previa">
          <BioRender pagina={pagina} links={previa} previa />
        </div>
      </div>
    </div>
  )
}
