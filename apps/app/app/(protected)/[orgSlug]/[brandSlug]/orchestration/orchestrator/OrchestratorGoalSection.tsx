import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';

type GoalMetric = 'engagement_rate' | 'posts' | 'views';

type Props = {
  goalDescription: string;
  goalLabel: string;
  goalMetric: GoalMetric;
  goalTargetValue: string;
  onChangeDescription: (value: string) => void;
  onChangeLabel: (value: string) => void;
  onChangeMetric: (value: GoalMetric) => void;
  onChangeTargetValue: (value: string) => void;
};

export default function OrchestratorGoalSection({
  goalDescription,
  goalLabel,
  goalMetric,
  goalTargetValue,
  onChangeDescription,
  onChangeLabel,
  onChangeMetric,
  onChangeTargetValue,
}: Props) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="space-y-1.5 md:col-span-2">
          <label
            className="text-sm font-medium text-foreground"
            htmlFor="content-team-goal-label"
          >
            Company Goal Label
          </label>
          <Input
            id="content-team-goal-label"
            onChange={(event) => onChangeLabel(event.target.value)}
            placeholder="April views target"
            value={goalLabel}
          />
        </div>

        <div className="space-y-1.5">
          <label
            className="text-sm font-medium text-foreground"
            htmlFor="content-team-goal-metric"
          >
            Goal Metric
          </label>
          <Select
            value={goalMetric}
            onValueChange={(value) => onChangeMetric(value as GoalMetric)}
          >
            <SelectTrigger id="content-team-goal-metric">
              <SelectValue placeholder="Choose a metric" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="views">Views</SelectItem>
              <SelectItem value="posts">Posts</SelectItem>
              <SelectItem value="engagement_rate">Engagement Rate</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label
            className="text-sm font-medium text-foreground"
            htmlFor="content-team-goal-target"
          >
            Goal Target
          </label>
          <Input
            id="content-team-goal-target"
            min={0}
            onChange={(event) => onChangeTargetValue(event.target.value)}
            type="number"
            value={goalTargetValue}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label
          className="text-sm font-medium text-foreground"
          htmlFor="content-team-goal-description"
        >
          Goal Context
        </label>
        <Textarea
          id="content-team-goal-description"
          onChange={(event) => onChangeDescription(event.target.value)}
          placeholder="Explain what winning this campaign should look like."
          rows={3}
          value={goalDescription}
        />
      </div>
    </>
  );
}
