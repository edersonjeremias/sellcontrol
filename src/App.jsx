import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import VendasPage from './pages/vendas/VendasPage'

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/vendas" replace />} />
          <Route path="/vendas" element={<VendasPage />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  )
}
