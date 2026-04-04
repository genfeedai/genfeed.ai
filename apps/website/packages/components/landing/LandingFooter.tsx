import Link from 'next/link';

export default function LandingFooter(): React.ReactElement {
  return (
    <footer className="border-t border-edge/5 py-10">
      <div className="container mx-auto flex flex-col items-center justify-between gap-6 px-6 text-center md:flex-row md:text-left">
        <p className="text-xs font-black text-surface/20">
          <span suppressHydrationWarning>
            &copy; {new Date().getFullYear()} GENFEED.AI. ALL RIGHTS RESERVED.
          </span>
        </p>

        <div className="flex items-center gap-8 text-xs font-black uppercase tracking-[0.18em] text-surface/35">
          <Link
            href="/privacy"
            className="transition-colors hover:text-surface"
          >
            Privacy
          </Link>
          <Link href="/terms" className="transition-colors hover:text-surface">
            Terms
          </Link>
        </div>
      </div>
    </footer>
  );
}
