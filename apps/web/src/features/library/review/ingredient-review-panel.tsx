'use client';

import {
  ButtonSize,
  ButtonVariant,
  CardGap,
  CardPadding,
  CardVariant,
  LibraryReviewState,
} from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import {
  type Task,
  TasksService,
} from '@genfeedai/services/management/tasks.service';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useQueryClient } from '@tanstack/react-query';
import Card from '@ui/card/Card';
import { Avatar } from '@ui/primitives/avatar';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { buttonVariants } from '@ui/primitives/button.variants';
import { Textarea } from '@ui/primitives/textarea';
import { Check, ExternalLink, MessageSquare, UserCheck, X } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useAgentThreadMembers } from '@/components/workspace-shell/use-agent-thread-members';
import { dispatchLibraryAssetsRefresh } from '@/features/ingredients/hooks/library-assets-refresh';
import LibraryReviewBadge from './library-review-badge';
import RequestReviewDialog from './request-review-dialog';
import ReviewThread from './review-thread';
import {
  INGREDIENT_REVIEW_REQUESTS_QUERY_KEY,
  useIngredientReviewRequests,
} from './use-ingredient-review';

const PENDING = 'pending_approval';
const APPROVED = 'approved';
const CHANGES_REQUESTED = 'changes_requested';

/** The same rule the Library uses: one asset, every request summed. */
function summarize(requests: readonly Task[]): LibraryReviewState | null {
  const states = new Set(requests.map((request) => request.reviewState));
  if (states.has(CHANGES_REQUESTED)) {
    return LibraryReviewState.CHANGES_REQUESTED;
  }
  if (states.has(PENDING)) {
    return LibraryReviewState.IN_REVIEW;
  }
  return states.has(APPROVED) ? LibraryReviewState.APPROVED : null;
}

/**
 * Teammate review on the asset context panel: ask people to review, see who
 * answered, and, when the viewer was asked, approve or ask for changes with a
 * comment. The conversation itself is the thread each request opens.
 */
export default function IngredientReviewPanel({
  ingredient,
}: {
  ingredient: IIngredient;
}) {
  const translate = useTranslations('pages.library.teamReview');
  const { href } = useOrgUrl();
  const { userId: viewerUserId } = useAuthIdentity();
  const queryClient = useQueryClient();
  const getTasksService = useAuthedService((token: string) =>
    TasksService.getInstance(token),
  );
  const { requests } = useIngredientReviewRequests(ingredient.id);
  const { membersById } = useAgentThreadMembers(requests.length > 0);
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [isAskingChanges, setIsAskingChanges] = useState(false);
  const [changesNote, setChangesNote] = useState('');
  const [isDeciding, setIsDeciding] = useState(false);
  const [activeThreadRequestId, setActiveThreadRequestId] = useState<
    string | null
  >(null);

  const openRequests = useMemo(
    () => requests.filter((request) => request.reviewState !== 'dismissed'),
    [requests],
  );
  const summary =
    openRequests.length > 0
      ? summarize(openRequests)
      : (ingredient.reviewState ?? null);
  const myRequest = openRequests.find(
    (request) =>
      request.assigneeUserId === viewerUserId &&
      request.reviewState === PENDING,
  );
  const threadRequests = useMemo(
    () =>
      openRequests.filter(
        (request) =>
          Boolean(request.planningThreadId) &&
          (request.userId === viewerUserId ||
            request.assigneeUserId === viewerUserId),
      ),
    [openRequests, viewerUserId],
  );
  const activeThreadRequest =
    threadRequests.find((request) => request.id === activeThreadRequestId) ??
    threadRequests.find((request) => request.assigneeUserId === viewerUserId) ??
    threadRequests[0];
  const counterpartId =
    activeThreadRequest?.assigneeUserId === viewerUserId
      ? activeThreadRequest?.userId
      : activeThreadRequest?.assigneeUserId;
  const counterpartName =
    (counterpartId ? membersById.get(counterpartId)?.name : undefined) ??
    translate('teammate');
  const requesterName = myRequest?.userId
    ? membersById.get(myRequest.userId)?.name
    : undefined;

  const decide = async (decision: 'approve' | 'changes') => {
    if (!myRequest) {
      return;
    }
    setIsDeciding(true);
    try {
      const service = await getTasksService();
      if (decision === 'approve') {
        await service.approve(myRequest.id);
      } else {
        await service.requestChanges(myRequest.id, changesNote.trim());
      }
      setIsAskingChanges(false);
      setChangesNote('');
      await queryClient.invalidateQueries({
        queryKey: [INGREDIENT_REVIEW_REQUESTS_QUERY_KEY],
      });
      dispatchLibraryAssetsRefresh({ isListRefresh: true });
    } catch (error: unknown) {
      logger.error('Failed to record a review decision', error);
      NotificationsService.getInstance().error(translate('decisionFailed'));
    } finally {
      setIsDeciding(false);
    }
  };

  return (
    <section aria-label={translate('section')} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-2xs uppercase tracking-[0.12em] text-muted-foreground">
          {translate('section')}
        </h3>
        <LibraryReviewBadge state={summary} />
      </div>

      <Button
        className="w-full"
        onClick={() => setIsRequestOpen(true)}
        textTransform="none"
        variant={ButtonVariant.SECONDARY}
      >
        <UserCheck aria-hidden="true" className="size-4" />
        {translate('request')}
      </Button>

      {myRequest ? (
        <Card
          className="flex flex-col"
          gap={CardGap.SM}
          padding={CardPadding.SM}
          variant={CardVariant.INSET}
        >
          <p className="text-sm">
            {requesterName
              ? translate('askedYouBy', { name: requesterName })
              : translate('askedYou')}
          </p>
          {isAskingChanges ? (
            <>
              <Textarea
                aria-label={translate('changesLabel')}
                onChange={(event) => setChangesNote(event.target.value)}
                placeholder={translate('changesPlaceholder')}
                value={changesNote}
              />
              <div className="flex gap-2">
                <Button
                  isDisabled={!changesNote.trim()}
                  isLoading={isDeciding}
                  onClick={() => {
                    void decide('changes');
                  }}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.DEFAULT}
                >
                  {translate('sendChanges')}
                </Button>
                <Button
                  onClick={() => setIsAskingChanges(false)}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.GHOST}
                >
                  {translate('cancel')}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex gap-2">
              <Button
                isLoading={isDeciding}
                onClick={() => {
                  void decide('approve');
                }}
                size={ButtonSize.SM}
                textTransform="none"
                variant={ButtonVariant.DEFAULT}
              >
                <Check aria-hidden="true" className="size-4" />
                {translate('approve')}
              </Button>
              <Button
                onClick={() => setIsAskingChanges(true)}
                size={ButtonSize.SM}
                textTransform="none"
                variant={ButtonVariant.SECONDARY}
              >
                <X aria-hidden="true" className="size-4" />
                {translate('requestChanges')}
              </Button>
            </div>
          )}
        </Card>
      ) : null}

      {openRequests.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {openRequests.map((request) => {
            const reviewer = request.assigneeUserId
              ? membersById.get(request.assigneeUserId)
              : undefined;
            const name = reviewer?.name ?? translate('teammate');
            return (
              <li className="flex items-center gap-3 py-1" key={request.id}>
                <Avatar name={name} size="sm" src={reviewer?.avatarUrl} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm">{name}</span>
                  {request.requestedChangesReason &&
                  request.reviewState === CHANGES_REQUESTED ? (
                    <span className="truncate text-xs text-muted-foreground">
                      {request.requestedChangesReason}
                    </span>
                  ) : null}
                </div>
                <Badge status={request.reviewState}>
                  {translate(`decision.${request.reviewState}`)}
                </Badge>
                {threadRequests.length > 1 &&
                threadRequests.some((item) => item.id === request.id) ? (
                  <Button
                    ariaLabel={translate('showThread', { name })}
                    isPressed={activeThreadRequest?.id === request.id}
                    onClick={() => setActiveThreadRequestId(request.id)}
                    size={ButtonSize.ICON}
                    variant={ButtonVariant.GHOST}
                  >
                    <MessageSquare aria-hidden="true" className="size-4" />
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {activeThreadRequest?.planningThreadId ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs text-muted-foreground">
              {translate('threadWith', { name: counterpartName })}
            </span>
            <Link
              aria-label={translate('openThread', { name: counterpartName })}
              className={buttonVariants({
                size: ButtonSize.ICON,
                variant: ButtonVariant.GHOST,
              })}
              href={href(
                `${APP_ROUTES.AGENT.ROOT}/${activeThreadRequest.planningThreadId}`,
              )}
            >
              <ExternalLink aria-hidden="true" className="size-4" />
            </Link>
          </div>
          <ReviewThread
            ingredient={ingredient}
            key={activeThreadRequest.planningThreadId}
            threadId={activeThreadRequest.planningThreadId}
          />
        </div>
      ) : null}

      <RequestReviewDialog
        ingredients={[ingredient]}
        isOpen={isRequestOpen}
        onOpenChange={setIsRequestOpen}
      />
    </section>
  );
}
