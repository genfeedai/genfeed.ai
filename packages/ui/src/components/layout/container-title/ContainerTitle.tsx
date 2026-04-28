'use client';

import type { ContainerTitleProps } from '@genfeedai/props/layout/container-title.props';
import CardIcon from '@ui/card/icon/CardIcon';

export default function ContainerTitle({
  title,
  description,
  icon,
}: ContainerTitleProps) {
  const isTextDescription =
    typeof description === 'number' || typeof description === 'string';
  const DescriptionTag = isTextDescription ? 'p' : 'div';

  const titleContent = (
    <>
      <h1 className="text-base font-semibold tracking-[-0.01em] text-foreground">
        {title}
      </h1>
      {description ? (
        <DescriptionTag className="mt-1 max-w-3xl text-xs leading-snug text-foreground/55">
          {description}
        </DescriptionTag>
      ) : null}
    </>
  );

  if (!icon) {
    return <div>{titleContent}</div>;
  }

  return (
    <div className="flex items-center gap-2">
      <CardIcon
        icon={icon}
        className="text-foreground/60"
        iconClassName="w-3.5 h-3.5"
      />
      <div className="min-w-0">{titleContent}</div>
    </div>
  );
}
