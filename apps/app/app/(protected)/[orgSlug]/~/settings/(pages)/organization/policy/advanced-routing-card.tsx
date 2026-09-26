import { formatCreditCostEstimate } from '@genfeedai/contracts/constants';
import type { AdvancedRoutingCardProps } from '@props/settings/model-routing.props';
import Card from '@ui/card/Card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives';
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

export default function AdvancedRoutingCard({
  agentModelAccess,
  allowAdvancedOverrides,
  generationModelOptions,
  generationModelOverride,
  generationModelOverrideUnresolvedKey,
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

  // The unresolved-marker option is disabled and never emitted by
  // onValueChange from a real Select, but the change handlers guard it too
  // so picking it can never be mistaken for an explicit Auto/clear action.
  function handleModelOverrideChange(
    onChange: (value: string) => void,
  ): (value: string) => void {
    return (value) => {
      if (value === UNRESOLVED_MODEL_SELECT_VALUE) {
        return;
      }
      onChange(value === AUTO_MODEL_SELECT_VALUE ? '' : value);
    };
  }

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
                <>
                  <Select
                    value={toSelectValue(
                      thinkingModelOverride,
                      thinkingModelOverrideUnresolvedKey,
                    )}
                    onValueChange={handleModelOverrideChange(
                      onThinkingModelOverrideChange,
                    )}
                  >
                    <SelectTrigger className="w-full mt-2 rounded">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={AUTO_MODEL_SELECT_VALUE}>
                        {translate('autoOption')}
                      </SelectItem>
                      {thinkingModelOverrideUnresolvedKey ? (
                        <SelectItem
                          disabled
                          value={UNRESOLVED_MODEL_SELECT_VALUE}
                        >
                          {translate('unresolvedModelOption', {
                            model: thinkingModelOverrideUnresolvedKey,
                          })}
                        </SelectItem>
                      ) : null}
                      {thinkingModelOptions.map((model) => {
                        const estimate = modelCostEstimates[model.value];
                        return (
                          <SelectItem key={model.value} value={model.value}>
                            {estimate === undefined
                              ? model.label
                              : `${model.label} · ${formatCreditCostEstimate(
                                  estimate,
                                  { unit: 'credits / message' },
                                )}`}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {thinkingModelOverrideUnresolvedKey ? (
                    <p className="mt-1 text-xs text-warning">
                      {translate('unresolvedModelNotice', {
                        model: thinkingModelOverrideUnresolvedKey,
                      })}
                    </p>
                  ) : null}
                </>
              )}
            </div>

            <div>
              <p className="text-sm font-medium">
                {translate('generationModelLabel')}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {translate('generationModelDescription')}
              </p>
              <Select
                value={toSelectValue(
                  generationModelOverride,
                  generationModelOverrideUnresolvedKey,
                )}
                onValueChange={handleModelOverrideChange(
                  onGenerationModelOverrideChange,
                )}
              >
                <SelectTrigger className="w-full mt-2 rounded">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUTO_MODEL_SELECT_VALUE}>
                    {translate('autoOption')}
                  </SelectItem>
                  {generationModelOverrideUnresolvedKey ? (
                    <SelectItem disabled value={UNRESOLVED_MODEL_SELECT_VALUE}>
                      {translate('unresolvedModelOption', {
                        model: generationModelOverrideUnresolvedKey,
                      })}
                    </SelectItem>
                  ) : null}
                  {generationModelOptions.map((model) => (
                    <SelectItem key={model.value} value={model.value}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {generationModelOverrideUnresolvedKey ? (
                <p className="mt-1 text-xs text-warning">
                  {translate('unresolvedModelNotice', {
                    model: generationModelOverrideUnresolvedKey,
                  })}
                </p>
              ) : null}
            </div>

            <div>
              <p className="text-sm font-medium">
                {translate('reviewModelLabel')}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {translate('reviewModelDescription')}
              </p>
              <Select
                value={toSelectValue(
                  reviewModelOverride,
                  reviewModelOverrideUnresolvedKey,
                )}
                onValueChange={handleModelOverrideChange(
                  onReviewModelOverrideChange,
                )}
              >
                <SelectTrigger className="w-full mt-2 rounded">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUTO_MODEL_SELECT_VALUE}>
                    {translate('autoOption')}
                  </SelectItem>
                  {reviewModelOverrideUnresolvedKey ? (
                    <SelectItem disabled value={UNRESOLVED_MODEL_SELECT_VALUE}>
                      {translate('unresolvedModelOption', {
                        model: reviewModelOverrideUnresolvedKey,
                      })}
                    </SelectItem>
                  ) : null}
                  {reviewModelOptions.map((model) => (
                    <SelectItem key={model.value} value={model.value}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {reviewModelOverrideUnresolvedKey ? (
                <p className="mt-1 text-xs text-warning">
                  {translate('unresolvedModelNotice', {
                    model: reviewModelOverrideUnresolvedKey,
                  })}
                </p>
              ) : null}
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
