import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { neon } from "@neondatabase/serverless";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL!;
const isLocal = databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1");

// Use node-postgres for local development, Neon for production
export const db = isLocal
  ? drizzlePg(new pg.Pool({ connectionString: databaseUrl }))
  : drizzleNeon({ client: neon(databaseUrl) });

export * from "./schema";
