import { Badge } from '@ui/primitives/badge';
import { CircleCheck, Key } from 'lucide-react';
import type { ProvidersRowItemProps } from '@/features/onboarding/props/providers-row-item.props';

export default function ProvidersRowItem({
  description,
  enabledLabel,
  disabledLabel,
  enabled,
  label,
}: ProvidersRowItemProps) {
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3 first:border-t-0 first:pt-0 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-foreground">{label}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <Badge
        casing="normal"
        className="w-fit"
        icon={enabled ? <CircleCheck /> : <Key />}
        shape="pill"
        size="lg"
        variant={enabled ? 'success' : 'secondary'}
      >
        {enabled ? enabledLabel : disabledLabel}
      </Badge>
    </div>
  );
}
