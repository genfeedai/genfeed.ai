// https://docs.expo.dev/guides/using-eslint/
import { defineConfig } from 'eslint/config';
import expoConfig from 'eslint-config-expo/flat.js';

export default defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    rules: {
      'import/namespace': 'off',
      'import/no-unresolved': [
        'error',
        { ignore: ['@shopify/flash-list', 'react-native'] },
      ],
    },
    settings: {
      react: {
        version: '19.0',
      },
    },
  },
]);
