import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  use: {
    baseURL: `http://127.0.0.1:4173${process.env.VITE_BASE_PATH?.startsWith('/') ? process.env.VITE_BASE_PATH : '/'}`,
    viewport: { width: 1440, height: 1080 },
  },
  webServer: {
    command: 'npm run preview -- --port 4173',
    url: `http://127.0.0.1:4173${process.env.VITE_BASE_PATH?.startsWith('/') ? process.env.VITE_BASE_PATH : '/'}`,
    reuseExistingServer: !process.env.CI,
  },
  reporter: 'list',
});
