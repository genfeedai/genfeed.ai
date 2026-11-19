import { beforeEach } from 'vitest';

// jsdom has no popover support. ui-sdk lists, menus and selects open as
// popovers, so a spec that opens one needs the popover methods to exist and
// the open content (and only that) to count as visible, as ui-sdk's testing guide suggests.
// This does not exercise native popup behaviour: that needs a browser.
if (typeof HTMLElement !== 'undefined') {
  HTMLElement.prototype.showPopover ??= () => {};
  HTMLElement.prototype.hidePopover ??= () => {};
}

function showOpenPopovers(): void {
  if (
    typeof document === 'undefined' ||
    document.head.querySelector('style[data-popover-stub]')
  ) {
    return;
  }

  const style = document.createElement('style');

  style.setAttribute('data-popover-stub', '');
  style.textContent = '[popover][data-open] { display: block !important }';
  document.head.append(style);
}

showOpenPopovers();
// A setup file may empty the document head between specs, so put it back.
beforeEach(showOpenPopovers);
