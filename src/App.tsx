import { HashRouter as Router, Navigate, Route, Routes } from 'react-router-dom'
import { EnforcedLayout } from './layout/EnforcedLayout'
import { DataBankProvider } from './state/DataBankProvider'
import { AuthProvider } from './state/AuthProvider'
import { LoginPrompt } from './components/LoginPrompt'
import { DataPage } from './pages/DataPage'
import { AuditPage } from './pages/AuditPage'
import { OperationsPage } from './pages/OperationsPage'

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <DataBankProvider>
          <LoginPrompt />
        <Routes>
          <Route element={<EnforcedLayout />}>
            <Route path="/" element={<Navigate to="/data" replace />} />
            <Route path="/data" element={<DataPage />} />
            <Route path="/upload" element={<Navigate to="/data" replace />} />
            <Route path="/view" element={<Navigate to="/data" replace />} />
            <Route path="/audit" element={<AuditPage />} />
            <Route path="/ops" element={<OperationsPage />} />
          </Route>
        </Routes>
        </DataBankProvider>
      </AuthProvider>
    </Router>
  )
}
