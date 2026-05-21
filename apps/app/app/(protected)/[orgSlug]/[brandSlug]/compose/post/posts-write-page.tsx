'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useAgentDraftContext } from '@genfeedai/agent';
import type {
  DesktopContentPlatform,
  DesktopContentType,
  IDesktopGeneratedContent,
  IGenfeedDesktopBridge,
} from '@genfeedai/desktop-contracts';
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
import { Textarea } from '@ui/primitives/textarea';
import { track } from '@vercel/analytics';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import {
  HiClipboardDocument,
  HiDocumentText,
  HiPlus,
  HiSparkles,
  HiTrash,
} from 'react-icons/hi2';
import { getDesktopBridge, isDesktopShell } from '@/lib/desktop/runtime';

type Tone = 'professional' | 'casual' | 'viral' | 'educational' | 'humorous';
type GenerationFormat = 'post' | 'thread' | 'x-article';

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

const DESKTOP_PLATFORM_OPTIONS: Array<{
  label: string;
  value: DesktopContentPlatform;
}> = [
  { label: 'X', value: 'twitter' },
  { label: 'LinkedIn', value: 'linkedin' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'TikTok', value: 'tiktok' },
  { label: 'YouTube', value: 'youtube' },
];

const SOCIAL_FORMAT_LABELS: Record<GenerationFormat, string> = {
  post: 'Post',
  thread: 'Thread',
  'x-article': 'X Article',
};

const THREAD_DRAFT_SEPARATOR = '\n\n';

function splitDraftSegments(content: string): string[] {
  const segments = content.split(/\n{2,}/).map((segment) => segment.trim());

  return segments.length ? segments : [''];
}

function joinDraftSegments(segments: string[]): string {
  return segments.join(THREAD_DRAFT_SEPARATOR);
}

function getCharacterLimit(
  credential: ICredential | undefined,
  platform: DesktopContentPlatform,
): number | null {
  const activePlatform = credential?.platform
    ? String(credential.platform).toLowerCase()
    : platform;

  if (
    activePlatform === CredentialPlatform.TWITTER ||
    activePlatform === 'twitter'
  ) {
    return 280;
  }

  if (activePlatform === CredentialPlatform.LINKEDIN) {
    return 3000;
  }

  if (activePlatform === CredentialPlatform.INSTAGRAM) {
    return 2200;
  }

  return null;
}

function toDesktopPlatform(
  platform?: CredentialPlatform | string,
): DesktopContentPlatform {
  const value = String(platform ?? '').toLowerCase();

  return DESKTOP_PLATFORM_OPTIONS.some((option) => option.value === value)
    ? (value as DesktopContentPlatform)
    : 'twitter';
}

function getDesktopContentType(mode: 'post' | 'thread'): DesktopContentType {
  return mode === 'thread' ? 'thread' : 'caption';
}

function isXPlatform(platform?: CredentialPlatform | string): boolean {
  return String(platform ?? '').toLowerCase() === CredentialPlatform.TWITTER;
}

function isThreadsPlatform(platform?: CredentialPlatform | string): boolean {
  return String(platform ?? '').toLowerCase() === CredentialPlatform.THREADS;
}

function getFormatOptions(
  credential: ICredential | undefined,
  isDesktop: boolean,
): Array<{ label: string; value: GenerationFormat }> {
  if (!credential) {
    return isDesktop
      ? [
          { label: SOCIAL_FORMAT_LABELS.post, value: 'post' },
          { label: SOCIAL_FORMAT_LABELS.thread, value: 'thread' },
        ]
      : [{ label: SOCIAL_FORMAT_LABELS.post, value: 'post' }];
  }

  if (isXPlatform(credential.platform)) {
    return [
      { label: SOCIAL_FORMAT_LABELS.post, value: 'post' },
      { label: SOCIAL_FORMAT_LABELS.thread, value: 'thread' },
      { label: SOCIAL_FORMAT_LABELS['x-article'], value: 'x-article' },
    ];
  }

  if (isThreadsPlatform(credential.platform)) {
    return [
      { label: SOCIAL_FORMAT_LABELS.post, value: 'post' },
      { label: SOCIAL_FORMAT_LABELS.thread, value: 'thread' },
    ];
  }

  return [{ label: SOCIAL_FORMAT_LABELS.post, value: 'post' }];
}

function getFormatConstraintLabel(
  credential: ICredential | undefined,
  format: GenerationFormat,
): string {
  const platform = credential?.platform;

  if (isXPlatform(platform) && format === 'x-article') {
    return 'Copy-only X Article export';
  }

  if (isXPlatform(platform)) {
    return '280 weighted characters per post';
  }

  if (String(platform ?? '').toLowerCase() === CredentialPlatform.INSTAGRAM) {
    return 'Caption-ready account context';
  }

  if (String(platform ?? '').toLowerCase() === CredentialPlatform.YOUTUBE) {
    return 'Long-form platform copy context';
  }

  return 'Account-aware draft context';
}

function getFormatPublishabilityLabel(format: GenerationFormat): string {
  return format === 'x-article' ? 'Copy only' : 'Publishable';
}

async function generateDesktopContent(params: {
  bridge: IGenfeedDesktopBridge;
  mode: 'post' | 'thread';
  platform: DesktopContentPlatform;
  prompt: string;
  tone: Tone;
}): Promise<IDesktopGeneratedContent> {
  const promptWithTone = [`Tone: ${params.tone}`, params.prompt].join('\n');

  return params.bridge.cloud.generateContent({
    platform: params.platform,
    prompt: promptWithTone,
    publishIntent: 'review',
    type: getDesktopContentType(params.mode),
  });
}

async function queueDesktopPostSync(params: {
  bridge: IGenfeedDesktopBridge;
  generated: IDesktopGeneratedContent;
  mode: 'post' | 'thread';
  prompt: string;
  title: string;
}): Promise<void> {
  await params.bridge.sync.queueJob(
    'post-draft',
    JSON.stringify({
      content: params.generated.content,
      generatedId: params.generated.id,
      mode: params.mode,
      platform: params.generated.platform,
      prompt: params.prompt,
      title: params.title,
      type: params.generated.type,
    }),
  );
}

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

function PostsWritePageContent() {
  const { push } = useRouter();
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
  const [desktopPlatform, setDesktopPlatform] =
    useState<DesktopContentPlatform>('twitter');
  const [selectedFormat, setSelectedFormat] =
    useState<GenerationFormat>('post');
  const [tone, setTone] = useState<Tone>('professional');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const clipboardService = useMemo(() => ClipboardService.getInstance(), []);
  const desktop = isDesktopShell();

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

  useEffect(() => {
    if (!selectedCredential?.platform) {
      return;
    }

    setDesktopPlatform(toDesktopPlatform(selectedCredential.platform));
  }, [selectedCredential?.platform]);

  const formatOptions = useMemo(
    () => getFormatOptions(selectedCredential, desktop),
    [selectedCredential, desktop],
  );

  useEffect(() => {
    if (!formatOptions.some((option) => option.value === selectedFormat)) {
      setSelectedFormat(formatOptions[0]?.value ?? 'post');
    }
  }, [formatOptions, selectedFormat]);

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
      push(href(`/posts/${createdPost.id}`));
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

  const handleGenerate = async (mode: GenerationFormat) => {
    const desktopBridge = desktop ? getDesktopBridge() : null;

    if ((!selectedCredential && !desktopBridge) || !prompt.trim()) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      if (mode === 'x-article') {
        if (!selectedCredential) {
          return;
        }

        const params = new URLSearchParams({
          credentialId: selectedCredential.id,
          prompt: prompt.trim(),
          type: 'x-article',
        });
        push(href(`/compose/article?${params.toString()}`));
        return;
      }

      if (!selectedCredential && desktopBridge) {
        const generated = await generateDesktopContent({
          bridge: desktopBridge,
          mode,
          platform: desktopPlatform,
          prompt: prompt.trim(),
          tone,
        });
        const nextTitle =
          workingTitle.trim() ||
          `${DESKTOP_PLATFORM_OPTIONS.find((option) => option.value === desktopPlatform)?.label ?? 'Desktop'} ${mode}`;

        setLocalContent(generated.content);
        setWorkingTitle(nextTitle);
        await queueDesktopPostSync({
          bridge: desktopBridge,
          generated,
          mode,
          prompt: prompt.trim(),
          title: nextTitle,
        }).catch(() => undefined);
        track('content_write_prompt_generated', {
          mode,
          platform: desktopPlatform,
          source: 'desktop-ipc',
          tone,
        });
        return;
      }

      if (!selectedCredential) {
        return;
      }

      let generatedPosts: Awaited<
        ReturnType<PostsService['generateAccountContent']>
      >;

      try {
        const postsService = await getPostsService();
        generatedPosts = await postsService.generateAccountContent({
          count: mode === 'thread' ? 5 : 1,
          credential: selectedCredential.id,
          format: mode,
          tone,
          topic: prompt.trim(),
        });
      } catch (cloudError) {
        if (!desktopBridge) {
          throw cloudError;
        }

        const generated = await generateDesktopContent({
          bridge: desktopBridge,
          mode,
          platform: toDesktopPlatform(selectedCredential.platform),
          prompt: prompt.trim(),
          tone,
        });
        const nextTitle =
          workingTitle.trim() ||
          `${getCredentialLabel(selectedCredential)} ${mode}`;

        setLocalContent(generated.content);
        setWorkingTitle(nextTitle);
        await queueDesktopPostSync({
          bridge: desktopBridge,
          generated,
          mode,
          prompt: prompt.trim(),
          title: nextTitle,
        }).catch(() => undefined);
        track('content_write_prompt_generated', {
          credentialId: selectedCredential.id,
          mode,
          platform: selectedCredential.platform,
          source: 'desktop-ipc-fallback',
          tone,
        });
        return;
      }

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
      push(href(`/posts/${rootPost.id}`));
    } catch {
      setError('Failed to generate content. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasConnectedCredentials = connectedCredentials.length > 0;
  const hasPrefilledIngredient = preselectedIngredientId.length > 0;
  const characterLimit = getCharacterLimit(selectedCredential, desktopPlatform);
  const draftSegments = useMemo(
    () => splitDraftSegments(localContent),
    [localContent],
  );
  const canGenerate = Boolean(
    prompt.trim() && !isSubmitting && (selectedCredential || desktop),
  );
  const generatePostLabel =
    desktop && !selectedCredential ? 'Generate' : 'Generate in Genfeed';

  const updateDraftSegment = (index: number, value: string) => {
    setLocalContent((currentContent) => {
      const nextSegments = splitDraftSegments(currentContent);
      nextSegments[index] = value;

      return joinDraftSegments(nextSegments);
    });
  };

  const addDraftSegment = () => {
    setLocalContent((currentContent) =>
      joinDraftSegments([...splitDraftSegments(currentContent), '']),
    );
  };

  const removeDraftSegment = (index: number) => {
    setLocalContent((currentContent) => {
      const nextSegments = splitDraftSegments(currentContent);
      nextSegments.splice(index, 1);

      return joinDraftSegments(nextSegments.length ? nextSegments : ['']);
    });
  };

  useAgentDraftContext({
    body: localContent,
    contentFormat: SOCIAL_FORMAT_LABELS[selectedFormat],
    draftType: selectedFormat === 'thread' ? 'thread' : 'post',
    instructions: prompt,
    selectionRootId: 'post-compose-workspace',
    title: workingTitle,
  });

  return (
    <section
      id="post-compose-workspace"
      className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]"
    >
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
                <SelectTrigger aria-label="Account">
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

          {desktop && !selectedCredential ? (
            <div className="grid gap-2 text-sm text-foreground/75">
              <span>Platform</span>
              <Select
                value={desktopPlatform}
                onValueChange={(value) =>
                  setDesktopPlatform(value as DesktopContentPlatform)
                }
              >
                <SelectTrigger aria-label="Platform">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DESKTOP_PLATFORM_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="grid gap-2 text-sm text-foreground/75">
            <span>Format</span>
            <Select
              value={selectedFormat}
              onValueChange={(value) =>
                setSelectedFormat(value as GenerationFormat)
              }
            >
              <SelectTrigger aria-label="Format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {formatOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedCredential ? (
            <InsetSurface
              className="border-white/10 bg-black/10 text-sm text-foreground/70"
              tone="contrast"
            >
              {getCredentialLabel(selectedCredential)} ·{' '}
              {SOCIAL_FORMAT_LABELS[selectedFormat]} ·{' '}
              {getFormatPublishabilityLabel(selectedFormat)} ·{' '}
              {getFormatConstraintLabel(selectedCredential, selectedFormat)}
            </InsetSurface>
          ) : null}

          <div className="grid gap-2 text-sm text-foreground/75">
            <span>Working title</span>
            <Input
              value={workingTitle}
              onChange={(event) => setWorkingTitle(event.target.value)}
              placeholder="Optional internal title for the draft"
            />
          </div>

          <label
            className="grid gap-2 text-sm text-foreground/75"
            htmlFor="post-compose-prompt"
          >
            <span>Prompt</span>
            <Textarea
              id="post-compose-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Describe the post you want to generate..."
              className="min-h-28 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-foreground outline-none transition focus:border-white/20"
            />
          </label>

          {selectedFormat === 'thread' ? (
            <div className="grid gap-3 text-sm text-foreground/75">
              <div className="flex items-center justify-between gap-3">
                <span>Thread draft</span>
                <Button
                  type="button"
                  variant={ButtonVariant.UNSTYLED}
                  onClick={addDraftSegment}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-white/[0.05]"
                >
                  <HiPlus className="size-3.5" />
                  Add post
                </Button>
              </div>
              <div className="grid gap-3">
                {draftSegments.map((segment, index) => {
                  const count = segment.length;
                  const isOverLimit =
                    characterLimit !== null && count > characterLimit;

                  return (
                    <div
                      key={`thread-segment-${index.toString()}`}
                      className="rounded-xl border border-white/10 bg-black/20 p-3"
                    >
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="text-xs font-medium text-foreground">
                          Post {index + 1}
                        </span>
                        <div className="flex items-center gap-2">
                          <span
                            className={
                              isOverLimit
                                ? 'text-xs text-red-400'
                                : 'text-xs text-foreground/45'
                            }
                          >
                            {characterLimit
                              ? `${count}/${characterLimit}`
                              : `${count} chars`}
                          </span>
                          {draftSegments.length > 1 ? (
                            <Button
                              type="button"
                              variant={ButtonVariant.UNSTYLED}
                              aria-label={`Remove post ${index + 1}`}
                              onClick={() => removeDraftSegment(index)}
                              className="inline-flex size-7 items-center justify-center rounded-lg text-foreground/45 transition hover:bg-white/[0.06] hover:text-foreground"
                            >
                              <HiTrash className="size-3.5" />
                            </Button>
                          ) : null}
                        </div>
                      </div>
                      <Textarea
                        aria-label={`Thread post ${index + 1}`}
                        value={segment}
                        onChange={(event) =>
                          updateDraftSegment(index, event.target.value)
                        }
                        placeholder="Write this part of the thread..."
                        className="min-h-28 border-0 bg-transparent p-0 text-sm text-foreground outline-none placeholder:text-foreground/35 focus-visible:ring-0"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <label
              className="grid gap-2 text-sm text-foreground/75"
              htmlFor="post-compose-draft-content"
            >
              <span>Draft content</span>
              <Textarea
                id="post-compose-draft-content"
                value={localContent}
                onChange={(event) => setLocalContent(event.target.value)}
                placeholder="Write the post here if you just want a clean composer and a copy button."
                className="min-h-44 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-foreground outline-none transition focus:border-white/20"
              />
            </label>
          )}

          <div className="grid gap-2 text-sm text-foreground/75">
            <span>Tone</span>
            <Select
              value={tone}
              onValueChange={(value) => setTone(value as Tone)}
            >
              <SelectTrigger aria-label="Tone">
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
              <HiClipboardDocument className="size-4" />
              Copy content
            </Button>
            <Button
              type="button"
              variant={ButtonVariant.UNSTYLED}
              onClick={handleStartBlankDraft}
              disabled={
                !selectedCredential ||
                isSubmitting ||
                selectedFormat === 'x-article'
              }
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <HiDocumentText className="size-4" />
              {isSubmitting ? 'Working...' : 'Save draft in Genfeed'}
            </Button>
            <Button
              type="button"
              variant={ButtonVariant.UNSTYLED}
              onClick={() => void handleGenerate(selectedFormat)}
              disabled={!canGenerate}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <HiSparkles className="size-4" />
              {isSubmitting
                ? 'Working...'
                : `${generatePostLabel} (${SOCIAL_FORMAT_LABELS[selectedFormat]})`}
            </Button>
          </div>
        </div>
      </Card>

      <Card
        bodyClassName="gap-0 p-6"
        className="border-white/10 bg-white/[0.03]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium">Preview</h2>
            <p className="mt-1 text-sm text-foreground/55">
              {SOCIAL_FORMAT_LABELS[selectedFormat]} for{' '}
              {selectedCredential
                ? getCredentialLabel(selectedCredential)
                : DESKTOP_PLATFORM_OPTIONS.find(
                    (option) => option.value === desktopPlatform,
                  )?.label}
            </p>
          </div>
          <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-foreground/55">
            {draftSegments.length}{' '}
            {draftSegments.length === 1 ? 'post' : 'posts'}
          </span>
        </div>

        <div className="mt-5 grid gap-3">
          {draftSegments.map((segment, index) => {
            const count = segment.length;
            const isOverLimit =
              characterLimit !== null && count > characterLimit;

            return (
              <div
                key={`preview-segment-${index.toString()}`}
                className="rounded-xl border border-white/10 bg-black/20 p-4"
              >
                <div className="mb-3 flex items-center justify-between gap-3 text-xs">
                  <span className="font-medium text-foreground/70">
                    {selectedFormat === 'thread'
                      ? `Post ${index + 1}`
                      : SOCIAL_FORMAT_LABELS[selectedFormat]}
                  </span>
                  <span
                    className={
                      isOverLimit ? 'text-red-400' : 'text-foreground/40'
                    }
                  >
                    {characterLimit ? `${count}/${characterLimit}` : count}
                  </span>
                </div>
                {segment.trim() ? (
                  <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/85">
                    {segment}
                  </p>
                ) : (
                  <p className="text-sm text-foreground/35">
                    Draft preview appears here.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-5 rounded-xl border border-white/10 bg-black/10 p-4 text-sm text-foreground/60">
          <p className="font-medium text-foreground">Agent context</p>
          <p className="mt-1">
            The co-pilot sees the current draft, selected text, format, account,
            and prompt instructions while you write.
          </p>
        </div>
      </Card>
    </section>
  );
}

export default function PostsWritePage() {
  return (
    <Suspense fallback={null}>
      <PostsWritePageContent />
    </Suspense>
  );
}
