import { formatCreditCostEstimate } from '@genfeedai/contracts/constants';
import type {
  AdvancedRoutingCardProps,
  ModelOverridePickerProps,
} from '@props/settings/model-routing.props';
import Card from '@ui/card/Card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives';
import { Skeleton } from '@ui/primitives/skeleton';
import { Switch } from '@ui/primitives/switch';
import AgentModelLockNotice from '@ui/settings/agent-model-lock-notice/AgentModelLockNotice';
import { useTranslations } from 'next-intl';

const AUTO_MODEL_SELECT_VALUE = '__auto__';
const UNRESOLVED_MODEL_SELECT_VALUE = '__unresolved__';

/** Controlled `<Select>` value for an override: resolved key, unresolved marker, or Auto. */
function toSelectValue(
  resolvedOverride: string,
  unresolvedKey: string | null,
): string {
  if (resolvedOverride) {
    return resolvedOverride;
  }
  return unresolvedKey
    ? UNRESOLVED_MODEL_SELECT_VALUE
    : AUTO_MODEL_SELECT_VALUE;
}

/**
 * One override selector: the catalog-loading skeleton, the free-tier lock
 * notice (thinking only), the real `Select`, or the unresolved-override
 * notice — never a bare "Auto" for a field that actually has a stored value
 * this picker just can't validate yet.
 */
function ModelOverridePicker({
  autoOptionLabel,
  isModelCatalogLoading,
  onOverrideChange,
  options,
  override,
  renderOptionLabel,
  unresolvedKey,
  unresolvedNotice,
  unresolvedOptionLabel,
}: ModelOverridePickerProps) {
  if (isModelCatalogLoading) {
    return <Skeleton className="mt-2 h-9 w-full rounded" />;
  }

  // The unresolved-marker option is disabled and never emitted by
  // onValueChange from a real Select, but the handler guards it too so
  // picking it can never be mistaken for an explicit Auto/clear action.
  function handleValueChange(value: string): void {
    if (value === UNRESOLVED_MODEL_SELECT_VALUE) {
      return;
    }
    onOverrideChange(value === AUTO_MODEL_SELECT_VALUE ? '' : value);
  }

  return (
    <>
      <Select
        value={toSelectValue(override, unresolvedKey)}
        onValueChange={handleValueChange}
      >
        <SelectTrigger className="w-full mt-2 rounded">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={AUTO_MODEL_SELECT_VALUE}>
            {autoOptionLabel}
          </SelectItem>
          {unresolvedKey ? (
            <SelectItem disabled value={UNRESOLVED_MODEL_SELECT_VALUE}>
              {unresolvedOptionLabel}
            </SelectItem>
          ) : null}
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {renderOptionLabel ? renderOptionLabel(option) : option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {unresolvedKey ? (
        <p className="mt-1 text-xs text-warning">{unresolvedNotice}</p>
      ) : null}
    </>
  );
}

export default function AdvancedRoutingCard({
  agentModelAccess,
  allowAdvancedOverrides,
  generationModelOptions,
  generationModelOverride,
  generationModelOverrideUnresolvedKey,
  isModelCatalogLoading,
  isSaving,
  modelCostEstimates,
  onAllowAdvancedOverridesChange,
  onGenerationModelOverrideChange,
  onReviewModelOverrideChange,
  onThinkingModelOverrideChange,
  reviewModelOptions,
  reviewModelOverride,
  reviewModelOverrideUnresolvedKey,
  thinkingModelOptions,
  thinkingModelOverride,
  thinkingModelOverrideUnresolvedKey,
}: AdvancedRoutingCardProps) {
  const translate = useTranslations('common.settings.policy.advancedRouting');
  const lockedModelLabel = agentModelAccess?.isLocked
    ? (agentModelAccess.lockedModelLabel ?? agentModelAccess.lockedModelKey)
    : null;
  const autoOption = translate('autoOption');

  return (
    <Card label={translate('cardLabel')} bodyClassName="gap-3 p-4">
      <div className="space-y-3">
        <Switch
          label={translate('exposeLabel')}
          description={translate('exposeDescription')}
          isChecked={allowAdvancedOverrides}
          isDisabled={isSaving}
          onChange={(event) =>
            onAllowAdvancedOverridesChange(event.target.checked)
          }
        />

        {allowAdvancedOverrides ? (
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <p className="text-sm font-medium">
                {translate('thinkingModelLabel')}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {translate('thinkingModelDescription')}
              </p>
              {lockedModelLabel ? (
                <AgentModelLockNotice
                  className="mt-2"
                  lockedModelLabel={lockedModelLabel}
                />
              ) : (
                <ModelOverridePicker
                  autoOptionLabel={autoOption}
                  isModelCatalogLoading={isModelCatalogLoading}
                  onOverrideChange={onThinkingModelOverrideChange}
                  options={thinkingModelOptions}
                  override={thinkingModelOverride}
                  renderOptionLabel={(option) => {
                    const estimate = modelCostEstimates[option.value];
                    return estimate === undefined
                      ? option.label
                      : `${option.label} · ${formatCreditCostEstimate(estimate, { unit: 'credits / message' })}`;
                  }}
                  unresolvedKey={thinkingModelOverrideUnresolvedKey}
                  unresolvedNotice={translate('unresolvedModelNotice', {
                    model: thinkingModelOverrideUnresolvedKey ?? '',
                  })}
                  unresolvedOptionLabel={translate('unresolvedModelOption', {
                    model: thinkingModelOverrideUnresolvedKey ?? '',
                  })}
                />
              )}
            </div>

            <div>
              <p className="text-sm font-medium">
                {translate('generationModelLabel')}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {translate('generationModelDescription')}
              </p>
              <ModelOverridePicker
                autoOptionLabel={autoOption}
                isModelCatalogLoading={isModelCatalogLoading}
                onOverrideChange={onGenerationModelOverrideChange}
                options={generationModelOptions}
                override={generationModelOverride}
                unresolvedKey={generationModelOverrideUnresolvedKey}
                unresolvedNotice={translate('unresolvedModelNotice', {
                  model: generationModelOverrideUnresolvedKey ?? '',
                })}
                unresolvedOptionLabel={translate('unresolvedModelOption', {
                  model: generationModelOverrideUnresolvedKey ?? '',
                })}
              />
            </div>

            <div>
              <p className="text-sm font-medium">
                {translate('reviewModelLabel')}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {translate('reviewModelDescription')}
              </p>
              <ModelOverridePicker
                autoOptionLabel={autoOption}
                isModelCatalogLoading={isModelCatalogLoading}
                onOverrideChange={onReviewModelOverrideChange}
                options={reviewModelOptions}
                override={reviewModelOverride}
                unresolvedKey={reviewModelOverrideUnresolvedKey}
                unresolvedNotice={translate('unresolvedModelNotice', {
                  model: reviewModelOverrideUnresolvedKey ?? '',
                })}
                unresolvedOptionLabel={translate('unresolvedModelOption', {
                  model: reviewModelOverrideUnresolvedKey ?? '',
                })}
              />
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {translate('offHint')}
          </p>
        )}
      </div>
    </Card>
  );
}
