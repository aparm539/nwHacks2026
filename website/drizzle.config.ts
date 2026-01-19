import { defineConfig } from 'drizzle-kit'
import 'dotenv/config'

const databaseUrl = process.env.DATABASE_URL!

export default defineConfig({
  out: './drizzle',
  schema: './db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
})
