'use client';

import type {
  HarnessProfileScope,
  ICreateHarnessProfilePayload,
  IHarnessProfile,
} from '@genfeedai/interfaces';
import Card from '@ui/card/Card';
import { Input } from '@ui/primitives/input';
import { Label } from '@ui/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';

type HarnessIdentityCardProps = {
  draft: ICreateHarnessProfilePayload;
  scopes: readonly HarnessProfileScope[];
  onDraftChange: <Key extends keyof IHarnessProfile>(
    key: Key,
    value: IHarnessProfile[Key],
  ) => void;
  onScopeChange: (value: string) => void;
  joinLines: (value: string[] | undefined) => string;
  splitLines: (value: string) => string[];
};

export default function HarnessIdentityCard({
  draft,
  scopes,
  onDraftChange,
  onScopeChange,
  joinLines,
  splitLines,
}: HarnessIdentityCardProps) {
  return (
    <Card className="p-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="harness-label">Label</Label>
          <Input
            id="harness-label"
            onChange={(event) => onDraftChange('label', event.target.value)}
            value={draft.label}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="harness-scope">Scope</Label>
          <Select onValueChange={onScopeChange} value={draft.scope ?? 'brand'}>
            <SelectTrigger id="harness-scope">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {scopes.map((scope) => (
                <SelectItem key={scope} value={scope}>
                  {scope}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="harness-description">Description</Label>
          <Input
            id="harness-description"
            onChange={(event) =>
              onDraftChange('description', event.target.value)
            }
            placeholder="What this profile is for"
            value={draft.description ?? ''}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="harness-platforms">Platforms</Label>
          <Textarea
            id="harness-platforms"
            maxHeight={180}
            onChange={(event) =>
              onDraftChange('platforms', splitLines(event.target.value))
            }
            value={joinLines(draft.platforms)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="harness-audience">ICP / Audience</Label>
          <Textarea
            id="harness-audience"
            maxHeight={180}
            onChange={(event) =>
              onDraftChange('audience', splitLines(event.target.value))
            }
            value={joinLines(draft.audience)}
          />
        </div>
      </div>
    </Card>
  );
}
