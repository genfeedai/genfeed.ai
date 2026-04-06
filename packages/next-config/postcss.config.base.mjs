/**
 * Base PostCSS config shared across all web apps.
 * Import this in each app's postcss.config.mjs
 */
const config = {
  plugins: {
    '@tailwindcss/postcss': {
      base: '../../',
    },
  },
};

export default config;
