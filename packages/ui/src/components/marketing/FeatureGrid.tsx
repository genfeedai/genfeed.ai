'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { ComponentType, SVGProps } from 'react';

export interface FeatureGridItem {
  number: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  description: string;
  href?: string;
}

export interface FeatureGridProps {
  features: FeatureGridItem[];
  columns?: 2 | 3 | 4;
}

const GRID_COLUMNS = {
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-2 lg:grid-cols-3',
  4: 'md:grid-cols-2 lg:grid-cols-4',
} as const;

export default function FeatureGrid({
  features,
  columns = 4,
}: FeatureGridProps) {
  return (
    <section className="py-32">
      <div className="container mx-auto px-6">
        <div
          className={`grid grid-cols-1 ${GRID_COLUMNS[columns]} overflow-hidden border border-edge/5 bg-fill/5 gap-px`}
        >
          {features.map((feature) => {
            const Icon = feature.icon;
            const content = (
              <>
                <div className="mb-12 text-xs font-semibold uppercase tracking-widest text-surface/55">
                  {feature.number} / {feature.label}
                </div>
                <Icon className="mb-8 size-10 text-surface/55 transition-colors group-hover:text-surface" />
                <h3 className="mb-4 text-xl font-semibold uppercase tracking-tight">
                  {feature.title}
                </h3>
                <p className="mb-8 text-sm leading-relaxed text-surface/55">
                  {feature.description}
                </p>
                {feature.href ? (
                  <span className="mt-auto flex items-center gap-2 text-2xs font-semibold uppercase tracking-widest transition-[gap] hover:gap-4">
                    View Spec <ArrowRight className="size-3" />
                  </span>
                ) : null}
              </>
            );

            if (feature.href) {
              return (
                <Link
                  key={feature.number}
                  href={feature.href}
                  className="group flex flex-col bg-background p-12 transition-colors hover:bg-fill/[0.02]"
                >
                  {content}
                </Link>
              );
            }

            return (
              <div
                key={feature.number}
                className="group flex flex-col bg-background p-12 transition-colors hover:bg-fill/[0.02]"
              >
                {content}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
