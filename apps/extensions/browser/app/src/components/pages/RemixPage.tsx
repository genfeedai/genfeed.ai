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

const PLATFORMS: { value: SocialPlatform; label: string }[] = [
  { label: 'TikTok', value: 'tiktok' },
  { label: 'Twitter / X', value: 'twitter' },
  { label: 'LinkedIn', value: 'linkedin' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'YouTube', value: 'youtube' },
];

export function RemixPage({
  initialContent = '',
  initialUrl = '',
  initialPlatform = 'tiktok',
}: RemixPageProps): ReactElement {
  const [content, setContent] = useState(initialContent);
  const [url, setUrl] = useState(initialUrl);
  const [platform, setPlatform] = useState<SocialPlatform>(initialPlatform);
  const [step, setStep] = useState<RemixStep>('input');
  const [result, setResult] = useState<RemixResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Sync props when they change (e.g. keyboard shortcut fires with new data)
  useEffect(() => {
    if (initialContent) {
      setContent(initialContent);
    }
    if (initialUrl) {
      setUrl(initialUrl);
    }
  }, [initialContent, initialUrl]);

  async function handleRemix(): Promise<void> {
    if (!content.trim()) {
      setError('Add some content to remix first.');
      return;
    }

    setError(null);
    setStep('loading');

    try {
      const token = await authService.getToken();
      if (!token) {
        setError('Sign in first to use Remix.');
        setStep('input');
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
        setResult({
          angles: data.angles,
          hooks: data.hooks,
          rawContent: content,
          script: data.script,
          title: data.title,
        });
      } else {
        const data = (await response.json()) as {
          angles?: string[];
          hooks?: string[];
          script?: string;
          title?: string;
        };
        setResult({
          angles: data.angles,
          hooks: data.hooks,
          rawContent: content,
          script: data.script,
          title: data.title,
        });
      }

      setStep('result');
    } catch (err) {
      logger.error('Remix error', err);
      setError(err instanceof Error ? err.message : 'Failed to remix content');
      setStep('input');
    }
  }

  function handleCopy(text: string, index: number): void {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
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
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <LoadingSpinner size="md" className="text-primary" />
        <p className="text-sm text-muted-foreground">Remixing content…</p>
      </div>
    );
  }

  if (step === 'result' && result) {
    const remixItems: string[] = [
      ...(result.hooks ?? []),
      ...(result.angles ?? []),
      result.script ? result.script : [],
    ].flat();

    return (
      <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">
            {result.title ?? 'Remix Results'}
          </h2>
          <Button
            type="button"
            variant={ButtonVariant.GHOST}
            onClick={() => {
              setStep('input');
              setResult(null);
            }}
            className="text-xs"
          >
            ← Back
          </Button>
        </div>

        {remixItems.length > 0 ? (
          <div className="flex flex-col gap-2">
            {remixItems.map((item, i) => (
              <div
                key={i}
                className="rounded border border-border bg-card p-3 text-sm text-foreground"
              >
                <p className="mb-2">{item}</p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={ButtonVariant.GHOST}
                    onClick={() => handleCopy(item, i)}
                    className="flex-1 rounded bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20"
                  >
                    {copiedIndex === i ? '✓ Copied' : 'Copy'}
                  </Button>
                  <Button
                    type="button"
                    variant={ButtonVariant.GHOST}
                    onClick={() => handleSaveDraft(item)}
                    className="flex-1 rounded bg-muted px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/80"
                  >
                    Save Draft
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded border border-border bg-card p-3">
            <p className="text-sm text-foreground whitespace-pre-wrap">
              {result.rawContent}
            </p>
            <Button
              type="button"
              variant={ButtonVariant.GHOST}
              onClick={() => handleCopy(result.rawContent ?? '', 0)}
              className="mt-2 w-full rounded bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20"
            >
              {copiedIndex === 0 ? '✓ Copied' : 'Copy'}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <h2 className="text-sm font-semibold text-foreground">Remix Content</h2>

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
          Content to remix
        </label>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Paste or type the content you want to remix…"
          rows={6}
          className="rounded border border-border bg-input px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">
          Target platform
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
        onClick={handleRemix}
        disabled={!content.trim()}
        className="mt-auto rounded shadow"
      >
        Remix →
      </Button>
    </div>
  );
}
