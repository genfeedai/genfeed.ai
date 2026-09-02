'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type {
  IWarmupAccount,
  IWarmupAccountStatus,
  IWarmupInvitationStatus,
} from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type {
  WarmupAccountDetailProps,
  WarmupAccountFormState,
  WarmupAccountsPageProps,
  WarmupInvitationAction,
} from '@props/admin/warmup-accounts.props';
import { AdminWarmupAccountsService } from '@services/admin/warmup-accounts.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import CardEmpty from '@ui/card/empty/CardEmpty';
import Badge from '@ui/display/badge/Badge';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import {
  Ban,
  CircleCheck,
  Mail,
  RefreshCw,
  Rocket,
  RotateCw,
  Search,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';

const TABS = [
  { id: 'create', label: 'Create' },
  { id: 'accounts', label: 'Accounts' },
];

const INITIAL_FORM: WarmupAccountFormState = {
  brandName: '',
  guidance: '',
  leadEmail: '',
  leadFirstName: '',
  leadLastName: '',
  organizationName: '',
  websiteUrl: '',
};

const WARMUP_SKELETON_KEYS = [
  'warmup-account-skeleton-1',
  'warmup-account-skeleton-2',
  'warmup-account-skeleton-3',
] as const;

const STATUS_META: Record<
  IWarmupAccountStatus,
  {
    label: string;
    variant: 'error' | 'ghost' | 'info' | 'outline' | 'success' | 'warning';
  }
> = {
  ARCHIVED: { label: 'Archived', variant: 'ghost' },
  CLAIMED: { label: 'Claimed', variant: 'success' },
  DRAFT: { label: 'Draft', variant: 'outline' },
  FAILED: { label: 'Failed', variant: 'error' },
  INVITED: { label: 'Invited', variant: 'success' },
  PROVISIONED: { label: 'Provisioned', variant: 'info' },
  PROVISIONING: { label: 'Provisioning', variant: 'warning' },
};

type PageState = {
  accounts: IWarmupAccount[];
  activeTab: 'accounts' | 'create';
  form: WarmupAccountFormState;
  invitationAction: PendingInvitationAction | null;
  isLoading: boolean;
  isSubmitting: boolean;
  loadTrigger: number;
  selectedAccountId?: string;
};

type PendingInvitationAction = {
  accountId: string;
  action: WarmupInvitationAction;
  requestId: number;
};

type ActiveInvitationRequest = PendingInvitationAction & {
  controller: AbortController;
};

type PageAction =
  | { type: 'SET_TAB'; tab: 'accounts' | 'create' }
  | { type: 'SET_LOADING'; isLoading: boolean }
  | { type: 'SET_SUBMITTING'; isSubmitting: boolean }
  | { type: 'SET_ACCOUNTS'; accounts: IWarmupAccount[] }
  | {
      type: 'SET_FIELD';
      field: keyof WarmupAccountFormState;
      value: string;
    }
  | { type: 'SET_SELECTED'; accountId: string }
  | { type: 'SET_INVITATION_ACTION'; request: PendingInvitationAction }
  | { type: 'CLEAR_INVITATION_ACTION'; requestId: number }
  | { type: 'UPSERT_ACCOUNT'; account: IWarmupAccount }
  | { type: 'CREATE_SUCCESS'; account: IWarmupAccount };

function pageReducer(state: PageState, action: PageAction): PageState {
  switch (action.type) {
    case 'CLEAR_INVITATION_ACTION':
      return state.invitationAction?.requestId === action.requestId
        ? { ...state, invitationAction: null }
        : state;
    case 'CREATE_SUCCESS': {
      const remaining = state.accounts.filter(
        (account) => account.id !== action.account.id,
      );
      return {
        ...state,
        accounts: [action.account, ...remaining],
        activeTab: 'accounts',
        form: INITIAL_FORM,
        isLoading: true,
        loadTrigger: state.loadTrigger + 1,
        selectedAccountId: action.account.id,
      };
    }
    case 'SET_ACCOUNTS':
      return {
        ...state,
        accounts: action.accounts,
        selectedAccountId:
          state.selectedAccountId ?? action.accounts[0]?.id ?? undefined,
      };
    case 'SET_FIELD':
      return {
        ...state,
        form: { ...state.form, [action.field]: action.value },
      };
    case 'SET_INVITATION_ACTION':
      return { ...state, invitationAction: action.request };
    case 'SET_LOADING':
      return { ...state, isLoading: action.isLoading };
    case 'SET_SELECTED':
      return { ...state, selectedAccountId: action.accountId };
    case 'SET_SUBMITTING':
      return { ...state, isSubmitting: action.isSubmitting };
    case 'UPSERT_ACCOUNT': {
      const hasAccount = state.accounts.some(
        (account) => account.id === action.account.id,
      );

      return {
        ...state,
        accounts: hasAccount
          ? state.accounts.map((account) =>
              account.id === action.account.id ? action.account : account,
            )
          : [action.account, ...state.accounts],
      };
    }
    case 'SET_TAB':
      return {
        ...state,
        activeTab: action.tab,
        isLoading: action.tab === 'accounts' ? true : state.isLoading,
        loadTrigger:
          action.tab === 'accounts' ? state.loadTrigger + 1 : state.loadTrigger,
      };
    default:
      return state;
  }
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString('en-US', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function getStatusMeta(status: IWarmupAccountStatus) {
  return STATUS_META[status] ?? { label: status, variant: 'outline' as const };
}

function canSendInvitation(account: IWarmupAccount): boolean {
  if (account.status === 'CLAIMED' || account.status === 'ARCHIVED') {
    return false;
  }

  if (account.invitation) {
    return false;
  }

  return (
    account.status === 'FAILED' ||
    account.status === 'INVITED' ||
    account.status === 'PROVISIONED'
  );
}

function canResendInvitation(account: IWarmupAccount): boolean {
  const status = account.invitation?.status;
  return (
    status === 'pending' ||
    status === 'delivered' ||
    status === 'delivery-failed' ||
    status === 'expired'
  );
}

function canRevokeInvitation(account: IWarmupAccount): boolean {
  const status = account.invitation?.status;
  return Boolean(status) && status !== 'accepted' && status !== 'revoked';
}

function formatInvitationStatus(
  status: IWarmupInvitationStatus,
  translate: (key: string) => string,
): string {
  switch (status) {
    case 'accepted':
      return translate('invitation.statusAccepted');
    case 'delivered':
      return translate('invitation.statusDelivered');
    case 'delivery-failed':
      return translate('invitation.statusDeliveryFailed');
    case 'expired':
      return translate('invitation.statusExpired');
    case 'revoked':
      return translate('invitation.statusRevoked');
    default:
      return translate('invitation.statusPending');
  }
}

export default function WarmupAccountsPage({
  defaultTab = 'create',
}: WarmupAccountsPageProps) {
  const [state, dispatch] = useReducer(pageReducer, {
    accounts: [],
    activeTab: defaultTab,
    form: INITIAL_FORM,
    invitationAction: null,
    isLoading: defaultTab === 'accounts',
    isSubmitting: false,
    loadTrigger: 0,
  });
  const invitationRequestIdRef = useRef(0);
  const activeInvitationRequestRef = useRef<ActiveInvitationRequest | null>(
    null,
  );

  const {
    accounts,
    activeTab,
    form,
    invitationAction,
    isLoading,
    isSubmitting,
    loadTrigger,
  } = state;
  const notificationsService = NotificationsService.getInstance();

  const getWarmupAccountsService = useAuthedService((token: string) =>
    AdminWarmupAccountsService.getInstance(token),
  );

  const selectedAccount = useMemo(
    () =>
      accounts.find((account) => account.id === state.selectedAccountId) ??
      accounts[0],
    [accounts, state.selectedAccountId],
  );

  const loadAccounts = useCallback(
    async (signal: AbortSignal) => {
      try {
        const service = await getWarmupAccountsService();
        const data = await service.getWarmupAccounts();

        if (!signal.aborted) {
          dispatch({ type: 'SET_ACCOUNTS', accounts: data });
          logger.info('Warm-up accounts loaded', { count: data.length });
        }
      } catch (error) {
        if (signal.aborted) {
          return;
        }
        logger.error('Failed to load warm-up accounts', error);
        notificationsService.error('Failed to load warm-up accounts');
      } finally {
        if (!signal.aborted) {
          dispatch({ type: 'SET_LOADING', isLoading: false });
        }
      }
    },
    [getWarmupAccountsService, notificationsService],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: loadTrigger is an intentional re-fire signal incremented on every accounts-tab selection, including re-selections of the already-active tab
  useEffect(() => {
    if (activeTab !== 'accounts') {
      return;
    }

    const controller = new AbortController();
    loadAccounts(controller.signal);

    return () => controller.abort();
  }, [activeTab, loadAccounts, loadTrigger]);

  const runInvitationAction = useCallback(
    (action: WarmupInvitationAction, accountId: string): AbortController => {
      activeInvitationRequestRef.current?.controller.abort();

      const controller = new AbortController();
      const requestId = invitationRequestIdRef.current + 1;
      const request = { accountId, action, requestId };
      invitationRequestIdRef.current = requestId;
      activeInvitationRequestRef.current = { ...request, controller };
      dispatch({ type: 'SET_INVITATION_ACTION', request });

      const isCurrentRequest = (): boolean =>
        !controller.signal.aborted &&
        activeInvitationRequestRef.current?.requestId === requestId;

      void (async () => {
        try {
          const service = await getWarmupAccountsService();
          if (!isCurrentRequest()) {
            return;
          }

          const account =
            action === 'inspect'
              ? await service.inspectInvitation(accountId, controller.signal)
              : action === 'send'
                ? await service.sendInvitation(accountId, controller.signal)
                : action === 'resend'
                  ? await service.resendInvitation(accountId, controller.signal)
                  : await service.revokeInvitation(
                      accountId,
                      controller.signal,
                    );

          if (!isCurrentRequest()) {
            return;
          }

          dispatch({ type: 'UPSERT_ACCOUNT', account });

          if (action === 'inspect') {
            return;
          }

          if (account.invitation?.status === 'delivery-failed') {
            notificationsService.warning(
              'Invitation email could not be delivered',
            );
            return;
          }

          if (action === 'send') {
            notificationsService.success('Invitation sent');
            return;
          }

          if (action === 'resend') {
            notificationsService.success('Invitation resent');
            return;
          }

          notificationsService.success('Invitation revoked');
        } catch (error) {
          if (!isCurrentRequest()) {
            return;
          }

          logger.error(`Warm-up invitation ${action} failed`, error);
          notificationsService.error(
            action === 'inspect'
              ? 'Failed to inspect invitation'
              : action === 'send'
                ? 'Failed to send invitation'
                : action === 'resend'
                  ? 'Failed to resend invitation'
                  : 'Failed to revoke invitation',
          );
        } finally {
          dispatch({ type: 'CLEAR_INVITATION_ACTION', requestId });
          if (activeInvitationRequestRef.current?.requestId === requestId) {
            activeInvitationRequestRef.current = null;
          }
        }
      })();

      return controller;
    },
    [getWarmupAccountsService, notificationsService],
  );

  useEffect(
    () => () => activeInvitationRequestRef.current?.controller.abort(),
    [],
  );

  useEffect(() => {
    if (activeTab !== 'accounts' || isLoading || !state.selectedAccountId) {
      return;
    }

    const controller = runInvitationAction('inspect', state.selectedAccountId);

    return () => controller.abort();
  }, [activeTab, isLoading, runInvitationAction, state.selectedAccountId]);

  function handleFieldChange(
    field: keyof WarmupAccountFormState,
    value: string,
  ): void {
    dispatch({ type: 'SET_FIELD', field, value });
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (!form.leadEmail.trim()) {
      notificationsService.warning('Lead email is required');
      return;
    }

    if (!form.organizationName.trim() || !form.brandName.trim()) {
      notificationsService.warning('Organization and brand are required');
      return;
    }

    dispatch({ type: 'SET_SUBMITTING', isSubmitting: true });

    try {
      const service = await getWarmupAccountsService();
      const account = await service.createWarmupAccount({
        brandName: form.brandName.trim(),
        guidance: form.guidance.trim() || undefined,
        leadEmail: form.leadEmail.trim(),
        leadFirstName: form.leadFirstName.trim() || undefined,
        leadLastName: form.leadLastName.trim() || undefined,
        organizationName: form.organizationName.trim(),
        websiteUrl: form.websiteUrl.trim() || undefined,
      });

      dispatch({ type: 'CREATE_SUCCESS', account });

      if (account.status === 'FAILED') {
        notificationsService.warning('Warm-up account needs attention');
      } else {
        notificationsService.success('Warm-up account provisioned');
      }
    } catch (error) {
      logger.error('Failed to create warm-up account', error);
      notificationsService.error('Failed to create warm-up account');
    } finally {
      dispatch({ type: 'SET_SUBMITTING', isSubmitting: false });
    }
  }

  return (
    <Container
      label="Warm-up accounts"
      description="Provision lead accounts for operator-prepared customer demos"
      icon={Rocket}
      headerTabs={{
        activeTab,
        fullWidth: false,
        onTabChange: (tab) => {
          activeInvitationRequestRef.current?.controller.abort();
          dispatch({ type: 'SET_TAB', tab: tab as 'accounts' | 'create' });
        },
        tabs: TABS,
      }}
    >
      {activeTab === 'create' && (
        <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Lead email" required htmlFor="warmup-lead-email">
              <Input
                id="warmup-lead-email"
                type="email"
                value={form.leadEmail}
                onChange={(event) =>
                  handleFieldChange('leadEmail', event.target.value)
                }
                disabled={isSubmitting}
                placeholder="founder@example.com"
                required
              />
            </Field>

            <Field label="Website" htmlFor="warmup-website-url">
              <Input
                id="warmup-website-url"
                type="url"
                value={form.websiteUrl}
                onChange={(event) =>
                  handleFieldChange('websiteUrl', event.target.value)
                }
                disabled={isSubmitting}
                placeholder="https://example.com"
              />
            </Field>

            <Field label="First name" htmlFor="warmup-lead-first-name">
              <Input
                id="warmup-lead-first-name"
                value={form.leadFirstName}
                onChange={(event) =>
                  handleFieldChange('leadFirstName', event.target.value)
                }
                disabled={isSubmitting}
                placeholder="Ada"
              />
            </Field>

            <Field label="Last name" htmlFor="warmup-lead-last-name">
              <Input
                id="warmup-lead-last-name"
                value={form.leadLastName}
                onChange={(event) =>
                  handleFieldChange('leadLastName', event.target.value)
                }
                disabled={isSubmitting}
                placeholder="Lovelace"
              />
            </Field>

            <Field
              label="Organization"
              required
              htmlFor="warmup-organization-name"
            >
              <Input
                id="warmup-organization-name"
                value={form.organizationName}
                onChange={(event) =>
                  handleFieldChange('organizationName', event.target.value)
                }
                disabled={isSubmitting}
                placeholder="Acme Growth"
                required
              />
            </Field>

            <Field label="First brand" required htmlFor="warmup-brand-name">
              <Input
                id="warmup-brand-name"
                value={form.brandName}
                onChange={(event) =>
                  handleFieldChange('brandName', event.target.value)
                }
                disabled={isSubmitting}
                placeholder="Acme"
                required
              />
            </Field>
          </div>

          <Field label="Operator guidance" htmlFor="warmup-guidance">
            <Textarea
              id="warmup-guidance"
              className="min-h-[140px]"
              value={form.guidance}
              onChange={(event) =>
                handleFieldChange('guidance', event.target.value)
              }
              disabled={isSubmitting}
              placeholder="Context to preserve for the operator before starter content is prepared"
            />
          </Field>

          <Button
            type="submit"
            isDisabled={isSubmitting}
            className="inline-flex items-center gap-2"
          >
            {isSubmitting ? (
              <RefreshCw className="size-4 animate-spin" />
            ) : (
              <CircleCheck className="size-4" />
            )}
            {isSubmitting ? 'Provisioning' : 'Provision warm-up account'}
          </Button>
        </form>
      )}

      {activeTab === 'accounts' && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.75fr)]">
          <WarmupAccountList
            accounts={accounts}
            isLoading={isLoading}
            selectedAccountId={selectedAccount?.id}
            onSelectAccount={(accountId) => {
              if (accountId !== state.selectedAccountId) {
                activeInvitationRequestRef.current?.controller.abort();
              }
              dispatch({ type: 'SET_SELECTED', accountId });
            }}
          />
          <WarmupAccountDetail
            account={selectedAccount}
            invitationAction={
              invitationAction &&
              invitationAction.accountId === selectedAccount?.id
                ? invitationAction.action
                : null
            }
            onInspect={() => {
              if (selectedAccount) {
                void runInvitationAction('inspect', selectedAccount.id);
              }
            }}
            onResend={() => {
              if (selectedAccount) {
                void runInvitationAction('resend', selectedAccount.id);
              }
            }}
            onRevoke={() => {
              if (selectedAccount) {
                void runInvitationAction('revoke', selectedAccount.id);
              }
            }}
            onSend={() => {
              if (selectedAccount) {
                void runInvitationAction('send', selectedAccount.id);
              }
            }}
          />
        </div>
      )}
    </Container>
  );
}

function Field({
  children,
  htmlFor,
  label,
  required = false,
}: {
  children: React.ReactNode;
  htmlFor: string;
  label: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {label}
        {required ? <span className="text-muted-foreground"> *</span> : null}
      </label>
      {children}
    </div>
  );
}

function WarmupAccountList({
  accounts,
  isLoading,
  onSelectAccount,
  selectedAccountId,
}: {
  accounts: IWarmupAccount[];
  isLoading: boolean;
  onSelectAccount: (accountId: string) => void;
  selectedAccountId?: string;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {WARMUP_SKELETON_KEYS.map((key) => (
          <SkeletonCard key={key} showImage={false} />
        ))}
      </div>
    );
  }

  if (accounts.length === 0) {
    return <CardEmpty label="No warm-up accounts yet" />;
  }

  return (
    <div className="space-y-3">
      {accounts.map((account) => {
        const status = getStatusMeta(account.status);
        const isSelected = selectedAccountId === account.id;

        return (
          <Button
            key={account.id}
            type="button"
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            onClick={() => onSelectAccount(account.id)}
            className={`w-full p-4 text-left transition-colors ${
              isSelected
                ? 'shadow-border-strong bg-primary/5'
                : 'shadow-border bg-card hover:shadow-border-strong'
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  {account.organizationName}
                </h3>
                <p className="mt-1 text-xs text-foreground/60">
                  {account.leadEmail}
                </p>
              </div>
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-foreground/50">
              <span>{account.brandName}</span>
              <span>{formatDate(account.createdAt)}</span>
            </div>
          </Button>
        );
      })}
    </div>
  );
}

function WarmupAccountDetail({
  account,
  invitationAction = null,
  onInspect,
  onResend,
  onRevoke,
  onSend,
}: WarmupAccountDetailProps) {
  const translate = useTranslations('pages.warmupAccounts');

  if (!account) {
    return (
      <div className="shadow-border bg-card p-5">
        <CardEmpty label="Select a warm-up account" />
      </div>
    );
  }

  const status = getStatusMeta(account.status);
  const diagnostics = account.diagnostics?.steps ?? [];
  const invitation = account.invitation;
  const isActionPending = invitationAction !== null;
  const resendLabel =
    invitation?.status === 'delivery-failed'
      ? translate('invitation.retry')
      : translate('invitation.resend');

  return (
    <aside className="shadow-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            {account.brandName}
          </h2>
          <p className="mt-1 text-sm text-foreground/60">
            {account.organizationName}
          </p>
        </div>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>

      <dl className="mt-5 grid gap-3 text-sm">
        <DetailRow label="Lead" value={account.leadEmail} />
        <DetailRow label="Organization ID" value={account.organizationId} />
        <DetailRow label="Brand ID" value={account.brandId} />
        <DetailRow label="Invitation ID" value={account.invitationId} />
        <DetailRow label="Operator ID" value={account.operatorUserId} />
      </dl>

      <div className="mt-6 border-t border-border pt-5">
        <h3 className="text-sm font-semibold text-foreground">
          {translate('invitation.lifecycle')}
        </h3>
        {invitation ? (
          <dl className="mt-3 grid gap-3 text-sm">
            <DetailRow
              label={translate('invitation.status')}
              value={formatInvitationStatus(invitation.status, translate)}
            />
            <DetailRow
              label={translate('invitation.expiresAt')}
              value={formatDate(invitation.expiresAt)}
            />
            {invitation.acceptedAt ? (
              <DetailRow
                label={translate('invitation.acceptedAt')}
                value={formatDate(invitation.acceptedAt)}
              />
            ) : null}
            {invitation.revokedAt ? (
              <DetailRow
                label={translate('invitation.revokedAt')}
                value={formatDate(invitation.revokedAt)}
              />
            ) : null}
          </dl>
        ) : (
          <p className="mt-2 text-sm text-foreground/50">
            {translate('invitation.missing')}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
            icon={<Search className="size-4" />}
            isDisabled={isActionPending}
            isLoading={invitationAction === 'inspect'}
            label={translate('invitation.inspect')}
            onClick={onInspect}
          />
          {canSendInvitation(account) ? (
            <Button
              type="button"
              size={ButtonSize.SM}
              icon={<Mail className="size-4" />}
              isDisabled={isActionPending}
              isLoading={invitationAction === 'send'}
              label={translate('invitation.send')}
              onClick={onSend}
            />
          ) : null}
          {canResendInvitation(account) ? (
            <Button
              type="button"
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
              icon={<RotateCw className="size-4" />}
              isDisabled={isActionPending}
              isLoading={invitationAction === 'resend'}
              label={resendLabel}
              onClick={onResend}
            />
          ) : null}
          {canRevokeInvitation(account) ? (
            <Button
              type="button"
              size={ButtonSize.SM}
              variant={ButtonVariant.DESTRUCTIVE}
              icon={<Ban className="size-4" />}
              isDisabled={isActionPending}
              isLoading={invitationAction === 'revoke'}
              label={translate('invitation.revoke')}
              onClick={onRevoke}
            />
          ) : null}
        </div>
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <h3 className="text-sm font-semibold text-foreground">Diagnostics</h3>
        {diagnostics.length === 0 ? (
          <p className="mt-2 text-sm text-foreground/50">
            No diagnostic events recorded.
          </p>
        ) : (
          <ol className="mt-3 space-y-3">
            {diagnostics.map((step, index) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: timestamp+message collide on same-ms duplicate steps; index is the correct disambiguator
                key={`${step.timestamp}-${step.message}-${index}`}
                className="flex gap-3 text-sm"
              >
                <Badge variant={step.status === 'failed' ? 'error' : 'outline'}>
                  {step.status}
                </Badge>
                <div>
                  <p className="text-foreground">{step.message}</p>
                  <p className="text-xs text-foreground/50">
                    {formatDate(step.timestamp)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
        {account.diagnostics?.error ? (
          <p className="mt-4 bg-error/10 p-3 text-sm text-error">
            {account.diagnostics.error}
          </p>
        ) : null}
      </div>
    </aside>
  );
}

function DetailRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="grid gap-1">
      <dt className="text-xs uppercase tracking-wide text-foreground/40">
        {label}
      </dt>
      <dd className="break-all text-foreground">{value ?? 'Pending'}</dd>
    </div>
  );
}
