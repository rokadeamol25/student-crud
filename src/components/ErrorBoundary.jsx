import { Component } from 'react';

export class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: '#f1f5f9',
          color: '#0f172a',
          fontFamily: 'system-ui, sans-serif',
        }}>
          <div style={{ maxWidth: 480 }}>
            <h1 style={{ fontSize: '1.25rem', marginBottom: 8 }}>Something went wrong</h1>
            <p style={{ color: '#64748b', marginBottom: 16 }}>{this.state.error?.message || 'Unknown error'}</p>
            <button
              type="button"
              onClick={() => window.location.href = '/'}
              style={{
                padding: '8px 16px',
                background: '#0d9488',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              Reload app
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
