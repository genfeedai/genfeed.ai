import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import { type ReactElement, useEffect, useState } from 'react';
import { LoadingSpinner } from '~components/ui';
import { authService } from '~services/auth.service';
import { apiEndpoint } from '~services/environment.service';
import type { ReplyTone } from '~types/extension';
import { logger } from '~utils/logger.util';

interface ReplyPageProps {
  initialContent?: string;
  initialUrl?: string;
  initialAuthor?: string;
}

interface ReplyOption {
  text: string;
}

type ReplyStep = 'input' | 'loading' | 'result';

const TONES: { value: ReplyTone; label: string; description: string }[] = [
  {
    description: "Support the author's view",
    label: 'Agree',
    value: 'agree',
  },
  {
    description: 'Push back respectfully',
    label: 'Challenge',
    value: 'challenge',
  },
  {
    description: 'Share a complementary insight',
    label: 'Add Value',
    value: 'add-value',
  },
  { description: 'Keep it light and fun', label: 'Funny', value: 'funny' },
  {
    description: 'Keep it business-focused',
    label: 'Professional',
    value: 'professional',
  },
];

const TONE_PROMPT_MAP: Record<ReplyTone, string> = {
  'add-value':
    'Write a reply that adds valuable additional insight or information to this post.',
  agree: "Write a reply that agrees with and supports the author's viewpoint.",
  challenge:
    'Write a reply that respectfully challenges the post with a counter-argument or different perspective.',
  funny:
    'Write a witty, light-hearted reply with humor appropriate for social media.',
  professional:
    'Write a professional, business-focused reply that adds credibility.',
};

export function ReplyPage({
  initialContent = '',
  initialUrl = '',
  initialAuthor = '',
}: ReplyPageProps): ReactElement {
  const [postContent, setPostContent] = useState(initialContent);
  const [url, setUrl] = useState(initialUrl);
  const [author, setAuthor] = useState(initialAuthor);
  const [tone, setTone] = useState<ReplyTone>('add-value');
  const [step, setStep] = useState<ReplyStep>('input');
  const [replies, setReplies] = useState<ReplyOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Sync props when triggered by keyboard shortcut
  useEffect(() => {
    if (initialContent) {
      setPostContent(initialContent);
    }
    if (initialUrl) {
      setUrl(initialUrl);
    }
    if (initialAuthor) {
      setAuthor(initialAuthor);
    }
  }, [initialContent, initialUrl, initialAuthor]);

  async function handleGenerate(): Promise<void> {
    if (!postContent.trim()) {
      setError('Add a post to reply to first.');
      return;
    }

    setError(null);
    setStep('loading');

    try {
      const token = await authService.getToken();
      if (!token) {
        setError('Sign in first to generate replies.');
        setStep('input');
        return;
      }

      const toneInstruction = TONE_PROMPT_MAP[tone];

      // Generate 3 replies via the background message handler
      const response = await chrome.runtime.sendMessage({
        event: 'generateReply',
        platform: url ? detectPlatformFromUrl(url) : 'twitter',
        postAuthor: author,
        postContent,
        postId: `reply_${Date.now()}`,
        url,
      });

      if (response?.success && response.reply) {
        // We got 1 reply; use it plus tone-specific variations
        const baseReply = response.reply as string;
        setReplies([
          { text: baseReply },
          ...generateToneVariations(baseReply, tone, toneInstruction),
        ]);
        setStep('result');
      } else {
        // Fallback: direct API call
        const apiResponse = await fetch(`${apiEndpoint}/ai/generate`, {
          body: JSON.stringify({
            count: 3,
            post: postContent,
            postAuthor: author,
            postUrl: url,
            task: `${toneInstruction} The reply should be concise, natural, and ready to post. Return only the reply text.`,
            tone,
            type: 'social-reply',
          }),
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
        });

        if (!apiResponse.ok) {
          throw new Error(
            (await apiResponse
              .json()
              .then((d: { message?: string }) => d.message)
              .catch(() => null)) ?? 'Failed to generate replies',
          );
        }

        const data = (await apiResponse.json()) as {
          replies?: string[];
          reply?: string;
          content?: string;
        };
        const replyTexts =
          data.replies ??
          (data.reply ? [data.reply] : null) ??
          (data.content ? [data.content] : null);

        if (!replyTexts || replyTexts.length === 0) {
          throw new Error('No replies returned from API');
        }

        setReplies(replyTexts.map((text) => ({ text })));
        setStep('result');
      }
    } catch (err) {
      logger.error('Reply generation error', err);
      setError(
        err instanceof Error ? err.message : 'Failed to generate replies',
      );
      setStep('input');
    }
  }

  function handleCopy(text: string, index: number): void {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  }

  if (step === 'loading') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <LoadingSpinner size="md" className="text-primary" />
        <p className="text-sm text-muted-foreground">Generating replies…</p>
      </div>
    );
  }

  if (step === 'result' && replies.length > 0) {
    return (
      <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">
            Reply Options
          </h2>
          <Button
            type="button"
            variant={ButtonVariant.GHOST}
            onClick={() => {
              setStep('input');
              setReplies([]);
            }}
            className="text-xs"
          >
            ← Back
          </Button>
        </div>

        <div className="rounded border border-border bg-muted px-3 py-2 text-xs text-muted-foreground line-clamp-3">
          {postContent}
        </div>

        <div className="flex flex-col gap-2">
          {replies.map((reply, i) => (
            <div
              key={reply.text}
              className="rounded border border-border bg-card p-3"
            >
              <p className="mb-2 text-sm text-foreground">{reply.text}</p>
              <Button
                type="button"
                variant={ButtonVariant.GHOST}
                onClick={() => handleCopy(reply.text, i)}
                className="w-full rounded bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20"
              >
                {copiedIndex === i ? '✓ Copied' : 'Copy reply'}
              </Button>
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant={ButtonVariant.OUTLINE}
          onClick={() => {
            setStep('input');
            setReplies([]);
          }}
          className="mt-auto"
        >
          Generate more
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <h2 className="text-sm font-semibold text-foreground">
        Generate a Reply
      </h2>

      {error && (
        <div className="rounded bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">
          Post to reply to
        </label>
        <Textarea
          value={postContent}
          onChange={(e) => setPostContent(e.target.value)}
          placeholder="Paste the post content here…"
          rows={5}
          className="rounded border border-border bg-input px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
        />
      </div>

      <div className="flex gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">
            Author (optional)
          </label>
          <Input
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="@username"
            className="rounded border border-border bg-input px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">
          Tone
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {TONES.map((t) => (
            <Button
              key={t.value}
              type="button"
              variant={ButtonVariant.UNSTYLED}
              onClick={() => setTone(t.value)}
              title={t.description}
              className={`rounded border px-2 py-1.5 text-xs font-medium transition-colors ${
                tone === t.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-muted text-muted-foreground hover:border-primary/50 hover:text-foreground'
              }`}
            >
              {t.label}
            </Button>
          ))}
        </div>
      </div>

      <Button
        type="button"
        variant={ButtonVariant.DEFAULT}
        onClick={handleGenerate}
        disabled={!postContent.trim()}
        className="mt-auto rounded shadow"
      >
        Generate replies →
      </Button>
    </div>
  );
}

function detectPlatformFromUrl(url: string): string {
  if (url.includes('twitter.com') || url.includes('x.com')) {
    return 'twitter';
  }
  if (url.includes('linkedin.com')) {
    return 'linkedin';
  }
  if (url.includes('instagram.com')) {
    return 'instagram';
  }
  if (url.includes('tiktok.com')) {
    return 'tiktok';
  }
  return 'twitter';
}

function generateToneVariations(
  baseReply: string,
  tone: ReplyTone,
  _instruction: string,
): ReplyOption[] {
  // Provide 2 structural variations when we only get 1 from the API
  const shorter = baseReply.split('. ').slice(0, 1).join('. ');
  const withHashtag =
    tone === 'add-value' || tone === 'agree'
      ? `${baseReply} 💡`
      : tone === 'funny'
        ? `${baseReply} 😄`
        : `${baseReply}`;

  return [
    { text: shorter.length > 10 ? shorter : baseReply },
    { text: withHashtag },
  ];
}
