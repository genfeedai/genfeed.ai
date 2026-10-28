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
      className={`grid grid-cols-1 gap-px bg-foreground/5 md:grid-cols-3 ${className ?? ''}`}
    >
      {benefits.map((benefit) => {
        const Icon = benefit.icon;
        return (
          <div
            key={benefit.title}
            className="group bg-background p-6 sm:p-10 text-center transition-colors hover:bg-foreground/[0.02]"
          >
            <Icon className="size-8 mx-auto mb-4 text-foreground/65 group-hover:text-foreground transition-all" />
            <h3 className="text-lg font-semibold mb-2">{benefit.title}</h3>
            <p className="text-foreground/65 text-sm">{benefit.description}</p>
          </div>
        );
      })}
    </div>
  );
}
