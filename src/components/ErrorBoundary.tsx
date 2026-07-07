'use client';

import React from 'react';

// Browser extensions (password managers, ad blockers, translators, devtools,
// etc.) inject content scripts into every page and frequently throw unrelated
// errors/rejections that bubble up to window.onerror / unhandledrejection.
// These have nothing to do with app code — don't waste an AI analysis call
// or clutter the admin bug-report dashboard with them.
const NOISE_PATTERNS = [
  /No Listener:/i,
  /Extension context invalidated/i,
  /Could not establish connection\. Receiving end does not exist/i,
  /chrome-extension:\/\//i,
  /moz-extension:\/\//i,
  /safari-extension:\/\//i,
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
];

function isNoise(message: string, stack: string): boolean {
  return NOISE_PATTERNS.some((re) => re.test(message) || re.test(stack));
}

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  reported: boolean;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, reported: false };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private windowErrorHandler: ((event: ErrorEvent) => void) | null = null;
  private unhandledRejectionHandler: ((event: PromiseRejectionEvent) => void) | null = null;

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidMount() {
    this.windowErrorHandler = (event: ErrorEvent) => {
      const stack = event.error?.stack ?? '';
      if (isNoise(event.message, stack)) return;
      this.sendReport(event.message, stack, 'window.onerror');
    };
    this.unhandledRejectionHandler = (event: PromiseRejectionEvent) => {
      const msg = event.reason instanceof Error ? event.reason.message : String(event.reason);
      const stack = event.reason instanceof Error ? (event.reason.stack ?? '') : '';
      if (isNoise(msg, stack)) return;
      this.sendReport(msg, stack, 'unhandledrejection');
    };
    window.addEventListener('error', this.windowErrorHandler);
    window.addEventListener('unhandledrejection', this.unhandledRejectionHandler);
  }

  componentWillUnmount() {
    if (this.windowErrorHandler) window.removeEventListener('error', this.windowErrorHandler);
    if (this.unhandledRejectionHandler) window.removeEventListener('unhandledrejection', this.unhandledRejectionHandler);
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.sendReport(error.message, error.stack ?? '', info.componentStack ?? '');
  }

  private sendReport(errorMessage: string, stackTrace: string, componentStack: string) {
    const lastUserAction = sessionStorage.getItem('scheduleai_last_action') ?? '';
    const eventsSnapshot = sessionStorage.getItem('scheduleai_events_snapshot') ?? '';
    const sessionId = sessionStorage.getItem('scheduleai_session') ?? 'unknown';

    fetch('/api/bug-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        errorMessage,
        stackTrace,
        componentStack,
        lastUserAction,
        eventsSnapshot,
        sessionId,
        timestamp: new Date().toISOString(),
        url: window.location.href,
      }),
    })
      .then(() => this.setState({ reported: true }))
      .catch(console.error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-midnight flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-slate-900 rounded-2xl border border-white/10 p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">Something went wrong</h2>
            <p className="text-sm text-slate-400 mb-6 leading-relaxed">
              {this.state.reported
                ? 'The error has been reported automatically. Our team will look into it.'
                : 'An unexpected error occurred. Sending report…'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-2.5 rounded-xl bg-sky text-white text-sm font-medium hover:bg-sky/90 transition-colors"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
