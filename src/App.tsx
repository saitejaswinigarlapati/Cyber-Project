import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import Sidebar from './components/Sidebar.tsx';
import Navbar from './components/Navbar.tsx';
import Dashboard from './pages/Dashboard.tsx';
import AdminPanel from './pages/AdminPanel.tsx';
import Login from './pages/Login.tsx';
import Signup from './pages/Signup.tsx';
import VerifyEmail from './pages/VerifyEmail.tsx';
import ForgotPassword from './pages/ForgotPassword.tsx';
import ResetPassword from './pages/ResetPassword.tsx';

const PrivateRoute: React.FC<{ children: React.ReactNode, adminOnly?: boolean }> = ({ children, adminOnly }) => {
  const { user, token, loading, error } = useAuth();
  
  if (loading) return (
    <div className="flex flex-col items-center justify-center h-screen bg-[#0a0a0b] text-white">
      <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
      <p className="text-gray-400 font-black uppercase tracking-[0.3em] text-xs">Initializing Session...</p>
      {error && <p className="mt-4 text-red-500 text-[10px] font-bold max-w-md text-center">{error}</p>}
    </div>
  );

  if (!token) return <Navigate to="/login" />;
  
  if (adminOnly && user?.role !== 'admin') {
    return <Navigate to="/" />;
  }
  
  return <>{children}</>;
};

const AppContent = () => {
  const { token } = useAuth();

  return (
    <div className="flex h-screen bg-[#0a0a0b]">
      {token && <Sidebar />}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {token && <Navbar />}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
          <Routes>
            <Route path="/login" element={!token ? <Login /> : <Navigate to="/" />} />
            <Route path="/signup" element={!token ? <Signup /> : <Navigate to="/" />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
            <Route path="/recent" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
            <Route path="/starred" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
            <Route path="/folders" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
            <Route path="/shared" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
            <Route path="/spam" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
            <Route path="/trash" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
            <Route path="/folder/:folderId" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
            <Route path="/admin" element={<PrivateRoute adminOnly><AdminPanel /></PrivateRoute>} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
    </div>
  );
};

import { ModalProvider } from './context/ModalContext.tsx';
import { MeshBackground } from './components/animations/MeshBackground.tsx';

export default function App() {
  return (
    <AuthProvider>
      <ModalProvider>
        <BrowserRouter>
          <MeshBackground />
          <AppContent />
        </BrowserRouter>
      </ModalProvider>
    </AuthProvider>
  );
}
