/** Only values from the effective model's supported durations may be selected. */
export function snapStoryboardDuration(
  requested: number,
  supported: readonly number[],
  availableSeconds: number,
): number | undefined {
  if (
    !Number.isFinite(requested) ||
    !Number.isFinite(availableSeconds) ||
    requested <= 0 ||
    availableSeconds <= 0
  )
    return undefined;
  const closest = [
    ...new Set(
      supported.filter(
        (duration) =>
          Number.isFinite(duration) && duration > 0 && duration <= 60,
      ),
    ),
  ].sort(
    (a, b) => Math.abs(a - requested) - Math.abs(b - requested) || a - b,
  )[0];
  return closest !== undefined && closest <= availableSeconds
    ? closest
    : undefined;
}

export function storyboardRuntimeRanges(
  shots: readonly { id: string; durationSeconds: number | null }[],
) {
  let seconds = 0;
  return shots.map((shot) => {
    const startSeconds = seconds;
    seconds += shot.durationSeconds ?? 0;
    return { id: shot.id, startSeconds, endSeconds: seconds };
  });
}

/** `mm:ss` for a whole-second position on the storyboard timeline. */
export function formatStoryboardTimecode(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)
    .toString()
    .padStart(2, '0')}:${(whole % 60).toString().padStart(2, '0')}`;
}

/** The slider step that lands on every supported duration. */
export function storyboardDurationStep(supported: readonly number[]): number {
  const whole = supported.filter(
    (duration) => Number.isInteger(duration) && duration > 0,
  );
  if (!whole.length || whole.length !== supported.length) return 1;
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  return whole.reduce((step, duration) => gcd(step, duration));
}
