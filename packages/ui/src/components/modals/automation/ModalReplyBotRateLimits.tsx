import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';

type RateLimits = {
  cooldownMinutes: number;
  maxDmsPerDay: number;
  maxDmsPerHour: number;
  maxRepliesPerDay: number;
  maxRepliesPerHour: number;
};

type Props = {
  rateLimits: RateLimits;
  showDmSettings: boolean;
  isSubmitting: boolean;
  onRateLimitChange: (field: string, value: number) => void;
};

export default function ModalReplyBotRateLimits({
  rateLimits,
  showDmSettings,
  isSubmitting,
  onRateLimitChange,
}: Props) {
  return (
    <>
      <div className="flex items-center gap-4 my-4">
        <div className="h-px bg-border flex-1" />
        <span className="text-sm text-muted-foreground">Rate Limits</span>
        <div className="h-px bg-border flex-1" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormControl label="Max Replies/Hour">
          <Input
            type="number"
            value={rateLimits.maxRepliesPerHour}
            onChange={(e) =>
              onRateLimitChange(
                'maxRepliesPerHour',
                parseInt(e.target.value, 10),
              )
            }
            min={1}
            max={100}
            disabled={isSubmitting}
          />
        </FormControl>

        <FormControl label="Max Replies/Day">
          <Input
            type="number"
            value={rateLimits.maxRepliesPerDay}
            onChange={(e) =>
              onRateLimitChange(
                'maxRepliesPerDay',
                parseInt(e.target.value, 10),
              )
            }
            min={1}
            max={500}
            disabled={isSubmitting}
          />
        </FormControl>

        {showDmSettings && (
          <>
            <FormControl label="Max DMs/Hour">
              <Input
                type="number"
                value={rateLimits.maxDmsPerHour}
                onChange={(e) =>
                  onRateLimitChange(
                    'maxDmsPerHour',
                    parseInt(e.target.value, 10),
                  )
                }
                min={0}
                max={50}
                disabled={isSubmitting}
              />
            </FormControl>

            <FormControl label="Max DMs/Day">
              <Input
                type="number"
                value={rateLimits.maxDmsPerDay}
                onChange={(e) =>
                  onRateLimitChange(
                    'maxDmsPerDay',
                    parseInt(e.target.value, 10),
                  )
                }
                min={0}
                max={200}
                disabled={isSubmitting}
              />
            </FormControl>
          </>
        )}

        <FormControl label="Cooldown (minutes)">
          <Input
            type="number"
            value={rateLimits.cooldownMinutes}
            onChange={(e) =>
              onRateLimitChange('cooldownMinutes', parseInt(e.target.value, 10))
            }
            min={0}
            max={60}
            disabled={isSubmitting}
          />
        </FormControl>
      </div>
    </>
  );
}
