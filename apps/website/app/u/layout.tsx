import type { LayoutProps } from '@props/layout/layout.props';

/**
 * Public profiles are server-rendered marketing pages like the rest of the
 * website. The layout used to mount the app's `ElementsProvider` and
 * `PromptBarProvider`, which nothing on the profile reads, and they pulled the
 * app's API service layer, pino and the Sentry SDK into every profile's
 * first-load JavaScript.
 */
export default function PublicProfileLayout({ children }: LayoutProps) {
  return (
    // One landmark: a <main> nested in a <main> is invalid HTML.
    <main className="min-h-screen flex flex-col">
      <div className="flex-grow">{children}</div>
    </main>
  );
}
