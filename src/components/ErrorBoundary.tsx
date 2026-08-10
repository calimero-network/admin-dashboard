import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react';
import './ErrorBoundary.css';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  componentName?: string;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  minimal?: boolean;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  override componentDidMount(): void {
    // Test hook: allows e2e tests to trigger error state without a real render crash.
    // Only registered once — first boundary to mount (root) wins.
    if (
      typeof window !== 'undefined' &&
      !(window as any).__triggerErrorBoundary
    ) {
      (window as any).__triggerErrorBoundary = (msg: string) => {
        const error = new Error(msg);
        const errorInfo = { componentStack: '' } as ErrorInfo;
        this.logError(error, errorInfo);
        this.setState({ hasError: true, error, errorInfo });
      };
    }
  }

  override componentWillUnmount(): void {
    if (
      typeof window !== 'undefined' &&
      (window as any).__triggerErrorBoundary
    ) {
      delete (window as any).__triggerErrorBoundary;
    }
  }

  private logError(error: Error, errorInfo: ErrorInfo): void {
    const componentName = this.props.componentName || 'Unknown Component';
    console.error(`[ErrorBoundary] Error in ${componentName}:`, error);
    console.error(`[ErrorBoundary] Component stack:`, errorInfo.componentStack);

    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    try {
      const stored = JSON.parse(
        localStorage.getItem('calimero-error-log') || '[]',
      );
      stored.push({
        timestamp: new Date().toISOString(),
        componentName: this.props.componentName || 'Unknown',
        error: { name: error.name, message: error.message, stack: error.stack },
        componentStack: errorInfo.componentStack,
      });
      if (stored.length > 10) stored.splice(0, stored.length - 10);
      localStorage.setItem('calimero-error-log', JSON.stringify(stored));
    } catch {
      // ignore
    }
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    this.logError(error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.props.onReset?.();
  };

  handleCopyError = async (): Promise<void> => {
    const { error, errorInfo } = this.state;
    const text = [
      `Error: ${error?.name}`,
      `Message: ${error?.message}`,
      `Component: ${this.props.componentName || 'Unknown'}`,
      `Stack: ${error?.stack}`,
      `Component Stack: ${errorInfo?.componentStack}`,
      `Time: ${new Date().toISOString()}`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  };

  override render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    if (this.props.minimal) {
      return (
        <div className="error-boundary error-boundary-minimal">
          <AlertTriangle size={16} />
          <span>Something went wrong</span>
          <button
            onClick={this.handleReset}
            className="error-boundary-retry-small"
            title="Try again"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      );
    }

    return (
      <div
        className="error-boundary error-boundary-full"
        data-testid="error-boundary"
      >
        <div className="error-boundary-content">
          <div className="error-boundary-icon">
            <AlertTriangle size={48} />
          </div>
          <h2 className="error-boundary-title">Something went wrong</h2>
          <p
            className="error-boundary-message"
            data-testid="error-boundary-message"
          >
            {this.props.componentName
              ? `An error occurred in ${this.props.componentName}.`
              : 'An unexpected error occurred.'}
          </p>
          {this.state.error && (
            <div
              className="error-boundary-details"
              data-testid="error-boundary-details"
            >
              <code>{this.state.error.message}</code>
            </div>
          )}
          <div className="error-boundary-actions">
            <button
              onClick={this.handleReset}
              className="button button-primary"
              data-testid="error-boundary-retry"
            >
              <RefreshCw size={16} />
              Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="button button-secondary"
              data-testid="error-boundary-reload"
            >
              <Home size={16} />
              Reload App
            </button>
            <button
              onClick={this.handleCopyError}
              className="button button-secondary"
              data-testid="error-boundary-copy"
              title="Copy error details"
            >
              <Bug size={16} />
              Copy Error
            </button>
          </div>
          <p className="error-boundary-hint">
            If this problem persists, try restarting the application.
          </p>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
