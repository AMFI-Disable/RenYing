#!/usr/bin/env node
/**
 * 刃影武库 · 管理工具（Cloudflare Worker 云端账号用）
 *
 * 用法：
 *   node tools/econ-admin.mjs log <昵称或 uid>            查这个账号的武库存档、处罚记录、最近 100 条流水
 *   node tools/econ-admin.mjs unban <昵称或 uid> [备注]    解封，清空处罚记录（玩家刷新网页后生效）
 *
 * 环境变量：
 *   ADMIN_SECRET       管理口令，要和 Worker 上设的一样（查流水、解封用）
 *   RENYING_CLOUD_API  服务器地址，不设就用 https://renying.evengao6688.workers.dev
 */
import process from 'node:process';

const API = (process.env.RENYING_CLOUD_API || 'https://renying.evengao6688.workers.dev').replace(/\/+$/, '');
const [cmd, ...args] = process.argv.slice(2);

function die(msg) { console.error(msg); process.exit(1); }
function need(name) { const v = process.env[name]; if (!v) die(`先设好环境变量 ${name}（和 Cloudflare Worker 上设的一样）`); return v; }

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

if (cmd === 'log' || cmd === 'sanction') {
  if (!args[0]) die('用法：node tools/econ-admin.mjs log <昵称或 uid>');
  const j = await admin('GET', '/api/admin/econ?uid=' + encodeURIComponent(args[0]));
  console.log(`账号：${j.username}（${j.uid}）`);
  if (j.econ) {
    const s = j.econ.state || {};
    const cases = Object.values(s.cases || {}).reduce((a, n) => a + (+n || 0), 0);
    console.log(`墨锭 ${j.econ.ink} · 武器箱 ${cases} 个（今天开了 ${(s.od && s.od.n) || 0} 个，本周开了 ${(s.pw && s.pw.n) || 0} 个神兵武器箱）· 终端机 ${(s.term || 0) + (s.tm ? 1 : 0)} 台 · 改名标签 ${s.tags || 0} · 饰品 ${(s.inv || []).length} 件 · 挂单 ${(s.lst || []).length} 个 · 存档版本 ${j.econ.ver} · 最后改动 ${time(j.econ.at)}`);
  } else console.log('还没有武库存档（没打开过武库，也没同步过存档）');
  const sc = j.sanction;
  if (sc && (sc.strikes || sc.perm || sc.banUntil)) {
    console.log(`处罚：第 ${sc.strikes} 次${sc.perm ? ' · 永久封号' : sc.banUntil > Date.now() ? ` · 封到 ${time(sc.banUntil)}` : ''}`);
    for (const x of sc.log || []) console.log(`  ${time(x.at)}  ${x.r || ''}${x.src ? `（${x.src}）` : ''}`);
  } else console.log('处罚：没有');
  console.log(`\n最近 ${j.log.length} 条流水（新的在上）：`);
  for (const r of j.log) {
    const ink = r.ink0 === null || r.ink0 === undefined ? '' : ` 墨锭 ${r.ink0}→${r.ink1}`;
    console.log(`  ${time(r.at)}  ${r.ok ? '  ' : '✗ '}${r.act}${ink}${r.detail ? '  ' + r.detail : ''}`);
  }
} else if (cmd === 'unban') {
  if (!args[0]) die('用法：node tools/econ-admin.mjs unban <昵称或 uid> [备注]');
  const j = await admin('POST', '/api/admin/pardon', { uid: args[0], note: args.slice(1).join(' ') });
  console.log(`已解封 ${j.uid}，玩家刷新网页后生效。`);
} else {
  console.log(`用法：
  node tools/econ-admin.mjs log <昵称或 uid>            查武库存档、处罚记录、流水
  node tools/econ-admin.mjs unban <昵称或 uid> [备注]    解封`);
  if (cmd) process.exit(1);
}
