import { config } from 'zod';

// Configure before shared contracts initialize: MCP hosts forbid eval, including
// Zod's caught JIT capability probe. This affects only the isolated browser bundle.
config({ jitless: true });
