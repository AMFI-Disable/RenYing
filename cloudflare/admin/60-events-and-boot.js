const VIEWS = { home: vHome, players: vPlayers, gifts: vGifts, codes: vCodes, flags: vFlags, maint: vMaint, auth: vAuth, audit: vAudit, errors: vErrors, play: vPlay, admins: vAdmins };
const AFTER = { players: drawGives, gifts: drawGiftGives, codes: drawCodeGives };
let adminEditRevision = 0, adminDirty = false, auditResetBusy = false;
$('#main').addEventListener('input', () => { adminDirty = true; adminEditRevision++; });
$('#main').addEventListener('change', () => { adminDirty = true; adminEditRevision++; });
async function render(auto = false) {
  const main = $('#main');
  if (auto && (auditResetBusy || adminDirty || main.contains(document.activeElement) || main.querySelector('details[open]'))) return;
  if (!auto) adminDirty = false;
  const revision = adminEditRevision, seq = ++S.seq, tab = S.tab, previousPlayer = S.p;
  if (!auto) paint(main, H`<p class="loading">读取中…</p>`);
  try {
    const view = await VIEWS[tab]();
    if (seq !== S.seq) return;
    if (auto && (adminDirty || revision !== adminEditRevision || main.contains(document.activeElement) || main.querySelector('details[open]'))) { S.p = previousPlayer; return; }   // 不覆盖正在编辑的内容
    paint(main, view);
    if (AFTER[tab]) AFTER[tab]();
  } catch (e) {
    if (!auto && seq === S.seq && S.who) paint(main, H`<div class="card err"><span>${e.message}</span><button class="btn ghost sm" data-act="reload">再试一次</button></div>`);
  }
}
function route() {
  const m = location.hash.slice(1).split('/');
  S.tab = VIEWS[m[0]] && (m[0] !== 'admins' || S.role === 'all') ? m[0] : 'home';
  let uid = '';
  try { uid = S.tab === 'players' && m[1] ? decodeURIComponent(m[1]) : ''; } catch (e) {}
  if (uid !== S.uid) window.scrollTo(0, 0);
  S.uid = uid;
  for (const b of document.querySelectorAll('.tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === S.tab));
  render();
}
function go(tab, uid) {
  const h = '#' + tab + (uid ? '/' + encodeURIComponent(uid) : '');
  if (location.hash === h) route(); else location.hash = h;
}
window.addEventListener('hashchange', () => { if (S.who) route(); });

/* ---------- ⌘K 全局快捷命令面板 ---------- */
const CMD_LIST = [
  { label: '跳转到：总览看板', hint: '#home', run: () => go('home') },
  { label: '跳转到：玩家管理与多列排序', hint: '#players', run: () => go('players') },
  { label: '跳转到：玩家 → 财富榜 Top', hint: 'filter:wealth', run: () => { S.pFilter = 'wealth'; S.pOffset = 0; go('players'); } },
  { label: '跳转到：玩家 → 有反作弊记过 (strikes > 0)', hint: 'filter:flagged', run: () => { S.pFilter = 'flagged'; S.pOffset = 0; go('players'); } },
  { label: '跳转到：玩家 → 24h 活跃玩家', hint: 'filter:active24h', run: () => { S.pFilter = 'active24h'; S.pOffset = 0; go('players'); } },
  { label: '跳转到：发补偿（含快捷模板）', hint: '#gifts', run: () => go('gifts') },
  { label: '跳转到：兑换码（含快捷模板）', hint: '#codes', run: () => go('codes') },
  { label: '跳转到：功能开关 (Feature Flags)', hint: '#flags', run: () => go('flags') },
  { label: '跳转到：世界共斗与数据库维护', hint: '#maint', run: () => go('maint') },
  { label: '跳转到：登录记录', hint: '#auth', run: () => go('auth') },
  { label: '跳转到：操作记录与智能归档', hint: '#audit', run: () => go('audit') },
  { label: '跳转到：错误日志与 AI 诊断导出', hint: '#errors', run: () => go('errors') },
  { label: '打开 Dev 开发者测试账号', hint: 'player:Dev', run: () => go('players', 'Dev') },
];
function openCmdPalette() {
  if (!S.who) return;
  const d = $('#cmdDlg');
  paint(d, H`<div class="dlg-b">
    <h3>⌘K 快捷命令与跳转</h3>
    <label class="f">输入功能名称，或直接输入「玩家名字 / UID」按回车直达<input id="cmdIn" placeholder="例如：维护、错误、财富榜、或者输入玩家名字…" autocomplete="off"></label>
    <div id="cmdItems" class="cmd-list"></div>
  </div>
  <div class="dlg-f"><button type="button" class="btn ghost sm" id="cmdClose">关闭 (Esc)</button></div>`);
  const input = $('#cmdIn', d), box = $('#cmdItems', d);
  const drawList = () => {
    const q = input.value.trim().toLowerCase();
    const matches = CMD_LIST.filter(c => !q || c.label.toLowerCase().includes(q) || c.hint.toLowerCase().includes(q));
    const rows = matches.map(c => H`<button type="button" class="cmd-item" data-cidx="${CMD_LIST.indexOf(c)}"><span>${c.label}</span><small class="mono">${c.hint}</small></button>`);
    if (q) {
      rows.unshift(H`<button type="button" class="cmd-item" data-search-q="${input.value.trim()}"><span>🔍 搜索玩家：「<b>${input.value.trim()}</b>」</span><small class="mono">回车直达</small></button>`);
    }
    paint(box, rows.length ? rows : H`<p class="empty">无匹配命令</p>`);
  };
  drawList();
  input.oninput = drawList;
  input.onkeydown = e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const first = box.querySelector('.cmd-item');
      if (first) first.click();
    }
  };
  box.onclick = e => {
    const btn = e.target.closest('.cmd-item');
    if (!btn) return;
    d.close();
    if (btn.dataset.cidx !== undefined) {
      const c = CMD_LIST[+btn.dataset.cidx];
      if (c) c.run();
    } else {
      S.q = input.value.trim();
      S.pFilter = '';
      S.pOffset = 0;
      go('players');
    }
  };
  $('#cmdClose', d).onclick = () => d.close();
  d.onclick = e => { if (e.target === d) d.close(); };
  d.showModal();
  input.focus();
}
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    if (!S.who) return;
    e.preventDefault();
    const d = $('#cmdDlg');
    if (d && d.open) d.close(); else openCmdPalette();
  }
});

/* ---------- 按钮 ---------- */
const ACTS = {
  tab: b => go(b.dataset.tab),
  open: b => go('players', b.dataset.uid),
  back: () => go('players'),
  reload: () => render(),
  cmdk: () => openCmdPalette(),
  errkind: b => { S.errKind = b.dataset.k; render(); },
  exporterrs: b => busy(b, async () => {
    const fmt = b.dataset.fmt || 'json';
    const kind = S.errKind || '';
    const qs = 'format=' + encodeURIComponent(fmt) + (kind ? '&kind=' + encodeURIComponent(kind) : '');
    let r;
    try { r = await fetch('/api/admin/errors/export?' + qs, { headers: { Authorization: 'Bearer ' + S.tok }, cache: 'no-store' }); }
    catch (e) { throw new Error('连不上服务器，检查一下网络'); }
    if (r.status === 401) { logout('管理登录过期了，请重新登录'); return; }
    if (!r.ok) { let j = {}; try { j = await r.json(); } catch (e) {} throw new Error(j.error || '出错了（' + r.status + '）'); }
    const name = (/filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') || '') || [])[1] || ('renying-errors-debug.' + fmt);
    const url = URL.createObjectURL(await r.blob()), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('已导出错误调试文件：' + name);
  }),
  errdel: async b => {
    const sig = b.dataset.sig;
    const a = await ask({ title: '清除该条错误记录', lines: ['签名：' + sig, '若该问题已修复，清除后可观察是否还会再次触发'], whyInit: '已修复，清除旧报错', ok: '清除', danger: true });
    if (a) await busy(b, async () => { const r = await api('errors/delete', { sig, why: a.why }); toast('已清除 ' + fmtN(r.deleted || 0) + ' 条错误'); render(); });
  },
  errclean: async b => {
    const days = +b.dataset.days || 0;
    const rawK = b.dataset.k !== undefined ? b.dataset.k : (S.errKind || '');
    const kind = rawK === 'all' ? '' : rawK;
    const all = b.dataset.all === '1' || b.dataset.k !== undefined;
    const a = await ask({
      title: all ? (kind ? '清空「' + (ERR_KIND[kind] || kind) + '」全部错误' : '清空全部错误记录') : '清理 ' + days + ' 天前的旧错误',
      lines: [all ? '将删除当前筛选范围内的所有错误记录' : '将删除最后发生时间早于 ' + days + ' 天前的错误记录'],
      whyInit: '清理历史错误日志', ok: '确认清理', danger: true
    });
    if (a) await busy(b, async () => { const r = await api('errors/delete', { olderThanDays: days, all, kind, why: a.why }); toast('已清理 ' + fmtN(r.deleted || 0) + ' 条错误记录'); render(); });
  },
  logout: () => { api('logout', {}).catch(() => {}); logout(); },
  renew: b => busy(b, async () => {
    const r = await api('refresh', {});
    S.exp = Date.now() + (r.expiresIn || 3600) * 1000;
    clearTimeout(S.expT);
    S.expT = setTimeout(() => { if (S.who) logout('管理登录 1 小时到了，请重新登录'); }, (r.expiresIn || 3600) * 1000);
    saveSession();
    updateTimer();
    toast('已续期 1 小时');
  }),
  toggleauto: b => {
    S.auto = !S.auto;
    b.setAttribute('aria-pressed', String(S.auto));
    b.textContent = S.auto ? '自动刷新: 30秒' : '自动刷新: 关';
    clearInterval(S.autoT);
    if (S.auto) {
      S.autoT = setInterval(() => { if (S.who && !$('#dlg').open && !$('#cmdDlg').open) render(true); }, 30000);
      toast('已开启 30 秒自动刷新');
    } else {
      toast('已关闭自动刷新');
    }
  },
  delview: b => { S.del = b.dataset.v; S.pFilter = b.dataset.v === '1' ? 'deleted' : ''; S.pOffset = 0; render(); },
  fltview: b => {
    S.pFilter = b.dataset.f;
    S.del = S.pFilter === 'deleted' ? '1' : '';
    S.pOffset = 0;
    render();
  },
  psort: b => {
    const s = b.dataset.col || b.dataset.sort;
    if (S.pSort === s) S.pDir = S.pDir === 'asc' ? 'desc' : 'asc';
    else { S.pSort = s; S.pDir = s === 'username' ? 'asc' : 'desc'; }
    S.pOffset = 0;
    render();
  },
  clearsearch: () => {
    S.q = '';
    S.pOffset = 0;
    render();
  },
  page: b => {
    S.pOffset = Math.max(0, S.pOffset + (+b.dataset.dir) * S.pLimit);
    render();
  },
  gifttpl: b => {
    const tpl = GIFT_TPLS[+b.dataset.i], f = $('form[data-form=gift]');
    if (!tpl || !f) return;
    f.elements.ink.value = tpl.ink || 0;
    f.elements.term.value = tpl.term || 0;
    f.elements.tags.value = tpl.tags || 0;
    f.elements.days.value = tpl.days || 14;
    f.elements.note.value = tpl.note || '';
    for (const c of CAT.caseIds) if (f.elements['gc_' + c]) f.elements['gc_' + c].value = (tpl.cases && tpl.cases[c]) || tpl[c] || 0;
    toast('已填入模板：' + tpl.label);
  },
  codetpl: b => {
    const tpl = CODE_TPLS[+b.dataset.i], f = $('form[data-form=code]');
    if (!tpl || !f) return;
    f.elements.code.value = tpl.code || '';
    f.elements.ink.value = tpl.ink || 0;
    f.elements.term.value = tpl.term || 0;
    f.elements.tags.value = tpl.tags || 0;
    f.elements.uses.value = tpl.uses || 100;
    f.elements.days.value = tpl.days || 14;
    f.elements.note.value = tpl.note || '';
    for (const c of CAT.caseIds) if (f.elements['cc_' + c]) f.elements['cc_' + c].value = (tpl.cases && tpl.cases[c]) || tpl[c] || 0;
    toast('已填入模板：' + tpl.label);
  },
  addgiftgive: () => {
    const f = $('form[data-form=gift]'), k = f.elements.gk.value;
    if (!k) return toast('先选一件饰品', true);
    if (S.giftSkins.length >= 20) return toast('一次最多附赠 20 件饰品', true);
    const n = Number(f.elements.gstn.value || 0);
    if (f.elements.gst.checked && !(Number.isInteger(n) && n >= 0 && n <= 1e7)) return toast('斩数要填 0 到 10000000 的整数', true);
    S.giftSkins.push({ k, st: f.elements.gst.checked ? n : -1 });
    drawGiftGives();
  },
  delgiftgive: b => { S.giftSkins.splice(+b.dataset.i, 1); drawGiftGives(); },
  addcodegive: () => {
    const f = $('form[data-form=code]'), k = f.elements.ck.value;
    if (!k) return toast('先选一件饰品', true);
    if (S.codeSkins.length >= 20) return toast('一次最多附赠 20 件饰品', true);
    const n = Number(f.elements.cstn.value || 0);
    if (f.elements.cst.checked && !(Number.isInteger(n) && n >= 0 && n <= 1e7)) return toast('斩数要填 0 到 10000000 的整数', true);
    S.codeSkins.push({ k, st: f.elements.cst.checked ? n : -1 });
    drawCodeGives();
  },
  delcodegive: b => { S.codeSkins.splice(+b.dataset.i, 1); drawCodeGives(); },
  batch: async b => {
    const f = b.form, op = b.dataset.op, uids = [...f.querySelectorAll('input[name=pick]:checked')].map(x => x.value);
    if (!uids.length) return toast('先勾上要处理的号', true);
    const perm = f.elements.perm.checked, days = numIn(f, 'days');
    if (op === 'ban' && !perm && !(Number.isInteger(days) && days >= 1 && days <= 3650)) return toast('封几天要填 1 到 3650 的整数', true);
    const names = uids.map(id => (S.found.find(u => u.id === id) || {}).username || id);
    await batchOp(b, op, uids, names, { perm, days });
  },
  delone: b => batchOp(b, 'delete', [S.p.uid], [S.p.username]),
  restoreone: b => batchOp(b, 'restore', [S.p.uid], [S.p.username]),
  export: b => busy(b, async () => {
    const qs = 'q=' + encodeURIComponent(S.q) + (S.pFilter === 'deleted' ? '&del=1' : '');
    let r;
    try { r = await fetch('/api/admin/export?' + qs, { headers: { Authorization: 'Bearer ' + S.tok }, cache: 'no-store' }); }
    catch (e) { throw new Error('连不上服务器，检查一下网络'); }
    if (r.status === 401) { logout('管理登录过期了，请重新登录'); return; }
    if (!r.ok) { let j = {}; try { j = await r.json(); } catch (e) {} throw new Error(j.error || '出错了（' + r.status + '）'); }
    const name = (/filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') || '') || [])[1] || 'renying-users.csv';
    const url = URL.createObjectURL(await r.blob()), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('导出好了：' + name);
  }),
  exportplayer: b => busy(b, async () => {
    const uid = S.p && S.p.uid;
    if (!uid) return;
    let r;
    try { r = await fetch('/api/admin/player/export?uid=' + encodeURIComponent(uid), { headers: { Authorization: 'Bearer ' + S.tok }, cache: 'no-store' }); }
    catch (e) { throw new Error('连不上服务器，检查一下网络'); }
    if (r.status === 401) { logout('管理登录过期了，请重新登录'); return; }
    if (!r.ok) { let j = {}; try { j = await r.json(); } catch (e) {} throw new Error(j.error || '出错了（' + r.status + '）'); }
    const name = (/filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') || '') || [])[1] || ('renying-player-' + uid + '.json');
    const url = URL.createObjectURL(await r.blob()), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('已导出玩家完整快照：' + name);
  }),
  dropdev: async b => {
    const p = S.p, dev = b.dataset.dev || 'all';
    const a = await ask({
      title: dev === 'all' ? '强制踢下全部设备' : '强制下线设备 ' + dev,
      lines: ['目标玩家：' + p.username, dev === 'all' ? '将清除该玩家所有设备会话与旧版 Token，需重新密码登录' : '将移除设备 ' + dev + ' 的登录会话'],
      whyInit: '安全协助下线设备', ok: '强制下线', danger: true
    });
    if (a) await busy(b, async () => { await api('player/devices/drop', { uid: p.uid, dev, why: a.why }); toast('已强制下线'); render(); });
  },
  clearhist: async b => {
    const p = S.p, kind = b.dataset.kind || b.dataset.k;
    const label = kind === 'sanctions' ? '处罚与记过记录' : kind === 'econ_log' ? '个人经济流水' : '个人登录日志';
    const a = await ask({
      title: '清理 ' + p.username + ' 的' + label,
      lines: ['只清理历史流水或反作弊记过，不影响玩家当前墨锭与库存存档', '本次清理操作本身会记入后台审计流水'],
      whyInit: '清理测试/误报历史记录', ok: '确认清理', danger: true
    });
    if (a) await busy(b, async () => { const r = await api('player/clear-history', { uid: p.uid, kind, why: a.why }); toast('已清理 ' + fmtN(r.deleted || 0) + ' 条记录'); render(); });
  },
  mktcancel: async b => {
    const p = S.p, id = b.dataset.id;
    const a = await ask({
      title: '强制撤下市场挂单 #' + String(id).slice(0, 8),
      lines: ['卖家：' + p.username, '撤单后玩家打开武库同步时会自动领回该饰品'],
      whyInit: '违规标价/协助撤单', ok: '强制撤单', danger: true
    });
    if (a) await busy(b, async () => { await api('mkt/cancel', { id, why: a.why }); toast('已撤下挂单'); render(); });
  },
  clearaudit: () => { S.auditAct = ''; S.auditBy = ''; S.auditBefore = 0; S.auditBeforeAt = 0; S.auditStack = []; render(); },
  scanlost: b => busy(b, async () => { const scan = { scanned: 0, matches: [] }; let after = ''; do { const r = await api('lost/scan' + (after ? '?after=' + encodeURIComponent(after) : '')); scan.scanned += r.scanned; scan.matches.push(...r.matches); after = r.next || ''; b.textContent = '扫描中：' + scan.scanned + ' 个账号'; } while (after); S.lostScan = scan; await render(); }),
  selectlostaccounts: b => { const boxes = [...b.closest('.card').querySelectorAll('input[name=lostAccount]')]; const all = boxes.every(x => x.checked); boxes.forEach(x => { x.checked = !all; }); b.textContent = all ? '全选账号' : '取消全选'; adminDirty = true; adminEditRevision++; },
  restoreunknown: async b => {
    const scan = S.lostScan; if (!scan || !scan.matches.length) return;
    const selected = new Set([...b.closest('.card').querySelectorAll('input[name=lostAccount]:checked')].map(x => x.value));
    const chosen = scan.matches.filter(x => selected.has(x.uid));
    if (!chosen.length) return toast('请先选择账号', true);
    const count = chosen.reduce((n, x) => n + x.ids.length, 0);
    const a = await ask({ title: '找回所选账号去向不明的饰品', lines: ['将为 ' + chosen.length + ' 个账号找回 ' + count + ' 件有获得记录、但没有去向记录的饰品。', '每批重新核对库存与流水；已恢复或正常离开的饰品不会重复发放。'], whyInit: '找回流水中去向不明的饰品', ok: '全部找回' });
    if (!a) return;
    await busy(b, async () => { let done = 0; try { for (const x of chosen) { while (x.ids.length) { const r = await api('restore', { uid: x.uid, ids: x.ids.slice(0, 50), onlyUnknown: true, why: a.why }); done += r.items.length; x.ids.splice(0, 50); b.textContent = '已找回 ' + done + ' 件'; } } toast('已找回 ' + done + ' 件'); } finally { scan.matches = scan.matches.filter(x => x.ids.length); await render(); } });
  },
  restoreselect: b => { const boxes = [...b.closest('form').querySelectorAll('input[name=restore]')]; const all = boxes.every(x => x.checked); boxes.forEach(x => { x.checked = !all; }); b.textContent = all ? '全选可找回' : '取消全选'; adminDirty = true; adminEditRevision++; },
  auditresetreasons: async b => {
    if (auditResetBusy) return;
    const a = await ask({ title: '恢复默认原因', lines: ['将全部管理员操作记录的原因设为“管理操作：操作类型”，包括当前筛选或分页以外的记录。', '原始原因会保留在每条记录中，供展开查看；无法读取的记录会跳过。'], whyInit: '管理操作：恢复默认原因', ok: '恢复默认' });
    if (!a) return;
    auditResetBusy = true;
    await busy(b, async () => {
      let after = 0, snapshot = 0, changed = 0, skipped = 0, conflicts = 0;
      try {
        for (;;) {
          const r = await api('audit/reset-reasons', { after, snapshot, why: a.why });
          snapshot = r.snapshot; changed += r.changed; skipped += r.skipped; conflicts += r.conflicts;
          b.textContent = '已恢复 ' + changed + ' 条';
          if (!r.nextAfter) break;
          after = r.nextAfter;
        }
        toast('已恢复 ' + changed + ' 条' + (skipped || conflicts ? '；跳过 ' + skipped + ' 条，冲突 ' + conflicts + ' 条，可重试' : ''));
      } catch (e) { throw new Error('已恢复 ' + changed + ' 条，后续处理失败：' + e.message); }
      finally { auditResetBusy = false; await render(); }
    });
  },
  auditnext: b => { const before = Number(b.dataset.before), at = Number(b.dataset.beforeAt); if (before > 0 && at > 0) { S.auditStack.push({ before: S.auditBefore, at: S.auditBeforeAt }); S.auditBefore = before; S.auditBeforeAt = at; render(); } },
  auditprev: () => { if (S.auditStack.length) { const p = S.auditStack.pop(); S.auditBefore = p.before; S.auditBeforeAt = p.at; render(); } },
  auditcompact: async b => {
    const mode = b.dataset.mode || '';
    const days = b.dataset.days !== undefined ? +b.dataset.days : (mode === 'all' ? 7 : mode === 'routine' ? 1 : 0);
    const a = await ask({
      title: days > 0 ? '智能归档 ' + days + ' 天前的管理操作记录' : '按天智能归档全部历史管理记录',
      lines: [
        '系统会自动按天检测并统计管理员分布、操作类型次数、净墨锭变动及关键操作摘要，合并为一条「智能归档摘要 (adm_digest)」',
        '合并后原始零散记录将被折叠移除，大幅精简审计表体积'
      ],
      whyInit: '定期智能归档管理员流水', ok: '执行归档'
    });
    if (a) await busy(b, async () => {
      const r = await api('audit/compact', { olderThanDays: days, mode, why: a.why });
      toast(r.compacted ? '已将 ' + fmtN(r.compacted) + ' 条记录智能归档为 ' + (r.days || r.digests || 1) + ' 条每日摘要' : (r.msg || '暂无需要归档的多余记录'));
      render();
    });
  },
  worldact: async b => {
    const op = b.dataset.op;
    const label = op === 'gboss_reroll' ? '重随全服天魔词缀' : op === 'gboss_next' ? '直接讨伐进入下一代天魔' : '推进全服岁史至下一节点';
    const a = await ask({ title: label, lines: ['此操作将直接改变全服共斗/岁史实时状态'], whyInit: label, ok: '执行', danger: op === 'gboss_next' });
    if (a) await busy(b, async () => { await api('world/act', { op, why: a.why }); toast('已执行：' + label); render(); });
  },
  maintprune: async b => {
    const target = b.dataset.target || b.dataset.t;
    const a = await ask({
      title: '数据库清理 (' + target + ')',
      lines: ['清理过期缓存、旧防重号或 30 天前的普通玩家流水/登录日志，释放 D1 存储空间'],
      whyInit: '例行数据库巡检清理', ok: '执行清理', danger: true
    });
    if (a) await busy(b, async () => { const r = await api('maint/prune', { target, why: a.why }); toast('清理完成，共移除 ' + fmtN(r.deleted || 0) + ' 行'); render(); });
  },
  admedit: b => { S.admEdit = b.dataset.name; render(); },
  admnew: () => { S.admEdit = ''; render(); },
  copy: b => { if (navigator.clipboard) navigator.clipboard.writeText(b.dataset.v).then(() => toast('复制好了'), () => toast('复制不了，手动选一下吧', true)); },
  addgive: () => {
    const f = $('form[data-form=adjust]'), k = f.elements.gk.value;
    if (!k) return toast('先选一件饰品', true);
    if (S.give.length >= Object.keys(CAT.items).length) return toast('单次发放数量不能超过饰品总数', true);
    const n = Number(f.elements.gstn.value || 0);
    if (f.elements.gst.checked && !(Number.isInteger(n) && n >= 0 && n <= 1e7)) return toast('斩数要填 0 到 10000000 的整数', true);
    S.give.push({ k, st: f.elements.gst.checked ? n : -1 });
    drawGives();
  },
  markallgive: () => {
    const f = $('form[data-form=adjust]'), n = Number(f.elements.gstn.value || 0);
    if (!(Number.isInteger(n) && n >= 0 && n <= 1e7)) return toast('斩数要填 0 到 10000000 的整数', true);
    f.elements.gst.checked = true;
    for (const item of S.give) item.st = n;
    drawGives();
    toast(S.give.length ? `已将清单中的 ${S.give.length} 件饰品设为斩数版` : '已启用斩数版；接下来加入清单的饰品会使用斩数版');
  },
  addsetgive: () => {
    const f = $('form[data-form=adjust]'), selected = f.elements.gset.value;
    if (!selected) return toast('先选一套饰品', true);
    const keys = CAT.caseIds.filter(c => selected === 'all' || c === selected).flatMap(c => CAT.order.flatMap(t =>
      Object.values(CAT.items).filter(x => x.col === c && x.tier === t).map(x => x.k)));
    if (!keys.length) return toast('这套里没有饰品', true);
    if (S.give.length + keys.length > Object.keys(CAT.items).length) return toast('单次发放数量不能超过饰品总数', true);
    const n = Number(f.elements.gstn.value || 0);
    if (f.elements.gst.checked && !(Number.isInteger(n) && n >= 0 && n <= 1e7)) return toast('斩数要填 0 到 10000000 的整数', true);
    const st = f.elements.gst.checked ? n : -1;
    S.give.push(...keys.map(k => ({ k, st })));
    drawGives();
    toast(`已将 ${keys.length} 件饰品加入清单`);
  },
  delgive: b => { S.give.splice(+b.dataset.i, 1); drawGives(); },
  lost: b => busy(b, async () => { const r = await api('lost?uid=' + encodeURIComponent(S.p.uid)); S.lost = { uid: S.p.uid, items: r.items }; render(); }),
  genpw: b => {   // 15 个随机字节 → 20 位，只用字母、数字、- 和 _
    const a = new Uint8Array(15);
    crypto.getRandomValues(a);
    const el = b.form.elements.pw;
    el.value = btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_');
    el.select();
  },
  pardon: async b => {
    const p = S.p, a = await ask({ title: '解封 ' + p.username, lines: ['清空处罚记录（记过次数归零），玩家刷新网页后就能正常同步、交易'], ok: '解封' });
    if (a) await busy(b, async () => { await api('pardon', { uid: p.uid, why: a.why }); toast('解封了'); render(); });
  },
  giftoff: async b => {
    const g = S.gifts.find(x => x.id === b.dataset.id);
    if (!g) return;
    const a = await ask({ title: '停发这份补偿', lines: ['“' + g.note + '”：' + giftText(g), '已经领了的 ' + fmtN(g.got) + ' 个账号不收回，还没领的就领不到了'], ok: '停发', danger: true });
    if (a) await busy(b, async () => { await api('gift/off', { id: g.id, why: a.why }); toast('停发了'); render(); });
  },
  codeoff: async b => {
    const c = S.codes.find(x => x.code === b.dataset.code);
    if (!c) return;
    const a = await ask({ title: '停用兑换码 ' + c.code, lines: ['“' + c.note + '”：' + giftText(c), '已经领了的 ' + fmtN(c.got) + ' 个号不收回，还没领的就领不到了'], ok: '停用', danger: true });
    if (a) await busy(b, async () => { await api('code/off', { code: c.code, why: a.why }); toast('停用了'); render(); });
  },
  unlockall: async b => {
    const p = S.p; if (!p) return;
    const a = await ask({ title: '为 ' + p.username + ' 一键全满配', lines: ['将解锁全部紫金武学徽记、仙兽灵宠、全部侠客二式架势与全招式流派'], whyInit: '管理操作：一键全满配', ok: '确认发放' });
    if (a) await busy(b, async () => { await api('adjust', { uid: p.uid, unlockAll: true, why: a.why }); toast('已为 ' + p.username + ' 解锁全满配'); render(); });
  },
  bannerreset: async b => {
    const a = await ask({ title: '恢复内置默认启动横幅', lines: ['将清空云端自定义横幅，玩家首页恢复显示客户端内置最新版本公告'], whyInit: '恢复默认启动更新横幅', ok: '恢复默认' });
    if (a) await busy(b, async () => { await api('banner', { tag: '', title: '', items: [], why: a.why }); toast('已恢复客户端内置默认横幅'); render(); });
  },
  flagset: async b => {
    const f = S.flags.find(x => x.k === b.dataset.k), mode = b.dataset.mode;
    if (!f) return;
    const a = await ask({ title: '改功能开关 ' + f.k, lines: [f.desc, FLAG_MODE[f.mode] + ' → ' + FLAG_MODE[mode]], ok: '改', danger: mode === 'all' });
    if (a) await busy(b, async () => { await api('flags', { k: f.k, mode, why: a.why }); toast('改好了'); render(); });
  },
};
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled || !ACTS[b.dataset.act]) return;
  e.preventDefault();
  ACTS[b.dataset.act](b);
});
document.addEventListener('change', e => {
  if (e.target.matches('[data-act=pagesize]')) {
    S.pLimit = +e.target.value;
    S.pOffset = 0;
    render();
    return;
  }
  const f = e.target.form;
  if (e.target.matches('[data-pickall]')) for (const x of f.querySelectorAll('input[name=pick]')) x.checked = e.target.checked;
  if (f && f.dataset.form === 'gift' && e.target.name === 'to') {
    const one = e.target.value === 'one';
    $('[data-one]', f).classList.toggle('hidden', !one);
    $('[data-all]', f).classList.toggle('hidden', one);
    if (one) f.elements.user.focus();
  }
});

/* ---------- 表单 ---------- */
const FORMS = {
  batch: () => {},   // 回车不提交：批量要点下面的按钮
  admin: async f => {
    const E = f.elements, name = E.name.value.trim(), role = E.role.value, pw = E.pw.value, old = S.admins.find(a => a.name === S.admEdit);
    if (!/^[A-Za-z0-9_\-\u4e00-\u9fa5]{2,20}$/.test(name)) return toast('名字要 2 到 20 个字（字母、数字、汉字、_、-）', true);
    if ((!old || pw) && (pw.length < 12 || pw.length > 128)) return toast('密码要 12 到 128 位', true);
    const body = { name, role }, lines = [];
    if (old) {
      const off = E.off.checked;
      if (role !== old.role) lines.push('角色：' + ROLE[old.role] + ' → ' + ROLE[role]);
      if (pw) { body.password = pw; lines.push('新密码：' + pw, '先把它记下来，保存以后这里不再显示'); }
      if (off !== !!old.disabled) { body.disabled = off; lines.push(off ? '停用这个账号' : '重新启用这个账号'); }
      if (!lines.length) return toast('没有改动', true);
      if (pw || off) lines.push(name + ' 已经登录的网页会马上失效');
    } else {
      body.password = pw;
      lines.push('角色：' + ROLE[role], '密码：' + pw, '先把它记下来，建好以后这里不再显示');
    }
    const a = await ask({ title: old ? '改管理员 ' + name : '建管理员账号 ' + name, lines, ok: old ? '保存' : '建账号', danger: role === 'all' && (!old || old.role !== 'all') });
    if (a) await busy(submitBtn(f), async () => { await api('admins', { ...body, why: a.why }); toast(old ? '改好了' : '建好了，' + name + ' 可以登录了'); S.admEdit = ''; render(); });
  },
  find: f => { S.q = f.elements.q.value.trim().slice(0, 64); S.pOffset = 0; render(); },
  authq: f => { S.aq = f.elements.q.value.trim().slice(0, 64); S.aact = f.elements.act.value; render(); },
  auditq: f => { S.auditAct = f.elements.act.value; S.auditBy = f.elements.by.value.trim().slice(0, 40); S.auditBefore = 0; S.auditBeforeAt = 0; S.auditStack = []; render(); },
  gbosshp: async f => {
    const hp = numIn(f, 'hp'), maxHp = numIn(f, 'maxHp');
    if (!Number.isInteger(hp) || hp < 0) return toast('血量要填非负整数', true);
    const a = await ask({ title: '调整全服天魔血量', lines: ['当前血量设为：' + fmtN(hp) + (maxHp > 0 ? '，上限设为：' + fmtN(maxHp) : '')], whyInit: '调试/活动调整天魔血量', ok: '保存' });
    if (a) await busy(submitBtn(f), async () => { await api('world/act', { op: 'gboss_hp', hp, maxHp: maxHp > 0 ? maxHp : undefined, why: a.why }); toast('天魔血量已更新'); render(); });
  },
  adjust: async f => {
    const p = S.p, e = p.econ, s = (e && e.state) || {}, cases = s.cases || {}, inv = s.inv || [];
    const body = { uid: p.uid, ink: numIn(f, 'ink'), cases: {}, term: numIn(f, 'term'), tags: numIn(f, 'tags'), give: S.give.slice(),
      take: [...f.querySelectorAll('input[name=take]:checked')].map(x => Number(x.value)) };
    for (const c of CAT.caseIds) { const n = numIn(f, 'case_' + c); if (n) body.cases[c] = n; }
    if ([body.ink, body.term, body.tags, ...Object.values(body.cases)].some(v => !Number.isInteger(v))) return toast('数量要填整数', true);
    const ink0 = e ? e.ink : 0, lines = [];
    if (body.ink) lines.push('墨锭 ' + sign(body.ink) + '（' + fmtN(ink0) + ' → ' + fmtN(ink0 + body.ink) + '）');
    for (const [c, n] of Object.entries(body.cases)) lines.push(caseName(c) + ' ' + sign(n) + '（' + (+cases[c] || 0) + ' → ' + ((+cases[c] || 0) + n) + '）');
    if (body.term) lines.push('货郎 ' + sign(body.term) + '（' + (+s.term || 0) + ' → ' + ((+s.term || 0) + body.term) + '）');
    if (body.tags) lines.push('改名标签 ' + sign(body.tags) + '（' + (+s.tags || 0) + ' → ' + ((+s.tags || 0) + body.tags) + '）');
    for (const g of body.give) lines.push('发：' + itemName(g.k) + '（' + heroOf(g.k) + '）' + (g.st >= 0 ? ' 斩数版，斩数 ' + g.st : ''));
    for (const i of body.take) { const it = inv.find(x => x.i === i); lines.push('收走：#' + i + ' ' + (it ? itemName(it.k) + '（' + heroOf(it.k) + '）' : '')); }
    if (!lines.length) return toast('什么都没填，没有要改的', true);
    const a = await ask({ title: '修改 ' + p.username, lines, ok: '确定修改' });
    if (a) await busy(submitBtn(f), async () => { const r = await api('adjust', { ...body, why: a.why }); toast('改好了：' + p.username + ' 现在有 ' + fmtN(r.ink) + ' 墨锭'); render(); });
  },
  restore: async f => {
    const p = S.p, ids = [...f.querySelectorAll('input[name=restore]:checked')].map(x => Number(x.value));
    if (!ids.length) return toast('先勾上要找回的饰品', true);
    const L = S.lost.items, lines = ids.map(i => { const x = L.find(y => y.i === i) || {}; return '找回：#' + i + ' ' + itemName(x.k) + '（' + heroOf(x.k) + '）' + (x.st >= 0 ? ' 斩数版' : '') + '，' + (LOST_TEXT[x.why] || ''); });
    const a = await ask({ title: '给 ' + p.username + ' 找回饰品', lines: [...lines, '放回库存，原来的编号空着就用原来的；每件只能找回一次'], ok: '确定找回' });
    if (a) await busy(submitBtn(f), async () => { let n = 0; try { for (let i = 0; i < ids.length; i += 50) { const r = await api('restore', { uid: p.uid, ids: ids.slice(i, i + 50), why: a.why }); n += r.items.length; } toast('找回了 ' + n + ' 件'); } finally { if (n) { S.lost = null; await render(); } } });
  },
  ban: async f => {
    const p = S.p, perm = f.elements.perm.checked, days = numIn(f, 'days');
    if (!perm && !(Number.isInteger(days) && days >= 1 && days <= 3650)) return toast('封几天要填 1 到 3650 的整数', true);
    const a = await ask({ title: '封号 ' + p.username, lines: [perm ? '永久封号' : '封 ' + days + ' 天（到 ' + fmtT(Date.now() + days * 864e5) + '）', '封禁期间不能同步存档、不能交易'], ok: '封号', danger: true });
    if (a) await busy(submitBtn(f), async () => { await api('ban', perm ? { uid: p.uid, perm: true, why: a.why } : { uid: p.uid, days, why: a.why }); toast('封了'); render(); });
  },
  pw: async f => {
    const p = S.p, pw = f.elements.pw.value;
    if (pw.length < 12 || pw.length > 128) return toast('新密码要 12 到 128 位', true);
    const a = await ask({ title: '重设 ' + p.username + ' 的密码', lines: ['新密码：' + pw, '先把它记下来，重设以后这里不再显示', '这个号在所有设备上的登录都会退出，要用新密码重新登录'], ok: '重设密码', danger: true });
    if (a) await busy(submitBtn(f), async () => { await api('password', { uid: p.uid, password: pw, why: a.why }); toast('密码重设好了，' + p.username + ' 在别处的登录都退出了'); render(); });
  },
  mkdev: async f => {
    const pw = f.elements.pw.value;
    if (pw.length < 12 || pw.length > 128) return toast('密码要 12 到 128 位', true);
    const a = await ask({ title: '建 Dev 账号', lines: ['密码：' + pw, '先把它记下来，建好以后这里不再显示'], ok: '建号' });
    if (a) await busy(submitBtn(f), async () => { const r = await api('password', { uid: 'Dev', password: pw, create: true, why: a.why }); toast(r.created ? '建好了，Dev 可以用这个密码登录了' : 'Dev 已经有了，密码重设好了'); go('players', r.uid); });
  },
  gift: async f => {
    const E = f.elements, one = E.to.value === 'one', to = one ? E.user.value.trim() : 'all';
    if (one && !to) return toast('填上要发给哪个账号', true);
    const body = { to, ink: numIn(f, 'ink'), cases: {}, term: numIn(f, 'term'), tags: numIn(f, 'tags'), skins: S.giftSkins.slice(), days: numIn(f, 'days') || 14, newToo: !one && E.newToo.checked, note: E.note.value.trim() };
    for (const c of CAT.caseIds) { const n = numIn(f, 'gc_' + c); if (n) body.cases[c] = n; }
    if ([body.ink, body.term, body.tags, body.days, ...Object.values(body.cases)].some(v => !Number.isInteger(v) || v < 0)) return toast('数量要填 0 或者正整数', true);
    if (!body.ink && !body.term && !body.tags && !Object.keys(body.cases).length && !body.skins.length) return toast('补偿里什么都没有', true);
    if (body.note.length < 2) return toast('写一句给玩家看的说明（至少 2 个字）', true);
    const lines = ['发给：' + (one ? to : body.newToo ? '所有人，包括之后新注册的' : '现在已经注册的所有人'), '内容：' + giftText(body),
      '玩家看到：开发组补偿：' + body.note, body.days + ' 天内登录或者打开武库就能领，每个账号一份'];
    const a = await ask({ title: '发补偿', lines, whyInit: body.note, ok: '发出' });
    if (a) await busy(submitBtn(f), async () => { await api('gift', { ...body, why: a.why }); S.giftSkins = []; toast('补偿发出去了'); render(); });
  },
  code: async f => {
    const E = f.elements, raw = E.code.value.trim().toUpperCase();
    if (raw && !/^[A-Z0-9]{4,20}$/.test(raw)) return toast('兑换码只能用 4 到 20 位英文字母和数字', true);
    const body = { code: raw, ink: numIn(f, 'ink'), cases: {}, term: numIn(f, 'term'), tags: numIn(f, 'tags'), skins: S.codeSkins.slice(), uses: numIn(f, 'uses') || 100, days: numIn(f, 'days') || 14, note: E.note.value.trim() };
    for (const c of CAT.caseIds) { const n = numIn(f, 'cc_' + c); if (n) body.cases[c] = n; }
    if ([body.ink, body.term, body.tags, body.uses, body.days, ...Object.values(body.cases)].some(v => !Number.isInteger(v) || v < 0)) return toast('数量要填 0 或者正整数', true);
    if (!body.ink && !body.term && !body.tags && !Object.keys(body.cases).length && !body.skins.length) return toast('兑换码里什么都没有', true);
    if (body.note.length < 2) return toast('写一句给玩家看的说明（至少 2 个字）', true);
    const lines = ['兑换码：' + (raw || '随机生成 10 位'), '内容：' + giftText(body), '玩家看到：兑换成功：' + body.note + '（内容）',
      '最多 ' + fmtN(body.uses) + ' 个号能领，每个号一次；' + body.days + ' 天内有效'];
    const a = await ask({ title: '建兑换码', lines, whyInit: body.note, ok: '建码' });
    if (a) await busy(submitBtn(f), async () => { const r = await api('code', { ...body, why: a.why }); S.codeSkins = []; toast('建好了：' + r.code); render(); });
  },
  loadout: async f => {
    const p = S.p, E = f.elements;
    const body = { uid: p.uid }, lines = [];
    const sigils = numIn(f, 'sigils');
    if (!Number.isInteger(sigils)) return toast('徽记碎片要填整数', true);
    if (sigils) { body.sigils = sigils; lines.push('徽记碎片 ' + sign(sigils)); }
    const badges = {}, pets = {};
    for (const [id, name] of Object.entries(CAT.badges)) {
      const v = E['bdg_' + id] ? E['bdg_' + id].value : '';
      if (v) { badges[id] = v === '__rm__' ? '' : v; lines.push('徽记「' + name + '」→ ' + (v === '__rm__' ? '移除' : (BADGE_TIER_LABEL[v] || v))); }
    }
    if (Object.keys(badges).length) body.badges = badges;
    for (const [id, name] of Object.entries(CAT.pets)) {
      const v = E['pet_' + id] ? E['pet_' + id].value : '';
      if (v) { pets[id] = v === '__rm__' ? '' : v; lines.push('灵宠「' + name + '」→ ' + (v === '__rm__' ? '移除' : (PET_TIER_LABEL[v] || v))); }
    }
    if (Object.keys(pets).length) body.pets = pets;
    const lh = E.lh ? E.lh.value : '';
    if (lh) {
      const hn = HERO[lh] || lh;
      const st = E.lh_stance.value, bdg = E.lh_badge.value, pet = E.lh_pet.value;
      const q = E.lh_q.value, r = E.lh_r.value, e = E.lh_e.value;
      if (st !== '') { body.stances = { [lh]: +st }; lines.push(hn + ' 架势 → ' + (+st ? '二式' : '原式')); }
      if (bdg !== '') { body.badgeEquip = { [lh]: bdg === '__rm__' ? '' : bdg }; lines.push(hn + ' 装备徽记 → ' + (bdg === '__rm__' ? '卸下' : (CAT.badges[bdg] || bdg))); }
      if (pet !== '') { body.petEquip = { [lh]: pet === '__rm__' ? '' : pet }; lines.push(hn + ' 随行灵宠 → ' + (pet === '__rm__' ? '卸下' : (CAT.pets[pet] || pet))); }
      const sl = {};
      if (q) sl.q = q;
      if (r) sl.r = r;
      if (e) sl.e = e;
      if (Object.keys(sl).length) { body.skills = { [lh]: sl }; lines.push(hn + ' 招式 → ' + Object.entries(sl).map(([k, v]) => k.toUpperCase() + ':' + (CAT.skillVariants[v] || v)).join(' / ')); }
    }
    if (!lines.length) return toast('没有选择要修改的武学或灵宠项', true);
    const a = await ask({ title: '修改 ' + p.username + ' 的武学与灵宠配置', lines, ok: '保存配置' });
    if (a) await busy(submitBtn(f), async () => { await api('adjust', { ...body, why: a.why }); toast('已保存 ' + p.username + ' 的武学配置'); render(); });
  },
  banner: async f => {
    const E = f.elements;
    const tag = E.tag.value.trim(), title = E.title.value.trim();
    const items = [];
    for (let i = 0; i < 4; i++) {
      const k = E['bk_' + i].value.trim(), v = E['bv_' + i].value.trim();
      if (k || v) items.push({ k, v });
    }
    if (!title) return toast('请填写横幅主标题（如需恢复默认请点右上角恢复按钮）', true);
    const lines = ['角标：' + (tag || '最新大更新'), '标题：' + title, ...items.map(x => '· ' + x.k + '：' + x.v)];
    const a = await ask({ title: '发布全服启动更新横幅', lines, whyInit: '更新启动公告横幅', ok: '全服发布' });
    if (a) await busy(submitBtn(f), async () => { await api('banner', { tag, title, items, why: a.why }); toast('启动更新横幅已全服发布'); render(); });
  },
};
document.addEventListener('submit', e => {
  const f = e.target;
  if (!f.dataset || !FORMS[f.dataset.form]) return;
  e.preventDefault();
  FORMS[f.dataset.form](f);
});

/* ---------- 登录、退出 ---------- */
async function start() {
  const [w, cat] = await Promise.all([api('whoami'), api('catalog')]);
  useCat(cat);
  S.who = w.who; S.role = w.role || 'view';
  $('#who').textContent = w.who;
  $('#role').textContent = ROLE[S.role];
  for (const b of document.querySelectorAll('.tabs [data-need]')) b.classList.toggle('hidden', S.role !== b.dataset.need);
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  clearInterval(S.timerT);
  S.timerT = setInterval(updateTimer, 1000);
  updateTimer();
  saveSession();
  route();
}
function logout(msg) {
  S.tok = ''; S.who = ''; S.role = ''; S.p = null; S.admEdit = ''; S.exp = 0;
  clearTimeout(S.expT);
  clearInterval(S.timerT);
  clearInterval(S.autoT);
  clearSession();
  $('#app').classList.add('hidden');
  $('#main').textContent = '';
  $('#login').classList.remove('hidden');
  $('#tok').value = '';
  $('#loginMsg').textContent = msg || '';
  $('#tok').focus();
}
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const name = $('#admName').value.trim(), pw = $('#tok').value, btn = $('#loginBtn');
  if (!pw) return;
  if (!name && pw.trim().length < 16) { $('#loginMsg').textContent = 'ADMIN_SECRET 口令至少 16 位；有管理员账号的话把名字也填上'; return; }
  btn.disabled = true; btn.textContent = '登录中…'; $('#loginMsg').textContent = '';
  try {
    let r, j = {};
    try { r = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, password: name ? pw : pw.trim() }), cache: 'no-store' }); }
    catch (err) { throw new Error('连不上服务器，检查一下网络'); }
    try { j = await r.json(); } catch (err) {}
    if (!r.ok || !j.token) throw new Error(j.error || '出错了（' + r.status + '）');
    S.tok = j.token;
    S.exp = Date.now() + (j.expiresIn || 3600) * 1000;
    $('#tok').value = '';
    S.expT = setTimeout(() => { if (S.who) logout('管理登录 1 小时到了，请重新登录'); }, (j.expiresIn || 3600) * 1000);
    await start();
  } catch (err) { S.tok = ''; S.exp = 0; $('#loginMsg').textContent = err.message; }
  finally { btn.disabled = false; btn.textContent = '进入'; }
});

async function init() {
  try {
    const raw = sessionStorage.getItem(SESS_KEY);
    if (raw) {
      const sess = JSON.parse(raw);
      if (sess && sess.tok && sess.exp > Date.now()) {
        S.tok = sess.tok;
        // Renew sessions created by an older page so their stored 30-minute expiry is upgraded.
        const renewal = await api('refresh', {});
        S.exp = Date.now() + (renewal.expiresIn || 3600) * 1000;
        saveSession();
        S.expT = setTimeout(() => { if (S.who) logout('管理登录 1 小时到了，请重新登录'); }, S.exp - Date.now());
        await start();
        return;
      }
    }
  } catch (e) {
    clearSession();
  }
  logout();
}
init();