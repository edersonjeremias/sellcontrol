import { Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import VendasPage from './pages/VendasPage'

export default function App() {
  return (
    <AppProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/vendas" replace />} />
        <Route path="/vendas" element={<VendasPage />} />
      </Routes>
    </AppProvider>
  )
}
