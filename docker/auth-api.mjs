// Lets an authenticated user change the nginx Basic auth password.
// nginx guards /auth-api/ with the same htpasswd file this server edits, so
// every request here already carries valid credentials.
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import http from 'node:http';

const HTPASSWD_FILE = '/data/auth/.htpasswd';
const MAX_BODY_BYTES = 4096;
// htpasswd rejects stdin passwords longer than 255 bytes (exit 5).
const MAX_PASSWORD_BYTES = 255;

// Mirrors generate-auth.sh: auth is on exactly when ACCESS_PASSWORD is set.
const authEnabled = Boolean(process.env.ACCESS_PASSWORD);

async function readUsername() {
  const content = await readFile(HTPASSWD_FILE, 'utf8');
  const line = content.split('\n').find((entry) => entry.includes(':'));
  if (!line) throw new Error(`${HTPASSWD_FILE} has no user entry`);
  return line.slice(0, line.indexOf(':'));
}

// Passwords travel over stdin so they never appear in the process list.
function htpasswd(args, password) {
  return new Promise((resolve, reject) => {
    const child = spawn('htpasswd', args, { stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stderr: stderr.trim() }));
    // If htpasswd exits before reading stdin, the exit code reports it; an
    // unhandled EPIPE here would crash the server instead.
    child.stdin.on('error', () => {});
    child.stdin.end(password);
  });
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function parseBody(raw) {
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new HttpError(400, '请求格式不正确');
  }
  const { currentPassword, newPassword } = body ?? {};
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    throw new HttpError(400, '请求格式不正确');
  }
  if (newPassword.length < 8 || newPassword.length > 128) {
    throw new HttpError(400, '新密码长度需为 8 到 128 个字符');
  }
  if (Buffer.byteLength(newPassword) > MAX_PASSWORD_BYTES) {
    throw new HttpError(400, '新密码过长，请减少中文等多字节字符');
  }
  if (/[:\r\n]/.test(newPassword)) {
    throw new HttpError(400, '新密码不能包含冒号或换行');
  }
  if (newPassword === currentPassword) {
    throw new HttpError(400, '新密码不能与当前密码相同');
  }
  return { currentPassword, newPassword };
}

async function changePassword({ currentPassword, newPassword }) {
  if (!authEnabled) throw new HttpError(400, '未启用访问密码，无法修改');
  const username = await readUsername();
  // htpasswd strips a trailing newline and rejects overlong input, so such a
  // value can never be the stored password.
  if (/[\r\n]/.test(currentPassword) || Buffer.byteLength(currentPassword) > MAX_PASSWORD_BYTES) {
    throw new HttpError(403, '当前密码不正确');
  }
  const verify = await htpasswd(['-v', '-i', HTPASSWD_FILE, username], currentPassword);
  if (verify.code === 3) throw new HttpError(403, '当前密码不正确');
  if (verify.code !== 0) throw new Error(`htpasswd -v exited ${verify.code}: ${verify.stderr}`);
  const update = await htpasswd(['-i', '-B', HTPASSWD_FILE, username], newPassword);
  if (update.code !== 0) throw new Error(`htpasswd -B exited ${update.code}: ${update.stderr}`);
}

// Verify-then-write must not interleave with another change.
let queue = Promise.resolve();
function serialized(task) {
  const result = queue.then(task);
  queue = result.catch(() => {});
  return result;
}

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        // Drain the rest instead of destroying the socket so the 400 still arrives.
        req.removeAllListeners('data');
        req.resume();
        reject(new HttpError(400, '请求内容过大'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const routes = {
  '/auth-api/status': {
    GET: async () => (authEnabled ? { enabled: true, username: await readUsername() } : { enabled: false }),
  },
  '/auth-api/password': {
    POST: async (req) => {
      const input = parseBody(await readBody(req));
      await serialized(() => changePassword(input));
      return { ok: true };
    },
  },
};

const server = http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const route = routes[path];
  if (!route) return send(res, 404, { error: '接口不存在' });
  const handler = route[req.method];
  if (!handler) {
    res.setHeader('Allow', Object.keys(route).join(', '));
    return send(res, 405, { error: '不支持的请求方法' });
  }
  try {
    send(res, 200, await handler(req));
  } catch (error) {
    if (error instanceof HttpError) return send(res, error.status, { error: error.message });
    console.error('[auth-api]', error);
    send(res, 500, { error: '服务器内部错误，请稍后重试' });
  }
});

server.listen(3001, '127.0.0.1', () => {
  console.log(`[auth-api] listening on 127.0.0.1:3001, auth ${authEnabled ? 'enabled' : 'disabled'}`);
});
