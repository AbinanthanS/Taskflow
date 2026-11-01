require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { pool, withTransaction } = require("../config/db");

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

/**
 * Runs all pending database migrations in alphabetical order.
 * Records executed migrations in `schema_migrations`.
 */
async function runMigrations() {
    // 1. Ensure migrations tracking table exists
    await pool.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            name       TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    `);

    // 2. Fetch already applied migrations
    const { rows: appliedRows } = await pool.query(
        "SELECT name FROM schema_migrations ORDER BY name ASC"
    );
    const appliedSet = new Set(appliedRows.map((r) => r.name));

    // 3. Read migration files
    if (!fs.existsSync(MIGRATIONS_DIR)) {
        console.log("No migrations directory found.");
        return;
    }

    const files = fs
        .readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith(".sql"))
        .sort();

    let count = 0;
    for (const file of files) {
        if (appliedSet.has(file)) {
            continue;
        }

        console.log(`Applying migration: ${file}...`);
        const filePath = path.join(MIGRATIONS_DIR, file);
        const sql = fs.readFileSync(filePath, "utf8");

        await withTransaction(async (client) => {
            await client.query(sql);
            await client.query(
                "INSERT INTO schema_migrations (name) VALUES ($1)",
                [file]
            );
        });

        console.log(`Applied migration: ${file}`);
        count++;
    }

    if (count === 0) {
        console.log("Database schema is up to date (no pending migrations).");
    } else {
        console.log(`Successfully applied ${count} migration(s).`);
    }
}

if (require.main === module) {
    runMigrations()
        .then(async () => {
            await pool.end();
            process.exit(0);
        })
        .catch(async (err) => {
            console.error("Migration failed:", err.message);
            await pool.end().catch(() => {});
            process.exit(1);
        });
}

module.exports = { runMigrations };
