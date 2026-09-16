const express = require('express');
const path = require('path');

const app = express();
app.disable('x-powered-by');
app.use(express.urlencoded({ extended: false, limit: '8kb' }));

const PORT = Number(process.env.PORT || 3000);
const RELAY_TOKEN = String(process.env.BEGET_RELAY_PATH_TOKEN || '');
const DETIGO_SETUP_TOKEN = String(process.env.DETIGO_BEGET_SETUP_TOKEN || '');
const BEGET_LOGIN = String(process.env.BEGET_LOGIN || 'upmillre').trim();
const DETIGO_TARGET = String(process.env.DETIGO_BEGET_TARGET || 'https://www.deti-go.ru/secure/beget');
const RELAY_PATH = RELAY_TOKEN ? `/beget/${RELAY_TOKEN}` : '/beget-disabled';

function esc(v) {
  return String(v || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function page(title, body) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title><style>body{font-family:system-ui,-apple-system,sans-serif;background:#f4f6f8;color:#111;margin:0}.w{max-width:520px;margin:0 auto;padding:28px 16px}.c{background:#fff;border-radius:18px;padding:22px;box-shadow:0 8px 30px #0001}h1{margin:0 0 12px;font-size:28px}input,button{width:100%;box-sizing:border-box;font-size:20px;padding:15px;margin-top:12px;border-radius:12px;border:1px solid #bbb}button{background:#111;color:#fff;font-weight:700}.muted{font-size:14px;color:#666;line-height:1.45}.ok{color:#087a2f;font-weight:700}.err{color:#a00;font-weight:700}</style></head><body><div class="w"><div class="c"><h1>${esc(title)}</h1>${body}</div></div></body></html>`;
}
function sendHtml(res, status, title, body) {
  res.status(status).set({
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
  }).type('html').send(page(title, body));
}

app.get('/health', (_req, res) => res.json({ ok: true, relay_ready: Boolean(RELAY_TOKEN && DETIGO_SETUP_TOKEN && BEGET_LOGIN) }));

app.get(RELAY_PATH, (_req, res) => {
  if (!RELAY_TOKEN || !DETIGO_SETUP_TOKEN) return sendHtml(res, 503, 'Недоступно', '<p class="err">Форма временно недоступна.</p>');
  return sendHtml(res, 200, 'Пароль Beget', `<p>Логин уже сохранён: <b>${esc(BEGET_LOGIN)}</b></p><form method="post" action="${esc(RELAY_PATH)}"><input type="password" name="password" autocomplete="current-password" spellcheck="false" placeholder="Пароль Beget" required><button type="submit">Сохранить пароль</button></form><p class="muted">Пароль не сохраняется на этом сайте. Он сразу передаётся по HTTPS в защищённое хранилище Deti Go.</p>`);
});

app.post(RELAY_PATH, async (req, res) => {
  if (!RELAY_TOKEN || !DETIGO_SETUP_TOKEN) return sendHtml(res, 503, 'Недоступно', '<p class="err">Форма временно недоступна.</p>');
  const password = String(req.body?.password || '');
  if (password.length < 4 || password.length > 512) return sendHtml(res, 400, 'Проверь пароль', '<p class="err">Пароль выглядит неверно.</p>');
  try {
    const body = new URLSearchParams({ t: DETIGO_SETUP_TOKEN, username: BEGET_LOGIN, password });
    const upstream = await fetch(DETIGO_TARGET, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(20000)
    });
    const text = await upstream.text();
    if (!upstream.ok || !/Готово|сохран/i.test(text)) throw new Error(`upstream_${upstream.status}`);
    return sendHtml(res, 200, 'Готово', '<p class="ok">Пароль Beget сохранён в защищённом хранилище.</p><p>Окно можно закрыть. В чат пароль отправлять не нужно.</p>');
  } catch (_e) {
    return sendHtml(res, 502, 'Не удалось сохранить', '<p class="err">Связь с защищённым хранилищем не прошла. Пароль нигде не сохранён. Попробуй ещё раз через минуту.</p>');
  }
});

app.use(express.static(__dirname));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, '::', () => console.log(`Server running on port ${PORT}`));
