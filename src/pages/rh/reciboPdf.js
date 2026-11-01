import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { fmtR, fmtData, isoLocal, ehDesconto, LABEL_TIPO } from '../../services/rhService'

// Vale e adiantamento são dinheiro que o funcionário já levou durante o mês:
// no recibo eles abatem do líquido, como qualquer outro desconto.
const TIPOS_ADIANTAMENTO = ['VALE', 'ADIANTAMENTO']

function soNumeros(txt) {
  return String(txt || '').replace(/\D/g, '')
}

function fmtCpf(cpf) {
  const v = soNumeros(cpf)
  if (v.length !== 11) return cpf || ''
  return `${v.slice(0,3)}.${v.slice(3,6)}.${v.slice(6,9)}-${v.slice(9)}`
}

function fmtCnpj(doc) {
  const v = soNumeros(doc)
  if (v.length !== 14) return doc || ''
  return `${v.slice(0,2)}.${v.slice(2,5)}.${v.slice(5,8)}/${v.slice(8,12)}-${v.slice(12)}`
}

/**
 * Separa o período em verbas e descontos e fecha o líquido.
 * Os adiantamentos vão agrupados numa linha só, com as datas, porque uma
 * linha por vale polui o recibo sem dizer nada a mais.
 */
export function montarLinhasRecibo(lancamentos) {
  const verbas      = []
  const descontos   = []
  const adiantados  = []

  lancamentos
    .slice()
    .sort((a, b) => String(a.data_prevista).localeCompare(String(b.data_prevista)))
    .forEach(l => {
      const valor = Number(l.valor) || 0
      if (!valor) return
      const rotulo = LABEL_TIPO[l.tipo] || l.tipo

      if (TIPOS_ADIANTAMENTO.includes(l.tipo)) {
        adiantados.push(l)
      } else if (ehDesconto(l.tipo)) {
        descontos.push({ descricao: `${rotulo}: ${l.descricao || '—'}`, valor })
      } else {
        verbas.push({
          descricao: l.descricao ? `${rotulo} — ${l.descricao}` : rotulo,
          valor,
        })
      }
    })

  if (adiantados.length) {
    const datas = adiantados.map(l => fmtData(l.data_prevista).slice(0, 5)).join(', ')
    descontos.unshift({
      descricao: adiantados.length === 1
        ? `Adiantamento em ${datas}`
        : `Adiantamentos (${datas})`,
      valor: adiantados.reduce((s, l) => s + (Number(l.valor) || 0), 0),
    })
  }

  const totalVerbas    = verbas.reduce((s, l) => s + l.valor, 0)
  const totalDescontos = descontos.reduce((s, l) => s + l.valor, 0)

  return { verbas, descontos, totalVerbas, totalDescontos, liquido: totalVerbas - totalDescontos }
}

/**
 * Gera e baixa o recibo do período. `empresa` vem de configuracoes
 * (nome_loja / cpf_cnpj) e `funcionario` do cadastro do RH.
 */
export function gerarReciboPdf({ empresa = {}, funcionario = {}, dataInicio, dataFim, lancamentos = [] }) {
  const resumo = montarLinhasRecibo(lancamentos)
  const doc    = new jsPDF()
  const larg   = doc.internal.pageSize.getWidth()
  const margem = 16
  let y = 20

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('RECIBO DE PAGAMENTO', larg / 2, y, { align: 'center' })

  y += 4
  doc.setDrawColor(200)
  doc.line(margem, y, larg - margem, y)

  // Empregador
  y += 10
  doc.setFontSize(10)
  doc.text('Empregador:', margem, y)
  doc.setFont('helvetica', 'normal')
  doc.text(String(empresa.nome_loja || empresa.nome || '—'), margem + 26, y)

  if (empresa.cpf_cnpj) {
    y += 6
    doc.setFont('helvetica', 'bold')
    doc.text('CNPJ:', margem, y)
    doc.setFont('helvetica', 'normal')
    doc.text(fmtCnpj(empresa.cpf_cnpj), margem + 26, y)
  }

  // Funcionário
  y += 10
  doc.setFont('helvetica', 'bold')
  doc.text('Funcionário(a):', margem, y)
  doc.setFont('helvetica', 'normal')
  doc.text(String(funcionario.nome || '—'), margem + 30, y)

  if (funcionario.cpf) {
    y += 6
    doc.setFont('helvetica', 'bold')
    doc.text('CPF:', margem, y)
    doc.setFont('helvetica', 'normal')
    doc.text(fmtCpf(funcionario.cpf), margem + 30, y)
  }

  if (funcionario.cargo) {
    y += 6
    doc.setFont('helvetica', 'bold')
    doc.text('Cargo:', margem, y)
    doc.setFont('helvetica', 'normal')
    doc.text(String(funcionario.cargo), margem + 30, y)
  }

  y += 6
  doc.setFont('helvetica', 'bold')
  doc.text('Período:', margem, y)
  doc.setFont('helvetica', 'normal')
  doc.text(`${fmtData(dataInicio)} a ${fmtData(dataFim)}`, margem + 30, y)

  // Verbas e descontos
  const corpo = [
    ...resumo.verbas.map(l => [l.descricao, fmtR(l.valor)]),
    ...resumo.descontos.map(l => [l.descricao, `- ${fmtR(l.valor)}`]),
  ]

  doc.autoTable({
    head: [['Descrição', 'Valor']],
    body: corpo.length ? corpo : [['Sem lançamentos no período', fmtR(0)]],
    foot: [['LÍQUIDO A RECEBER', fmtR(resumo.liquido)]],
    startY: y + 8,
    margin: { left: margem, right: margem },
    styles:      { fontSize: 9, cellPadding: 3, textColor: [40, 40, 40] },
    headStyles:  { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
    footStyles:  { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 11 },
    columnStyles: { 1: { halign: 'right', cellWidth: 38 } },
    // Desconto em vermelho: o sinal sozinho passa batido numa lista longa
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index >= resumo.verbas.length) {
        data.cell.styles.textColor = [192, 57, 43]
      }
    },
  })

  let fim = doc.lastAutoTable.finalY + 14

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  const texto = `Recebi a importância líquida de ${fmtR(resumo.liquido)}, correspondente ao pagamento ` +
    `das verbas descritas neste recibo, referente ao período de ${fmtData(dataInicio)} a ${fmtData(dataFim)}.`
  doc.text(doc.splitTextToSize(texto, larg - margem * 2), margem, fim)

  // Assinatura
  fim += 34
  const meio = larg / 2
  doc.setDrawColor(120)
  doc.line(meio - 55, fim, meio + 55, fim)
  fim += 6
  doc.setFont('helvetica', 'bold')
  doc.text(String(funcionario.nome || ''), meio, fim, { align: 'center' })
  fim += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(120)
  doc.text('Assinatura do funcionário(a)', meio, fim, { align: 'center' })

  fim += 10
  doc.setFontSize(8)
  doc.text(`Emitido em ${fmtData(isoLocal(new Date()))}`, meio, fim, { align: 'center' })

  const apelidoArquivo = String(funcionario.apelido || funcionario.nome || 'funcionario')
    .toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  doc.save(`recibo-${apelidoArquivo}-${dataInicio}-a-${dataFim}.pdf`)

  return resumo
}
