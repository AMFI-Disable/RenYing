/**
 * Cloudflare Worker for RenYing (刃影) Cloud Accounts & Profile Sync
 *
 * Requirements:
 *   - Bind a D1 database named "DB" to this worker.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}

function error(message, status = 400) {
  return json({ ok: false, error: message }, status);
}

// SHA-256 password hash with salt
async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const data = enc.encode(salt + ':' + password + ':renying_sword_salt_2026');
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Generate crypto-secure token
function generateToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Extract bearer token from Authorization header
function getBearerToken(request) {
  const auth = request.headers.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  return null;
}

// Authenticate session from token
async function authenticate(env, request) {
  const token = getBearerToken(request);
  if (!token) return null;

  const now = Date.now();
  const session = await env.DB.prepare(
    'SELECT user_id, expires_at FROM sessions WHERE token = ? AND expires_at > ?'
  ).bind(token, now).first();

  if (!session) return null;

  const user = await env.DB.prepare(
    'SELECT id, username, profile_json FROM users WHERE id = ?'
  ).bind(session.user_id).first();

  if (!user) return null;

  return { token, user };
}

export default {
  async fetch(request, env) {
    if (!env.DB) {
      return error('D1 Database binding "DB" is missing in Worker configuration.', 500);
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // 1. Health & ping check
      if (path === '/' || path === '/health' || path === '/api/health') {
        return json({ ok: true, name: 'RenYing Cloud API', time: Date.now() });
      }

      // 2. Register
      if (path === '/api/register' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const username = String(body.username || '').trim();
        const password = String(body.password || '');

        if (!username || username.length < 2) {
          return error('昵称至少需要 2 个字符');
        }
        if (username.length > 20) {
          return error('昵称不能超过 20 个字符');
        }
        if (!password || password.length < 6) {
          return error('密码至少需要 6 个字符');
        }

        // Check if user already exists
        const existing = await env.DB.prepare(
          'SELECT id FROM users WHERE username = ?'
        ).bind(username).first();

        if (existing) {
          return error('该昵称已被注册，请直接点击“登录”');
        }

        const userId = 'u_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
        const salt = crypto.randomUUID().slice(0, 12);
        const passHash = await hashPassword(password, salt);
        const now = Date.now();

        // Default or initial guest profile
        const initialProf = (body.profile && typeof body.profile === 'object') ? body.profile : {
          name: username,
          ink: 100,
          owned: ['qingfeng'],
          frags: {},
          pity: 0,
          spity: 0,
          skins: [],
          equip: {},
          netWins: 0,
          netLosses: 0,
          rating: 1100,
          placed: 0,
          stageStars: {},
          updatedAt: now
        };
        initialProf.name = username;
        initialProf.updatedAt = now;

        await env.DB.prepare(
          'INSERT INTO users (id, username, password_hash, salt, profile_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(userId, username, passHash, salt, JSON.stringify(initialProf), now, now).run();

        // Generate session token (valid for 30 days)
        const token = generateToken();
        const expiresAt = now + 30 * 24 * 3600 * 1000;
        await env.DB.prepare(
          'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
        ).bind(token, userId, now, expiresAt).run();

        return json({
          ok: true,
          uid: userId,
          username,
          token,
          profile: initialProf
        });
      }

      // 3. Login
      if (path === '/api/login' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const username = String(body.username || '').trim();
        const password = String(body.password || '');

        if (!username || !password) {
          return error('请输入昵称和密码');
        }

        const user = await env.DB.prepare(
          'SELECT id, username, password_hash, salt, profile_json FROM users WHERE username = ?'
        ).bind(username).first();

        if (!user) {
          return error('未找到该账号，请先点击“注册”', 404);
        }

        const checkHash = await hashPassword(password, user.salt);
        if (checkHash !== user.password_hash) {
          return error('昵称或密码不对', 401);
        }

        const now = Date.now();
        const token = generateToken();
        const expiresAt = now + 30 * 24 * 3600 * 1000;

        await env.DB.prepare(
          'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
        ).bind(token, user.id, now, expiresAt).run();

        let profile = null;
        try {
          profile = JSON.parse(user.profile_json);
        } catch (e) {
          profile = { name: user.username, ink: 100, owned: ['qingfeng'], updatedAt: now };
        }

        return json({
          ok: true,
          uid: user.id,
          username: user.username,
          token,
          profile
        });
      }

      // 4. Get Profile
      if (path === '/api/profile' && request.method === 'GET') {
        const auth = await authenticate(env, request);
        if (!auth) {
          return error('未登录或登录已过期，请重新登录', 401);
        }

        let profile = null;
        try {
          profile = JSON.parse(auth.user.profile_json);
        } catch (e) {
          profile = { name: auth.user.username, ink: 100, owned: ['qingfeng'] };
        }

        return json({
          ok: true,
          uid: auth.user.id,
          username: auth.user.username,
          profile
        });
      }

      // 5. Update Profile (Sync)
      if (path === '/api/profile' && request.method === 'POST') {
        const auth = await authenticate(env, request);
        if (!auth) {
          return error('未登录或登录已过期，请重新登录', 401);
        }

        const body = await request.json().catch(() => ({}));
        const newProf = body.profile || body;
        if (!newProf || typeof newProf !== 'object') {
          return error('无效的存档数据');
        }

        newProf.name = auth.user.username;
        const now = Date.now();
        newProf.updatedAt = now;

        await env.DB.prepare(
          'UPDATE users SET profile_json = ?, updated_at = ? WHERE id = ?'
        ).bind(JSON.stringify(newProf), now, auth.user.id).run();

        return json({
          ok: true,
          updatedAt: now
        });
      }

      // 6. Logout
      if (path === '/api/logout' && request.method === 'POST') {
        const token = getBearerToken(request);
        if (token) {
          await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
        }
        return json({ ok: true });
      }

      return error('Not found', 404);
    } catch (err) {
      console.error('Worker error:', err);
      return error('服务器内部错误: ' + err.message, 500);
    }
  }
};
