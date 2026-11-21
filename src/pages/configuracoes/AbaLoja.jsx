import { useState, useEffect } from 'react'
import { getConfig, saveConfig } from '../../services/configService'
import { siteUrl } from '../../lib/siteUrl'

// ============================================================================
// Aba: Loja pública
// ============================================================================
// Tudo que a loja precisa saber antes de cotar um frete: quanto pesa cada tipo
// de peça, em que caixa o pedido vai e por quanto tempo a peça fica reservada
// no carrinho de quem ainda não pagou.
//
// O peso tem três fontes, nesta ordem: peso da própria peça (cadastro do
// produto), peso da categoria (esta tela) e peso padrão (esta tela). A conta
// mora na função loja_peso_peca, no banco, para a loja e o checkout nunca
// divergirem.
// ============================================================================

const caixaVazia = { ate_gramas: '', max_pecas: '', altura: '', largura: '', comprimento: '' }

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  background: '#1e1e1e',
  border: '1px solid #333',
  borderRadius: 8,
  color: '#fff',
  fontSize: 14,
}

const labelStyle = { display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }

const cardStyle = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid var(--border-light)',
  borderRadius: 12,
  padding: 24,
  marginTop: 20,
}

// Cubagem da transportadora: altura × largura × comprimento ÷ 6.000, em kg
function cubagem(c) {
  const a = Number(c.altura) || 0
  const l = Number(c.largura) || 0
  const p = Number(c.comprimento) || 0
  if (!a || !l || !p) return 0
  return (a * l * p) / 6000
}

export default function AbaLoja({ tenantId, showToast }) {
  const [form, setForm] = useState({
    slug: '',
    loja_ativa: false,
    loja_reserva_minutos: 15,
    loja_peso_padrao_gramas: 300,
  })
  const [pesos, setPesos] = useState([])     // [{ produto, gramas }]
  const [caixas, setCaixas] = useState([])   // [{ ate_gramas, max_pecas, altura, largura, comprimento }]
  const [salvando, setSalvando] = useState(false)
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    if (!tenantId) return
    getConfig(tenantId).then(cfg => {
      if (!cfg) return
      setForm({
        slug: cfg.slug || '',
        loja_ativa: cfg.loja_ativa === true,
        loja_reserva_minutos: cfg.loja_reserva_minutos ?? 15,
        loja_peso_padrao_gramas: cfg.loja_peso_padrao_gramas ?? 300,
      })
      setPesos((cfg.loja_pesos_categoria || []).map(p => ({
        produto: p.produto || '',
        gramas: p.gramas ?? '',
      })))
      setCaixas((cfg.loja_caixas || []).map(c => ({
        ate_gramas: c.ate_gramas ?? '',
        max_pecas: c.max_pecas ?? '',
        altura: c.altura ?? '',
        largura: c.largura ?? '',
        comprimento: c.comprimento ?? '',
      })))
    })
  }, [tenantId])

  const link = form.slug ? siteUrl(`/loja/${form.slug}`) : ''

  function copiarLink() {
    if (!link) return
    navigator.clipboard?.writeText(link)
      .then(() => {
        setCopiado(true)
        setTimeout(() => setCopiado(false), 1500)
      })
      .catch(() => showToast('Não foi possível copiar o link', 'error'))
  }

  async function salvar() {
    // O slug vira endereço: espaço e maiúscula quebram o link na hora de colar
    const slug = form.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')
    if (form.loja_ativa && !slug) {
      showToast('Defina o endereço da loja antes de colocá-la no ar', 'error')
      return
    }

    const minutos = parseInt(form.loja_reserva_minutos, 10)
    if (!(minutos >= 1 && minutos <= 120)) {
      showToast('A reserva tem de ficar entre 1 e 120 minutos', 'error')
      return
    }

    const padrao = parseInt(form.loja_peso_padrao_gramas, 10)
    if (!(padrao > 0)) {
      showToast('O peso padrão precisa ser maior que zero', 'error')
      return
    }

    // Linha sem nome ou sem peso é lixo de digitação: sai fora em silêncio
    const pesosLimpos = pesos
      .map(p => ({ produto: String(p.produto || '').trim(), gramas: parseInt(p.gramas, 10) }))
      .filter(p => p.produto && p.gramas > 0)

    const caixasLimpas = caixas
      .map(c => ({
        ate_gramas: c.ate_gramas === '' || c.ate_gramas === null ? null : parseInt(c.ate_gramas, 10),
        max_pecas: c.max_pecas === '' || c.max_pecas === null ? null : parseInt(c.max_pecas, 10),
        altura: parseInt(c.altura, 10),
        largura: parseInt(c.largura, 10),
        comprimento: parseInt(c.comprimento, 10),
      }))
      .filter(c => c.altura > 0 && c.largura > 0 && c.comprimento > 0)
      // Da menor para a maior, com a caixa sem limite (null) sempre no fim
      .sort((a, b) => (a.ate_gramas ?? Infinity) - (b.ate_gramas ?? Infinity))

    if (form.loja_ativa && !caixasLimpas.length) {
      showToast('Cadastre ao menos uma caixa: sem medida não há cotação de frete', 'error')
      return
    }

    setSalvando(true)
    try {
      await saveConfig(tenantId, {
        slug,
        loja_ativa: form.loja_ativa,
        loja_reserva_minutos: minutos,
        loja_peso_padrao_gramas: padrao,
        loja_pesos_categoria: pesosLimpos,
        loja_caixas: caixasLimpas,
      })
      setForm(f => ({ ...f, slug }))
      setPesos(pesosLimpos.map(p => ({ produto: p.produto, gramas: p.gramas })))
      setCaixas(caixasLimpas)
      showToast('Loja atualizada!')
    } catch (e) {
      showToast('Erro ao salvar: ' + e.message, 'error')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      {/* ── Endereço e estado da loja ───────────────────────────── */}
      <div style={cardStyle}>
        <h3 style={{ margin: '0 0 8px 0', color: 'var(--blue)', fontSize: 16 }}>Loja pública</h3>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 20 }}>
          O catálogo aberto, para divulgar no Instagram. Só aparece nele a peça publicada
          na tela de Produtos, com foto, preço e estoque.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>Endereço da loja</label>
            <input
              value={form.slug}
              onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
              style={inputStyle}
              placeholder="ea-second-hand"
            />
            {link && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)', wordBreak: 'break-all' }}>{link}</span>
                <button
                  type="button"
                  onClick={copiarLink}
                  style={{
                    padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border-light)',
                    background: 'rgba(255,255,255,0.03)', color: copiado ? 'var(--green)' : 'var(--blue)',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  {copiado ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            )}
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
              O mesmo endereço do portal do cliente. Trocar aqui troca os dois.
            </p>
          </div>

          <div>
            <label style={labelStyle}>Reserva no carrinho (min)</label>
            <input
              type="number"
              min={1}
              max={120}
              value={form.loja_reserva_minutos}
              onChange={e => setForm(f => ({ ...f, loja_reserva_minutos: e.target.value }))}
              style={inputStyle}
            />
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
              Tempo que a peça fica fora do catálogo enquanto a cliente não paga.
            </p>
          </div>
        </div>

        <label style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: 12,
          background: form.loja_ativa ? 'rgba(129,201,149,0.1)' : 'rgba(255,255,255,0.02)',
          border: '1px solid var(--border-light)', borderRadius: 8, cursor: 'pointer',
        }}>
          <input
            type="checkbox"
            checked={form.loja_ativa}
            onChange={e => setForm(f => ({ ...f, loja_ativa: e.target.checked }))}
          />
          <span style={{ fontSize: 14, color: 'var(--text-header)' }}>
            Loja no ar
            <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>
              Desligada, quem abre o link vê um aviso de loja fechada. As peças publicadas continuam publicadas.
            </span>
          </span>
        </label>
      </div>

      {/* ── Peso por categoria ──────────────────────────────────── */}
      <div style={cardStyle}>
        <h3 style={{ margin: '0 0 8px 0', color: 'var(--blue)', fontSize: 16 }}>Peso das peças</h3>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 20 }}>
          O frete é cotado de verdade no Melhor Envio, então o sistema precisa estimar o peso.
          Vale o peso da própria peça quando ele existir no cadastro do produto; depois o peso
          desta lista, casado pelo campo <strong>Produto</strong>; por último, o peso padrão.
        </p>

        <div style={{ marginBottom: 16, maxWidth: 220 }}>
          <label style={labelStyle}>Peso padrão (g)</label>
          <input
            type="number"
            min={1}
            value={form.loja_peso_padrao_gramas}
            onChange={e => setForm(f => ({ ...f, loja_peso_padrao_gramas: e.target.value }))}
            style={inputStyle}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pesos.map((p, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 40px', gap: 8, alignItems: 'center' }}>
              <input
                value={p.produto}
                onChange={e => setPesos(prev => prev.map((x, j) => j === i ? { ...x, produto: e.target.value } : x))}
                style={inputStyle}
                placeholder="Camiseta"
              />
              <input
                type="number"
                min={1}
                value={p.gramas}
                onChange={e => setPesos(prev => prev.map((x, j) => j === i ? { ...x, gramas: e.target.value } : x))}
                style={{ ...inputStyle, textAlign: 'center' }}
                placeholder="200"
              />
              <button
                type="button"
                onClick={() => setPesos(prev => prev.filter((_, j) => j !== i))}
                title="Remover"
                style={{
                  padding: '10px 0', borderRadius: 8, border: '1px solid var(--border-light)',
                  background: 'rgba(255,255,255,0.03)', color: 'var(--red)', fontSize: 16,
                  fontWeight: 700, cursor: 'pointer',
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setPesos(prev => [...prev, { produto: '', gramas: '' }])}
          style={{
            marginTop: 12, padding: '10px 15px', borderRadius: 8,
            border: '1px solid var(--border-light)', background: 'rgba(255,255,255,0.03)',
            color: 'var(--blue)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Adicionar tipo de peça
        </button>
      </div>

      {/* ── Caixas ──────────────────────────────────────────────── */}
      <div style={cardStyle}>
        <h3 style={{ margin: '0 0 8px 0', color: 'var(--blue)', fontSize: 16 }}>Caixas do envio</h3>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 20 }}>
          A caixa é escolhida pelo peso total do pedido. Quando a quantidade de peças pedir uma
          caixa maior que o peso indicaria, vale a maior das duas — dez camisetas leves não cabem
          na caixa pequena. Deixe o peso da última caixa em branco: é a que atende de lá para cima.
        </p>

        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 40px', gap: 8,
          fontSize: 11, color: 'var(--muted)', marginBottom: 4,
        }}>
          <span>Até (g)</span>
          <span>Até (peças)</span>
          <span>Altura (cm)</span>
          <span>Largura (cm)</span>
          <span>Compr. (cm)</span>
          <span />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {caixas.map((c, i) => (
            <div key={i}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 40px', gap: 8, alignItems: 'center' }}>
                {['ate_gramas', 'max_pecas', 'altura', 'largura', 'comprimento'].map(campo => (
                  <input
                    key={campo}
                    type="number"
                    min={0}
                    value={c[campo]}
                    onChange={e => setCaixas(prev => prev.map((x, j) => j === i ? { ...x, [campo]: e.target.value } : x))}
                    style={{ ...inputStyle, textAlign: 'center' }}
                    placeholder={campo === 'ate_gramas' || campo === 'max_pecas' ? 'sem limite' : ''}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => setCaixas(prev => prev.filter((_, j) => j !== i))}
                  title="Remover"
                  style={{
                    padding: '10px 0', borderRadius: 8, border: '1px solid var(--border-light)',
                    background: 'rgba(255,255,255,0.03)', color: 'var(--red)', fontSize: 16,
                    fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  ×
                </button>
              </div>
              {cubagem(c) > 0 && (
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                  Cubagem: {cubagem(c).toFixed(2).replace('.', ',')} kg — é por este valor que a
                  transportadora cobra quando ele passa do peso real
                </span>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setCaixas(prev => [...prev, { ...caixaVazia }])}
          style={{
            marginTop: 12, padding: '10px 15px', borderRadius: 8,
            border: '1px solid var(--border-light)', background: 'rgba(255,255,255,0.03)',
            color: 'var(--blue)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Adicionar caixa
        </button>
      </div>

      <div style={{ marginTop: 20 }}>
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
      </div>
    </>
  )
}
