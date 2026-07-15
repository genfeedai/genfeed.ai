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
      className={`grid grid-cols-1 gap-px bg-edge/5 md:grid-cols-3 ${className ?? ''}`}
    >
      {benefits.map((benefit) => {
        const Icon = benefit.icon;
        return (
          <div
            key={benefit.title}
            className="group bg-background p-10 text-center transition-colors hover:bg-fill/[0.02]"
          >
            <Icon className="size-8 mx-auto mb-4 text-surface/65 group-hover:text-surface transition-all" />
            <h3 className="text-lg font-semibold mb-2">{benefit.title}</h3>
            <p className="text-surface/65 text-sm">{benefit.description}</p>
          </div>
        );
      })}
    </div>
  );
}
