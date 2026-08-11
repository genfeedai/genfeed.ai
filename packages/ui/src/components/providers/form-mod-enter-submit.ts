/**
 * Pure helpers for global ⌘/Ctrl+Enter form submit.
 *
 * Native HTML only submits single-line fields on plain Enter. Product forms
 * (auth, settings, modals, etc.) expect mod+Enter as well — same muscle
 * memory as chat composers.
 */

const SUBMIT_CONTROL_SELECTOR = [
  'button[type="submit"]:not(:disabled)',
  'input[type="submit"]:not(:disabled)',
  // HTML default type for <button> is "submit"
  'button:not([type]):not(:disabled)',
].join(', ');

export function isModEnterKey(event: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  defaultPrevented?: boolean;
  isComposing?: boolean;
  repeat?: boolean;
}): boolean {
  if (event.key !== 'Enter') {
    return false;
  }
  if (!(event.metaKey || event.ctrlKey)) {
    return false;
  }
  if (event.defaultPrevented || event.isComposing || event.repeat) {
    return false;
  }
  return true;
}

function findEnabledSubmitter(
  form: HTMLFormElement,
): HTMLButtonElement | HTMLInputElement | null {
  const submitter = form.querySelector(SUBMIT_CONTROL_SELECTOR);

  return submitter instanceof HTMLButtonElement ||
    submitter instanceof HTMLInputElement
    ? submitter
    : null;
}

export function findSubmittableForm(
  target: EventTarget | null,
): HTMLFormElement | null {
  if (!(target instanceof HTMLElement)) {
    return null;
  }
  if (target.isContentEditable) {
    return null;
  }

  const form = target.closest('form');
  if (!(form instanceof HTMLFormElement)) {
    return null;
  }

  // Opt out: data-mod-enter-submit="false"
  if (form.dataset.modEnterSubmit === 'false') {
    return null;
  }

  if (!findEnabledSubmitter(form)) {
    return null;
  }

  return form;
}

/**
 * Returns true when the event was handled (form submitted).
 */
export function handleFormModEnterSubmit(event: KeyboardEvent): boolean {
  if (!isModEnterKey(event)) {
    return false;
  }

  const form = findSubmittableForm(event.target);
  if (!form) {
    return false;
  }

  const submitter = findEnabledSubmitter(form);
  if (!submitter) {
    return false;
  }

  // requestSubmit runs constraint validation and fires the React onSubmit
  // handler. Do not fall back to form.submit() — that skips both.
  if (typeof form.requestSubmit !== 'function') {
    return false;
  }

  event.preventDefault();
  form.requestSubmit(submitter);
  return true;
}
