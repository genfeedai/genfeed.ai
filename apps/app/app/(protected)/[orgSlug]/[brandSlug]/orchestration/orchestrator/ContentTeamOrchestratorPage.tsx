'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { CONTENT_TEAM_BLUEPRINT_PRESETS } from '@pages/agents/content-team/content-team-presets';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { HiOutlineRectangleGroup } from 'react-icons/hi2';
import OrchestratorBlueprintPreview from './OrchestratorBlueprintPreview';
import OrchestratorGoalSection from './OrchestratorGoalSection';
import OrchestratorSpecialistsSection from './OrchestratorSpecialistsSection';
import { useContentTeamOrchestratorPage } from './useContentTeamOrchestratorPage';

export default function ContentTeamOrchestratorPage() {
  const {
    blueprintRoles,
    brands,
    form,
    handleChange,
    handleSubmit,
    isSubmitting,
    leadOptions,
    push,
    selectedBlueprint,
    strategies,
    toggleStrategy,
  } = useContentTeamOrchestratorPage();

  return (
    <Container
      description="Create a role-first campaign lead on top of the existing campaign and goal system."
      icon={HiOutlineRectangleGroup}
      label="Launch Orchestrator"
    >
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="content-team-campaign-label"
              >
                Campaign Label
              </label>
              <Input
                id="content-team-campaign-label"
                onChange={(event) =>
                  handleChange('campaignLabel', event.target.value)
                }
                placeholder="Creator launch team"
                value={form.campaignLabel}
              />
            </div>

            <div className="space-y-1.5">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="content-team-brand-id"
              >
                Brand
              </label>
              <Select
                value={form.brandId}
                onValueChange={(value) => handleChange('brandId', value)}
              >
                <SelectTrigger id="content-team-brand-id">
                  <SelectValue placeholder="Choose a brand" />
                </SelectTrigger>
                <SelectContent>
                  {brands.map((brand) => (
                    <SelectItem key={brand.id} value={brand.id}>
                      {brand.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="content-team-campaign-brief"
            >
              Objective
            </label>
            <Textarea
              id="content-team-campaign-brief"
              onChange={(event) =>
                handleChange('campaignBrief', event.target.value)
              }
              placeholder="Describe the campaign lead objective, quota, and approval expectations."
              rows={4}
              value={form.campaignBrief}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="content-team-blueprint"
              >
                Blueprint
              </label>
              <Select
                value={form.blueprintId}
                onValueChange={(value) => handleChange('blueprintId', value)}
              >
                <SelectTrigger id="content-team-blueprint">
                  <SelectValue placeholder="Choose a blueprint" />
                </SelectTrigger>
                <SelectContent>
                  {CONTENT_TEAM_BLUEPRINT_PRESETS.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="content-team-campaign-lead"
              >
                Campaign Lead
              </label>
              <Select
                value={form.leadSelection}
                onValueChange={(value) => handleChange('leadSelection', value)}
              >
                <SelectTrigger id="content-team-campaign-lead">
                  <SelectValue placeholder="Choose a lead" />
                </SelectTrigger>
                <SelectContent>
                  {leadOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="content-team-credits"
              >
                Shared Budget
              </label>
              <Input
                id="content-team-credits"
                min={0}
                onChange={(event) =>
                  handleChange('creditsAllocated', event.target.value)
                }
                type="number"
                value={form.creditsAllocated}
              />
            </div>
          </div>

          <OrchestratorSpecialistsSection
            selectedStrategyIds={form.selectedStrategyIds}
            strategies={strategies}
            toggleStrategy={toggleStrategy}
          />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="content-team-persona"
              >
                Shared Persona
              </label>
              <Textarea
                id="content-team-persona"
                onChange={(event) =>
                  handleChange('persona', event.target.value)
                }
                placeholder="Describe the brand operator voice for the whole team."
                rows={4}
                value={form.persona}
              />
            </div>

            <div className="space-y-1.5">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="content-team-topic"
              >
                Shared Topic
              </label>
              <Input
                id="content-team-topic"
                onChange={(event) =>
                  handleChange('sharedTopic', event.target.value)
                }
                placeholder="e.g. creator commerce, AI tutorials, growth loops"
                value={form.sharedTopic}
              />
              <label
                className="mt-4 block text-sm font-medium text-foreground"
                htmlFor="content-team-reports"
              >
                Reports To
              </label>
              <Input
                id="content-team-reports"
                onChange={(event) =>
                  handleChange('reportsToLabel', event.target.value)
                }
                placeholder="Main Orchestrator"
                value={form.reportsToLabel}
              />
            </div>
          </div>

          <OrchestratorGoalSection
            goalDescription={form.goalDescription}
            goalLabel={form.goalLabel}
            goalMetric={form.goalMetric}
            goalTargetValue={form.goalTargetValue}
            onChangeDescription={(value) =>
              handleChange('goalDescription', value)
            }
            onChangeLabel={(value) => handleChange('goalLabel', value)}
            onChangeMetric={(value) => handleChange('goalMetric', value)}
            onChangeTargetValue={(value) =>
              handleChange('goalTargetValue', value)
            }
          />

          <div className="flex items-center gap-3">
            <Button
              label={isSubmitting ? 'Launching…' : 'Launch Team'}
              type="submit"
              variant={ButtonVariant.DEFAULT}
            />
            <Button
              label="Cancel"
              onClick={() => push('/orchestration')}
              type="button"
              variant={ButtonVariant.SECONDARY}
            />
          </div>
        </form>

        <OrchestratorBlueprintPreview
          blueprintRoles={blueprintRoles}
          selectedBlueprint={selectedBlueprint}
          selectedStrategyCount={form.selectedStrategyIds.length}
        />
      </div>
    </Container>
  );
}
