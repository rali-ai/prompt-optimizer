function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const BRAND_LOGO_SVG = `<svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect width="32" height="32" rx="9" fill="#0F766E"/>
  <path d="M16 7.5L23.5 11.8V20.2L16 24.5L8.5 20.2V11.8L16 7.5Z" stroke="#FAF9F5" stroke-width="1.8" stroke-linejoin="round"/>
  <path d="M16 12.2L19.6 14.3V18.5L16 20.6L12.4 18.5V14.3L16 12.2Z" fill="#D96B43"/>
</svg>`;

export function renderAdminHtml({ authenticated, isAdmin, username, membershipEnabled }) {
  const title = '高词 · GoPrmpt 用户与会员管理后台';
  const enabledFlag = Boolean(membershipEnabled);
  const statusBadge = enabledFlag
    ? '<span id="topMembershipBadge" class="badge badge-pro">会员体系：已启用</span>'
    : '<span id="topMembershipBadge" class="badge badge-free">会员体系：未启用（全站免费开放）</span>';

  const bodyContent =
    authenticated && isAdmin
      ? `
    <div class="shell">
      <header class="topbar">
        <div class="brand-group">
          <div class="brand-mark">${BRAND_LOGO_SVG}</div>
          <div>
            <h1>${title}</h1>
            <div class="meta">当前管理员：<strong>${escapeHtml(username)}</strong> · ${statusBadge}</div>
          </div>
        </div>
        <div class="actions">
          <a class="btn" href="/">返回工作台</a>
          <button id="toggleAdminPwdBtn" class="btn" type="button">修改管理员密码</button>
          <button id="refreshBtn" class="btn" type="button">刷新数据</button>
          <button id="logoutBtn" class="btn btn-danger" type="button">退出登录</button>
        </div>
      </header>

      <section id="adminPwdPanel" class="card admin-pwd-panel" style="display:none">
        <div class="card-head" style="margin-bottom:12px;">
          <div>
            <h2>修改管理员密码</h2>
            <p class="muted">修改后立即生效并持久保存到数据库，容器重启不会被覆盖。</p>
          </div>
          <button id="closeAdminPwdBtn" class="btn btn-sm" type="button">收起</button>
        </div>
        <form id="adminPwdForm" class="inline-pwd-form">
          <label>当前密码
            <input id="adminCurPwd" type="password" autocomplete="current-password" required />
          </label>
          <label>新密码（至少 8 位）
            <input id="adminNewPwd" type="password" autocomplete="new-password" minlength="8" required />
          </label>
          <label>确认新密码
            <input id="adminConfirmPwd" type="password" autocomplete="new-password" minlength="8" required />
          </label>
          <div class="inline-pwd-submit">
            <button id="adminPwdSubmitBtn" class="btn btn-primary" type="submit">保存新密码</button>
          </div>
        </form>
      </section>

      <div id="notice" class="notice" style="display:none"></div>
      <div id="tempPwdBanner" class="temp-pwd-banner" style="display:none">
        <div>
          <strong id="tempPwdTitle">已生成一次性临时密码</strong>
          <span class="muted">请复制并发送给用户，提醒其登录后及时修改：</span>
          <code id="tempPwdCode" class="temp-pwd-code"></code>
        </div>
        <div class="actions">
          <button id="copyTempPwdBtn" class="btn btn-primary btn-sm" type="button">一键复制</button>
          <button id="closeTempPwdBtn" class="btn btn-sm" type="button">关闭</button>
        </div>
      </div>

      <section class="card switch-card" id="membershipCard" data-enabled="${enabledFlag ? '1' : '0'}">
        <div class="switch-info">
          <div class="switch-eyebrow">会员体系控制</div>
          <h2>会员功能总开关</h2>
          <p id="membershipDesc" class="muted">
            ${
              enabledFlag
                ? '当前已启用会员功能：工作台将向已登录用户展示 Free / Pro 会员等级，并按此处设置的等级与有效期生效。'
                : '当前未启用会员限制：所有用户均可免费使用全站功能；您仍可提前在下方列表中为用户预置 Pro 会员等级与有效期。'
            }
          </p>
        </div>
        <div class="switch-controls">
          <button
            id="membershipSwitch"
            type="button"
            role="switch"
            aria-checked="${enabledFlag ? 'true' : 'false'}"
            aria-label="切换会员功能启用状态"
            class="toggle-switch ${enabledFlag ? 'is-on' : ''}"
          >
            <span class="toggle-thumb"></span>
          </button>
          <div class="switch-status-block">
            <strong id="membershipStateLabel">${enabledFlag ? '已启用' : '未启用'}</strong>
            <button id="membershipActionBtn" type="button" class="btn ${enabledFlag ? '' : 'btn-primary'} btn-sm">
              ${enabledFlag ? '关闭会员功能' : '启用会员功能'}
            </button>
          </div>
        </div>
      </section>

      <section class="stats-grid" aria-label="运营统计概览">
        <div class="stat-card">
          <div class="stat-label">注册用户总数</div>
          <div class="stat-value" id="statTotal">-</div>
          <div class="stat-sub" id="statAdmins">含管理员 -</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Pro 会员数</div>
          <div class="stat-value stat-accent" id="statPro">-</div>
          <div class="stat-sub" id="statFree">Free 免费用户 -</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">账号状态</div>
          <div class="stat-value" id="statActive">-</div>
          <div class="stat-sub" id="statDisabled">已停用 -</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">云同步总占用</div>
          <div class="stat-value" id="statBytes">-</div>
          <div class="stat-sub" id="statSyncedUsers">已同步用户 -</div>
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <div>
            <h2>用户与会员列表</h2>
            <p class="muted">支持按用户名检索与按会员状态筛选，可随时调整 Pro 有效期或停用账号。</p>
          </div>
          <div class="filter-bar">
            <input id="searchInput" type="search" class="search-input" placeholder="搜索用户名或邮箱..." aria-label="搜索用户名或邮箱" />
            <div class="filter-pills" id="filterPills">
              <button type="button" class="pill is-active" data-filter="all">全部</button>
              <button type="button" class="pill" data-filter="pro">Pro 会员</button>
              <button type="button" class="pill" data-filter="free">Free 免费</button>
              <button type="button" class="pill" data-filter="disabled">已停用</button>
            </div>
          </div>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>用户名</th>
                <th>邮箱</th>
                <th>角色</th>
                <th>会员等级</th>
                <th>到期时间</th>
                <th>云同步占用</th>
                <th>最近同步</th>
                <th>账号状态</th>
                <th>管理操作</th>
              </tr>
            </thead>
            <tbody id="userRows">
              <tr><td colspan="9" class="muted">正在加载用户列表...</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <script>
      const CURRENT_ADMIN_USERNAME = ${JSON.stringify(String(username || ''))};
      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
      const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

      const noticeEl = document.getElementById('notice');
      const rowsEl = document.getElementById('userRows');
      const topBadgeEl = document.getElementById('topMembershipBadge');
      const membershipCardEl = document.getElementById('membershipCard');
      const membershipDescEl = document.getElementById('membershipDesc');
      const membershipSwitchEl = document.getElementById('membershipSwitch');
      const membershipStateLabelEl = document.getElementById('membershipStateLabel');
      const membershipActionBtnEl = document.getElementById('membershipActionBtn');
      const searchInputEl = document.getElementById('searchInput');
      const filterPillsEl = document.getElementById('filterPills');
      const adminPwdPanelEl = document.getElementById('adminPwdPanel');
      const adminPwdFormEl = document.getElementById('adminPwdForm');
      const tempPwdBannerEl = document.getElementById('tempPwdBanner');
      const tempPwdTitleEl = document.getElementById('tempPwdTitle');
      const tempPwdCodeEl = document.getElementById('tempPwdCode');
      let latestTempPassword = '';

      let currentMembershipEnabled = ${enabledFlag ? 'true' : 'false'};
      let allUsers = [];
      let currentFilter = 'all';

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

      function renderMembershipState(enabled) {
        currentMembershipEnabled = Boolean(enabled);
        membershipCardEl.dataset.enabled = currentMembershipEnabled ? '1' : '0';
        membershipSwitchEl.setAttribute('aria-checked', currentMembershipEnabled ? 'true' : 'false');
        membershipSwitchEl.classList.toggle('is-on', currentMembershipEnabled);
        membershipStateLabelEl.textContent = currentMembershipEnabled ? '已启用' : '未启用';
        membershipActionBtnEl.textContent = currentMembershipEnabled ? '关闭会员功能' : '启用会员功能';
        membershipActionBtnEl.className = currentMembershipEnabled ? 'btn btn-sm' : 'btn btn-primary btn-sm';
        membershipDescEl.textContent = currentMembershipEnabled
          ? '当前已启用会员功能：工作台将向已登录用户展示 Free / Pro 会员等级，并按此处设置的等级与有效期生效。'
          : '当前未启用会员限制：所有用户均可免费使用全站功能；您仍可提前在下方列表中为用户预置 Pro 会员等级与有效期。';
        topBadgeEl.className = currentMembershipEnabled ? 'badge badge-pro' : 'badge badge-free';
        topBadgeEl.textContent = currentMembershipEnabled
          ? '会员体系：已启用'
          : '会员体系：未启用（全站免费开放）';
      }

      function renderStats(users) {
        const total = users.length;
        const admins = users.filter((u) => u.role === 'admin').length;
        const pro = users.filter((u) => u.tier === 'pro').length;
        const free = total - pro;
        const disabled = users.filter((u) => u.disabled).length;
        const active = total - disabled;
        const totalBytes = users.reduce((sum, u) => sum + (u.syncBytes || 0), 0);
        const syncedUsers = users.filter((u) => (u.syncVersion || 0) > 0).length;

        document.getElementById('statTotal').textContent = String(total);
        document.getElementById('statAdmins').textContent = '含管理员 ' + admins + ' 人';
        document.getElementById('statPro').textContent = String(pro);
        document.getElementById('statFree').textContent = 'Free 免费用户 ' + free + ' 人';
        document.getElementById('statActive').textContent = active + ' 正常';
        document.getElementById('statDisabled').textContent = '已停用 ' + disabled + ' 人';
        document.getElementById('statBytes').textContent = fmtBytes(totalBytes);
        document.getElementById('statSyncedUsers').textContent = '已同步账号 ' + syncedUsers + ' 人';
      }

      function renderRows() {
        const q = searchInputEl.value.trim().toLowerCase();
        const filtered = allUsers.filter((u) => {
          if (q) {
            const matchName = String(u.username || '').toLowerCase().includes(q);
            const matchEmail = String(u.email || '').toLowerCase().includes(q);
            if (!matchName && !matchEmail) return false;
          }
          if (currentFilter === 'pro') return u.tier === 'pro';
          if (currentFilter === 'free') return u.tier !== 'pro';
          if (currentFilter === 'disabled') return Boolean(u.disabled);
          return true;
        });

        if (!filtered.length) {
          rowsEl.innerHTML = '<tr><td colspan="9" class="muted">没有符合条件的用户</td></tr>';
          return;
        }

        rowsEl.innerHTML = filtered.map((u) => {
          const isSelfAdmin = u.username === CURRENT_ADMIN_USERNAME && u.role === 'admin';
          const emailCell = u.email
            ? '<span>' + esc(u.email) + '</span>'
            : '<span class="muted">未绑定</span>';
          const roleBadge = u.role === 'admin'
            ? '<span class="badge badge-admin">管理员</span>'
            : '<span class="badge badge-neutral">普通用户</span>';
          const tierBadge = u.tier === 'pro'
            ? '<span class="badge badge-pro">Pro 会员</span>'
            : '<span class="badge badge-free">Free</span>';
          const stateBadge = u.disabled
            ? '<span class="badge badge-danger">已停用</span>'
            : '<span class="badge badge-ok">正常</span>';
          const resetPwdBtn = isSelfAdmin
            ? ''
            : '<button class="btn btn-sm" data-act="reset-pwd" data-username="' + esc(u.username) + '" data-id="' + esc(u.id) + '">重置密码</button>';
          const disableBtn = isSelfAdmin
            ? '<button class="btn btn-sm" disabled title="不能停用当前登录的管理员账号">当前管理员</button>'
            : '<button class="btn btn-sm ' + (u.disabled ? '' : 'btn-danger') + '" data-act="toggle" data-disabled="' + (u.disabled ? '1' : '0') + '" data-id="' + esc(u.id) + '">' + (u.disabled ? '启用' : '停用') + '</button>';

          return '<tr>' +
            '<td><strong>' + esc(u.username) + '</strong><div class="sub">' + esc(u.id) + '</div></td>' +
            '<td>' + emailCell + '</td>' +
            '<td>' + roleBadge + '</td>' +
            '<td>' + tierBadge + '</td>' +
            '<td>' + fmtDate(u.tierExpiresAt) + '</td>' +
            '<td>' + fmtBytes(u.syncBytes) + ' <span class="sub">v' + (u.syncVersion || 0) + '</span></td>' +
            '<td>' + fmtDate(u.syncUpdatedAt) + '</td>' +
            '<td>' + stateBadge + '</td>' +
            '<td class="op-cell">' +
              '<button class="btn btn-sm btn-accent-outline" data-act="pro30" data-id="' + esc(u.id) + '">设为 Pro +30天</button>' +
              '<button class="btn btn-sm" data-act="pro365" data-id="' + esc(u.id) + '">设为 Pro +1年</button>' +
              '<button class="btn btn-sm" data-act="free" data-id="' + esc(u.id) + '">恢复免费</button>' +
              resetPwdBtn +
              disableBtn +
            '</td>' +
          '</tr>';
        }).join('');
      }

      async function loadUsers() {
        rowsEl.innerHTML = '<tr><td colspan="9" class="muted">正在加载...</td></tr>';
        try {
          const res = await fetch('/user-api/admin/users', { credentials: 'same-origin' });
          const body = await res.json();
          if (!res.ok) {
            showNotice(body.error || '加载失败', true);
            return;
          }
          renderMembershipState(Boolean(body.membershipEnabled));
          allUsers = Array.isArray(body.users) ? body.users : [];
          renderStats(allUsers);
          renderRows();
        } catch (err) {
          showNotice('网络异常：' + err.message, true);
        }
      }

      async function toggleMembershipSetting() {
        const nextVal = !currentMembershipEnabled;
        membershipSwitchEl.disabled = true;
        membershipActionBtnEl.disabled = true;
        try {
          const res = await fetch('/user-api/admin/settings', {
            method: 'PATCH',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ membershipEnabled: nextVal }),
          });
          const body = await res.json();
          if (!res.ok) {
            showNotice(body.error || '切换会员开关失败', true);
            return;
          }
          renderMembershipState(Boolean(body.membershipEnabled));
          showNotice(
            body.membershipEnabled
              ? '已启用全站会员功能，配置已实时保存。'
              : '已关闭会员限制，当前全站恢复免费开放。'
          );
        } catch (err) {
          showNotice('网络异常：' + err.message, true);
        } finally {
          membershipSwitchEl.disabled = false;
          membershipActionBtnEl.disabled = false;
        }
      }

      membershipSwitchEl.addEventListener('click', toggleMembershipSetting);
      membershipActionBtnEl.addEventListener('click', toggleMembershipSetting);
      searchInputEl.addEventListener('input', renderRows);
      filterPillsEl.addEventListener('click', (e) => {
        const pill = e.target.closest('button[data-filter]');
        if (!pill) return;
        currentFilter = pill.dataset.filter;
        for (const el of filterPillsEl.querySelectorAll('button[data-filter]')) {
          el.classList.toggle('is-active', el === pill);
        }
        renderRows();
      });

      rowsEl.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-act]');
        if (!btn) return;
        const id = btn.dataset.id;
        const act = btn.dataset.act;
        if (act === 'reset-pwd') {
          const uname = btn.dataset.username || id;
          if (!window.confirm('确定要重置用户「' + uname + '」的密码吗？系统将生成新的 12 位随机临时密码。')) {
            return;
          }
          btn.disabled = true;
          try {
            const res = await fetch('/user-api/admin/users/' + encodeURIComponent(id) + '/reset-password', {
              method: 'POST',
              credentials: 'same-origin',
              headers: { 'Content-Type': 'application/json' },
              body: '{}',
            });
            const body = await res.json();
            if (!res.ok) {
              showNotice(body.error || '重置密码失败', true);
            } else {
              latestTempPassword = body.temporaryPassword || '';
              tempPwdTitleEl.textContent = '已重置用户「' + body.user.username + '」的密码';
              tempPwdCodeEl.textContent = latestTempPassword;
              tempPwdBannerEl.style.display = 'flex';
              showNotice('已为用户 ' + body.user.username + ' 生成新临时密码。');
            }
          } catch (err) {
            showNotice('请求失败：' + err.message, true);
          } finally {
            btn.disabled = false;
          }
          return;
        }
        let payload = {};
        if (act === 'pro30') {
          payload = { tier: 'pro', tierExpiresAt: Date.now() + THIRTY_DAYS_MS };
        } else if (act === 'pro365') {
          payload = { tier: 'pro', tierExpiresAt: Date.now() + ONE_YEAR_MS };
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

      document.getElementById('toggleAdminPwdBtn').addEventListener('click', () => {
        const visible = adminPwdPanelEl.style.display !== 'none';
        adminPwdPanelEl.style.display = visible ? 'none' : 'block';
      });
      document.getElementById('closeAdminPwdBtn').addEventListener('click', () => {
        adminPwdPanelEl.style.display = 'none';
      });
      adminPwdFormEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        const cur = document.getElementById('adminCurPwd').value;
        const next = document.getElementById('adminNewPwd').value;
        const confirmVal = document.getElementById('adminConfirmPwd').value;
        if (next.length < 8) {
          showNotice('新密码长度至少为 8 位', true);
          return;
        }
        if (next !== confirmVal) {
          showNotice('两次输入的新密码不一致', true);
          return;
        }
        const submitBtn = document.getElementById('adminPwdSubmitBtn');
        submitBtn.disabled = true;
        try {
          const res = await fetch('/user-api/me/password', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword: cur, newPassword: next }),
          });
          const body = await res.json();
          if (!res.ok) {
            showNotice(body.error || '修改密码失败', true);
            return;
          }
          adminPwdFormEl.reset();
          adminPwdPanelEl.style.display = 'none';
          showNotice('管理员密码已更新，下次请使用新密码登录。');
        } catch (err) {
          showNotice('网络异常：' + err.message, true);
        } finally {
          submitBtn.disabled = false;
        }
      });

      document.getElementById('copyTempPwdBtn').addEventListener('click', async () => {
        if (!latestTempPassword) return;
        try {
          await navigator.clipboard.writeText(latestTempPassword);
          showNotice('临时密码已复制到剪贴板。');
        } catch {
          showNotice('浏览器未授予剪贴板权限，请手动复制页面上的临时密码。', true);
        }
      });
      document.getElementById('closeTempPwdBtn').addEventListener('click', () => {
        tempPwdBannerEl.style.display = 'none';
      });

      document.getElementById('refreshBtn').addEventListener('click', loadUsers);
      document.getElementById('logoutBtn').addEventListener('click', async () => {
        await fetch('/user-api/logout', { method: 'POST', credentials: 'same-origin' });
        location.reload();
      });

      loadUsers();
    </script>`
      : `
    <div class="login-wrap">
      <section class="login-card">
        <div class="login-brand">
          ${BRAND_LOGO_SVG}
          <div>
            <div class="login-eyebrow">高词 · GoPrmpt</div>
            <h1>用户与会员管理后台</h1>
          </div>
        </div>
        <p class="muted">${
          authenticated
            ? `当前账号（${escapeHtml(username)}）不是管理员，请切换管理员账号登录。`
            : '请使用管理员账号登录，以控制会员总开关、管理注册用户与 Pro 会员等级。'
        }</p>
        <div id="loginNotice" class="notice" style="display:none"></div>
        <form id="loginForm">
          <label>管理员用户名
            <input id="username" name="username" autocomplete="username" required />
          </label>
          <label>密码
            <input id="password" name="password" type="password" autocomplete="current-password" required />
          </label>
          <button type="submit" class="btn btn-primary" style="width:100%;height:40px;margin-top:6px;">登录管理后台</button>
        </form>
        <div class="login-footer">
          <a href="/">← 返回高词工作台</a>
        </div>
      </section>
    </div>
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
    :root {
      --bg: #FAF9F5;
      --chrome: #F3F1EA;
      --surface: #FFFFFF;
      --border: rgba(24, 24, 27, 0.09);
      --border-strong: rgba(15, 118, 110, 0.34);
      --ink: #18181B;
      --muted: #52525B;
      --subtle: #71717A;
      --accent: #0F766E;
      --accent-hover: #0D9488;
      --accent-soft: rgba(15, 118, 110, 0.11);
      --copper: #D96B43;
      --copper-soft: rgba(217, 107, 67, 0.13);
      --danger: #B91C1C;
      --danger-soft: #FEE2E2;
      --ok: #0F766E;
      --ok-soft: #CCFBF1;
      font-family: 'Inter', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', -apple-system, BlinkMacSystemFont, sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px clamp(16px, 3vw, 36px) 48px;
      background: var(--bg);
      color: var(--ink);
      -webkit-font-smoothing: antialiased;
    }
    .shell { max-width: 1220px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
    .topbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
      padding: 16px 20px;
      background: var(--chrome);
      border: 1px solid var(--border);
      border-radius: 16px;
    }
    .brand-group { display: flex; align-items: center; gap: 12px; }
    .brand-mark { flex-shrink: 0; display: inline-flex; }
    h1 { margin: 0 0 4px; font-size: 19px; font-weight: 700; letter-spacing: -0.02em; }
    h2 { margin: 0 0 4px; font-size: 16px; font-weight: 650; letter-spacing: -0.01em; }
    p { margin: 0; font-size: 13px; line-height: 1.55; }
    .meta { font-size: 13px; color: var(--muted); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .card, .login-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 20px;
      box-shadow: 0 1px 2px rgba(24,24,27,0.03), 0 10px 26px -16px rgba(24,24,27,0.12);
    }
    .switch-card {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 20px;
      flex-wrap: wrap;
      border-color: var(--border-strong);
      background: linear-gradient(135deg, #FFFFFF 0%, #F7F5EE 100%);
    }
    .switch-info { max-width: 720px; }
    .switch-eyebrow {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.06em;
      color: var(--accent);
      margin-bottom: 4px;
    }
    .switch-controls { display: flex; align-items: center; gap: 14px; }
    .switch-status-block { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
    .toggle-switch {
      position: relative;
      width: 56px;
      height: 32px;
      border-radius: 999px;
      border: 1px solid rgba(24, 24, 27, 0.16);
      background: #E4E2D8;
      cursor: pointer;
      padding: 0;
      transition: background-color 180ms ease, border-color 180ms ease;
    }
    .toggle-switch.is-on {
      background: var(--accent);
      border-color: var(--accent);
    }
    .toggle-switch:disabled { opacity: 0.6; cursor: wait; }
    .toggle-thumb {
      position: absolute;
      top: 3px;
      left: 3px;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #FFFFFF;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.16);
      transition: transform 180ms ease;
    }
    .toggle-switch.is-on .toggle-thumb { transform: translateX(24px); }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
    }
    @media (max-width: 860px) {
      .stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    .stat-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 16px;
    }
    .stat-label { font-size: 12px; color: var(--muted); font-weight: 500; }
    .stat-value { font-size: 24px; font-weight: 700; margin: 6px 0 4px; letter-spacing: -0.02em; }
    .stat-accent { color: var(--accent); }
    .stat-sub { font-size: 12px; color: var(--subtle); }

    .card-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 16px;
      flex-wrap: wrap;
      margin-bottom: 16px;
    }
    .filter-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .search-input {
      width: 210px;
      padding: 7px 11px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--bg);
      color: var(--ink);
      font-size: 13px;
      outline: none;
    }
    .search-input:focus { border-color: var(--accent); background: #FFFFFF; }
    .filter-pills { display: flex; gap: 6px; flex-wrap: wrap; }
    .pill {
      padding: 6px 11px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: var(--bg);
      color: var(--muted);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
    }
    .pill.is-active {
      background: var(--accent-soft);
      border-color: var(--border-strong);
      color: var(--accent);
      font-weight: 600;
    }

    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { text-align: left; padding: 11px 10px; border-bottom: 1px solid var(--border); vertical-align: middle; }
    th { font-weight: 600; color: var(--muted); white-space: nowrap; font-size: 12px; background: var(--bg); }
    tbody tr:hover { background: rgba(243, 241, 234, 0.45); }
    .sub { font-size: 11px; color: var(--subtle); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .muted { color: var(--muted); }
    .op-cell { display: flex; gap: 6px; flex-wrap: wrap; }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 7px 13px;
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--ink);
      border-radius: 10px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      text-decoration: none;
      transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease;
    }
    .btn:hover:not(:disabled) { background: var(--chrome); border-color: rgba(24, 24, 27, 0.18); }
    .btn:disabled { opacity: 0.55; cursor: not-allowed; }
    .btn-sm { padding: 5px 10px; font-size: 12px; border-radius: 8px; }
    .btn-primary { background: var(--accent); border-color: var(--accent); color: #FAF9F5; }
    .btn-primary:hover:not(:disabled) { background: var(--accent-hover); border-color: var(--accent-hover); color: #FAF9F5; }
    .btn-accent-outline { border-color: var(--border-strong); color: var(--accent); background: var(--accent-soft); }
    .btn-accent-outline:hover:not(:disabled) { background: var(--accent); color: #FAF9F5; }
    .btn-danger { border-color: rgba(185, 28, 28, 0.32); color: var(--danger); }
    .btn-danger:hover:not(:disabled) { background: var(--danger-soft); border-color: var(--danger); }

    .badge { display: inline-block; padding: 3px 9px; border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap; }
    .badge-pro { background: var(--accent-soft); color: var(--accent); }
    .badge-free { background: var(--chrome); color: var(--muted); }
    .badge-admin { background: var(--copper-soft); color: #9A3412; }
    .badge-neutral { background: #F4F4F5; color: var(--muted); }
    .badge-ok { background: var(--ok-soft); color: var(--ok); }
    .badge-danger { background: var(--danger-soft); color: var(--danger); }

    .notice { padding: 11px 14px; border-radius: 12px; font-size: 13px; font-weight: 500; }
    .notice-ok { background: var(--ok-soft); color: #115E59; border: 1px solid rgba(15, 118, 110, 0.25); }
    .notice-error { background: var(--danger-soft); color: #991B1B; border: 1px solid rgba(185, 28, 28, 0.25); }

    .admin-pwd-panel { background: #F7F5EE; border-color: var(--border-strong); }
    .inline-pwd-form {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr)) auto;
      gap: 12px;
      align-items: end;
    }
    .inline-pwd-form label { margin: 0; }
    .inline-pwd-submit { display: flex; align-items: flex-end; }
    @media (max-width: 820px) {
      .inline-pwd-form { grid-template-columns: 1fr; }
    }

    .temp-pwd-banner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
      padding: 14px 18px;
      border-radius: 14px;
      background: #FFF7ED;
      border: 1px solid rgba(217, 107, 67, 0.38);
      font-size: 13px;
    }
    .temp-pwd-code {
      display: inline-block;
      margin-left: 6px;
      padding: 3px 10px;
      border-radius: 8px;
      background: #FFFFFF;
      border: 1px solid rgba(217, 107, 67, 0.35);
      color: #9A3412;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.04em;
    }

    .login-wrap { min-height: calc(100vh - 72px); display: flex; align-items: center; justify-content: center; }
    .login-card { width: 100%; max-width: 400px; padding: 28px; }
    .login-brand { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
    .login-eyebrow { font-size: 12px; font-weight: 600; color: var(--accent); }
    label { display: block; margin: 14px 0; font-size: 13px; font-weight: 500; color: var(--ink); }
    input[type="text"], input[type="password"], input:not([type]) {
      width: 100%;
      margin-top: 6px;
      padding: 9px 12px;
      border: 1px solid var(--border);
      border-radius: 10px;
      font-size: 14px;
      background: var(--bg);
      color: var(--ink);
      outline: none;
    }
    input:focus { border-color: var(--accent); background: #FFFFFF; }
    .login-footer { margin-top: 16px; text-align: center; font-size: 13px; }
    .login-footer a { color: var(--accent); text-decoration: none; font-weight: 500; }
    .login-footer a:hover { text-decoration: underline; }
  </style>
</head>
<body>${bodyContent}</body>
</html>`;
}
