import { defineConfig } from 'deepsec/config';

export default defineConfig({
  projects: [
    { id: 'genfeed-ai', root: '..' },
    // <deepsec:projects-insert-above>
  ],
});
