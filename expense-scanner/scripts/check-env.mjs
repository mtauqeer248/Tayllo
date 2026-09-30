#!/usr/bin/env node
/**
 * Tallyo environment check — validates every key against the real services.
 *
 *   npm run check          → full check, exits with code 1 if anything is broken
 *   (runs automatically before `npm run dev`, in warn-only mode)
 *
 * Secrets are never printed: only the first 4 and last 4 characters.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STRICT = process.argv.includes('--strict');
const SKIP_NETWORK = process.argv.includes('--offline');

const c = { red: (s) => `\x1b[31m${s}\x1b[0m`, green: (s) => `\x1b[32m${s}\x1b[0m`, yellow: (s) => `\x1b[33m${s}\x1b[0m`, dim: (s) => `\x1b[2m${s}\x1b[0m`, bold: (s) => `\x1b[1m${s}\x1b[0m` };
let errors = 0, warnings = 0;
const ok = (m) => console.log(`  ${c.green('✔')} ${m}`);
const bad = (m, fix) => { errors++; console.log(`  ${c.red('✘')} ${m}${fix ? `\n      ${c.dim('→ ' + fix)}` : ''}`); };
const warn = (m, fix) => { warnings++; console.log(`  ${c.yellow('!')} ${m}${fix ? `\n      ${c.dim('→ ' + fix)}` : ''}`); };
const mask = (v) => (!v ? '(empty)' : v.length <= 10 ? '•'.repeat(v.length) : `${v.slice(0, 4)}…${v.slice(-4)}`);

/** Minimal .env parser: KEY=value, strips quotes and inline " # comments". */
function parseEnv(path) {
  if (!existsSync(path)) return null;
  const out = {};
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(raw);
    if (!m) continue;
    let v = m[2];
    if (/^["']/.test(v)) v = v.replace(/^(["'])(.*)\1.*$/, '$2');
    else v = v.replace(/\s+#.*$/, '').trim();
    out[m[1]] = v;
  }
  return out;
}

async function get(url, headers = {}, timeoutMs = 10000) {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    let body = null;
    const text = await res.text();
    try { body = JSON.parse(text); } catch { body = text; }
    return { status: res.status, body };
  } catch (e) {
    return { status: 0, error: e?.cause?.code || e?.name || e?.message };
  }
}

console.log(c.bold('\nTallyo environment check\n'));

/* ---------- 1. Files & required values ---------- */
console.log(c.bold('Files'));
const env = parseEnv(join(ROOT, '.env'));
const web = parseEnv(join(ROOT, 'apps/web/.env.local'));
if (!env) { bad('.env not found', 'cp .env.example .env  and fill it in'); finish(); }
else ok('.env found');
if (!web) bad('apps/web/.env.local not found', 'cp .env apps/web/.env.local');
else ok('apps/web/.env.local found');

const need = {
  NEXT_PUBLIC_SUPABASE_URL: /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: /^(sb_publishable_|eyJ)/,
  SUPABASE_URL: /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/,
  SUPABASE_SERVICE_ROLE_KEY: /^(sb_secret_|eyJ)/,
  GROQ_API_KEY: /^gsk_[A-Za-z0-9]{20,}$/,
  INTERNAL_SERVICE_SECRET: /^.{32,}$/,
  OCR_SERVICE_URL: /^https?:\/\//,
  LEDGER_SERVICE_URL: /^https?:\/\//,
  CHATBOT_SERVICE_URL: /^https?:\/\//,
};
const hints = {
  SUPABASE_URL: 'use the same https://<project>.supabase.co as NEXT_PUBLIC_SUPABASE_URL (not the dashboard link)',
  SUPABASE_SERVICE_ROLE_KEY: 'Supabase → Project Settings → API Keys → Secret key (sb_secret_…)',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'Supabase → Project Settings → API Keys → Publishable key (sb_publishable_…)',
  GROQ_API_KEY: 'console.groq.com/keys → Create API Key (starts with gsk_)',
  INTERNAL_SERVICE_SECRET: 'generate one: openssl rand -base64 48',
};

console.log(c.bold('\nValues in .env'));
for (const [k, re] of Object.entries(need)) {
  const v = env?.[k];
  if (!v) bad(`${k} is missing or empty`, hints[k]);
  else if (!re.test(v)) bad(`${k} looks wrong (${mask(v)})`, hints[k] ?? 'check the value');
  else ok(`${k} ${c.dim(mask(v))}`);
}

/* ---------- 2. .env vs apps/web/.env.local ---------- */
if (env && web) {
  console.log(c.bold('\nWeb app copy (apps/web/.env.local)'));
  const shared = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'INTERNAL_SERVICE_SECRET', 'OCR_SERVICE_URL', 'LEDGER_SERVICE_URL', 'CHATBOT_SERVICE_URL'];
  const diff = shared.filter((k) => (env[k] ?? '') !== (web[k] ?? ''));
  if (diff.length) bad(`differs from .env: ${diff.join(', ')}`, 'cp .env apps/web/.env.local  (then restart)');
  else ok('matches .env');
}

/* ---------- 3. Terminal overrides (they beat .env) ---------- */
console.log(c.bold('\nTerminal overrides'));
let overridden = false;
for (const k of ['GROQ_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'INTERNAL_SERVICE_SECRET']) {
  const shellV = process.env[k];
  if (shellV && env?.[k] && shellV !== env[k]) {
    overridden = true;
    bad(`${k} is also set in your terminal (${mask(shellV)}) and overrides .env (${mask(env[k])})`, `unset ${k}   and remove "export ${k}=…" from ~/.zshrc`);
  }
}
if (!overridden) ok('none');

/* ---------- 4. Live checks ---------- */
if (!SKIP_NETWORK && env) {
  console.log(c.bold('\nLive checks'));

  // Groq
  if (env.GROQ_API_KEY) {
    const r = await get('https://api.groq.com/openai/v1/models', { authorization: `Bearer ${env.GROQ_API_KEY}` });
    if (r.status === 200) {
      const ids = new Set((r.body?.data ?? []).map((m) => m.id));
      ok(`Groq key accepted ${c.dim(mask(env.GROQ_API_KEY))}`);
      for (const [k, def] of [['GROQ_CHAT_MODEL', 'openai/gpt-oss-120b'], ['GROQ_GUARD_MODEL', 'openai/gpt-oss-20b'], ['GROQ_VISION_MODEL', 'qwen/qwen3.8-27b']]) {
        const id = env[k] || def;
        ids.has(id) ? ok(`Groq model available: ${id}`) : bad(`Groq model not available: ${id}`, `set ${k} to a current model from console.groq.com/docs/models`);
      }
    } else if (r.status === 401) bad('Groq rejected the key (Invalid API Key)', 'create a new key at console.groq.com/keys and save it with the copy button');
    else if (r.status === 0) warn(`Could not reach Groq (${r.error}) — offline?`);
    else bad(`Groq returned HTTP ${r.status}`, typeof r.body === 'object' ? r.body?.error?.message : undefined);
  }

  // Supabase
  const good = (u) => need.SUPABASE_URL.test(u ?? '');
  const url = (good(env.SUPABASE_URL) ? env.SUPABASE_URL : good(env.NEXT_PUBLIC_SUPABASE_URL) ? env.NEXT_PUBLIC_SUPABASE_URL : '').replace(/\/$/, '');
  if (url) {
    if (env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      const r = await get(`${url}/auth/v1/settings`, { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY });
      if (r.status === 200) ok('Supabase reachable, publishable key accepted');
      else if (r.status === 401) bad('Supabase rejected the publishable key', hints.NEXT_PUBLIC_SUPABASE_ANON_KEY);
      else if (r.status === 0) warn(`Could not reach Supabase (${r.error})`, 'check SUPABASE_URL / your internet connection');
      else bad(`Supabase returned HTTP ${r.status} for the publishable key`);
    }
    if (env.SUPABASE_SERVICE_ROLE_KEY) {
      const r = await get(`${url}/rest/v1/chat_messages?select=id&limit=1`, { apikey: env.SUPABASE_SERVICE_ROLE_KEY });
      const msg = typeof r.body === 'object' ? `${r.body?.message ?? ''} ${r.body?.code ?? ''}` : String(r.body ?? '');
      if (r.status === 200) ok('Supabase secret key accepted, database tables exist');
      else if (r.status === 401 || r.status === 403) bad('Supabase rejected the secret key', hints.SUPABASE_SERVICE_ROLE_KEY);
      else if (r.status === 404 || /42P01|does not exist|schema cache/i.test(msg)) bad('Database tables are missing', 'run supabase/migrations/0001_init.sql then 0002_gdpr.sql in the Supabase SQL Editor');
      else if (r.status !== 0) bad(`Supabase returned HTTP ${r.status}: ${msg.trim()}`);
    }
  }

  // Local services (only informative)
  const local = ['OCR_SERVICE_URL', 'LEDGER_SERVICE_URL', 'CHATBOT_SERVICE_URL'].filter((k) => /localhost|127\.0\.0\.1/.test(env[k] ?? ''));
  for (const k of local) {
    const r = await get(`${env[k].replace(/\/$/, '')}/healthz`, {}, 1500);
    r.status === 200 ? ok(`${k.replace('_SERVICE_URL', '').toLowerCase()} service running`) : console.log(`  ${c.dim('·')} ${c.dim(`${k.replace('_SERVICE_URL', '').toLowerCase()} service not running yet (normal before npm run dev)`)}`);
  }
}

finish();

function finish() {
  console.log('');
  if (errors) {
    console.log(c.red(c.bold(`✘ ${errors} problem(s) found`)) + (warnings ? c.yellow(`, ${warnings} warning(s)`) : '') + '\n');
    if (STRICT) process.exit(1);
    console.log(c.yellow('  Starting anyway — features using the broken keys will fail until fixed.\n'));
  } else {
    console.log(c.green(c.bold('✔ All good')) + (warnings ? c.yellow(` (${warnings} warning(s))`) : '') + '\n');
  }
  process.exit(0);
}
