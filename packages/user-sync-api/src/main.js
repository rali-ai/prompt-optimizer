import { loadConfig } from './config.js';
import { createApp } from './server.js';

const config = loadConfig();
const app = createApp(config);

const { host, port } = await app.listen();
console.log(
  `[user-sync-api] listening on http://${host}:${port} (db=${config.dbPath}, membershipEnabled=${config.membershipEnabled})`,
);

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[user-sync-api] received ${signal}, shutting down...`);
  await app.close();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
