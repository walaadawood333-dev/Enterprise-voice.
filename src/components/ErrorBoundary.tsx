import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode; label?: string };
type State = { error: Error | null };

/**
 * Application-level error boundary. Keeps a render failure inside one region from
 * blanking the page, and offers a plain recovery path instead of a stack trace.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Replace with the real telemetry sink (Sentry, Datadog, …) at launch.
    console.error(`[CenterAI] ${this.props.label ?? "region"} failed to render`, error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        role="alert"
        aria-live="assertive"
        className="mx-auto flex max-w-2xl flex-col items-start gap-5 rounded-3xl border border-hair bg-mist px-6 py-8 text-left sm:px-9"
      >
        <span className="eyebrow text-black/40">Section unavailable</span>
        <h2 className="text-2xl leading-tight font-medium sm:text-3xl">
          This part of the page could not be displayed.
        </h2>
        <p className="text-sm leading-relaxed text-black/55">
          The rest of the site is still usable. If the problem persists, email
          <a href="mailto:hello@centerai.jo" className="ml-1 font-semibold text-ink underline decoration-black/25 underline-offset-4">
            hello@centerai.jo
          </a>
          and we will follow up.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={this.reset}
            className="btn-primary cursor-pointer rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="cursor-pointer rounded-full border border-hair px-5 py-2 text-sm font-semibold transition-colors hover:bg-white"
          >
            Reload page
          </button>
        </div>
        <details className="w-full text-[11px] text-black/40">
          <summary className="cursor-pointer select-none">Technical detail</summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-xl bg-white p-3 font-mono text-[10px]">
            {error.message}
          </pre>
        </details>
      </div>
    );
  }
}
