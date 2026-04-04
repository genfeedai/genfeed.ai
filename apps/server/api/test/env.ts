// Set NODE_ENV to test before any modules are loaded
process.env.NODE_ENV = 'test';

import { join } from 'node:path';
// Load test environment variables from the root `.env.test` file so that
// unit tests have all required configuration when executed in isolation.
// This mirrors the production configuration while keeping credentials
// safely scoped to the test environment.
import { config as loadEnv } from 'dotenv';

loadEnv({ path: join(process.cwd(), '.env.test') });
