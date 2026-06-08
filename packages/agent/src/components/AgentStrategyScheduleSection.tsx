import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import type { ReactElement } from 'react';

const RUN_FREQUENCY_OPTIONS = [
  { label: 'Every 6 hours', value: 'every_6_hours' },
  { label: 'Twice daily', value: 'twice_daily' },
  { label: 'Daily', value: 'daily' },
];

const TIMEZONE_OPTIONS = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Australia/Sydney',
  'UTC',
];

type Props = {
  runFrequency: string;
  setRunFrequency: (value: string) => void;
  timezone: string;
  setTimezone: (value: string) => void;
  postsPerWeek: number;
  setPostsPerWeek: (value: number) => void;
};

export function AgentStrategyScheduleSection({
  runFrequency,
  setRunFrequency,
  timezone,
  setTimezone,
  postsPerWeek,
  setPostsPerWeek,
}: Props): ReactElement {
  return (
    <section className="space-y-4 border border-border p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Schedule
      </h3>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1">
          <label
            htmlFor="strategy-run-frequency"
            className="text-xs font-medium text-foreground"
          >
            Run Frequency
          </label>
          <Select value={runFrequency} onValueChange={setRunFrequency}>
            <SelectTrigger id="strategy-run-frequency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RUN_FREQUENCY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="strategy-timezone"
            className="text-xs font-medium text-foreground"
          >
            Timezone
          </label>
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger id="strategy-timezone">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONE_OPTIONS.map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="strategy-posts-per-week"
            className="text-xs font-medium text-foreground"
          >
            Posts / Week
          </label>
          <Input
            id="strategy-posts-per-week"
            type="number"
            value={postsPerWeek}
            onChange={(e) => setPostsPerWeek(Number(e.target.value))}
            min={1}
            max={100}
          />
        </div>
      </div>
    </section>
  );
}
