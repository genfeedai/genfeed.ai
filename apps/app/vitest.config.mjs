import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from '../vitest.config.mts';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export default mergeConfig(baseConfig, defineConfig({
    resolve: {
        alias: [
            {
                find: 'server-only',
                replacement: path.resolve(__dirname, './tests/server-only.stub.ts'),
            },
        ],
    },
    test: {
        setupFiles: [path.resolve(__dirname, './vitest.setup.ts')],
    },
}));
