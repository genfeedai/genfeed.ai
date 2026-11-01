import {
  ButtonVariant,
  CardPadding,
  CardVariant,
} from '@genfeedai/contracts';
import type {
  ReplyVariantsResult,
  ReplyVariantTone,
} from '@genfeedai/contracts/interfaces';
import type {
  ActionRecovery,
  ActionRouting,
} from '@genfeedai/contracts/interfaces/extension/extension-action-routing.interface';
import Card from '@ui/card/Card';
import { Alert } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Label } from '@ui/primitives/label';
import { SegmentedControl } from '@ui/primitives/segmented-control';
import Spinner from '@ui/primitives/spinner';
import { Textarea } from '@ui/primitives/textarea';
import { type ReactElement, useEffect, useReducer } from 'react';
import { RecoveryActions, RoutingNotice } from '~components/chat/ActionRouting';
import PostCard from '~components/pages/PostCard';
import { getPlatformForUrl } from '~platforms/config';
import { usePlatformStore } from '~store/use-platform-store';
import type { PagePost, ReplyVariantsResponse } from '~types/extension';
import { logger } from '~utils/logger.util';

interface ReplyPageProps {
  initialAuthor?: string;
  initialContent?: string;
  initialPlatform?: string;
  initialUrl?: string;
}

type ReplyStep = 'input' | 'loading' | 'result';

const TONES: { value: ReplyVariantTone; label: string; description: string }[] =
  [
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

/** A failed request the user can run again with the same key and inputs. */
interface FailedReplyRequest {
  author: string;
  platform: string;
  postContent: string;
  requestKey: string;
  tone: ReplyVariantTone;
}

interface ReplyState {
  author: string;
  error: string | null;
  failedRequest: FailedReplyRequest | null;
  /** Variant whose text was last copied or inserted, and what happened. */
  feedback: { index: number; message: string; isError: boolean } | null;
  postContent: string;
  recovery: ActionRecovery | null;
  result: ReplyVariantsResult | null;
  /** The post being replied to, when one was read from the page. */
  source: PagePost | null;
  /** Present when a local provider wrote the result. */
  routing: ActionRouting | null;
  step: ReplyStep;
  tone: ReplyVariantTone;
}

type ReplyAction =
  | { type: 'SET_POST_CONTENT'; payload: string }
  | { type: 'SET_AUTHOR'; payload: string }
  | { type: 'SET_TONE'; payload: ReplyVariantTone }
  | { type: 'LOADING' }
  | {
      type: 'RESULT';
      payload: ReplyVariantsResult;
      /** The post text the replies were written for. */
      postContent: string;
      routing: ActionRouting | null;
    }
  | {
      type: 'FAILED';
      payload: string;
      failedRequest?: FailedReplyRequest;
      recovery?: ActionRecovery;
    }
  | { type: 'FEEDBACK'; payload: ReplyState['feedback'] }
  | { type: 'RESET_TO_INPUT' }
  | { type: 'SET_SOURCE'; payload: PagePost | null };

function replyReducer(state: ReplyState, action: ReplyAction): ReplyState {
  switch (action.type) {
    case 'SET_POST_CONTENT':
      return { ...state, postContent: action.payload };
    case 'SET_AUTHOR':
      return { ...state, author: action.payload };
    case 'SET_TONE':
      return { ...state, tone: action.payload };
    case 'LOADING':
      return {
        ...state,
        error: null,
        failedRequest: null,
        feedback: null,
        recovery: null,
        step: 'loading',
      };
    case 'RESULT':
      // Replies for a post the user has since navigated away from are dropped.
      if (action.postContent !== state.postContent) {
        return state.step === 'loading' ? { ...state, step: 'input' } : state;
      }
      return {
        ...state,
        result: action.payload,
        routing: action.routing,
        step: 'result',
      };
    case 'FAILED':
      return {
        ...state,
        error: action.payload,
        failedRequest: action.failedRequest ?? null,
        recovery: action.recovery ?? null,
        step: 'input',
      };
    case 'FEEDBACK':
      return { ...state, feedback: action.payload };
    case 'RESET_TO_INPUT':
      return { ...state, feedback: null, result: null, step: 'input' };
    case 'SET_SOURCE':
      return {
        ...state,
        author:
          action.payload?.authorHandle || action.payload?.authorName || '',
        error: null,
        failedRequest: null,
        feedback: null,
        postContent: action.payload?.text ?? '',
        recovery: null,
        result: null,
        source: action.payload,
        step: 'input',
      };
    default:
      return state;
  }
}

/**
 * Reply options for the post being read: tone in, distinct variants out, then
 * Insert puts the chosen one in the page's reply box (never submitting) or
 * Copy keeps it for composers the extension cannot type into.
 */
export function ReplyPage({
  initialAuthor = '',
  initialContent = '',
  initialPlatform,
  initialUrl = '',
}: ReplyPageProps): ReactElement {
  const detectedPlatform = usePlatformStore((s) => s.currentPlatform);
  const pagePost = usePlatformStore((s) => s.pageContext.post);
  const pageUrl = usePlatformStore((s) => s.pageContext.url);
  const platform =
    initialPlatform || getPlatformForUrl(initialUrl) || detectedPlatform;
  const initialSource = initialContent
    ? {
        authorName: initialAuthor || undefined,
        text: initialContent,
        url: initialUrl,
      }
    : null;
  const [state, dispatch] = useReducer(replyReducer, {
    author: initialAuthor,
    error: null,
    failedRequest: null,
    feedback: null,
    postContent: initialContent,
    recovery: null,
    result: null,
    routing: null,
    source: initialSource ?? pagePost ?? null,
    step: 'input',
    tone: 'add-value',
  });
  const {
    author,
    error,
    failedRequest,
    feedback,
    postContent,
    recovery,
    result,
    routing,
    source,
    step,
    tone,
  } = state;

  // The menu on a post hands that post over; the page's own copy of it, when
  // it is the same post, also carries the avatar and handle.
  useEffect(() => {
    if (!initialContent) return;
    const current = usePlatformStore.getState().pageContext.post;
    dispatch({
      payload:
        current?.text === initialContent
          ? current
          : {
              authorName: initialAuthor || undefined,
              text: initialContent,
              url: initialUrl,
            },
      type: 'SET_SOURCE',
    });
  }, [initialContent, initialAuthor, initialUrl]);

  // Following the active tab: each post the user opens becomes the one to
  // reply to, and leaving posts for a feed clears it.
  const pagePostKey = pagePost ? `${pagePost.url}\n${pagePost.text}` : '';
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the post and page, not the object identity
  useEffect(() => {
    if (!pagePost && !pageUrl) return;
    dispatch({ payload: pagePost ?? null, type: 'SET_SOURCE' });
  }, [pagePostKey, pageUrl]);

  async function handleGenerate(): Promise<void> {
    if (!postContent.trim()) {
      dispatch({ payload: 'Add a post to reply to first.', type: 'FAILED' });
      return;
    }
    if (!platform) {
      dispatch({
        payload: 'Open a post on a supported site to reply to it.',
        type: 'FAILED',
      });
      return;
    }
    await requestReplies(
      {
        author,
        platform,
        postContent,
        requestKey: crypto.randomUUID(),
        tone,
      },
      false,
    );
  }

  async function requestReplies(
    request: FailedReplyRequest,
    isRetry: boolean,
  ): Promise<void> {
    dispatch({ type: 'LOADING' });
    try {
      const response: ReplyVariantsResponse | undefined =
        await chrome.runtime.sendMessage({
          event: 'generateReplyVariants',
          platform: request.platform,
          postAuthor: request.author.trim() || undefined,
          postContent: request.postContent,
          requestKey: request.requestKey,
          ...(isRetry ? { retry: true } : {}),
          tone: request.tone,
        });
      if (!response || 'error' in response) {
        const failure = response && 'error' in response ? response : null;
        dispatch({
          failedRequest: failure?.recovery?.canRetry ? request : undefined,
          payload: failure?.error ?? 'Failed to generate replies',
          recovery: failure?.recovery,
          type: 'FAILED',
        });
        return;
      }
      dispatch({
        payload: response.result,
        postContent: request.postContent,
        routing: response.routing ?? null,
        type: 'RESULT',
      });
    } catch (err) {
      logger.error('Reply generation error', err);
      dispatch({
        payload:
          err instanceof Error ? err.message : 'Failed to generate replies',
        type: 'FAILED',
      });
    }
  }

  async function handleInsert(text: string, index: number): Promise<void> {
    try {
      const response: { error?: string; success?: boolean } | undefined =
        await chrome.runtime.sendMessage({
          event: 'RELAY_TO_CONTENT',
          payload: { content: text, platform, type: 'INSERT_CONTENT' },
        });
      dispatch({
        payload: response?.success
          ? { index, isError: false, message: 'Added to the reply box' }
          : {
              index,
              isError: true,
              message:
                response?.error ??
                'Could not reach the page. Copy the reply instead.',
            },
        type: 'FEEDBACK',
      });
    } catch (err) {
      logger.error('Failed to insert reply text', err);
      dispatch({
        payload: {
          index,
          isError: true,
          message: 'Could not reach the page. Copy the reply instead.',
        },
        type: 'FEEDBACK',
      });
    }
  }

  async function handleCopy(text: string, index: number): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      dispatch({
        payload: { index, isError: false, message: 'Copied' },
        type: 'FEEDBACK',
      });
    } catch (err) {
      logger.error('Failed to copy reply text', err);
      dispatch({
        payload: { index, isError: true, message: 'Could not copy' },
        type: 'FEEDBACK',
      });
    }
  }

  if (step === 'loading') {
    return (
      <div
        role="status"
        className="flex h-full flex-col items-center justify-center gap-3"
      >
        <Spinner className="size-8 text-primary" />
        <p className="text-sm text-muted-foreground">Writing reply options…</p>
      </div>
    );
  }

  if (step === 'result' && result) {
    return (
      <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">
            Reply options
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

        <PostCard isCompact post={source ?? { text: postContent, url: '' }} />

        <RoutingNotice routing={routing} />

        {result.voiceHint ? (
          <p className="text-xs text-muted-foreground">{result.voiceHint}</p>
        ) : null}

        <ul className="flex flex-col gap-2">
          {result.variants.map((variant, index) => (
            <Card
              variant={CardVariant.BORDERED}
              padding={CardPadding.SM}
              as="li"
              key={variant}
            >
              <p className="mb-2 whitespace-pre-wrap text-sm text-foreground">
                {variant}
              </p>
              <p className="mb-2 text-2xs text-muted-foreground">
                {variant.length}/{result.maxCharacters}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  className="flex-1 text-xs"
                  onClick={() => {
                    void handleInsert(variant, index);
                  }}
                >
                  Insert in reply box
                </Button>
                <Button
                  type="button"
                  variant={ButtonVariant.SECONDARY}
                  className="flex-1 text-xs"
                  onClick={() => {
                    void handleCopy(variant, index);
                  }}
                >
                  Copy
                </Button>
              </div>
              {feedback?.index === index ? (
                <p
                  role={feedback.isError ? 'alert' : 'status'}
                  className={
                    feedback.isError
                      ? 'mt-2 text-xs text-destructive'
                      : 'mt-2 text-xs text-muted-foreground'
                  }
                >
                  {feedback.message}
                </p>
              ) : null}
            </Card>
          ))}
        </ul>

        <Button
          type="button"
          variant={ButtonVariant.SECONDARY}
          onClick={() => {
            void handleGenerate();
          }}
          className="mt-auto"
        >
          Generate more
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {error && (
        <Alert size="sm" variant="destructive">
          {error}
        </Alert>
      )}

      <RecoveryActions
        recovery={recovery}
        onRetry={() => {
          if (failedRequest) void requestReplies(failedRequest, true);
        }}
      />

      {source ? (
        <section aria-label="Replying to" className="flex flex-col gap-2">
          <h2 className="text-xs font-medium text-muted-foreground">
            Replying to
          </h2>
          <PostCard post={source} />
        </section>
      ) : (
        <div className="flex flex-col gap-2">
          <Label
            className="text-xs text-muted-foreground"
            htmlFor="reply-post-content"
          >
            Open a post on X to reply to it, or paste one here
          </Label>
          <Textarea
            id="reply-post-content"
            value={postContent}
            onChange={(e) =>
              dispatch({ payload: e.target.value, type: 'SET_POST_CONTENT' })
            }
            placeholder="Paste the post…"
            rows={5}
            className="resize-none"
          />
          <Input
            aria-label="Author (optional)"
            type="text"
            value={author}
            onChange={(e) =>
              dispatch({ payload: e.target.value, type: 'SET_AUTHOR' })
            }
            placeholder="@author (optional)"
          />
        </div>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-xs font-medium text-muted-foreground">
          Tone
        </legend>
        <SegmentedControl
          appearance="chip"
          ariaLabel="Tone"
          onValueChange={(value) =>
            dispatch({ payload: value, type: 'SET_TONE' })
          }
          options={TONES.map((t) => ({
            label: t.label,
            tooltip: t.description,
            value: t.value,
          }))}
          size="sm"
          value={tone}
        />
      </fieldset>

      <Button
        type="button"
        variant={ButtonVariant.DEFAULT}
        onClick={() => {
          void handleGenerate();
        }}
        disabled={!postContent.trim()}
        className="w-full"
      >
        Generate replies
      </Button>
    </div>
  );
}
