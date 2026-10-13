/**
 * Quiet at rest on a hover-capable pointer; visible when the primary pointer
 * cannot hover. Pair with an ancestor `group`.
 *
 * The hidden state is gated on `@media (hover: hover)` rather than undone with
 * `hover: none`, so touch never depends on a later override. Tailwind's own
 * `group-hover:` variant is already inside `@media (hover: hover)` and is
 * emitted before arbitrary media utilities, so the reveal classes repeat that
 * media query — otherwise `group-hover:opacity-100` loses to the later hide.
 * Opacity and pointer-events move together so a hidden control is not clickable.
 */

export type HoverRevealAt = 'sm' | 'lg';

/** How keyboard focus reveals the control. `group` is focus inside the parent group. */
export type HoverRevealFocus =
  | 'group'
  | 'group-visible'
  | 'within'
  | 'visible'
  | 'none';

export type HoverRevealOptions = {
  /** Named Tailwind group, for example `preset` on `group/preset`. */
  group?: string;
  /** Breakpoint that owns the hidden state. Below it the control stays visible. */
  at?: HoverRevealAt;
  focus?: HoverRevealFocus;
  /**
   * Move pointer-events with opacity. Turn off for labels that must never
   * take a hit; the caller keeps `pointer-events-none`.
   */
  isInteractive?: boolean;
};

export type HoverConcealOptions = {
  group?: string;
  focus?: 'group' | 'group-visible';
};

function hoverCapable(at: HoverRevealAt | undefined, utility: string): string {
  const body = at ? `${at}:${utility}` : utility;
  return `[@media(hover:hover)]:${body}`;
}

function groupVariant(
  kind: 'hover' | 'focus-within' | 'focus-visible',
  group: string | undefined,
): string {
  return group ? `group-${kind}/${group}` : `group-${kind}`;
}

function focusUtility(
  focus: HoverRevealFocus,
  group: string | undefined,
): string | null {
  switch (focus) {
    case 'group':
      return groupVariant('focus-within', group);
    case 'group-visible':
      return groupVariant('focus-visible', group);
    case 'within':
      return 'focus-within';
    case 'visible':
      return 'focus-visible';
    default:
      return null;
  }
}

export function hoverRevealClassName({
  at,
  focus = 'group',
  group,
  isInteractive = true,
}: HoverRevealOptions = {}): string {
  const revealOnHover = groupVariant('hover', group);
  const revealOnFocus = focusUtility(focus, group);
  const classes = ['opacity-100'];

  if (isInteractive) {
    classes.push('pointer-events-auto');
  }

  classes.push(hoverCapable(at, 'opacity-0'));
  if (isInteractive) {
    classes.push(hoverCapable(at, 'pointer-events-none'));
  }

  classes.push(hoverCapable(at, `${revealOnHover}:opacity-100`));
  if (isInteractive) {
    classes.push(hoverCapable(at, `${revealOnHover}:pointer-events-auto`));
  }

  if (revealOnFocus) {
    classes.push(hoverCapable(at, `${revealOnFocus}:opacity-100`));
    if (isInteractive) {
      classes.push(hoverCapable(at, `${revealOnFocus}:pointer-events-auto`));
    }
  }

  return classes.join(' ');
}

/** Drop the hover-capable hide (menu open, selection) while touch stays visible. */
export function hoverRevealOpenClassName({
  at,
  isInteractive = true,
}: Pick<HoverRevealOptions, 'at' | 'isInteractive'> = {}): string {
  const classes = ['opacity-100', hoverCapable(at, 'opacity-100')];
  if (isInteractive) {
    classes.push(
      'pointer-events-auto',
      hoverCapable(at, 'pointer-events-auto'),
    );
  }
  return classes.join(' ');
}

/**
 * Resting label that yields to a hover-revealed action. Hidden on touch,
 * because the action is shown there, and hidden again while the group is
 * hovered or focused on a hover-capable pointer.
 */
export function hoverConcealClassName({
  focus = 'group',
  group,
}: HoverConcealOptions = {}): string {
  const concealOnFocus =
    focus === 'group-visible'
      ? groupVariant('focus-visible', group)
      : groupVariant('focus-within', group);

  return [
    'opacity-0',
    hoverCapable(undefined, 'opacity-100'),
    hoverCapable(undefined, `${groupVariant('hover', group)}:opacity-0`),
    hoverCapable(undefined, `${concealOnFocus}:opacity-0`),
  ].join(' ');
}
