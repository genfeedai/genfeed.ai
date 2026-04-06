import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { type ReactElement, useEffect, useState } from 'react';
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

export function IdeaDraftPage({
  initialContent = '',
  initialUrl = '',
  initialPlatform = 'tiktok',
}: IdeaDraftPageProps): ReactElement {
  const [content, setContent] = useState(initialContent);
  const [url, setUrl] = useState(initialUrl);
  const [title, setTitle] = useState('');
  const [platform, setPlatform] = useState<SocialPlatform>(initialPlatform);
  const [step, setStep] = useState<SaveStep>('input');
  const [error, setError] = useState<string | null>(null);

  // Sync when triggered via keyboard shortcut
  useEffect(() => {
    if (initialContent) {
      setContent(initialContent);
      setTitle(generateTitle(initialContent));
    }
    if (initialUrl) {
      setUrl(initialUrl);
    }
  }, [initialContent, initialUrl]);

  // Auto-generate title when content changes
  function handleContentChange(val: string): void {
    setContent(val);
    if (!title || title === generateTitle(content)) {
      setTitle(generateTitle(val));
    }
  }

  async function handleSave(): Promise<void> {
    if (!content.trim()) {
      setError('Add some content to save as a draft idea.');
      return;
    }

    setError(null);
    setStep('saving');

    try {
      const token = await authService.getToken();
      if (!token) {
        setError('Sign in first to save ideas.');
        setStep('input');
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

      setStep('saved');
    } catch (err) {
      logger.error('Save idea error', err);
      setError(err instanceof Error ? err.message : 'Failed to save idea');
      setStep('input');
    }
  }

  function handleReset(): void {
    setContent('');
    setUrl('');
    setTitle('');
    setPlatform('tiktok');
    setStep('input');
    setError(null);
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
        <label className="text-xs font-medium text-muted-foreground">
          Source URL (optional)
        </label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          className="rounded border border-border bg-input px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">
          Content / Idea
        </label>
        <Textarea
          value={content}
          onChange={(e) => handleContentChange(e.target.value)}
          placeholder="Highlighted text or idea to save…"
          rows={5}
          className="rounded border border-border bg-input px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">
          Title
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Auto-generated from content…"
          className="rounded border border-border bg-input px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">
          Platform
        </label>
        <Select
          value={platform}
          onValueChange={(value) => setPlatform(value as SocialPlatform)}
        >
          <SelectTrigger className="rounded border border-border bg-input px-2 py-1.5 text-sm text-foreground">
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
        className="mt-auto rounded shadow"
      >
        Save to Drafts →
      </Button>
    </div>
  );
}
