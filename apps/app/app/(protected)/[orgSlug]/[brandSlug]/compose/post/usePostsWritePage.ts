import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  type AgentDraftSuggestionPayload,
  useAgentDraftContext,
} from '@genfeedai/agent';
import type { DesktopContentPlatform } from '@genfeedai/desktop-contracts';
import { PostStatus } from '@genfeedai/enums';
import type { ICredential } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { PostsService } from '@services/content/posts.service';
import { ClipboardService } from '@services/core/clipboard.service';
import { track } from '@vercel/analytics';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getDesktopBridge, isDesktopShell } from '@/lib/desktop/runtime';
import {
  applyDraftSuggestionToText,
  DESKTOP_PLATFORM_OPTIONS,
  type GenerationFormat,
  generateDesktopContent,
  getCharacterLimit,
  getCredentialLabel,
  getFormatOptions,
  joinDraftSegments,
  queueDesktopPostSync,
  SOCIAL_FORMAT_LABELS,
  splitDraftSegments,
  type Tone,
  toDesktopPlatform,
} from './posts-write-page.helpers';

export function usePostsWritePage() {
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

  const handleApplyDraftSuggestion = useCallback(
    (payload: AgentDraftSuggestionPayload) => {
      setLocalContent((currentContent) =>
        applyDraftSuggestionToText(currentContent, payload),
      );
    },
    [],
  );

  useAgentDraftContext({
    body: localContent,
    contentFormat: SOCIAL_FORMAT_LABELS[selectedFormat],
    draftType: selectedFormat === 'thread' ? 'thread' : 'post',
    instructions: prompt,
    onApplySuggestion: handleApplyDraftSuggestion,
    selectionRootId: 'post-compose-workspace',
    title: workingTitle,
  });

  return {
    addDraftSegment,
    canGenerate,
    characterLimit,
    connectedCredentials,
    desktop,
    desktopPlatform,
    draftSegments,
    error,
    formatOptions,
    generatePostLabel,
    handleCopyDraft,
    handleGenerate,
    handleStartBlankDraft,
    hasConnectedCredentials,
    hasPrefilledIngredient,
    isSubmitting,
    localContent,
    prompt,
    removeDraftSegment,
    selectedCredential,
    selectedCredentialId,
    selectedFormat,
    setDesktopPlatform,
    setLocalContent,
    setPrompt,
    setSelectedCredentialId,
    setSelectedFormat,
    setTone,
    setWorkingTitle,
    tone,
    updateDraftSegment,
    workingTitle,
  };
}
