import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL!;
const isLocal = databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1");

export default defineConfig({
  out: "./drizzle",
  schema: "./db/schema.ts",
  dialect: "postgresql",
  ...(isLocal ? {} : { driver: "neon-http" as const }),
  dbCredentials: {
    url: databaseUrl,
  },
});
