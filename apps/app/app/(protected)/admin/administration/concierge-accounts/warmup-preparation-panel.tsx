'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type {
  BrandKitFieldKey,
  IWarmupPrepareRequest,
} from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { WarmupPreparationPanelProps } from '@props/admin/warmup-accounts.props';
import { AdminWarmupAccountsService } from '@services/admin/warmup-accounts.service';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import Field from '@ui/primitives/field';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import { RadioGroup, RadioGroupItem } from '@ui/primitives/radio-group';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export default function WarmupPreparationPanel({
  account,
  onUpdated,
}: WarmupPreparationPanelProps) {
  const translate = useTranslations('pages.warmupAccounts.preparation');
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState('500');
  const [reason, setReason] = useState(translate('defaultReason'));
  const [sourceUrl, setSourceUrl] = useState(account.websiteUrl ?? '');
  const [publicProfileUrl, setPublicProfileUrl] = useState('');
  const [accepted, setAccepted] = useState<BrandKitFieldKey[]>([]);
  const [assetCandidateId, setAssetCandidateId] = useState('');
  const [assetId, setAssetId] = useState('');
  const [articleId, setArticleId] = useState('');
  const getService = useAuthedService((token: string) =>
    AdminWarmupAccountsService.getInstance(token),
  );
  const preparation = account.diagnostics.preparation;
  const closed = account.status === 'CLAIMED' || account.status === 'ARCHIVED';
  const disabled = pending !== null;

  async function run(request: IWarmupPrepareRequest) {
    setPending(request.action);
    setError(null);
    try {
      const service = await getService();
      onUpdated(await service.prepareWarmupAccount(account.id, request));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : translate('error'));
    } finally {
      setPending(null);
    }
  }

  return (
    <section
      className="space-y-5 border-t border-border pt-5"
      aria-label={translate('title')}
      aria-busy={disabled}
    >
      <div>
        <h3 className="text-sm font-semibold">
          {closed
            ? translate('handoff')
            : account.readiness?.ready
              ? translate('ready')
              : translate('prepareHandoff')}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {translate('availableCredits', {
            amount: account.readiness?.availableCredits ?? 0,
          })}
          {preparation?.grant
            ? translate('promisedCredits', { amount: preparation.grant.amount })
            : ''}
        </p>
        {preparation?.preparationCredits ? (
          <p className="text-sm text-muted-foreground">
            {translate('reimbursedCredits', {
              amount: preparation.preparationCredits,
            })}
          </p>
        ) : null}
        {!closed && account.readiness?.blockers.length ? (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {account.readiness.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        ) : null}
        {account.status === 'CLAIMED' && (
          <p className="mt-2 text-sm text-muted-foreground">
            {translate('claimed')}
          </p>
        )}
        {!closed && account.readiness?.workspacePath && (
          <Link
            className="mt-3 inline-block text-sm underline"
            href={account.readiness.workspacePath}
          >
            {translate('openWorkspace')}
          </Link>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!closed && (
        <>
          <Button
            label={
              pending === 'repair'
                ? translate('repairing')
                : translate('repair')
            }
            variant={ButtonVariant.SECONDARY}
            isDisabled={disabled}
            onClick={() => void run({ action: 'repair' })}
          />
          {!preparation?.grant && (
            <Form
              onSubmit={(event) => {
                event.preventDefault();
                void run({
                  action: 'fund',
                  amount: Number(amount),
                  reason,
                });
              }}
            >
              <Field label={translate('grantAmount')}>
                <Input
                  aria-label={translate('grantAmount')}
                  type="number"
                  min={1}
                  max={100000}
                  required
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </Field>
              <Field label={translate('grantReason')}>
                <Input
                  aria-label={translate('grantReason')}
                  required
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </Field>
              <p className="text-xs text-muted-foreground">
                {translate('grantTerms')}
              </p>
              <Button
                type="submit"
                label={translate('grant')}
                isDisabled={disabled}
              />
            </Form>
          )}
          <Form
            onSubmit={(event) => {
              event.preventDefault();
              setAccepted([]);
              void run({
                action: 'preview-context',
                sourceUrl,
                ...(publicProfileUrl ? { publicProfileUrl } : {}),
              });
            }}
          >
            <Field label={translate('website')}>
              <Input
                aria-label={translate('website')}
                type="url"
                required
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
              />
            </Field>
            <Field label={translate('profile')}>
              <Input
                aria-label={translate('profile')}
                type="url"
                value={publicProfileUrl}
                onChange={(event) => setPublicProfileUrl(event.target.value)}
              />
            </Field>
            <p className="text-xs text-muted-foreground">
              {translate('contextNotice')}
            </p>
            <Button
              type="submit"
              label={translate('importContext')}
              variant={ButtonVariant.SECONDARY}
              isDisabled={disabled}
            />
          </Form>
          {preparation?.context && (
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold">
                {translate('reviewContext')}
              </legend>
              {Object.values(preparation.context.fields).map((field) =>
                field && field.proposedValue !== undefined ? (
                  <label
                    key={field.key}
                    className="flex items-start gap-3 text-sm"
                  >
                    <Checkbox
                      className="mt-1 size-4"
                      aria-label={translate('applyField', {
                        field: field.label,
                      })}
                      isChecked={accepted.includes(field.key)}
                      onCheckedChange={(checked) =>
                        setAccepted((current) =>
                          checked === true
                            ? [...current, field.key]
                            : current.filter((key) => key !== field.key),
                        )
                      }
                    />
                    <span className="min-w-0">
                      <span className="font-medium">{field.label}</span>
                      <span className="mt-1 block whitespace-pre-wrap break-words text-muted-foreground">
                        {typeof field.proposedValue === 'string'
                          ? field.proposedValue
                          : JSON.stringify(field.proposedValue)}
                      </span>
                      {field.confidence !== undefined && (
                        <span className="block text-xs text-muted-foreground">
                          {translate('confidence', {
                            percent: Math.round(field.confidence * 100),
                          })}
                        </span>
                      )}
                    </span>
                  </label>
                ) : null,
              )}
              <Button
                label={translate('apply')}
                isDisabled={disabled || accepted.length === 0}
                onClick={() => {
                  const fields: NonNullable<
                    IWarmupPrepareRequest['contextDecisions']
                  >['fields'] = {};
                  for (const key of accepted)
                    fields[key] = {
                      action: 'accept',
                      value: preparation.context?.fields[key]?.proposedValue,
                    };
                  void run({
                    action: 'apply-context',
                    contextDecisions: {
                      fields,
                      draftId: preparation.context?.id,
                    },
                  });
                }}
              />
              <div className="space-y-1 text-xs text-muted-foreground">
                {preparation.context.evidence.map((evidence) => (
                  <p key={`${evidence.url}-${evidence.label}`}>
                    {evidence.label}
                    {evidence.url ? ` · ${evidence.url}` : ''}
                  </p>
                ))}
              </div>
            </fieldset>
          )}
          {preparation?.contextReviewedAt && !preparation.generation && (
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold">
                {translate('starterTitle')}
              </legend>
              <p className="text-sm text-muted-foreground">
                {translate('starterNotice')}
              </p>
              <RadioGroup
                aria-label={translate('starterAsset')}
                value={assetCandidateId}
                onValueChange={setAssetCandidateId}
              >
                {preparation.context?.assetCandidates
                  .filter((asset) => asset.url)
                  .map((asset) => (
                    <label
                      key={asset.candidateId}
                      className="flex items-start gap-2 text-sm"
                    >
                      <RadioGroupItem
                        value={asset.candidateId}
                        aria-label={asset.label || asset.role}
                      />
                      <span>
                        {asset.label || asset.role}
                        <span className="block break-all text-xs text-muted-foreground">
                          {asset.url}
                        </span>
                      </span>
                    </label>
                  ))}
              </RadioGroup>
              <Button
                label={translate('prepare')}
                isDisabled={
                  disabled ||
                  !preparation.grant ||
                  (!assetCandidateId && !preparation.assetId)
                }
                onClick={() =>
                  void run({ action: 'starter-content', assetCandidateId })
                }
              />
            </fieldset>
          )}
          {preparation?.generation && (
            <p role="status" className="text-sm text-muted-foreground">
              {translate('generationStatus', {
                status: preparation.generation.status,
              })}
            </p>
          )}
          <details className="space-y-3 text-sm">
            <summary className="cursor-pointer font-medium">
              {translate('existingTitle')}
            </summary>
            <p className="text-muted-foreground">
              {translate('existingNotice')}
            </p>
            <Field label={translate('assetId')}>
              <Input
                aria-label={translate('assetId')}
                value={assetId}
                onChange={(event) => setAssetId(event.target.value)}
              />
            </Field>
            <Field label={translate('articleId')}>
              <Input
                aria-label={translate('articleId')}
                value={articleId}
                onChange={(event) => setArticleId(event.target.value)}
              />
            </Field>
            <Button
              label={translate('attach')}
              variant={ButtonVariant.SECONDARY}
              isDisabled={disabled || !assetId || !articleId}
              onClick={() =>
                void run({ action: 'attach-starters', assetId, articleId })
              }
            />
          </details>
          <Button
            label={translate('archive')}
            variant={ButtonVariant.DESTRUCTIVE}
            isDisabled={
              disabled || preparation?.generation?.status === 'running'
            }
            onClick={() => void run({ action: 'archive' })}
          />
        </>
      )}
    </section>
  );
}
