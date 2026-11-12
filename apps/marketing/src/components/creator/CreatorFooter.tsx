import Link from 'next/link';

const FOOTER_LINKS = [
  { href: '/pricing', label: 'Pricing' },
  { href: 'https://docs.genfeed.ai', label: 'Docs' },
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
] as const;

/**
 * One line under a creator's page. It keeps the page from being a crawl dead
 * end without carrying the whole site's footer.
 */
export default function CreatorFooter(): React.ReactElement {
  return (
    <footer className="relative z-20 mt-auto border-t border-foreground/10">
      <nav
        aria-label="Genfeed"
        className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-5 text-xs text-foreground/50 lg:px-6"
      >
        <span>Made with Genfeed</span>
        {FOOTER_LINKS.map((link) => (
          <Link
            className="transition-colors hover:text-foreground"
            href={link.href}
            key={link.href}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}
