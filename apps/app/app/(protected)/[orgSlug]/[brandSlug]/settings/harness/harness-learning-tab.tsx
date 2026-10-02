'use client';

import {
  ButtonVariant,
  ContentLearningMode,
  MemberRole,
} from '@genfeedai/contracts';
import type {
  LearningAccountView,
  LearningControlInput,
} from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import { ContentLearningService } from '@genfeedai/services/analytics/content-learning.service';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useUserRole } from '@hooks/auth/use-user-role/use-user-role';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import type { HarnessLearningTabProps } from '@props/settings/harness.props';
import { getJsonApiErrorMember } from '@services/core/json-api-error-message';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

type SafetyAction = 'pause' | 'shadow' | 'disable';
const ACTIONS: SafetyAction[] = ['pause', 'shadow', 'disable'];

function statusCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  if ('isAuthError' in error && error.isAuthError === true) return 401;
  const member = getJsonApiErrorMember(error);
  const response = 'response' in error ? error.response : undefined;
  const status =
    member?.status ??
    ('status' in error ? error.status : undefined) ??
    ('statusCode' in error ? error.statusCode : undefined) ??
    (typeof response === 'object' && response !== null && 'status' in response
      ? response.status
      : undefined);
  return typeof status === 'number' && Number.isInteger(status)
    ? status
    : undefined;
}

export default function HarnessLearningTab({
  brandId,
}: HarnessLearningTabProps) {
  const scope = useCollectionScope();
  // Remount before rendering any evidence when organization, brand or readiness changes.
  return (
    <LearningStatus
      key={JSON.stringify([
        scope.organizationId,
        scope.brandId,
        scope.isReady,
        brandId,
      ])}
      brandId={brandId}
    />
  );
}

function LearningStatus({ brandId }: HarnessLearningTabProps) {
  const translate = useTranslations('pages.brandHarnessSettings.learning');
  const scope = useCollectionScope();
  const role = useUserRole();
  const canManage = role === MemberRole.OWNER || role === MemberRole.ADMIN;
  const isReady =
    scope.isReady && Boolean(scope.organizationId) && scope.brandId === brandId;
  const organizationId = scope.organizationId;
  const getService = useAuthedService((token: string) =>
    ContentLearningService.getInstance(token),
  );
  const [accounts, setAccounts] = useState<LearningAccountView[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasReadError, setHasReadError] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [intent, setIntent] = useState<LearningControlInput | null>(null);
  const [intentCredential, setIntentCredential] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [hasRetry, setHasRetry] = useState(false);
  const [hasCompleted, setHasCompleted] = useState(false);
  const isMounted = useRef(true);
  const pendingRef = useRef(false);
  const readController = useRef<AbortController | null>(null);
  const readSequence = useRef(0);

  const load = useCallback(
    async function load(
      signal: AbortSignal,
      sequence: number,
    ): Promise<boolean> {
      setIsLoading(true);
      setHasReadError(false);
      try {
        const service = await getService();
        if (signal.aborted || !isMounted.current) return false;
        const data = await service.accounts(brandId, signal);
        if (
          signal.aborted ||
          !isMounted.current ||
          sequence !== readSequence.current
        )
          return false;
        if (
          data.some(
            (account) =>
              account.organizationId !== organizationId ||
              account.brandId !== brandId,
          )
        ) {
          throw new Error('Learning scope mismatch');
        }
        setAccounts(data);
        return true;
      } catch {
        if (
          !signal.aborted &&
          isMounted.current &&
          sequence === readSequence.current
        ) {
          setAccounts(null);
          setHasReadError(true);
        }
        return false;
      } finally {
        if (
          !signal.aborted &&
          isMounted.current &&
          sequence === readSequence.current
        )
          setIsLoading(false);
      }
    },
    [brandId, organizationId, getService],
  );

  useEffect(() => {
    isMounted.current = true;
    if (!isReady || refresh < 0)
      return () => {
        isMounted.current = false;
      };
    const controller = new AbortController();
    readController.current = controller;
    const sequence = ++readSequence.current;
    void load(controller.signal, sequence).then((isLoaded) => {
      if (isLoaded && !controller.signal.aborted && isMounted.current)
        setHasCompleted(false);
    });
    return () => {
      isMounted.current = false;
      controller.abort();
      readController.current?.abort();
    };
  }, [isReady, load, refresh]);

  async function execute(credentialId: string, body: LearningControlInput) {
    if (!canManage || !isReady || pendingRef.current || !isMounted.current)
      return;
    pendingRef.current = true;
    setIsPending(true);
    setHasRetry(false);
    setNotice(null);
    try {
      const service = await getService();
      if (!isMounted.current) return;
      const operation = await service.control(credentialId, body);
      if (!isMounted.current) return;
      if (operation.status !== 'completed') {
        setNotice('operationIncomplete');
        setHasRetry(
          operation.status === 'pending' || operation.status === 'running',
        );
        return;
      }
      setIntent(null);
      setIntentCredential(null);
      setHasCompleted(true);
      setNotice('completed');
      readController.current?.abort();
      const controller = new AbortController();
      readController.current = controller;
      const isLoaded = await load(controller.signal, ++readSequence.current);
      if (!isMounted.current) return;
      if (!isLoaded) setNotice('completedRefreshFailed');
      else setHasCompleted(false);
    } catch (error) {
      if (!isMounted.current) return;
      const status = statusCode(error);
      if (status === 409) {
        setIntent(null);
        setIntentCredential(null);
        setNotice('conflict');
        setRefresh((value) => value + 1);
      } else if (status === 401 || status === 403) {
        setIntent(null);
        setIntentCredential(null);
        setNotice('unauthorized');
      } else {
        setNotice(
          status === undefined || status >= 500 ? 'ambiguous' : 'actionFailed',
        );
        setHasRetry(status === undefined || status >= 500);
        if (status !== undefined && status < 500) {
          setIntent(null);
          setIntentCredential(null);
        }
      }
    } finally {
      if (isMounted.current) {
        pendingRef.current = false;
        setIsPending(false);
      }
    }
  }

  function choose(account: LearningAccountView, action: SafetyAction) {
    if (
      pendingRef.current ||
      isLoading ||
      hasRetry ||
      hasCompleted ||
      !canManage
    )
      return;
    const body: LearningControlInput = {
      action,
      expectedRevision: account.revision,
      requestId: crypto.randomUUID(),
      reason: `Learning settings safety action: ${action}`,
    };
    setIntent(body);
    setIntentCredential(account.credentialId);
    void execute(account.credentialId, body);
  }

  const unavailable = translate('unavailable');
  return (
    <section aria-label={translate('title')} className="grid gap-4">
      <p>{translate('description')}</p>
      <p className="text-sm text-muted-foreground">{translate('threshold')}</p>
      <p className="text-sm text-muted-foreground">
        {translate('receivingExplanation')}
      </p>
      <p className="text-sm text-muted-foreground">
        {translate('safetyExplanation')}
      </p>
      {!canManage ? <p>{translate('readOnly')}</p> : null}
      <Button
        variant={ButtonVariant.SECONDARY}
        disabled={!isReady || isLoading || isPending || hasRetry}
        onClick={() => setRefresh((value) => value + 1)}
      >
        {translate('refresh')}
      </Button>
      {notice ? <p role="status">{translate(notice)}</p> : null}
      {hasRetry && intent && intentCredential && canManage ? (
        <Button
          disabled={isPending}
          onClick={() => void execute(intentCredential, intent)}
        >
          {translate('retryAction')}
        </Button>
      ) : null}
      {!isReady ? (
        <p>{translate('scopeUnavailable')}</p>
      ) : isLoading ? (
        <p role="status">{translate('loading')}</p>
      ) : hasReadError ? (
        <div>
          <p role="alert">{translate('loadError')}</p>
          <Button
            disabled={isPending || hasRetry}
            onClick={() => setRefresh((value) => value + 1)}
          >
            {translate('retryLoad')}
          </Button>
        </div>
      ) : accounts?.length === 0 ? (
        <p>{translate('empty')}</p>
      ) : (
        accounts?.map((account) => (
          <Card key={account.credentialId} bodyClassName="grid gap-3 p-4">
            <h3>
              {translate('accountId')}: <span>{account.credentialId}</span>
            </h3>
            <dl className="grid gap-2">
              <dt>{translate('mode')}</dt>
              <dd>{account.mode}</dd>
              <dt>{translate('revision')}</dt>
              <dd>{account.revision}</dd>
              <dt>{translate('epoch')}</dt>
              <dd>{account.epoch}</dd>
              <dt>{translate('failure')}</dt>
              <dd>{account.failureReason ?? unavailable}</dd>
              <dt>{translate('drift')}</dt>
              <dd>{account.driftState ?? unavailable}</dd>
              <dt>{translate('receiving')}</dt>
              <dd>{account.sharedReleasePreference}</dd>
              <dt>{translate('pinnedRelease')}</dt>
              <dd>{account.pinnedReleaseId ?? unavailable}</dd>
              <dt>{translate('consentVersion')}</dt>
              <dd>{account.sharingConsentVersion ?? translate('noConsent')}</dd>
            </dl>
            {account.scopes?.length ? (
              account.scopes.map((cell) => (
                <section
                  key={cell.scopeKey}
                  className="grid gap-2 rounded border p-3"
                >
                  <h4>{translate('scopedEvidence')}</h4>
                  <dl className="grid gap-2">
                    <dt>{translate('platform')}</dt>
                    <dd>{cell.descriptor.platform}</dd>
                    <dt>{translate('format')}</dt>
                    <dd>{cell.descriptor.format}</dd>
                    <dt>{translate('objective')}</dt>
                    <dd>{cell.descriptor.objective}</dd>
                    <dt>{translate('metricMask')}</dt>
                    <dd>
                      {cell.descriptor.metricWeights
                        .map(([metric, weight]) => `${metric}: ${weight}`)
                        .join(', ') || unavailable}
                    </dd>
                    <dt>{translate('exposureSource')}</dt>
                    <dd>{cell.descriptor.exposureSource}</dd>
                    <dt>{translate('descriptorHash')}</dt>
                    <dd>{cell.descriptorHash}</dd>
                    <dt>{translate('configVersion')}</dt>
                    <dd>{cell.descriptor.configVersion}</dd>
                    <dt>{translate('featureVersion')}</dt>
                    <dd>{cell.descriptor.featureSchema}</dd>
                    <dt>{translate('armVersion')}</dt>
                    <dd>{cell.descriptor.armCatalogVersion}</dd>
                    <dt>{translate('window')}</dt>
                    <dd>{cell.descriptor.windowId}</dd>
                    <dt>{translate('revision')}</dt>
                    <dd>{cell.revision}</dd>
                    <dt>{translate('epoch')}</dt>
                    <dd>{cell.epoch}</dd>
                    <dt>{translate('baselineCount')}</dt>
                    <dd>{cell.baselineCount}</dd>
                    <dt>{translate('activePolicy')}</dt>
                    <dd>{cell.activePolicyId ?? unavailable}</dd>
                    <dt>{translate('pinnedPolicy')}</dt>
                    <dd>{cell.pinnedPolicyId ?? unavailable}</dd>
                    <dt>{translate('lastReward')}</dt>
                    <dd>{cell.lastValidRewardAt ?? unavailable}</dd>
                    <dt>{translate('exclusions')}</dt>
                    <dd>
                      {cell.unavailableReasons.length
                        ? cell.unavailableReasons.join(', ')
                        : translate('noneReported')}
                    </dd>
                  </dl>
                </section>
              ))
            ) : (
              <p>{translate('noEvidence')}</p>
            )}
            <h4>{translate('selectedStrategy')}</h4>
            <p>{translate('selectionExplanation')}</p>
            {account.latestDecision ? (
              <dl className="grid gap-2">
                <dt>{translate('decisionId')}</dt>
                <dd>{account.latestDecision.decisionId ?? unavailable}</dd>
                <dt>{translate('selectedArm')}</dt>
                <dd>{account.latestDecision.armId ?? unavailable}</dd>
                <dt>{translate('selectedPolicy')}</dt>
                <dd>{account.latestDecision.policyVersionId ?? unavailable}</dd>
                <dt>{translate('configVersion')}</dt>
                <dd>{account.latestDecision.configVersion}</dd>
                <dt>{translate('descriptorHash')}</dt>
                <dd>{account.latestDecision.descriptorHash ?? unavailable}</dd>
              </dl>
            ) : (
              <p>{translate('selectionUnavailable')}</p>
            )}
            {canManage ? (
              <div className="flex flex-wrap gap-2">
                {ACTIONS.map((action) => (
                  <Button
                    key={action}
                    variant={ButtonVariant.SECONDARY}
                    disabled={
                      isPending ||
                      isLoading ||
                      hasRetry ||
                      hasCompleted ||
                      (action === 'pause' &&
                        account.mode === ContentLearningMode.PAUSED) ||
                      (action === 'shadow' &&
                        account.mode === ContentLearningMode.SHADOW) ||
                      (action === 'disable' &&
                        account.mode === ContentLearningMode.DISABLED)
                    }
                    onClick={() => choose(account, action)}
                  >
                    {translate(`actions.${action}`)}
                  </Button>
                ))}
              </div>
            ) : null}
          </Card>
        ))
      )}
    </section>
  );
}
