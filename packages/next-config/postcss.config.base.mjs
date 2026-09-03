/**
 * Base PostCSS config shared across all web apps.
 * Import this in each app's postcss.config.mjs
 */
const config = {
  plugins: {
    '@tailwindcss/postcss': {
      base: '../../',
      // Dev PostCSS runs in a Turbopack worker with a short deadline.
      // Minify only in production so local compiles finish before SIGTERM.
      optimize: process.env.NODE_ENV === 'production',
    },
  },
};

export default config;
