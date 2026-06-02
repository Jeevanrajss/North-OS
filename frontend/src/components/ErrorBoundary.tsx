import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null; errorId: string | null };

async function reportError(code: string, message: string, stack?: string, context?: Record<string, unknown>) {
  try {
    await fetch('/api/v1/logs/error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error_code: code,
        message,
        stack: stack?.slice(0, 2000),
        context,
        url: window.location.href,
        user_agent: navigator.userAgent.slice(0, 200),
      }),
    });
  } catch {
    // non-fatal — never let error reporting crash the app
  }
}

/** Global helper — call this anywhere to log an error with a code. */
export function logError(
  code: string,
  message: string,
  extra?: Record<string, unknown>,
) {
  console.error(`[${code}] ${message}`, extra);
  void reportError(code, message, undefined, extra);
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, errorId: null };

  static getDerivedStateFromError(error: Error): State {
    const errorId = `UI-${Date.now().toString(36).toUpperCase()}`;
    return { error, errorId };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const errorId = this.state.errorId ?? 'UI-0001';
    void reportError(
      'UI-0001',
      error.message,
      (error.stack ?? '') + '\n\nComponent stack:\n' + info.componentStack,
      { errorId, componentStack: info.componentStack?.slice(0, 500) },
    );
  }

  render() {
    const { error, errorId } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        style={{
          minHeight: '100vh', display: 'grid', placeItems: 'center',
          background: 'var(--bg-app, #0E1018)', color: 'var(--fg-1, #F5F6FA)',
          fontFamily: 'system-ui, sans-serif', padding: 32,
        }}
      >
        <div style={{ maxWidth: 520, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ margin: '0 0 10px', fontSize: 20 }}>Something went wrong</h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 20 }}>
            {error.message}
          </p>

          {/* Error ID chip */}
          <div style={{
            display: 'inline-block', padding: '4px 12px', borderRadius: 999,
            background: 'rgba(255,91,110,0.12)', border: '1px solid rgba(255,91,110,0.30)',
            fontFamily: 'monospace', fontSize: 12, color: '#FF5B6E', marginBottom: 24,
          }}>
            Error ID: {errorId} · Code: UI-0001
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '8px 20px', borderRadius: 10,
                background: 'rgba(139,124,255,0.20)', border: '1px solid rgba(139,124,255,0.40)',
                color: '#B8A5FF', cursor: 'pointer', fontSize: 13,
              }}
            >
              Reload page
            </button>
            <button
              onClick={() => this.setState({ error: null, errorId: null })}
              style={{
                padding: '8px 20px', borderRadius: 10,
                background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
                color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 13,
              }}
            >
              Try to recover
            </button>
          </div>

          <p style={{ marginTop: 24, fontSize: 11, color: 'rgba(255,255,255,0.25)', lineHeight: 1.5 }}>
            This error has been logged automatically. You can view logs at<br />
            <code style={{ fontFamily: 'monospace' }}>GET /api/v1/logs/errors</code>
          </p>
        </div>
      </div>
    );
  }
}
