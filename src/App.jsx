import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ErrorBoundary } from './components/ErrorBoundary';
import { hasSupabaseConfig } from './lib/supabase';
import Layout from './components/Layout';
import Login from './pages/Login';
import Signup from './pages/Signup';
import SignupComplete from './pages/SignupComplete';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Customers from './pages/Customers';
import Invoices from './pages/Invoices';
import CreateInvoice from './pages/CreateInvoice';
import InvoicePrint from './pages/InvoicePrint';
import './App.css';

function ConfigError() {
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 480, margin: '40px auto' }}>
      <h1 style={{ fontSize: '1.25rem', marginBottom: 8 }}>Missing configuration</h1>
      <p style={{ color: '#64748b', marginBottom: 16 }}>
        Set <strong>VITE_SUPABASE_URL</strong> and <strong>VITE_SUPABASE_ANON_KEY</strong> (or VITE_SUPABASE_KEY) in your Vercel project → Settings → Environment Variables, then redeploy.
      </p>
    </div>
  );
}

export default function App() {
  if (!hasSupabaseConfig()) {
    return (
      <ErrorBoundary>
        <ConfigError />
      </ErrorBoundary>
    );
  }
  return (
    <ErrorBoundary>
    <AuthProvider>
      <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/signup/complete" element={<SignupComplete />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="products" element={<Products />} />
            <Route path="customers" element={<Customers />} />
            <Route path="invoices" element={<Invoices />} />
            <Route path="invoices/new" element={<CreateInvoice />} />
            <Route path="invoices/:id/print" element={<InvoicePrint />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
    </ErrorBoundary>
  );
}
