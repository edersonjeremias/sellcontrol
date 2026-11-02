import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { fmtData, isoLocal, formatarCompetencia, DIAS_SEMANA } from '../../services/rhService'
import { fmtHoras, horaDe, LABEL_BATIDA, TIPOS_BATIDA } from '../../services/pontoService'

function soNumeros(txt) {
  return String(txt || '').replace(/\D/g, '')
}

function fmtDoc(doc) {
  const v = soNumeros(doc)
  if (v.length === 11) return `${v.slice(0,3)}.${v.slice(3,6)}.${v.slice(6,9)}-${v.slice(9)}`
  if (v.length === 14) return `${v.slice(0,2)}.${v.slice(2,5)}.${v.slice(5,8)}/${v.slice(8,12)}-${v.slice(12)}`
  return doc || ''
}

function diaSemanaCurto(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  return DIAS_SEMANA[new Date(y, m - 1, d).getDay()]
}

/**
 * Espelho de ponto do mês, pronto para assinatura.
 * Devolve { blob, arrayBuffer, nomeArquivo } — o chamador guarda o hash
 * SHA-256 antes de enviar, para provar depois que o assinado é o mesmo.
 */
export function gerarEspelhoPdf({ empresa = {}, funcionario = {}, competencia, espelho }) {
  const doc    = new jsPDF()
  const larg   = doc.internal.pageSize.getWidth()
  const margem = 14
  let y = 18

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text('ESPELHO DE PONTO', larg / 2, y, { align: 'center' })

  y += 4
  doc.setDrawColor(200)
  doc.line(margem, y, larg - margem, y)

  y += 9
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('Empregador:', margem, y)
  doc.setFont('helvetica', 'normal')
  doc.text(String(empresa.nome_loja || empresa.nome || '—'), margem + 24, y)

  // Documento do empregador é o CNPJ da empresa. O cpf_cnpj das configurações
  // é o do remetente das encomendas: só serve aqui se for mesmo um CNPJ.
  const cnpjConfig = soNumeros(empresa.cpf_cnpj)
  const docEmpresa = soNumeros(empresa.cnpj) || (cnpjConfig.length === 14 ? cnpjConfig : '')
  if (docEmpresa) {
    doc.setFont('helvetica', 'bold')
    doc.text(docEmpresa.length === 11 ? 'CPF:' : 'CNPJ:', larg / 2 + 10, y)
    doc.setFont('helvetica', 'normal')
    doc.text(fmtDoc(docEmpresa), larg / 2 + 26, y)
  }

  y += 6
  doc.setFont('helvetica', 'bold')
  doc.text('Funcionário(a):', margem, y)
  doc.setFont('helvetica', 'normal')
  doc.text(String(funcionario.nome || '—'), margem + 24, y)

  if (funcionario.cpf) {
    doc.setFont('helvetica', 'bold')
    doc.text('CPF:', larg / 2 + 10, y)
    doc.setFont('helvetica', 'normal')
    doc.text(fmtDoc(funcionario.cpf), larg / 2 + 26, y)
  }

  y += 6
  doc.setFont('helvetica', 'bold')
  doc.text('Competência:', margem, y)
  doc.setFont('helvetica', 'normal')
  doc.text(formatarCompetencia(competencia), margem + 24, y)

  const jornada = espelho.jornada || {}
  doc.setFont('helvetica', 'bold')
  doc.text('Jornada:', larg / 2 + 10, y)
  doc.setFont('helvetica', 'normal')
  doc.text(
    jornada.texto
      ? `${jornada.texto}  (${fmtHoras(jornada.horas)}/dia)`
      : `${fmtHoras(jornada.horas || funcionario.carga_horaria_diaria || 8)}/dia`,
    larg / 2 + 26, y,
  )

  // Uma linha por dia do mês, inclusive os não trabalhados
  const corpo = espelho.dias.map(d => {
    const obs = []
    if (d.feriado)     obs.push('Feriado')
    else if (!d.diaUtil) obs.push('Folga')
    if (d.falta)       obs.push('Falta')
    if (d.atrasoMin)   obs.push(`Atraso ${d.atrasoMin}min`)
    if (d.incompleto)  obs.push('Batida faltando')
    if (Object.keys(d.ajustadas || {}).length) obs.push('Ajuste')

    return [
      `${String(d.dia).slice(8, 10)}/${String(d.dia).slice(5, 7)}`,
      diaSemanaCurto(d.dia),
      ...TIPOS_BATIDA.map(t => horaDe(d.horarios[t]) || '—'),
      d.trabalhadas ? fmtHoras(d.trabalhadas) : '—',
      d.saldo ? fmtHoras(d.saldo) : '—',
      obs.join(', '),
    ]
  })

  // Nesta versao do jspdf-autotable so o metodo do doc existe
  doc.autoTable({
    head: [['Dia', 'Sem.', ...TIPOS_BATIDA.map(t => LABEL_BATIDA[t]), 'Horas', 'Saldo', 'Observação']],
    body: corpo,
    foot: [[
      'Totais', '', '', '', '', '',
      fmtHoras(espelho.totais.trabalhadas),
      fmtHoras(espelho.totais.saldo),
      [
        `${espelho.totais.faltas} ${espelho.totais.faltas === 1 ? 'falta' : 'faltas'}`,
        espelho.totais.atrasos ? `${espelho.totais.atrasos} atraso(s)` : '',
      ].filter(Boolean).join(' • '),
    ]],
    startY: y + 6,
    margin: { left: margem, right: margem },
    styles:     { fontSize: 7, cellPadding: 1.3, textColor: [40, 40, 40] },
    headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
    footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 12 },
      1: { cellWidth: 11, halign: 'center' },
      2: { halign: 'center' }, 3: { halign: 'center' },
      4: { halign: 'center' }, 5: { halign: 'center' },
      6: { halign: 'right', cellWidth: 16 },
      7: { halign: 'right', cellWidth: 16 },
    },
    // Fim de semana e falta precisam saltar aos olhos na conferência
    didParseCell: (data) => {
      if (data.section !== 'body') return
      const dia = espelho.dias[data.row.index]
      if (!dia) return
      if (!dia.diaUtil || dia.futuro) data.cell.styles.textColor = [150, 150, 150]
      if (dia.falta)     data.cell.styles.textColor = [192, 57, 43]
      if (dia.atrasoMin) data.cell.styles.textColor = [176, 122, 0]
    },
  })

  // O bloco de assinatura precisa de ~46mm. Sem esta conta ele era
  // desenhado fora da página quando a tabela terminava no pé da folha —
  // e o espelho saía sem lugar para assinar.
  const alturaPagina = doc.internal.pageSize.getHeight()
  const PRECISA      = 50
  let fim = doc.lastAutoTable.finalY + 8
  if (fim + PRECISA > alturaPagina - margem) {
    doc.addPage()
    fim = 20
  }

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(40)
  const texto = 'Declaro que as marcações acima correspondem à minha jornada no período, ' +
    'estando corretos os horários, as horas trabalhadas e o saldo apurado.'
  doc.text(doc.splitTextToSize(texto, larg - margem * 2), margem, fim)

  // Duas assinaturas lado a lado: quem confere e quem apura
  fim += 22
  const colunas = [
    { centro: margem + (larg - margem * 2) / 4,       nome: String(funcionario.nome || ''),            papel: 'Assinatura do funcionário(a)' },
    { centro: larg - margem - (larg - margem * 2) / 4, nome: String(empresa.nome_loja || empresa.nome || ''), papel: 'Assinatura do empregador' },
  ]
  colunas.forEach(({ centro, nome, papel }) => {
    doc.setDrawColor(120)
    doc.line(centro - 38, fim, centro + 38, fim)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(40)
    doc.text(nome, centro, fim + 5, { align: 'center', maxWidth: 76 })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(120)
    doc.text(papel, centro, fim + 9.5, { align: 'center' })
  })

  fim += 18
  doc.setFontSize(8)
  doc.setTextColor(120)
  doc.text('Data: ____/____/________', larg / 2, fim, { align: 'center' })
  fim += 7
  doc.setFontSize(7.5)
  doc.text(`Emitido em ${fmtData(isoLocal(new Date()))}`, larg / 2, fim, { align: 'center' })

  const slug = String(funcionario.apelido || funcionario.nome || 'funcionario')
    .toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  return {
    arrayBuffer: doc.output('arraybuffer'),
    blob:        doc.output('blob'),
    nomeArquivo: `espelho-ponto-${slug}-${String(competencia).slice(0, 7)}.pdf`,
    doc,
  }
}
