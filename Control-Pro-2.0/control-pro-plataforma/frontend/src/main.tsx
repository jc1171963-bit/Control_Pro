import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './app/auth';
import { ToastProvider } from './components/ui';
import { router } from './app/router';
import './index.css';

const qc = new QueryClient({
  defaultOptions: { queries: { retry: (n, e: any) => n < 1 && !(e?.status >= 400 && e?.status < 500), staleTime: 15_000, refetchOnWindowFocus: false } },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
