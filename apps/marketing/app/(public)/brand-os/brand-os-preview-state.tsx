'use client';

import { ButtonSize } from '@genfeedai/contracts';
import type {
  IBrandKitDiagnostic,
  IBrandKitDraft,
  IBrandKitSourceEvidence,
} from '@genfeedai/contracts/interfaces';
import { Badge, type BadgeProps } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import {
  DefinitionDetail,
  DefinitionList,
  DefinitionRow,
  DefinitionTerm,
} from '@ui/primitives/definition-list';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  FileSearch,
  Info,
  LoaderCircle,
  LockKeyhole,
  type LucideIcon,
  Save,
  ScanSearch,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { useId } from 'react';

export const BRAND_OS_PREVIEW_STATES = [
  'idle',
  'input-started',
  'scanning',
  'partial',
  'ready',
  'blocked',
  'error',
  'conversion-prompted',
  'saved',
  'accepted',
  'missing-evidence',
] as const;

export type BrandOSPreviewStateName = (typeof BRAND_OS_PREVIEW_STATES)[number];

type CampaignScaleRole = 'block' | 'hero' | 'monument';
type EvidenceKind = 'extracted' | 'inferred';
type DiagnosticSeverity = 'info' | 'warning';

interface BrandOSPreviewStateProps {
  announce?: boolean;
  draft?: IBrandKitDraft | undefined;
  scaleRole?: CampaignScaleRole;
  state: BrandOSPreviewStateName;
}

interface StateDefinition {
  action: string;
  description: string;
  icon: LucideIcon;
  label: string;
  toneClassName: string;
}

interface EvidenceItem {
  confidence: number | null;
  detail: string;
  kind: EvidenceKind;
  label: string;
}

interface SourceRow {
  detail: string;
  href: string;
  label: string;
}

interface DiagnosticItem {
  message: string;
  severity: DiagnosticSeverity;
}

const STATE_DEFINITIONS: Record<BrandOSPreviewStateName, StateDefinition> = {
  accepted: {
    action: 'Use this accepted system as the review baseline.',
    description:
      'The owner accepted the reviewed evidence and promoted the draft.',
    icon: CheckCircle2,
    label: 'Accepted',
    toneClassName: 'text-success',
  },
  blocked: {
    action: 'Add a public source or paste guidance to continue.',
    description:
      'The source requires authentication or prevents a trustworthy scan.',
    icon: LockKeyhole,
    label: 'Blocked',
    toneClassName: 'text-warning',
  },
  'conversion-prompted': {
    action: 'Sign in when you are ready to save this reviewed preview.',
    description:
      'The preview is complete. Saving it requires a Genfeed workspace.',
    icon: Sparkles,
    label: 'Ready to save',
    toneClassName: 'text-info',
  },
  error: {
    action: 'Keep the source URL and retry when the connection recovers.',
    description:
      'The scan stopped before it could produce a trustworthy preview.',
    icon: ShieldAlert,
    label: 'Scan error',
    toneClassName: 'text-destructive',
  },
  idle: {
    action: 'Add a public website URL to start from evidence.',
    description:
      'No source has been submitted. Nothing has been inferred or saved.',
    icon: CircleDashed,
    label: 'Waiting for a source',
    toneClassName: 'text-muted-foreground',
  },
  'input-started': {
    action: 'Review the source before starting the scan.',
    description:
      'A source is present, but Genfeed has not read or interpreted it yet.',
    icon: FileSearch,
    label: 'Source added',
    toneClassName: 'text-info',
  },
  'missing-evidence': {
    action: 'Add customer proof or mark the recommendation as an assumption.',
    description:
      'A required claim has no reliable source and cannot be presented as fact.',
    icon: AlertTriangle,
    label: 'Evidence missing',
    toneClassName: 'text-warning',
  },
  partial: {
    action: 'Review the gaps before treating recommendations as ready.',
    description:
      'Some brand signals are sourced; others remain inferred or missing.',
    icon: ScanSearch,
    label: 'Partial preview',
    toneClassName: 'text-warning',
  },
  ready: {
    action: 'Review the receipts, then decide what belongs in your Brand OS.',
    description:
      'The preview separates evidence, assumptions, candidates, and gaps.',
    icon: CheckCircle2,
    label: 'Preview ready',
    toneClassName: 'text-success',
  },
  saved: {
    action: 'Open the draft in Brand Kit review before applying any field.',
    description:
      'The preview is stored as a draft. Current brand values are unchanged.',
    icon: Save,
    label: 'Saved draft',
    toneClassName: 'text-info',
  },
  scanning: {
    action: 'Keep this page open while sources and confidence are checked.',
    description:
      'Genfeed is reading public signals and recording where each claim came from.',
    icon: LoaderCircle,
    label: 'Scanning sources',
    toneClassName: 'text-info',
  },
};

const EVIDENCE_KIND_BADGE_VARIANTS: Record<
  EvidenceKind,
  BadgeProps['variant']
> = {
  extracted: 'success',
  inferred: 'info',
};

function formatConfidence(confidence: number | null): string {
  return confidence === null
    ? 'Confidence: not scored'
    : `Confidence: ${Math.round(confidence * 100)}%`;
}

function EvidenceLabel({ kind }: { kind: EvidenceKind }) {
  return <Badge variant={EVIDENCE_KIND_BADGE_VARIANTS[kind]}>{kind}</Badge>;
}

function formatDraftValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(String).join(', ');
  }
  if (value && typeof value === 'object') {
    return 'Structured brand evidence';
  }
  return value == null ? 'No proposed value' : String(value);
}

function toEvidenceItems(draft: IBrandKitDraft): readonly EvidenceItem[] {
  const fields = Object.values(draft.fields).filter(
    (field) => field?.proposedValue !== undefined,
  );
  return fields.slice(0, 8).map((field) => ({
    confidence: field?.confidence ?? null,
    detail: formatDraftValue(field?.proposedValue),
    kind:
      field?.evidence[0]?.sourceType === 'website' ? 'extracted' : 'inferred',
    label: field?.label ?? 'Brand signal',
  }));
}

function toSourceRows(
  evidence: readonly IBrandKitSourceEvidence[],
): readonly SourceRow[] {
  return evidence.slice(0, 8).map((source, index) => ({
    detail: source.excerpt ?? `Evidence recorded as ${source.sourceType}`,
    href: source.url ?? '#brand-os-preview',
    label: source.label || `Source ${index + 1}`,
  }));
}

function toDiagnostics(
  diagnostics: readonly IBrandKitDiagnostic[],
): readonly DiagnosticItem[] {
  return diagnostics.slice(0, 8).map((diagnostic) => ({
    message: diagnostic.message,
    severity: diagnostic.severity === 'info' ? 'info' : 'warning',
  }));
}

function EvidencePreview({ draft }: { draft: IBrandKitDraft }) {
  const diagnosticsHeadingId = useId();
  const evidenceHeadingId = useId();
  const sourcesHeadingId = useId();
  const evidenceItems = toEvidenceItems(draft);
  const sourceRows = toSourceRows(draft.evidence);
  const diagnostics = toDiagnostics([
    ...draft.diagnostics,
    ...draft.readiness.diagnostics,
  ]);

  return (
    <div className="grid gap-px bg-foreground/10 lg:grid-cols-[1.15fr_0.85fr]">
      <section
        className="bg-background p-5 sm:p-6"
        aria-labelledby={evidenceHeadingId}
      >
        <div className="flex flex-col gap-1">
          <Heading
            as="h4"
            className="text-lg font-semibold"
            id={evidenceHeadingId}
          >
            Evidence ledger
          </Heading>
          <Text className="text-sm leading-6 text-foreground/60">
            Every recommendation declares what it knows and how well it knows
            it.
          </Text>
        </div>

        {evidenceItems.length > 0 ? (
          <DefinitionList className="mt-5" variant="ruled">
            {evidenceItems.map((item) => (
              <DefinitionRow key={item.label} variant="split">
                <DefinitionTerm className="flex flex-col items-start gap-2">
                  <Text className="text-xs font-semibold text-foreground">
                    {item.label}
                  </Text>
                  <EvidenceLabel kind={item.kind} />
                </DefinitionTerm>
                <DefinitionDetail className="flex flex-col gap-1">
                  <Text className="text-sm leading-6 text-foreground/80">
                    {item.detail}
                  </Text>
                  <Text className="font-mono text-2xs uppercase text-foreground/60">
                    {formatConfidence(item.confidence)}
                  </Text>
                </DefinitionDetail>
              </DefinitionRow>
            ))}
          </DefinitionList>
        ) : (
          <Text className="mt-5 text-sm text-foreground/60">
            No supported recommendation was inferred from this source.
          </Text>
        )}
      </section>

      <div className="grid gap-px bg-foreground/10">
        <section
          className="bg-background p-5 sm:p-6"
          aria-labelledby={sourcesHeadingId}
        >
          <Heading
            as="h4"
            className="text-base font-semibold"
            id={sourcesHeadingId}
          >
            Source rows
          </Heading>
          {sourceRows.length > 0 ? (
            <ul className="mt-4 divide-y divide-foreground/10">
              {sourceRows.map((source) => (
                <li className="py-3 first:pt-0 last:pb-0" key={source.href}>
                  <Link
                    className="group flex flex-col gap-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    href={source.href}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <span className="text-xs font-semibold text-foreground group-hover:underline">
                      {source.label}
                    </span>
                    <span className="text-xs leading-5 text-foreground/60">
                      {source.detail}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Text className="mt-4 text-xs leading-5 text-foreground/60">
              No source receipt was available.
            </Text>
          )}
        </section>

        <section
          className="bg-background p-5 sm:p-6"
          aria-labelledby={diagnosticsHeadingId}
        >
          <Heading
            as="h4"
            className="text-base font-semibold"
            id={diagnosticsHeadingId}
          >
            Diagnostics
          </Heading>
          {diagnostics.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {diagnostics.map((diagnostic) => (
                <li className="flex items-start gap-2" key={diagnostic.message}>
                  {diagnostic.severity === 'warning' ? (
                    <AlertTriangle
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-warning"
                    />
                  ) : (
                    <Info
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-info"
                    />
                  )}
                  <div className="flex flex-col gap-0.5">
                    <Text className="text-2xs font-black uppercase tracking-[0.12em] text-foreground/60">
                      {diagnostic.severity}
                    </Text>
                    <Text className="text-xs leading-5 text-foreground/70">
                      {diagnostic.message}
                    </Text>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Text className="mt-4 text-xs leading-5 text-foreground/60">
              No additional diagnostics.
            </Text>
          )}
        </section>
      </div>
    </div>
  );
}

export function BrandOSPreviewState({
  announce = false,
  draft,
  scaleRole = 'block',
  state,
}: BrandOSPreviewStateProps) {
  const headingId = useId();
  const definition = STATE_DEFINITIONS[state];
  const Icon = definition.icon;
  const isAssertive = state === 'blocked' || state === 'error';

  return (
    <article
      aria-busy={announce ? state === 'scanning' : undefined}
      aria-labelledby={headingId}
      aria-live={announce ? (isAssertive ? 'assertive' : 'polite') : undefined}
      className="bg-background shadow-border"
      data-brand-os-state={state}
      data-scale-role={scaleRole}
      role={announce ? (isAssertive ? 'alert' : 'status') : undefined}
    >
      <div className="flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-foreground/5 shadow-border">
              {/* ui-guard-allow:loading-spinner -- scan glyph rotates while scanning */}
              <Icon
                aria-hidden="true"
                className={`size-5 ${definition.toneClassName} ${state === 'scanning' ? 'animate-spin motion-reduce:animate-none' : ''}`}
              />
            </span>
            <Heading
              as="h3"
              className="self-center text-lg font-semibold"
              id={headingId}
            >
              {definition.label}
            </Heading>
          </div>
        </div>

        <div className="grid gap-2">
          <Text className="text-sm leading-6 text-foreground/70">
            {definition.description}
          </Text>
          <Text className="text-xs font-medium leading-5 text-foreground/90">
            Next: {definition.action}
          </Text>
        </div>
      </div>

      {draft ? <EvidencePreview draft={draft} /> : null}
    </article>
  );
}

export function BrandOSPreviewAction() {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Button asChild size={ButtonSize.PUBLIC} withWrapper={false}>
        <Link href="#brand-os-preview">Build your Brand OS</Link>
      </Button>
    </div>
  );
}
