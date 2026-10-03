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
import { useState } from 'react';

export default function CreditHoldsPanel({
  organizationId,
  organizationName,
}: CreditHoldsPanelProps) {
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
  return (
    <section
      className="mt-6 space-y-3"
      aria-label={`Credit holds for ${organizationName}`}
    >
      <h2 className="font-semibold">Stuck credit holds · {organizationName}</h2>
      <p className="text-muted-foreground text-sm">
        Review expired media holds. Charging uses the original quoted amount and
        payer. Every action records your reason.
      </p>
      {report.isLoading && <p>Loading holds…</p>}
      {report.error && <p role="alert">Credit holds could not be loaded.</p>}
      {report.data?.rows.length === 0 && <p>No stuck media holds.</p>}
      {report.data?.rows.map((hold) => (
        <div
          key={hold.id}
          className="flex flex-wrap items-center gap-3 rounded border p-3"
        >
          <span>
            {hold.id} · {hold.provider ?? 'Unknown provider'} · {hold.status} ·{' '}
            {formatCreditBalanceExact(hold.amount)} credits
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
            Release hold
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
            Charge quoted amount
          </Button>
        </div>
      ))}
      {selected && (
        <div className="space-y-3 rounded border p-3">
          <p>
            Confirm {action} for {selected.id} (
            {formatCreditBalanceExact(selected.amount)} credits)
          </p>
          <Input
            aria-label="Credit hold recovery reason"
            placeholder="Why is this recovery necessary?"
            value={reason}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
          />
          <Button
            disabled={reason.trim().length < 8 || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Confirm {action}
          </Button>
          <Button
            variant={ButtonVariant.GHOST}
            disabled={mutation.isPending}
            onClick={() => setSelected(undefined)}
          >
            Cancel
          </Button>
          {mutation.error && (
            <p role="alert">
              Recovery failed. Refresh the holds and review their status before
              retrying.
            </p>
          )}
        </div>
      )}
      <Button
        variant={ButtonVariant.SECONDARY}
        disabled={report.isFetching || mutation.isPending}
        onClick={() => report.refetch()}
      >
        Refresh holds
      </Button>
      {report.data?.nextCursor && (
        <Button
          variant={ButtonVariant.SECONDARY}
          disabled={mutation.isPending}
          onClick={() => setCursor(report.data?.nextCursor ?? undefined)}
        >
          Next holds
        </Button>
      )}
      {cursor && (
        <Button
          variant={ButtonVariant.GHOST}
          disabled={mutation.isPending}
          onClick={() => setCursor(undefined)}
        >
          First holds
        </Button>
      )}
    </section>
  );
}
