'use client';
import { ButtonVariant, formatEnumLabel } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  EMPTY_PAGE_TOTALS,
  ITEMS_PER_PAGE,
} from '@genfeedai/contracts/constants';
import type {
  CreativeAppAgentContext,
  IEditorProject,
  IPaginatedResponse,
} from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { EditorProjectsService } from '@services/editor/editor-projects.service';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import { ErrorFallback } from '@ui/error/ErrorFallback';
import Container from '@ui/layout/container/Container';
import { useCreativeProjectsPresence } from '@ui/layout/creative-app-workspace/CreativeAppWorkspace';
import CreativeProjectsEmptyState from '@ui/layout/creative-app-workspace/CreativeProjectsEmptyState';
import { ListRowsSkeleton } from '@ui/lists/list-row/ListRowsSkeleton';
import { formatThreadTime } from '@ui/lists/thread-list/group-by-recency';
import {
  ThreadListRecencySections,
  ThreadListRow,
  ThreadListSubtitle,
} from '@ui/lists/thread-list/ThreadList';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import Field from '@ui/primitives/field';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import { Film, Pencil, Trash2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useAdminSearchParam } from '@/components/content/admin-filters/useAdminSearchParam';
import SearchField from '@/components/content/search-field/SearchField';
import { useCreativeAppAgentContext } from '@/hooks/agent/use-creative-app-agent-context/use-creative-app-agent-context';

/**
 * The right side of the Editor workspace while no project is open: one list of
 * the brand's projects. A row opens the project; starting one happens in the
 * prompt on the left.
 */
export default function EditorProjectsList() {
  const translate = useTranslations('pages.studioEditor');
  const locale = useLocale();
  const { href } = useOrgUrl();
  const notificationsService = NotificationsService.getInstance();
  const searchParams = useSearchParams();
  const currentPage = Number(searchParams.get('page')) || 1;
  const { search, setSearch } = useAdminSearchParam();
  const [projectsPage, setProjectsPage] =
    useState<IPaginatedResponse<IEditorProject> | null>(null);
  const projects = projectsPage?.items ?? null;
  const pageTotals = projectsPage
    ? { totalDocs: projectsPage.total, totalPages: projectsPage.totalPages }
    : EMPTY_PAGE_TOTALS;
  const [hasError, setHasError] = useState(false);
  const [renameTarget, setRenameTarget] = useState<IEditorProject | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  const isLoading = projects === null && !hasError;
  // The agent hears about the projects on screen once the list has loaded, so
  // a change request is never matched against a half-known list.
  const creativeApp = useMemo<CreativeAppAgentContext | null>(
    () =>
      projects === null || hasError
        ? null
        : {
            app: 'editor',
            projects: projects.map((project) => ({
              id: project.id,
              title: project.name || translate('untitled'),
            })),
          },
    [hasError, projects, translate],
  );
  useCreativeAppAgentContext(creativeApp);
  const hasProjects = projects !== null && projects.length > 0;
  useCreativeProjectsPresence(
    !projectsPage || hasError
      ? 'unknown'
      : projectsPage.total > 0 || hasProjects
        ? 'populated'
        : search
          ? 'unknown'
          : 'empty',
  );

  const getEditorService = useAuthedService((token: string) =>
    EditorProjectsService.getInstance(token),
  );

  const loadProjects = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setProjectsPage(null);
        setHasError(false);
        const service = await getEditorService();
        const pageProjects = await service.findAllPage(
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
        setProjectsPage(pageProjects);
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
        setProjectsPage((current) =>
          current
            ? {
                ...current,
                items: current.items.filter((p) => p.id !== projectId),
                total: Math.max(0, current.total - 1),
              }
            : current,
        );
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
        setProjectsPage((current) =>
          current
            ? {
                ...current,
                items: current.items.map((project) =>
                  project.id === projectId
                    ? { ...project, name, updatedAt: new Date().toISOString() }
                    : project,
                ),
              }
            : current,
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
      <ThreadListRow
        actions={[
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
        actionsLabel={translate('projectActions', { name: project.name })}
        href={href(`${APP_ROUTES.STUDIO.EDITOR}/${project.id}`)}
        subtitle={
          project.status ? (
            <ThreadListSubtitle parts={[formatEnumLabel(project.status)]} />
          ) : undefined
        }
        time={formatThreadTime(project.updatedAt, locale)}
        title={project.name}
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
        <div data-testid="editor-projects-loading">
          <ListRowsSkeleton rows={3} />
        </div>
      ) : hasError ? (
        <ErrorFallback
          title={translate('loadFailedTitle')}
          description={translate('loadFailed')}
          resetErrorBoundary={() => void loadProjects()}
        />
      ) : hasProjects ? (
        <div className="flex flex-col gap-2">
          <div data-testid="editor-projects-all">
            <ThreadListRecencySections
              getDate={(project) => project.updatedAt}
              getKey={(project) => project.id}
              items={projects}
              renderRow={renderProjectRow}
            />
          </div>
          <AutoPagination showTotal totalLabel="projects" totals={pageTotals} />
        </div>
      ) : search ? (
        <CreativeProjectsEmptyState
          icon={Film}
          title={translate('emptySearch')}
        />
      ) : (
        <CreativeProjectsEmptyState
          description={translate('emptyDescription')}
          icon={Film}
          title={translate('emptyTitle')}
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
