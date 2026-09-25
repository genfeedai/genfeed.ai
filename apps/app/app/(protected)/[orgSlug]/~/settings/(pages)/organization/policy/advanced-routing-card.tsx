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

export default function AdvancedRoutingCard({
  agentModelAccess,
  allowAdvancedOverrides,
  generationModelOptions,
  generationModelOverride,
  isSaving,
  modelCostEstimates,
  onAllowAdvancedOverridesChange,
  onGenerationModelOverrideChange,
  onReviewModelOverrideChange,
  onThinkingModelOverrideChange,
  reviewModelOptions,
  reviewModelOverride,
  thinkingModelOptions,
  thinkingModelOverride,
}: AdvancedRoutingCardProps) {
  const translate = useTranslations('common.settings.policy.advancedRouting');
  const lockedModelLabel = agentModelAccess?.isLocked
    ? (agentModelAccess.lockedModelLabel ?? agentModelAccess.lockedModelKey)
    : null;

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
                <Select
                  value={thinkingModelOverride || AUTO_MODEL_SELECT_VALUE}
                  onValueChange={(value) =>
                    onThinkingModelOverrideChange(
                      value === AUTO_MODEL_SELECT_VALUE ? '' : value,
                    )
                  }
                >
                  <SelectTrigger className="w-full mt-2 rounded">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AUTO_MODEL_SELECT_VALUE}>
                      {translate('autoOption')}
                    </SelectItem>
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
                value={generationModelOverride || AUTO_MODEL_SELECT_VALUE}
                onValueChange={(value) =>
                  onGenerationModelOverrideChange(
                    value === AUTO_MODEL_SELECT_VALUE ? '' : value,
                  )
                }
              >
                <SelectTrigger className="w-full mt-2 rounded">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUTO_MODEL_SELECT_VALUE}>
                    {translate('autoOption')}
                  </SelectItem>
                  {generationModelOptions.map((model) => (
                    <SelectItem key={model.value} value={model.value}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <p className="text-sm font-medium">
                {translate('reviewModelLabel')}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {translate('reviewModelDescription')}
              </p>
              <Select
                value={reviewModelOverride || AUTO_MODEL_SELECT_VALUE}
                onValueChange={(value) =>
                  onReviewModelOverrideChange(
                    value === AUTO_MODEL_SELECT_VALUE ? '' : value,
                  )
                }
              >
                <SelectTrigger className="w-full mt-2 rounded">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUTO_MODEL_SELECT_VALUE}>
                    {translate('autoOption')}
                  </SelectItem>
                  {reviewModelOptions.map((model) => (
                    <SelectItem key={model.value} value={model.value}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
