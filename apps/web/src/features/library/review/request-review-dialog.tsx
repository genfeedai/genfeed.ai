'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { IngredientReviewRequestsService } from '@services/management/ingredient-review-requests.service';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar } from '@ui/primitives/avatar';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { Textarea } from '@ui/primitives/textarea';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useAgentThreadMembers } from '@/components/workspace-shell/use-agent-thread-members';
import { dispatchLibraryAssetsRefresh } from '@/features/ingredients/hooks/library-assets-refresh';
import {
  INGREDIENT_REVIEW_REQUESTS_QUERY_KEY,
  useIngredientReviewCandidates,
} from './use-ingredient-review';

interface RequestReviewDialogProps {
  /** The assets to ask about; one review request is made per asset and reviewer. */
  ingredients: readonly IIngredient[];
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** Called once the requests were made. */
  onRequested?: () => void;
}

/** One asset per brand is enough to ask the server who reaches that brand. */
function pickRepresentatives(ingredients: readonly IIngredient[]): string[] {
  const byBrand = new Map<string, string>();
  for (const ingredient of ingredients) {
    const key = ingredient.brandId ?? '';
    if (!byBrand.has(key)) {
      byBrand.set(key, ingredient.id);
    }
  }
  return [...byBrand.values()];
}

/**
 * Asks teammates to review one asset or a selection. Each person gets a thread
 * with the asset in it; only people who can reach the asset's brand can be
 * chosen, so the rest are shown but disabled.
 */
export default function RequestReviewDialog({
  ingredients,
  isOpen,
  onOpenChange,
  onRequested,
}: RequestReviewDialogProps) {
  const translate = useTranslations('pages.library.teamReview.dialog');
  const queryClient = useQueryClient();
  const getService = useAuthedService((token: string) =>
    IngredientReviewRequestsService.getInstance(token),
  );
  const { userId: viewerUserId } = useAuthIdentity();
  const { members: roster } = useAgentThreadMembers(isOpen);
  const members = useMemo(
    () => roster.filter((member) => member.userId !== viewerUserId),
    [roster, viewerUserId],
  );
  const representatives = useMemo(
    () => pickRepresentatives(ingredients),
    [ingredients],
  );
  const { reviewerUserIds } = useIngredientReviewCandidates(
    representatives,
    isOpen,
  );
  const [pickedUserIds, setPickedUserIds] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [isSending, setIsSending] = useState(false);

  // The server's list names who may be asked; the roster names who they are.
  const people = useMemo(
    () =>
      reviewerUserIds
        ? members.filter((member) => reviewerUserIds.has(member.userId))
        : [],
    [members, reviewerUserIds],
  );
  const blocked = useMemo(
    () =>
      reviewerUserIds
        ? members.filter((member) => !reviewerUserIds.has(member.userId))
        : [],
    [members, reviewerUserIds],
  );

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setPickedUserIds([]);
      setNote('');
    }
    onOpenChange(next);
  };

  const togglePerson = (userId: string, isChecked: boolean) => {
    setPickedUserIds((current) =>
      isChecked
        ? [...current, userId]
        : current.filter((candidate) => candidate !== userId),
    );
  };

  const send = async () => {
    setIsSending(true);
    try {
      const service = await getService();
      const trimmedNote = note.trim();
      for (const ingredient of ingredients) {
        await service.request(ingredient.id, {
          reviewerUserIds: pickedUserIds,
          ...(trimmedNote ? { note: trimmedNote } : {}),
        });
      }
      await queryClient.invalidateQueries({
        queryKey: [INGREDIENT_REVIEW_REQUESTS_QUERY_KEY],
      });
      dispatchLibraryAssetsRefresh({ isListRefresh: true });
      NotificationsService.getInstance().success(
        translate('sent', { count: ingredients.length }),
      );
      onRequested?.();
      handleOpenChange(false);
    } catch (error: unknown) {
      logger.error('Failed to request a review', error);
      NotificationsService.getInstance().error(translate('failed'));
    } finally {
      setIsSending(false);
    }
  };

  const renderPerson = (
    member: (typeof members)[number],
    isAllowed: boolean,
  ) => (
    <div className="flex items-center gap-3 py-1.5" key={member.userId}>
      <Avatar name={member.name} size="md" src={member.avatarUrl} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{member.name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {isAllowed
            ? member.roleLabel
            : translate('noAccess', { role: member.roleLabel ?? '' })}
        </span>
      </div>
      <Checkbox
        aria-label={translate('ask', { name: member.name })}
        isChecked={pickedUserIds.includes(member.userId)}
        isDisabled={!isAllowed}
        onCheckedChange={(checked) =>
          togglePerson(member.userId, checked === true)
        }
      />
    </div>
  );

  return (
    <Dialog onOpenChange={handleOpenChange} open={isOpen}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>
            {translate('title', { count: ingredients.length })}
          </DialogTitle>
          <DialogDescription>{translate('description')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            {people.map((member) => renderPerson(member, true))}
            {blocked.map((member) => renderPerson(member, false))}
          </div>
          <Textarea
            aria-label={translate('note')}
            onChange={(event) => setNote(event.target.value)}
            placeholder={translate('notePlaceholder')}
            value={note}
          />
        </DialogBody>
        <DialogFooter>
          <Button
            onClick={() => handleOpenChange(false)}
            variant={ButtonVariant.GHOST}
          >
            {translate('cancel')}
          </Button>
          <Button
            isDisabled={pickedUserIds.length === 0}
            isLoading={isSending}
            onClick={() => {
              void send();
            }}
            variant={ButtonVariant.DEFAULT}
          >
            {translate('send')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
