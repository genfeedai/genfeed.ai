import { ButtonVariant } from '@genfeedai/contracts';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type { PostDraftGeneratorProps } from '@genfeedai/props/modals/modal.props';
import { PostsService } from '@genfeedai/services/content/posts.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { Button } from '@ui/primitives/button';
import FormControl from '@ui/primitives/field';
import { Textarea } from '@ui/primitives/textarea';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

export default function PostDraftGenerator({
  platform,
  format,
  isDisabled,
  onGenerate,
}: PostDraftGeneratorProps) {
  const translate = useTranslations('ui.postDraft');
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const requestVersion = useRef(0);
  const getService = useAuthedService(
    useCallback((token: string) => PostsService.getInstance(token), []),
  );
  useEffect(
    () => () => {
      requestVersion.current += 1;
    },
    [],
  );
  const generate = async () => {
    const version = ++requestVersion.current;
    setIsGenerating(true);
    try {
      const service = await getService();
      const result = await service.generateDraftText({
        prompt: prompt.trim(),
        platform,
        format,
      });
      if (version === requestVersion.current) onGenerate(result.description);
    } catch (error) {
      logger.error('Post draft generation failed', error);
      if (version === requestVersion.current)
        NotificationsService.getInstance().error(translate('failed'));
    } finally {
      if (version === requestVersion.current) setIsGenerating(false);
    }
  };
  return (
    <div className="space-y-3">
      <FormControl label={translate('topic')}>
        <Textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={translate('placeholder')}
          isDisabled={isDisabled || isGenerating}
        />
      </FormControl>
      <Button
        type="button"
        label={translate(isGenerating ? 'generating' : 'generate')}
        variant={ButtonVariant.SECONDARY}
        isDisabled={isDisabled || isGenerating || !prompt.trim()}
        onClick={generate}
      />
    </div>
  );
}
