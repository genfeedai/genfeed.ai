'use client';

import type { AgentThread, AgentThreadShare } from '@genfeedai/agent';
import {
  AgentThreadShareLevel,
  AgentThreadShareScope,
  ButtonSize,
  ButtonVariant,
  ComponentSize,
} from '@genfeedai/contracts';
import { Alert, AlertActions } from '@ui/primitives/alert';
import { Avatar } from '@ui/primitives/avatar';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { Label } from '@ui/primitives/label';
import { RadioGroup, RadioGroupItem } from '@ui/primitives/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import Spinner from '@ui/primitives/spinner';
import { Building2, Lock, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { canReachThreadBrand } from '@/components/workspace-shell/agent-thread-member-access.util';
import type {
  AgentThreadAccess,
  AgentThreadMember,
  AgentThreadsPanelApi,
} from '@/components/workspace-shell/props/agent-threads-panel.props';

type ShareChoice = 'private' | 'people' | 'brand' | 'organization';
type MemberLevel = AgentThreadShareLevel | 'none';

interface AgentThreadShareDialogProps {
  access: AgentThreadAccess;
  apiService: AgentThreadsPanelApi;
  isMembersFailed?: boolean;
  isMembersLoading?: boolean;
  isOpen: boolean;
  members: readonly AgentThreadMember[];
  /** Called with the thread's shares as the server holds them after a change. */
  onAccessConfirmed: (shares: AgentThreadShare[], threadId: string) => void;
  /** A change was made but the server's list could not be read back. */
  onAccessUnverified: (threadId: string) => void;
  onOpenChange: (isOpen: boolean) => void;
  onRetryAccess: () => void;
  onRetryMembers?: () => void;
  thread: AgentThread;
}

/** Which radio a thread's live shares read as. A brand or org share wins. */
function resolveShareChoice(shares: readonly AgentThreadShare[]): ShareChoice {
  if (shares.some((s) => s.scope === AgentThreadShareScope.ORGANIZATION)) {
    return 'organization';
  }
  if (shares.some((s) => s.scope === AgentThreadShareScope.BRAND)) {
    return 'brand';
  }
  return shares.some((s) => s.scope === AgentThreadShareScope.MEMBER)
    ? 'people'
    : 'private';
}

/**
 * Who can open a thread, and what they may do: only the owner (or an admin),
 * one scope at a time. Teammates see the history; with "Can prompt" their
 * messages run with their own permissions and credits. Nothing reads as
 * selected until the server has confirmed who the thread is shared with.
 */
export default function AgentThreadShareDialog({
  access,
  apiService,
  isMembersFailed = false,
  isMembersLoading = false,
  isOpen,
  members,
  onAccessConfirmed,
  onAccessUnverified,
  onOpenChange,
  onRetryAccess,
  onRetryMembers,
  thread,
}: AgentThreadShareDialogProps) {
  const translate = useTranslations('common.agentThreads.share');
  const [pickedChoice, setPickedChoice] = useState<ShareChoice | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  // What still has access after a change that did not fully land; '' when
  // nothing is left to name.
  const [leftoverScope, setLeftoverScope] = useState<string | null>(null);
  const isConfirmed = access.status === 'ready';
  const shares = access.shares;
  const choice = isConfirmed
    ? (pickedChoice ?? resolveShareChoice(shares))
    : '';
  const brandName = thread.brandLabel?.trim() || translate('thisBrand');
  const canShareWithBrand = Boolean(thread.brandId);
  const groupShare = shares.find(
    (s) =>
      s.scope === AgentThreadShareScope.BRAND ||
      s.scope === AgentThreadShareScope.ORGANIZATION,
  );
  const groupLevel = groupShare?.level ?? AgentThreadShareLevel.VIEW;

  const describeScope = (list: readonly AgentThreadShare[]) => {
    const scope = resolveShareChoice(list);
    if (scope === 'organization') {
      return translate('organization');
    }
    return scope === 'brand'
      ? brandName
      : translate('scopePeople', { count: list.length });
  };

  // Every change goes to the API, then the list is read back, so the dialog
  // always shows what the server holds. A change that only partly landed, or
  // failed, is reconciled the same way, and a failed readback leaves access
  // unverified instead of showing the old list.
  const run = async (
    change: () => Promise<unknown>,
    keepChoice?: ShareChoice,
  ) => {
    const threadId = thread.id;
    setIsBusy(true);
    setLeftoverScope(null);
    let hasChangeFailed = false;
    let nextChoice: ShareChoice | null = null;
    try {
      await change();
    } catch {
      hasChangeFailed = true;
    }
    try {
      const confirmed = await apiService.getThreadShares(threadId);
      onAccessConfirmed(confirmed, threadId);
      if (
        keepChoice &&
        confirmed.every((s) => s.scope === AgentThreadShareScope.MEMBER)
      ) {
        nextChoice = keepChoice;
      }
      if (hasChangeFailed) {
        setLeftoverScope(confirmed.length > 0 ? describeScope(confirmed) : '');
      }
    } catch {
      onAccessUnverified(threadId);
    } finally {
      setPickedChoice(nextChoice);
      setIsBusy(false);
    }
  };

  // Waits for every delete to settle before the readback, so a rejected delete
  // cannot leave others running while the list is confirmed.
  const revoke = async (list: readonly AgentThreadShare[]) => {
    const results = await Promise.allSettled(
      list.map((s) => apiService.deleteThreadShare(thread.id, s.id)),
    );
    if (results.some((result) => result.status === 'rejected')) {
      throw new Error('Some shares could not be removed');
    }
  };

  const pickChoice = (next: ShareChoice) => {
    setPickedChoice(next);
    if (next === 'private') {
      void run(() => revoke(shares));
    } else if (next === 'people') {
      const rest = shares.filter(
        (s) => s.scope !== AgentThreadShareScope.MEMBER,
      );
      if (rest.length > 0) {
        void run(() => revoke(rest), 'people');
      }
    } else {
      const scope =
        next === 'brand'
          ? AgentThreadShareScope.BRAND
          : AgentThreadShareScope.ORGANIZATION;
      void run(async () => {
        await apiService.createThreadShare(thread.id, {
          level: groupLevel,
          scope,
          ...(next === 'brand' && thread.brandId
            ? { targetBrandId: thread.brandId }
            : {}),
        });
        await revoke(shares.filter((s) => s.scope !== scope));
      });
    }
  };

  const setGroupLevel = (level: AgentThreadShareLevel) => {
    if (!groupShare) {
      return;
    }
    void run(() =>
      apiService.createThreadShare(thread.id, {
        level,
        scope: groupShare.scope,
        ...(groupShare.targetBrandId
          ? { targetBrandId: groupShare.targetBrandId }
          : {}),
      }),
    );
  };

  const setMemberLevel = (userId: string, level: MemberLevel) => {
    const existing = shares.find(
      (s) =>
        s.scope === AgentThreadShareScope.MEMBER && s.targetUserId === userId,
    );
    if (level === 'none') {
      if (existing) {
        void run(() => apiService.deleteThreadShare(thread.id, existing.id));
      }
      return;
    }
    void run(() =>
      apiService.createThreadShare(thread.id, {
        level,
        scope: AgentThreadShareScope.MEMBER,
        targetUserId: userId,
      }),
    );
  };

  const options: Array<{
    hint: string;
    Icon: typeof Lock;
    isDisabled?: boolean;
    title: string;
    value: ShareChoice;
  }> = [
    {
      hint: translate('onlyMeHint'),
      Icon: Lock,
      title: translate('onlyMe'),
      value: 'private',
    },
    {
      hint: translate('peopleHint'),
      Icon: Users,
      title: translate('people'),
      value: 'people',
    },
    {
      hint: canShareWithBrand
        ? translate('brandHint', { brand: brandName })
        : translate('noBrandHint'),
      Icon: Building2,
      isDisabled: !canShareWithBrand,
      title: brandName,
      value: 'brand',
    },
    {
      hint: translate('organizationHint'),
      Icon: Building2,
      title: translate('organization'),
      value: 'organization',
    },
  ];

  const levelOptions = (
    <>
      <SelectItem value={AgentThreadShareLevel.VIEW}>
        {translate('canView')}
      </SelectItem>
      <SelectItem value={AgentThreadShareLevel.COLLABORATE}>
        {translate('canPrompt')}
      </SelectItem>
    </>
  );

  const pickable = members.filter((m) => m.userId !== thread.userId);

  // Done, Escape and the close button all end here, so a pick that was never
  // saved cannot outlive the dialog.
  const close = () => {
    setPickedChoice(null);
    setLeftoverScope(null);
    onOpenChange(false);
  };

  return (
    <Dialog
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      open={isOpen}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{translate('title')}</DialogTitle>
          <DialogDescription>{translate('description')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-5">
          {access.status === 'loading' ? (
            <Alert
              icon={
                <Spinner
                  ariaLabel={translate('lookupLoading')}
                  size={ComponentSize.XS}
                />
              }
              variant="note"
            >
              {translate('lookupLoading')}
            </Alert>
          ) : null}
          {access.status === 'failed' || access.status === 'unverified' ? (
            <Alert variant="warning">
              {translate(
                access.status === 'failed'
                  ? 'lookupFailed'
                  : 'unverifiedAfterChange',
              )}
              <AlertActions>
                <Button
                  onClick={onRetryAccess}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.SECONDARY}
                >
                  {translate('retry')}
                </Button>
              </AlertActions>
            </Alert>
          ) : null}
          {isConfirmed && leftoverScope !== null ? (
            <Alert variant="warning">
              {leftoverScope === ''
                ? translate('failed')
                : translate('incomplete', { scope: leftoverScope })}
            </Alert>
          ) : null}

          <RadioGroup
            aria-label={translate('whoCanOpen')}
            disabled={isBusy || !isConfirmed}
            onValueChange={(value) => pickChoice(value as ShareChoice)}
            value={choice}
          >
            {options.map(({ hint, Icon, isDisabled, title, value }) => (
              <Label
                className={`flex items-center gap-3 rounded-lg p-3 shadow-border ${isConfirmed ? 'cursor-pointer' : 'opacity-60'} ${choice === value ? 'bg-primary/10 shadow-border-strong' : 'bg-background-secondary'}`}
                key={value}
              >
                <RadioGroupItem disabled={isDisabled} value={value} />
                <div className="flex size-8 items-center justify-center rounded-md bg-background-tertiary text-muted-foreground">
                  <Icon className="size-4" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium">{title}</span>
                  <span className="text-xs text-muted-foreground">{hint}</span>
                </div>
              </Label>
            ))}
          </RadioGroup>

          {choice === 'people' ? (
            <div className="flex flex-col gap-1">
              {isMembersLoading ? (
                <p className="text-sm text-muted-foreground" role="status">
                  {translate('membersLoading')}
                </p>
              ) : isMembersFailed ? (
                <Alert variant="warning">
                  {translate('membersFailed')}
                  {onRetryMembers ? (
                    <AlertActions>
                      <Button
                        onClick={onRetryMembers}
                        size={ButtonSize.SM}
                        variant={ButtonVariant.SECONDARY}
                      >
                        {translate('retry')}
                      </Button>
                    </AlertActions>
                  ) : null}
                </Alert>
              ) : pickable.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {translate('noMembers')}
                </p>
              ) : (
                <>
                  {shares.length === 0 ? (
                    <p className="pb-1 text-xs text-muted-foreground">
                      {translate('pickPeople')}
                    </p>
                  ) : null}
                  {pickable.map((member) => {
                    const hasBrandAccess = canReachThreadBrand(
                      member,
                      thread.brandId,
                    );
                    const current = shares.find(
                      (s) =>
                        s.scope === AgentThreadShareScope.MEMBER &&
                        s.targetUserId === member.userId,
                    );
                    return (
                      <div
                        className="flex items-center gap-3 py-1.5"
                        key={member.userId}
                      >
                        <Avatar
                          name={member.name}
                          size="md"
                          src={member.avatarUrl}
                        />
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm font-medium">
                            {member.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {hasBrandAccess
                              ? member.roleLabel
                              : translate('noBrandAccess', {
                                  brand: brandName,
                                  role: member.roleLabel ?? '',
                                })}
                          </span>
                        </div>
                        <Select
                          disabled={isBusy || (!hasBrandAccess && !current)}
                          onValueChange={(value) =>
                            setMemberLevel(member.userId, value as MemberLevel)
                          }
                          value={current?.level ?? 'none'}
                        >
                          <SelectTrigger
                            aria-label={translate('accessFor', {
                              name: member.name,
                            })}
                            className="w-40"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">
                              {translate('noAccess')}
                            </SelectItem>
                            {levelOptions}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          ) : null}

          {choice === 'brand' || choice === 'organization' ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm">
                {choice === 'brand'
                  ? translate('brandMembersCan', { brand: brandName })
                  : translate('everyMemberCan')}
              </span>
              <Select
                disabled={isBusy || !groupShare}
                onValueChange={(value) =>
                  setGroupLevel(value as AgentThreadShareLevel)
                }
                value={groupLevel}
              >
                <SelectTrigger
                  aria-label={translate('accessLevel')}
                  className="w-40"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>{levelOptions}</SelectContent>
              </Select>
            </div>
          ) : null}

          {choice === 'organization' && canShareWithBrand ? (
            <p className="text-xs text-muted-foreground">
              {translate('organizationNote', { brand: brandName })}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button onClick={close} variant={ButtonVariant.DEFAULT}>
            {translate('done')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
