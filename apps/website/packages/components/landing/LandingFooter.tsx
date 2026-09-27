import Link from 'next/link';

const LEGAL_LINK_CLASS =
  'inline-flex min-h-11 items-center transition-colors hover:text-surface';

export default function LandingFooter(): React.ReactElement {
  return (
    <footer className="border-t border-edge/5 py-10">
      <div className="container mx-auto flex flex-col items-center justify-between gap-4 px-6 text-center md:flex-row md:text-left">
        <p className="text-xs font-semibold text-surface/60">
          <span suppressHydrationWarning>
            &copy; {new Date().getFullYear()} GENFEED.AI. ALL RIGHTS RESERVED.
          </span>
        </p>

        {/*
          Readable and tappable: these were 16px-tall uppercase labels at half
          opacity with wide tracking, which is hard to read and to hit.
        */}
        <div className="flex items-center gap-6 text-sm font-medium text-surface/70">
          <Link href="/privacy" className={LEGAL_LINK_CLASS}>
            Privacy
          </Link>
          <Link href="/terms" className={LEGAL_LINK_CLASS}>
            Terms
          </Link>
        </div>
      </div>
    </footer>
  );
}
