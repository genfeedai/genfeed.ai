'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { IBatchItemAssignee } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Member } from '@models/organization/member.model';
import { logger } from '@services/core/logger.service';
import { MembersService } from '@services/organization/members.service';
import { Button } from '@ui/primitives/button';
import { Label } from '@ui/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ReviewPanelItem } from './review-panel.types';

interface ReviewAssignmentMemberOption {
  id: string;
  label: string;
}

interface ReviewAssignmentPanelProps {
  isActioning: boolean;
  item: ReviewPanelItem;
  onAssign: (itemId: string, assigneeId: string) => void;
  onUnassign: (itemId: string) => void;
}

function getMemberOptionLabel(member: Member): string {
  const handle = member.user?.handle?.trim() ?? '';
  const name =
    member.userFullName && member.userFullName !== '-'
      ? member.userFullName
      : '';

  if (name && handle) {
    return `${name} (@${handle})`;
  }

  return name || handle || member.userId;
}

function toMemberOption(member: Member): ReviewAssignmentMemberOption | null {
  if (!member.isActive || member.isDeleted || !member.userId) {
    return null;
  }

  return {
    id: member.userId,
    label: getMemberOptionLabel(member),
  };
}

function formatAssignee(assignee: IBatchItemAssignee): string {
  if (assignee.displayName && assignee.handle) {
    return `${assignee.displayName} (@${assignee.handle})`;
  }

  return assignee.displayName || assignee.handle || assignee.id;
}

export default function ReviewAssignmentPanel({
  isActioning,
  item,
  onAssign,
  onUnassign,
}: ReviewAssignmentPanelProps) {
  const getMembersService = useAuthedService(
    useCallback((token: string) => MembersService.getInstance(token), []),
  );
  const [members, setMembers] = useState<ReviewAssignmentMemberOption[]>([]);
  const [selectedAssigneeId, setSelectedAssigneeId] = useState(
    item.assigneeId ?? '',
  );

  useEffect(() => {
    setSelectedAssigneeId(item.assigneeId ?? '');
  }, [item.assigneeId]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadMembers() {
      try {
        const service = await getMembersService();
        const rows = await service.findAllPages({}, controller.signal);
        if (controller.signal.aborted) {
          return;
        }

        setMembers(
          rows
            .map((member) => toMemberOption(member))
            .filter((option): option is ReviewAssignmentMemberOption =>
              Boolean(option),
            ),
        );
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        logger.error('Load review assignees failed', error);
      }
    }

    void loadMembers();

    return () => {
      controller.abort();
    };
  }, [getMembersService]);

  const currentAssigneeLabel = useMemo(() => {
    if (item.assignee) {
      return formatAssignee(item.assignee);
    }
    if (item.assigneeId) {
      return 'Unavailable member';
    }
    return 'Unassigned';
  }, [item.assignee, item.assigneeId]);

  const canAssign =
    Boolean(selectedAssigneeId) &&
    selectedAssigneeId !== (item.assigneeId ?? '') &&
    !isActioning;
  const canUnassign = Boolean(item.assigneeId) && !isActioning;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm text-foreground">{currentAssigneeLabel}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Assign a responsible teammate. This does not change the review
          decision.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`review-assignee-${item.id}`}>Team member</Label>
        <Select
          value={selectedAssigneeId || undefined}
          onValueChange={setSelectedAssigneeId}
        >
          <SelectTrigger id={`review-assignee-${item.id}`}>
            <SelectValue placeholder="Choose a teammate" />
          </SelectTrigger>
          <SelectContent>
            {members.map((member) => (
              <SelectItem key={member.id} value={member.id}>
                {member.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Button
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
          isDisabled={!canAssign}
          onClick={() => onAssign(item.id, selectedAssigneeId)}
          className="w-full justify-start"
        >
          Assign
        </Button>
        <Button
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
          isDisabled={!canUnassign}
          onClick={() => onUnassign(item.id)}
          className="w-full justify-start"
        >
          Unassign
        </Button>
      </div>
    </div>
  );
}
