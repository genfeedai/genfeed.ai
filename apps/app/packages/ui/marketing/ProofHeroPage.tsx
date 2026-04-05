import type { ComponentType, ReactNode } from 'react';
import type { IconBaseProps } from 'react-icons';

export interface ProofHeroPageProps {
  badge?: string;
  badgeIcon?: ComponentType<IconBaseProps>;
  children: ReactNode;
  description?: ReactNode;
  heroActions?: ReactNode;
  heroProof?: ReactNode;
  heroVisual?: ReactNode;
  title: ReactNode;
}

export default function ProofHeroPage({
  badge,
  badgeIcon: BadgeIcon,
  children,
  description,
  heroActions,
  heroProof,
  heroVisual,
  title,
}: ProofHeroPageProps): React.ReactElement {
  return (
    <>
      <section className="relative overflow-hidden border-b border-[var(--gen-accent-border)] pb-12">
        <div className="container mx-auto px-6">
          <div
            className={[
              'grid min-h-[calc(100vh-8rem)] items-center gap-10 py-8 lg:gap-14',
              heroVisual
                ? 'lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]'
                : 'lg:grid-cols-1',
            ].join(' ')}
          >
            <div className="max-w-2xl">
              {badge ? (
                <div className="inline-flex items-center gap-2 border border-[var(--gen-accent-border)] bg-[var(--gen-accent-bg)] px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-[var(--gen-accent-text)]">
                  {BadgeIcon ? <BadgeIcon className="h-3.5 w-3.5" /> : null}
                  {badge}
                </div>
              ) : null}

              <h1 className="mt-6 text-5xl font-serif leading-[0.9] tracking-[-0.05em] text-foreground sm:text-6xl md:text-7xl lg:text-[5.4rem]">
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

              {heroProof ? <div className="mt-8">{heroProof}</div> : null}
            </div>

            {heroVisual ? (
              <div className="lg:justify-self-end">{heroVisual}</div>
            ) : null}
          </div>
        </div>
      </section>

      <div className="relative">{children}</div>
    </>
  );
}
