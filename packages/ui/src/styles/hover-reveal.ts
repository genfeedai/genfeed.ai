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
 *
 * Every utility below is a complete literal. Tailwind scans source text and
 * does not evaluate concatenation, and app CSS excludes tests, so a class
 * built from fragments would never be emitted.
 */

export type HoverRevealAt = 'sm' | 'lg';

/** How keyboard focus reveals the control. `group` is focus inside the parent group. */
export type HoverRevealFocus =
  | 'group'
  | 'group-visible'
  | 'within'
  | 'visible'
  | 'none';

/** Named groups that have a complete class literal in this file. */
export type HoverRevealGroup = 'preset';

export type HoverRevealOptions = {
  /** Named Tailwind group, for example `preset` on `group/preset`. */
  group?: HoverRevealGroup;
  /** Breakpoint that owns the hidden state. Below it the control stays visible. */
  at?: HoverRevealAt;
  focus?: HoverRevealFocus;
  /**
   * Move pointer-events with opacity. Turn off for labels that must never
   * take a hit; the caller keeps `pointer-events-none`.
   */
  isInteractive?: boolean;
  /** Drop the hover-capable hide. Use while a menu or selection stays open. */
  isOpen?: boolean;
};

export type HoverConcealOptions = {
  group?: HoverRevealGroup;
  focus?: 'group' | 'group-visible';
};

type AtKey = 'base' | HoverRevealAt;
type GroupKey = 'base' | HoverRevealGroup;

const HIDE_OPACITY: Record<AtKey, string> = {
  base: '[@media(hover:hover)]:opacity-0',
  sm: '[@media(hover:hover)]:sm:opacity-0',
  lg: '[@media(hover:hover)]:lg:opacity-0',
};

const HIDE_POINTER: Record<AtKey, string> = {
  base: '[@media(hover:hover)]:pointer-events-none',
  sm: '[@media(hover:hover)]:sm:pointer-events-none',
  lg: '[@media(hover:hover)]:lg:pointer-events-none',
};

const HOVER_OPACITY: Record<AtKey, Record<GroupKey, string>> = {
  base: {
    base: '[@media(hover:hover)]:group-hover:opacity-100',
    preset: '[@media(hover:hover)]:group-hover/preset:opacity-100',
  },
  sm: {
    base: '[@media(hover:hover)]:sm:group-hover:opacity-100',
    preset: '[@media(hover:hover)]:sm:group-hover/preset:opacity-100',
  },
  lg: {
    base: '[@media(hover:hover)]:lg:group-hover:opacity-100',
    preset: '[@media(hover:hover)]:lg:group-hover/preset:opacity-100',
  },
};

const HOVER_POINTER: Record<AtKey, Record<GroupKey, string>> = {
  base: {
    base: '[@media(hover:hover)]:group-hover:pointer-events-auto',
    preset: '[@media(hover:hover)]:group-hover/preset:pointer-events-auto',
  },
  sm: {
    base: '[@media(hover:hover)]:sm:group-hover:pointer-events-auto',
    preset: '[@media(hover:hover)]:sm:group-hover/preset:pointer-events-auto',
  },
  lg: {
    base: '[@media(hover:hover)]:lg:group-hover:pointer-events-auto',
    preset: '[@media(hover:hover)]:lg:group-hover/preset:pointer-events-auto',
  },
};

const GROUP_FOCUS_WITHIN_OPACITY: Record<AtKey, Record<GroupKey, string>> = {
  base: {
    base: '[@media(hover:hover)]:group-focus-within:opacity-100',
    preset: '[@media(hover:hover)]:group-focus-within/preset:opacity-100',
  },
  sm: {
    base: '[@media(hover:hover)]:sm:group-focus-within:opacity-100',
    preset: '[@media(hover:hover)]:sm:group-focus-within/preset:opacity-100',
  },
  lg: {
    base: '[@media(hover:hover)]:lg:group-focus-within:opacity-100',
    preset: '[@media(hover:hover)]:lg:group-focus-within/preset:opacity-100',
  },
};

const GROUP_FOCUS_WITHIN_POINTER: Record<AtKey, Record<GroupKey, string>> = {
  base: {
    base: '[@media(hover:hover)]:group-focus-within:pointer-events-auto',
    preset:
      '[@media(hover:hover)]:group-focus-within/preset:pointer-events-auto',
  },
  sm: {
    base: '[@media(hover:hover)]:sm:group-focus-within:pointer-events-auto',
    preset:
      '[@media(hover:hover)]:sm:group-focus-within/preset:pointer-events-auto',
  },
  lg: {
    base: '[@media(hover:hover)]:lg:group-focus-within:pointer-events-auto',
    preset:
      '[@media(hover:hover)]:lg:group-focus-within/preset:pointer-events-auto',
  },
};

const GROUP_FOCUS_VISIBLE_OPACITY: Record<AtKey, Record<GroupKey, string>> = {
  base: {
    base: '[@media(hover:hover)]:group-focus-visible:opacity-100',
    preset: '[@media(hover:hover)]:group-focus-visible/preset:opacity-100',
  },
  sm: {
    base: '[@media(hover:hover)]:sm:group-focus-visible:opacity-100',
    preset: '[@media(hover:hover)]:sm:group-focus-visible/preset:opacity-100',
  },
  lg: {
    base: '[@media(hover:hover)]:lg:group-focus-visible:opacity-100',
    preset: '[@media(hover:hover)]:lg:group-focus-visible/preset:opacity-100',
  },
};

const GROUP_FOCUS_VISIBLE_POINTER: Record<AtKey, Record<GroupKey, string>> = {
  base: {
    base: '[@media(hover:hover)]:group-focus-visible:pointer-events-auto',
    preset:
      '[@media(hover:hover)]:group-focus-visible/preset:pointer-events-auto',
  },
  sm: {
    base: '[@media(hover:hover)]:sm:group-focus-visible:pointer-events-auto',
    preset:
      '[@media(hover:hover)]:sm:group-focus-visible/preset:pointer-events-auto',
  },
  lg: {
    base: '[@media(hover:hover)]:lg:group-focus-visible:pointer-events-auto',
    preset:
      '[@media(hover:hover)]:lg:group-focus-visible/preset:pointer-events-auto',
  },
};

const SELF_FOCUS_WITHIN_OPACITY: Record<AtKey, string> = {
  base: '[@media(hover:hover)]:focus-within:opacity-100',
  sm: '[@media(hover:hover)]:sm:focus-within:opacity-100',
  lg: '[@media(hover:hover)]:lg:focus-within:opacity-100',
};

const SELF_FOCUS_WITHIN_POINTER: Record<AtKey, string> = {
  base: '[@media(hover:hover)]:focus-within:pointer-events-auto',
  sm: '[@media(hover:hover)]:sm:focus-within:pointer-events-auto',
  lg: '[@media(hover:hover)]:lg:focus-within:pointer-events-auto',
};

const SELF_FOCUS_VISIBLE_OPACITY: Record<AtKey, string> = {
  base: '[@media(hover:hover)]:focus-visible:opacity-100',
  sm: '[@media(hover:hover)]:sm:focus-visible:opacity-100',
  lg: '[@media(hover:hover)]:lg:focus-visible:opacity-100',
};

const SELF_FOCUS_VISIBLE_POINTER: Record<AtKey, string> = {
  base: '[@media(hover:hover)]:focus-visible:pointer-events-auto',
  sm: '[@media(hover:hover)]:sm:focus-visible:pointer-events-auto',
  lg: '[@media(hover:hover)]:lg:focus-visible:pointer-events-auto',
};

const CONCEAL_REST = '[@media(hover:hover)]:opacity-100';

const CONCEAL_HOVER: Record<GroupKey, string> = {
  base: '[@media(hover:hover)]:group-hover:opacity-0',
  preset: '[@media(hover:hover)]:group-hover/preset:opacity-0',
};

const CONCEAL_FOCUS_WITHIN: Record<GroupKey, string> = {
  base: '[@media(hover:hover)]:group-focus-within:opacity-0',
  preset: '[@media(hover:hover)]:group-focus-within/preset:opacity-0',
};

const CONCEAL_FOCUS_VISIBLE: Record<GroupKey, string> = {
  base: '[@media(hover:hover)]:group-focus-visible:opacity-0',
  preset: '[@media(hover:hover)]:group-focus-visible/preset:opacity-0',
};

function atKey(at: HoverRevealAt | undefined): AtKey {
  return at ?? 'base';
}

function groupKey(group: HoverRevealGroup | undefined): GroupKey {
  return group ?? 'base';
}

function focusReveal(
  focus: HoverRevealFocus,
  at: HoverRevealAt | undefined,
  group: HoverRevealGroup | undefined,
  isInteractive: boolean,
): string[] {
  const breakpoint = atKey(at);
  const named = groupKey(group);

  switch (focus) {
    case 'group':
      return [
        GROUP_FOCUS_WITHIN_OPACITY[breakpoint][named],
        isInteractive ? GROUP_FOCUS_WITHIN_POINTER[breakpoint][named] : '',
      ];
    case 'group-visible':
      return [
        GROUP_FOCUS_VISIBLE_OPACITY[breakpoint][named],
        isInteractive ? GROUP_FOCUS_VISIBLE_POINTER[breakpoint][named] : '',
      ];
    case 'within':
      return [
        SELF_FOCUS_WITHIN_OPACITY[breakpoint],
        isInteractive ? SELF_FOCUS_WITHIN_POINTER[breakpoint] : '',
      ];
    case 'visible':
      return [
        SELF_FOCUS_VISIBLE_OPACITY[breakpoint],
        isInteractive ? SELF_FOCUS_VISIBLE_POINTER[breakpoint] : '',
      ];
    default:
      return [];
  }
}

export function hoverRevealClassName({
  at,
  focus = 'group',
  group,
  isInteractive = true,
  isOpen = false,
}: HoverRevealOptions = {}): string {
  const breakpoint = atKey(at);
  const named = groupKey(group);
  const classes = ['opacity-100'];

  if (isInteractive) {
    classes.push('pointer-events-auto');
  }

  if (!isOpen) {
    classes.push(HIDE_OPACITY[breakpoint]);
    if (isInteractive) {
      classes.push(HIDE_POINTER[breakpoint]);
    }
  }

  classes.push(HOVER_OPACITY[breakpoint][named]);
  if (isInteractive) {
    classes.push(HOVER_POINTER[breakpoint][named]);
  }

  for (const utility of focusReveal(focus, at, group, isInteractive)) {
    if (utility) {
      classes.push(utility);
    }
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
  const named = groupKey(group);
  const concealOnFocus =
    focus === 'group-visible'
      ? CONCEAL_FOCUS_VISIBLE[named]
      : CONCEAL_FOCUS_WITHIN[named];

  return ['opacity-0', CONCEAL_REST, CONCEAL_HOVER[named], concealOnFocus].join(
    ' ',
  );
}
