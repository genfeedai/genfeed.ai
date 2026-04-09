'use client';

import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Prompt } from '@models/content/prompt.model';
import { useConfirmDeleteModal } from '@providers/global-modals/global-modals.provider';
import { PagesService } from '@services/content/pages.service';
import { PromptsService } from '@services/content/prompts.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Card from '@ui/card/Card';
import CardEmpty from '@ui/card/empty/CardEmpty';
import Badge from '@ui/display/badge/Badge';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Button } from '@ui/primitives/button';
import { Dropdown } from '@ui/primitives/dropdown';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { HiEllipsisVertical, HiSparkles, HiTrash } from 'react-icons/hi2';

const PROMPT_SKELETON_KEYS = [
  'prompt-skeleton-1',
  'prompt-skeleton-2',
  'prompt-skeleton-3',
  'prompt-skeleton-4',
] as const;

export default function PromptsPage() {
  const searchParams = useSearchParams();
  const searchParamsString = searchParams?.toString() ?? '';
  const parsedSearchParams = useMemo(
    () => new URLSearchParams(searchParamsString),
    [searchParamsString],
  );
  const currentPage = Number(parsedSearchParams.get('page')) || 1;

  const getPromptsService = useAuthedService((token: string) =>
    PromptsService.getInstance(token),
  );
  const { openConfirmDelete } = useConfirmDeleteModal();

  const notificationsService = NotificationsService.getInstance();

  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadPrompts = useCallback(async () => {
    setIsLoading(true);

    try {
      const service = await getPromptsService();
      const fetchedPrompts = await service.findAll({
        limit: ITEMS_PER_PAGE,
        page: currentPage,
        sort: 'createdAt: -1',
      });

      setPrompts(fetchedPrompts);
      logger.info('Loaded prompts', { count: fetchedPrompts.length });
    } catch (error) {
      logger.error('Failed to load prompts', error);
      notificationsService.error('Failed to load prompts');
    } finally {
      setIsLoading(false);
    }
  }, [getPromptsService, notificationsService, currentPage]);

  useEffect(() => {
    PagesService.setTotalPages(1);
    PagesService.setTotalDocs(0);
    PagesService.setCurrentPage(1);
  }, []);

  useEffect(() => {
    loadPrompts();
  }, [loadPrompts]);

  const handleDelete = useCallback(
    (prompt: Prompt) => {
      openConfirmDelete({
        entity: {
          id: prompt.id,
          label: prompt.label || 'Untitled Prompt',
        },
        entityName: 'prompt',
        onConfirm: async () => {
          try {
            const service = await getPromptsService();
            await service.delete(prompt.id);

            setPrompts((prev) => prev.filter((p) => p.id !== prompt.id));
            notificationsService.success('Prompt deleted');
          } catch (error) {
            logger.error('Failed to delete prompt', error);
            notificationsService.error('Failed to delete prompt');
          }
        },
      });
    },
    [openConfirmDelete, getPromptsService, notificationsService],
  );

  const handleEnhance = useCallback(
    async (id: string) => {
      try {
        const service = await getPromptsService();
        const enhanced = await service.postEnhance(id);

        setPrompts((prev) => prev.map((p) => (p.id === id ? enhanced : p)));
        notificationsService.success('Prompt enhanced');
      } catch (error) {
        logger.error('Failed to enhance prompt', error);
        notificationsService.error('Failed to enhance prompt');
      }
    },
    [getPromptsService, notificationsService],
  );

  if (isLoading) {
    return (
      <div className="grid gap-4">
        {PROMPT_SKELETON_KEYS.map((key) => (
          <SkeletonCard key={key} showImage={false} />
        ))}
      </div>
    );
  }

  return (
    <WorkspaceSurface
      title="Saved Prompts"
      tone="muted"
      data-testid="content-prompts-surface"
    >
      <div className="grid gap-4">
        {prompts.length === 0 ? (
          <CardEmpty label="No prompts found" />
        ) : (
          <>
            {prompts.map((prompt) => (
              <Card key={prompt.id}>
                <div className="p-6">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Badge variant="outline" className="capitalize">
                          {prompt.status}
                        </Badge>
                        {prompt.category && (
                          <Badge variant="info" className="capitalize">
                            {prompt.category}
                          </Badge>
                        )}
                        {prompt.model && (
                          <span className="text-xs text-foreground/60">
                            {prompt.model}
                          </span>
                        )}
                      </div>

                      {prompt.label && (
                        <h3 className="text-lg font-semibold mb-2">
                          {prompt.label}
                        </h3>
                      )}

                      {prompt.description && (
                        <p className="text-foreground/70 mb-3">
                          {prompt.description}
                        </p>
                      )}

                      <div className="mb-3">
                        <p className="font-medium mb-1">Original:</p>
                        <p className="text-foreground/80">{prompt.original}</p>
                      </div>

                      {prompt.enhanced && (
                        <div className="mb-3">
                          <p className="font-medium mb-1">Enhanced:</p>
                          <p className="text-foreground/80">
                            {prompt.enhanced}
                          </p>
                        </div>
                      )}

                      <div className="flex items-center gap-4 text-sm text-foreground/60">
                        {prompt.style && <span>Style: {prompt.style}</span>}
                        {prompt.mood && <span>Mood: {prompt.mood}</span>}
                        {prompt.duration && <span>{prompt.duration}s</span>}
                        {prompt.ratio && <span>{prompt.ratio}</span>}
                      </div>
                    </div>

                    <Dropdown
                      trigger={
                        <Button
                          variant={ButtonVariant.GHOST}
                          size={ButtonSize.ICON}
                        >
                          <HiEllipsisVertical className="w-4 h-4" />
                        </Button>
                      }
                      usePortal
                    >
                      <ul className="menu p-0">
                        {!prompt.enhanced && (
                          <li>
                            <Button
                              variant={ButtonVariant.UNSTYLED}
                              withWrapper={false}
                              onClick={() =>
                                prompt.id && handleEnhance(prompt.id)
                              }
                            >
                              <HiSparkles className="w-4 h-4" />
                              Enhance
                            </Button>
                          </li>
                        )}
                        <li>
                          <Button
                            variant={ButtonVariant.UNSTYLED}
                            withWrapper={false}
                            className="text-error"
                            onClick={() => prompt.id && handleDelete(prompt)}
                          >
                            <HiTrash className="w-4 h-4" />
                            Delete
                          </Button>
                        </li>
                      </ul>
                    </Dropdown>
                  </div>
                </div>
              </Card>
            ))}

            <div className="mt-4">
              <AutoPagination showTotal totalLabel="prompts" />
            </div>
          </>
        )}
      </div>
    </WorkspaceSurface>
  );
}
