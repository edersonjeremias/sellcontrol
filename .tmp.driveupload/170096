import { useMemo, useState } from 'react'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend,
} from 'chart.js'
import ChartDataLabels from 'chartjs-plugin-datalabels'
import { Bar } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ChartDataLabels)

function fmtISO(d) { return d ? String(d).slice(0, 10) : '' }

function rangeISO(start, end) {
  const out = []
  const cur = new Date(start)
  const stop = new Date(end)
  while (cur <= stop) {
    out.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

function defaultRange() {
  const end = new Date()
  const start = new Date(); start.setDate(end.getDate() - 13)
  return {
    inicio: start.toISOString().slice(0, 10),
    fim: end.toISOString().slice(0, 10),
  }
}

export default function DashboardModal({ rows, onClose }) {
  const def = defaultRange()
  const [inicio, setInicio] = useState(def.inicio)
  const [fim, setFim] = useState(def.fim)

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const prontosHoje = rows.filter(
      (r) => fmtISO(r.data_pronto) === today && r.status_prod !== 'Repetido'
    ).length

    const inRange = (d) => d >= inicio && d <= fim

    const entraram = rows.filter((r) => r.status_prod !== 'Repetido' && inRange(fmtISO(r.data_solicitado))).length
    const prontos = rows.filter((r) => r.status_prod !== 'Repetido' && fmtISO(r.data_pronto) && inRange(fmtISO(r.data_pronto))).length

    const pendentes = rows.filter((r) => {
      const sp = r.status_prod || ''
      const se = r.status_entrega || ''
      if (sp === 'Repetido' || sp === 'Pronto' || sp === 'Liberado') return false
      if (se === 'Enviado' || se === 'Retirou') return false
      return true
    }).length

    return { prontosHoje, entraram, prontos, pendentes }
  }, [rows, inicio, fim])

  const chartData = useMemo(() => {
    if (!inicio || !fim || inicio > fim) return null
    const days = rangeISO(inicio, fim)

    const entraramMap = {}
    const prontosMap = {}
    days.forEach((d) => { entraramMap[d] = 0; prontosMap[d] = 0 })

    rows.forEach((r) => {
      if (r.status_prod === 'Repetido') return
      const ds = fmtISO(r.data_solicitado)
      const dp = fmtISO(r.data_pronto)
      if (entraramMap[ds] !== undefined) entraramMap[ds]++
      if (dp && prontosMap[dp] !== undefined) prontosMap[dp]++
    })

    return {
      labels: days.map((d) => d.slice(5).replace('-', '/')),
      datasets: [
        {
          label: 'Entraram',
          data: days.map((d) => entraramMap[d]),
          backgroundColor: 'rgba(0,188,212,0.7)',
          borderRadius: 4,
        },
        {
          label: 'Ficaram Prontos',
          data: days.map((d) => prontosMap[d]),
          backgroundColor: 'rgba(34,197,94,0.7)',
          borderRadius: 4,
        },
      ],
    }
  }, [rows, inicio, fim])

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#f0f0f1', boxWidth: 12, font: { size: 11 } } },
      datalabels: {
        anchor: 'end',
        align: 'top',
        color: '#f0f0f1',
        font: { size: 10, weight: 'bold' },
        formatter: (v) => (v === 0 ? '' : v),
      },
    },
    scales: {
      x: { ticks: { color: '#abb1bd', font: { size: 10 } }, grid: { color: '#3c414b' } },
      y: { ticks: { color: '#abb1bd', font: { size: 10 } }, grid: { color: '#3c414b' }, beginAtZero: true },
    },
  }

  return (
    <div className="prod-modal-overlay" onClick={onClose}>
      <div className="prod-modal-card prod-dash-card" onClick={(e) => e.stopPropagation()}>
        <div className="prod-modal-header">
          <span>📊 Estatísticas</span>
          <button type="button" className="prod-modal-close" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
          <label style={{ color: 'var(--prod-muted)', fontSize: 12 }}>Período:</label>
          <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)}
            style={{ background: '#26292f', border: '1px solid #3c414b', color: '#f0f0f1', borderRadius: 4, padding: '4px 8px', fontSize: 12 }} />
          <span style={{ color: 'var(--prod-muted)' }}>até</span>
          <input type="date" value={fim} onChange={(e) => setFim(e.target.value)}
            style={{ background: '#26292f', border: '1px solid #3c414b', color: '#f0f0f1', borderRadius: 4, padding: '4px 8px', fontSize: 12 }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'Prontos Hoje', val: stats.prontosHoje, color: '#22c55e' },
            { label: 'Entraram', val: stats.entraram, color: '#00bcd4' },
            { label: 'Ficaram Prontos', val: stats.prontos, color: '#22c55e' },
            { label: 'Pendentes', val: stats.pendentes, color: '#ff9800' },
          ].map((c) => (
            <div key={c.label} style={{ background: '#1c1f24', border: '1px solid #3c414b', borderRadius: 7, padding: '10px 6px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#abb1bd', marginBottom: 4, lineHeight: 1.3 }}>{c.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: c.color }}>{c.val}</div>
            </div>
          ))}
        </div>

        {chartData && (
          <div style={{ background: '#1c1f24', borderRadius: 8, padding: '12px 8px', height: 260 }}>
            <Bar data={chartData} options={chartOptions} />
          </div>
        )}
      </div>
    </div>
  )
}
