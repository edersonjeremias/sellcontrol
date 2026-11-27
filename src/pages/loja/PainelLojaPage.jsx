import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import AppShell from '../../components/ui/AppShell'
import { getPainelLoja, hojeISO, taxa } from '../../services/painelLojaService'
import { rotuloGenero } from '../../components/loja/genero'

// ============================================================================
// Painel da Loja — o funil do canal público
// ============================================================================
// Responde a pergunta que decide a divulgação: de cada cem que entram na
// loja, quantas montam sacola e quantas pagam. Sem isso, o que se sabe da
// loja é só o que ela vendeu — nunca quanta gente desistiu no caminho.
// ============================================================================

const moeda = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const numero = v => Number(v || 0).toLocaleString('pt-BR')
const pct = v => (v === null ? '—' : `${v.toFixed(v < 10 ? 1 : 0).replace('.', ',')}%`)

const PERIODOS = [
  { dias: 0,  rotulo: 'Hoje' },
  { dias: 6,  rotulo: '7 dias' },
  { dias: 29, rotulo: '30 dias' },
  { dias: 89, rotulo: '90 dias' },
]

const ROTULO_ORIGEM = {
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  google: 'Google',
  tiktok: 'TikTok',
  direto: 'Link direto',
  outro: 'Outros sites',
}

const card = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid var(--border-light)',
  borderRadius: 12,
  padding: 16,
}

function Numero({ titulo, valor, apoio, cor }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', color: 'var(--muted)' }}>
        {titulo}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: cor || 'var(--text-header)', margin: '6px 0 2px' }}>
        {valor}
      </div>
      {apoio && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{apoio}</div>}
    </div>
  )
}

/** Uma etapa do funil, com a largura mostrando quanto sobrou da anterior */
function Etapa({ rotulo, valor, de, explicacao }) {
  const proporcao = de ? Math.max(4, Math.round((Number(valor || 0) / Number(de)) * 100)) : 100
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
        <span style={{ color: 'var(--text-header)', fontWeight: 600 }}>{rotulo}</span>
        <span style={{ color: 'var(--muted)' }}>
          {numero(valor)}{de ? ` · ${pct(taxa(valor, de))}` : ''}
        </span>
      </div>
      <div style={{ height: 10, background: 'rgba(255,255,255,0.04)', borderRadius: 5, overflow: 'hidden' }}>
        <div style={{ width: `${proporcao}%`, height: '100%', background: 'var(--green)', borderRadius: 5 }} />
      </div>
      {explicacao && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{explicacao}</div>}
    </div>
  )
}

/** Barras do dia a dia. Só visitas: o faturamento vai no rótulo. */
function Grafico({ dias }) {
  if (!dias?.length) return null
  const max = Math.max(...dias.map(d => Number(d.visitas) || 0), 1)

  return (
    <div style={{ ...card, overflowX: 'auto' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>
        Visitas por dia
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 150, minWidth: dias.length * 14 }}>
        {dias.map(d => {
          const altura = Math.max(Math.round(((Number(d.visitas) || 0) / max) * 120), Number(d.visitas) > 0 ? 3 : 1)
          const [, mes, dia] = String(d.dia).split('-')
          return (
            <div
              key={d.dia}
              title={`${dia}/${mes}: ${numero(d.visitas)} visitas, ${numero(d.pagos)} pedidos, ${moeda(d.faturamento)}`}
              style={{ flex: 1, minWidth: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}
            >
              <div style={{
                width: '100%',
                height: altura,
                background: Number(d.pagos) > 0 ? 'var(--green)' : '#4a4a4a',
                borderRadius: '3px 3px 0 0',
              }} />
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
        Em verde, os dias que tiveram pedido pago. Passe o mouse para ver o dia.
      </div>
    </div>
  )
}

export default function PainelLojaPage() {
  const { profile } = useAuth()
  const { showToast } = useApp()
  const tenantId = profile?.tenant_id

  const [dias, setDias] = useState(29)
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    if (!tenantId) return
    setCarregando(true)
    try {
      setDados(await getPainelLoja(tenantId, hojeISO(dias), hojeISO()))
      setErro('')
    } catch (err) {
      console.error('Erro ao carregar o painel da loja:', err)
      // Zera o que estava na tela: número velho ao lado de um erro é pior que
      // tela vazia, porque parece dado do período que acabou de ser escolhido
      setDados(null)
      setErro(err.message || 'Não foi possível carregar o painel')
      showToast(err.message || 'Não foi possível carregar o painel', 'error')
    } finally {
      setCarregando(false)
    }
  }, [tenantId, dias, showToast])

  useEffect(() => { carregar() }, [carregar])

  const d = dados || {}
  const visitas = Number(d.visitas || 0)
  const temVisita = visitas > 0

  return (
    <AppShell title="Painel da Loja">
      <div style={{ padding: '0 16px 32px', maxWidth: 1100, margin: '0 auto' }}>

        {/* ── Período ── */}
        <div style={{ display: 'flex', gap: 8, padding: '14px 0', flexWrap: 'wrap' }}>
          {PERIODOS.map(p => (
            <button
              key={p.dias}
              type="button"
              onClick={() => setDias(p.dias)}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: `1px solid ${dias === p.dias ? 'var(--blue)' : 'var(--border-light)'}`,
                background: dias === p.dias ? 'rgba(138,180,248,0.14)' : 'rgba(255,255,255,0.03)',
                color: dias === p.dias ? 'var(--blue)' : 'var(--muted)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {p.rotulo}
            </button>
          ))}
        </div>

        {carregando ? (
          <p style={{ color: 'var(--muted)', padding: '30px 0' }}>Carregando…</p>
        ) : erro ? (
          <div style={{ ...card, borderColor: 'rgba(242,139,130,0.4)' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--red)', marginBottom: 6 }}>
              Não foi possível carregar o painel
            </div>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 14px', lineHeight: 1.6 }}>
              {erro}
            </p>
            <button
              type="button"
              onClick={carregar}
              style={{
                padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border-light)',
                background: 'rgba(255,255,255,0.03)', color: 'var(--blue)',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Tentar de novo
            </button>
          </div>
        ) : (
          <>
            {/* ── Números do topo ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <Numero
                titulo="Visitas"
                valor={numero(visitas)}
                apoio={`${numero(d.visitantes)} ${Number(d.visitantes) === 1 ? 'pessoa' : 'pessoas'}`}
              />
              <Numero titulo="Peças abertas" valor={numero(d.pecas_vistas)} apoio="página de peça aberta" />
              <Numero
                titulo="Pedidos pagos"
                valor={numero(d.pagos)}
                apoio={temVisita ? `${pct(taxa(d.pagos, visitas))} de quem entrou` : 'sem visita no período'}
                cor="var(--green)"
              />
              <Numero
                titulo="Faturamento"
                valor={moeda(d.faturamento)}
                apoio={`${moeda(d.em_pecas)} em peças · ${moeda(d.em_frete)} em frete`}
                cor="var(--green)"
              />
              <Numero titulo="Ticket médio" valor={moeda(d.ticket)} apoio="por pedido pago" />
              <Numero
                titulo="Sacolas abandonadas"
                valor={numero(d.abandonadas)}
                apoio="reserva venceu sem pagar"
                cor={Number(d.abandonadas) > 0 ? 'var(--yellow)' : undefined}
              />
            </div>

            {/* ── Funil ── */}
            <div style={{ ...card, marginTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>
                Do primeiro clique à venda
              </div>
              <Etapa rotulo="Entraram na loja" valor={visitas} />
              <Etapa rotulo="Abriram uma peça" valor={d.pecas_vistas} de={visitas} />
              <Etapa rotulo="Montaram sacola" valor={d.sacolas} de={visitas} />
              <Etapa rotulo="Foram pagar" valor={d.checkouts} de={visitas} explicacao="chegaram a gerar PIX ou abrir o cartão" />
              <Etapa rotulo="Pagaram" valor={d.pagos} de={visitas} />
              {!temVisita && (
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
                  Nenhuma visita registrada neste período. A contagem começa quando alguém abre a loja —
                  compras anteriores a hoje aparecem no faturamento, mas sem a visita que as originou.
                </p>
              )}
            </div>

            {/* ── Gráfico ── */}
            <div style={{ marginTop: 14 }}>
              <Grafico dias={d.por_dia} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 12, marginTop: 14 }}>
              {/* ── Peças mais vistas ── */}
              <div style={card}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>
                  Peças mais olhadas
                </div>
                {!d.mais_vistas?.length ? (
                  <p style={{ fontSize: 13, color: 'var(--muted)' }}>Ninguém abriu peça neste período.</p>
                ) : (
                  d.mais_vistas.map(p => (
                    <div key={p.produto_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border-light)' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue)', minWidth: 44 }}>
                        {p.codigo || '—'}
                      </span>
                      <span style={{ flex: 1, fontSize: 13, color: 'var(--text-header)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {String(p.descricao || '').trim() || 'Peça'}
                      </span>
                      {p.vendida && <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700 }}>vendida</span>}
                      {!p.vendida && !p.publicado && <span style={{ fontSize: 11, color: 'var(--muted)' }}>fora do ar</span>}
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-header)' }}>{numero(p.vistas)}</span>
                    </div>
                  ))
                )}
                <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>
                  Muita visita e nenhuma venda costuma ser preço ou foto, não falta de gente.
                </p>
              </div>

              {/* ── Origem ── */}
              <div style={card}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>
                  De onde vieram
                </div>
                {!d.origens?.length ? (
                  <p style={{ fontSize: 13, color: 'var(--muted)' }}>Sem visita no período.</p>
                ) : (
                  d.origens.map(o => (
                    <div key={o.origem} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
                        <span style={{ color: 'var(--text-header)' }}>
                          {ROTULO_ORIGEM[o.origem] || o.origem}
                        </span>
                        <span style={{ color: 'var(--muted)' }}>
                          {numero(o.visitas)} · {pct(taxa(o.visitas, visitas))}
                        </span>
                      </div>
                      <div style={{ height: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.max(3, Math.round((o.visitas / Math.max(visitas, 1)) * 100))}%`, height: '100%', background: 'var(--blue)' }} />
                      </div>
                    </div>
                  ))
                )}
                <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>
                  "Link direto" é quem digitou o endereço, abriu por favorito ou veio de um app que
                  não informa a origem.
                </p>
              </div>
            </div>

            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 16, lineHeight: 1.6 }}>
              A visita é contada no servidor, sem script de rastreio na página e sem guardar IP ou
              nome. A mesma pessoa conta uma vez a cada 30 minutos — voltar ao catálogo depois de
              olhar três peças é uma visita, não quatro.
            </p>
          </>
        )}
      </div>
    </AppShell>
  )
}
