'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Label } from '@ui/primitives/label';
import { Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { BrandVideoRuleListProps } from '@/features/brands/props/brand-video-kit.props';

interface RuleRow {
  key: number;
  text: string;
}

let nextRowKey = 0;

function toRows(texts: readonly string[]): RuleRow[] {
  return texts.map((text) => ({ key: nextRowKey++, text }));
}

function filled(rows: readonly RuleRow[]): string[] {
  return rows.map((row) => row.text).filter((text) => text.trim() !== '');
}

/** A list of one-line rules. Blank rows stay on screen but never reach the revision. */
export default function BrandVideoRuleList({
  label,
  addLabel,
  rules,
  maxRules,
  isDisabled,
  onChange,
}: BrandVideoRuleListProps) {
  const t = useTranslations('pages.brandVideoKit');
  const [rows, setRows] = useState<RuleRow[]>(() => toRows(rules));

  useEffect(() => {
    setRows((current) =>
      JSON.stringify(filled(current)) === JSON.stringify(rules)
        ? current
        : toRows(rules),
    );
  }, [rules]);

  function update(next: RuleRow[]) {
    setRows(next);
    onChange(filled(next));
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      {rows.map((row, index) => (
        <div key={row.key} className="flex items-center gap-2">
          <Input
            aria-label={t('ruleAria', { label, number: index + 1 })}
            value={row.text}
            disabled={isDisabled}
            maxLength={500}
            onChange={(event) =>
              update(
                rows.map((item) =>
                  item.key === row.key
                    ? { ...item, text: event.target.value }
                    : item,
                ),
              )
            }
          />
          <Button
            variant={ButtonVariant.SECONDARY}
            aria-label={t('removeRuleAria', { label, number: index + 1 })}
            withWrapper={false}
            isDisabled={isDisabled}
            onClick={() => update(rows.filter((item) => item.key !== row.key))}
          >
            <X className="size-4" />
          </Button>
        </div>
      ))}
      <div>
        <Button
          variant={ButtonVariant.SECONDARY}
          isDisabled={isDisabled || rows.length >= maxRules}
          onClick={() => update([...rows, ...toRows([''])])}
        >
          <Plus className="mr-1 size-4" />
          {addLabel}
        </Button>
      </div>
    </div>
  );
}
