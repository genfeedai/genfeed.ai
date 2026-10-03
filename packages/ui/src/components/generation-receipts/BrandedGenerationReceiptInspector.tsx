'use client';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type {
  BrandedGenerationReceiptInspectorProps,
  BrandedGenerationReceiptInspectorState,
} from '@genfeedai/props/content/branded-generation-receipt.props';
import { useBrandedGenerationReceipt } from '@hooks/ui/generation-receipts/use-branded-generation-receipt';
import BrandIdentitySnapshotView from '@ui/components/generation-receipts/BrandIdentitySnapshotView';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';

function recordedDetails(label: string, value: unknown) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">{label}</h3>
      <pre className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
        {JSON.stringify(value, null, 2)}
      </pre>
    </section>
  );
}
function recordedLayers(
  label: string,
  layers: NonNullable<
    BrandedGenerationReceiptInspectorState['receipt']
  >['layers'],
) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">{label}</h3>
      <ul className="space-y-3 text-sm">
        {layers.map((layer, index) => (
          <li key={`${layer.kind}:${layer.id ?? index}`}>
            <p>
              {layer.kind} · {layer.id} · {layer.version} · {layer.status}
            </p>
            <p className="break-all text-xs text-muted-foreground">
              {layer.contentHash}
            </p>
            <p>
              {layer.reasonCode} · {layer.omittedIds.join(', ')} ·{' '}
              {layer.evidenceIds.join(', ')}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
function recordedChecks(
  label: string,
  detailsLabel: string,
  validation: NonNullable<
    BrandedGenerationReceiptInspectorState['receipt']
  >['validation'],
) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">{label}</h3>
      <ul className="space-y-3 text-sm">
        {validation?.checks.map((check) => (
          <li key={check.ruleId}>
            <p>
              {check.ruleId} · {check.category} · {check.severity} ·{' '}
              {check.result}
            </p>
            <p className="text-xs text-muted-foreground">
              {check.method} · {check.evaluatorId} · {check.evaluatorVersion} ·{' '}
              {check.reasonCode} · {check.evidenceIds.join(', ')}
            </p>
          </li>
        ))}
      </ul>
      {validation
        ? recordedDetails(detailsLabel, {
            id: validation.id,
            rubricVersion: validation.rubricVersion,
            checkedAt: validation.checkedAt,
            snapshotHash: validation.snapshotHash,
            artifactId: validation.artifactId,
            artifactVersion: validation.artifactVersion,
            artifactHash: validation.artifactHash,
            quality: validation.quality,
            diagnostics: validation.diagnostics,
          })
        : null}
    </section>
  );
}
function SavedPrompts(state: BrandedGenerationReceiptInspectorState) {
  const t = useTranslations('pages.generationReceipts');
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium">{t('prompts')}</h3>
      {(['original', 'enhanced', 'compiled'] as const).map((stage) => {
        const reference = state.receipt?.prompts[stage];
        const revealed = state.prompts[stage];
        return (
          <div key={stage} className="space-y-2">
            <p className="text-sm">
              {stage} · {reference?.retention ?? t('promptNotRecorded')}
            </p>
            {reference?.retention === 'pending' ? (
              <p className="text-sm text-muted-foreground">
                {t('promptPending')}
              </p>
            ) : null}
            {reference?.retention === 'unavailable' ? (
              <p className="text-sm text-muted-foreground">
                {t('promptUnavailable')} · {reference.reasonCode}
              </p>
            ) : null}
            {reference?.retention === 'retained' && !revealed ? (
              <Button
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
                disabled={state.loadingPrompt !== null}
                onClick={() => void state.revealPrompt(stage)}
                aria-label={`${t('showPrompt')} · ${stage}`}
              >
                {t('showPrompt')}
              </Button>
            ) : null}
            {revealed ? (
              <>
                <Button
                  size={ButtonSize.SM}
                  variant={ButtonVariant.SECONDARY}
                  onClick={() => state.hidePrompt(stage)}
                  aria-label={`${t('hidePrompt')} · ${stage}`}
                >
                  {t('hidePrompt')}
                </Button>
                {revealed.status === 'retained' ? (
                  <pre className="overflow-x-auto whitespace-pre-wrap break-words text-sm">
                    {revealed.text}
                  </pre>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t('promptUnavailable')} · {revealed.reasonCode}
                  </p>
                )}
              </>
            ) : null}
          </div>
        );
      })}
      {state.promptError ? (
        <p role="alert" className="text-sm">
          {t(
            state.promptError === 'restricted'
              ? 'promptRestricted'
              : state.promptError === 'unavailable'
                ? 'promptUnavailable'
                : 'loadFailed',
          )}
        </p>
      ) : null}
    </section>
  );
}
function recordedLearning(
  label: string,
  learning: NonNullable<
    BrandedGenerationReceiptInspectorState['receipt']
  >['learning'],
  unknown: string,
  brandFeedback: string,
  globalRelease: string,
  accountPolicy: string,
) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">{label}</h3>
      <ul className="space-y-3 text-sm">
        <li>
          <p>
            {brandFeedback} · {learning?.brandFeedback.status ?? unknown} ·{' '}
            {learning?.brandFeedback.reasonCode}
          </p>
          <p className="break-words text-xs text-muted-foreground">
            {learning?.brandFeedback.profileId} ·{' '}
            {learning?.brandFeedback.profileVersion} ·{' '}
            {learning?.brandFeedback.contributionHash} ·{' '}
            {learning?.brandFeedback.sourceIds.join(', ')}
          </p>
        </li>
        <li>
          <p>
            {globalRelease} · {learning?.global.status ?? unknown} ·{' '}
            {learning?.global.reasonCode}
          </p>
          <p className="break-words text-xs text-muted-foreground">
            {learning?.global.releaseId} · {learning?.global.releaseRevision} ·{' '}
            {learning?.global.policyId} · {learning?.global.policyVersion} ·{' '}
            {learning?.global.descriptorHash} ·{' '}
            {learning?.global.contributionHash}
          </p>
        </li>
        <li>
          <p>
            {accountPolicy} ·{' '}
            {learning?.privateAccount.application?.status ?? unknown} ·{' '}
            {learning?.privateAccount.application?.appliedArmId} ·{' '}
            {learning?.privateAccount.application?.reasonCodes.join(', ')}
          </p>
          <p className="break-words text-xs text-muted-foreground">
            {learning?.privateAccount.policyVersionId} ·{' '}
            {learning?.privateAccount.decisionId} ·{' '}
            {learning?.privateAccount.descriptorHash} ·{' '}
            {learning?.privateAccount.application?.privatePolicyApplied === true
              ? 'privatePolicyApplied'
              : null}{' '}
            ·{' '}
            {learning?.privateAccount.application?.sharedReleaseApplied === true
              ? 'sharedReleaseApplied'
              : null}
          </p>
        </li>
      </ul>
    </section>
  );
}
function SavedMetadata({
  receipt,
}: Pick<BrandedGenerationReceiptInspectorState, 'receipt'>) {
  const t = useTranslations('pages.generationReceipts');
  if (!receipt) return null;
  return (
    <>
      <dl className="grid gap-2 text-sm">
        <div>
          <dt>{t('revision', { revision: receipt.revision })}</dt>
          <dd>
            {receipt.state} · {receipt.mode} · {receipt.compliance}
          </dd>
        </div>
        <div>
          <dt>{t('identity')}</dt>
          <dd>
            {receipt.snapshot
              ? `${receipt.snapshot.identity.name} · ${t('brandRevision', { version: receipt.snapshot.revisionVersion })} · ${receipt.snapshot.contentHash}`
              : t('unknown')}
          </dd>
        </div>
        <div>
          <dt>{t('budget')}</dt>
          <dd>
            {receipt.budget.generationAttemptsUsed} /{' '}
            {receipt.budget.maximumGenerationAttempts} ·{' '}
            {receipt.budget.automaticPaidRetries}
          </dd>
        </div>
      </dl>
      {recordedLayers(t('layers'), receipt.layers)}
      {recordedLearning(
        t('learning'),
        receipt.learning,
        t('unknown'),
        t('brandFeedback'),
        t('globalRelease'),
        t('accountPolicy'),
      )}
      <section className="space-y-2">
        <h3 className="text-sm font-medium">{t('artifact')}</h3>
        <p className="break-words text-sm">
          {receipt.artifact
            ? `${receipt.artifact.kind} · ${receipt.artifact.id} · ${receipt.artifact.version} · ${receipt.artifact.contentHash}`
            : t('unknown')}
        </p>
        {recordedDetails(t('details'), {
          execution: receipt.execution,
          resolutionHash: receipt.resolutionHash,
        })}
      </section>
      {receipt.validation ? (
        recordedChecks(t('validation'), t('details'), receipt.validation)
      ) : (
        <p className="text-sm text-muted-foreground">{t('noValidation')}</p>
      )}
      <section className="space-y-2">
        <h3 className="text-sm font-medium">{t('costs')}</h3>
        <ul className="space-y-1 text-sm">
          {receipt.costs.map((cost) => (
            <li key={cost.id}>
              {cost.stage} · {cost.status} ·{' '}
              {cost.status === 'known'
                ? (cost.credits ?? `${cost.amount} ${cost.currency}`)
                : t('unknown')}
            </li>
          ))}
        </ul>
      </section>
      {recordedDetails(t('diagnostics'), receipt.diagnostics)}
    </>
  );
}
export default function BrandedGenerationReceiptInspector(
  props: BrandedGenerationReceiptInspectorProps,
) {
  const state = useBrandedGenerationReceipt(props);
  const t = useTranslations('pages.generationReceipts');
  if (!props.isOpen) return null;
  const receipt = state.receipt;
  // Show only the snapshot recorded on this exact loaded receipt revision.
  const isRequestedReceipt = Boolean(
    receipt &&
      receipt.organizationId === props.organizationId &&
      receipt.brandId === props.brandId &&
      ('receiptId' in receipt ? receipt.receiptId : receipt.id) ===
        props.receiptId &&
      (props.revision === undefined || receipt.revision === props.revision),
  );
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{t('details')}</h2>
        <Button
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          onClick={state.refresh}
          disabled={state.isLoading}
        >
          {t('refresh')}
        </Button>
      </div>
      {state.isLoading ? (
        <p role="status" className="text-sm">
          {t('loading')}
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-sm">
          {t(state.error === 'unavailable' ? 'unavailable' : 'loadFailed')}
        </p>
      ) : null}
      {receipt ? (
        <>
          <SavedMetadata receipt={receipt} />
          <BrandIdentitySnapshotView
            snapshot={isRequestedReceipt ? receipt.snapshot : null}
            organizationId={props.organizationId}
            brandId={props.brandId}
            source="receipt_snapshot"
            receiptRevision={receipt.revision}
          />
          <SavedPrompts {...state} />
        </>
      ) : null}
    </div>
  );
}
