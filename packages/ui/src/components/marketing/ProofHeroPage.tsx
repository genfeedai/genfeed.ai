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
              <h1 className="text-5xl font-semibold leading-[0.95] tracking-[-0.03em] text-foreground sm:text-6xl md:text-7xl lg:text-[5.2rem]">
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
