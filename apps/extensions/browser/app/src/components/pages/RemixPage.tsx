import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { type ReactElement, useReducer } from 'react';
import { LoadingSpinner } from '~components/ui';
import { authService } from '~services/auth.service';
import { apiEndpoint } from '~services/environment.service';
import type { SocialPlatform } from '~types/extension';
import { logger } from '~utils/logger.util';

interface RemixPageProps {
  initialContent?: string;
  initialUrl?: string;
  initialPlatform?: SocialPlatform;
}

type RemixStep = 'input' | 'loading' | 'result';

interface RemixResult {
  title?: string;
  angles?: string[];
  hooks?: string[];
  script?: string;
  rawContent?: string;
}

interface RemixResultViewProps {
  copiedIndex: number | null;
  result: RemixResult;
  onBack: () => void;
  onCopy: (text: string, index: number) => void;
  onSaveDraft: (text: string) => void;
}

interface RemixInputFormProps {
  content: string;
  error: string | null;
  platform: SocialPlatform;
  url: string;
  onContentChange: (value: string) => void;
  onPlatformChange: (value: SocialPlatform) => void;
  onRemix: () => void;
  onUrlChange: (value: string) => void;
}

const PLATFORMS: { value: SocialPlatform; label: string }[] = [
  { label: 'TikTok', value: 'tiktok' },
  { label: 'Twitter / X', value: 'twitter' },
  { label: 'LinkedIn', value: 'linkedin' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'YouTube', value: 'youtube' },
];

function RemixLoadingView(): ReactElement {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <LoadingSpinner size="md" className="text-primary" />
      <p className="text-sm text-muted-foreground">Remixing content…</p>
    </div>
  );
}

function getRemixItems(result: RemixResult): string[] {
  return [
    ...(result.hooks ?? []),
    ...(result.angles ?? []),
    result.script ? result.script : [],
  ].flat();
}

function RemixResultView({
  copiedIndex,
  result,
  onBack,
  onCopy,
  onSaveDraft,
}: RemixResultViewProps): ReactElement {
  const remixItems = getRemixItems(result);

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          {result.title ?? 'Remix Results'}
        </h2>
        <Button
          type="button"
          variant={ButtonVariant.GHOST}
          onClick={onBack}
          className="text-xs"
        >
          ← Back
        </Button>
      </div>

      {remixItems.length > 0 ? (
        <div className="flex flex-col gap-2">
          {remixItems.map((item, i) => (
            <div
              key={item}
              className="rounded-xl border border-border bg-card p-3 text-sm text-foreground"
            >
              <p className="mb-2">{item}</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={ButtonVariant.GHOST}
                  onClick={() => onCopy(item, i)}
                  className="flex-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20"
                >
                  {copiedIndex === i ? '✓ Copied' : 'Copy'}
                </Button>
                <Button
                  type="button"
                  variant={ButtonVariant.GHOST}
                  onClick={() => onSaveDraft(item)}
                  className="flex-1 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/80"
                >
                  Save Draft
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-sm text-foreground whitespace-pre-wrap">
            {result.rawContent}
          </p>
          <Button
            type="button"
            variant={ButtonVariant.GHOST}
            onClick={() => onCopy(result.rawContent ?? '', 0)}
            className="mt-2 w-full rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20"
          >
            {copiedIndex === 0 ? '✓ Copied' : 'Copy'}
          </Button>
        </div>
      )}
    </div>
  );
}

function RemixInputForm({
  content,
  error,
  platform,
  url,
  onContentChange,
  onPlatformChange,
  onRemix,
  onUrlChange,
}: RemixInputFormProps): ReactElement {
  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <h2 className="text-sm font-semibold text-foreground">Remix Content</h2>

      {error && (
        <div className="rounded bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label
          className="text-xs font-medium text-muted-foreground"
          htmlFor="remix-source-url"
        >
          Source URL (optional)
        </label>
        <Input
          id="remix-source-url"
          type="url"
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="https://..."
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          className="text-xs font-medium text-muted-foreground"
          htmlFor="remix-content"
        >
          Content to remix
        </label>
        <Textarea
          id="remix-content"
          value={content}
          onChange={(e) => onContentChange(e.target.value)}
          placeholder="Paste or type the content you want to remix…"
          rows={6}
          className="resize-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          className="text-xs font-medium text-muted-foreground"
          htmlFor="remix-platform"
        >
          Target platform
        </label>
        <Select value={platform} onValueChange={onPlatformChange}>
          <SelectTrigger id="remix-platform">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PLATFORMS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        type="button"
        variant={ButtonVariant.DEFAULT}
        onClick={onRemix}
        disabled={!content.trim()}
        className="mt-auto"
      >
        Remix →
      </Button>
    </div>
  );
}

interface RemixState {
  content: string;
  url: string;
  platform: SocialPlatform;
  step: RemixStep;
  result: RemixResult | null;
  error: string | null;
  copiedIndex: number | null;
}

type RemixAction =
  | { type: 'SET_CONTENT'; payload: string }
  | { type: 'SET_URL'; payload: string }
  | { type: 'SET_PLATFORM'; payload: SocialPlatform }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'START_LOADING' }
  | { type: 'SET_RESULT'; payload: RemixResult }
  | { type: 'RESET_TO_INPUT' }
  | { type: 'SET_COPIED_INDEX'; payload: number | null };

function remixReducer(state: RemixState, action: RemixAction): RemixState {
  switch (action.type) {
    case 'SET_CONTENT':
      return { ...state, content: action.payload };
    case 'SET_URL':
      return { ...state, url: action.payload };
    case 'SET_PLATFORM':
      return { ...state, platform: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'START_LOADING':
      return { ...state, error: null, step: 'loading' };
    case 'SET_RESULT':
      return { ...state, result: action.payload, step: 'result' };
    case 'RESET_TO_INPUT':
      return { ...state, result: null, step: 'input' };
    case 'SET_COPIED_INDEX':
      return { ...state, copiedIndex: action.payload };
    default:
      return state;
  }
}

export function RemixPage({
  initialContent = '',
  initialUrl = '',
  initialPlatform = 'tiktok',
}: RemixPageProps): ReactElement {
  const [state, dispatch] = useReducer(remixReducer, {
    content: initialContent,
    copiedIndex: null,
    error: null,
    platform: initialPlatform,
    result: null,
    step: 'input',
    url: initialUrl,
  });

  const { content, copiedIndex, error, platform, result, step, url } = state;

  async function handleRemix(): Promise<void> {
    if (!content.trim()) {
      dispatch({
        payload: 'Add some content to remix first.',
        type: 'SET_ERROR',
      });
      return;
    }

    dispatch({ type: 'START_LOADING' });

    try {
      const token = await authService.getToken();
      if (!token) {
        dispatch({ payload: 'Sign in first to use Remix.', type: 'SET_ERROR' });
        dispatch({ type: 'RESET_TO_INPUT' });
        return;
      }

      const response = await fetch(`${apiEndpoint}/ingredients`, {
        body: JSON.stringify({
          platform,
          sourceContent: content,
          sourceUrl: url || undefined,
          type: 'remix',
        }),
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });

      if (!response.ok) {
        // Fallback: try /clip-projects/analyze
        const fallback = await fetch(`${apiEndpoint}/clip-projects/analyze`, {
          body: JSON.stringify({
            platform,
            sourceContent: content,
            sourceUrl: url || undefined,
          }),
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
        });

        if (!fallback.ok) {
          const err = await fallback.json().catch(() => ({}));
          throw new Error(
            (err as { message?: string }).message || 'Failed to remix content',
          );
        }

        const data = (await fallback.json()) as {
          angles?: string[];
          hooks?: string[];
          script?: string;
          title?: string;
        };
        dispatch({
          payload: {
            angles: data.angles,
            hooks: data.hooks,
            rawContent: content,
            script: data.script,
            title: data.title,
          },
          type: 'SET_RESULT',
        });
      } else {
        const data = (await response.json()) as {
          angles?: string[];
          hooks?: string[];
          script?: string;
          title?: string;
        };
        dispatch({
          payload: {
            angles: data.angles,
            hooks: data.hooks,
            rawContent: content,
            script: data.script,
            title: data.title,
          },
          type: 'SET_RESULT',
        });
      }
    } catch (err) {
      logger.error('Remix error', err);
      dispatch({
        payload: err instanceof Error ? err.message : 'Failed to remix content',
        type: 'SET_ERROR',
      });
      dispatch({ type: 'RESET_TO_INPUT' });
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
    } catch (copyErr) {
      logger.error('Failed to copy remix text', copyErr);
      dispatch({ payload: 'Failed to copy remix text', type: 'SET_ERROR' });
    }
  }

  async function handleSaveDraft(text: string): Promise<void> {
    try {
      const token = await authService.getToken();
      if (!token) {
        return;
      }

      await fetch(`${apiEndpoint}/posts`, {
        body: JSON.stringify({
          content: text,
          platform,
          sourceUrl: url || undefined,
          status: 'draft',
        }),
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });
    } catch (err) {
      logger.error('Save draft error', err);
    }
  }

  if (step === 'loading') {
    return <RemixLoadingView />;
  }

  if (step === 'result' && result) {
    return (
      <RemixResultView
        copiedIndex={copiedIndex}
        result={result}
        onBack={() => {
          dispatch({ type: 'RESET_TO_INPUT' });
        }}
        onCopy={(text, index) => {
          void handleCopy(text, index);
        }}
        onSaveDraft={(text) => {
          void handleSaveDraft(text);
        }}
      />
    );
  }

  return (
    <RemixInputForm
      content={content}
      error={error}
      platform={platform}
      url={url}
      onContentChange={(value) =>
        dispatch({ payload: value, type: 'SET_CONTENT' })
      }
      onPlatformChange={(value) =>
        dispatch({ payload: value, type: 'SET_PLATFORM' })
      }
      onRemix={() => {
        void handleRemix();
      }}
      onUrlChange={(value) => dispatch({ payload: value, type: 'SET_URL' })}
    />
  );
}
