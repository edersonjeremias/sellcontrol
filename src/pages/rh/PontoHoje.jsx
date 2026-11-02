import { montarEspelho, TIPOS_BATIDA, LABEL_BATIDA, horaDe, fmtHoras } from '../../services/pontoService'

/**
 * Quem está trabalhando agora e as batidas do dia, sem precisar abrir
 * o mês de ninguém. É a primeira coisa que a loja olha de manhã.
 */

// O estado sai da sequência de batidas, não do relógio: quem bateu a saída
// está fora mesmo que ainda esteja dentro da loja.
function situacao(horarios) {
  const { ENTRADA, SAIDA_ALMOCO, VOLTA_ALMOCO, SAIDA } = horarios
  if (SAIDA)         return { texto: `Saiu ${horaDe(SAIDA)}`,                 cor: 'fim'   }
  if (VOLTA_ALMOCO)  return { texto: `Trabalhando desde ${horaDe(VOLTA_ALMOCO)}`, cor: 'ativo' }
  if (SAIDA_ALMOCO)  return { texto: `Em almoço desde ${horaDe(SAIDA_ALMOCO)}`,   cor: 'almoco' }
  if (ENTRADA)       return { texto: `Trabalhando desde ${horaDe(ENTRADA)}`,      cor: 'ativo' }
  return { texto: 'Sem batida hoje', cor: 'nada' }
}

export default function PontoHoje({ hoje, funcionarios, marcacoes, feriados = [], onAbrirDia }) {
  if (!funcionarios.length) return null

  const linhas = funcionarios.map(func => {
    const espelho = montarEspelho({
      funcionario: func,
      dataInicio:  hoje,
      dataFim:     hoje,
      marcacoes:   marcacoes.filter(m => m.funcionario_id === func.id),
      ajustes:     [],
      feriados,
      hoje,
    })
    const dia = espelho.dias[0]
    return { func, dia, sit: situacao(dia.horarios) }
  })

  const trabalhando = linhas.filter(l => l.sit.cor === 'ativo').length
  const almoco      = linhas.filter(l => l.sit.cor === 'almoco').length

  const dataLonga = new Date(`${hoje}T12:00:00`).toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long',
  })

  return (
    <div className="pt-hoje">
      <div className="pt-hoje-topo">
        <h4>Hoje <span>{dataLonga}</span></h4>
        <div className="pt-hoje-resumo">
          <b className="ativo">{trabalhando}</b> na loja
          {almoco > 0 && <> • <b className="almoco">{almoco}</b> em almoço</>}
        </div>
      </div>

      <div className="pt-hoje-grade">
        {linhas.map(({ func, dia, sit }) => (
          <div
            key={func.id}
            className={`pt-hoje-card ${sit.cor}`}
            onClick={() => onAbrirDia?.(func, dia)}
            title="Ver as fotos das batidas de hoje"
          >
            <div className="pt-hoje-nome">{func.apelido || func.nome}</div>
            <div className={`pt-hoje-sit ${sit.cor}`}>{sit.texto}</div>

            <div className="pt-hoje-batidas">
              {TIPOS_BATIDA.map(t => (
                <div key={t} className={dia.horarios[t] ? 'feita' : ''}>
                  <span>{LABEL_BATIDA[t]}</span>
                  <b>{horaDe(dia.horarios[t]) || '—'}</b>
                </div>
              ))}
            </div>

            <div className="pt-hoje-pe">
              {dia.trabalhadas ? `${fmtHoras(dia.trabalhadas)} até agora` : 'nenhuma hora apurada'}
              {dia.atrasoMin > 0 && <span className="atraso"> • {dia.atrasoMin} min de atraso</span>}
              {!dia.diaUtil && <span className="folga"> • {dia.feriado ? 'feriado' : 'folga'}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
