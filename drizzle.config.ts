import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./server/src/db/schema.ts",
  out: "./server/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgres://kb:kb@127.0.0.1:5432/private_kb",
  },
  strict: true,
  verbose: true,
});
