'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type { BrandCompletenessGroup } from '@genfeedai/helpers';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useBrandCompleteness } from '@hooks/utils/use-brand-completeness/use-brand-completeness';
import Button from '@ui/buttons/base/Button';
import Card from '@ui/card/Card';
import Link from 'next/link';
import { useState } from 'react';
import { HiCheck, HiChevronDown, HiChevronRight } from 'react-icons/hi2';

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

function GroupRow({ group }: { group: BrandCompletenessGroup }) {
  const [isExpanded, setExpanded] = useState(false);
  const incompleteFields = group.fields.filter((f) => !f.isComplete);
  const isComplete = group.score === 100;

  return (
    <div>
      <Button
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
        onClick={() => setExpanded(!isExpanded)}
        className="flex w-full items-center gap-2.5 px-2 py-1.5 rounded-lg text-left transition-colors duration-150 hover:bg-white/[0.04]"
      >
        {isComplete ? (
          <HiCheck className="w-3.5 h-3.5 text-green-400/60 flex-shrink-0" />
        ) : (
          <HiChevronDown
            className={cn(
              'w-3.5 h-3.5 text-white/20 flex-shrink-0 transition-transform duration-200',
              !isExpanded && '-rotate-90',
            )}
          />
        )}
        <span
          className={cn(
            'flex-1 text-[12px]',
            isComplete ? 'text-white/30 line-through' : 'text-white/60',
          )}
        >
          {group.label}
        </span>
        <div className="flex items-center gap-2">
          <div className="h-1 w-10 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
              style={{ width: `${group.score}%` }}
            />
          </div>
          <span className="text-[10px] font-medium text-white/30 w-7 text-right">
            {group.score}%
          </span>
        </div>
      </Button>

      {isExpanded && incompleteFields.length > 0 && (
        <div className="ml-6 flex flex-col gap-0.5 pb-1">
          {incompleteFields.map((field) => (
            <Link
              key={field.key}
              href={field.href}
              className="flex items-center gap-2 px-2 py-1 rounded text-[11px] text-white/45 transition-colors duration-150 hover:text-white/70 hover:bg-white/[0.04]"
            >
              <HiChevronRight className="w-3 h-3 text-white/15 flex-shrink-0" />
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

  if (!result || result.overallScore === 100) {
    return null;
  }

  return (
    <Card
      className="rounded-xl shadow-none"
      bodyClassName="gap-0 p-3 sm:p-3"
      data-testid="brand-completeness-card"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold text-white/60">
          Brand context
        </span>
        <span className="text-[10px] font-medium text-white/30">
          {result.overallScore}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 rounded-full bg-white/[0.06] mb-3 overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${result.overallScore}%` }}
        />
      </div>

      {/* Groups */}
      <div className="flex flex-col gap-0.5">
        {result.groups.map((group) => (
          <GroupRow key={group.key} group={group} />
        ))}
      </div>

      {/* Hint */}
      <p className="mt-3 text-[10px] text-white/25 leading-relaxed">
        Filling in brand context improves AI content quality.
      </p>
    </Card>
  );
}
