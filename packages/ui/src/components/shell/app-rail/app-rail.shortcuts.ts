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
    const isEditableOrOverlay =
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        Boolean(
          target.closest(
            'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="menu"], [role="menubar"], [role="listbox"], [role="dialog"], [role="alertdialog"], [role="combobox"]',
          ),
        ));
    if (
      isEditableOrOverlay ||
      event.defaultPrevented ||
      event.isComposing ||
      event.repeat
    ) {
      reset();
      return;
    }
    const digitMatch = /^(?:Digit|Numpad)([1-9])$/.exec(event.code);
    if (isDesktop) {
      reset();
      if (
        event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        digitMatch &&
        navigate(Number(digitMatch[1]) - 1)
      ) {
        event.preventDefault();
      }
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
      reset();
      return;
    }
    if (event.code === 'KeyG' || event.key.toLowerCase() === 'g') {
      sequenceStartedAt = now();
      return;
    }
    const isWithinWindow =
      sequenceStartedAt !== undefined && now() - sequenceStartedAt <= 1000;
    reset();
    if (isWithinWindow && digitMatch && navigate(Number(digitMatch[1]) - 1)) {
      event.preventDefault();
    }
  };
  return { handleKeyDown, reset };
}
