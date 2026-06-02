import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { ErrorBoundary, logError } from '@/components/ErrorBoundary';
import './styles/globals.css';

const qc = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
  // Log all mutation/query errors globally with structured error codes
  queryCache: undefined,
  mutationCache: undefined,
});

// Global query error handler
qc.getQueryCache().config.onError = (error, query) => {
  logError('UI-0002', (error as Error).message, {
    queryKey: JSON.stringify(query.queryKey),
    source: 'react-query/query',
  });
};

qc.getMutationCache().config.onError = (error, _variables, _context, mutation) => {
  logError('UI-0003', (error as Error).message, {
    mutationKey: JSON.stringify(mutation.options.mutationKey),
    source: 'react-query/mutation',
  });
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={qc}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
