'use client';

import {
  ButtonSize,
  ButtonVariant,
  LivestreamTranscriptSource,
} from '@genfeedai/contracts';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
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
import { useTranslations } from 'next-intl';

type LivestreamFormState = {
  contextTemplate: string;
  description: string;
  hostPromptTemplate: string;
  label: string;
  linkLabel: string;
  linkUrl: string;
  maxAutoPostsPerHour: number;
  minimumMessageGapSeconds: number;
  restreamCredentialId: string;
  scheduledCadenceMinutes: number;
  transcriptEnabled: boolean;
  transcriptSource: string;
  twitchChannelId: string;
  twitchCredentialId: string;
  twitchSenderId: string;
  youtubeChannelId: string;
  youtubeCredentialId: string;
  youtubeLiveChatId: string;
};

type RestreamCredentialOption = {
  id: string;
  label: string;
};

type Props = {
  form: LivestreamFormState;
  isConnectingRestream?: boolean;
  isSaving: boolean;
  onConnectRestream?: () => void;
  onFormChange: (patch: Partial<LivestreamFormState>) => void;
  onSave: () => void;
  restreamCredentials?: RestreamCredentialOption[];
};

const NONE_RESTREAM = '__none__';

export default function LivestreamBotConfigCard({
  form,
  isConnectingRestream = false,
  isSaving,
  onConnectRestream,
  onFormChange,
  onSave,
  restreamCredentials = [],
}: Props) {
  const translate = useTranslations('common.livestreamBot');
  return (
    <Card className="p-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Input
          label="Bot Label"
          value={form.label}
          onChange={(event) => onFormChange({ label: event.target.value })}
        />
        <Input
          label="Description"
          value={form.description}
          onChange={(event) =>
            onFormChange({ description: event.target.value })
          }
        />
        <Input
          label="Scheduled Cadence (minutes)"
          type="number"
          value={String(form.scheduledCadenceMinutes)}
          onChange={(event) =>
            onFormChange({
              scheduledCadenceMinutes: Number(event.target.value || 10),
            })
          }
        />
        <Input
          label="Minimum Gap (seconds)"
          type="number"
          value={String(form.minimumMessageGapSeconds)}
          onChange={(event) =>
            onFormChange({
              minimumMessageGapSeconds: Number(event.target.value || 90),
            })
          }
        />
        <Input
          label="Max Auto Posts Per Hour"
          type="number"
          value={String(form.maxAutoPostsPerHour)}
          onChange={(event) =>
            onFormChange({
              maxAutoPostsPerHour: Number(event.target.value || 6),
            })
          }
        />
        <Checkbox
          checked={form.transcriptEnabled}
          label="Transcript-assisted context enabled"
          className="pt-7"
          onCheckedChange={(checked) =>
            onFormChange({ transcriptEnabled: Boolean(checked) })
          }
        />
        <div className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">
            {translate('contextSource.label')}
          </span>
          <Select
            value={form.transcriptSource}
            onValueChange={(value) => onFormChange({ transcriptSource: value })}
          >
            <SelectTrigger aria-label="Livestream context source">
              <SelectValue placeholder="Choose context source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={LivestreamTranscriptSource.MANUAL}>
                {translate('contextSource.manual')}
              </SelectItem>
              <SelectItem value={LivestreamTranscriptSource.AUDIO_URL}>
                {translate('contextSource.audioUrl')}
              </SelectItem>
              <SelectItem value={LivestreamTranscriptSource.RESTREAM_CHAT}>
                {translate('contextSource.restreamChat')}
              </SelectItem>
              <SelectItem
                value={LivestreamTranscriptSource.EXTERNAL_CAPTION_WEBHOOK}
              >
                {translate('contextSource.externalCaptions')}
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-foreground/50">
            {translate('contextSource.description')}
          </p>
        </div>
        <div className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">
            {translate('restreamAccount.label')}
          </span>
          {restreamCredentials.length > 0 ? (
            <Select
              value={form.restreamCredentialId || NONE_RESTREAM}
              onValueChange={(value) =>
                onFormChange({
                  restreamCredentialId: value === NONE_RESTREAM ? '' : value,
                })
              }
            >
              <SelectTrigger aria-label="Restream OAuth credential">
                <SelectValue placeholder="Select connected Restream account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_RESTREAM}>
                  {translate('restreamAccount.autoDetect')}
                </SelectItem>
                {restreamCredentials.map((credential) => (
                  <SelectItem key={credential.id} value={credential.id}>
                    {credential.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="space-y-2">
              <Input
                label="Restream credential id"
                value={form.restreamCredentialId}
                onChange={(event) =>
                  onFormChange({ restreamCredentialId: event.target.value })
                }
                placeholder="Connect Restream for this brand"
              />
              {onConnectRestream ? (
                <Button
                  label={
                    isConnectingRestream
                      ? 'Connecting…'
                      : 'Connect Restream account'
                  }
                  size={ButtonSize.SM}
                  variant={ButtonVariant.SECONDARY}
                  disabled={isConnectingRestream}
                  onClick={onConnectRestream}
                />
              ) : null}
            </div>
          )}
          <p className="text-xs text-foreground/50">
            {translate('restreamAccount.description')}
          </p>
          {restreamCredentials.length > 0 && onConnectRestream ? (
            <Button
              label={
                isConnectingRestream
                  ? 'Connecting…'
                  : 'Connect another Restream'
              }
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
              disabled={isConnectingRestream}
              onClick={onConnectRestream}
            />
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Input
          label="Primary Link Label"
          value={form.linkLabel}
          onChange={(event) => onFormChange({ linkLabel: event.target.value })}
        />
        <Input
          label="Primary Link URL"
          value={form.linkUrl}
          onChange={(event) => onFormChange({ linkUrl: event.target.value })}
        />
        <div className="space-y-1.5">
          <Label
            htmlFor="host-prompt-template"
            className="text-sm font-medium text-foreground"
          >
            {translate('hostPromptTemplate')}
          </Label>
          <Textarea
            id="host-prompt-template"
            value={form.hostPromptTemplate}
            onChange={(event) =>
              onFormChange({ hostPromptTemplate: event.target.value })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor="context-template"
            className="text-sm font-medium text-foreground"
          >
            {translate('contextTemplate')}
          </Label>
          <Textarea
            id="context-template"
            value={form.contextTemplate}
            onChange={(event) =>
              onFormChange({ contextTemplate: event.target.value })
            }
          />
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Button
          isLoading={isSaving}
          label="Save Bot Configuration"
          variant={ButtonVariant.DEFAULT}
          onClick={onSave}
        />
      </div>
    </Card>
  );
}
