import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import { type ReactElement, useEffect, useReducer, useRef } from 'react';
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

interface ReplyState {
  postContent: string;
  author: string;
  tone: ReplyTone;
  step: ReplyStep;
  replies: ReplyOption[];
  error: string | null;
  copiedIndex: number | null;
}

type ReplyAction =
  | { type: 'SET_POST_CONTENT'; payload: string }
  | { type: 'SET_AUTHOR'; payload: string }
  | { type: 'SET_TONE'; payload: ReplyTone }
  | { type: 'SET_STEP'; payload: ReplyStep }
  | { type: 'SET_REPLIES'; payload: ReplyOption[] }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_COPIED_INDEX'; payload: number | null }
  | { type: 'LOADING' }
  | { type: 'RESULT'; payload: ReplyOption[] }
  | { type: 'RESET_TO_INPUT' }
  | { type: 'SYNC_PROPS'; payload: { content: string; author: string } };

function replyReducer(state: ReplyState, action: ReplyAction): ReplyState {
  switch (action.type) {
    case 'SET_POST_CONTENT':
      return { ...state, postContent: action.payload };
    case 'SET_AUTHOR':
      return { ...state, author: action.payload };
    case 'SET_TONE':
      return { ...state, tone: action.payload };
    case 'SET_STEP':
      return { ...state, step: action.payload };
    case 'SET_REPLIES':
      return { ...state, replies: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_COPIED_INDEX':
      return { ...state, copiedIndex: action.payload };
    case 'LOADING':
      return { ...state, step: 'loading', error: null };
    case 'RESULT':
      return { ...state, step: 'result', replies: action.payload };
    case 'RESET_TO_INPUT':
      return { ...state, step: 'input', replies: [] };
    case 'SYNC_PROPS':
      return {
        ...state,
        author: action.payload.author || state.author,
        postContent: action.payload.content || state.postContent,
      };
    default:
      return state;
  }
}

export function ReplyPage({
  initialContent = '',
  initialUrl = '',
  initialAuthor = '',
}: ReplyPageProps): ReactElement {
  const urlRef = useRef<string>(initialUrl);
  const [state, dispatch] = useReducer(replyReducer, {
    author: initialAuthor,
    copiedIndex: null,
    error: null,
    postContent: initialContent,
    replies: [],
    step: 'input',
    tone: 'add-value',
  });
  const { author, copiedIndex, error, postContent, replies, step, tone } =
    state;

  // Sync props when triggered by keyboard shortcut (e.g. user activates extension on a new page)
  useEffect(() => {
    urlRef.current = initialUrl;
    dispatch({
      payload: { author: initialAuthor, content: initialContent },
      type: 'SYNC_PROPS',
    });
  }, [initialContent, initialUrl, initialAuthor]);

  async function handleGenerate(): Promise<void> {
    if (!postContent.trim()) {
      dispatch({ payload: 'Add a post to reply to first.', type: 'SET_ERROR' });
      return;
    }

    dispatch({ type: 'LOADING' });

    try {
      const token = await authService.getToken();
      if (!token) {
        dispatch({
          payload: 'Sign in first to generate replies.',
          type: 'SET_ERROR',
        });
        dispatch({ payload: 'input', type: 'SET_STEP' });
        return;
      }

      const currentUrl = urlRef.current;
      const toneInstruction = TONE_PROMPT_MAP[tone];

      // Generate 3 replies via the background message handler
      const response = await chrome.runtime.sendMessage({
        event: 'generateReply',
        platform: currentUrl ? detectPlatformFromUrl(currentUrl) : 'twitter',
        postAuthor: author,
        postContent,
        postId: `reply_${Date.now()}`,
        url: currentUrl,
      });

      if (response?.success && response.reply) {
        // We got 1 reply; use it plus tone-specific variations
        const baseReply = response.reply as string;
        dispatch({
          payload: [
            { text: baseReply },
            ...generateToneVariations(baseReply, tone, toneInstruction),
          ],
          type: 'RESULT',
        });
      } else {
        // Fallback: direct API call
        const apiResponse = await fetch(`${apiEndpoint}/ai/generate`, {
          body: JSON.stringify({
            count: 3,
            post: postContent,
            postAuthor: author,
            postUrl: currentUrl,
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

        dispatch({
          payload: replyTexts.map((text) => ({ text })),
          type: 'RESULT',
        });
      }
    } catch (err) {
      logger.error('Reply generation error', err);
      dispatch({
        payload:
          err instanceof Error ? err.message : 'Failed to generate replies',
        type: 'SET_ERROR',
      });
      dispatch({ payload: 'input', type: 'SET_STEP' });
    }
  }

  async function handleCopy(text: string, index: number): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      dispatch({ payload: index, type: 'SET_COPIED_INDEX' });
      setTimeout(
        () => dispatch({ payload: null, type: 'SET_COPIED_INDEX' }),
        2000,
      );
    } catch (err) {
      logger.error('Failed to copy reply text', err);
      dispatch({ payload: 'Failed to copy reply text', type: 'SET_ERROR' });
    }
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
            onClick={() => dispatch({ type: 'RESET_TO_INPUT' })}
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
              className="rounded-xl border border-border bg-card p-3"
            >
              <p className="mb-2 text-sm text-foreground">{reply.text}</p>
              <Button
                type="button"
                variant={ButtonVariant.GHOST}
                onClick={() => {
                  void handleCopy(reply.text, i);
                }}
                className="w-full rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20"
              >
                {copiedIndex === i ? '✓ Copied' : 'Copy reply'}
              </Button>
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant={ButtonVariant.OUTLINE}
          onClick={() => dispatch({ type: 'RESET_TO_INPUT' })}
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
        <label
          className="text-xs font-medium text-muted-foreground"
          htmlFor="reply-post-content"
        >
          Post to reply to
        </label>
        <Textarea
          id="reply-post-content"
          value={postContent}
          onChange={(e) =>
            dispatch({ payload: e.target.value, type: 'SET_POST_CONTENT' })
          }
          placeholder="Paste the post content here…"
          rows={5}
          className="resize-none"
        />
      </div>

      <div className="flex gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <label
            className="text-xs font-medium text-muted-foreground"
            htmlFor="reply-author"
          >
            Author (optional)
          </label>
          <Input
            id="reply-author"
            type="text"
            value={author}
            onChange={(e) =>
              dispatch({ payload: e.target.value, type: 'SET_AUTHOR' })
            }
            placeholder="@username"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <div className="text-xs font-medium text-muted-foreground">Tone</div>
        <div className="grid grid-cols-2 gap-1.5">
          {TONES.map((t) => (
            <Button
              key={t.value}
              type="button"
              variant={
                tone === t.value
                  ? ButtonVariant.SECONDARY
                  : ButtonVariant.OUTLINE
              }
              onClick={() => dispatch({ payload: t.value, type: 'SET_TONE' })}
              title={t.description}
              className="text-xs"
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
        className="mt-auto"
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
