// Generated for #5244: the shipping tsconfig sets no explicit "types",
// which auto-includes every @types/* package but never vitest's own
// "vitest/globals" subpath. Referencing it here — rather than adding an
// explicit "types" array to the specs config — avoids silently dropping
// whatever @types/* packages implicit-all mode was already providing.
/// <reference types="vitest/globals" />
