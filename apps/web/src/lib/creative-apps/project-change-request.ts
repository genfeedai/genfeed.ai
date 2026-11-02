const CHANGE_VERBS =
  'adjust|change|continue|edit|fix|redo|revise|rework|tweak|update';

const LEADING_CHANGE_REQUEST = new RegExp(
  `^(?:(?:please|can you|could you|would you)\\s+)?(?:${CHANGE_VERBS})\\b`,
  'i',
);

/**
 * Whether a prompt asks to change work that already exists ("revise the
 * intro", "please fix the captions") rather than start something new. A
 * creative app's New screen has no project to change, so it asks which one
 * instead of creating another. Only a leading verb counts, so "a post about
 * how to fix a bike" still starts a new project.
 *
 * The screen has no agent turn of its own, so this is the check it runs
 * before handing the prompt over; the agent applies the same rule to every
 * turn it takes on the page.
 */
export function isProjectChangeRequest(prompt: string): boolean {
  return LEADING_CHANGE_REQUEST.test(prompt.trim());
}
