'use client';

import { useAssetSelection } from '@contexts/ui/asset-selection.context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { IngredientStatus } from '@genfeedai/enums';
import type { IGenerationItem, IIngredient } from '@genfeedai/interfaces';
import { type ReactNode, useCallback, useMemo } from 'react';
import { useRegisterWorkspaceSurfaceAdapter } from '@/components/workspace-shell/WorkspaceSurfaceAdapterContext';

interface StudioWorkspaceSurfaceAdapterProps {
  error?: string | null;
  isLoading?: boolean;
  isProcessing?: boolean;
  mode: string;
  versions?: readonly IIngredient[];
}

const EMPTY_VERSIONS: readonly IIngredient[] = [];

interface StudioWorkspaceInspectorProps
  extends StudioWorkspaceSurfaceAdapterProps {
  activeGenerations: readonly IGenerationItem[];
  brandLabel: string;
  currentFormat: { height: number; width: number } | null;
  generationQueue: readonly IGenerationItem[];
  organizationId: string;
  selectedAsset: IIngredient | null;
  selectedVersionId: string | null;
  selectedVersionNumber?: number;
}

function titleCase(value: string): string {
  const normalized = value.replaceAll('_', ' ').replaceAll('-', ' ').trim();
  return normalized
    ? normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase()
    : 'Studio';
}

function formatVersion(asset: IIngredient, index: number): string {
  return typeof asset.version === 'number'
    ? `v${asset.version}`
    : index === 0
      ? 'Current'
      : `Version ${index + 1}`;
}

function generationStateLabel({
  activeGenerations,
  error,
  isLoading,
  isProcessing,
}: Pick<
  StudioWorkspaceInspectorProps,
  'activeGenerations' | 'error' | 'isLoading' | 'isProcessing'
>): string {
  if (error) return 'Error';
  if (isLoading) return 'Loading';
  if (isProcessing || activeGenerations.length > 0) return 'Generating';
  return 'Ready';
}

function queueItemTone(item: IGenerationItem): string {
  if (item.status.includes(IngredientStatus.FAILED)) {
    return 'text-destructive';
  }
  if (item.status.includes(IngredientStatus.PROCESSING)) {
    return 'text-warning';
  }
  return 'text-success';
}

function InspectorSection({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <section className="space-y-2 bg-background p-3 shadow-border">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </h3>
      {children}
    </section>
  );
}

function StudioWorkspaceInspector({
  activeGenerations,
  brandLabel,
  currentFormat,
  error,
  generationQueue,
  isLoading = false,
  isProcessing = false,
  mode,
  organizationId,
  selectedAsset,
  selectedVersionId,
  selectedVersionNumber,
  versions = [],
}: StudioWorkspaceInspectorProps) {
  const uniqueVersions = useMemo(() => {
    const assets = selectedAsset ? [selectedAsset, ...versions] : [...versions];
    return [...new Map(assets.map((asset) => [asset.id, asset])).values()];
  }, [selectedAsset, versions]);
  const stateLabel = generationStateLabel({
    activeGenerations,
    error,
    isLoading,
    isProcessing,
  });
  const selectedLabel =
    selectedAsset?.metadataLabel ||
    selectedAsset?.promptText ||
    'Untitled asset';
  const displayFormat =
    selectedAsset?.width && selectedAsset.height
      ? `${selectedAsset.width} × ${selectedAsset.height}`
      : currentFormat
        ? `${currentFormat.width} × ${currentFormat.height}`
        : 'Not set';

  return (
    <div
      className="flex flex-col gap-3"
      data-testid="studio-workspace-inspector"
    >
      <InspectorSection label="Studio state">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Mode</dt>
          <dd className="truncate text-right text-foreground">
            {titleCase(mode)}
          </dd>
          <dt className="text-muted-foreground">Status</dt>
          <dd aria-live="polite" className="text-right text-foreground">
            {stateLabel}
          </dd>
          <dt className="text-muted-foreground">Organization</dt>
          <dd
            className="truncate text-right text-foreground"
            title={organizationId}
          >
            {organizationId}
          </dd>
          <dt className="text-muted-foreground">Brand</dt>
          <dd className="truncate text-right text-foreground">{brandLabel}</dd>
        </dl>
        {error ? (
          <p className="text-xs leading-5 text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </InspectorSection>

      <InspectorSection label="Generation settings">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Format</dt>
          <dd className="text-right text-foreground">{displayFormat}</dd>
          <dt className="text-muted-foreground">Model</dt>
          <dd className="truncate text-right text-foreground">
            {selectedAsset?.metadataModelLabel ??
              selectedAsset?.metadataModel ??
              selectedAsset?.model ??
              'Auto'}
          </dd>
          <dt className="text-muted-foreground">Active</dt>
          <dd className="text-right text-foreground">
            {activeGenerations.length}
          </dd>
        </dl>
      </InspectorSection>

      <InspectorSection label="Selected canonical asset">
        {selectedAsset && selectedVersionId ? (
          <div className="space-y-2 text-xs">
            <div>
              <p
                className="truncate font-medium text-foreground"
                title={selectedLabel}
              >
                {selectedLabel}
              </p>
              <p className="mt-1 text-muted-foreground">
                {titleCase(selectedAsset.category)} ·{' '}
                {selectedVersionNumber === undefined
                  ? 'Current version'
                  : `v${selectedVersionNumber}`}
              </p>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt className="text-muted-foreground">Record</dt>
              <dd
                className="truncate text-right font-mono text-foreground"
                title={selectedVersionId}
              >
                {selectedVersionId}
              </dd>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="text-right text-foreground">
                {titleCase(selectedAsset.status)}
              </dd>
            </dl>
            <p className="leading-5 text-muted-foreground">
              Attached to conversation requests as a server-authorized typed
              ingredient reference. No immutable approval pin is created here.
            </p>
          </div>
        ) : (
          <p className="text-xs leading-5 text-muted-foreground">
            Select a Studio asset to synchronize the canvas, inspector, and
            conversation reference.
          </p>
        )}
      </InspectorSection>

      {uniqueVersions.length > 0 ? (
        <InspectorSection label="Versions">
          <ul className="space-y-1.5">
            {uniqueVersions.map((asset, index) => (
              <li
                className="flex items-center justify-between gap-3 text-xs"
                key={asset.id}
              >
                <span className="truncate text-foreground">
                  {asset.metadataLabel || formatVersion(asset, index)}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {asset.id === selectedVersionId
                    ? `${formatVersion(asset, index)} · selected`
                    : formatVersion(asset, index)}
                </span>
              </li>
            ))}
          </ul>
        </InspectorSection>
      ) : null}

      {generationQueue.length > 0 ? (
        <InspectorSection label="Generation activity">
          <ul className="space-y-2" aria-live="polite">
            {generationQueue.slice(0, 6).map((item) => (
              <li className="space-y-0.5 text-xs" key={item.id}>
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-foreground">
                    {item.model || titleCase(item.type)}
                  </span>
                  <span className={queueItemTone(item)}>
                    {item.currentPhase ?? titleCase(item.status[0] ?? 'queued')}
                  </span>
                </div>
                {item.error ? (
                  <p className="leading-5 text-destructive">{item.error}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </InspectorSection>
      ) : null}
    </div>
  );
}

export default function StudioWorkspaceSurfaceAdapter({
  error,
  isLoading = false,
  isProcessing = false,
  mode,
  versions = EMPTY_VERSIONS,
}: StudioWorkspaceSurfaceAdapterProps) {
  const {
    activeGenerations,
    currentFormat,
    generationQueue,
    selectedCanonicalAsset,
  } = useAssetSelection();
  const { brandId, organizationId, selectedBrand } = useBrand();
  const activeCanonicalAsset =
    isLoading || error ? null : selectedCanonicalAsset;
  const selectedAsset = activeCanonicalAsset?.asset ?? null;
  const selectedVersionId = activeCanonicalAsset?.version.id ?? null;
  const selectedVersionNumber = activeCanonicalAsset?.version.number;
  const selectedLabel =
    selectedAsset?.metadataLabel ||
    selectedAsset?.promptText ||
    'Selected asset';
  const references = useMemo(
    () =>
      activeCanonicalAsset
        ? [
            {
              label: `${selectedLabel}${selectedVersionNumber === undefined ? '' : ` · v${selectedVersionNumber}`}`,
              reference: activeCanonicalAsset.reference,
            },
          ]
        : [],
    [activeCanonicalAsset, selectedLabel, selectedVersionNumber],
  );
  const renderInspector = useCallback(
    () => (
      <StudioWorkspaceInspector
        activeGenerations={activeGenerations}
        brandLabel={selectedBrand?.label ?? brandId ?? 'No brand selected'}
        currentFormat={currentFormat}
        error={error}
        generationQueue={generationQueue}
        isLoading={isLoading}
        isProcessing={isProcessing}
        mode={mode}
        organizationId={organizationId}
        selectedAsset={selectedAsset}
        selectedVersionId={selectedVersionId}
        selectedVersionNumber={selectedVersionNumber}
        versions={versions}
      />
    ),
    [
      activeGenerations,
      brandId,
      currentFormat,
      error,
      generationQueue,
      isLoading,
      isProcessing,
      mode,
      organizationId,
      selectedAsset,
      selectedBrand?.label,
      selectedVersionId,
      selectedVersionNumber,
      versions,
    ],
  );
  const registration = useMemo(
    () => ({
      contextLabel: activeCanonicalAsset
        ? `Studio · ${titleCase(mode)} · ${selectedLabel}`
        : `Studio · ${titleCase(mode)}`,
      references,
      renderInspector,
      scope: {
        ...(brandId ? { brandId } : {}),
        organizationId,
      },
      surfaceKey: 'studio',
    }),
    [
      brandId,
      mode,
      organizationId,
      references,
      renderInspector,
      activeCanonicalAsset,
      selectedLabel,
    ],
  );

  useRegisterWorkspaceSurfaceAdapter(registration);
  return null;
}
