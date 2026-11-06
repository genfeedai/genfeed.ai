import { ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import type { ReactElement } from 'react';

interface Template {
  id: string;
  platform: string;
  label: string;
  description: string;
}

interface TemplateCardProps {
  template: Template;
  onSelect: () => void;
}

const PLATFORM_LABELS: Record<string, string> = {
  facebook: 'f',
  instagram: 'IG',
  linkedin: 'in',
  reddit: 'R',
  tiktok: 'TT',
  twitter: 'X',
  youtube: 'YT',
};

export function TemplateCard({
  template,
  onSelect,
}: TemplateCardProps): ReactElement {
  const platformLabel = PLATFORM_LABELS[template.platform] ?? '';

  return (
    <Button
      type="button"
      variant={ButtonVariant.UNSTYLED}
      onClick={onSelect}
      className={`flex flex-col items-start border p-3 text-left transition-colors border-border hover:border-border-strong hover:bg-muted/50`}
    >
      <span className="mb-1.5 flex size-6 items-center justify-center rounded bg-muted text-2xs font-bold text-muted-foreground">
        {platformLabel}
      </span>
      <span className="text-xs font-medium text-foreground">
        {template.label}
      </span>
      <span className="mt-0.5 text-2xs text-muted-foreground">
        {template.description}
      </span>
    </Button>
  );
}
