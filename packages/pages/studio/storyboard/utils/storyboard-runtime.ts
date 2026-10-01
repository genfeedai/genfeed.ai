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
