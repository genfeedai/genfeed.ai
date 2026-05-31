'use client';

import type {
  ICreateHarnessProfilePayload,
  IHarnessProfile,
} from '@genfeedai/interfaces';
import Card from '@ui/card/Card';
import { Label } from '@ui/primitives/label';
import { Textarea } from '@ui/primitives/textarea';

type HarnessRightColumnProps = {
  draft: ICreateHarnessProfilePayload;
  onListChange: (
    section: 'examples' | 'structure' | 'thesis',
    key: string,
    value: string,
  ) => void;
  onDraftChange: <Key extends keyof IHarnessProfile>(
    key: Key,
    value: IHarnessProfile[Key],
  ) => void;
  joinLines: (value: string[] | undefined) => string;
  splitLines: (value: string) => string[];
};

export default function HarnessRightColumn({
  draft,
  onListChange,
  onDraftChange,
  joinLines,
  splitLines,
}: HarnessRightColumnProps) {
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="mb-4 space-y-1">
          <h2 className="text-lg font-semibold">Structure</h2>
          <p className="text-sm text-muted-foreground">
            Format rules for one-liners, threads, and articles.
          </p>
        </div>
        <div className="space-y-4">
          {(
            [
              'shortFormSkeleton',
              'longFormSkeleton',
              'lineRules',
              'transitions',
              'endings',
            ] as const
          ).map((key) => (
            <div className="space-y-2" key={key}>
              <Label htmlFor={`harness-structure-${key}`}>{key}</Label>
              <Textarea
                id={`harness-structure-${key}`}
                maxHeight={220}
                onChange={(event) =>
                  onListChange('structure', key, event.target.value)
                }
                value={joinLines(draft.structure?.[key])}
              />
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <div className="mb-4 space-y-1">
          <h2 className="text-lg font-semibold">Examples</h2>
          <p className="text-sm text-muted-foreground">
            Paste one example per block. These are injected as reference
            signals, not copied.
          </p>
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="harness-good">Good examples</Label>
            <Textarea
              id="harness-good"
              maxHeight={260}
              onChange={(event) =>
                onListChange('examples', 'good', event.target.value)
              }
              value={joinLines(draft.examples?.good)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="harness-avoid">Anti-examples</Label>
            <Textarea
              id="harness-avoid"
              maxHeight={220}
              onChange={(event) =>
                onListChange('examples', 'avoid', event.target.value)
              }
              value={joinLines(draft.examples?.avoid)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="harness-guardrails">Guardrails</Label>
            <Textarea
              id="harness-guardrails"
              maxHeight={220}
              onChange={(event) =>
                onDraftChange('guardrails', splitLines(event.target.value))
              }
              value={joinLines(draft.guardrails)}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
