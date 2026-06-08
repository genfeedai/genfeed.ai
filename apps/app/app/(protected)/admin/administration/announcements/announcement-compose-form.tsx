'use client';

import type { AnnouncementComposeFormState } from '@props/admin/announcements.props';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import { HiOutlineGlobeAlt } from 'react-icons/hi2';

const TWEET_MAX_CHARS = 280;

type Props = {
  form: AnnouncementComposeFormState;
  isSubmitting: boolean;
  tweetCharCount: number;
  tweetOverLimit: boolean;
  onFieldChange: (
    field: keyof AnnouncementComposeFormState,
    value: string | boolean,
  ) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
};

export default function AnnouncementComposeForm({
  form,
  isSubmitting,
  tweetCharCount,
  tweetOverLimit,
  onFieldChange,
  onSubmit,
}: Props) {
  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-6">
      {/* Body */}
      <div className="flex flex-col gap-2">
        <label
          htmlFor="announcement-body"
          className="text-sm font-medium text-foreground"
        >
          Body <span className="text-rose-400">*</span>
        </label>
        <Textarea
          id="announcement-body"
          className="w-full min-h-[160px] bg-background border border-white/10 px-3 py-2 text-sm text-foreground placeholder:text-foreground/40 resize-y focus:outline-none focus:border-white/25 transition-colors"
          placeholder="Write your announcement here — supports Markdown for Discord…"
          value={form.body}
          onChange={(e) => onFieldChange('body', e.target.value)}
          disabled={isSubmitting}
          required
        />
      </div>

      {/* Tweet text */}
      <div className="flex flex-col gap-2">
        <label
          htmlFor="announcement-tweet"
          className="text-sm font-medium text-foreground"
        >
          Tweet text{' '}
          <span className="text-foreground/50">(optional, max 280)</span>
        </label>
        <div className="relative">
          <Textarea
            id="announcement-tweet"
            className="w-full min-h-[100px] bg-background border border-white/10 px-3 py-2 text-sm text-foreground placeholder:text-foreground/40 resize-y focus:outline-none focus:border-white/25 transition-colors"
            placeholder="Short version for Twitter/X…"
            value={form.tweetText}
            onChange={(e) => onFieldChange('tweetText', e.target.value)}
            disabled={isSubmitting}
          />
          <span
            className={`absolute bottom-2 right-3 text-xs tabular-nums ${
              tweetOverLimit ? 'text-rose-400' : 'text-foreground/40'
            }`}
          >
            {tweetCharCount}/{TWEET_MAX_CHARS}
          </span>
        </div>
      </div>

      {/* Channels */}
      <div className="flex flex-col gap-3">
        <span className="text-sm font-medium text-foreground">
          Channels <span className="text-rose-400">*</span>
        </span>

        <span className="flex items-center gap-3 cursor-pointer select-none">
          <Checkbox
            checked={form.discordEnabled}
            onCheckedChange={(checked) =>
              onFieldChange('discordEnabled', checked === true)
            }
            disabled={isSubmitting}
            aria-label="Publish announcement to Discord"
          />
          <span className="text-sm text-foreground">Discord</span>
        </span>

        {form.discordEnabled && (
          <div className="ml-7 flex flex-col gap-2">
            <label
              htmlFor="discord-channel-id"
              className="text-xs text-foreground/60"
            >
              Discord channel ID <span className="text-rose-400">*</span>
            </label>
            <Input
              id="discord-channel-id"
              type="text"
              className="w-full max-w-xs bg-background border border-white/10 px-3 py-1.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-white/25 transition-colors"
              placeholder="e.g. 1234567890"
              value={form.discordChannelId}
              onChange={(e) =>
                onFieldChange('discordChannelId', e.target.value)
              }
              disabled={isSubmitting}
              required={form.discordEnabled}
            />
          </div>
        )}

        <span className="flex items-center gap-3 cursor-pointer select-none">
          <Checkbox
            checked={form.twitterEnabled}
            onCheckedChange={(checked) =>
              onFieldChange('twitterEnabled', checked === true)
            }
            disabled={isSubmitting}
            aria-label="Publish announcement to Twitter/X"
          />
          <span className="text-sm text-foreground">Twitter/X</span>
        </span>
      </div>

      {/* Submit */}
      <Button
        type="submit"
        isDisabled={isSubmitting || tweetOverLimit}
        className="flex items-center gap-2"
      >
        <HiOutlineGlobeAlt className="size-4" />
        {isSubmitting ? 'Publishing…' : 'Publish'}
      </Button>
    </form>
  );
}
