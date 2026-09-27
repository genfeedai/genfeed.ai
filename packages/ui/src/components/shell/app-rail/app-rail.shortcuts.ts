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
    const isNumber = /^Digit[1-9]$/.test(event.code);
    if (isDesktop) {
      reset();
      if (
        event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        isNumber &&
        navigate(Number(event.code.slice(-1)) - 1)
      ) {
        event.preventDefault();
      }
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
      reset();
      return;
    }
    if (event.code === 'KeyG') {
      sequenceStartedAt = now();
      return;
    }
    const isWithinWindow =
      sequenceStartedAt !== undefined && now() - sequenceStartedAt <= 1000;
    reset();
    if (
      isWithinWindow &&
      isNumber &&
      navigate(Number(event.code.slice(-1)) - 1)
    ) {
      event.preventDefault();
    }
  };
  return { handleKeyDown, reset };
}
