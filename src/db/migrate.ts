import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { createDatabase } from "./connection.js";
import { logger } from "../utils/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveMigrationsDir() {
  const candidates = [
    path.resolve(__dirname, "../../migrations"),
    path.resolve(__dirname, "../../../migrations"),
    path.resolve(process.cwd(), "migrations")
  ];

  const migrationsDir = candidates.find((candidate) => fs.existsSync(candidate));
  if (!migrationsDir) {
    throw new Error(`Migrations directory not found. Checked: ${candidates.join(", ")}`);
  }

  return migrationsDir;
}

export function runMigrations(databasePath = config.DATABASE_PATH) {
  const db = createDatabase(databasePath);
  const migrationsDir = resolveMigrationsDir();
  const migrations = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");

  const applied = new Set(
    db.prepare("SELECT filename FROM schema_migrations").all().map((row) => (row as { filename: string }).filename)
  );

  for (const migration of migrations) {
    if (applied.has(migration)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, migration), "utf8");
    db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (filename, applied_at) VALUES (?, ?)").run(
        migration,
        new Date().toISOString()
      );
    })();
    logger.info({ migration }, "Applied migration");
  }

  return db;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations().close();
}
