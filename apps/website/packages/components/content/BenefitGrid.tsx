import type { ElementType } from 'react';

export interface BenefitItem {
  icon: ElementType;
  title: string;
  description: string;
}

export interface BenefitGridProps {
  benefits: BenefitItem[];
  className?: string;
}

/** Grid of icon + title + description benefit cards with Neural Noir styling */
export default function BenefitGrid({ benefits, className }: BenefitGridProps) {
  return (
    <div
      className={`grid grid-cols-1 md:grid-cols-3 gap-px bg-fill/5 border border-edge/5 overflow-hidden ${className ?? ''}`}
    >
      {benefits.map((benefit) => {
        const Icon = benefit.icon;
        return (
          <div
            key={benefit.title}
            className="p-10 text-center group bg-zinc-900 hover:bg-fill/[0.02] transition-colors"
          >
            <Icon className="h-8 w-8 mx-auto mb-4 text-surface/40 group-hover:text-surface transition-all" />
            <h3 className="text-lg font-bold mb-2">{benefit.title}</h3>
            <p className="text-surface/40 text-sm">{benefit.description}</p>
          </div>
        );
      })}
    </div>
  );
}
