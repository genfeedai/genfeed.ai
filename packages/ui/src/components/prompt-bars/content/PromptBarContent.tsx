'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { PromptBarContentProps } from '@genfeedai/props/prompt-bars/prompt-bar-content.props';
import PromptBarShell from '@ui/prompt-bars/components/shell/PromptBarShell';
import PromptBarContentCollapsedView from '@ui/prompt-bars/content/PromptBarContentCollapsedView';
import PromptBarContentExpandedView from '@ui/prompt-bars/content/PromptBarContentExpandedView';
import { usePromptBarContent } from '@ui/prompt-bars/content/use-prompt-bar-content';
import { memo } from 'react';

/**
 * The one content prompt bar. Every surface that turns a written instruction
 * into generated or enhanced content renders this — posts, articles, and any
 * future content type. Capabilities (count, thread, platform, presets) are
 * opt-in props rather than separate components.
 */
function PromptBarContent(props: PromptBarContentProps) {
  const controller = usePromptBarContent(props);

  return (
    <PromptBarShell
      className={cn(
        'flex flex-col p-2 transition-all duration-300',
        controller.isCollapsed ? 'overflow-hidden' : 'overflow-visible',
      )}
    >
      {controller.isCollapsed ? (
        <PromptBarContentCollapsedView
          {...controller}
          onCountChange={controller.setCount}
          onExpand={() => controller.setIsCollapsed(false)}
          onKeyDown={controller.handleKeyDown}
          onPresetChange={controller.handlePresetChange}
          onPromptChange={controller.setPrompt}
          onSubmit={controller.handleSubmit}
          onThreadChange={controller.setIsThread}
        />
      ) : (
        <PromptBarContentExpandedView
          {...controller}
          onCollapse={() => controller.setIsCollapsed(true)}
          onCountChange={controller.setCount}
          onKeyDown={controller.handleKeyDown}
          onPresetChange={controller.handlePresetChange}
          onPromptChange={controller.setPrompt}
          onSubmit={controller.handleSubmit}
          onThreadChange={controller.setIsThread}
        />
      )}
    </PromptBarShell>
  );
}

export default memo(PromptBarContent);
