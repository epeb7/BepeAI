import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * ErrorBoundary — captura exceções de render em qualquer componente filho
 * e mostra uma tela de recuperação em vez de uma página em branco.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Em produção, isto poderia enviar para um serviço de monitoramento.
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'hsl(220 18% 10%)', color: 'hsl(215 16% 82%)',
        fontFamily: 'inherit', padding: '24px',
      }}>
        <div style={{ textAlign: 'center', maxWidth: '420px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
          <h1 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '10px' }}>
            Algo deu errado
          </h1>
          <p style={{ fontSize: '14px', color: 'hsl(215 10% 54%)', marginBottom: '24px', lineHeight: 1.6 }}>
            Encontramos um erro inesperado. Suas informações estão seguras —
            recarregue a página para continuar.
          </p>
          <button
            onClick={this.handleReload}
            style={{
              padding: '10px 24px', borderRadius: '10px', border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, hsl(250 85% 55%), hsl(215 85% 52%))',
              color: 'white', fontSize: '14px', fontWeight: 500,
              boxShadow: '0 2px 10px hsl(250 85% 50% / 0.30)',
            }}
          >
            Recarregar página
          </button>
        </div>
      </div>
    );
  }
}
