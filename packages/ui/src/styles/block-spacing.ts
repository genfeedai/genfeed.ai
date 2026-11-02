/**
 * The one gap between blocks (KPI rows, cards, sections, empty states) on an
 * overview page. Stacks and grids both use it so a page never mixes 16, 24 and
 * 40 pixel gaps. Inside a block, `Card` padding owns the spacing.
 */
export const BLOCK_GAP_CLASS = 'gap-5';

/** Vertical stack of blocks. */
export const BLOCK_STACK_CLASS = `flex flex-col ${BLOCK_GAP_CLASS}`;
