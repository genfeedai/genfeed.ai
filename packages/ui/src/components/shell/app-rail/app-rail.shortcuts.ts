/** One handler per active rail surface; state dies with its listener. */
export function createAppRailShortcutHandler(
  isDesktop: boolean,
  navigate: (index: number) => boolean,
  now: () => number = Date.now,
) {
  let sequenceStartedAt: number | undefined;
  const reset = () => {
    sequenceStartedAt = undefined;
  };
  const handleKeyDown = (event: KeyboardEvent) => {
    const target = event.target;
    const isEditable =
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        Boolean(
          target.closest(
            'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
          ),
        ));
    if (
      isEditable ||
      event.defaultPrevented ||
      event.isComposing ||
      event.repeat
    ) {
      reset();
      return;
    }
    const isNumber = /^[1-9]$/.test(event.key);
    if (isDesktop) {
      reset();
      if (
        event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        isNumber &&
        navigate(Number(event.key) - 1)
      ) {
        event.preventDefault();
      }
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
      reset();
      return;
    }
    if (event.key.toLowerCase() === 'g') {
      sequenceStartedAt = now();
      return;
    }
    const isWithinWindow =
      sequenceStartedAt !== undefined && now() - sequenceStartedAt <= 1000;
    reset();
    if (isWithinWindow && isNumber && navigate(Number(event.key) - 1)) {
      event.preventDefault();
    }
  };
  return { handleKeyDown, reset };
}
