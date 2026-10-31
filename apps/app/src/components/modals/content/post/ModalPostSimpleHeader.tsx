'use client';

import type { ModalPostSimpleHeaderProps } from '@genfeedai/props/modals/modal.props';

export default function ModalPostSimpleHeader({
  title,
  description,
}: ModalPostSimpleHeaderProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">{title}</h2>
      <p className="text-foreground/70 text-sm">{description}</p>
    </div>
  );
}
