'use client';

import type { IHarnessProfile } from '@genfeedai/contracts/interfaces';
import Card from '@ui/card/Card';
import { Input } from '@ui/primitives/input';
import { Label } from '@ui/primitives/label';
import { Textarea } from '@ui/primitives/textarea';

type HarnessVoiceCardProps = {
  voice: IHarnessProfile['voice'] | undefined;
  onVoiceChange: (
    key: keyof NonNullable<IHarnessProfile['voice']>,
    value: string | string[],
  ) => void;
  joinLines: (value: string[] | undefined) => string;
  splitLines: (value: string) => string[];
};

export default function HarnessVoiceCard({
  voice,
  onVoiceChange,
  joinLines,
  splitLines,
}: HarnessVoiceCardProps) {
  return (
    <Card
      label="Delivery style"
      description="Attitude and vocabulary knobs for this brand’s harness (runtime delivery — not the Brand voice page)."
      bodyClassName="gap-3 p-4"
    >
      <div className="grid gap-3 md:grid-cols-2">
        {(['tone', 'style', 'stance', 'aggression', 'sarcasm'] as const).map(
          (key) => (
            <div className="space-y-2" key={key}>
              <Label htmlFor={`harness-${key}`}>{key}</Label>
              <Input
                id={`harness-${key}`}
                onChange={(event) => onVoiceChange(key, event.target.value)}
                value={(voice?.[key] as string | undefined) ?? ''}
              />
            </div>
          ),
        )}
        <div className="space-y-2">
          <Label htmlFor="harness-vocabulary">Vocabulary</Label>
          <Textarea
            id="harness-vocabulary"
            maxHeight={180}
            onChange={(event) =>
              onVoiceChange('vocabulary', splitLines(event.target.value))
            }
            value={joinLines(voice?.vocabulary)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="harness-banned">Banned phrases</Label>
          <Textarea
            id="harness-banned"
            maxHeight={180}
            onChange={(event) =>
              onVoiceChange('bannedPhrases', splitLines(event.target.value))
            }
            value={joinLines(voice?.bannedPhrases)}
          />
        </div>
      </div>
    </Card>
  );
}
