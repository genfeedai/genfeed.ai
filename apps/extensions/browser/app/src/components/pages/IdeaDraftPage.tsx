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
import { type ReactElement, useEffect, useReducer } from 'react';
import { LoadingSpinner } from '~components/ui';
import { authService } from '~services/auth.service';
import { apiEndpoint } from '~services/environment.service';
import type { SocialPlatform } from '~types/extension';
import { logger } from '~utils/logger.util';

interface IdeaDraftPageProps {
  initialContent?: string;
  initialUrl?: string;
  initialPlatform?: SocialPlatform;
}

type SaveStep = 'input' | 'saving' | 'saved';

const PLATFORMS: { value: SocialPlatform; label: string }[] = [
  { label: 'TikTok', value: 'tiktok' },
  { label: 'Twitter / X', value: 'twitter' },
  { label: 'LinkedIn', value: 'linkedin' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'YouTube', value: 'youtube' },
];

function generateTitle(text: string): string {
  // Create a short title from the first sentence / 60 chars
  const first = text.split(/[.\n]/)[0].trim();
  return first.length > 60 ? `${first.slice(0, 57)}…` : first;
}

interface DraftState {
  content: string;
  url: string;
  customTitle: string;
  platform: SocialPlatform;
  step: SaveStep;
  error: string | null;
}

type DraftAction =
  | { type: 'SYNC_PROPS'; content: string; url: string }
  | { type: 'SET_CONTENT'; content: string; autoTitle: string }
  | { type: 'SET_URL'; url: string }
  | { type: 'SET_CUSTOM_TITLE'; title: string }
  | { type: 'SET_PLATFORM'; platform: SocialPlatform }
  | { type: 'SAVE_START' }
  | { type: 'SAVE_SUCCESS' }
  | { type: 'SAVE_ERROR'; error: string }
  | { type: 'RESET'; platform: SocialPlatform };

function draftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case 'SYNC_PROPS':
      return {
        ...state,
        content: action.content || state.content,
        url: action.url || state.url,
      };
    case 'SET_CONTENT':
      return {
        ...state,
        content: action.content,
        customTitle: action.autoTitle,
      };
    case 'SET_URL':
      return { ...state, url: action.url };
    case 'SET_CUSTOM_TITLE':
      return { ...state, customTitle: action.title };
    case 'SET_PLATFORM':
      return { ...state, platform: action.platform };
    case 'SAVE_START':
      return { ...state, error: null, step: 'saving' };
    case 'SAVE_SUCCESS':
      return { ...state, step: 'saved' };
    case 'SAVE_ERROR':
      return { ...state, error: action.error, step: 'input' };
    case 'RESET':
      return {
        content: '',
        customTitle: '',
        error: null,
        platform: action.platform,
        step: 'input',
        url: '',
      };
    default:
      return state;
  }
}

export function IdeaDraftPage({
  initialContent = '',
  initialUrl = '',
  initialPlatform = 'tiktok',
}: IdeaDraftPageProps): ReactElement {
  const [state, dispatch] = useReducer(draftReducer, {
    content: initialContent,
    customTitle: '',
    error: null,
    platform: initialPlatform,
    step: 'input',
    url: initialUrl,
  });

  const { content, customTitle, error, platform, step, url } = state;

  // Derive title: use customTitle if user edited it, otherwise auto-generate from content.
  // customTitle stores the last auto-generated value so we know when to keep auto-updating.
  const autoTitle = generateTitle(content);
  const title =
    customTitle === '' || customTitle === autoTitle ? autoTitle : customTitle;

  // Sync when triggered via keyboard shortcut (props change externally)
  useEffect(() => {
    dispatch({ type: 'SYNC_PROPS', content: initialContent, url: initialUrl });
  }, [initialContent, initialUrl]);

  // Auto-generate title when content changes
  function handleContentChange(val: string): void {
    dispatch({
      type: 'SET_CONTENT',
      autoTitle: generateTitle(val),
      content: val,
    });
  }

  async function handleSave(): Promise<void> {
    if (!content.trim()) {
      dispatch({
        type: 'SAVE_ERROR',
        error: 'Add some content to save as a draft idea.',
      });
      return;
    }

    dispatch({ type: 'SAVE_START' });

    try {
      const token = await authService.getToken();
      if (!token) {
        dispatch({ type: 'SAVE_ERROR', error: 'Sign in first to save ideas.' });
        return;
      }

      const response = await fetch(`${apiEndpoint}/posts`, {
        body: JSON.stringify({
          content,
          platform,
          sourceUrl: url || undefined,
          status: 'draft',
          title: title || generateTitle(content),
        }),
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(
          (err as { message?: string }).message ?? 'Failed to save draft',
        );
      }

      dispatch({ type: 'SAVE_SUCCESS' });
    } catch (err) {
      logger.error('Save idea error', err);
      dispatch({
        type: 'SAVE_ERROR',
        error: err instanceof Error ? err.message : 'Failed to save idea',
      });
    }
  }

  function handleReset(): void {
    dispatch({ type: 'RESET', platform: initialPlatform });
  }

  if (step === 'saving') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <LoadingSpinner size="md" className="text-primary" />
        <p className="text-sm text-muted-foreground">Saving to drafts…</p>
      </div>
    );
  }

  if (step === 'saved') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="text-4xl">✅</div>
        <h2 className="text-sm font-semibold text-foreground">
          Idea saved to drafts!
        </h2>
        <p className="text-xs text-muted-foreground">
          Open the GenFeed app to edit and publish it.
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={ButtonVariant.OUTLINE}
            onClick={handleReset}
          >
            Save another
          </Button>
          <Button
            type="button"
            variant={ButtonVariant.DEFAULT}
            onClick={() =>
              chrome.tabs.create({ url: 'https://app.genfeed.ai/posts' })
            }
            className="shadow"
          >
            Open Drafts →
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <h2 className="text-sm font-semibold text-foreground">Save Idea Draft</h2>

      {error && (
        <div className="rounded bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label
          className="text-xs font-medium text-muted-foreground"
          htmlFor="idea-source-url"
        >
          Source URL (optional)
        </label>
        <Input
          id="idea-source-url"
          type="url"
          value={url}
          onChange={(e) => dispatch({ type: 'SET_URL', url: e.target.value })}
          placeholder="https://..."
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          className="text-xs font-medium text-muted-foreground"
          htmlFor="idea-content"
        >
          Content / Idea
        </label>
        <Textarea
          id="idea-content"
          value={content}
          onChange={(e) => handleContentChange(e.target.value)}
          placeholder="Highlighted text or idea to save…"
          rows={5}
          className="resize-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          className="text-xs font-medium text-muted-foreground"
          htmlFor="idea-title"
        >
          Title
        </label>
        <Input
          id="idea-title"
          type="text"
          value={title}
          onChange={(e) =>
            dispatch({ type: 'SET_CUSTOM_TITLE', title: e.target.value })
          }
          placeholder="Auto-generated from content…"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          className="text-xs font-medium text-muted-foreground"
          htmlFor="idea-platform"
        >
          Platform
        </label>
        <Select
          value={platform}
          onValueChange={(value) =>
            dispatch({
              type: 'SET_PLATFORM',
              platform: value as SocialPlatform,
            })
          }
        >
          <SelectTrigger id="idea-platform">
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
        onClick={handleSave}
        disabled={!content.trim()}
        className="mt-auto"
      >
        Save to Drafts →
      </Button>
    </div>
  );
}
