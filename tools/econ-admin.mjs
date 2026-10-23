#!/usr/bin/env node
/**
 * 刃影武库 · 管理工具（Cloudflare Worker 云端账号用）
 *
 * 用法：
 *   node tools/econ-admin.mjs codes <玉珏数> [张数]       生成玉珏兑换码（每张全服只能用一次）
 *   node tools/econ-admin.mjs log <昵称或 uid>            查这个账号的武库存档、处罚记录、最近 100 条流水
 *   node tools/econ-admin.mjs unban <昵称或 uid> [备注]    解封，清空处罚记录（玩家刷新网页后生效）
 *
 * 环境变量：
 *   ECON_CODE_SECRET   兑换码签名密钥，要和 Worker 上设的一样（生成兑换码不用联网）
 *   ADMIN_SECRET       管理口令，要和 Worker 上设的一样（查流水、解封用）
 *   RENYING_CLOUD_API  服务器地址，不设就用 https://renying.evengao6688.workers.dev
 */
import { createHmac, randomBytes } from 'node:crypto';
import process from 'node:process';

const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // 去掉了容易看错的 I O 0 1
const API = (process.env.RENYING_CLOUD_API || 'https://renying.evengao6688.workers.dev').replace(/\/+$/, '');
const [cmd, ...args] = process.argv.slice(2);

function die(msg) { console.error(msg); process.exit(1); }
function need(name) { const v = process.env[name]; if (!v) die(`先设好环境变量 ${name}（和 Cloudflare Worker 上设的一样）`); return v; }

// 和 cloudflare/worker.js 的 codeValue 对应：YJ-数额-6 位编号-10 位签名，签名是 HMAC-SHA256("YJ|数额|编号") 的前 10 个字节
function makeCode(secret, jade) {
  let id = '';
  for (const b of randomBytes(6)) id += B32[b & 31];
  const mac = createHmac('sha256', secret).update(`YJ|${jade}|${id}`).digest();
  let sig = '';
  for (let i = 0; i < 10; i++) sig += B32[mac[i] & 31];
  return `YJ-${jade}-${id}-${sig}`;
}

async function admin(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + need('ADMIN_SECRET') },
    body: body ? JSON.stringify(body) : undefined,
  }).catch(e => die(`连不上 ${API}：${e.message}`));
  const j = await res.json().catch(() => ({}));
  if (!res.ok) die(`服务器返回 ${res.status}：${j.error || j.err || '未知错误'}${res.status === 404 && !j.error ? '（Worker 是不是还没更新到带武库的版本？）' : ''}`);
  return j;
}

const time = t => t ? new Date(t).toLocaleString('zh-CN', { hour12: false }) : '-';

if (cmd === 'codes') {
  const jade = Math.floor(+args[0]), n = Math.floor(+(args[1] || 1));
  if (!(jade >= 1 && jade <= 20000)) die('玉珏数要在 1 到 20000 之间');
  if (!(n >= 1 && n <= 500)) die('张数要在 1 到 500 之间');
  const secret = need('ECON_CODE_SECRET');
  for (let i = 0; i < n; i++) console.log(makeCode(secret, jade));
} else if (cmd === 'log' || cmd === 'sanction') {
  if (!args[0]) die('用法：node tools/econ-admin.mjs log <昵称或 uid>');
  const j = await admin('GET', '/api/admin/econ?uid=' + encodeURIComponent(args[0]));
  console.log(`账号：${j.username}（${j.uid}）`);
  if (j.econ) {
    const s = j.econ.state || {};
    console.log(`墨锭 ${j.econ.ink} · 玉珏 ${s.jade || 0} · 钥匙 ${s.keys || 0} · 改名标签 ${s.tags || 0} · 饰品 ${(s.inv || []).length} 件 · 挂单 ${(s.lst || []).length} 个 · 存档版本 ${j.econ.ver} · 最后改动 ${time(j.econ.at)}`);
  } else console.log('还没有武库存档（没打开过武库，也没同步过存档）');
  const sc = j.sanction;
  if (sc && (sc.strikes || sc.perm || sc.banUntil)) {
    console.log(`处罚：第 ${sc.strikes} 次${sc.perm ? ' · 永久封号' : sc.banUntil > Date.now() ? ` · 封到 ${time(sc.banUntil)}` : ''}`);
    for (const x of sc.log || []) console.log(`  ${time(x.at)}  ${x.r || ''}${x.src ? `（${x.src}）` : ''}`);
  } else console.log('处罚：没有');
  console.log(`\n最近 ${j.log.length} 条流水（新的在上）：`);
  for (const r of j.log) {
    const ink = r.ink0 === null || r.ink0 === undefined ? '' : ` 墨锭 ${r.ink0}→${r.ink1}`;
    const jd = r.jade0 === null || r.jade0 === undefined || r.jade0 === r.jade1 ? '' : ` 玉珏 ${r.jade0}→${r.jade1}`;
    console.log(`  ${time(r.at)}  ${r.ok ? '  ' : '✗ '}${r.act}${ink}${jd}${r.detail ? '  ' + r.detail : ''}`);
  }
} else if (cmd === 'unban') {
  if (!args[0]) die('用法：node tools/econ-admin.mjs unban <昵称或 uid> [备注]');
  const j = await admin('POST', '/api/admin/pardon', { uid: args[0], note: args.slice(1).join(' ') });
  console.log(`已解封 ${j.uid}，玩家刷新网页后生效。`);
} else {
  console.log(`用法：
  node tools/econ-admin.mjs codes <玉珏数> [张数]       生成玉珏兑换码
  node tools/econ-admin.mjs log <昵称或 uid>            查武库存档、处罚记录、流水
  node tools/econ-admin.mjs unban <昵称或 uid> [备注]    解封`);
  if (cmd) process.exit(1);
}
