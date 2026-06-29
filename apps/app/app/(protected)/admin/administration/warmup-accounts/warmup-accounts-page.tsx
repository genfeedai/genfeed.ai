'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type {
  IWarmupAccount,
  IWarmupAccountStatus,
} from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type {
  WarmupAccountFormState,
  WarmupAccountsPageProps,
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
import { useCallback, useEffect, useMemo, useReducer } from 'react';
import {
  HiArrowPath,
  HiOutlineCheckCircle,
  HiOutlineRocketLaunch,
} from 'react-icons/hi2';

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
  isLoading: boolean;
  isSubmitting: boolean;
  selectedAccountId?: string;
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
  | { type: 'CREATE_SUCCESS'; account: IWarmupAccount };

function pageReducer(state: PageState, action: PageAction): PageState {
  switch (action.type) {
    case 'CREATE_SUCCESS': {
      const remaining = state.accounts.filter(
        (account) => account.id !== action.account.id,
      );
      return {
        ...state,
        accounts: [action.account, ...remaining],
        activeTab: 'accounts',
        form: INITIAL_FORM,
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
    case 'SET_LOADING':
      return { ...state, isLoading: action.isLoading };
    case 'SET_SELECTED':
      return { ...state, selectedAccountId: action.accountId };
    case 'SET_SUBMITTING':
      return { ...state, isSubmitting: action.isSubmitting };
    case 'SET_TAB':
      return {
        ...state,
        activeTab: action.tab,
        isLoading: action.tab === 'accounts' ? true : state.isLoading,
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

export default function WarmupAccountsPage({
  defaultTab = 'create',
}: WarmupAccountsPageProps) {
  const [state, dispatch] = useReducer(pageReducer, {
    accounts: [],
    activeTab: defaultTab,
    form: INITIAL_FORM,
    isLoading: defaultTab === 'accounts',
    isSubmitting: false,
  });

  const { accounts, activeTab, form, isLoading, isSubmitting } = state;
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

  useEffect(() => {
    if (activeTab !== 'accounts') {
      return;
    }

    const controller = new AbortController();
    loadAccounts(controller.signal);

    return () => controller.abort();
  }, [activeTab, loadAccounts]);

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
      icon={HiOutlineRocketLaunch}
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={(tab) =>
        dispatch({ type: 'SET_TAB', tab: tab as 'accounts' | 'create' })
      }
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
              <HiArrowPath className="size-4 animate-spin" />
            ) : (
              <HiOutlineCheckCircle className="size-4" />
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
            onSelectAccount={(accountId) =>
              dispatch({ type: 'SET_SELECTED', accountId })
            }
          />
          <WarmupAccountDetail account={selectedAccount} />
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
        {required ? <span className="text-rose-400"> *</span> : null}
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
            className={`w-full border p-4 text-left transition-colors ${
              isSelected
                ? 'border-primary/50 bg-primary/5'
                : 'border-white/5 bg-card hover:border-white/15'
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

function WarmupAccountDetail({ account }: { account?: IWarmupAccount }) {
  if (!account) {
    return (
      <div className="border border-white/5 bg-card p-5">
        <CardEmpty label="Select a warm-up account" />
      </div>
    );
  }

  const status = getStatusMeta(account.status);
  const diagnostics = account.diagnostics?.steps ?? [];

  return (
    <aside className="border border-white/5 bg-card p-5">
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

      <div className="mt-6 border-t border-white/5 pt-5">
        <h3 className="text-sm font-semibold text-foreground">Diagnostics</h3>
        {diagnostics.length === 0 ? (
          <p className="mt-2 text-sm text-foreground/50">
            No diagnostic events recorded.
          </p>
        ) : (
          <ol className="mt-3 space-y-3">
            {diagnostics.map((step) => (
              <li
                key={`${step.timestamp}-${step.message}`}
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
          <p className="mt-4 border border-rose-500/20 bg-rose-500/5 p-3 text-sm text-rose-200">
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
