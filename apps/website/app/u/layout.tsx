import type { LayoutProps } from '@props/layout/layout.props';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';

/**
 * Public profiles render on the server like the rest of the website. This
 * layout used to mount the app's `ElementsProvider` and `PromptBarProvider`,
 * which brought the app's API service layer, pino and the Sentry SDK into
 * every profile's first load. Their only reader was the masonry tiles'
 * actions hook, and profile tiles have actions disabled: read-only tiles no
 * longer call it (`ProfileMedia.test.tsx` renders them with no providers).
 */
export default function PublicProfileLayout({ children }: LayoutProps) {
  return (
    <ErrorBoundary>
      {/* One landmark: a <main> nested in a <main> is invalid HTML. */}
      <main className="min-h-screen flex flex-col">
        <div className="flex-grow">{children}</div>
      </main>
    </ErrorBoundary>
  );
}
