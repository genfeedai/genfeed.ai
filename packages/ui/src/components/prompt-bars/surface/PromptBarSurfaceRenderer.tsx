'use client';

import type { PromptBarSurfaceRendererProps } from '@genfeedai/props/prompt-bars/prompt-bar-surface.props';
import PromptBarContainer from '@ui/layout/prompt-bar-container/PromptBarContainer';
import type { ReactNode } from 'react';

export function PromptBarBannerSlot({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return <div className="w-full">{children}</div>;
}

export default function PromptBarSurfaceRenderer({
  children,
  surface,
  topContent,
}: PromptBarSurfaceRendererProps) {
  return (
    <PromptBarContainer
      className={surface.container.className}
      isVisible={surface.container.isVisible}
      layoutMode={surface.container.layoutMode}
      maxWidth={surface.container.maxWidth}
      topContent={
        topContent ? (
          <PromptBarBannerSlot>{topContent}</PromptBarBannerSlot>
        ) : undefined
      }
      zIndex={surface.container.zIndex}
    >
      {children}
    </PromptBarContainer>
  );
}
