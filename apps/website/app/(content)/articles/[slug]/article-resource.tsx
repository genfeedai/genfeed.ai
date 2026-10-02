'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { ArticleResourceProps } from '@props/content/public-article.props';
import { Button } from '@ui/primitives/button';
import { useState } from 'react';
import { WEBSITE_ANALYTICS_EVENTS } from '../../../../packages/analytics/analytics-events';
import { captureWebsiteAnalyticsEvent } from '../../../../packages/analytics/posthog-client';
import { copyText } from './copy-text';

export default function ArticleResource({
  slug,
  resource,
}: ArticleResourceProps) {
  const [isCopied, setIsCopied] = useState(false);
  const command = `bunx skills add genfeedai/skills --skill ${resource.skill}`;
  const track = (
    action: 'skill' | 'pro' | 'agent' | 'mcp' | 'copy_install',
  ) => {
    captureWebsiteAnalyticsEvent(WEBSITE_ANALYTICS_EVENTS.ARTICLE_CTA_CLICKED, {
      articleSlug: slug,
      skillSlug: resource.skill,
      action,
    });
  };
  const copyInstall = async () => {
    const copied = await copyText(command);
    setIsCopied(copied);
    if (copied) track('copy_install');
  };

  return (
    <section
      aria-label="Use this workflow"
      className="mt-10 space-y-4 border border-edge/20 bg-fill/10 p-6"
    >
      <h2 className="text-xl font-semibold text-surface">{resource.label}</h2>
      <p className="text-sm text-surface/70">
        Install the free {resource.skill} skill in your coding agent and use
        this workflow with your own brief.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant={ButtonVariant.SECONDARY} withWrapper={false}>
          <a
            href={`https://github.com/genfeedai/skills/tree/master/${resource.skill}`}
            onClick={() => track('skill')}
            rel="noopener noreferrer"
            target="_blank"
          >
            Get the free skill
          </a>
        </Button>
        <Button
          variant={ButtonVariant.SECONDARY}
          onClick={() => void copyInstall()}
        >
          {isCopied ? 'Copied install command' : 'Copy install command'}
        </Button>
      </div>
      <code className="block overflow-x-auto text-xs text-surface/70">
        {command}
      </code>
      <p className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-surface/70">
        <a
          className="underline underline-offset-4"
          href="/skills"
          onClick={() => track('pro')}
        >
          Explore Skills Pro
        </a>
        <a
          className="underline underline-offset-4"
          href="/agent"
          onClick={() => track('agent')}
        >
          Install the Genfeed agent
        </a>
        <a
          className="underline underline-offset-4"
          href="https://mcp.genfeed.ai"
          onClick={() => track('mcp')}
        >
          Connect through MCP
        </a>
      </p>
      <p className="text-xs text-surface/50" role="status">
        {isCopied
          ? 'Run the copied command in your terminal to install this skill.'
          : 'Already connected? Use the skill in your existing agent.'}
      </p>
    </section>
  );
}
