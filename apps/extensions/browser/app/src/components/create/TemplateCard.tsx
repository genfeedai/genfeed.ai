import { ButtonVariant } from '@genfeedai/enums';
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

const PLATFORM_COLORS: Record<string, string> = {
  facebook: 'border-blue-600/20 hover:border-blue-600/40',
  instagram: 'border-pink-500/20 hover:border-pink-500/40',
  linkedin: 'border-blue-500/20 hover:border-blue-500/40',
  reddit: 'border-orange-500/20 hover:border-orange-500/40',
  tiktok: 'border-foreground/20 hover:border-foreground/40',
  twitter: 'border-sky-400/20 hover:border-sky-400/40',
  youtube: 'border-red-500/20 hover:border-red-500/40',
};

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
  const borderColor =
    PLATFORM_COLORS[template.platform] ??
    'border-border hover:border-primary/40';
  const platformLabel = PLATFORM_LABELS[template.platform] ?? '';

  return (
    <Button
      type="button"
      variant={ButtonVariant.UNSTYLED}
      onClick={onSelect}
      className={`flex flex-col items-start border p-3 text-left transition-colors hover:bg-secondary/50 ${borderColor}`}
    >
      <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded bg-secondary text-[10px] font-bold text-muted-foreground">
        {platformLabel}
      </span>
      <span className="text-xs font-medium text-foreground">
        {template.label}
      </span>
      <span className="mt-0.5 text-[10px] text-muted-foreground">
        {template.description}
      </span>
    </Button>
  );
}
