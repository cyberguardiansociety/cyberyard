import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.resolve(root, '..');
const failures = [];
const checks = [];

function read(rel) {
  return fs.readFileSync(path.join(projectRoot, rel), 'utf8');
}
function check(name, condition, detail) {
  checks.push({ name, ok: condition });
  if (!condition) failures.push(`${name}: ${detail}`);
}
function filesUnder(rel, ext = '.ts') {
  const dir = path.join(projectRoot, rel);
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(ext)) out.push(full);
    }
  };
  walk(dir);
  return out;
}

const pkg = JSON.parse(read('backend/package.json'));
const schema = read('backend/prisma/schema.prisma');
const app = read('backend/src/app.ts');
const csrf = read('backend/src/middleware/csrf.middleware.ts');
const cookies = read('backend/src/utils/cookies.ts');
const upload = read('backend/src/middleware/upload.middleware.ts');
const frontend = read('js/script.js');
const allTs = filesUnder('backend/src').map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const migrationsDir = path.join(projectRoot, 'backend/prisma/migrations');

// The platform stores enums as TEXT (SQLite), so the authoritative list
// of role values is the typed constant module, not a schema enum block.
const enumsSource = read('backend/src/constants/enums.ts');
const roleBlock = enumsSource.match(/export const Role = \{([\s\S]*?)\}/)?.[1] ?? '';
const roleValues = [...roleBlock.matchAll(/(\w+):\s*'(\w+)'/g)].map((match) => match[2]);
check('Roles remain USER/ADMIN only', roleValues.length === 2 && roleValues.includes('USER') && roleValues.includes('ADMIN'), 'Unexpected role values were found in src/constants/enums.ts.');
check('No unsafe SQL helpers', !/\$(?:query|execute)RawUnsafe\s*\(/.test(allTs), 'Unsafe Prisma raw-SQL helpers are present.');
// Detect untagged raw-SQL calls: `$queryRaw(` / `$executeRaw(` immediately
// followed by a template/string literal. Tagged-template usage
// (`$queryRaw`…`` or `$queryRaw<T>`…``) passes values as bound parameters
// and is safe; the parenthesized-with-literal form interpolates instead.
check('Raw SQL is tagged', !/\$(?:query|execute)Raw\s*\(\s*[`'"]/.test(allTs), 'A raw SQL call appears to use an untagged template argument.');
check('No shell execution', !/\b(?:execSync|execFileSync|spawnSync|child_process)\b/.test(allTs), 'Shell/process execution was found in backend source.');
check('No dynamic JS execution', !/\b(?:eval|new\s+Function)\s*\(/.test(frontend), 'Dynamic JavaScript execution was found in the frontend.');
check('API disables powered-by header', /disable\(['"]x-powered-by['"]\)/.test(app), 'Express x-powered-by was not disabled.');
check('API responses are non-cacheable', /Cache-Control.*no-store/.test(app), 'API cache-control middleware is missing.');
check('Helmet enabled', /app\.use\(helmet\(\)\)/.test(app), 'Helmet middleware is missing.');
check('Credentialed CORS has explicit origins', /credentials:\s*true/.test(app) && !/origin:\s*['"]\*['"]/.test(app), 'CORS credentials/origin configuration is unsafe or missing.');
check('CSRF middleware enabled', /app\.use\(csrfProtection\)/.test(app), 'CSRF middleware is not globally registered.');
check('CSRF validates configured Origin/Referer', /CSRF_ORIGIN_REJECTED/.test(csrf) && /new URL\(referer\)/.test(csrf), 'Origin/Referer validation was not detected.');
check('Session cookie HttpOnly', /httpOnly:\s*true/.test(cookies), 'Session cookie is not HttpOnly.');
check('Session cookie SameSite=Lax', /sameSite:\s*['"]lax['"]/.test(cookies), 'Session cookie SameSite policy is missing or weakened.');
check('Production session cookie Secure', /secure:\s*env\.NODE_ENV === ['"]production['"]/.test(cookies), 'Production Secure cookie behavior is missing.');
check('Upload size bounded', /fileSize:\s*10 \* 1024 \* 1024/.test(upload), 'Upload size limit is missing.');
check('Upload parts bounded', /parts:\s*3/.test(upload) && /files:\s*1/.test(upload), 'Multipart parser bounds are missing.');
check('Phase 7 user routes require auth', /router\.use\(requireAuth\)/.test(read('backend/src/routes/phase7.routes.ts')), 'Challenge hints/files/writeup user routes are not globally authenticated.');
check('Event routes require auth', /router\.use\(requireAuth\)/.test(read('backend/src/routes/events.routes.ts')), 'Event routes are not globally authenticated.');
check('Admin routes require admin middleware', filesUnder('backend/src/routes').filter((f) => path.basename(f).startsWith('admin')).every((f) => /router\.use\(requireAuth, requireAdmin/.test(fs.readFileSync(f, 'utf8'))), 'An admin route file is missing the standard server-side admin guard.');
check('No frontend dynamic code execution', !/\b(?:eval|new Function)\b/.test(frontend), 'Frontend contains eval/new Function.');
check('Frontend uses HTML escaping helper', /function escapeHtml\(/.test(frontend), 'escapeHtml helper is missing.');
check('Frontend notification links are constrained', frontend.includes('const eventMatch=/^\\/events\\/') && frontend.includes('const challengeMatch=/^\\/challenges\\/'), 'Notification navigation does not constrain target paths.');
check('Multer is on patched current line', pkg.dependencies?.multer === '^2.4.0', 'Multer dependency is not on the audited 2.4.x line.');
check('Nodemailer is on hardened 10.0.x line', pkg.dependencies?.nodemailer === '^10.0.10', 'Nodemailer dependency is not on the audited hardened line.');
check('Node engine matches Nodemailer 10', pkg.engines?.node === '>=20.19.0', 'Node engine was not raised to the required production baseline for Nodemailer 10.');

const migrationFiles = fs.existsSync(migrationsDir) ? filesUnder('backend/prisma/migrations', '.sql') : [];
const destructive = migrationFiles.filter((file) => /\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b/i.test(fs.readFileSync(file, 'utf8')));
check('No destructive migration SQL', destructive.length === 0, destructive.map((f) => path.relative(projectRoot, f)).join(', '));
// A local backend/.env is how the app is MEANT to be configured (the dev
// launcher creates one with generated secrets), so mere existence is not
// the risk — committing it is. Pass when the file is absent OR covered by
// a .gitignore rule; fail only when it would be picked up by a commit.
const envPath = path.join(projectRoot, 'backend/.env');
const envExists = fs.existsSync(envPath);
const envIgnored = ['.gitignore', 'backend/.gitignore']
  .map((relative) => path.join(projectRoot, relative))
  .filter((file) => fs.existsSync(file))
  .some((file) => fs.readFileSync(file, 'utf8').split(/\r?\n/).some((line) => {
    const rule = line.trim().replace(/^\//, '');
    return rule === '.env' || rule === 'backend/.env';
  }));
check('No .env committed in project tree', !envExists || envIgnored, 'backend/.env exists and is not covered by a .gitignore rule — it would be committed.');
const privateKeyFiles = [];
const scanPrivateKeys = (current) => {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) scanPrivateKeys(full);
    else if (/\.(?:pem|key)$/i.test(entry.name)) privateKeyFiles.push(full);
  }
};
scanPrivateKeys(projectRoot);
check('No obvious private key files', privateKeyFiles.length === 0, privateKeyFiles.map((f) => path.relative(projectRoot, f)).join(', '));

console.log(`Security static audit: ${checks.filter((c) => c.ok).length}/${checks.length} checks passed.`);
for (const item of checks) console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}`);
if (failures.length) {
  console.error('\nFindings:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
}
