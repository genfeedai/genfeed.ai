// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
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
