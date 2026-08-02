import type {
  ContentTeamBlueprintPreset,
  ContentTeamRolePreset,
} from '@pages/agents/content-team/content-team-presets';
import Card from '@ui/card/Card';

type Props = {
  blueprintRoles: ContentTeamRolePreset[];
  selectedBlueprint: ContentTeamBlueprintPreset | undefined;
  selectedStrategyCount: number;
};

export default function OrchestratorBlueprintPreview({
  blueprintRoles,
  selectedBlueprint,
  selectedStrategyCount,
}: Props) {
  return (
    <Card
      bodyClassName="space-y-4 p-5"
      description={selectedBlueprint?.description}
      label={selectedBlueprint?.label ?? 'Blueprint Preview'}
    >
      <div className="space-y-3 text-sm">
        <div>
          <p className="text-foreground/45">Planned Roles</p>
          <p className="mt-1 font-medium text-foreground">
            {blueprintRoles.map((role) => role.displayRole).join(', ')}
          </p>
        </div>
        <div>
          <p className="text-foreground/45">Approval Policy</p>
          <p className="mt-1 font-medium text-foreground">Manual review</p>
        </div>
        <div>
          <p className="text-foreground/45">Existing Agents Attached</p>
          <p className="mt-1 font-medium text-foreground">
            {selectedStrategyCount}
          </p>
        </div>
      </div>
    </Card>
  );
}
