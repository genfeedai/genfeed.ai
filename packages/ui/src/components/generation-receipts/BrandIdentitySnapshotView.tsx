'use client';

import { brandIdentitySnapshotV1Schema } from '@genfeedai/contracts/api-types/contracts/branded-generation.contract';
import {
  learningContractIdSchema,
  learningContractRevisionSchema,
} from '@genfeedai/contracts/api-types/contracts/content-learning-generation.contract';
import type { BrandIdentitySnapshotViewProps } from '@genfeedai/props/content/branded-generation-receipt.props';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@ui/primitives/accordion';
import { useTranslations } from 'next-intl';
import { Fragment, type ReactNode } from 'react';

const sections = [
  'facts',
  'approvedLiterals',
  'palette',
  'typography',
  'mandatory',
  'avoid',
  'examples',
  'assets',
  'evidence',
] as const;

function recordedValue(
  value: unknown,
  label: (key: string) => string,
  emptyLabel: string,
): ReactNode {
  if (value === undefined) return emptyLabel;
  if (Array.isArray(value))
    return value.length ? (
      <pre className="whitespace-pre-wrap break-words font-sans">
        {value.map((item) => String(item)).join('\n')}
      </pre>
    ) : (
      emptyLabel
    );
  if (value !== null && typeof value === 'object')
    return (
      <dl className="space-y-2">
        {Object.entries(value).map(([key, item]) => (
          <div key={key}>
            <dt className="font-medium">{label(key)}</dt>
            <dd className="whitespace-pre-wrap break-words">
              {recordedValue(item, label, emptyLabel)}
            </dd>
          </div>
        ))}
      </dl>
    );
  return (
    <span className="whitespace-pre-wrap break-words">{String(value)}</span>
  );
}

export default function BrandIdentitySnapshotView({
  snapshot,
  organizationId,
  brandId,
  source,
  receiptRevision,
}: BrandIdentitySnapshotViewProps) {
  const t = useTranslations('pages.generationReceipts.identitySnapshot');
  const rulesText = useTranslations(
    'pages.brandOsSettings.generationRulesReview',
  );
  const parsed = brandIdentitySnapshotV1Schema.safeParse(snapshot);
  const hasScope =
    learningContractIdSchema.safeParse(organizationId).success &&
    learningContractIdSchema.safeParse(brandId).success;
  if (
    !parsed.success ||
    !hasScope ||
    parsed.data.organizationId !== organizationId ||
    parsed.data.brandId !== brandId ||
    !['current_approved_revision', 'receipt_snapshot'].includes(source) ||
    (source === 'current_approved_revision' &&
      parsed.data.approval !== 'approved') ||
    (receiptRevision !== undefined &&
      !learningContractRevisionSchema.safeParse(receiptRevision).success)
  )
    return <p role="status">{t('unavailable')}</p>;
  const value = parsed.data;
  const diagnosticOccurrences = new Map<string, number>();
  const diagnosticRows = value.diagnostics.map((diagnostic) => {
    const serialized = JSON.stringify(diagnostic);
    const occurrence = (diagnosticOccurrences.get(serialized) ?? 0) + 1;
    diagnosticOccurrences.set(serialized, occurrence);
    return { diagnostic, key: `${serialized}:${occurrence}` };
  });
  const title =
    source === 'current_approved_revision'
      ? t('currentTitle')
      : receiptRevision === undefined
        ? t('recordedTitle')
        : t('receiptTitle', { revision: receiptRevision });
  const metadata = {
    revisionId: value.revisionId,
    revisionVersion: value.revisionVersion,
    resolvedAt: value.resolvedAt,
    contentHash: value.contentHash,
    schemaVersion: value.schemaVersion,
  };
  return (
    <section aria-label={title} className="space-y-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {source === 'receipt_snapshot' && (
        <p>
          {t(
            value.approval === 'approved'
              ? 'recordedApproved'
              : 'recordedProvisional',
          )}
        </p>
      )}
      <p className="text-sm text-muted-foreground">{t('recordedNote')}</p>
      {recordedValue(metadata, (key) => t(`fields.${key}`), t('unavailable'))}
      <section aria-label={t('identity')} className="space-y-2">
        <h4 className="font-medium">{t('identity')}</h4>
        {recordedValue(
          value.identity,
          (key) => t(`fields.${key}`),
          t('unavailable'),
        )}
      </section>
      <section aria-label={t('voice')} className="space-y-2">
        <h4 className="font-medium">{t('voice')}</h4>
        {recordedValue(
          value.voice,
          (key) => t(`fields.${key}`),
          rulesText('empty'),
        )}
      </section>
      <Accordion type="multiple">
        {sections.map((section) => (
          <AccordionItem key={section} value={section}>
            <AccordionTrigger>
              {rulesText(
                `sections.${section === 'approvedLiterals' ? 'literals' : section}`,
              )}
            </AccordionTrigger>
            <AccordionContent>
              <ul className="space-y-3">
                {(value.generationRules[section] ?? []).map((entry) => (
                  <li
                    key={entry.id}
                    className="rounded border border-border p-3"
                  >
                    <dl className="space-y-2 text-sm">
                      {Object.entries(entry).map(([key, item]) => (
                        <Fragment key={key}>
                          <dt className="font-medium">
                            {rulesText(`fields.${key}`)}
                          </dt>
                          <dd className="whitespace-pre-wrap break-words">
                            {key === 'availability'
                              ? rulesText(`availability.${String(item)}`)
                              : key === 'required'
                                ? rulesText(item ? 'required' : 'optional')
                                : recordedValue(
                                    item,
                                    (field) => rulesText(`fields.${field}`),
                                    rulesText('empty'),
                                  )}
                          </dd>
                        </Fragment>
                      ))}
                    </dl>
                  </li>
                ))}
              </ul>
              {(value.generationRules[section]?.length ?? 0) === 0 && (
                <p>{rulesText('empty')}</p>
              )}
            </AccordionContent>
          </AccordionItem>
        ))}
        <AccordionItem value="diagnostics">
          <AccordionTrigger>{t('diagnostics')}</AccordionTrigger>
          <AccordionContent>
            <ul className="space-y-3">
              {diagnosticRows.map(({ diagnostic, key }) => (
                <li key={key}>
                  {recordedValue(
                    diagnostic,
                    (key) => t(`fields.${key}`),
                    rulesText('empty'),
                  )}
                </li>
              ))}
            </ul>
            {value.diagnostics.length === 0 && <p>{rulesText('empty')}</p>}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
}
