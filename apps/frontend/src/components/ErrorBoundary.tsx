import { Component, type ReactNode, type ErrorInfo } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Custom fallback UI. When omitted, the default fallback is rendered. */
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary catches any render-phase exceptions thrown by its children and
 * displays a friendly fallback UI instead of unmounting the entire React tree.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <SomeComponent />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
    this.handleReload = this.handleReload.bind(this);
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Log to console in all environments so it surfaces in Sentry / CloudWatch logs.
    console.error('[ErrorBoundary] Uncaught render error:', error, info.componentStack);
  }

  handleReload(): void {
    // Try to recover by resetting state first; if the error is persistent the
    // full-page reload below acts as a last-resort safety net.
    this.setState({ hasError: false, error: null }, () => {
      // If the same error immediately re-throws, a page reload avoids a blank screen.
      if (this.state.hasError) {
        window.location.reload();
      }
    });
  }

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    // Custom fallback takes priority
    if (this.props.fallback) {
      return this.props.fallback;
    }

    return (
      <div
        role="alert"
        aria-live="assertive"
        data-testid="error-boundary-fallback"
        className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-100 p-6 text-center dark:bg-slate-950"
      >
        <span className="text-5xl" aria-hidden="true">
          ⚠️
        </span>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Something went wrong
        </h1>
        <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">
          An unexpected error occurred. Please reload the page. If the problem persists, contact
          support.
        </p>
        {this.state.error && (
          <details className="max-w-sm rounded-lg border border-slate-200 bg-white p-3 text-left text-xs font-mono text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
            <summary className="cursor-pointer font-sans text-sm font-medium text-slate-700 dark:text-slate-300">
              Error details
            </summary>
            <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all">
              {this.state.error.message}
            </pre>
          </details>
        )}
        <button
          type="button"
          onClick={this.handleReload}
          data-testid="error-boundary-reload-btn"
          className="rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:bg-violet-500 dark:hover:bg-violet-600"
          aria-label="Reload the page"
        >
          Reload
        </button>
      </div>
    );
  }
}

export default ErrorBoundary;
