#!/usr/bin/env node
/**
 * seed-from-sqlite.mjs — one-time data migration for the DCA Portfolio Tracker
 * Vercel port.
 *
 * Steps:
 *   1. Apply drizzle/*.sql migrations to the TARGET DB in filename order
 *      (each file split on the "--> statement-breakpoint" marker).
 *   2. DELETE the default seed rows that the migrations insert
 *      (settings, assets, transactions — dependency order), so the real
 *      data can replace them.
 *   3. Copy every user table from the SOURCE SQLite file to the target
 *      (rows read via node:sqlite, opened read-only; never written).
 *
 * Usage:
 *   TURSO_AUTH_TOKEN=... node scripts/seed-from-sqlite.mjs \
 *     --source /path/to/app.db --target libsql://....turso.io
 *   node scripts/seed-from-sqlite.mjs \
 *     --source /path/to/app.db --target file:/tmp/dca-seed-test.db
 *
 * Auth: the Turso token is ONLY accepted via the TURSO_AUTH_TOKEN env var.
 * Never pass a token or key as a CLI argument, and never store one in a file.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';

// node:sqlite is imported lazily (only needed when reading a source DB file)
// so --migrate-only also works on Node versions without node:sqlite.
async function openSourceReadOnly(path) {
  const { DatabaseSync } = await import('node:sqlite');
  return new DatabaseSync(path, { readOnly: true });
}

const BATCH_SIZE = 200;
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WORK_DIR = join(SCRIPT_DIR, '..');
const MIGRATIONS_DIR = join(WORK_DIR, 'drizzle');
const BREAKPOINT = '--> statement-breakpoint';

function usage() {
  console.error(`Usage:
  node scripts/seed-from-sqlite.mjs --source <path-to-app.db> --target <libsql-url|file:>
  node scripts/seed-from-sqlite.mjs --migrate-only --target <libsql-url|file:>
    --migrate-only: apply drizzle migrations only (keeps the migration default
    seed rows).
  node scripts/seed-from-sqlite.mjs --schema-only --target <libsql-url|file:>
    --schema-only: apply drizzle migrations, then remove the migration default
    rows, leaving empty tables. Use for a fresh local dev database.
Auth token via TURSO_AUTH_TOKEN env var only (never as a CLI arg).`);
}

function parseArgs(argv) {
  const args = { source: null, target: null, migrateOnly: false, schemaOnly: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--source') args.source = argv[++i];
    else if (argv[i] === '--target') args.target = argv[++i];
    else if (argv[i] === '--migrate-only') args.migrateOnly = true;
    else if (argv[i] === '--schema-only') args.schemaOnly = true;
    else {
      throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }
  if (!args.target) {
    usage();
    throw new Error('--target is required.');
  }
  if (!args.migrateOnly && !args.schemaOnly && !args.source) {
    usage();
    throw new Error('--source is required (or use --migrate-only).');
  }
  return args;
}

/** Read table names (excluding internal sqlite_%) from a node:sqlite DB. */
function listUserTables(db) {
  return db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    )
    .all()
    .map((r) => r.name);
}

/** Execute every migration file in filename order, splitting on breakpoints. */
async function applyMigrations(target) {
  // List migration .sql files in order (excluding meta/)
  const { readdirSync } = await import('node:fs');
  const migrationFiles = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  if (migrationFiles.length === 0) {
    throw new Error(`No .sql migration files found in ${MIGRATIONS_DIR}`);
  }
  for (const file of migrationFiles) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const statements = sql
      .split(BREAKPOINT)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const stmt of statements) {
      await target.execute(stmt);
    }
    console.log(`Applied migration: ${file} (${statements.length} statement(s))`);
  }
}

function escIdent(name) {
  return `"${name.replace(/"/g, '""')}"`;
}

async function copyTable(sourceDb, target, table) {
  const rows = sourceDb.prepare(`SELECT * FROM ${escIdent(table)}`).all();
  if (rows.length === 0) {
    console.log(`  ${table}: 0 rows (skipped)`);
    return 0;
  }
  const columns = Object.keys(rows[0]);
  const colList = columns.map(escIdent).join(', ');
  const placeholders = columns.map(() => '?').join(', ');
  const insertSql = `INSERT INTO ${escIdent(table)} (${colList}) VALUES (${placeholders})`;

  const txs = [];
  let batch = [];
  for (const row of rows) {
    batch.push({ sql: insertSql, args: columns.map((c) => row[c]) });
    if (batch.length >= BATCH_SIZE) {
      txs.push(batch);
      batch = [];
    }
  }
  if (batch.length > 0) txs.push(batch);

  let inserted = 0;
  for (const statements of txs) {
    await target.batch(statements, 'write');
    inserted += statements.length;
  }
  console.log(`  ${table}: copied ${inserted} rows`);
  return inserted;
}

/** Remove the default seed rows that migrations insert, leaving empty tables. */
async function clearDefaultRows(target) {
  for (const table of ['transactions', 'assets', 'settings']) {
    try {
      await target.execute(`DELETE FROM ${escIdent(table)}`);
      console.log(`  cleared ${table}`);
    } catch (err) {
      throw new Error(`Failed to clear ${table}: ${err.message}`);
    }
  }
}

async function main() {
  const { source, target: targetUrl, migrateOnly, schemaOnly } = parseArgs(process.argv.slice(2));
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!targetUrl.startsWith('file:') && !authToken) {
    throw new Error(
      'TURSO_AUTH_TOKEN env var is required for remote libsql:// targets.',
    );
  }

  const target = createClient({ url: targetUrl, authToken });
  console.log('Applying drizzle migrations to target...');
  await applyMigrations(target);
  if (migrateOnly) {
    console.log('Done (migrate-only: kept migration default seed rows).');
    return;
  }
  if (schemaOnly) {
    console.log('Clearing migration default seed rows...');
    await clearDefaultRows(target);
    console.log('Done (schema-only: empty tables, no data).');
    return;
  }

  // Open the source DB read-only — never write to the real user data.
  let sourceDb;
  try {
    sourceDb = await openSourceReadOnly(source);
  } catch (err) {
    throw new Error(`Cannot open source DB read-only at ${source}: ${err.message}`);
  }

  const sourceTables = new Set(listUserTables(sourceDb));
  if (sourceTables.size === 0) {
    throw new Error(`Source DB has no user tables: ${source}`);
  }
  console.log(`Source tables: ${[...sourceTables].join(', ')}`);

  try {
    // Only copy tables that the migrations created in the target. Drizzle's own
    // __drizzle_migrations bookkeeping table (if present in the source) is not
    // part of the app data model, so it is never copied.
    const targetTablesRes = await target.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
    );
    const targetTables = new Set(targetTablesRes.rows.map((r) => r.name));
    const tables = [...sourceTables].filter((t) => targetTables.has(t));
    const skipped = [...sourceTables].filter((t) => !targetTables.has(t));
    if (skipped.length > 0) {
      console.log(`Skipping tables not created by migrations: ${skipped.join(', ')}`);
    }
    if (tables.length === 0) {
      throw new Error('No source tables exist in the target — nothing to copy.');
    }
    console.log(`Tables to copy: ${tables.join(', ')}`);

    console.log('Clearing migration default seed rows...');
    await clearDefaultRows(target);

    console.log('Copying data from source to target...');
    const counts = {};
    for (const table of tables) {
      counts[table] = await copyTable(sourceDb, target, table);
    }

    console.log('\nMigration complete. Rows copied per table:');
    for (const [table, count] of Object.entries(counts)) {
      console.log(`  ${table}: ${count}`);
    }
  } finally {
    target.close();
    sourceDb.close();
  }
}

main().catch((err) => {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});
