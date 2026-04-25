import React from 'react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

export class ErrorBoundary extends React.Component<any, any> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('Uncaught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = 'The application encountered an unexpected error.';
      let errorDetail = this.state.error?.message || 'Unknown error';
      let isPermissionError = false;

      try {
        const parsed = JSON.parse(errorDetail);
        if (parsed.error && parsed.error.includes('insufficient permissions')) {
          errorMessage = 'Permission Denied';
          errorDetail = `You do not have permission to perform this ${parsed.operationType} operation on ${parsed.path}.`;
          isPermissionError = true;
        }
      } catch (e) {
        // Not a JSON error
      }

      return (
        <div className={cn(
          "p-8 text-center space-y-4 rounded-[2rem] border-2 m-4",
          isPermissionError ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200"
        )}>
          <h2 className={cn(
            "text-3xl font-black tracking-tighter",
            isPermissionError ? "text-amber-600" : "text-red-600"
          )}>{errorMessage}</h2>
          <p className="text-gray-600 font-medium">{isPermissionError ? 'This might be due to your role or organization membership.' : 'The application encountered an unexpected error.'}</p>
          
          <div className="text-left bg-white p-6 rounded-2xl border border-gray-100 shadow-sm overflow-auto max-h-64">
            <pre className="text-xs text-gray-800 font-mono whitespace-pre-wrap">
              {errorDetail}
            </pre>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Button 
              onClick={() => window.location.reload()}
              className={cn(
                "rounded-xl font-black px-8 py-6",
                isPermissionError ? "bg-amber-600 hover:bg-amber-700" : "bg-red-600 hover:bg-red-700"
              )}
            >
              Refresh Page
            </Button>
            {isPermissionError && (
              <Button 
                variant="outline"
                onClick={() => window.location.href = '/organisation'}
                className="rounded-xl font-black px-8 py-6 border-2"
              >
                Switch Organisation
              </Button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
