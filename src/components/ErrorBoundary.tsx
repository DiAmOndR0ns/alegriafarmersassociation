import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleClearAndReload = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-3xl p-6 sm:p-8 border-2 border-[#E9E4D9] shadow-xl text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-100 flex items-center justify-center text-amber-700">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-black text-[#1B4332] uppercase tracking-wide">
              Adunay Gamay nga Problema (Application Error)
            </h2>
            <p className="text-xs text-[#5D6B54] leading-relaxed">
              Adunay wala damha nga error sa browser. Palihug i-refresh ang panid o i-reload ang sistema.
            </p>
            {this.state.error?.message && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-left">
                <p className="text-[11px] font-mono text-red-800 break-words font-semibold">
                  {this.state.error.message}
                </p>
              </div>
            )}
            <div className="pt-2 flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 py-3 bg-[#1B4332] hover:bg-[#143326] text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer shadow-md transition-all"
              >
                <RefreshCw className="w-4 h-4" />
                <span>I-refresh (Reload Page)</span>
              </button>
              <button
                type="button"
                onClick={this.handleClearAndReload}
                className="py-3 px-4 bg-[#FAF8F5] border border-[#D5CFC1] hover:bg-[#F0EBE1] text-[#1B4332] rounded-xl text-xs font-bold cursor-pointer transition-all"
              >
                Reset Cache
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

