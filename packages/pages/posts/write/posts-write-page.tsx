'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  ButtonVariant,
  CredentialPlatform,
  PostStatus,
} from '@genfeedai/enums';
import type { ICredential } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { PostsService } from '@services/content/posts.service';
import { ClipboardService } from '@services/core/clipboard.service';
import Card from '@ui/card/Card';
import InsetSurface from '@ui/display/inset-surface/InsetSurface';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { track } from '@vercel/analytics';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  HiArrowPathRoundedSquare,
  HiClipboardDocument,
  HiDocumentText,
  HiSparkles,
} from 'react-icons/hi2';

type Tone = 'professional' | 'casual' | 'viral' | 'educational' | 'humorous';

const TONE_OPTIONS: Array<{ label: string; value: Tone }> = [
  { label: 'Professional', value: 'professional' },
  { label: 'Casual', value: 'casual' },
  { label: 'Viral', value: 'viral' },
  { label: 'Educational', value: 'educational' },
  { label: 'Humorous', value: 'humorous' },
];

const PLATFORM_LABELS: Partial<Record<CredentialPlatform, string>> = {
  [CredentialPlatform.DISCORD]: 'Discord',
  [CredentialPlatform.FACEBOOK]: 'Facebook',
  [CredentialPlatform.INSTAGRAM]: 'Instagram',
  [CredentialPlatform.LINKEDIN]: 'LinkedIn',
  [CredentialPlatform.MEDIUM]: 'Medium',
  [CredentialPlatform.PINTEREST]: 'Pinterest',
  [CredentialPlatform.REDDIT]: 'Reddit',
  [CredentialPlatform.TELEGRAM]: 'Telegram',
  [CredentialPlatform.TIKTOK]: 'TikTok',
  [CredentialPlatform.TWITCH]: 'Twitch',
  [CredentialPlatform.TWITTER]: 'X',
  [CredentialPlatform.YOUTUBE]: 'YouTube',
};

function getCredentialLabel(credential: ICredential): string {
  const platform =
    PLATFORM_LABELS[credential.platform as CredentialPlatform] ??
    credential.platform;
  const handle =
    'externalHandle' in credential && credential.externalHandle
      ? `@${credential.externalHandle}`
      : null;

  return handle ? `${platform} ${handle}` : platform;
}

export default function PostsWritePage() {
  const router = useRouter();
  const { href } = useOrgUrl();
  const searchParams = useSearchParams();
  const { credentials = [] } = useBrand();
  const preselectedIngredientId =
    searchParams.get('ingredientId')?.trim() || '';
  const prefilledDescription = searchParams.get('description')?.trim() || '';
  const prefilledTitle = searchParams.get('title')?.trim() || '';
  const [selectedCredentialId, setSelectedCredentialId] = useState('');
  const [workingTitle, setWorkingTitle] = useState(prefilledTitle);
  const [prompt, setPrompt] = useState('');
  const [localContent, setLocalContent] = useState(prefilledDescription);
  const [tone, setTone] = useState<Tone>('professional');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const clipboardService = useMemo(() => ClipboardService.getInstance(), []);

  const getPostsService = useAuthedService((token: string) =>
    PostsService.getInstance(token),
  );

  const connectedCredentials = useMemo(
    () => credentials.filter((credential) => credential.isConnected),
    [credentials],
  );

  const selectedCredential = useMemo(
    () =>
      connectedCredentials.find(
        (credential) => credential.id === selectedCredentialId,
      ) ?? connectedCredentials[0],
    [connectedCredentials, selectedCredentialId],
  );

  useEffect(() => {
    track('content_write_opened');
  }, []);

  useEffect(() => {
    if (prefilledTitle) {
      setWorkingTitle((currentValue) => currentValue || prefilledTitle);
    }
  }, [prefilledTitle]);

  useEffect(() => {
    if (prefilledDescription) {
      setLocalContent((currentValue) => currentValue || prefilledDescription);
    }
  }, [prefilledDescription]);

  useEffect(() => {
    if (!connectedCredentials.length) {
      setSelectedCredentialId('');
      return;
    }

    if (
      !selectedCredentialId ||
      !connectedCredentials.some(
        (credential) => credential.id === selectedCredentialId,
      )
    ) {
      setSelectedCredentialId(connectedCredentials[0]?.id ?? '');
    }
  }, [connectedCredentials, selectedCredentialId]);

  const handleStartBlankDraft = async () => {
    if (!selectedCredential) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const postsService = await getPostsService();
      const createdPost = await postsService.post({
        credential: selectedCredential.id as unknown as ICredential,
        description: localContent.trim() || prompt.trim() || 'Draft',
        ingredients: (preselectedIngredientId
          ? [preselectedIngredientId]
          : []) as never,
        label: workingTitle.trim() || prefilledTitle || 'Untitled draft',
        status: PostStatus.DRAFT,
      });

      track('content_write_blank_draft_started', {
        credentialId: selectedCredential.id,
        hasPrefilledIngredient: Boolean(preselectedIngredientId),
        platform: selectedCredential.platform,
      });
      router.push(href(`/posts/${createdPost.id}`));
    } catch {
      setError('Failed to create draft. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyDraft = async () => {
    const payload = [workingTitle.trim(), localContent.trim()]
      .filter(Boolean)
      .join('\n\n');

    if (!payload) {
      setError('Add content before copying.');
      return;
    }

    setError(null);
    await clipboardService.copyToClipboard(payload);
  };

  const handleGenerate = async (mode: 'post' | 'thread') => {
    if (!selectedCredential || !prompt.trim()) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const postsService = await getPostsService();
      const generatedPosts =
        mode === 'thread'
          ? await postsService.generateThread({
              count: 5,
              credential: selectedCredential.id,
              tone,
              topic: prompt.trim(),
            })
          : await postsService.generateTweets({
              count: 1,
              credential: selectedCredential.id,
              tone,
              topic: prompt.trim(),
            });

      const rootPost = generatedPosts[0];
      if (!rootPost?.id) {
        throw new Error('Missing generated post');
      }

      track('content_write_prompt_generated', {
        credentialId: selectedCredential.id,
        mode,
        platform: selectedCredential.platform,
        tone,
      });
      router.push(href(`/posts/${rootPost.id}`));
    } catch {
      setError('Failed to generate content. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasConnectedCredentials = connectedCredentials.length > 0;
  const hasPrefilledIngredient = preselectedIngredientId.length > 0;

  return (
    <section className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
      <Card
        bodyClassName="gap-0 p-6"
        className="border-white/10 bg-white/[0.03]"
      >
        <div className="grid gap-5">
          {hasPrefilledIngredient ? (
            <InsetSurface
              className="border-primary/20 bg-primary/10 text-sm text-foreground/80"
              tone="default"
            >
              A generated asset is preselected for supervised review. Save a
              draft in Genfeed to open it directly in the post editor before
              scheduling or publishing.
            </InsetSurface>
          ) : null}
          {!hasConnectedCredentials ? (
            <InsetSurface
              className="border-dashed bg-black/10 text-sm text-foreground/65"
              tone="contrast"
            >
              Post mode is open right away. You can write and copy content now,
              then connect an account later if you want to save or publish
              inside Genfeed.
            </InsetSurface>
          ) : (
            <div className="grid gap-2 text-sm text-foreground/75">
              <span>Account</span>
              <Select
                value={selectedCredentialId}
                onValueChange={setSelectedCredentialId}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {connectedCredentials.map((credential) => (
                    <SelectItem key={credential.id} value={credential.id}>
                      {getCredentialLabel(credential)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-2 text-sm text-foreground/75">
            <span>Working title</span>
            <Input
              value={workingTitle}
              onChange={(event) => setWorkingTitle(event.target.value)}
              placeholder="Optional internal title for the draft"
            />
          </div>

          <label className="grid gap-2 text-sm text-foreground/75">
            <span>Prompt</span>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Describe the post you want to generate..."
              className="min-h-28 rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-foreground outline-none transition focus:border-white/20"
            />
          </label>

          <label className="grid gap-2 text-sm text-foreground/75">
            <span>Draft content</span>
            <textarea
              value={localContent}
              onChange={(event) => setLocalContent(event.target.value)}
              placeholder="Write the post here if you just want a clean composer and a copy button."
              className="min-h-44 rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-foreground outline-none transition focus:border-white/20"
            />
          </label>

          <div className="grid gap-2 text-sm text-foreground/75">
            <span>Tone</span>
            <Select
              value={tone}
              onValueChange={(value) => setTone(value as Tone)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TONE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant={ButtonVariant.UNSTYLED}
              onClick={() => void handleCopyDraft()}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-white/[0.05]"
            >
              <HiClipboardDocument className="h-4 w-4" />
              Copy content
            </Button>
            <Button
              type="button"
              variant={ButtonVariant.UNSTYLED}
              onClick={handleStartBlankDraft}
              disabled={!selectedCredential || isSubmitting}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <HiDocumentText className="h-4 w-4" />
              {isSubmitting ? 'Working...' : 'Save draft in Genfeed'}
            </Button>
            <Button
              type="button"
              variant={ButtonVariant.UNSTYLED}
              onClick={() => void handleGenerate('post')}
              disabled={!selectedCredential || !prompt.trim() || isSubmitting}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <HiSparkles className="h-4 w-4" />
              {isSubmitting ? 'Working...' : 'Generate post in Genfeed'}
            </Button>
            <Button
              type="button"
              variant={ButtonVariant.UNSTYLED}
              onClick={() => void handleGenerate('thread')}
              disabled={!selectedCredential || !prompt.trim() || isSubmitting}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <HiArrowPathRoundedSquare className="h-4 w-4" />
              {isSubmitting ? 'Working...' : 'Generate thread in Genfeed'}
            </Button>
          </div>
        </div>
      </Card>

      <Card
        bodyClassName="gap-0 p-6"
        className="border-white/10 bg-white/[0.03]"
      >
        <h2 className="text-lg font-medium">How post mode works</h2>
        <div className="mt-4 space-y-4 text-sm text-foreground/65">
          <div>
            <p className="font-medium text-foreground">1. Write first</p>
            <p className="mt-1">
              Draft directly in the composer and copy it anywhere, even if you
              are not publishing through Genfeed.
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground">
              2. Connect only if needed
            </p>
            <p className="mt-1">
              Account selection is only required when you want Genfeed to save
              or generate a real social post record.
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground">3. Refine in editor</p>
            <p className="mt-1">
              Saved or generated posts still land in the existing post editor
              for richer editing, media, and scheduling.
            </p>
          </div>
        </div>
      </Card>
    </section>
  );
}
