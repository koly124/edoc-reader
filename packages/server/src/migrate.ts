import { pool, runMigrations } from "./db";

runMigrations()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => pool.end());
