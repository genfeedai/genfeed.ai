import type { ReactElement } from 'react';
import type { IconType } from 'react-icons';

type GenerationActionCardHeaderProps = {
  Icon: IconType;
  title: string;
};

export function GenerationActionCardHeader({
  Icon,
  title,
}: GenerationActionCardHeaderProps): ReactElement {
  return (
    <div className="flex items-center gap-2 border-b border-border px-3 py-2">
      <Icon className="size-4 text-primary" />
      <span className="text-sm font-medium text-foreground">{title}</span>
    </div>
  );
}
