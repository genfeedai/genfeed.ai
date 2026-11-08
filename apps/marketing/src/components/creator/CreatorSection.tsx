import type { CreatorSectionProps } from '@props/content/creator.props';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

/** One kind of content on the profile, with a link to its full tab. */
export default function CreatorSection({
  children,
  href,
  title,
  total,
}: CreatorSectionProps): React.ReactElement | null {
  if (total === 0) {
    return null;
  }

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold text-foreground">
          {title}{' '}
          <span className="text-sm font-normal text-foreground/50">
            {total}
          </span>
        </h2>
        {href ? (
          <Link
            className="inline-flex items-center gap-1 text-sm text-foreground/60 hover:text-foreground"
            href={href}
          >
            See all
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}
