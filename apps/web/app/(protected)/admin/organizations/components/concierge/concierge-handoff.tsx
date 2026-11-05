'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { IWarmupAccount } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { AdminWarmupAccountsService } from '@services/admin/warmup-accounts.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@ui/primitives/accordion';
import { Alert } from '@ui/primitives/alert';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import {
  DefinitionDetail,
  DefinitionList,
  DefinitionTerm,
} from '@ui/primitives/definition-list';
import { Skeleton } from '@ui/primitives/skeleton';
import { format } from 'date-fns';
import { Ban, Mail, RotateCw, Search } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type {
  ConciergeHandoffProps,
  ConciergeInvitationAction,
} from '@/features/admin/props/concierge.props';
import {
  canResendInvitation,
  canRevokeInvitation,
  canSendInvitation,
  getInvitationStatusKey,
  isConciergeClosed,
} from './concierge-invitation';
import ConciergePreparation from './concierge-preparation';

function formatDate(value: string): string {
  return format(new Date(value), 'MMM d, yyyy, h:mm a');
}

/**
 * One organization's concierge handoff, shown in its Context sidebar: the next
 * step first, then the invitation, then the preparation tools in collapsed
 * sections. IDs and diagnostics stay closed until asked for.
 */
export default function ConciergeHandoff({
  conciergeId,
  ownerName,
  onAccountChange,
}: ConciergeHandoffProps) {
  const translate = useTranslations('pages.warmupAccounts');
  const [account, setAccount] = useState<IWarmupAccount | null>(null);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [pending, setPending] = useState<
    ConciergeInvitationAction | 'repair' | null
  >(null);
  // The sidebar reuses this component when another organization is selected;
  // work started for the previous one must not touch the new selection.
  const activeConciergeIdRef = useRef(conciergeId);
  const onAccountChangeRef = useRef(onAccountChange);
  // Synced after commit, never during render; a layout effect runs before any
  // awaited work from a handler can resume and read them.
  useLayoutEffect(() => {
    activeConciergeIdRef.current = conciergeId;
    onAccountChangeRef.current = onAccountChange;
  }, [conciergeId, onAccountChange]);
  const getService = useAuthedService((token: string) =>
    AdminWarmupAccountsService.getInstance(token),
  );

  const applyAccount = useCallback((next: IWarmupAccount) => {
    setAccount(next);
    onAccountChangeRef.current?.(next);
  }, []);

  // Load the account, then check its invitation with the mail provider so the
  // status shown is the live one.
  useEffect(() => {
    const controller = new AbortController();
    setAccount(null);
    setHasLoadError(false);
    setPending(null);

    void (async () => {
      try {
        const service = await getService();
        const loaded = await service.getWarmupAccount(
          conciergeId,
          controller.signal,
        );
        if (controller.signal.aborted) {
          return;
        }
        setAccount(loaded);

        if (loaded.invitationId) {
          // A failed live check must not hide the account that did load: the
          // Inspect action stays available to retry it.
          try {
            const inspected = await service.inspectInvitation(
              conciergeId,
              controller.signal,
            );
            if (!controller.signal.aborted) {
              setAccount(inspected);
            }
          } catch (error) {
            if (!controller.signal.aborted) {
              logger.error('Failed to inspect concierge invitation', error);
            }
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          logger.error('Failed to load concierge account', error);
          setHasLoadError(true);
        }
      }
    })();

    return () => controller.abort();
  }, [conciergeId, getService]);

  async function runInvitation(action: ConciergeInvitationAction) {
    const startedFor = conciergeId;
    const isStale = () => activeConciergeIdRef.current !== startedFor;
    setPending(action);
    try {
      const service = await getService();
      const updated =
        action === 'inspect'
          ? await service.inspectInvitation(conciergeId)
          : action === 'send'
            ? await service.sendInvitation(conciergeId)
            : action === 'resend'
              ? await service.resendInvitation(conciergeId)
              : await service.revokeInvitation(conciergeId);
      if (isStale()) {
        return;
      }
      applyAccount(updated);

      if (action === 'inspect') {
        return;
      }
      if (updated.invitation?.status === 'delivery-failed') {
        NotificationsService.getInstance().warning(translate('deliveryError'));
        return;
      }
      NotificationsService.getInstance().success(
        translate(
          action === 'send'
            ? 'invitationSent'
            : action === 'resend'
              ? 'invitationResent'
              : 'invitationRevoked',
        ),
      );
    } catch (error) {
      if (isStale()) {
        return;
      }
      logger.error(`Concierge invitation ${action} failed`, error);
      NotificationsService.getInstance().error(
        translate(
          action === 'inspect'
            ? 'inspectError'
            : action === 'send'
              ? 'sendError'
              : action === 'resend'
                ? 'resendError'
                : 'revokeError',
        ),
      );
    } finally {
      if (!isStale()) {
        setPending(null);
      }
    }
  }

  async function repair() {
    const startedFor = conciergeId;
    const isStale = () => activeConciergeIdRef.current !== startedFor;
    setPending('repair');
    try {
      const service = await getService();
      const repaired = await service.prepareWarmupAccount(conciergeId, {
        action: 'repair',
      });
      if (!isStale()) {
        applyAccount(repaired);
      }
    } catch (error) {
      if (!isStale()) {
        logger.error('Concierge repair failed', error);
        NotificationsService.getInstance().error(
          translate('preparation.error'),
        );
      }
    } finally {
      if (!isStale()) {
        setPending(null);
      }
    }
  }

  if (hasLoadError) {
    return <Alert variant="destructive">{translate('loadSidebarError')}</Alert>;
  }

  if (!account) {
    return (
      <div className="space-y-3" data-testid="concierge-handoff-loading">
        <Skeleton variant="text" height={20} className="w-40" />
        <Skeleton variant="text" height={64} className="w-full" />
      </div>
    );
  }

  const preparation = account.diagnostics.preparation;
  const invitation = account.invitation;
  const isClosed = isConciergeClosed(account);
  const isBusy = pending !== null;
  const blockers = account.readiness?.blockers ?? [];
  const steps = account.diagnostics.steps ?? [];
  const idRows: [string, string | undefined][] = [
    [translate('organizationId'), account.organizationId],
    [translate('brandId'), account.brandId],
    [translate('invitationId'), account.invitationId],
    [translate('operatorId'), account.operatorUserId],
  ];

  return (
    <section
      aria-label={translate('handoffSection')}
      className="space-y-4"
      data-testid="concierge-handoff"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{translate('handoffSection')}</h3>
        <Badge status={account.status.toLowerCase()} />
      </div>

      {account.diagnostics.error ? (
        <Alert variant="destructive">{account.diagnostics.error}</Alert>
      ) : null}

      <div className="space-y-3 rounded-lg border border-border p-3 text-sm">
        {account.status === 'CLAIMED' ? (
          <p>{translate('preparation.claimed')}</p>
        ) : account.status === 'ARCHIVED' ? (
          <p>{translate('archivedNotice')}</p>
        ) : invitation ? (
          <>
            <p className="font-medium">
              {translate('invitation.status')}:{' '}
              {translate(
                `invitation.${getInvitationStatusKey(invitation.status)}`,
              )}
            </p>
            <p className="text-muted-foreground">
              {translate('invitation.expiresAt')}{' '}
              {formatDate(invitation.expiresAt)}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
                icon={<Search className="size-4" />}
                isDisabled={isBusy}
                isLoading={pending === 'inspect'}
                label={translate('invitation.inspect')}
                onClick={() => void runInvitation('inspect')}
              />
              {canResendInvitation(account) ? (
                <Button
                  type="button"
                  size={ButtonSize.SM}
                  variant={ButtonVariant.SECONDARY}
                  icon={<RotateCw className="size-4" />}
                  isDisabled={isBusy}
                  isLoading={pending === 'resend'}
                  label={
                    invitation.status === 'delivery-failed'
                      ? translate('invitation.retry')
                      : translate('invitation.resend')
                  }
                  onClick={() => void runInvitation('resend')}
                />
              ) : null}
              {canRevokeInvitation(account) ? (
                <Button
                  type="button"
                  size={ButtonSize.SM}
                  variant={ButtonVariant.DESTRUCTIVE}
                  icon={<Ban className="size-4" />}
                  isDisabled={isBusy}
                  isLoading={pending === 'revoke'}
                  label={translate('invitation.revoke')}
                  onClick={() => void runInvitation('revoke')}
                />
              ) : null}
            </div>
          </>
        ) : blockers.length === 0 && account.readiness?.ready ? (
          <>
            <p className="font-medium">
              {translate('readyToInvite', {
                name: ownerName ?? account.leadEmail,
              })}
            </p>
            {canSendInvitation(account) ? (
              <Button
                type="button"
                size={ButtonSize.SM}
                icon={<Mail className="size-4" />}
                isDisabled={isBusy}
                isLoading={pending === 'send'}
                label={translate('invitation.send')}
                onClick={() => void runInvitation('send')}
              />
            ) : null}
          </>
        ) : (
          <>
            <p className="font-medium">
              {translate('blockersLeft', {
                count: blockers.length,
                name: ownerName ?? account.leadEmail,
              })}
            </p>
            {blockers.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                {blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            ) : null}
            <Button
              type="button"
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
              isDisabled={isBusy}
              isLoading={pending === 'repair'}
              label={
                pending === 'repair'
                  ? translate('preparation.repairing')
                  : translate('preparation.repair')
              }
              onClick={() => void repair()}
            />
          </>
        )}
        {!isClosed && account.readiness?.workspacePath ? (
          <Link
            className="inline-block underline"
            href={account.readiness.workspacePath}
          >
            {translate('preparation.openWorkspace')}
          </Link>
        ) : null}
      </div>

      <DefinitionList className="space-y-3">
        <div>
          <DefinitionTerm>{translate('lead')}</DefinitionTerm>
          <DefinitionDetail>{account.leadEmail}</DefinitionDetail>
        </div>
        {account.websiteUrl ? (
          <div>
            <DefinitionTerm>{translate('preparation.website')}</DefinitionTerm>
            <DefinitionDetail>{account.websiteUrl}</DefinitionDetail>
          </div>
        ) : null}
        {isClosed ? null : (
          <div>
            <DefinitionTerm>{translate('creditsLabel')}</DefinitionTerm>
            <DefinitionDetail>
              {translate('preparation.availableCredits', {
                amount: account.readiness?.availableCredits ?? 0,
              })}
              {preparation?.grant
                ? translate('preparation.promisedCredits', {
                    amount: preparation.grant.amount,
                  })
                : ''}
              {preparation?.preparationCredits
                ? ` · ${translate('preparation.reimbursedCredits', {
                    amount: preparation.preparationCredits,
                  })}`
                : ''}
            </DefinitionDetail>
          </div>
        )}
      </DefinitionList>

      <ConciergePreparation account={account} onUpdated={applyAccount} />

      <Accordion type="single" collapsible>
        <AccordionItem value="diagnostics">
          <AccordionTrigger>{translate('idsAndDiagnostics')}</AccordionTrigger>
          <AccordionContent>
            <DefinitionList className="space-y-3">
              {idRows.map(([label, value]) =>
                value ? (
                  <div key={label}>
                    <DefinitionTerm>{label}</DefinitionTerm>
                    <DefinitionDetail className="break-all">
                      {value}
                    </DefinitionDetail>
                  </div>
                ) : null,
              )}
            </DefinitionList>
            {steps.length === 0 ? (
              <p className="pt-3 text-muted-foreground">
                {translate('noDiagnostics')}
              </p>
            ) : (
              <ol className="space-y-3 pt-3">
                {steps.map((step, index) => (
                  <li
                    // biome-ignore lint/suspicious/noArrayIndexKey: timestamp+message collide on same-ms duplicate steps; index is the correct disambiguator
                    key={`${step.timestamp}-${step.message}-${index}`}
                    className="flex gap-3"
                  >
                    <Badge
                      variant={
                        step.status === 'failed' ? 'destructive' : 'outline'
                      }
                    >
                      {step.status}
                    </Badge>
                    <div>
                      <p>{step.message}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(step.timestamp)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
}
