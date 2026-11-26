// One fixed height for every pane header: a header that grows with its content
// would push the divider lines out of line with the pane beside it.
export const AGENT_PANE_HEADER_CLASS_NAME =
  'flex h-12 shrink-0 items-center gap-2 border-b border-border px-4';

// The agent pane's share of the two-pane width is remembered in this browser
// under one key, so every app that puts the agent beside its output opens at
// the split the operator last chose.
export const AGENT_OUTPUT_SPLIT_STORAGE_KEY = 'genfeed:agent-output-split';

// A creative app's projects list sits in the output pane, beside the agent. It
// keeps a small inset so the thread rows, not the page margin, carry the eye.
export const CREATIVE_PROJECTS_LIST_BODY_CLASS_NAME =
  'px-2 py-2 sm:px-2 sm:py-2';
