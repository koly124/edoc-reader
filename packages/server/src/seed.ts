import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { appConfig } from "@file-reader/shared";
import { pool } from "./db";

async function seed(): Promise<void> {
  const email = appConfig.demo.seedUserEmail;
  const password = appConfig.demo.seedUserPassword;
  const passwordHash = await bcrypt.hash(password, 12);

  const userId = randomUUID();
  await pool.query(
    `INSERT INTO users (id, email, password_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO NOTHING`,
    [userId, email, passwordHash]
  );

  console.log(`Seeded user: ${email} / ${password}`);
}

seed()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => pool.end());
