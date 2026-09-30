'use client';
import { ButtonVariant } from '@genfeedai/contracts';
import type { StoryboardConflictReviewProps } from '@genfeedai/props/studio/storyboard.props';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { RadioGroup, RadioGroupItem } from '@ui/primitives/radio-group';
import { useState } from 'react';

function display(value: unknown) {
  return value === undefined
    ? 'Empty'
    : typeof value === 'string'
      ? value || 'Empty'
      : JSON.stringify(value, null, 2);
}
export default function StoryboardConflictReview({
  conflicts,
  choices,
  choose,
  resolve,
}: StoryboardConflictReviewProps) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState(false);
  if (!conflicts.length) return null;
  return (
    <Card
      label="Review concurrent edits"
      description="Another saved version changed these fields. Your recovery draft is retained until the resolved changes are acknowledged."
    >
      {editing ? (
        <Button
          label="Review saved versions"
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
                          choice === 'local' ? 'Your edit' : 'Saved version'
                        }
                      />
                      {choice === 'local' ? 'Your edit' : 'Saved version'}
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
              label="Keep editing"
              variant={ButtonVariant.SECONDARY}
              disabled={working}
              onClick={() => setEditing(true)}
            />
            <Button
              label="Save resolved changes"
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
                        : 'Could not save resolved changes.',
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
