import type { ReactNode } from 'react';

interface ContentRulesSectionProps {
  children: ReactNode;
  title: string;
}

/** A plain titled block; the five rule groups stack on one page, not in tabs. */
export default function ContentRulesSection({
  children,
  title,
}: ContentRulesSectionProps) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-medium">{title}</h2>
      {children}
    </section>
  );
}
