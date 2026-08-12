'use client';

import { ButtonVariant, LivestreamTranscriptSource } from '@genfeedai/enums';
import Card from '@ui/card/Card';
import Textarea from '@ui/inputs/textarea/Textarea';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';

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

type Props = {
  form: LivestreamFormState;
  isSaving: boolean;
  onFormChange: (patch: Partial<LivestreamFormState>) => void;
  onSave: () => void;
};

export default function LivestreamBotConfigCard({
  form,
  isSaving,
  onFormChange,
  onSave,
}: Props) {
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
            Context source (Restream-first)
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
                Manual paste / API
              </SelectItem>
              <SelectItem value={LivestreamTranscriptSource.AUDIO_URL}>
                Audio URL → speech-to-text
              </SelectItem>
              <SelectItem value={LivestreamTranscriptSource.RESTREAM_CHAT}>
                Restream Chat (multi-destination audience)
              </SelectItem>
              <SelectItem
                value={LivestreamTranscriptSource.EXTERNAL_CAPTION_WEBHOOK}
              >
                External captions → Genfeed (host speech on Restream)
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-foreground/50">
            Streaming via Restream Studio: use Restream Chat for audience
            context. Host speech is not OBS — push captions/STT into Genfeed
            while the encoder feeds Restream.
          </p>
        </div>
        <Input
          label="Restream credential / integration id"
          value={form.restreamCredentialId}
          onChange={(event) =>
            onFormChange({ restreamCredentialId: event.target.value })
          }
          placeholder="Optional OAuth credential for Restream Chat WS"
        />
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
        <Textarea
          label="Scheduled Host Prompt Template"
          value={form.hostPromptTemplate}
          onChange={(event) =>
            onFormChange({ hostPromptTemplate: event.target.value })
          }
        />
        <Textarea
          label="Context-Aware Question Template"
          value={form.contextTemplate}
          onChange={(event) =>
            onFormChange({ contextTemplate: event.target.value })
          }
        />
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
