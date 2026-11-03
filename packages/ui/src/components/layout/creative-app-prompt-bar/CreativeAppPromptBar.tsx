'use client';

import type { CreativeAppPromptBarProps } from '@genfeedai/props/ui/layout/creative-app-layout.props';
import PromptBarContainer from '@ui/layout/prompt-bar-container/PromptBarContainer';
import PromptBarComposer from '@ui/prompt-bars/components/shell/PromptBarComposer';
import type { ReactElement } from 'react';

/**
 * The prompt bar every creative app (Turbo, Clipper, Motion, Editor,
 * Storyboard) starts a project from, at the width its pane gives it: one container, one composer surface, one
 * density. An app supplies the editor and a `PromptBarToolbar` made of the
 * shared chip, icon-button and send controls, and puts errors in `banner`
 * through `PromptBarNotice`. It never builds its own shell.
 */
export default function CreativeAppPromptBar({
  ariaLabel,
  banner,
  beforeBody,
  children,
  testId,
}: CreativeAppPromptBarProps): ReactElement {
  return (
    <PromptBarContainer
      className="w-full"
      layoutMode="inflow"
      maxWidth="full"
      zIndex={60}
    >
      <PromptBarComposer
        aria-label={ariaLabel}
        banner={banner}
        beforeBody={beforeBody}
        data-testid={testId}
        density="compact"
        role={ariaLabel ? 'group' : undefined}
      >
        {children}
      </PromptBarComposer>
    </PromptBarContainer>
  );
}
