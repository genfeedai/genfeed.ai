'use client';

import type { IPrompt } from '@genfeedai/contracts/interfaces';
import type { IngredientTabsPromptsProps } from '@genfeedai/props/content/ingredient.props';
import Card from '@ui/card/Card';

export default function IngredientTabsPrompts({
  ingredient,
}: IngredientTabsPromptsProps) {
  const prompt = ingredient?.prompt as IPrompt;

  const promptRows = [
    {
      label: 'Original',
      value: ingredient?.promptText || 'No prompt available.',
    },
    { label: 'Style', value: prompt?.style || 'None' },
    { label: 'Mood', value: prompt?.mood || 'None' },
    { label: 'Camera', value: prompt?.camera || 'None' },
    {
      label: 'Font Family',
      value: prompt?.fontFamily || 'None',
    },
    {
      label: 'Blacklists',
      value: prompt?.blacklists?.length ? prompt.blacklists.join(', ') : 'None',
    },
  ];

  return (
    <div className="space-y-5">
      <Card bodyClassName="gap-1">
        <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Prompt Context
        </p>
        <p className="text-sm text-muted-foreground">
          The original generation prompt and the structured creative controls
          that shaped it.
        </p>
      </Card>

      {/* First row: full width */}
      <Card bodyClassName="gap-1">
        <span className="font-semibold text-muted-foreground">
          {promptRows[0].label}
        </span>
        <span className="whitespace-pre-wrap text-foreground">
          {promptRows[0].value}
        </span>
      </Card>

      {/* Remaining rows: 2 columns */}
      <div className="grid grid-cols-2 gap-4">
        {promptRows.slice(1).map((row) => (
          <Card key={row.label} bodyClassName="gap-1">
            <span className="font-semibold text-muted-foreground">
              {row.label}
            </span>
            <span className="whitespace-pre-wrap text-foreground">
              {row.value}
            </span>
          </Card>
        ))}
      </div>
    </div>
  );
}
