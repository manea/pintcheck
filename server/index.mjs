import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPintCheckServer } from './app.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function loadDotEnv(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = val;
    }
  }
}

const dataDir = process.env.PINTCHECK_DATA_DIR || path.join(rootDir, 'data');
loadDotEnv(path.join(dataDir, '.env'));
loadDotEnv(path.join(rootDir, '.env'));

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 4191);
const distDir = path.join(rootDir, 'dist');
const appOrigin = process.env.APP_ORIGIN || '';
const basePath = process.env.BASE_PATH || '';

const { handler, close } = createPintCheckServer({
  dataDir,
  distDir,
  appOrigin,
  basePath,
});

const server = http.createServer(handler);

server.listen(port, host, () => {
  console.log(
    `PINTCheck listening on http://${host}:${port} (basePath=${basePath || '/'}, SQLite WAL: ${dataDir})`,
  );
});

function shutdown() {
  close();
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
