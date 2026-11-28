import type { RelatedLink } from '@data/related-links.data';
import Link from 'next/link';

export interface RelatedLinksProps {
  links: readonly RelatedLink[];
  title?: string;
  className?: string;
}

/**
 * Pages worth visiting next, in the body of the page. The links come from
 * `@data/related-links.data`, which keeps every page reachable from several
 * others without adding to the top bar or the footer.
 */
export default function RelatedLinks({
  className,
  links,
  title = 'Keep exploring',
}: RelatedLinksProps): React.ReactElement | null {
  if (links.length === 0) {
    return null;
  }

  return (
    <nav
      aria-label={title}
      className={`mx-auto w-full max-w-6xl px-6 pb-20 ${className ?? ''}`}
    >
      <h2 className="mb-6 text-2xl font-semibold">{title}</h2>
      <ul className="grid grid-cols-1 gap-px bg-foreground/10 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((link) => (
          <li key={link.href} className="bg-background">
            <Link
              className="block h-full p-5 transition-colors hover:bg-foreground/5"
              href={link.href}
            >
              <span className="block font-semibold">{link.label}</span>
              <span className="mt-1 block text-sm text-foreground/60">
                {link.description}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
