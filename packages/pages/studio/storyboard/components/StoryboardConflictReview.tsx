'use client';
import { ButtonVariant } from '@genfeedai/contracts';
import type { StoryboardConflictReviewProps } from '@genfeedai/props/studio/storyboard.props';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { RadioGroup, RadioGroupItem } from '@ui/primitives/radio-group';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export default function StoryboardConflictReview({
  conflicts,
  choices,
  choose,
  resolve,
}: StoryboardConflictReviewProps) {
  const translate = useTranslations('pages.studioStoryboard.conflict');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState(false);
  function display(value: unknown) {
    return value === undefined
      ? translate('empty')
      : typeof value === 'string'
        ? value || translate('empty')
        : JSON.stringify(value, null, 2);
  }
  if (!conflicts.length) return null;
  return (
    <Card label={translate('title')} description={translate('description')}>
      {editing ? (
        <Button
          label={translate('reviewSaved')}
          variant={ButtonVariant.SECONDARY}
          onClick={() => setEditing(false)}
        />
      ) : (
        <div className="space-y-4">
          {conflicts.map((conflict) => (
            <fieldset key={conflict.path} className="space-y-2">
              <legend className="text-sm font-medium">{conflict.label}</legend>
              <RadioGroup
                className="grid gap-3 sm:grid-cols-2"
                value={choices[conflict.path] ?? ''}
                onValueChange={(choice) => {
                  if (choice === 'local' || choice === 'remote')
                    choose(conflict.path, choice);
                }}
                disabled={working}
              >
                {(['local', 'remote'] as const).map((choice) => (
                  <label
                    key={choice}
                    className="space-y-2 rounded-md border border-border p-3 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <RadioGroupItem
                        value={choice}
                        aria-label={
                          choice === 'local'
                            ? translate('yourEdit')
                            : translate('savedVersion')
                        }
                      />
                      {choice === 'local'
                        ? translate('yourEdit')
                        : translate('savedVersion')}
                    </span>
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs">
                      {display(conflict[choice])}
                    </pre>
                  </label>
                ))}
              </RadioGroup>
            </fieldset>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              label={translate('keepEditing')}
              variant={ButtonVariant.SECONDARY}
              disabled={working}
              onClick={() => setEditing(true)}
            />
            <Button
              label={translate('saveResolved')}
              disabled={
                working || conflicts.some((entry) => !choices[entry.path])
              }
              onClick={() => {
                setWorking(true);
                setError(undefined);
                void resolve()
                  .catch((caught: unknown) =>
                    setError(
                      caught instanceof Error
                        ? caught.message
                        : translate('saveFailed'),
                    ),
                  )
                  .finally(() => setWorking(false));
              }}
            />
          </div>
        </div>
      )}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
