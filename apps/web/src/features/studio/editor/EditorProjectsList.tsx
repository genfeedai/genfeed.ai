'use client';
import { ButtonVariant, formatEnumLabel } from '@genfeedai/contracts';
import { APP_ROUTES, ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import type { IEditorProject } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { EditorProjectsService } from '@services/editor/editor-projects.service';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import CollectionItemActions from '@ui/collection/CollectionItemActions';
import CollectionList from '@ui/collection/CollectionList';
import { ErrorFallback } from '@ui/error/ErrorFallback';
import Container from '@ui/layout/container/Container';
import { ListRow } from '@ui/lists/list-row/ListRow';
import { ListRowsSkeleton } from '@ui/lists/list-row/ListRowsSkeleton';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { EmptyState } from '@ui/primitives/empty-state';
import Field from '@ui/primitives/field';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import { Film, Pencil, Trash2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { useAdminSearchParam } from '@/components/content/admin-filters/useAdminSearchParam';
import SearchField from '@/components/content/search-field/SearchField';

type EditorProjectsTranslate = ReturnType<typeof useTranslations>;

function formatRelativeTime(
  dateStr: string,
  translate: EditorProjectsTranslate,
): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) {
    return translate('justNow');
  }
  if (diffMins < 60) {
    return translate('minutesAgo', { count: diffMins });
  }
  if (diffHours < 24) {
    return translate('hoursAgo', { count: diffHours });
  }
  if (diffDays < 7) {
    return translate('daysAgo', { count: diffDays });
  }
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

/**
 * The right side of the Editor workspace while no project is open: one list of
 * the brand's projects. A row opens the project; starting one happens in the
 * prompt on the left.
 */
export default function EditorProjectsList() {
  const translate = useTranslations('pages.studioEditor');
  const { href } = useOrgUrl();
  const notificationsService = NotificationsService.getInstance();
  const searchParams = useSearchParams();
  const currentPage = Number(searchParams.get('page')) || 1;
  const { search, setSearch } = useAdminSearchParam();
  const [projects, setProjects] = useState<IEditorProject[] | null>(null);
  const [hasError, setHasError] = useState(false);
  const [renameTarget, setRenameTarget] = useState<IEditorProject | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  const isLoading = projects === null && !hasError;
  const hasProjects = projects !== null && projects.length > 0;

  const getEditorService = useAuthedService((token: string) =>
    EditorProjectsService.getInstance(token),
  );

  const loadProjects = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setProjects(null);
        setHasError(false);
        const service = await getEditorService();
        const pageProjects = await service.findAll(
          {
            limit: ITEMS_PER_PAGE,
            page: currentPage,
            ...(search ? { search } : {}),
          },
          signal,
        );
        if (signal?.aborted) {
          return;
        }
        setProjects(pageProjects);
      } catch (error) {
        if (
          signal?.aborted ||
          (error instanceof Error && error.name === 'AbortError')
        ) {
          return;
        }
        logger.error('Failed to load editor projects', error);
        setHasError(true);
      }
    },
    [currentPage, getEditorService, search],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadProjects(controller.signal);
    return () => controller.abort();
  }, [loadProjects]);

  const handleDelete = useCallback(
    async (projectId: string) => {
      try {
        const service = await getEditorService();
        await service.delete(projectId);
        setProjects((prev) => (prev ?? []).filter((p) => p.id !== projectId));
      } catch (error) {
        logger.error('Failed to delete editor project', {
          error,
          projectId,
        });
        notificationsService.error(translate('deleteFailed'));
      }
    },
    [getEditorService, notificationsService, translate],
  );

  const openRename = useCallback((project: IEditorProject) => {
    setRenameValue(project.name);
    setRenameTarget(project);
  }, []);

  const closeRename = useCallback(() => {
    if (!isRenaming) {
      setRenameTarget(null);
    }
  }, [isRenaming]);

  const handleRename = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const name = renameValue.trim();
      if (!renameTarget || !name || isRenaming) {
        return;
      }
      if (name === renameTarget.name) {
        setRenameTarget(null);
        return;
      }

      const projectId = renameTarget.id;
      setIsRenaming(true);
      try {
        const service = await getEditorService();
        await service.update(projectId, { name });
        setProjects((prev) =>
          (prev ?? []).map((project) =>
            project.id === projectId
              ? { ...project, name, updatedAt: new Date().toISOString() }
              : project,
          ),
        );
        setRenameTarget(null);
      } catch (error) {
        logger.error('Failed to rename editor project', {
          error,
          projectId,
        });
        notificationsService.error(translate('renameFailed'));
      } finally {
        setIsRenaming(false);
      }
    },
    [
      getEditorService,
      isRenaming,
      notificationsService,
      renameTarget,
      renameValue,
      translate,
    ],
  );

  function renderProjectRow(project: IEditorProject) {
    return (
      <ListRow
        density="compact"
        href={href(`${APP_ROUTES.STUDIO.EDITOR}/${project.id}`)}
        key={project.id}
        meta={<span>{formatRelativeTime(project.updatedAt, translate)}</span>}
        title={project.name}
        trailing={
          <div className="flex items-center gap-2">
            {project.status ? (
              <Badge status={project.status.toLowerCase()}>
                {formatEnumLabel(project.status)}
              </Badge>
            ) : null}
            <CollectionItemActions
              overflow={[
                {
                  icon: <Pencil className="size-4" />,
                  id: 'rename',
                  label: translate('rename'),
                  onSelect: () => openRename(project),
                },
                {
                  icon: <Trash2 className="size-4" />,
                  id: 'delete',
                  isDestructive: true,
                  label: translate('delete'),
                  onSelect: () => void handleDelete(project.id),
                },
              ]}
              overflowLabel={translate('projectActions', {
                name: project.name,
              })}
            />
          </div>
        }
      />
    );
  }

  return (
    <Container
      leading={
        <SearchField
          ariaLabel={translate('search')}
          onSearch={setSearch}
          placeholder={translate('search')}
          value={search}
        />
      }
      label={translate('projects')}
      refresh={
        <ButtonRefresh
          isRefreshing={isLoading}
          onClick={() => void loadProjects()}
        />
      }
      titleVisibility="sr-only"
      // The chrome mode is declared once so it stays stable as the list moves
      // through loading, error and loaded.
      moduleChrome
    >
      {isLoading ? (
        <CollectionList data-testid="editor-projects-loading">
          <ListRowsSkeleton rows={3} />
        </CollectionList>
      ) : hasError ? (
        <ErrorFallback
          title={translate('loadFailedTitle')}
          description={translate('loadFailed')}
          resetErrorBoundary={() => void loadProjects()}
        />
      ) : hasProjects ? (
        <div className="flex flex-col gap-4">
          <CollectionList data-testid="editor-projects-all">
            {projects.map(renderProjectRow)}
          </CollectionList>
          <AutoPagination showTotal totalLabel="projects" />
        </div>
      ) : search ? (
        <EmptyState
          surface="card"
          icon={Film}
          title={translate('emptySearch')}
        />
      ) : (
        <EmptyState
          surface="card"
          icon={Film}
          title={translate('emptyTitle')}
          description={translate('emptyDescription')}
        />
      )}

      <Dialog
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            closeRename();
          }
        }}
        open={renameTarget !== null}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{translate('renameTitle')}</DialogTitle>
            <DialogDescription>
              {translate('renameDescription')}
            </DialogDescription>
          </DialogHeader>
          <Form onSubmit={(event) => void handleRename(event)}>
            <Field label={translate('projectName')}>
              <Input
                aria-label={translate('projectName')}
                disabled={isRenaming}
                maxLength={120}
                onChange={(event) => setRenameValue(event.target.value)}
                value={renameValue}
              />
            </Field>
            <DialogFooter>
              <Button
                isDisabled={isRenaming}
                onClick={closeRename}
                variant={ButtonVariant.GHOST}
                withWrapper={false}
              >
                {translate('cancel')}
              </Button>
              <Button
                isDisabled={!renameValue.trim()}
                isLoading={isRenaming}
                type="submit"
                withWrapper={false}
              >
                {translate('save')}
              </Button>
            </DialogFooter>
          </Form>
        </DialogContent>
      </Dialog>
    </Container>
  );
}
