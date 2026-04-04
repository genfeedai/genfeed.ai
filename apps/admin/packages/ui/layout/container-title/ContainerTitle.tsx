'use client';

import type { ContainerTitleProps } from '@props/layout/container-title.props';
import CardIcon from '@ui/card/icon/CardIcon';

export default function ContainerTitle({
  title,
  description,
  icon,
}: ContainerTitleProps) {
  const titleContent = (
    <>
      <h1 className="text-3xl font-serif-italic">{title}</h1>
      {description && <div className="text-foreground">{description}</div>}
    </>
  );

  if (!icon) {
    return <div className="mb-2">{titleContent}</div>;
  }

  return (
    <div className="mb-2">
      <div className="flex items-center gap-4 mb-2">
        <CardIcon icon={icon} className="p-3 bg-white/5" />
        <div>{titleContent}</div>
      </div>
    </div>
  );
}
