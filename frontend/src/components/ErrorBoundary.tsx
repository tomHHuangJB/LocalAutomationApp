import React from "react";

type Props = { children: React.ReactNode };

type State = { hasError: boolean; message?: string };

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error) {
    console.error("[error-boundary]", error);
    window.__ERROR_LOGS?.unshift({ message: error.message, timestamp: new Date().toISOString() });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded border border-ember bg-ember/10 p-4 text-sm" data-testid="error-boundary">
          Error boundary captured: {this.state.message}
        </div>
      );
    }
    return this.props.children;
  }
}
