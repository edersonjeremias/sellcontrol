// ============================================================================
// MÓDULOS POR EMPRESA — a tela onde o sistema é vendido
// ============================================================================
// Uma empresa, uma lista: tudo que existe no sistema, com o que ela tem
// ligado e quanto paga por cada coisa. O total da assinatura fecha no pé da
// tela, somando só o que está marcado.
//
// Quem manda no que aparece aqui é o catálogo em src/lib/modulos.js. Quem
// grava é o modulosService, que também põe a tabela `pages` de acordo — é ela
// que monta o menu e as permissões de cada usuário da empresa.
// ============================================================================

import { useState, useEffect, useMemo } from 'react'
import {
  MODULOS, TIPO_RECURSO, modulosPorCategoria, somarMensalidade, formatarReais,
  precoPadrao,
} from '../../lib/modulos'
import { getCatalogoDoTenant, salvarModulosDoTenant } from '../../services/modulosService'
import { getAllTenants } from '../../services/authService'

const SI = {
  background: 'var(--input-bg)', border: '1px solid var(--border-light)',
  color: 'var(--text-body)', borderRadius: 6, padding: '8px 10px',
  fontSize: 14, width: '100%', colorScheme: 'dark', boxSizing: 'border-box',
}

// Busca de vários termos: "loja pix" acha o módulo que tem as duas palavras,
// em qualquer ordem e em qualquer um dos campos.
function casaBusca(modulo, busca) {
  const termos = String(busca || '').toLowerCase().split(/\s+/).filter(Boolean)
  if (!termos.length) return true
  const alvo = `${modulo.label} ${modulo.slug} ${modulo.categoria} ${modulo.descricao}`.toLowerCase()
  return termos.every(t => alvo.includes(t))
}

export default function AbaModulosEmpresa({ showToast }) {
  const [tenants, setTenants]   = useState([])
  const [tenantId, setTenantId] = useState('')
  const [linhas, setLinhas]     = useState([])
  const [busca, setBusca]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [saving, setSaving]     = useState(false)

  useEffect(() => {
    getAllTenants().then(({ data }) => setTenants(data || []))
  }, [])

  useEffect(() => {
    setLinhas([])
    if (!tenantId) return
    setLoading(true)
    getCatalogoDoTenant(tenantId)
      .then(setLinhas)
      .catch(e => showToast('Erro ao carregar os módulos: ' + e.message, 'error'))
      .finally(() => setLoading(false))
  }, [tenantId])

  const total = useMemo(() => somarMensalidade(linhas), [linhas])
  const ligados = linhas.filter(l => l.ativo).length

  const visiveis = useMemo(
    () => modulosPorCategoria(linhas.filter(l => casaBusca(l, busca))),
    [linhas, busca]
  )

  function alterar(slug, campos) {
    setLinhas(prev => prev.map(l => (l.slug === slug ? { ...l, ...campos } : l)))
  }

  function marcarCategoria(categoria, ativo) {
    setLinhas(prev => prev.map(l =>
      l.categoria === categoria && !l.essencial ? { ...l, ativo } : l
    ))
  }

  async function salvar() {
    setSaving(true)
    try {
      await salvarModulosDoTenant(tenantId, linhas)
      showToast('Módulos da empresa salvos')
    } catch (e) {
      showToast('Erro ao salvar: ' + e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const empresa = tenants.find(t => t.tenant_id === tenantId)

  return (
    <div style={{ padding: '20px 0', maxWidth: 820 }}>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
        Marque o que a empresa contratou e ajuste o preço de cada módulo.
        O que fica desmarcado não aparece no menu dela e trava mesmo se alguém
        digitar o endereço na mão. Loja, Link da Bio, Portal e Link de Frete
        também param de abrir para as clientes dela.
      </p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ flex: '1 1 260px' }}>
          <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Empresa</label>
          <select value={tenantId} onChange={e => setTenantId(e.target.value)} style={SI}>
            <option value="">-- Selecione uma empresa --</option>
            {tenants.map(t => (
              <option key={t.tenant_id} value={t.tenant_id}>
                {t.nome_loja || t.tenant_id}
              </option>
            ))}
          </select>
        </div>

        {tenantId && (
          <div style={{ flex: '1 1 200px' }}>
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Buscar módulo</label>
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="loja, frete, etiqueta…"
              style={SI}
            />
          </div>
        )}
      </div>

      {tenantId && loading && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Carregando…</div>}

      {tenantId && !loading && linhas.length > 0 && (
        <>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, flexWrap: 'wrap',
            background: 'var(--card-bg, #1e1e1e)',
            border: '1px solid var(--border-light)',
            borderRadius: 8, padding: '12px 14px', marginBottom: 18,
          }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                Mensalidade de {empresa?.nome_loja || 'empresa'}
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--blue)', lineHeight: 1.3 }}>
                {formatarReais(total)}
              </div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'right' }}>
              {ligados} de {MODULOS.length} módulos ligados
            </div>
          </div>

          {visiveis.map(({ categoria, modulos }) => {
            const negociaveis = modulos.filter(m => !m.essencial)
            const todosLigados = negociaveis.length > 0 && negociaveis.every(m => m.ativo)

            return (
              <div key={categoria} style={{ marginBottom: 22 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 8, paddingBottom: 5, borderBottom: '1px solid var(--border-light)',
                }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: 'var(--muted)',
                    textTransform: 'uppercase', letterSpacing: '.5px',
                  }}>
                    {categoria}
                    {categoria === 'Canais' && (
                      <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0, marginLeft: 8 }}>
                        — páginas que a cliente dela abre, sem login
                      </span>
                    )}
                  </span>
                  {negociaveis.length > 1 && (
                    <button
                      onClick={() => marcarCategoria(categoria, !todosLigados)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--blue)', fontSize: 12, fontWeight: 600, padding: '2px 4px',
                      }}
                    >
                      {todosLigados ? 'Desmarcar tudo' : 'Marcar tudo'}
                    </button>
                  )}
                </div>

                {modulos.map(m => (
                  <div
                    key={m.slug}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '9px 8px', borderRadius: 6, marginBottom: 2,
                      opacity: m.ativo ? 1 : 0.62,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--table-row-hover)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <input
                      type="checkbox"
                      checked={!!m.ativo}
                      disabled={m.essencial}
                      onChange={() => alterar(m.slug, { ativo: !m.ativo })}
                      title={m.essencial ? 'Vai junto com a assinatura' : ''}
                      style={{
                        accentColor: 'var(--blue)', width: 16, height: 16,
                        cursor: m.essencial ? 'not-allowed' : 'pointer', flexShrink: 0,
                      }}
                    />

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, color: 'var(--text-body)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        {m.label}
                        {m.tipo === TIPO_RECURSO && (
                          <span style={{
                            fontSize: 10, fontWeight: 700, color: 'var(--blue)',
                            border: '1px solid var(--blue)', borderRadius: 4, padding: '1px 5px',
                            textTransform: 'uppercase', letterSpacing: '.4px',
                          }}>
                            público
                          </span>
                        )}
                        {m.essencial && (
                          <span style={{ fontSize: 11, color: 'var(--muted)' }}>incluso</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                        {m.descricao}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>R$</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={m.preco_mensal}
                        disabled={m.essencial}
                        onChange={e => alterar(m.slug, { preco_mensal: e.target.value === '' ? 0 : Number(e.target.value) })}
                        title={`Preço padrão: ${formatarReais(precoPadrao(m.slug))}`}
                        style={{ ...SI, width: 86, textAlign: 'right', padding: '6px 8px' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )
          })}

          {!visiveis.length && (
            <div style={{ color: 'var(--muted)', fontSize: 13, padding: '10px 0' }}>
              Nenhum módulo com esses termos.
            </div>
          )}

          <div style={{
            display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
            borderTop: '1px solid var(--border-light)', paddingTop: 16, marginTop: 8,
          }}>
            <div style={{ fontSize: 14, color: 'var(--text-body)' }}>
              Total mensal:{' '}
              <strong style={{ color: 'var(--blue)', fontSize: 17 }}>{formatarReais(total)}</strong>
            </div>
            <button
              className="btn-acao btn-blue"
              onClick={salvar}
              disabled={saving}
              style={{ minHeight: 42, padding: '0 22px', fontSize: 14, color: '#171717', fontWeight: 700, marginLeft: 'auto' }}
            >
              {saving ? 'Salvando…' : 'Salvar módulos da empresa'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
