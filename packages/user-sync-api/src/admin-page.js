import { ANNOUNCEMENT_TYPES } from './announcements.js';

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const BRAND_LOGO_SVG = `<svg width="30" height="30" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="gp-admin-jade" x1="6" y1="4" x2="58" y2="60" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#0D9488"/>
      <stop offset="55%" stop-color="#0F766E"/>
      <stop offset="100%" stop-color="#115E59"/>
    </linearGradient>
    <linearGradient id="gp-admin-copper" x1="39" y1="12" x2="54" y2="28" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#F59E0B"/>
      <stop offset="100%" stop-color="#D96B43"/>
    </linearGradient>
    <linearGradient id="gp-admin-sheen" x1="10" y1="4" x2="46" y2="42" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#FAF9F5" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="#FAF9F5" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#gp-admin-jade)"/>
  <rect x="2.75" y="2.75" width="58.5" height="58.5" rx="15.25" stroke="url(#gp-admin-sheen)" stroke-width="1.5"/>
  <path d="M44.5 23.5A15.5 15.5 0 1 0 47.5 34H33.5" stroke="#FAF9F5" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M33.5 34H47.5V41.5A15.5 15.5 0 0 1 32 47.5" stroke="#CCFBF1" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.92"/>
  <path d="M46.5 12.5L48.3 18.2L54 20L48.3 21.8L46.5 27.5L44.7 21.8L39 20L44.7 18.2Z" fill="url(#gp-admin-copper)"/>
</svg>`;

export function renderAdminHtml({
  authenticated,
  isAdmin,
  username,
  membershipEnabled,
  emailResetEnabled = false,
  resendKeyHint = '',
  mailFrom = '高词 · GoPrmpt <noreply@goprmpt.com>',
}) {
  const title = '高词 · GoPrmpt 用户与会员管理后台';
  const enabledFlag = Boolean(membershipEnabled);
  const mailEnabledFlag = Boolean(emailResetEnabled);
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

      <section class="card mail-card" id="mailSettingsCard">
        <div class="card-head" style="margin-bottom:14px;">
          <div>
            <div class="switch-eyebrow">Resend 邮件发信通道</div>
            <h2>邮箱验证码自助找回密码</h2>
            <p class="muted" id="mailStatusDesc">
              ${
                mailEnabledFlag
                  ? `已启用 Resend 发信（密钥 ${escapeHtml(resendKeyHint || '已保存')}），工作台与管理后台登录页已自动开放「忘记密码」邮箱验证重置。`
                  : '尚未配置 Resend API Key：保存密钥并验证发信域名后，工作台登录页将自动开启「忘记密码」邮箱验证码找回。'
              }
            </p>
          </div>
          <span id="mailStatusBadge" class="badge ${mailEnabledFlag ? 'badge-ok' : 'badge-free'}">
            ${mailEnabledFlag ? '发信通道：已启用' : '发信通道：未配置'}
          </span>
        </div>

        <form id="mailSettingsForm" class="mail-form-grid">
          <label>Resend API Key
            <input
              id="resendApiKeyInput"
              type="password"
              autocomplete="off"
              placeholder="${mailEnabledFlag ? `当前已保存 ${escapeHtml(resendKeyHint)}，留空则保持不变` : '粘贴 re_ 开头的 Resend API Key'}"
            />
          </label>
          <label>发件人地址（需与 Resend 已验证域名一致）
            <input
              id="mailFromInput"
              type="text"
              value="${escapeHtml(mailFrom)}"
              placeholder="高词 · GoPrmpt <noreply@goprmpt.com>"
            />
          </label>
          <div class="mail-form-actions">
            <button id="saveMailBtn" class="btn btn-primary" type="submit">保存发信配置</button>
            <button id="clearMailKeyBtn" class="btn btn-danger" type="button" ${mailEnabledFlag ? '' : 'style="display:none"'}>停用并清空 Key</button>
          </div>
        </form>

        <div class="mail-test-row">
          <input id="testMailToInput" type="email" class="search-input" style="flex:1;min-width:220px;" placeholder="输入你的收件邮箱测试发信（如 123@qq.com）" />
          <button id="sendTestMailBtn" class="btn" type="button" ${mailEnabledFlag ? '' : 'disabled'}>发送测试邮件</button>
        </div>

        <div class="mail-guide">
          <span>配置步骤：1. 登录 <a href="https://resend.com/domains" target="_blank" rel="noopener noreferrer">resend.com</a> 添加域名 <code>goprmpt.com</code> 并把生成的 DNS 记录加到域名解析中 → 2. 在 <a href="https://resend.com/api-keys" target="_blank" rel="noopener noreferrer">API Keys</a> 新建只含 Sending access 的密钥粘贴到上方保存 → 3. 点击「发送测试邮件」确认收到即完成。</span>
        </div>
      </section>

      <section class="card announcements-card" id="announcementsCard">
        <div class="card-head" style="margin-bottom:14px;">
          <div>
            <div class="switch-eyebrow">通知与活动发布</div>
            <h2>站内通知与活动公告</h2>
            <p class="muted" id="announcementsMetaDesc">发布中的通知会实时展示在工作台与插件中，也可通过 Resend 一键推送给已绑定邮箱的活跃用户。</p>
          </div>
          <div class="announcements-head-actions">
            <span id="activeAnnouncementsBadge" class="badge badge-ok">发布中 0 条</span>
            <button id="toggleAnnouncementFormBtn" class="btn btn-primary" type="button">发布新通知</button>
          </div>
        </div>

        <div id="announcementFormWrap" class="announcement-form-wrap" style="display:none">
          <div class="announcement-form-head">
            <strong id="announcementFormTitle">发布新通知</strong>
            <span class="muted">支持重要通知、活动公告与维护提示，跳转链接仅允许 http 或 https 地址。</span>
          </div>
          <form id="announcementForm" class="announcement-form">
            <div class="announcement-form-row">
              <label>通知类型
                <select id="annType" name="type">
                  ${Object.values(ANNOUNCEMENT_TYPES)
                    .map(
                      (item) =>
                        `<option value="${escapeHtml(item.key)}">${escapeHtml(item.label)}</option>`,
                    )
                    .join('')}
                </select>
              </label>
              <label class="ann-title-field">标题（最多 80 字）
                <input id="annTitle" name="title" type="text" maxlength="80" placeholder="例如：高词春季限时活动开启" required />
              </label>
              <label>有效期
                <select id="annExpiry" name="expiry">
                  <option value="never">长期有效</option>
                  <option value="3d">3 天</option>
                  <option value="7d">7 天</option>
                  <option value="30d">30 天</option>
                </select>
              </label>
            </div>

            <label>公告正文（最多 800 字，支持换行）
              <textarea id="annContent" name="content" rows="3" maxlength="800" placeholder="输入面向用户的通知或活动说明内容..." required></textarea>
            </label>

            <div class="announcement-form-row announcement-link-row">
              <label>跳转链接（可选）
                <input id="annLinkUrl" name="linkUrl" type="url" maxlength="500" placeholder="https://goprmpt.com/..." />
              </label>
              <label>按钮文案（可选，最多 32 字）
                <input id="annLinkText" name="linkText" type="text" maxlength="32" placeholder="查看详情" />
              </label>
            </div>

            <div class="announcement-form-footer">
              <div class="announcement-checks">
                <label class="check-label">
                  <input id="annIsActive" type="checkbox" checked />
                  <span>立即发布</span>
                </label>
                <label class="check-label">
                  <input id="annIsPinned" type="checkbox" />
                  <span>置顶优先</span>
                </label>
              </div>
              <div class="actions">
                <button id="cancelAnnouncementBtn" class="btn" type="button">取消</button>
                <button id="saveAnnouncementBtn" class="btn btn-primary" type="submit">保存并发布</button>
              </div>
            </div>
          </form>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>类型与标记</th>
                <th>标题与内容</th>
                <th>状态</th>
                <th>有效期</th>
                <th>邮件推送</th>
                <th>管理操作</th>
              </tr>
            </thead>
            <tbody id="announcementRows">
              <tr><td colspan="6" class="muted">正在加载通知列表...</td></tr>
            </tbody>
          </table>
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
      const ANNOUNCEMENT_TYPES_META = ${JSON.stringify(ANNOUNCEMENT_TYPES)};
      const ONE_DAY_MS = 24 * 60 * 60 * 1000;
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
      const mailStatusBadgeEl = document.getElementById('mailStatusBadge');
      const mailStatusDescEl = document.getElementById('mailStatusDesc');
      const resendApiKeyInputEl = document.getElementById('resendApiKeyInput');
      const mailFromInputEl = document.getElementById('mailFromInput');
      const clearMailKeyBtnEl = document.getElementById('clearMailKeyBtn');
      const sendTestMailBtnEl = document.getElementById('sendTestMailBtn');
      const testMailToInputEl = document.getElementById('testMailToInput');
      const activeAnnouncementsBadgeEl = document.getElementById('activeAnnouncementsBadge');
      const announcementsMetaDescEl = document.getElementById('announcementsMetaDesc');
      const toggleAnnouncementFormBtnEl = document.getElementById('toggleAnnouncementFormBtn');
      const announcementFormWrapEl = document.getElementById('announcementFormWrap');
      const announcementFormTitleEl = document.getElementById('announcementFormTitle');
      const announcementFormEl = document.getElementById('announcementForm');
      const annTypeEl = document.getElementById('annType');
      const annTitleEl = document.getElementById('annTitle');
      const annContentEl = document.getElementById('annContent');
      const annLinkUrlEl = document.getElementById('annLinkUrl');
      const annLinkTextEl = document.getElementById('annLinkText');
      const annExpiryEl = document.getElementById('annExpiry');
      const annIsActiveEl = document.getElementById('annIsActive');
      const annIsPinnedEl = document.getElementById('annIsPinned');
      const saveAnnouncementBtnEl = document.getElementById('saveAnnouncementBtn');
      const cancelAnnouncementBtnEl = document.getElementById('cancelAnnouncementBtn');
      const announcementRowsEl = document.getElementById('announcementRows');
      let latestTempPassword = '';

      let currentMembershipEnabled = ${enabledFlag ? 'true' : 'false'};
      let allUsers = [];
      let currentFilter = 'all';
      let allAnnouncements = [];
      let announcementsLoaded = false;
      let emailableUsersCount = 0;
      let announcementEmailEnabled = ${mailEnabledFlag ? 'true' : 'false'};
      let editingAnnouncementId = null;
      let editingAnnouncementExpiresAt = null;

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

      function renderMailState(info) {
        const enabled = Boolean(info.emailResetEnabled);
        mailStatusBadgeEl.className = enabled ? 'badge badge-ok' : 'badge badge-free';
        mailStatusBadgeEl.textContent = enabled ? '发信通道：已启用' : '发信通道：未配置';
        mailStatusDescEl.textContent = enabled
          ? '已启用 Resend 发信（密钥 ' + (info.resendKeyHint || '已保存') + '），工作台与管理后台登录页已自动开放「忘记密码」邮箱验证重置。'
          : '尚未配置 Resend API Key：保存密钥并验证发信域名后，工作台登录页将自动开启「忘记密码」邮箱验证码找回。';
        resendApiKeyInputEl.placeholder = enabled
          ? '当前已保存 ' + (info.resendKeyHint || '') + '，留空则保持不变'
          : '粘贴 re_ 开头的 Resend API Key';
        if (info.mailFrom) {
          mailFromInputEl.value = info.mailFrom;
        }
        clearMailKeyBtnEl.style.display = enabled ? 'inline-flex' : 'none';
        sendTestMailBtnEl.disabled = !enabled;
        announcementEmailEnabled = enabled;
        if (announcementsLoaded) {
          renderAnnouncements();
        }
      }

      function getAnnouncementTypeInfo(type) {
        return ANNOUNCEMENT_TYPES_META[type] || ANNOUNCEMENT_TYPES_META.notice;
      }

      function setExpiryOptions(existingExpiresAt) {
        const keepOpt = annExpiryEl.querySelector('option[value="keep"]');
        if (existingExpiresAt) {
          const label = '保持原有效期（' + fmtDate(existingExpiresAt) + '）';
          if (keepOpt) {
            keepOpt.textContent = label;
          } else {
            const opt = document.createElement('option');
            opt.value = 'keep';
            opt.textContent = label;
            annExpiryEl.insertBefore(opt, annExpiryEl.firstChild);
          }
          annExpiryEl.value = 'keep';
        } else {
          if (keepOpt) keepOpt.remove();
          annExpiryEl.value = 'never';
        }
      }

      function openAnnouncementForm(item) {
        if (item) {
          editingAnnouncementId = item.id;
          editingAnnouncementExpiresAt = item.expiresAt ?? null;
          announcementFormTitleEl.textContent = '编辑通知';
          saveAnnouncementBtnEl.textContent = '保存修改';
          annTypeEl.value = item.type || 'notice';
          annTitleEl.value = item.title || '';
          annContentEl.value = item.content || '';
          annLinkUrlEl.value = item.linkUrl || '';
          annLinkTextEl.value = item.linkText || '';
          annIsActiveEl.checked = Boolean(item.isActive);
          annIsPinnedEl.checked = Boolean(item.isPinned);
          setExpiryOptions(editingAnnouncementExpiresAt);
        } else {
          editingAnnouncementId = null;
          editingAnnouncementExpiresAt = null;
          announcementFormTitleEl.textContent = '发布新通知';
          saveAnnouncementBtnEl.textContent = '保存并发布';
          announcementFormEl.reset();
          annTypeEl.value = 'notice';
          annIsActiveEl.checked = true;
          annIsPinnedEl.checked = false;
          setExpiryOptions(null);
        }
        announcementFormWrapEl.style.display = 'block';
        toggleAnnouncementFormBtnEl.textContent = '收起表单';
        annTitleEl.focus();
      }

      function closeAnnouncementForm() {
        editingAnnouncementId = null;
        editingAnnouncementExpiresAt = null;
        announcementFormEl.reset();
        setExpiryOptions(null);
        announcementFormWrapEl.style.display = 'none';
        toggleAnnouncementFormBtnEl.textContent = '发布新通知';
      }

      function resolveExpiryTimestamp(value) {
        if (value === 'keep') return editingAnnouncementExpiresAt;
        if (value === '3d') return Date.now() + 3 * ONE_DAY_MS;
        if (value === '7d') return Date.now() + 7 * ONE_DAY_MS;
        if (value === '30d') return Date.now() + 30 * ONE_DAY_MS;
        return null;
      }

      function renderAnnouncements() {
        const now = Date.now();
        const activeCount = allAnnouncements.filter(
          (a) => a.isActive && (!a.expiresAt || a.expiresAt > now)
        ).length;
        activeAnnouncementsBadgeEl.textContent = '发布中 ' + activeCount + ' 条';
        activeAnnouncementsBadgeEl.className = activeCount > 0 ? 'badge badge-ok' : 'badge badge-free';
        announcementsMetaDescEl.textContent =
          '发布中的通知会实时展示在工作台与插件中。当前已绑定邮箱的活跃用户共 ' +
          emailableUsersCount +
          ' 人' +
          (announcementEmailEnabled ? '，可直接一键邮件推送。' : '（配置上方 Resend 通道后可一键邮件推送）。');

        if (!allAnnouncements.length) {
          announcementRowsEl.innerHTML =
            '<tr><td colspan="6" class="muted">暂无通知或活动公告，点击右上角「发布新通知」创建第一条。</td></tr>';
          return;
        }

        announcementRowsEl.innerHTML = allAnnouncements.map((a) => {
          const typeInfo = getAnnouncementTypeInfo(a.type);
          const isExpired = Boolean(a.expiresAt && a.expiresAt <= now);
          const typeBadge =
            '<span class="badge ' + esc(typeInfo.adminBadgeClass) + '">' + esc(typeInfo.label) + '</span>';
          const pinBadge = a.isPinned
            ? ' <span class="badge badge-pin">置顶</span>'
            : '';

          let statusBadge = '<span class="badge badge-ok">发布中</span>';
          if (!a.isActive) {
            statusBadge = '<span class="badge badge-free">已下线</span>';
          } else if (isExpired) {
            statusBadge = '<span class="badge badge-warn">已过期</span>';
          }

          const previewText = String(a.content || '').length > 96
            ? String(a.content).slice(0, 96) + '...'
            : String(a.content || '');
          const safeLink =
            typeof a.linkUrl === 'string' &&
            (a.linkUrl.startsWith('https://') || a.linkUrl.startsWith('http://'))
              ? '<div class="ann-link-preview"><a href="' +
                esc(a.linkUrl) +
                '" target="_blank" rel="noopener noreferrer">' +
                esc(a.linkText || a.linkUrl) +
                '</a></div>'
              : '';

          const expiryText = a.expiresAt ? fmtDate(a.expiresAt) : '长期有效';
          const emailStatusHtml = a.emailedAt
            ? '<span>已推 ' + (a.emailedCount || 0) + ' 人</span><div class="sub">' + fmtDate(a.emailedAt) + '</div>'
            : '<span class="muted">未推送</span>';

          const emailDisabledAttr = announcementEmailEnabled
            ? ''
            : ' disabled title="请先配置并保存 Resend 发信通道"';

          return '<tr>' +
            '<td class="ann-type-cell">' + typeBadge + pinBadge + '</td>' +
            '<td class="ann-content-cell">' +
              '<strong>' + esc(a.title) + '</strong>' +
              '<div class="ann-preview">' + esc(previewText) + '</div>' +
              safeLink +
            '</td>' +
            '<td>' + statusBadge + '</td>' +
            '<td>' + esc(expiryText) + '</td>' +
            '<td>' + emailStatusHtml + '</td>' +
            '<td class="op-cell">' +
              '<button class="btn btn-sm" data-ann-act="edit" data-id="' + esc(a.id) + '">编辑</button>' +
              '<button class="btn btn-sm" data-ann-act="toggle-active" data-id="' + esc(a.id) + '">' + (a.isActive ? '下线' : '发布') + '</button>' +
              '<button class="btn btn-sm" data-ann-act="toggle-pin" data-id="' + esc(a.id) + '">' + (a.isPinned ? '取消置顶' : '置顶') + '</button>' +
              '<button class="btn btn-sm" data-ann-act="send-email" data-id="' + esc(a.id) + '"' + emailDisabledAttr + '>邮件推送</button>' +
              '<button class="btn btn-sm btn-danger" data-ann-act="delete" data-id="' + esc(a.id) + '">删除</button>' +
            '</td>' +
          '</tr>';
        }).join('');
      }

      async function loadAnnouncements() {
        try {
          const res = await fetch('/user-api/admin/announcements', { credentials: 'same-origin' });
          const body = await res.json();
          if (!res.ok) {
            showNotice(body.error || '加载通知列表失败', true);
            return;
          }
          allAnnouncements = Array.isArray(body.announcements) ? body.announcements : [];
          announcementsLoaded = true;
          emailableUsersCount = Number(body.emailableUsersCount || 0);
          announcementEmailEnabled = Boolean(body.emailEnabled);
          renderAnnouncements();
        } catch (err) {
          showNotice('加载通知列表异常：' + err.message, true);
        }
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
              '<button class="btn btn-sm" data-act="pro30" data-id="' + esc(u.id) + '">设为 Pro +30天</button>' +
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
          renderMailState(body);
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
            await refreshAll();
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

      document.getElementById('mailSettingsForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const saveBtn = document.getElementById('saveMailBtn');
        const keyVal = resendApiKeyInputEl.value.trim();
        const fromVal = mailFromInputEl.value.trim();
        const payload = { mailFrom: fromVal };
        if (keyVal) {
          payload.resendApiKey = keyVal;
        }
        saveBtn.disabled = true;
        try {
          const res = await fetch('/user-api/admin/settings', {
            method: 'PATCH',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const body = await res.json();
          if (!res.ok) {
            showNotice(body.error || '保存邮件配置失败', true);
            return;
          }
          resendApiKeyInputEl.value = '';
          renderMailState(body);
          showNotice(
            body.emailResetEnabled
              ? 'Resend 发信配置已保存并立即生效，建议立刻发一封测试邮件确认送达。'
              : '发件人地址已更新（当前未配置 API Key，邮箱找回暂未开启）。'
          );
        } catch (err) {
          showNotice('网络异常：' + err.message, true);
        } finally {
          saveBtn.disabled = false;
        }
      });

      clearMailKeyBtnEl.addEventListener('click', async () => {
        if (!window.confirm('确定清空已保存的 Resend API Key 吗？清空后前端将暂停邮箱自助找回密码。')) {
          return;
        }
        clearMailKeyBtnEl.disabled = true;
        try {
          const res = await fetch('/user-api/admin/settings', {
            method: 'PATCH',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resendApiKey: '' }),
          });
          const body = await res.json();
          if (!res.ok) {
            showNotice(body.error || '清空失败', true);
            return;
          }
          resendApiKeyInputEl.value = '';
          renderMailState(body);
          showNotice('已清空数据库保存的 Resend API Key。');
        } catch (err) {
          showNotice('网络异常：' + err.message, true);
        } finally {
          clearMailKeyBtnEl.disabled = false;
        }
      });

      sendTestMailBtnEl.addEventListener('click', async () => {
        const to = testMailToInputEl.value.trim();
        if (!to) {
          showNotice('请先输入测试收件邮箱地址', true);
          return;
        }
        sendTestMailBtnEl.disabled = true;
        try {
          const res = await fetch('/user-api/admin/test-email', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to }),
          });
          const body = await res.json();
          if (!res.ok) {
            showNotice(body.error || '测试邮件发送失败', true);
            return;
          }
          showNotice('测试邮件已发往 ' + body.to + '，请检查收件箱（或垃圾箱）。');
        } catch (err) {
          showNotice('网络异常：' + err.message, true);
        } finally {
          sendTestMailBtnEl.disabled = false;
        }
      });

      toggleAnnouncementFormBtnEl.addEventListener('click', () => {
        const isOpen = announcementFormWrapEl.style.display !== 'none';
        if (isOpen) {
          closeAnnouncementForm();
        } else {
          openAnnouncementForm(null);
        }
      });

      cancelAnnouncementBtnEl.addEventListener('click', closeAnnouncementForm);

      announcementFormEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
          type: annTypeEl.value,
          title: annTitleEl.value.trim(),
          content: annContentEl.value.trim(),
          linkUrl: annLinkUrlEl.value.trim() || null,
          linkText: annLinkTextEl.value.trim() || null,
          isActive: annIsActiveEl.checked,
          isPinned: annIsPinnedEl.checked,
          expiresAt: resolveExpiryTimestamp(annExpiryEl.value),
        };
        if (!payload.title || !payload.content) {
          showNotice('请填写公告标题和正文内容', true);
          return;
        }
        saveAnnouncementBtnEl.disabled = true;
        try {
          const isEdit = Boolean(editingAnnouncementId);
          const endpoint = isEdit
            ? '/user-api/admin/announcements/' + encodeURIComponent(editingAnnouncementId)
            : '/user-api/admin/announcements';
          const res = await fetch(endpoint, {
            method: isEdit ? 'PATCH' : 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const body = await res.json();
          if (!res.ok) {
            showNotice(body.error || '保存通知失败', true);
            return;
          }
          closeAnnouncementForm();
          showNotice(isEdit ? '通知已更新。' : '新通知已保存。');
          await loadAnnouncements();
        } catch (err) {
          showNotice('网络异常：' + err.message, true);
        } finally {
          saveAnnouncementBtnEl.disabled = false;
        }
      });

      announcementRowsEl.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-ann-act]');
        if (!btn) return;
        const id = btn.dataset.id;
        const act = btn.dataset.annAct;
        const item = allAnnouncements.find((a) => a.id === id);
        if (!item) return;

        if (act === 'edit') {
          openAnnouncementForm(item);
          return;
        }

        if (act === 'delete') {
          if (!window.confirm('确定要删除通知「' + item.title + '」吗？删除后无法恢复。')) {
            return;
          }
          btn.disabled = true;
          try {
            const res = await fetch('/user-api/admin/announcements/' + encodeURIComponent(id), {
              method: 'DELETE',
              credentials: 'same-origin',
            });
            const body = await res.json();
            if (!res.ok) {
              showNotice(body.error || '删除失败', true);
            } else {
              if (editingAnnouncementId === id) {
                closeAnnouncementForm();
              }
              showNotice('已删除通知「' + item.title + '」。');
              await loadAnnouncements();
            }
          } catch (err) {
            showNotice('请求失败：' + err.message, true);
          } finally {
            btn.disabled = false;
          }
          return;
        }

        if (act === 'send-email') {
          if (!announcementEmailEnabled) {
            showNotice('请先在上方配置并保存 Resend 发信通道。', true);
            return;
          }
          if (emailableUsersCount <= 0) {
            showNotice('当前没有已绑定邮箱的活跃用户可推送。', true);
            return;
          }
          if (
            !window.confirm(
              '确定通过 Resend 向当前 ' +
                emailableUsersCount +
                ' 位已绑定邮箱的活跃用户推送通知「' +
                item.title +
                '」吗？'
            )
          ) {
            return;
          }
          btn.disabled = true;
          try {
            const res = await fetch(
              '/user-api/admin/announcements/' + encodeURIComponent(id) + '/send-email',
              {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: '{}',
              }
            );
            const body = await res.json();
            if (!res.ok) {
              showNotice(body.error || '邮件推送失败', true);
            } else {
              showNotice(
                '邮件推送完成：成功 ' +
                  body.sent +
                  ' 封' +
                  (body.failed ? '，失败 ' + body.failed + ' 封' : '') +
                  '（共 ' +
                  body.total +
                  ' 人）。'
              );
              await loadAnnouncements();
            }
          } catch (err) {
            showNotice('请求失败：' + err.message, true);
          } finally {
            btn.disabled = false;
          }
          return;
        }

        let patch = null;
        if (act === 'toggle-active') {
          patch = { isActive: !item.isActive };
        } else if (act === 'toggle-pin') {
          patch = { isPinned: !item.isPinned };
        }
        if (!patch) return;

        btn.disabled = true;
        try {
          const res = await fetch('/user-api/admin/announcements/' + encodeURIComponent(id), {
            method: 'PATCH',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
          });
          const body = await res.json();
          if (!res.ok) {
            showNotice(body.error || '更新通知状态失败', true);
          } else {
            showNotice('已更新通知「' + body.announcement.title + '」。');
            await loadAnnouncements();
          }
        } catch (err) {
          showNotice('请求失败：' + err.message, true);
        } finally {
          btn.disabled = false;
        }
      });

      async function refreshAll() {
        await Promise.all([loadUsers(), loadAnnouncements()]);
      }

      document.getElementById('refreshBtn').addEventListener('click', refreshAll);
      document.getElementById('logoutBtn').addEventListener('click', async () => {
        await fetch('/user-api/logout', { method: 'POST', credentials: 'same-origin' });
        location.reload();
      });

      refreshAll();
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
        ${
          mailEnabledFlag
            ? `
        <div class="login-reset-toggle">
          <button id="toggleResetBtn" type="button" class="link-btn">忘记密码？用绑定邮箱重置</button>
        </div>
        <form id="resetForm" style="display:none;margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">
          <label>已绑定的管理员邮箱
            <input id="resetEmail" type="email" autocomplete="email" placeholder="name@example.com" required />
          </label>
          <div class="reset-code-row">
            <input id="resetCode" type="text" inputmode="numeric" maxlength="6" placeholder="6 位验证码" />
            <button id="sendResetCodeBtn" type="button" class="btn btn-sm">发送验证码</button>
          </div>
          <label>新密码（至少 8 位）
            <input id="resetNewPwd" type="password" autocomplete="new-password" minlength="8" required />
          </label>
          <button id="confirmResetBtn" type="submit" class="btn btn-primary" style="width:100%;height:38px;">确认重置密码</button>
        </form>`
            : ''
        }
        <div class="login-footer">
          <a href="/">← 返回高词工作台</a>
        </div>
      </section>
    </div>
    <script>
      const form = document.getElementById('loginForm');
      const notice = document.getElementById('loginNotice');
      function showLoginNotice(msg, isError) {
        notice.textContent = msg;
        notice.className = isError ? 'notice notice-error' : 'notice notice-ok';
        notice.style.display = 'block';
      }
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
            showLoginNotice(body.error || '登录失败', true);
            return;
          }
          if (body.user?.role !== 'admin') {
            showLoginNotice('该账号没有管理员权限', true);
            return;
          }
          location.reload();
        } catch (err) {
          showLoginNotice('网络异常：' + err.message, true);
        }
      });

      const toggleResetBtn = document.getElementById('toggleResetBtn');
      const resetForm = document.getElementById('resetForm');
      if (toggleResetBtn && resetForm) {
        toggleResetBtn.addEventListener('click', () => {
          const open = resetForm.style.display !== 'none';
          resetForm.style.display = open ? 'none' : 'block';
          toggleResetBtn.textContent = open ? '忘记密码？用绑定邮箱重置' : '收起邮箱重置';
        });
        const sendCodeBtn = document.getElementById('sendResetCodeBtn');
        sendCodeBtn.addEventListener('click', async () => {
          const email = document.getElementById('resetEmail').value.trim();
          if (!email) {
            showLoginNotice('请输入已绑定的邮箱地址', true);
            return;
          }
          sendCodeBtn.disabled = true;
          try {
            const res = await fetch('/user-api/password-reset/request', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email }),
            });
            const body = await res.json();
            if (!res.ok) {
              showLoginNotice(body.error || '发送失败', true);
            } else {
              showLoginNotice(body.message || '验证码已发送，请查收邮件。', false);
            }
          } catch (err) {
            showLoginNotice('网络异常：' + err.message, true);
          } finally {
            sendCodeBtn.disabled = false;
          }
        });
        resetForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const email = document.getElementById('resetEmail').value.trim();
          const code = document.getElementById('resetCode').value.trim();
          const newPassword = document.getElementById('resetNewPwd').value;
          const submitBtn = document.getElementById('confirmResetBtn');
          submitBtn.disabled = true;
          try {
            const res = await fetch('/user-api/password-reset/confirm', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, code, newPassword }),
            });
            const body = await res.json();
            if (!res.ok) {
              showLoginNotice(body.error || '重置失败', true);
              return;
            }
            resetForm.reset();
            resetForm.style.display = 'none';
            toggleResetBtn.textContent = '忘记密码？用绑定邮箱重置';
            showLoginNotice('密码已重置，请使用新密码登录。', false);
          } catch (err) {
            showLoginNotice('网络异常：' + err.message, true);
          } finally {
            submitBtn.disabled = false;
          }
        });
      }
    </script>`;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <link rel="icon" type="image/png" sizes="192x192" href="/pwa/icon-192.png?v=goprmpt2" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=goprmpt2" />
  <meta name="theme-color" content="#0F766E" />
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
    .btn:active:not(:disabled) { background: #E9E6DC; transform: translateY(0.5px); }
    .btn:disabled { opacity: 0.55; cursor: not-allowed; }
    .btn-sm { padding: 5px 10px; font-size: 12px; border-radius: 8px; }
    .btn-primary { background: var(--accent); border-color: var(--accent); color: #FAF9F5; }
    .btn-primary:hover:not(:disabled) { background: var(--accent-hover); border-color: var(--accent-hover); color: #FAF9F5; }
    .btn-danger { border-color: rgba(185, 28, 28, 0.32); color: var(--danger); }
    .btn-danger:hover:not(:disabled) { background: var(--danger-soft); border-color: var(--danger); }

    .badge { display: inline-block; padding: 3px 9px; border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap; }
    .badge-pro { background: var(--accent-soft); color: var(--accent); }
    .badge-free { background: var(--chrome); color: var(--muted); }
    .badge-admin { background: var(--copper-soft); color: #9A3412; }
    .badge-neutral { background: #F4F4F5; color: var(--muted); }
    .badge-ok { background: var(--ok-soft); color: var(--ok); }
    .badge-danger { background: var(--danger-soft); color: var(--danger); }
    .badge-warn { background: #FEF3C7; color: #92400E; }
    .badge-pin { background: var(--copper-soft); color: #9A3412; }

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
    input[type="text"], input[type="password"], input[type="url"], input[type="email"]:not(.search-input), input:not([type]), select, textarea {
      width: 100%;
      margin-top: 6px;
      padding: 9px 12px;
      border: 1px solid var(--border);
      border-radius: 10px;
      font-size: 14px;
      font-family: inherit;
      background: var(--bg);
      color: var(--ink);
      outline: none;
    }
    textarea { resize: vertical; line-height: 1.55; }
    input:focus, select:focus, textarea:focus { border-color: var(--accent); background: #FFFFFF; }
    .announcements-head-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .announcement-form-wrap {
      margin-bottom: 16px;
      padding: 16px 18px;
      border-radius: 14px;
      background: #F7F5EE;
      border: 1px solid var(--border-strong);
    }
    .announcement-form-head {
      display: flex;
      align-items: baseline;
      gap: 10px;
      flex-wrap: wrap;
      margin-bottom: 12px;
      font-size: 13px;
    }
    .announcement-form label { margin: 0 0 12px; }
    .announcement-form-row {
      display: grid;
      grid-template-columns: 160px minmax(0, 1fr) 180px;
      gap: 12px;
      align-items: end;
    }
    .announcement-link-row { grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); }
    .announcement-form-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      padding-top: 4px;
    }
    .announcement-checks { display: flex; gap: 18px; flex-wrap: wrap; align-items: center; }
    .announcement-form .check-label {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin: 0;
      cursor: pointer;
      user-select: none;
    }
    .check-label input[type="checkbox"] {
      width: 16px;
      height: 16px;
      margin: 0;
      accent-color: var(--accent);
    }
    .ann-type-cell { white-space: nowrap; }
    .ann-content-cell { min-width: 240px; max-width: 420px; }
    .ann-preview {
      margin-top: 4px;
      font-size: 12px;
      line-height: 1.55;
      color: var(--muted);
      white-space: pre-wrap;
      word-break: break-word;
    }
    .ann-link-preview { margin-top: 4px; font-size: 12px; }
    .ann-link-preview a { color: var(--accent); font-weight: 500; text-decoration: none; }
    .ann-link-preview a:hover { text-decoration: underline; }
    @media (max-width: 900px) {
      .announcement-form-row, .announcement-link-row { grid-template-columns: 1fr; }
    }
    .login-footer { margin-top: 16px; text-align: center; font-size: 13px; }
    .login-footer a { color: var(--accent); text-decoration: none; font-weight: 500; }
    .login-footer a:hover { text-decoration: underline; }
    .login-reset-toggle { margin-top: 12px; text-align: center; }
    .link-btn { background: none; border: none; padding: 0; color: var(--accent); font-size: 13px; font-weight: 500; cursor: pointer; }
    .link-btn:hover { text-decoration: underline; }
    .reset-code-row { display: flex; gap: 8px; align-items: center; margin-top: 8px; }
    .reset-code-row input { margin-top: 0; flex: 1; }
    .mail-form-grid { display: grid; grid-template-columns: 1fr 1fr auto; gap: 12px; align-items: end; }
    .mail-form-grid label { margin: 0; }
    .mail-form-actions { display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap; }
    .mail-test-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--border); }
    .mail-guide { margin-top: 12px; font-size: 12px; line-height: 1.6; color: var(--muted); background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; }
    .mail-guide a { color: var(--accent); font-weight: 500; text-decoration: none; }
    .mail-guide a:hover { text-decoration: underline; }
    .mail-guide code { padding: 1px 5px; border-radius: 5px; background: var(--chrome); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
    @media (max-width: 900px) {
      .mail-form-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>${bodyContent}</body>
</html>`;
}
