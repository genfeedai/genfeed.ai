import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { StudioPresetCardProps } from '@genfeedai/props/studio/studio-presets.props';
import Card from '@ui/card/Card';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import type { ReactElement } from 'react';

/** One preset: icon, title, description, illustration, chips and one action. */
export default function StudioPresetCard({
  actionAriaLabel,
  actionLabel,
  chips,
  description,
  href,
  icon: Icon,
  illustration,
  isDisabled = false,
  isLoading = false,
  layout = 'grid',
  onSelect,
  testId,
  title,
}: StudioPresetCardProps): ReactElement {
  const action = href ? (
    <Button asChild className="w-full" variant={ButtonVariant.DEFAULT}>
      <Link aria-label={actionAriaLabel} href={href}>
        {actionLabel}
      </Link>
    </Button>
  ) : (
    <Button
      ariaLabel={actionAriaLabel}
      className="w-full"
      isDisabled={isDisabled}
      isLoading={isLoading}
      label={actionLabel}
      onClick={onSelect}
      variant={ButtonVariant.DEFAULT}
    />
  );

  return (
    <li
      className={cn('flex', layout === 'row' && 'w-72 shrink-0 snap-start')}
      data-testid={testId}
    >
      <Card
        actions={action}
        bodyClassName="h-full"
        className="flex w-full flex-col"
        description={description}
        icon={<Icon className="size-4" />}
        label={title}
      >
        {illustration}
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <Badge key={chip} variant="secondary">
              {chip}
            </Badge>
          ))}
        </div>
      </Card>
    </li>
  );
}
