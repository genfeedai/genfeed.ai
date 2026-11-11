'use client';

import type { AgentThread, AgentThreadShare } from '@genfeedai/agent';
import {
  AgentThreadShareLevel,
  AgentThreadShareScope,
  ButtonVariant,
} from '@genfeedai/contracts';
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
import { Building2, Lock, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import type {
  AgentThreadMember,
  AgentThreadsPanelApi,
} from '@/components/workspace-shell/props/agent-threads-panel.props';

type ShareChoice = 'private' | 'people' | 'brand' | 'organization';
type MemberLevel = AgentThreadShareLevel | 'none';

interface AgentThreadShareDialogProps {
  apiService: AgentThreadsPanelApi;
  isOpen: boolean;
  members: readonly AgentThreadMember[];
  onOpenChange: (isOpen: boolean) => void;
  onSharesChange: (shares: AgentThreadShare[]) => void;
  shares: readonly AgentThreadShare[];
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
 * messages run with their own permissions and credits.
 */
export default function AgentThreadShareDialog({
  apiService,
  isOpen,
  members,
  onOpenChange,
  onSharesChange,
  shares,
  thread,
}: AgentThreadShareDialogProps) {
  const translate = useTranslations('common.agentThreads.share');
  const savedChoice = resolveShareChoice(shares);
  const [pickedChoice, setPickedChoice] = useState<ShareChoice | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);
  const choice = pickedChoice ?? savedChoice;
  const brandName = thread.brandLabel?.trim() || translate('thisBrand');
  const canShareWithBrand = Boolean(thread.brandId);
  const groupShare = shares.find(
    (s) =>
      s.scope === AgentThreadShareScope.BRAND ||
      s.scope === AgentThreadShareScope.ORGANIZATION,
  );
  const groupLevel = groupShare?.level ?? AgentThreadShareLevel.VIEW;

  // Every change goes to the API, then the list is read back, so the dialog
  // always shows what the server holds.
  const run = useCallback(
    async (change: () => Promise<unknown>) => {
      setIsBusy(true);
      setHasFailed(false);
      try {
        await change();
        onSharesChange(await apiService.getThreadShares(thread.id));
      } catch {
        setHasFailed(true);
      } finally {
        setIsBusy(false);
      }
    },
    [apiService, onSharesChange, thread.id],
  );

  const revoke = (list: readonly AgentThreadShare[]) =>
    Promise.all(list.map((s) => apiService.deleteThreadShare(thread.id, s.id)));

  const pickChoice = (next: ShareChoice) => {
    setPickedChoice(next);
    if (next === 'private') {
      void run(() => revoke(shares));
    } else if (next === 'people') {
      void run(() =>
        revoke(shares.filter((s) => s.scope !== AgentThreadShareScope.MEMBER)),
      );
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

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) {
          setPickedChoice(null);
          setHasFailed(false);
        }
        onOpenChange(next);
      }}
      open={isOpen}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{translate('title')}</DialogTitle>
          <DialogDescription>{translate('description')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-5">
          <RadioGroup
            aria-label={translate('whoCanOpen')}
            disabled={isBusy}
            onValueChange={(value) => pickChoice(value as ShareChoice)}
            value={choice}
          >
            {options.map(({ hint, Icon, isDisabled, title, value }) => (
              <Label
                className={`flex cursor-pointer items-center gap-3 rounded-lg p-3 shadow-border ${choice === value ? 'bg-primary/10 shadow-border-strong' : 'bg-background-secondary'}`}
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
              {pickable.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {translate('noMembers')}
                </p>
              ) : (
                pickable.map((member) => {
                  const hasBrandAccess =
                    !thread.brandId || member.brandIds.includes(thread.brandId);
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
                })
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

          {hasFailed ? (
            <p className="text-sm text-destructive" role="alert">
              {translate('failed')}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            variant={ButtonVariant.DEFAULT}
          >
            {translate('done')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
