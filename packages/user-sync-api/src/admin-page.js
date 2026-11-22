function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderAdminHtml({ authenticated, isAdmin, username, membershipEnabled }) {
  const title = 'goprmpt 用户与云同步管理后台';
  const statusBadge = membershipEnabled
    ? '<span class="badge badge-pro">会员开关：已开启 (MEMBERSHIP_ENABLED=true)</span>'
    : '<span class="badge badge-free">会员开关：未开启（当前全部免费开放）</span>';

  const bodyContent =
    authenticated && isAdmin
      ? `
    <header class="topbar">
      <div>
        <h1>${title}</h1>
        <div class="meta">当前管理员：<strong>${escapeHtml(username)}</strong> · ${statusBadge}</div>
      </div>
      <div class="actions">
        <button id="refreshBtn" class="btn">刷新列表</button>
        <button id="logoutBtn" class="btn btn-danger">退出登录</button>
      </div>
    </header>
    <div id="notice" class="notice" style="display:none"></div>
    <section class="card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>用户名</th>
              <th>角色</th>
              <th>等级</th>
              <th>到期时间</th>
              <th>云同步占用</th>
              <th>最近同步</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody id="userRows">
            <tr><td colspan="8" class="muted">正在加载用户列表...</td></tr>
          </tbody>
        </table>
      </div>
    </section>
    <script>
      const noticeEl = document.getElementById('notice');
      const rowsEl = document.getElementById('userRows');
      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

      function showNotice(text, isError = false) {
        noticeEl.textContent = text;
        noticeEl.className = isError ? 'notice notice-error' : 'notice notice-ok';
        noticeEl.style.display = 'block';
      }

      function fmtDate(ms) {
        if (!ms) return '-';
        try { return new Date(ms).toLocaleString('zh-CN'); } catch { return String(ms); }
      }

      function fmtBytes(bytes) {
        if (!bytes) return '0 B';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1024 / 1024).toFixed(2) + ' MB';
      }

      function esc(str) {
        return String(str ?? '').replace(/[&<>"']/g, (c) => ({
          '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
      }

      async function loadUsers() {
        rowsEl.innerHTML = '<tr><td colspan="8" class="muted">正在加载...</td></tr>';
        try {
          const res = await fetch('/user-api/admin/users', { credentials: 'same-origin' });
          const body = await res.json();
          if (!res.ok) {
            showNotice(body.error || '加载失败', true);
            return;
          }
          if (!body.users.length) {
            rowsEl.innerHTML = '<tr><td colspan="8" class="muted">暂无注册用户</td></tr>';
            return;
          }
          rowsEl.innerHTML = body.users.map((u) => {
            const tierBadge = u.tier === 'pro'
              ? '<span class="badge badge-pro">Pro</span>'
              : '<span class="badge badge-free">Free</span>';
            const stateBadge = u.disabled
              ? '<span class="badge badge-danger">已停用</span>'
              : '<span class="badge badge-ok">正常</span>';
            return '<tr>' +
              '<td><strong>' + esc(u.username) + '</strong><div class="sub">' + esc(u.id) + '</div></td>' +
              '<td>' + esc(u.role) + '</td>' +
              '<td>' + tierBadge + '</td>' +
              '<td>' + fmtDate(u.tierExpiresAt) + '</td>' +
              '<td>' + fmtBytes(u.syncBytes) + ' (v' + (u.syncVersion || 0) + ')</td>' +
              '<td>' + fmtDate(u.syncUpdatedAt) + '</td>' +
              '<td>' + stateBadge + '</td>' +
              '<td class="op-cell">' +
                '<button class="btn btn-sm" data-act="pro" data-id="' + esc(u.id) + '">设为 Pro +30天</button>' +
                '<button class="btn btn-sm" data-act="free" data-id="' + esc(u.id) + '">恢复免费</button>' +
                '<button class="btn btn-sm ' + (u.disabled ? '' : 'btn-danger') + '" data-act="toggle" data-disabled="' + (u.disabled ? '1' : '0') + '" data-id="' + esc(u.id) + '">' + (u.disabled ? '启用' : '停用') + '</button>' +
              '</td>' +
            '</tr>';
          }).join('');
        } catch (err) {
          showNotice('网络异常：' + err.message, true);
        }
      }

      rowsEl.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-act]');
        if (!btn) return;
        const id = btn.dataset.id;
        const act = btn.dataset.act;
        let payload = {};
        if (act === 'pro') {
          payload = { tier: 'pro', tierExpiresAt: Date.now() + THIRTY_DAYS_MS };
        } else if (act === 'free') {
          payload = { tier: 'free', tierExpiresAt: null };
        } else if (act === 'toggle') {
          payload = { disabled: btn.dataset.disabled !== '1' };
        }
        btn.disabled = true;
        try {
          const res = await fetch('/user-api/admin/users/' + encodeURIComponent(id), {
            method: 'PATCH',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const body = await res.json();
          if (!res.ok) {
            showNotice(body.error || '操作失败', true);
          } else {
            showNotice('已更新用户 ' + body.user.username);
            await loadUsers();
          }
        } catch (err) {
          showNotice('请求失败：' + err.message, true);
        } finally {
          btn.disabled = false;
        }
      });

      document.getElementById('refreshBtn').addEventListener('click', loadUsers);
      document.getElementById('logoutBtn').addEventListener('click', async () => {
        await fetch('/user-api/logout', { method: 'POST', credentials: 'same-origin' });
        location.reload();
      });

      loadUsers();
    </script>`
      : `
    <section class="login-card">
      <h1>${title}</h1>
      <p class="muted">${
        authenticated
          ? `当前账号（${escapeHtml(username)}）不是管理员，请切换管理员账号登录。`
          : '请使用管理员账号登录以查看用户列表与管理会员/停用状态。'
      }</p>
      <div id="loginNotice" class="notice" style="display:none"></div>
      <form id="loginForm">
        <label>管理员用户名
          <input id="username" name="username" autocomplete="username" required />
        </label>
        <label>密码
          <input id="password" name="password" type="password" autocomplete="current-password" required />
        </label>
        <button type="submit" class="btn btn-primary" style="width:100%">登录后台</button>
      </form>
    </section>
    <script>
      const form = document.getElementById('loginForm');
      const notice = document.getElementById('loginNotice');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        notice.style.display = 'none';
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;
        try {
          const res = await fetch('/user-api/login', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
          });
          const body = await res.json();
          if (!res.ok) {
            notice.textContent = body.error || '登录失败';
            notice.className = 'notice notice-error';
            notice.style.display = 'block';
            return;
          }
          if (body.user?.role !== 'admin') {
            notice.textContent = '该账号没有管理员权限';
            notice.className = 'notice notice-error';
            notice.style.display = 'block';
            return;
          }
          location.reload();
        } catch (err) {
          notice.textContent = '网络异常：' + err.message;
          notice.className = 'notice notice-error';
          notice.style.display = 'block';
        }
      });
    </script>`;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
  <style>
    :root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { margin: 0; padding: 24px; background: #f5f7fb; color: #1f2937; }
    .topbar { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
    h1 { margin: 0 0 6px; font-size: 20px; }
    .meta { font-size: 13px; color: #4b5563; }
    .actions { display: flex; gap: 8px; }
    .card, .login-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
    .login-card { max-width: 380px; margin: 64px auto; padding: 24px; }
    label { display: block; margin: 12px 0; font-size: 13px; font-weight: 500; }
    input { width: 100%; box-sizing: border-box; margin-top: 6px; padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid #f0f2f5; vertical-align: middle; }
    th { font-weight: 600; color: #4b5563; white-space: nowrap; }
    .sub { font-size: 11px; color: #9ca3af; font-family: monospace; }
    .muted { color: #6b7280; }
    .op-cell { display: flex; gap: 6px; flex-wrap: wrap; }
    .btn { padding: 7px 12px; border: 1px solid #d1d5db; background: #fff; color: #111827; border-radius: 6px; cursor: pointer; font-size: 13px; }
    .btn:hover { background: #f3f4f6; }
    .btn-sm { padding: 4px 8px; font-size: 12px; }
    .btn-primary { background: #2563eb; border-color: #2563eb; color: #fff; }
    .btn-primary:hover { background: #1d4ed8; }
    .btn-danger { border-color: #ef4444; color: #dc2626; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 500; }
    .badge-pro { background: #dbeafe; color: #1d4ed8; }
    .badge-free { background: #f3f4f6; color: #4b5563; }
    .badge-ok { background: #dcfce7; color: #15803d; }
    .badge-danger { background: #fee2e2; color: #b91c1c; }
    .notice { padding: 10px 12px; border-radius: 8px; margin-bottom: 14px; font-size: 13px; }
    .notice-ok { background: #dcfce7; color: #166534; }
    .notice-error { background: #fee2e2; color: #991b1b; }
  </style>
</head>
<body>${bodyContent}</body>
</html>`;
}
