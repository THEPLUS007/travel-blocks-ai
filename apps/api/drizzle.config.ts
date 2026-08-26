import { defineConfig } from 'drizzle-kit';
import { loadDatabaseUrlForTooling } from './src/config.js';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: loadDatabaseUrlForTooling() },
});
