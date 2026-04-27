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
      <h1 className="text-[1.75rem] font-semibold leading-none tracking-[-0.045em] text-foreground lg:text-[2.1rem]">
        {title}
      </h1>
      {description ? (
        <DescriptionTag className="mt-2 max-w-3xl text-sm leading-5 text-foreground/54">
          {description}
        </DescriptionTag>
      ) : null}
    </>
  );

  if (!icon) {
    return <div className="mb-1">{titleContent}</div>;
  }

  return (
    <div className="mb-1">
      <div className="flex items-start gap-4">
        <CardIcon icon={icon} className="gen-shell-surface rounded-md p-3" />
        <div className="min-w-0">{titleContent}</div>
      </div>
    </div>
  );
}
