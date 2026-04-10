'use client';

import type { IPrompt } from '@genfeedai/interfaces';
import type { IngredientTabsPromptsProps } from '@genfeedai/props/content/ingredient.props';

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
      <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
          Prompt Context
        </p>
        <p className="mt-1 text-sm text-white/65">
          The original generation prompt and the structured creative controls
          that shaped it.
        </p>
      </div>

      {/* First row: full width */}
      <div className="flex flex-col rounded-2xl border border-white/8 bg-white/[0.025] p-4">
        <span className="font-semibold opacity-50">{promptRows[0].label}</span>
        <span className="text-white mt-1 whitespace-pre-wrap">
          {promptRows[0].value}
        </span>
      </div>

      {/* Remaining rows: 2 columns */}
      <div className="grid grid-cols-2 gap-4">
        {promptRows.slice(1).map((row, idx) => (
          <div
            key={idx}
            className="flex flex-col rounded-2xl border border-white/8 bg-white/[0.025] p-4"
          >
            <span className="font-semibold opacity-50">{row.label}</span>
            <span className="text-white mt-1 whitespace-pre-wrap">
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
