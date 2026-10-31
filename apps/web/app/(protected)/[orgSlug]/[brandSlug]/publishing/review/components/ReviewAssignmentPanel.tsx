import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { ITurboRunItemAssignee } from '@genfeedai/contracts/interfaces';
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
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ReviewAssignmentMemberOption,
  ReviewAssignmentPanelProps,
} from '@/features/posts/props/review-assignment-panel.props';

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

function formatAssignee(assignee: ITurboRunItemAssignee): string {
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
  const translate = useTranslations('pages.publishing.review');
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
      return translate('assignment.unavailable');
    }
    return translate('assignment.unassigned');
  }, [item.assignee, item.assigneeId, translate]);

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
          {translate('assignment.description')}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`review-assignee-${item.id}`}>
          {translate('assignment.member')}
        </Label>
        <Select
          value={selectedAssigneeId || undefined}
          onValueChange={setSelectedAssigneeId}
        >
          <SelectTrigger id={`review-assignee-${item.id}`}>
            <SelectValue placeholder={translate('assignment.placeholder')} />
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
          {translate('assignment.assign')}
        </Button>
        <Button
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
          isDisabled={!canUnassign}
          onClick={() => onUnassign(item.id)}
          className="w-full justify-start"
        >
          {translate('assignment.unassign')}
        </Button>
      </div>
    </div>
  );
}
