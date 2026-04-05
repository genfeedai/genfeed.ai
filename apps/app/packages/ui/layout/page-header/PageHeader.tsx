'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { PageHeaderProps } from '@props/layout/page-header.props';
import Button from '@ui/buttons/base/Button';
import ContainerTitle from '@ui/layout/container-title/ContainerTitle';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { HiArrowLeft } from 'react-icons/hi2';

export default function PageHeader({
  backLabel,
  backRoute,
  onBack,
  title,
  description,
  icon,
  actions,
  className,
}: PageHeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (backRoute) {
      router.push(backRoute);
    }
  };

  const hasBackButton = Boolean(backLabel && (backRoute || onBack));
  const hasActions = Boolean(actions);

  return (
    <div
      className={cn(
        'flex items-center justify-between mb-6',
        hasBackButton && !hasActions ? 'justify-start' : '',
        className,
      )}
    >
      <div className="flex items-center gap-4">
        {hasBackButton &&
          (backRoute ? (
            <Link href={backRoute}>
              <Button
                label={backLabel}
                icon={<HiArrowLeft className="h-4 w-4" />}
                variant={ButtonVariant.GHOST}
              />
            </Link>
          ) : (
            <Button
              label={backLabel}
              icon={<HiArrowLeft className="h-4 w-4" />}
              variant={ButtonVariant.GHOST}
              onClick={handleBack}
            />
          ))}

        <div className="flex-1">
          {icon ? (
            <ContainerTitle
              title={title}
              description={description}
              icon={icon}
            />
          ) : (
            <div>
              <h1 className="text-2xl font-semibold">{title}</h1>
              {description && (
                <p className="text-sm text-foreground/70 mt-1">{description}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {hasActions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
