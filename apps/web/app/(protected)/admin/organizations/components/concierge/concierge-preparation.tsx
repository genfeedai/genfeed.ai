'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type {
  BrandKitFieldKey,
  IWarmupPrepareRequest,
} from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { AdminWarmupAccountsService } from '@services/admin/warmup-accounts.service';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@ui/primitives/accordion';
import { BrandAvatar } from '@ui/primitives/brand-avatar';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import Field from '@ui/primitives/field';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import { Label } from '@ui/primitives/label';
import { RadioGroup, RadioGroupItem } from '@ui/primitives/radio-group';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { ConciergePreparationProps } from '@/features/admin/props/concierge.props';
import { isConciergeClosed } from './concierge-invitation';
import { getProposedValueView } from './proposed-value';

/**
 * The operator's preparation tools for one concierge account, as collapsed
 * sections in the organization's Context sidebar. One section is open at a
 * time; the handoff summary above them says which one is next.
 */
export default function ConciergePreparation({
  account,
  onUpdated,
}: ConciergePreparationProps) {
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
  const isDisabled = pending !== null;

  if (isConciergeClosed(account)) {
    return null;
  }

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
    <section aria-busy={isDisabled} aria-label={translate('title')}>
      {error ? (
        <p role="alert" className="pb-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Accordion type="single" collapsible>
        <AccordionItem value="context">
          <AccordionTrigger>{translate('contextSection')}</AccordionTrigger>
          <AccordionContent>
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
                isDisabled={isDisabled}
              />
            </Form>
            {preparation?.context ? (
              <fieldset className="mt-4 space-y-3">
                <legend className="text-sm font-semibold">
                  {translate('reviewContext')}
                </legend>
                {Object.values(preparation.context.fields).map((field) => {
                  if (!field || field.proposedValue === undefined) {
                    return null;
                  }
                  const view = getProposedValueView(field.proposedValue);

                  return (
                    <Label
                      key={field.key}
                      className="flex items-start gap-3 text-sm font-normal leading-normal"
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
                        {view.kind === 'image' ? (
                          <span className="mt-1 flex items-center gap-2 text-muted-foreground">
                            <BrandAvatar
                              alt={view.label}
                              name={view.label}
                              size="md"
                              src={view.url}
                            />
                            <span className="break-words">{view.label}</span>
                          </span>
                        ) : (
                          <span className="mt-1 block whitespace-pre-wrap break-words text-muted-foreground">
                            {view.text}
                          </span>
                        )}
                        {field.confidence !== undefined ? (
                          <span className="block text-xs text-muted-foreground">
                            {translate('confidence', {
                              percent: Math.round(field.confidence * 100),
                            })}
                          </span>
                        ) : null}
                      </span>
                    </Label>
                  );
                })}
                <Button
                  label={translate('apply')}
                  isDisabled={isDisabled || accepted.length === 0}
                  onClick={() => {
                    const fields: NonNullable<
                      IWarmupPrepareRequest['contextDecisions']
                    >['fields'] = {};
                    for (const key of accepted) {
                      fields[key] = {
                        action: 'accept',
                        value: preparation.context?.fields[key]?.proposedValue,
                      };
                    }
                    void run({
                      action: 'apply-context',
                      contextDecisions: {
                        draftId: preparation.context?.id,
                        fields,
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
            ) : null}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="starter">
          <AccordionTrigger>{translate('starterSection')}</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4">
              {preparation?.contextReviewedAt && !preparation.generation ? (
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
                        <Label
                          key={asset.candidateId}
                          className="flex items-start gap-2 text-sm font-normal leading-normal"
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
                        </Label>
                      ))}
                  </RadioGroup>
                  <Button
                    label={translate('prepare')}
                    isDisabled={
                      isDisabled ||
                      !preparation.grant ||
                      (!assetCandidateId && !preparation.assetId)
                    }
                    onClick={() =>
                      void run({ action: 'starter-content', assetCandidateId })
                    }
                  />
                </fieldset>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {translate('starterWaiting')}
                </p>
              )}
              {preparation?.generation ? (
                <p role="status" className="text-sm text-muted-foreground">
                  {translate('generationStatus', {
                    status: preparation.generation.status,
                  })}
                </p>
              ) : null}
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold">
                  {translate('existingTitle')}
                </legend>
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
                  isDisabled={isDisabled || !assetId || !articleId}
                  onClick={() =>
                    void run({ action: 'attach-starters', assetId, articleId })
                  }
                />
              </fieldset>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="credits">
          <AccordionTrigger>{translate('creditsSection')}</AccordionTrigger>
          <AccordionContent>
            {preparation?.grant ? (
              <p className="text-sm text-muted-foreground">
                {translate('grantedCredits', {
                  amount: preparation.grant.amount,
                })}
              </p>
            ) : (
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
                  isDisabled={isDisabled}
                />
              </Form>
            )}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="archive">
          <AccordionTrigger>{translate('archiveSection')}</AccordionTrigger>
          <AccordionContent>
            <p className="pb-3 text-sm text-muted-foreground">
              {translate('archiveNotice')}
            </p>
            <Button
              label={translate('archive')}
              variant={ButtonVariant.DESTRUCTIVE}
              isDisabled={
                isDisabled || preparation?.generation?.status === 'running'
              }
              onClick={() => void run({ action: 'archive' })}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
}
