/**
 * The width a masonry container will have once the CSS transitions that are
 * running around it finish.
 *
 * A side drawer or a rail does not resize the grid in one step: it eases a
 * margin, a padding or a sibling's width over a few hundred milliseconds, so
 * the container's own width sweeps through every value in between. Packing
 * tiles for each of those values flips the column count part-way through and
 * the whole grid jumps. Knowing where the sweep ends lets the grid pack once
 * for the destination and follow the sweep by interpolating.
 *
 * Reads the Web Animations API, so it needs no knowledge of which component
 * animates what. Returns `null` when nothing around the container is
 * transitioning (a window resize, a drag), or the API is missing.
 */

/** Properties of an ancestor that eat into the width of everything inside it. */
const ANCESTOR_INSET_PROPERTIES = new Set([
  'margin-left',
  'margin-right',
  'padding-left',
  'padding-right',
  'border-left-width',
  'border-right-width',
]);

function toCamelCase(property: string): string {
  return property.replace(/-([a-z])/g, (_, letter: string) =>
    letter.toUpperCase(),
  );
}

function readPixels(value: unknown): number | null {
  if (typeof value !== 'string' || !value.endsWith('px')) {
    return null;
  }

  const pixels = Number.parseFloat(value);
  return Number.isFinite(pixels) ? pixels : null;
}

/** The value a transition is heading for, from its last keyframe. */
function readTransitionTarget(
  effect: KeyframeEffect,
  property: string,
): number | null {
  const keyframes = effect.getKeyframes();
  const lastKeyframe = keyframes[keyframes.length - 1];
  if (!lastKeyframe) {
    return null;
  }

  return readPixels(lastKeyframe[toCamelCase(property)]);
}

function isOutOfFlow(element: HTMLElement): boolean {
  const { position } = getComputedStyle(element);
  return position === 'absolute' || position === 'fixed';
}

function growsToFillRow(element: HTMLElement): boolean {
  return Number.parseFloat(getComputedStyle(element).flexGrow) > 0;
}

/**
 * A fixed-width sibling of one of the container's ancestors, in a row where
 * that ancestor alone fills the space the sibling leaves. The sibling growing
 * by some pixels then shrinks the container by the same amount; with another
 * flexible sibling in the row the change would be shared out between them.
 */
function isRowSiblingOfAncestor(
  target: HTMLElement,
  container: HTMLElement,
): boolean {
  const parent = target.parentElement;
  if (
    !parent ||
    target.contains(container) ||
    !parent.contains(container) ||
    isOutOfFlow(target) ||
    growsToFillRow(target)
  ) {
    return false;
  }

  const parentStyle = getComputedStyle(parent);
  if (
    !parentStyle.display.includes('flex') ||
    !parentStyle.flexDirection.startsWith('row')
  ) {
    return false;
  }

  const flexibleChildren = Array.from(parent.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement &&
      !isOutOfFlow(child) &&
      growsToFillRow(child),
  );
  return (
    flexibleChildren.length === 1 && flexibleChildren[0].contains(container)
  );
}

export function resolveSettledContainerWidth(
  container: HTMLElement,
): number | null {
  if (
    typeof document === 'undefined' ||
    typeof document.getAnimations !== 'function' ||
    typeof KeyframeEffect === 'undefined'
  ) {
    return null;
  }

  let settledWidth = container.clientWidth;
  let isTransitioning = false;

  for (const animation of document.getAnimations()) {
    if (!('transitionProperty' in animation)) {
      continue;
    }

    const property = (animation as CSSTransition).transitionProperty;
    const effect = animation.effect;
    if (!(effect instanceof KeyframeEffect)) {
      continue;
    }

    const target = effect.target;
    if (!(target instanceof HTMLElement)) {
      continue;
    }

    const isAncestorInset =
      ANCESTOR_INSET_PROPERTIES.has(property) && target.contains(container);
    const isSiblingWidth =
      property === 'width' && isRowSiblingOfAncestor(target, container);
    if (!isAncestorInset && !isSiblingWidth) {
      continue;
    }

    const settledValue = readTransitionTarget(effect, property);
    const currentValue = readPixels(
      getComputedStyle(target).getPropertyValue(property),
    );
    if (settledValue === null || currentValue === null) {
      continue;
    }

    settledWidth -= settledValue - currentValue;
    isTransitioning = true;
  }

  return isTransitioning ? Math.max(0, settledWidth) : null;
}
