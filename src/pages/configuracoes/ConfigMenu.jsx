import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import {
  getPaginasDoMenu, agruparEmCategorias, salvarMenu, CATEGORIA_PADRAO,
} from '../../services/menuService'

const INPUT = {
  background: 'var(--input-bg)', border: '1px solid var(--border-light)',
  color: 'var(--text-body)', borderRadius: 6, padding: '6px 10px',
  fontSize: 14, colorScheme: 'dark',
}

const BTN_MINI = {
  background: 'transparent', border: '1px solid var(--border-light)',
  borderRadius: 5, color: 'var(--muted)', cursor: 'pointer',
  fontSize: 12, lineHeight: 1, padding: '5px 8px',
}

function mover(lista, de, para) {
  if (para < 0 || para >= lista.length) return lista
  const copia = [...lista]
  const guardado = copia[de]
  copia[de] = copia[para]
  copia[para] = guardado
  return copia
}

export default function ConfigMenu() {
  const { profile }   = useAuth()
  const { showToast } = useApp()
  const tenantId      = profile?.tenant_id

  const [categorias, setCategorias] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [salvando,   setSalvando]   = useState(false)
  const [alterado,   setAlterado]   = useState(false)

  const carregar = useCallback(async () => {
    if (!tenantId) return
    setCarregando(true)
    try {
      const paginas = await getPaginasDoMenu(tenantId)
      setCategorias(agruparEmCategorias(paginas))
      setAlterado(false)
    } catch (e) {
      showToast('Erro ao carregar o menu: ' + e.message, 'error')
    } finally {
      setCarregando(false)
    }
  }, [tenantId, showToast])

  useEffect(() => { carregar() }, [carregar])

  function atualizar(novas) {
    setCategorias(novas)
    setAlterado(true)
  }

  function renomear(iCat, nome) {
    atualizar(categorias.map((c, i) => i === iCat ? { ...c, nome } : c))
  }

  function moverCategoria(iCat, direcao) {
    atualizar(mover(categorias, iCat, iCat + direcao))
  }

  function removerCategoria(iCat) {
    atualizar(categorias.filter((_, i) => i !== iCat))
  }

  function novaCategoria() {
    let nome = 'Nova categoria'
    let n = 2
    while (categorias.some(c => c.nome === nome)) {
      nome = 'Nova categoria ' + n
      n++
    }
    atualizar([...categorias, { nome, paginas: [] }])
  }

  function moverPagina(iCat, iPag, direcao) {
    atualizar(categorias.map((c, i) =>
      i === iCat ? { ...c, paginas: mover(c.paginas, iPag, iPag + direcao) } : c
    ))
  }

  function trocarDeCategoria(iCat, iPag, destinoNome) {
    const iDestino = categorias.findIndex(c => c.nome === destinoNome)
    if (iDestino === -1 || iDestino === iCat) return
    const pagina = categorias[iCat].paginas[iPag]
    atualizar(categorias.map((c, i) => {
      if (i === iCat)     return { ...c, paginas: c.paginas.filter((_, j) => j !== iPag) }
      if (i === iDestino) return { ...c, paginas: [...c.paginas, pagina] }
      return c
    }))
  }

  async function salvar() {
    const nomes = categorias.map(c => c.nome.trim())

    if (nomes.some(n => !n)) {
      return showToast('Toda categoria precisa de um nome.', 'error')
    }
    if (new Set(nomes).size !== nomes.length) {
      return showToast('Há duas categorias com o mesmo nome.', 'error')
    }

    const vazias = categorias.filter(c => c.paginas.length === 0).length

    setSalvando(true)
    try {
      await salvarMenu(categorias.filter(c => c.paginas.length > 0))
      showToast(
        vazias > 0
          ? 'Menu salvo! ' + vazias + ' categoria(s) sem página não foram guardadas.'
          : 'Menu salvo! Recarregue a página para ver o menu novo.'
      )
      await carregar()
    } catch (e) {
      showToast('Erro ao salvar: ' + e.message, 'error')
    } finally {
      setSalvando(false)
    }
  }

  if (carregando) {
    return <div style={{ padding: 24, color: 'var(--muted)' }}>Carregando menu...</div>
  }

  if (categorias.length === 0) {
    return (
      <div style={{ padding: 24, color: 'var(--muted)' }}>
        Nenhuma página cadastrada nesta empresa ainda.
      </div>
    )
  }

  return (
    <div style={{ padding: '20px 0' }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>Menu lateral</h3>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--muted)' }}>
        Defina o nome de cada categoria e quais páginas entram nela. A ordem daqui é a
        ordem do menu. Cada pessoa continua vendo só as páginas liberadas no botão
        <strong> Páginas</strong>.
      </p>

      <button
        className="btn-acao btn-blue"
        onClick={novaCategoria}
        style={{ marginBottom: 16, padding: '0 16px', height: 34, fontSize: 13, color: '#171717', fontWeight: 600 }}
      >
        + Nova categoria
      </button>

      {categorias.map((categoria, iCat) => (
        <div
          key={iCat}
          style={{
            background: 'var(--card-bg)', border: '1px solid var(--border-light)',
            borderRadius: 8, marginBottom: 10, overflow: 'hidden',
          }}
        >
          {/* Cabeçalho da categoria */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
            borderBottom: categoria.paginas.length ? '1px solid var(--border-light)' : 'none',
          }}>
            <input
              value={categoria.nome}
              onChange={e => renomear(iCat, e.target.value)}
              style={{ ...INPUT, flex: 1, fontWeight: 600 }}
            />
            <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
              {categoria.paginas.length} pág.
            </span>
            <button style={BTN_MINI} onClick={() => moverCategoria(iCat, -1)} disabled={iCat === 0}>▲</button>
            <button style={BTN_MINI} onClick={() => moverCategoria(iCat, 1)} disabled={iCat === categorias.length - 1}>▼</button>
            {categoria.paginas.length === 0 && (
              <button
                style={{ ...BTN_MINI, color: '#f28b82' }}
                onClick={() => removerCategoria(iCat)}
                title="Remover categoria vazia"
              >
                ✕
              </button>
            )}
          </div>

          {/* Páginas da categoria */}
          {categoria.paginas.map((pagina, iPag) => (
            <div
              key={pagina.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px 8px 24px',
                borderTop: iPag === 0 ? 'none' : '1px solid var(--border-light)',
              }}
            >
              <span style={{ flex: 1, fontSize: 13, color: 'var(--text-body)' }}>
                {pagina.label}
                <span style={{ color: 'var(--muted)', fontSize: 11, marginLeft: 6 }}>/{pagina.slug}</span>
              </span>

              <select
                value={categoria.nome}
                onChange={e => trocarDeCategoria(iCat, iPag, e.target.value)}
                style={{ ...INPUT, fontSize: 12, padding: '4px 6px', maxWidth: 150 }}
                title="Mover para outra categoria"
              >
                {categorias.map((c, i) => (
                  <option key={i} value={c.nome}>{c.nome}</option>
                ))}
              </select>

              <button style={BTN_MINI} onClick={() => moverPagina(iCat, iPag, -1)} disabled={iPag === 0}>▲</button>
              <button style={BTN_MINI} onClick={() => moverPagina(iCat, iPag, 1)} disabled={iPag === categoria.paginas.length - 1}>▼</button>
            </div>
          ))}

          {categoria.paginas.length === 0 && (
            <div style={{ padding: '0 12px 10px 24px', fontSize: 12, color: 'var(--yellow)' }}>
              Sem páginas — mova alguma para cá, senão a categoria não é salva.
            </div>
          )}
        </div>
      ))}

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button
          className="btn-acao btn-green"
          onClick={salvar}
          disabled={salvando || !alterado}
          style={{ minHeight: 42, padding: '0 24px', fontSize: 14, color: '#171717', fontWeight: 700, opacity: alterado ? 1 : 0.5 }}
        >
          {salvando ? 'Salvando...' : 'Salvar menu'}
        </button>
        {alterado && (
          <button onClick={carregar} style={{ ...BTN_MINI, padding: '0 16px', fontSize: 13 }}>
            Descartar alterações
          </button>
        )}
      </div>

      <p style={{ marginTop: 12, fontSize: 11, color: 'var(--muted)' }}>
        Páginas sem categoria entram em <strong>{CATEGORIA_PADRAO}</strong>.
      </p>
    </div>
  )
}
