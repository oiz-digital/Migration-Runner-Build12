#!/usr/bin/env node
/**
 * Zebvix — Admin User Creation / Update Script
 * Called by zebvix-setup.sh during deployment.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node deploy/create-admin.mjs \
 *     --email admin@zebvix.com \
 *     --password "MySecurePass123" \
 *     --name "Admin"
 *
 * Behaviour:
 *   - If admin user with this email already EXISTS → updates name + password only
 *   - If NOT exists → creates fresh admin user with role='admin'
 *   - Never deletes existing user data
 */
import { createHash, randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { createRequire } from "node:module";

// ── Parse CLI args ────────────────────────────────────────────────
const { values: args } = parseArgs({
  options: {
    email:    { type: "string" },
    password: { type: "string" },
    name:     { type: "string", default: "Admin" },
  },
});

if (!args.email || !args.password) {
  console.error("Usage: node create-admin.mjs --email <email> --password <pass> [--name <name>]");
  process.exit(1);
}

// ── Load bcryptjs (available in api-server workspace) ─────────────
const require = createRequire(import.meta.url);
let bcrypt;
try {
  bcrypt = require("bcryptjs");
} catch {
  // Fallback: bcrypt not available yet — use SHA-256 placeholder
  // (user should log in and reset via admin panel)
  bcrypt = null;
}

// ── DB connection ─────────────────────────────────────────────────
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is not set");
  process.exit(1);
}

let pg;
try {
  pg = require("pg");
} catch {
  // Try loading from the workspace
  const { default: mod } = await import("pg");
  pg = mod;
}

const { Pool } = pg;
const pool = new Pool({ connectionString: DATABASE_URL });

function uid() {
  return randomBytes(6).toString("hex").toUpperCase();
}

function referralCode() {
  return "ZBX" + randomBytes(4).toString("hex").toUpperCase();
}

async function hashPassword(password) {
  if (bcrypt) return bcrypt.hash(password, 10);
  // Fallback: not ideal but lets setup complete; user must reset via panel
  const salt = randomBytes(16).toString("hex");
  const hash = createHash("sha256").update(salt + password).digest("hex");
  return `sha256:${salt}:${hash}`;
}

async function main() {
  const client = await pool.connect();
  try {
    const email    = args.email.toLowerCase().trim();
    const name     = args.name.trim();
    const pwHash   = await hashPassword(args.password);

    // Check if user exists
    const existing = await client.query(
      "SELECT id, email, role FROM users WHERE email = $1",
      [email]
    );

    if (existing.rows.length > 0) {
      const user = existing.rows[0];
      // Update existing user → elevate to admin, update password
      await client.query(
        `UPDATE users
            SET password_hash = $1,
                name          = $2,
                role          = 'admin',
                status        = 'active',
                email_verified = true,
                updated_at    = NOW()
          WHERE email = $3`,
        [pwHash, name, email]
      );
      console.log(`✔  Admin updated: id=${user.id} email=${email} role=admin`);
    } else {
      // Create new admin user
      const result = await client.query(
        `INSERT INTO users
           (email, password_hash, name, role, status, email_verified, uid, referral_code, kyc_level)
         VALUES ($1, $2, $3, 'admin', 'active', true, $4, $5, 3)
         RETURNING id`,
        [email, pwHash, name, uid(), referralCode()]
      );
      console.log(`✔  Admin created: id=${result.rows[0].id} email=${email} role=admin`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Admin creation failed:", err.message);
  process.exit(1);
});
