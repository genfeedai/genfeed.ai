'use client';

import { IngredientFormat } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { logger } from '@services/core/logger.service';
import { EditorProjectsService } from '@services/editor/editor-projects.service';
import CreativeAppNewPane from '@ui/layout/creative-app-new-pane/CreativeAppNewPane';
import CreativeAppPromptBar from '@ui/layout/creative-app-prompt-bar/CreativeAppPromptBar';
import PromptBarNotice from '@ui/prompt-bars/components/shell/PromptBarNotice';
import PromptBarCompactSelect from '@ui/prompt-bars/components/toolbar/PromptBarCompactSelect';
import PromptBarSendButton from '@ui/prompt-bars/components/toolbar/PromptBarSendButton';
import PromptBarToolbar from '@ui/prompt-bars/components/toolbar/PromptBarToolbar';
import PromptEditor from '@ui/prompt-editor/PromptEditor';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { EditorStarter } from '@/features/studio/props/editor-workspace.props';
import EditorPromptCards from './EditorPromptCards';
import { EDITOR_FORMAT_OPTIONS } from './editor-formats';

/** The project name field takes at most this many characters (as on rename). */
const MAX_NAME_LENGTH = 120;

/**
 * The left side of the Editor workspace while no project is open: a centered
 * prompt with starter cards and the prompt bar. Sending saves an empty
 * timeline named after the prompt, cut for the chosen canvas, and opens it.
 * `?video=` (repeated, in timeline order) starts the timeline from those
 * videos, one clip each, back to back.
 */
export default function EditorNewPane() {
  const t = useTranslations('pages.studioEditor');
  const { href } = useOrgUrl();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sourceVideoIds = searchParams.getAll('video').filter(Boolean);
  const getEditorService = useAuthedService((token: string) =>
    EditorProjectsService.getInstance(token),
  );
  const [name, setName] = useState('');
  const [format, setFormat] = useState<IngredientFormat>(
    IngredientFormat.LANDSCAPE,
  );
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSubmitting = useRef(false);
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const trimmedName = name.trim();
  const isNameTooLong = trimmedName.length > MAX_NAME_LENGTH;
  const canCreate = !isNameTooLong;

  function applyStarter(starter: EditorStarter, title: string) {
    setName(title);
    setFormat(starter.format);
    setError(null);
  }

  async function create() {
    if (isBusy || isSubmitting.current || !canCreate) return;
    isSubmitting.current = true;
    setIsBusy(true);
    setError(null);
    try {
      const service = await getEditorService();
      const canvas =
        EDITOR_FORMAT_OPTIONS.find((option) => option.value === format) ??
        EDITOR_FORMAT_OPTIONS[0];
      const project = await service.create({
        name:
          trimmedName ||
          (sourceVideoIds.length > 0 ? t('videoEdit') : t('untitled')),
        settings: {
          format: canvas.value,
          height: canvas.height,
          width: canvas.width,
        },
        sourceVideoIds,
      });
      if (isMounted.current) {
        router.push(href(`${APP_ROUTES.STUDIO.EDITOR}/${project.id}`));
      }
    } catch (reason) {
      logger.error('Failed to create editor project', reason);
      if (isMounted.current) setError(t('createFailed'));
    } finally {
      isSubmitting.current = false;
      if (isMounted.current) setIsBusy(false);
    }
  }

  return (
    <CreativeAppNewPane
      description={
        sourceVideoIds.length > 0
          ? t('sourceVideos', { count: sourceVideoIds.length })
          : t('heroDescription')
      }
      promptBar={
        <CreativeAppPromptBar
          banner={
            error ? (
              <PromptBarNotice>{error}</PromptBarNotice>
            ) : isNameTooLong ? (
              <PromptBarNotice>
                {t('nameTooLong', { max: MAX_NAME_LENGTH })}
              </PromptBarNotice>
            ) : undefined
          }
          testId="editor-composer"
        >
          <PromptEditor
            ariaLabel={t('projectName')}
            className="min-h-16"
            isDisabled={isBusy}
            onSubmit={() => void create()}
            onValueChange={setName}
            placeholder={t('namePlaceholder')}
            value={name}
          />
          <PromptBarToolbar
            leading={
              <PromptBarCompactSelect
                ariaLabel={t('format')}
                isDisabled={isBusy}
                onChange={(next) => {
                  const option = EDITOR_FORMAT_OPTIONS.find(
                    (candidate) => candidate.value === next,
                  );
                  if (option) setFormat(option.value);
                }}
                options={EDITOR_FORMAT_OPTIONS.map((option) => ({
                  label: option.label,
                  value: option.value,
                }))}
                value={format}
              />
            }
            trailing={
              <PromptBarSendButton
                ariaLabel={t('createProject')}
                isDisabled={isBusy || !canCreate}
                isLoading={isBusy}
                onClick={() => void create()}
                tooltip={t('createProject')}
              />
            }
          />
        </CreativeAppPromptBar>
      }
      title={t('heroTitle')}
    >
      <EditorPromptCards isDisabled={isBusy} onSelect={applyStarter} />
    </CreativeAppNewPane>
  );
}
