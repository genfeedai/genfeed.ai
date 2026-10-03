'use client';

import { ButtonVariant, CreditHoldRecoveryAction } from '@genfeedai/contracts';
import { formatCreditBalanceExact } from '@genfeedai/contracts/constants';
import type { AdminCreditHoldRow } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { CreditHoldsPanelProps } from '@props/admin/credit-holds-panel.props';
import { AdminCreditHoldsService } from '@services/admin/credit-holds.service';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export default function CreditHoldsPanel({
  organizationId,
  organizationName,
}: CreditHoldsPanelProps) {
  const t = useTranslations('pages.adminCreditHolds');
  const queryClient = useQueryClient();
  const getService = useAuthedService((token: string) =>
    AdminCreditHoldsService.getInstance(token),
  );
  const [cursor, setCursor] = useState<string>();
  const [reason, setReason] = useState('');
  const [selected, setSelected] = useState<AdminCreditHoldRow>();
  const [action, setAction] = useState(CreditHoldRecoveryAction.RELEASE);
  const report = useQuery({
    queryKey: ['admin-credit-holds', organizationId, cursor],
    queryFn: async ({ signal }) =>
      (await getService()).list(organizationId, cursor, signal),
  });
  const mutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('Select a credit hold');
      return (await getService()).act(organizationId, selected.id, {
        action,
        reason,
      });
    },
    onSuccess: async () => {
      setSelected(undefined);
      setReason('');
      await Promise.all([
        report.refetch(),
        queryClient.invalidateQueries({ queryKey: ['admin-credit-usage'] }),
      ]);
    },
  });
  const actionLabel = t(
    action === CreditHoldRecoveryAction.CHARGE
      ? 'actionCharge'
      : 'actionRelease',
  );
  return (
    <section
      className="mt-6 space-y-3"
      aria-label={t('sectionLabel', { organization: organizationName })}
    >
      <h2 className="font-semibold">
        {t('title', { organization: organizationName })}
      </h2>
      <p className="text-muted-foreground text-sm">{t('description')}</p>
      {report.isLoading && <p>{t('loading')}</p>}
      {report.error && <p role="alert">{t('loadError')}</p>}
      {report.data?.rows.length === 0 && <p>{t('empty')}</p>}
      {report.data?.rows.map((hold) => (
        <div
          key={hold.id}
          className="flex flex-wrap items-center gap-3 rounded border p-3"
        >
          <span>
            {t('holdSummary', {
              amount: formatCreditBalanceExact(hold.amount),
              id: hold.id,
              provider: hold.provider ?? t('unknownProvider'),
              status: hold.status,
            })}
          </span>
          {hold.blockedReason && (
            <span className="text-muted-foreground text-sm">
              {hold.blockedReason}
            </span>
          )}
          <Button
            variant={ButtonVariant.SECONDARY}
            disabled={!hold.canRelease || mutation.isPending}
            onClick={() => {
              mutation.reset();
              setSelected(hold);
              setAction(CreditHoldRecoveryAction.RELEASE);
            }}
          >
            {t('releaseHold')}
          </Button>
          <Button
            variant={ButtonVariant.SECONDARY}
            disabled={!hold.canCharge || mutation.isPending}
            onClick={() => {
              mutation.reset();
              setSelected(hold);
              setAction(CreditHoldRecoveryAction.CHARGE);
            }}
          >
            {t('chargeQuotedAmount')}
          </Button>
        </div>
      ))}
      {selected && (
        <div className="space-y-3 rounded border p-3">
          <p>
            {t('confirmPrompt', {
              action: actionLabel,
              amount: formatCreditBalanceExact(selected.amount),
              id: selected.id,
            })}
          </p>
          <Input
            aria-label={t('reasonLabel')}
            placeholder={t('reasonPlaceholder')}
            value={reason}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
          />
          <Button
            disabled={reason.trim().length < 8 || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {t('confirmAction', { action: actionLabel })}
          </Button>
          <Button
            variant={ButtonVariant.GHOST}
            disabled={mutation.isPending}
            onClick={() => setSelected(undefined)}
          >
            {t('cancel')}
          </Button>
          {mutation.error && <p role="alert">{t('recoveryFailed')}</p>}
        </div>
      )}
      <Button
        variant={ButtonVariant.SECONDARY}
        disabled={report.isFetching || mutation.isPending}
        onClick={() => report.refetch()}
      >
        {t('refresh')}
      </Button>
      {report.data?.nextCursor && (
        <Button
          variant={ButtonVariant.SECONDARY}
          disabled={mutation.isPending}
          onClick={() => setCursor(report.data?.nextCursor ?? undefined)}
        >
          {t('next')}
        </Button>
      )}
      {cursor && (
        <Button
          variant={ButtonVariant.GHOST}
          disabled={mutation.isPending}
          onClick={() => setCursor(undefined)}
        >
          {t('first')}
        </Button>
      )}
    </section>
  );
}
