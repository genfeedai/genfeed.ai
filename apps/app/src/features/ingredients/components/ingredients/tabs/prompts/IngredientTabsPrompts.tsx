'use client';

import type { IPrompt } from '@genfeedai/contracts/interfaces';
import type { IngredientTabsPromptsProps } from '@genfeedai/props/content/ingredient.props';
import GenerationHarnessReceipt from '@ui/ingredients/tabs/prompts/GenerationHarnessReceipt';

export default function IngredientTabsPrompts({
  ingredient,
}: IngredientTabsPromptsProps) {
  const prompt = ingredient?.prompt as IPrompt;

  const promptRows = [
    {
      label: 'Original',
      value:
        ingredient?.generationHarness?.originalPrompt ||
        ingredient?.promptText ||
        'No prompt available.',
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
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Original prompt</h3>
        <p className="whitespace-pre-wrap break-words text-sm text-foreground">
          {promptRows[0].value}
        </p>
      </div>

      {ingredient?.generationHarness ? (
        <GenerationHarnessReceipt receipt={ingredient.generationHarness} />
      ) : null}

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {promptRows
          .slice(1)
          .filter((row) => row.value !== 'None')
          .map((row) => (
            <div key={row.label} className="space-y-1">
              <dt className="text-sm font-medium text-muted-foreground">
                {row.label}
              </dt>
              <dd className="whitespace-pre-wrap break-words text-sm text-foreground">
                {row.value}
              </dd>
            </div>
          ))}
      </dl>
    </div>
  );
}
