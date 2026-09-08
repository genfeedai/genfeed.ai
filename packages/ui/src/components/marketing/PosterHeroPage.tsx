import type { ComponentType, ReactNode, SVGProps } from 'react';

export interface PosterHeroPageProps {
  badge?: string;
  badgeIcon?: ComponentType<SVGProps<SVGSVGElement>>;
  children: ReactNode;
  compact?: boolean;
  description?: ReactNode;
  heroActions?: ReactNode;
  heroDetails?: ReactNode;
  heroVisual?: ReactNode;
  title: ReactNode;
}

export default function PosterHeroPage({
  children,
  compact = false,
  description,
  heroActions,
  heroDetails,
  heroVisual,
  title,
}: PosterHeroPageProps): React.ReactElement {
  return (
    <>
      {/*
        Three paddings used to stack here — the section's, the grid's, and the
        body's — for around 180px of nothing between a page's title and the
        first thing it has to say. On a pricing page that was most of the reason
        a visitor had to scroll before seeing a price. The hero still breathes;
        it just stops charging twice for the same air.
      */}
      {/*
        No rule under the hero. It sat a long way above the first section, so it
        read as a stray line drawn across the page rather than a boundary
        between two things. Space separates them, which is what the gap above
        was already doing on its own.
      */}
      <section className="relative overflow-hidden pb-8">
        <div className="container mx-auto px-6">
          <div
            className={[
              compact
                ? 'grid items-start gap-10 pt-16 pb-2 lg:gap-14'
                : 'grid items-start gap-10 pt-16 pb-4 lg:gap-14 lg:pt-20',
              heroVisual
                ? 'lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]'
                : 'lg:grid-cols-1',
            ].join(' ')}
          >
            <div className="max-w-2xl">
              <h1
                className={
                  compact
                    ? 'text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-foreground sm:text-5xl'
                    : 'text-4xl font-semibold leading-[1.0] tracking-[-0.03em] text-foreground sm:text-5xl md:text-6xl lg:text-[3.5rem]'
                }
              >
                {title}
              </h1>

              {description ? (
                <p className="mt-6 max-w-xl text-base leading-relaxed text-[var(--gen-accent-text)] sm:text-lg">
                  {description}
                </p>
              ) : null}

              {heroActions ? (
                <div className="mt-8 flex flex-wrap gap-3">{heroActions}</div>
              ) : null}

              {heroDetails ? <div className="mt-8">{heroDetails}</div> : null}
            </div>

            {heroVisual ? (
              <div className="lg:justify-self-end">{heroVisual}</div>
            ) : null}
          </div>
        </div>
      </section>

      <div className="relative pt-10 sm:pt-14">{children}</div>
    </>
  );
}
