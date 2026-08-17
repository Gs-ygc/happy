const fs = require('node:fs');
const path = require('node:path');

const serverDir = path.resolve(__dirname, '..');
const distDir = path.join(serverDir, 'dist');
const pgliteDistDir = path.dirname(require.resolve('@electric-sql/pglite'));

fs.mkdirSync(distDir, { recursive: true });

for (const asset of ['pglite.wasm', 'pglite.data']) {
    const source = path.join(pgliteDistDir, asset);
    const destination = path.join(distDir, asset);
    const stat = fs.statSync(source);
    if (!stat.isFile() || stat.size === 0) {
        throw new Error(`Missing PGlite standalone asset: ${source}`);
    }
    fs.copyFileSync(source, destination);
}

const migrationsSource = path.join(serverDir, 'prisma', 'migrations');
const migrationsDestination = path.join(distDir, 'prisma', 'migrations');
fs.rmSync(migrationsDestination, { recursive: true, force: true });
fs.mkdirSync(path.dirname(migrationsDestination), { recursive: true });
fs.cpSync(migrationsSource, migrationsDestination, { recursive: true });

const migrationCount = fs.readdirSync(migrationsDestination, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .length;
if (migrationCount === 0) {
    throw new Error('No standalone database migrations were staged');
}

console.log(`Staged PGlite assets and ${migrationCount} database migrations`);
