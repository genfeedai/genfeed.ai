'use client';

import Card from '@ui/card/Card';
import { Input } from '@ui/primitives/input';

type LivestreamFormState = {
  contextTemplate: string;
  description: string;
  hostPromptTemplate: string;
  label: string;
  linkLabel: string;
  linkUrl: string;
  maxAutoPostsPerHour: number;
  minimumMessageGapSeconds: number;
  scheduledCadenceMinutes: number;
  transcriptEnabled: boolean;
  twitchChannelId: string;
  twitchCredentialId: string;
  twitchSenderId: string;
  youtubeChannelId: string;
  youtubeCredentialId: string;
  youtubeLiveChatId: string;
};

type Props = {
  form: LivestreamFormState;
  onFormChange: (patch: Partial<LivestreamFormState>) => void;
  youtubeLastPostedAt: string | undefined;
  twitchLastPostedAt: string | undefined;
};

export default function LivestreamPlatformTargets({
  form,
  onFormChange,
  youtubeLastPostedAt,
  twitchLastPostedAt,
}: Props): JSX.Element {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-6">
        <h2 className="text-lg font-semibold">YouTube Live</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Primary delivery target for the show.
        </p>
        <div className="grid gap-4">
          <Input
            label="YouTube Channel ID"
            value={form.youtubeChannelId}
            onChange={(event) =>
              onFormChange({ youtubeChannelId: event.target.value })
            }
          />
          <Input
            label="YouTube Credential ID"
            value={form.youtubeCredentialId}
            onChange={(event) =>
              onFormChange({ youtubeCredentialId: event.target.value })
            }
          />
          <Input
            label="Resolved Live Chat ID"
            value={form.youtubeLiveChatId}
            onChange={(event) =>
              onFormChange({ youtubeLiveChatId: event.target.value })
            }
          />
          <p className="text-xs text-muted-foreground">
            Last YouTube delivery: {youtubeLastPostedAt || 'None yet'}
          </p>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold">Twitch</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Secondary delivery target for simultaneous streams.
        </p>
        <div className="grid gap-4">
          <Input
            label="Twitch Broadcaster ID"
            value={form.twitchChannelId}
            onChange={(event) =>
              onFormChange({ twitchChannelId: event.target.value })
            }
          />
          <Input
            label="Twitch Credential ID"
            value={form.twitchCredentialId}
            onChange={(event) =>
              onFormChange({ twitchCredentialId: event.target.value })
            }
          />
          <Input
            label="Twitch Sender ID"
            value={form.twitchSenderId}
            onChange={(event) =>
              onFormChange({ twitchSenderId: event.target.value })
            }
          />
          <p className="text-xs text-muted-foreground">
            Last Twitch delivery: {twitchLastPostedAt || 'None yet'}
          </p>
        </div>
      </Card>
    </div>
  );
}
