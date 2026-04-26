import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    
    // Auto-fix for "Failed to fetch dynamically imported module"
    // This happens when a new version of the app is published and the browser
    // tries to load an old chunk that no longer exists.
    const isChunkError = error.message.includes('Failed to fetch') || 
                        error.message.includes('dynamically imported module') ||
                        error.message.includes('Loading chunk');

    if (isChunkError) {
      console.log('Chunk load error detected. Attempting automatic reload...');
      const lastReload = sessionStorage.getItem('last_chunk_reload');
      const now = Date.now();
      
      // Prevent infinite reload loops (only reload if we haven't in the last 10 seconds)
      if (!lastReload || now - parseInt(lastReload) > 10000) {
        sessionStorage.setItem('last_chunk_reload', now.toString());
        window.location.reload();
      }
    }
  }

  public render() {
    if (this.state.hasError) {
      let errorMessage = 'An unexpected error occurred.';
      let isFirestoreError = false;

      try {
        const parsed = JSON.parse(this.state.error?.message || '');
        if (parsed.error && parsed.operationType) {
          errorMessage = `Database Error: ${parsed.error}`;
          isFirestoreError = true;
        }
      } catch (e) {
        // Not a JSON error
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 text-center">
            <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <AlertTriangle size={32} />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Something went wrong</h1>
            <p className="text-slate-500 mb-8">{errorMessage}</p>
            
            {isFirestoreError && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 mb-8 text-left">
                <p className="text-xs font-bold text-amber-800 uppercase mb-1">Technical Details</p>
                <p className="text-xs text-amber-700 font-mono break-all">
                  {this.state.error?.message}
                </p>
              </div>
            )}

            <button
              onClick={() => {
                // Instead of a full reload which might loop, we try to reset the error state
                // or redirect to the home page.
                window.location.href = '/';
              }}
              className="w-full bg-blue-600 text-white p-4 rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
            >
              <RefreshCw size={20} />
              Return to Dashboard
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
