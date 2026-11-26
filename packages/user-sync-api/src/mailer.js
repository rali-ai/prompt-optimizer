import { getAnnouncementTypeMeta } from './announcements.js';

export const DEFAULT_MAIL_FROM = '高词 · GoPrmpt <noreply@goprmpt.com>';
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export function maskApiKey(key) {
  const trimmed = typeof key === 'string' ? key.trim() : '';
  if (!trimmed) return '';
  if (trimmed.length <= 8) return `${trimmed.slice(0, 2)}••••`;
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendViaResend({ apiKey, from, to, subject, html, text, fetchImpl = fetch }) {
  const cleanKey = typeof apiKey === 'string' ? apiKey.trim() : '';
  const cleanFrom = typeof from === 'string' && from.trim() ? from.trim() : DEFAULT_MAIL_FROM;
  if (!cleanKey) {
    throw new Error('尚未配置 RESEND_API_KEY');
  }

  let res;
  try {
    res = await fetchImpl(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cleanKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: cleanFrom,
        to: [to],
        subject,
        html,
        text,
      }),
    });
  } catch (err) {
    throw new Error(`无法连接 Resend 发信服务：${err instanceof Error ? err.message : String(err)}`);
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      (body && typeof body.message === 'string' && body.message) ||
      (body && typeof body.name === 'string' && body.name) ||
      `HTTP ${res.status}`;
    throw new Error(`Resend 发信失败（${res.status}）：${detail}`);
  }

  return { id: typeof body?.id === 'string' ? body.id : '' };
}

export async function sendPasswordResetEmail({
  apiKey,
  from,
  to,
  username,
  code,
  expiresMinutes = 15,
  fetchImpl = fetch,
}) {
  const safeUser = escapeHtml(username);
  const safeCode = escapeHtml(code);
  const subject = `【高词 · GoPrmpt】密码重置验证码：${code}`;
  const text = [
    `你好 ${username}：`,
    '',
    `你正在重置高词（GoPrmpt）账号密码，本次验证码为：${code}`,
    `验证码在 ${expiresMinutes} 分钟内有效，请勿泄露给他人。`,
    '',
    '如果这不是你的操作，请忽略此邮件，你的账号密码不会被修改。',
    '高词 · GoPrmpt (https://goprmpt.net)',
  ].join('\n');

  const html = `<!doctype html>
<html lang="zh-CN">
<body style="margin:0;padding:24px;background:#FAF9F5;color:#18181B;font-family:'PingFang SC','Microsoft YaHei',-apple-system,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid rgba(24,24,27,0.09);border-radius:16px;padding:28px;">
    <div style="font-size:13px;font-weight:700;color:#0F766E;letter-spacing:0.03em;margin-bottom:8px;">高词 · GoPrmpt</div>
    <h1 style="margin:0 0 12px;font-size:20px;color:#18181B;">重置你的账号密码</h1>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#52525B;">
      你好 <strong>${safeUser}</strong>，请在页面中输入以下 6 位验证码完成密码重置：
    </p>
    <div style="margin:18px 0;padding:16px;background:#F3F1EA;border:1px solid rgba(15,118,110,0.28);border-radius:12px;text-align:center;">
      <span style="font-size:30px;font-weight:700;letter-spacing:0.24em;color:#0F766E;font-family:ui-monospace,Menlo,monospace;">${safeCode}</span>
    </div>
    <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#52525B;">
      验证码将在 <strong>${expiresMinutes} 分钟</strong>后失效，且仅可使用一次。请勿将验证码转发给他人。
    </p>
    <p style="margin:16px 0 0;padding-top:14px;border-top:1px solid rgba(24,24,27,0.08);font-size:12px;color:#71717A;">
      如非本人操作，直接忽略本邮件即可。此邮件由系统自动发送，请勿直接回复。
    </p>
  </div>
</body>
</html>`;

  return sendViaResend({ apiKey, from, to, subject, html, text, fetchImpl });
}

export async function sendEmailVerifyCodeEmail({
  apiKey,
  from,
  to,
  username,
  code,
  expiresMinutes = 15,
  fetchImpl = fetch,
}) {
  const safeUser = escapeHtml(username);
  const safeCode = escapeHtml(code);
  const subject = `【高词 · GoPrmpt】邮箱绑定验证码：${code}`;
  const text = [
    `你好 ${username}：`,
    '',
    `你正在为高词（GoPrmpt）账号绑定或更换邮箱，本次验证码为：${code}`,
    `验证码在 ${expiresMinutes} 分钟内有效，请勿泄露给他人。`,
    '',
    '如果这不是你的操作，请忽略此邮件，你的账号信息不会被修改。',
    '高词 · GoPrmpt (https://goprmpt.net)',
  ].join('\n');

  const html = `<!doctype html>
<html lang="zh-CN">
<body style="margin:0;padding:24px;background:#FAF9F5;color:#18181B;font-family:'PingFang SC','Microsoft YaHei',-apple-system,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid rgba(24,24,27,0.09);border-radius:16px;padding:28px;">
    <div style="font-size:13px;font-weight:700;color:#0F766E;letter-spacing:0.03em;margin-bottom:8px;">高词 · GoPrmpt</div>
    <h1 style="margin:0 0 12px;font-size:20px;color:#18181B;">验证你的绑定邮箱</h1>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#52525B;">
      你好 <strong>${safeUser}</strong>，请在页面中输入以下 6 位验证码以完成邮箱绑定或更换：
    </p>
    <div style="margin:18px 0;padding:16px;background:#F3F1EA;border:1px solid rgba(15,118,110,0.28);border-radius:12px;text-align:center;">
      <span style="font-size:30px;font-weight:700;letter-spacing:0.24em;color:#0F766E;font-family:ui-monospace,Menlo,monospace;">${safeCode}</span>
    </div>
    <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#52525B;">
      验证码将在 <strong>${expiresMinutes} 分钟</strong>后失效，且仅可使用一次。请勿将验证码转发给他人。
    </p>
    <p style="margin:16px 0 0;padding-top:14px;border-top:1px solid rgba(24,24,27,0.08);font-size:12px;color:#71717A;">
      如非本人操作，直接忽略本邮件即可。此邮件由系统自动发送，请勿直接回复。
    </p>
  </div>
</body>
</html>`;

  return sendViaResend({ apiKey, from, to, subject, html, text, fetchImpl });
}

export async function sendTestEmail({ apiKey, from, to, fetchImpl = fetch }) {
  const subject = '【高词 · GoPrmpt】Resend 邮件发信配置测试成功';
  const text = '恭喜，高词（GoPrmpt）的 Resend 邮件发信通道已连通，用户现在可以使用邮箱验证码自助重置密码。';
  const html = `<!doctype html>
<html lang="zh-CN">
<body style="margin:0;padding:24px;background:#FAF9F5;color:#18181B;font-family:'PingFang SC','Microsoft YaHei',-apple-system,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid rgba(24,24,27,0.09);border-radius:16px;padding:28px;">
    <div style="font-size:13px;font-weight:700;color:#0F766E;margin-bottom:8px;">高词 · GoPrmpt</div>
    <h1 style="margin:0 0 12px;font-size:19px;color:#18181B;">Resend 邮件通道测试成功</h1>
    <p style="margin:0;font-size:14px;line-height:1.6;color:#52525B;">
      你的 Resend API Key 与发信域名已正确生效，现在工作台和管理后台均已启用「邮箱验证码自助重置密码」。
    </p>
  </div>
</body>
</html>`;

  return sendViaResend({ apiKey, from, to, subject, html, text, fetchImpl });
}

export async function sendAnnouncementEmail({
  apiKey,
  from,
  to,
  username = '',
  announcement,
  fetchImpl = fetch,
}) {
  const typeMeta = getAnnouncementTypeMeta(announcement?.type);
  const title = String(announcement?.title ?? '');
  const content = String(announcement?.content ?? '');
  const linkUrl = typeof announcement?.linkUrl === 'string' && announcement.linkUrl ? announcement.linkUrl : null;
  const linkText =
    typeof announcement?.linkText === 'string' && announcement.linkText.trim()
      ? announcement.linkText.trim()
      : '查看详情';

  const safeBadge = escapeHtml(typeMeta.label);
  const safeTitle = escapeHtml(title);
  const safeContentHtml = escapeHtml(content).replace(/\r\n|\r|\n/g, '<br />');
  const safeUser = username ? escapeHtml(username) : '';

  const subject = `【高词 · GoPrmpt · ${typeMeta.label}】${title}`;
  const textLines = [
    username ? `你好 ${username}：` : '你好：',
    '',
    `[${typeMeta.label}] ${title}`,
    '',
    content,
  ];
  if (linkUrl) {
    textLines.push('', `${linkText}：${linkUrl}`);
  }
  textLines.push('', '高词 · GoPrmpt (https://goprmpt.net)');
  const text = textLines.join('\n');

  const greetingHtml = safeUser
    ? `<p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#52525B;">你好 <strong>${safeUser}</strong>，</p>`
    : '';

  const ctaHtml = linkUrl
    ? `<div style="margin:22px 0 6px;">
      <a href="${escapeHtml(linkUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:11px 22px;background:#0F766E;color:#FAF9F5;border-radius:10px;text-decoration:none;font-size:14px;font-weight:600;">${escapeHtml(linkText)}</a>
    </div>`
    : '';

  const html = `<!doctype html>
<html lang="zh-CN">
<body style="margin:0;padding:24px;background:#FAF9F5;color:#18181B;font-family:'PingFang SC','Microsoft YaHei',-apple-system,sans-serif;">
  <div style="max-width:540px;margin:0 auto;background:#FFFFFF;border:1px solid rgba(24,24,27,0.09);border-radius:16px;padding:28px;">
    <div style="margin-bottom:12px;">
      <span style="font-size:13px;font-weight:700;color:#0F766E;letter-spacing:0.03em;">高词 · GoPrmpt</span>
      <span style="display:inline-block;margin-left:8px;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:600;background:${typeMeta.emailBadgeBg};color:${typeMeta.emailBadgeColor};">${safeBadge}</span>
    </div>
    <h1 style="margin:0 0 14px;font-size:20px;line-height:1.4;color:#18181B;">${safeTitle}</h1>
    ${greetingHtml}
    <div style="margin:0 0 16px;padding:16px 18px;background:#FAF9F5;border:1px solid rgba(24,24,27,0.08);border-radius:12px;font-size:14px;line-height:1.75;color:#27272A;">
      ${safeContentHtml}
    </div>
    ${ctaHtml}
    <p style="margin:20px 0 0;padding-top:14px;border-top:1px solid rgba(24,24,27,0.08);font-size:12px;line-height:1.6;color:#71717A;">
      此通知来自高词（GoPrmpt）官方工作台：<a href="https://goprmpt.net" style="color:#0F766E;text-decoration:none;">goprmpt.net</a>。本邮件由系统自动发送，请勿直接回复。
    </p>
  </div>
</body>
</html>`;

  return sendViaResend({ apiKey, from, to, subject, html, text, fetchImpl });
}
