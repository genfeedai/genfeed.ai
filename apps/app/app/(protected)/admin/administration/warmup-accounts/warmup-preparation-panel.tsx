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
import { Input } from '@ui/primitives/input';
import { RadioGroup, RadioGroupItem } from '@ui/primitives/radio-group';
import Link from 'next/link';
import { useState } from 'react';

export default function WarmupPreparationPanel({
  account,
  onUpdated,
}: WarmupPreparationPanelProps) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState('500');
  const [reason, setReason] = useState('Promotional customer evaluation');
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
      setError(
        failure instanceof Error
          ? failure.message
          : 'Preparation failed. Your completed work has been preserved.',
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <section
      className="space-y-5 border-t border-border pt-5"
      aria-label="Workspace preparation"
      aria-busy={disabled}
    >
      <div>
        <h3 className="text-sm font-semibold">
          {closed
            ? 'Handoff'
            : account.readiness?.ready
              ? 'Ready to invite'
              : 'Prepare for handoff'}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {account.readiness?.availableCredits ?? 0} spendable credits
          {preparation?.grant
            ? ` · ${preparation.grant.amount} promised at handoff`
            : ''}
        </p>
        {preparation?.preparationCredits ? (
          <p className="text-sm text-muted-foreground">
            {preparation.preparationCredits} preparation credits reimbursed
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
            Customer owns the workspace. Operator preparation access has ended.
            The customer must connect their own social accounts before
            publishing.
          </p>
        )}
        {!closed && account.readiness?.workspacePath && (
          <Link
            className="mt-3 inline-block text-sm underline"
            href={account.readiness.workspacePath}
          >
            Open prepared workspace as yourself
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
                ? 'Repairing…'
                : 'Repair and refresh readiness'
            }
            variant={ButtonVariant.SECONDARY}
            isDisabled={disabled}
            onClick={() => void run({ action: 'repair' })}
          />
          {!preparation?.grant && (
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void run({
                  action: 'fund',
                  amount: Number(amount),
                  reason,
                });
              }}
            >
              <Field label="Promotional handoff credits">
                <Input
                  aria-label="Promotional handoff credits"
                  type="number"
                  min={1}
                  max={100000}
                  required
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </Field>
              <Field label="Grant reason">
                <Input
                  aria-label="Grant reason"
                  required
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </Field>
              <p className="text-xs text-muted-foreground">
                Promotional handoff credits do not expire.
              </p>
              <Button
                type="submit"
                label="Grant credits"
                isDisabled={disabled}
              />
            </form>
          )}
          <form
            className="space-y-3"
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
            <Field label="Public brand website">
              <Input
                aria-label="Public brand website"
                type="url"
                required
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
              />
            </Field>
            <Field label="Public LinkedIn or X profile (optional)">
              <Input
                aria-label="Public LinkedIn or X profile (optional)"
                type="url"
                value={publicProfileUrl}
                onChange={(event) => setPublicProfileUrl(event.target.value)}
              />
            </Field>
            <p className="text-xs text-muted-foreground">
              Import public company information only. Review extracted fields
              before applying them.
            </p>
            <Button
              type="submit"
              label="Import context for review"
              variant={ButtonVariant.SECONDARY}
              isDisabled={disabled}
            />
          </form>
          {preparation?.context && (
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold">
                Review brand context
              </legend>
              {Object.values(preparation.context.fields).map((field) =>
                field && field.proposedValue !== undefined ? (
                  <label
                    key={field.key}
                    className="flex items-start gap-3 text-sm"
                  >
                    <Checkbox
                      className="mt-1 size-4"
                      aria-label={`Apply ${field.label}`}
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
                          Confidence {Math.round(field.confidence * 100)}%
                        </span>
                      )}
                    </span>
                  </label>
                ) : null,
              )}
              <Button
                label="Apply selected fields"
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
                Private starter content
              </legend>
              <p className="text-sm text-muted-foreground">
                Select the brand asset to import. Genfeed will also generate one
                LinkedIn article draft using the reviewed brand context. Nothing
                is published.
              </p>
              <RadioGroup
                aria-label="Starter brand asset"
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
                label="Prepare starter asset and article"
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
              Starter generation: {preparation.generation.status}. Use repair to
              reconcile completed outputs and preparation credits.
            </p>
          )}
          <details className="space-y-3 text-sm">
            <summary className="cursor-pointer font-medium">
              Use existing prepared content
            </summary>
            <p className="text-muted-foreground">
              Use a private brand asset and LinkedIn article draft prepared by
              you in this workspace.
            </p>
            <Field label="Brand asset ID">
              <Input
                aria-label="Brand asset ID"
                value={assetId}
                onChange={(event) => setAssetId(event.target.value)}
              />
            </Field>
            <Field label="LinkedIn draft ID">
              <Input
                aria-label="LinkedIn draft ID"
                value={articleId}
                onChange={(event) => setArticleId(event.target.value)}
              />
            </Field>
            <Button
              label="Attach prepared content"
              variant={ButtonVariant.SECONDARY}
              isDisabled={disabled || !assetId || !articleId}
              onClick={() =>
                void run({ action: 'attach-starters', assetId, articleId })
              }
            />
          </details>
          <Button
            label="Archive preparation and revoke invitation"
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
