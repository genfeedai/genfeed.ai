import type { AgentStrategyPublishTogglesProps } from '@props/automation/agent-strategy-publish-toggles.props';
import { Checkbox } from '@ui/primitives/checkbox';
import { PLATFORM_OPTIONS } from './useAgentStrategyDialog';

export default function AgentStrategyPublishToggles({
  form,
  setForm,
  publishPolicy,
}: AgentStrategyPublishTogglesProps) {
  const threshold = publishPolicy?.autoPublishAfterApprovals;
  const requiredApprovals =
    typeof threshold === 'number' &&
    Number.isInteger(threshold) &&
    threshold >= 1 &&
    threshold <= 100
      ? threshold
      : 5;
  const platformStates = publishPolicy?.platformStates ?? {};
  const platforms = [
    ...new Set([...form.platforms, ...Object.keys(platformStates).sort()]),
  ];
  return (
    <div className="flex flex-col gap-3 rounded-md bg-secondary p-4 shadow-border">
      <span className="flex items-center gap-3 text-sm text-foreground">
        <Checkbox
          checked={form.autoPublishEnabled}
          onCheckedChange={(checked) =>
            setForm((prev) => ({
              ...prev,
              autoPublishEnabled: checked === true,
            }))
          }
          aria-label="Allow automatic publishing when policy checks pass"
        />
        Allow automatic publishing when policy checks pass
      </span>

      <span className="flex items-center gap-3 text-sm text-foreground">
        <Checkbox
          checked={form.isEnabled}
          onCheckedChange={(checked) =>
            setForm((prev) => ({
              ...prev,
              isEnabled: checked === true,
            }))
          }
          aria-label="Enable agent"
        />
        Enabled for scheduling
      </span>

      <span className="flex items-center gap-3 text-sm text-foreground">
        <Checkbox
          checked={form.isActive}
          onCheckedChange={(checked) =>
            setForm((prev) => ({
              ...prev,
              isActive: checked === true,
            }))
          }
          aria-label="Mark agent active"
        />
        Active and ready to run
      </span>
      <section
        aria-label="Platform approval progress"
        className="flex flex-col gap-2"
      >
        <p className="text-sm font-medium">Platform approval progress</p>
        {platforms.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Choose a platform to track approval progress.
          </p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {platforms.map((platform) => {
              const state = platformStates[platform];
              const streak = state?.approvalStreak;
              const count =
                typeof streak === 'number' &&
                Number.isInteger(streak) &&
                streak >= 0
                  ? streak
                  : 0;
              const label =
                PLATFORM_OPTIONS.find((option) => option.value === platform)
                  ?.label ?? platform;
              return (
                <li
                  key={platform}
                  className="flex flex-wrap items-center gap-2"
                >
                  <span>{label}</span>
                  <span>
                    {count}/{requiredApprovals} pristine approvals
                  </span>
                  <span>
                    {state?.autoPublishEnabled === true
                      ? 'Graduated'
                      : 'Review required'}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-sm text-muted-foreground">
          Graduation still requires agent and brand opt-ins, a connected
          account, and all publishing policy checks.
        </p>
        {!form.autoPublishEnabled && (
          <p className="text-sm text-muted-foreground">
            Automatic publishing is off for this agent.
          </p>
        )}
      </section>
    </div>
  );
}
