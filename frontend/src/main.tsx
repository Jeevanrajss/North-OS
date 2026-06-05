import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { ErrorBoundary, logError } from '@/components/ErrorBoundary';
import { ToastProvider } from '@/contexts/ToastContext';
import './styles/globals.css';

// Toast instance available globally for React Query error callbacks
// (before the React tree renders — wired via a module-level ref)
let _toastError: ((msg: string) => void) | null = null;
export function _registerToastError(fn: (msg: string) => void) { _toastError = fn; }

const qc = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
  queryCache: undefined,
  mutationCache: undefined,
});

// Global query error handler — log + show snackbar
qc.getQueryCache().config.onError = (error, query) => {
  const msg = (error as Error).message;
  logError('UI-0002', msg, { queryKey: JSON.stringify(query.queryKey), source: 'react-query/query' });
  // Only show snackbar for non-404 errors (404s are normal for "no data yet" queries)
  if (!msg.includes('404')) _toastError?.(msg.slice(0, 120));
};

qc.getMutationCache().config.onError = (error, _variables, _context, mutation) => {
  const msg = (error as Error).message;
  logError('UI-0003', msg, { mutationKey: JSON.stringify(mutation.options.mutationKey), source: 'react-query/mutation' });
  _toastError?.(msg.slice(0, 120));
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={qc}>
        <BrowserRouter>
          <ToastProvider>
            <App />
          </ToastProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
