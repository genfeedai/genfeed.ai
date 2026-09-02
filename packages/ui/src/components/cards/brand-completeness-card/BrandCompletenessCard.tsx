'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { BrandCompletenessGroup } from '@genfeedai/helpers';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import { useBrandCompleteness } from '@genfeedai/hooks/utils/use-brand-completeness/use-brand-completeness';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

interface BrandCompletenessCardProps {
  brand: {
    id?: string;
    label?: string;
    description?: string;
    text?: string;
    logo?: unknown;
    primaryColor?: string;
    references?: unknown[];
    agentConfig?: {
      voice?: {
        tone?: string;
        style?: string;
        audience?: string[];
        values?: string[];
        sampleOutput?: string;
        messagingPillars?: string[];
        doNotSoundLike?: string[];
      };
      strategy?: {
        contentTypes?: string[];
        platforms?: string[];
        goals?: string[];
        frequency?: string;
      };
      persona?: string;
    };
  };
}

function GroupRow({
  group,
  href,
}: {
  group: BrandCompletenessGroup;
  href: (path: string) => string;
}) {
  const [isExpanded, setExpanded] = useState(false);
  const incompleteFields = group.fields.filter((f) => !f.isComplete);
  const isComplete = group.score === 100;

  return (
    <div>
      <Button
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
        onClick={() => setExpanded(!isExpanded)}
        className="flex w-full items-center gap-2.5 px-2 py-1.5 text-left transition-colors duration-150 hover:bg-foreground/[0.04]"
      >
        {isComplete ? (
          <Check className="size-3.5 text-green-400/60 flex-shrink-0" />
        ) : (
          <ChevronDown
            className={cn(
              'size-3.5 flex-shrink-0 text-foreground/20 transition-transform duration-200',
              !isExpanded && '-rotate-90',
            )}
          />
        )}
        <span
          className={cn(
            'flex-1 text-xs',
            isComplete
              ? 'text-foreground/30 line-through'
              : 'text-foreground/60',
          )}
        >
          {group.label}
        </span>
        <div className="flex items-center gap-2">
          <div className="h-1 w-10 overflow-hidden rounded-full bg-foreground/[0.06]">
            <div
              className="h-full rounded-full bg-foreground transition-all duration-500 ease-out"
              style={{ width: `${group.score}%` }}
            />
          </div>
          <span className="w-7 text-right text-2xs font-medium text-foreground/30">
            {group.score}%
          </span>
        </div>
      </Button>

      {isExpanded && incompleteFields.length > 0 && (
        <div className="ml-6 flex flex-col gap-0.5 pb-1">
          {incompleteFields.map((field) => (
            <Link
              key={field.key}
              href={href(field.href)}
              className="flex items-center gap-2 rounded px-2 py-1 text-2xs text-foreground/45 transition-colors duration-150 hover:bg-foreground/[0.04] hover:text-foreground/70"
            >
              <ChevronRight className="size-3 flex-shrink-0 text-foreground/15" />
              {field.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BrandCompletenessCard({
  brand,
}: BrandCompletenessCardProps) {
  const result = useBrandCompleteness(brand);
  const { href } = useOrgUrl();

  if (!result || result.overallScore === 100) {
    return null;
  }

  return (
    <Card
      bodyClassName="gap-0 p-3 sm:p-3"
      data-testid="brand-completeness-card"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-2xs font-semibold text-foreground/60">
          Brand context
        </span>
        <span className="text-2xs font-medium text-foreground/30">
          {result.overallScore}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-3 h-1 overflow-hidden rounded-full bg-foreground/[0.06]">
        <div
          className="h-full rounded-full bg-foreground transition-all duration-500 ease-out"
          style={{ width: `${result.overallScore}%` }}
        />
      </div>

      {/* Groups */}
      <div className="flex flex-col gap-0.5">
        {result.groups.map((group) => (
          <GroupRow key={group.key} group={group} href={href} />
        ))}
      </div>

      {/* Hint */}
      <p className="mt-3 text-2xs leading-relaxed text-foreground/30">
        Filling in brand context improves AI content quality.
      </p>

      {/* Interview me shortcut — only shown when there are interviewable gaps */}
      {result.groups.some(
        (g) => g.key !== 'visual' && g.fields.some((f) => !f.isComplete),
      ) && (
        <div className="mt-2 border-t border-border pt-2">
          <Button variant={ButtonVariant.UNSTYLED} withWrapper={false}>
            <Link
              href={href('/settings/interview')}
              className="text-2xs text-primary/70 hover:text-primary transition-colors duration-150"
            >
              Interview me to fill gaps →
            </Link>
          </Button>
        </div>
      )}
    </Card>
  );
}
