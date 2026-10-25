/**
 * `onCloseAutoFocus` for the menus and popovers of a prompt bar. Radix hands
 * focus back to the trigger of the menu that closed. When the operator closed
 * it by clicking another control, that control already holds focus and has
 * opened its own menu; stealing focus back would dismiss that menu again, so a
 * switch would take two clicks. Focus is only restored when nothing else has it.
 */
export function keepFocusOnSwitch(event: Event): void {
  const active = document.activeElement;
  if (active && active !== document.body) {
    event.preventDefault();
  }
}
