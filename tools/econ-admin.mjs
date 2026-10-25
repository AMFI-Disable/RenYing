#!/usr/bin/env node
/**
 * 刃影 · 管理命令行（Cloudflare Worker 云端账号用；网页版在 Worker 的 /admin，能做的事一样）
 *
 * 用法（<号> 写昵称或者账号编号 u_…；每一笔修改都要用 --why 写原因，记进流水）：
 *   node tools/econ-admin.mjs whoami                          口令对不对、流水里记成谁
 *   node tools/econ-admin.mjs stats                           总览：注册数、全服墨锭、市场、封禁
 *   node tools/econ-admin.mjs find [昵称开头]                  找账号；不填就列最近动过武库的
 *   node tools/econ-admin.mjs log <号>                        武库存档、处罚记录、市场记录、最近 100 条流水
 *   node tools/econ-admin.mjs adjust <号> <改动…> --why <原因>
 *        改动：ink=+500 或 ink=-200（墨锭）、c1=+2（武器箱 c1～c7）、term=+1（终端机）、tags=+1（改名标签）、
 *              give=qf_p1（发一件饰品）、give=gc_wolf@0（发斩数版，斩数从 0 开始）、take=12（收走库存里第 12 号）
 *   node tools/econ-admin.mjs ban <号> <天数|perm> --why <原因>
 *   node tools/econ-admin.mjs unban <号> --why <原因>
 *   node tools/econ-admin.mjs password <号> [--create] --why <原因>  重设密码（随机生成，只显示一次），这个号在别处的登录都退出；
 *        加 --create 时没有这个号就新建（dev 这类保留的昵称只能这样建）
 *   node tools/econ-admin.mjs gift <all|号> <内容…> --note <给玩家看的说明> [--days 14] [--new] [--why <原因>]
 *        内容：ink=500、c1=2、term=1、tags=1。all 只发给现在已经注册的号，加 --new 之后新注册的也能领
 *   node tools/econ-admin.mjs gifts                           发过的补偿
 *   node tools/econ-admin.mjs gift-off <补偿编号> --why <原因>   停发（已经领了的不收回）
 *   node tools/econ-admin.mjs cfg                             经济数值：现在用的、默认值、范围、最近改过的版本
 *   node tools/econ-admin.mjs cfg-set <键=值…> --why <原因>    改经济数值；值写 default 就回到默认（键看 cfg 列出来的）
 *   node tools/econ-admin.mjs cfg-undo <版本号|0> --why <原因>  退回到以前的一版，0 是全部回到默认值
 *   node tools/econ-admin.mjs audit                           管理员做过的事
 *
 * 环境变量：
 *   ADMIN_SECRET       管理口令：Worker 上 ADMIN_SECRET 的值；写成「名字:口令」的，这里只填冒号后面那一段（至少 16 位）
 *   RENYING_CLOUD_API  服务器地址，不设就用 https://renying.evengao6688.workers.dev
 */
import process from 'node:process';
import { randomBytes } from 'node:crypto';

const API = (process.env.RENYING_CLOUD_API || 'https://renying.evengao6688.workers.dev').replace(/\/+$/, '');
const [cmd, ...rest] = process.argv.slice(2);

function die(msg) { console.error(msg); process.exit(1); }
function need(name) { const v = process.env[name]; if (!v) die(`先设好环境变量 ${name}（和 Cloudflare Worker 上设的一样）`); return v; }
function secret() { const v = need('ADMIN_SECRET').trim(); if (v.length < 16) die('ADMIN_SECRET 至少要 16 位，短的服务器不认（用 openssl rand -hex 24 生成一个）'); return v; }

async function admin(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + secret() },
    body: body ? JSON.stringify(body) : undefined,
  }).catch(e => die(`连不上 ${API}：${e.message}`));
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.ok) die(`服务器返回 ${res.status}：${j.error || j.err || '未知错误'}${res.status === 404 && !j.error ? '（Worker 是不是还没更新到带管理后台的版本？）' : ''}`);
  return j;
}

// 参数：--why、--note、--days 后面跟一个值（也可以写成 --why=…），--new、--create 不跟值；其余的按顺序放进 pos
function parse(list) {
  const pos = [], o = {};
  for (let i = 0; i < list.length; i++) {
    const a = list[i], m = /^--(why|note|days)(?:=(.*))?$/s.exec(a);
    if (a === '--new') o.new = true;
    else if (a === '--create') o.create = true;
    else if (m) o[m[1]] = m[2] !== undefined ? m[2] : list[++i];
    else pos.push(a);
  }
  return { pos, o };
}
const { pos, o } = parse(rest);
const why = () => { const w = String(o.why || '').trim(); if (w.length < 2) die('要用 --why 写上原因（至少 2 个字），会记进流水'); return w; };
const int = (v, what) => { const n = Number(String(v).replace(/^\+/, '')); if (!Number.isInteger(n)) die(`${what} 要写整数：${v}`); return n; };
const time = t => t ? new Date(t).toLocaleString('zh-CN', { hour12: false }) : '-';
const ago = t => { if (!t) return '-'; const s = (Date.now() - t) / 1000; return s < 3600 ? Math.max(1, Math.round(s / 60)) + ' 分钟前' : s < 86400 ? Math.round(s / 3600) + ' 小时前' : Math.round(s / 86400) + ' 天前'; };
const stuff = d => [d.ink ? `墨锭 ${d.ink > 0 ? '+' : ''}${d.ink}` : '', ...Object.entries(d.cases || {}).map(([c, n]) => `${c} ${n > 0 ? '+' : ''}${n}`),
  d.term ? `终端机 ${d.term > 0 ? '+' : ''}${d.term}` : '', d.tags ? `改名标签 ${d.tags > 0 ? '+' : ''}${d.tags}` : ''].filter(Boolean).join('，');
// 墨锭、武器箱、终端机、改名标签：ink=500 c1=2 term=1 tags=1（adjust 还认 give= 和 take=）
function amounts(list, withItems) {
  const b = { ink: 0, cases: {}, term: 0, tags: 0, give: [], take: [] };
  for (const a of list) {
    const m = /^([a-z0-9_]+)=(.+)$/.exec(a);
    if (!m) die(`看不懂「${a}」：要写成 ink=500、c1=2 这样`);
    const [, k, v] = m;
    if (k === 'ink' || k === 'term' || k === 'tags') b[k] += int(v, k);
    else if (/^c[0-9]+$/.test(k)) b.cases[k] = (b.cases[k] || 0) + int(v, k);
    else if (withItems && k === 'give') { const [key, st] = v.split('@'); b.give.push({ k: key, st: st === undefined ? -1 : int(st, '斩数') }); }
    else if (withItems && k === 'take') b.take.push(int(v.replace(/^#/, ''), '饰品编号'));
    else die(`不认识「${k}」：能写 ink、c1～c7、term、tags${withItems ? '、give、take' : ''}`);
  }
  return b;
}

if (cmd === 'whoami') {
  const j = await admin('GET', '/api/admin/whoami');
  console.log(`口令对了。流水里记成：${j.who}（服务器时间 ${time(j.now)}）`);
} else if (cmd === 'stats') {
  const j = await admin('GET', '/api/admin/stats');
  console.log(`注册账号 ${j.users}（今天新注册 ${j.newToday}）· 有武库存档的 ${j.accounts} · 全服墨锭 ${j.inkTotal}`);
  console.log(`玩家市场在卖 ${j.open} 单 · 24 小时成交 ${j.deals24} 单、${j.dealInk24} 墨锭 · 封禁中 ${j.banned} 个号 · 经济数值 ${j.cfgId ? `第 ${j.cfgId} 版` : '默认'}`);
} else if (cmd === 'find') {
  const j = await admin('GET', '/api/admin/find?q=' + encodeURIComponent(pos[0] || ''));
  if (!j.users.length) console.log('没找到');
  for (const u of j.users) console.log(`  ${u.username}  ${u.id}  墨锭 ${u.ink === null || u.ink === undefined ? '-' : u.ink}  上次动武库 ${ago(u.updated_at)}  注册 ${time(u.created_at)}`);
} else if (cmd === 'log' || cmd === 'sanction') {
  if (!pos[0]) die('用法：node tools/econ-admin.mjs log <昵称或 uid>');
  const j = await admin('GET', '/api/admin/econ?uid=' + encodeURIComponent(pos[0]));
  console.log(`账号：${j.username}（${j.uid}）· 注册 ${time(j.createdAt)}`);
  if (j.econ) {
    const s = j.econ.state || {};
    const cases = Object.entries(s.cases || {}).filter(([, n]) => n > 0).map(([c, n]) => `${c}×${n}`).join(' ') || '没有';
    console.log(`墨锭 ${j.econ.ink} · 武器箱 ${cases}（今天开了 ${(s.od && s.od.n) || 0} 个，本周开了 ${(s.pw && s.pw.n) || 0} 个神兵武器箱）· 终端机 ${(s.term || 0) + (s.tm ? 1 : 0)} 台 · 改名标签 ${s.tags || 0} · 挂单 ${(s.lst || []).length} 个 · 存档版本 ${j.econ.ver} · 最后改动 ${time(j.econ.at)}`);
    const inv = s.inv || [];
    console.log(`饰品 ${inv.length} 件${inv.length ? '：' + inv.map(x => `#${x.i} ${x.k}${x.st >= 0 ? `（斩数 ${x.st}）` : ''}`).join('，') : ''}`);
  } else console.log('还没有武库存档（没打开过武库，也没同步过存档）');
  const sc = j.sanction;
  if (sc && (sc.strikes || sc.perm || sc.banUntil)) {
    console.log(`处罚：第 ${sc.strikes} 次${sc.perm ? ' · 永久封号' : sc.banUntil > Date.now() ? ` · 封到 ${time(sc.banUntil)}` : ''}`);
    for (const x of sc.log || []) console.log(`  ${time(x.at)}  ${x.r || ''}${x.src ? `（${x.src}）` : ''}`);
  } else console.log('处罚：没有');
  if (Array.isArray(j.mkt) && j.mkt.length) {
    console.log(`\n玩家市场最近 ${j.mkt.length} 单（新的在上）：`);
    const st = ['在卖', '卖掉了', '撤下了'];
    for (const m of j.mkt) console.log(`  ${time(m.at)}  ${m.seller === j.uid ? '卖' : '买'}  ${m.k}${m.st >= 0 ? `（斩数 ${m.st}）` : ''}  ${m.price} 墨锭  ${st[m.state] || m.state}${m.state === 1 ? `${m.paid ? '' : '，卖家还没结账'} · ${time(m.done_at)}` : ''}`);
  }
  console.log(`\n最近 ${j.log.length} 条流水（新的在上）：`);
  for (const r of j.log) {
    const ink = r.ink0 === null || r.ink0 === undefined ? '' : ` 墨锭 ${r.ink0}→${r.ink1}`;
    console.log(`  ${time(r.at)}  ${r.ok ? '  ' : '✗ '}${r.act}${ink}${r.detail ? '  ' + r.detail : ''}`);
  }
} else if (cmd === 'adjust') {
  if (!pos[0] || pos.length < 2) die('用法：node tools/econ-admin.mjs adjust <号> ink=+500 c1=+2 give=qf_p1 take=12 --why <原因>');
  const b = amounts(pos.slice(1), true), w = why();
  const j = await admin('POST', '/api/admin/adjust', { uid: pos[0], ...b, why: w });
  console.log(`改好了 ${j.uid}：墨锭 ${j.ink} · 终端机 ${j.term} · 改名标签 ${j.tags} · 武器箱 ${Object.entries(j.cases).filter(([, n]) => n > 0).map(([c, n]) => `${c}×${n}`).join(' ') || '没有'}`);
  for (const x of j.given || []) console.log(`  发了 #${x.i} ${x.k}${x.st >= 0 ? `（斩数 ${x.st}）` : ''}`);
  for (const x of j.taken || []) console.log(`  收了 #${x.i} ${x.k}`);
} else if (cmd === 'ban') {
  if (!pos[0] || !pos[1]) die('用法：node tools/econ-admin.mjs ban <号> <天数|perm> --why <原因>');
  const perm = pos[1] === 'perm', w = why();
  const j = await admin('POST', '/api/admin/ban', perm ? { uid: pos[0], perm: true, why: w } : { uid: pos[0], days: int(pos[1], '天数'), why: w });
  console.log(j.perm ? `已永久封号 ${j.uid}` : `已封号 ${j.uid}，到 ${time(j.banUntil)}`);
} else if (cmd === 'password') {
  if (!pos[0]) die('用法：node tools/econ-admin.mjs password <号> [--create] --why <原因>');
  const pw = randomBytes(15).toString('base64url');   // 20 位随机密码，只在这里显示一次
  const j = await admin('POST', '/api/admin/password', { uid: pos[0], password: pw, create: !!o.create, why: why() });
  console.log(`${j.created ? '建好了账号' : '重设好了'} ${j.username}（${j.uid}）。新密码：${pw}`);
  console.log('只显示这一次，先记下来。这个号在别处的登录都退出了。');
} else if (cmd === 'unban') {
  if (!pos[0]) die('用法：node tools/econ-admin.mjs unban <号> --why <原因>');
  const j = await admin('POST', '/api/admin/pardon', { uid: pos[0], why: String(o.why || pos.slice(1).join(' ')).trim() });
  console.log(`已解封 ${j.uid}，玩家刷新网页后生效。`);
} else if (cmd === 'gift') {
  if (!pos[0] || pos.length < 2 || !o.note) die('用法：node tools/econ-admin.mjs gift <all|号> ink=500 c1=2 --note <给玩家看的说明> [--days 14] [--new] [--why <原因>]');
  const b = amounts(pos.slice(1), false);
  const j = await admin('POST', '/api/admin/gift', { to: pos[0], ink: b.ink, cases: b.cases, term: b.term, tags: b.tags, days: o.days === undefined ? 14 : int(o.days, '天数'), newToo: !!o.new, note: o.note, why: o.why || '' });
  console.log(`补偿发出去了（编号 ${j.id}），${time(j.until)} 之前登录或者打开武库就能领。`);
} else if (cmd === 'gifts') {
  const j = await admin('GET', '/api/admin/gifts');
  if (!j.gifts.length) console.log('还没发过补偿');
  for (const g of j.gifts) {
    const state = g.off ? '停发了' : g.until <= j.now ? '过期了' : '发放中';
    console.log(`  ${g.id}  ${state}  「${g.note}」  发给 ${g.uid === '*' ? '所有人' : g.username || g.uid}  ${stuff({ ink: g.ink, ...g.items }) || '-'}  领了 ${g.got}  ${g.by} 发于 ${time(g.at)}，截止 ${time(g.until)}`);
  }
} else if (cmd === 'gift-off') {
  if (!pos[0]) die('用法：node tools/econ-admin.mjs gift-off <补偿编号> --why <原因>');
  await admin('POST', '/api/admin/gift/off', { id: pos[0], why: why() });
  console.log('停发了。已经领了的不收回。');
} else if (cmd === 'cfg') {
  const j = await admin('GET', '/api/admin/cfg');
  console.log(j.id ? `现在用的是第 ${j.id} 版` : '现在用的都是默认值');
  let g = '';
  for (const [k, def, lo, hi, isInt, group, desc] of j.info) {
    if (group !== g) console.log(`\n${g = group}`);
    const cur = Object.prototype.hasOwnProperty.call(j.cfg, k) ? j.cfg[k] : def;
    console.log(`  ${k.padEnd(11)} ${String(cur).padEnd(8)}${cur !== def ? `（默认 ${def}）` : ''}  ${desc}，范围 ${lo}～${hi}${isInt ? '，整数' : ''}`);
  }
  if (j.hist.length) {
    console.log('\n最近改过的版本：');
    for (const h of j.hist) console.log(`  第 ${h.id} 版  ${h.by}  ${time(h.at)}  ${h.note}  ${Object.entries(h.cfg).map(([k, v]) => `${k}=${v}`).join(' ') || '全是默认值'}`);
  }
} else if (cmd === 'cfg-set') {
  if (!pos.length) die('用法：node tools/econ-admin.mjs cfg-set price.c1=300 fee=0.1 --why <原因>（值写 default 就回到默认）');
  const set = {};
  for (const a of pos) {
    const m = /^([a-zA-Z0-9.]+)=(.+)$/.exec(a);
    if (!m) die(`看不懂「${a}」：要写成 price.c1=300 这样`);
    set[m[1]] = m[2] === 'default' ? null : Number(m[2]);
    if (set[m[1]] !== null && !Number.isFinite(set[m[1]])) die(`${m[1]} 要写数字：${m[2]}`);
  }
  const j = await admin('POST', '/api/admin/cfg', { set, why: why() });
  console.log(`保存好了，现在是第 ${j.id} 版（半分钟内全服生效）：${Object.entries(j.cfg).map(([k, v]) => `${k}=${v}`).join(' ') || '全是默认值'}`);
} else if (cmd === 'cfg-undo') {
  if (pos[0] === undefined) die('用法：node tools/econ-admin.mjs cfg-undo <版本号|0> --why <原因>');
  const j = await admin('POST', '/api/admin/cfg/undo', { to: int(pos[0], '版本号'), why: why() });
  console.log(`退回好了，存成第 ${j.id} 版：${Object.entries(j.cfg).map(([k, v]) => `${k}=${v}`).join(' ') || '全是默认值'}`);
} else if (cmd === 'audit') {
  const j = await admin('GET', '/api/admin/audit');
  if (!j.rows.length) console.log('还没有管理员操作');
  for (const r of j.rows) {
    let d = {};
    try { d = JSON.parse(r.detail) || {}; } catch (e) {}
    const what = r.act === 'admin' ? [stuff(d), ...(d.give || []).map(x => '发 ' + x), ...(d.take || []).map(x => '收 ' + x)].filter(Boolean).join('，')
      : r.act === 'admin_ban' ? (d.days === 'perm' ? '永久封号' : `封 ${d.days} 天`) : r.act === 'admin_pw' ? (d.created ? '建号' : '重设密码') : r.act === 'gift_new' ? stuff(d) : r.act === 'cfg' ? (d.set ? Object.entries(d.set).map(([k, v]) => `${k}=${v === null ? 'default' : v}`).join(' ') : d.undo ? `退回到第 ${d.undo} 版` : '全部回到默认值') : '';
    console.log(`  ${time(r.at)}  ${d.by || '-'}  ${r.act}  ${r.uid === '*' ? '全服' : r.username || r.uid}${what ? '  ' + what : ''}  原因：${d.why || '-'}`);
  }
} else {
  console.log(`用法（<号> 写昵称或者账号编号；修改都要 --why 写原因）：
  node tools/econ-admin.mjs whoami | stats | audit
  node tools/econ-admin.mjs find [昵称开头]
  node tools/econ-admin.mjs log <号>
  node tools/econ-admin.mjs adjust <号> ink=+500 c1=+2 term=+1 tags=+1 give=qf_p1 give=gc_wolf@0 take=12 --why <原因>
  node tools/econ-admin.mjs ban <号> <天数|perm> --why <原因>
  node tools/econ-admin.mjs unban <号> --why <原因>
  node tools/econ-admin.mjs password <号> [--create] --why <原因>
  node tools/econ-admin.mjs gift <all|号> ink=500 c1=2 --note <给玩家看的说明> [--days 14] [--new] [--why <原因>]
  node tools/econ-admin.mjs gifts
  node tools/econ-admin.mjs gift-off <补偿编号> --why <原因>
  node tools/econ-admin.mjs cfg
  node tools/econ-admin.mjs cfg-set price.c1=300 fee=0.1 --why <原因>
  node tools/econ-admin.mjs cfg-undo <版本号|0> --why <原因>
网页版：${API}/admin`);
  if (cmd) process.exit(1);
}
