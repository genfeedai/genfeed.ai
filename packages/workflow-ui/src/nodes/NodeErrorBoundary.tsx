'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Component, type ReactNode } from 'react';
import { Button } from '../ui/button';

interface NodeErrorBoundaryProps {
  children: ReactNode;
  nodeId: string;
  nodeType: string;
}

interface NodeErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary specifically for workflow nodes.
 * Catches rendering errors and displays a fallback UI instead of crashing the entire canvas.
 */
export class NodeErrorBoundary extends Component<
  NodeErrorBoundaryProps,
  NodeErrorBoundaryState
> {
  constructor(props: NodeErrorBoundaryProps) {
    super(props);
    this.state = { error: null, hasError: false };
  }

  static getDerivedStateFromError(error: Error): NodeErrorBoundaryState {
    return { error, hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log error for debugging - in production this would go to error tracking
    console.error(
      `Node ${this.props.nodeId} (${this.props.nodeType}) crashed:`,
      error,
      errorInfo,
    );
  }

  handleRetry = (): void => {
    this.setState({ error: null, hasError: false });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 p-4 text-center min-h-[100px]">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-destructive">Node Error</p>
            <p className="text-xs text-muted-foreground max-w-[200px] truncate">
              {this.state.error?.message ?? 'An unexpected error occurred'}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={this.handleRetry}
            className="gap-1.5"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
