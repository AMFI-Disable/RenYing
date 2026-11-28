/* ---------- 操作记录与智能归档 ---------- */
const AUDIT_FILTER_ACTS = ['admin', 'restore', 'admin_ban', 'pardon', 'admin_pw', 'gift_new', 'gift_off', 'code_new', 'code_off', 'cfg', 'flag', 'adm_login', 'adm_acct', 'acct_del', 'acct_restore', 'acct_export', 'err_export', 'err_clean', 'adm_digest', 'maint_prune', 'world_act', 'dev_drop', 'hist_clear', 'mkt_cancel', 'audit_reason_reset'];
const auditRows = rows => H`<div class="tw"><table class="audit-table"><thead><tr><th>时间</th><th>谁</th><th>做了什么</th><th>对象</th><th class="num">墨锭</th><th>内容</th><th>原因</th></tr></thead><tbody>
  ${rows.map((row, i) => { const d = parse(row.detail) || {}, old = d._auditReasonOriginal, boundary = i > 0 && new Date(row.at).toDateString() !== new Date(rows[i - 1].at).toDateString(); return H`<tr class="${row.act === 'adm_digest' ? 'mod' : ''}${boundary ? ' audit-day-break' : ''}"><td class="nowrap">${fmtT(row.at)}</td><td>${d.by || '—'}</td><td class="nowrap"><span class="badge${row.act === 'adm_digest' ? ' gold' : ''}">${ACT[row.act] || row.act}</span></td><td>${target(row)}</td><td class="num">${inkCell(row)}</td><td class="detail">${detailText(row.act, row.detail)}</td><td>${d.why || '—'}${old && old.present ? H`<details><summary>原始原因</summary><span>${old.value}</span></details>` : ''}</td></tr>`; })}
</tbody></table></div>`;
async function vAudit() {
  const qs = new URLSearchParams();
  qs.set('order', 'time');
  if (S.auditAct) qs.set('act', S.auditAct);
  if (S.auditBy) qs.set('by', S.auditBy);
  if (S.auditBefore) { qs.set('before', S.auditBefore); qs.set('beforeAt', S.auditBeforeAt); }
  const r = await api('audit' + (qs.toString() ? '?' + qs : ''));
  return H`<div class="card">
    <div class="row between wrap"><h2>操作记录 <small>本页 ${r.rows.length} 条</small></h2>
      <div class="row wrap" style="gap:6px">
        ${S.role === 'all' ? H`<button type="button" class="btn ghost sm" data-act="auditresetreasons">恢复默认</button>` : ''}
      </div>
    </div>
    <form class="search" data-form="auditq">
      <input name="by" value="${S.auditBy || ''}" placeholder="按管理员名字过滤（如 TestAdmin、even）" autocomplete="off" spellcheck="false">
      <select name="act" aria-label="按动作过滤"><option value="">全部操作类型</option>${AUDIT_FILTER_ACTS.map(k => H`<option value="${k}"${k === S.auditAct ? ' selected' : ''}>${ACT[k] || k}</option>`)}</select>
      <button class="btn">筛选</button>
      ${(S.auditAct || S.auditBy) ? H`<button type="button" class="btn ghost sm" data-act="clearaudit">重置</button>` : ''}
    </form>
    <p class="hint">按时间逐条显示，不同日期之间留有间距。恢复默认会重置全部管理员记录的原因，并保留原始原因供查阅。</p>
    ${r.rows.length ? auditRows(r.rows) : H`<p class="empty">没有符合条件的管理员操作记录</p>`}
    <div class="row wrap"><button class="btn ghost sm" data-act="auditprev" ${S.auditStack.length ? '' : 'disabled'}>上一页</button><button class="btn ghost sm" data-act="auditnext" data-before="${r.nextBefore || ''}" data-before-at="${r.nextBeforeAt || ''}" ${r.nextBefore ? '' : 'disabled'}>更早的记录</button></div>
  </div>`;
}

/* ---------- 错误与清理 ---------- */
const ERR_KIND = { client: '网页', server: '服务器', slow: '慢请求' };
async function vErrors() {
  const kind = S.errKind || '';
  const r = await api('errors' + (kind ? '?kind=' + encodeURIComponent(kind) : ''));
  return H`<div class="card"><div class="row between wrap"><h2>错误 <small>最近 ${r.days} 天，同一种错合成一行</small></h2>
    <div class="row wrap" style="gap:6px">${[['', '全部'], ...Object.entries(ERR_KIND)].map(([k, n]) => H`<button class="btn ghost sm" data-act="errkind" data-k="${k}" aria-pressed="${String(k === kind)}">${n}</button> `)}
      <button class="btn sm" data-act="exporterrs" data-fmt="json" title="导出单文件 JSON 错误诊断日志供 AI Agent 或开发组调试">导出调试日志 (JSON)</button>
      <button class="btn ghost sm" data-act="exporterrs" data-fmt="md" title="导出 Markdown 格式诊断报告">导出 Markdown</button>
      ${r.rows.length ? H`<button class="btn ghost sm" data-act="errclean" data-k="${kind || 'all'}">清空${kind ? ERR_KIND[kind] : '全部'}错误…</button>` : ''}
    </div></div>
    <p class="hint">网页里没接住的错、服务器自己出的错、超过 1 秒的慢请求都记在这里（网址参数、邮箱、长串号码都已经去掉，不带账号）。点错误那一格看调用栈。
      已修复的报错可点右侧「移除」单条删掉，或一键清空当前分类。</p>
    ${r.rows.length ? H`<div class="tw"><table><thead><tr><th>最近一次</th><th>来源</th><th class="num">次数</th><th class="num">耗时</th><th>错误</th><th>位置</th><th>当时</th><th>第一次</th><th>操作</th></tr></thead><tbody>
      ${r.rows.map(e => { const m = parse(e.meta) || {}; return H`<tr><td class="nowrap">${fmtT(e.last_at)}</td><td class="nowrap">${ERR_KIND[e.kind] || e.kind}</td><td class="num">${e.n}</td>
        <td class="num">${e.ms ? H`最慢 ${e.ms}ms<br><small>平均 ${Math.round(e.ms_sum / e.n)}ms</small>` : '—'}</td><td class="err"><details><summary>${e.msg}</summary><pre>${e.stack || '（没有调用栈）'}</pre></details></td><td class="mono">${e.src || '—'}</td>
        <td class="detail">${Object.entries(m).map(([k, v]) => k + '=' + v).join(' · ')}</td><td class="nowrap">${fmtT(e.first_at)}</td>
        <td class="nowrap"><button type="button" class="btn ghost sm" data-act="errdel" data-sig="${e.sig}" data-msg="${e.msg}">移除</button></td></tr>`; })}
    </tbody></table></div>` : H`<p class="empty">这段时间没有错误</p>`}
  </div>`;
}

/* ---------- 匿名游玩统计 ---------- */
const PLAY_MODE_NAME = { cpu: '人机', tag3: '3v3 车轮', tower: '问剑密卷', chaos: '天机乱斗', mayhem: '通天神决', maps: '山河异境', '2v2': '2v2', watch2v2: '观战 2v2',
  melee: '群雄大乱斗', ctf: '江湖夺旗战', gauntlet: '无尽演武擂', cuju: '墨球蹴鞠',
  saga: '侠客列传', stage: '守关', train: '木人桩', raid: '同袍肉鸽', world: '开放世界', boss: '天魔讨伐', net: '联机', netrk: '排位', pvp: '本机对战', replay: '回放', qfx: '青锋行' };
const pctOf = (a, b) => b ? Math.round(a * 100 / b) + '%' : '—';
async function vPlay() {
  const r = await api('playstats?days=30');
  const tot = {}, sum = (o, k, v) => { o[k] = (o[k] || 0) + (v || 0); };
  let fresh = 0, b1 = 0, b1n = 0, b7 = 0, b7n = 0;
  for (const d of r.rows) {
    for (const [k, v] of Object.entries(d.ev)) sum(tot, k, v);
    fresh += d.fresh;
    if (d.back1 !== null) { b1 += d.back1; b1n += d.fresh; }
    if (d.back7 !== null) { b7 += d.back7; b7n += d.fresh; }
  }
  const modes = r.modes.filter(m => tot['m:' + m]).sort((a, b) => tot['m:' + b] - tot['m:' + a]);
  const sumPrefix = p => Object.entries(tot).filter(([k]) => k.startsWith(p)).reduce((n, [, v]) => n + v, 0);
  const resultTotal = sumPrefix('out:');
  const wins = Object.entries(tot).filter(([k]) => k.startsWith('out:') && k.endsWith(':w')).reduce((n, [, v]) => n + v, 0);
  const losses = Object.entries(tot).filter(([k]) => k.startsWith('out:') && k.endsWith(':l')).reduce((n, [, v]) => n + v, 0);
  const queueBins = ['0', '1', '2', '3', '4'].map(b => tot['queue:' + b] || 0);
  const queueN = queueBins.reduce((a, b) => a + b, 0);
  const resultRows = prefix => Object.keys(tot).filter(k => k.startsWith(prefix) && /:(w|l|d)$/.test(k)).reduce((o, k) => {
    const p = k.split(':'), id = p[1]; (o[id] ||= { w: 0, l: 0, d: 0 })[p[2]] += tot[k]; return o;
  }, {});
  const heroResults = resultRows('h:'), mapResults = resultRows('map:');
  return H`<div class="card"><h2>游玩统计 <small>最近 ${r.days} 天 · 北京时间 · 今天 ${r.today}</small></h2>
    <p class="hint">完全匿名：不存名字、账号、邮箱、IP。每个浏览器一个随机编号（服务器只存加盐后的哈希），玩家在设置里可以关掉。
      「第 2 天回来」是那天第一次来的人里，第二天又打开的比例；「第 7 天回来」同理。还没到那一天的显示「—」。</p>
    <div class="row wrap" style="gap:18px">
      <div><b>${fmtN(r.visitors)}</b><br><small>累计来过的浏览器</small></div>
      <div><b>${fmtN(fresh)}</b><br><small>这 ${r.days} 天的新玩家</small></div>
      <div><b>${pctOf(b1, b1n)}</b><br><small>第 2 天回来</small></div>
      <div><b>${pctOf(b7, b7n)}</b><br><small>第 7 天回来</small></div>
      <div><b>${pctOf(tot.tut_done || 0, tot.tut_start || 0)}</b><br><small>开始教学的人里走完的</small></div>
      <div><b>${fmtN(resultTotal)}</b><br><small>已结束对局</small></div>
      <div><b>${pctOf(wins, wins + losses)}</b><br><small>胜率（排除平局）</small></div>
      <div><b>${fmtN(sumPrefix('quit:'))}</b><br><small>主动提前离场</small></div>
      <div><b>${fmtN(tot.disconnect || 0)}</b><br><small>联机断线记录</small></div>
      <div><b>${pctOf(tot.review_yes || 0, (tot.review_yes || 0) + (tot.review_no || 0))}</b><br><small>复盘有帮助反馈</small></div>
    </div></div>
    <div class="card"><h2>排队与对局时长</h2><p class="hint">排队时间按区间统计；对局时长区间：&lt;30 秒、30–59 秒、1–2 分钟、2–4 分钟、4 分钟以上。</p>
      <p>匹配成功 ${fmtN(queueN)} 次 · 排队取消 ${fmtN(tot['queue:cancel'] || 0)} 次</p>
      <div class="row wrap" style="gap:18px">${queueBins.map((n, i) => H`<div><b>${fmtN(n)}</b><br><small>排队 ${['<30 秒', '30–59 秒', '1–2 分钟', '2–4 分钟', '4 分钟以上'][i]}</small></div>`)}</div>
    </div>
    <div class="card"><h2>各模式开局数 <small>最近 ${r.days} 天，多的在前</small></h2>
    ${modes.length ? H`<div class="tw"><table><thead><tr><th>模式</th><th class="num">开局</th><th class="num">结束</th><th class="num">胜 / 负 / 平</th><th class="num">胜率</th><th class="num">提前离场</th></tr></thead><tbody>
      ${(() => { const all = modes.reduce((a, m) => a + tot['m:' + m], 0); return modes.map(m => { const w = tot[`out:${m}:w`] || 0, l = tot[`out:${m}:l`] || 0, d = tot[`out:${m}:d`] || 0, end = w + l + d; return H`<tr><td>${PLAY_MODE_NAME[m] || m}</td><td class="num">${fmtN(tot['m:' + m])}</td><td class="num">${fmtN(end)}</td><td class="num">${fmtN(w)} / ${fmtN(l)} / ${fmtN(d)}</td><td class="num">${pctOf(w, w + l)}</td><td class="num">${fmtN(tot['quit:' + m] || 0)}</td></tr>`; }); })()}
    </tbody></table></div>` : H`<p class="empty">还没有开局记录</p>`}</div>
    <div class="card"><h2>侠客与地图表现</h2><p class="hint">按匿名对局结果汇总；样本少时只用于观察，不代表平衡结论。</p>
      <div class="tw"><table><thead><tr><th>侠客</th><th class="num">胜 / 负 / 平</th><th class="num">胜率</th></tr></thead><tbody>
        ${Object.entries(heroResults).sort((a, b) => (b[1].w + b[1].l + b[1].d) - (a[1].w + a[1].l + a[1].d)).map(([id, x]) => H`<tr><td>${id}</td><td class="num">${fmtN(x.w)} / ${fmtN(x.l)} / ${fmtN(x.d)}</td><td class="num">${pctOf(x.w, x.w + x.l)}</td></tr>`)}
      </tbody></table></div>
      <div class="tw"><table><thead><tr><th>地图</th><th class="num">胜 / 负 / 平</th><th class="num">胜率</th></tr></thead><tbody>
        ${Object.entries(mapResults).sort((a, b) => (b[1].w + b[1].l + b[1].d) - (a[1].w + a[1].l + a[1].d)).map(([id, x]) => H`<tr><td>${id}</td><td class="num">${fmtN(x.w)} / ${fmtN(x.l)} / ${fmtN(x.d)}</td><td class="num">${pctOf(x.w, x.w + x.l)}</td></tr>`)}
      </tbody></table></div>
    </div>
    <div class="card"><h2>每天</h2><div class="tw"><table><thead><tr><th>日期</th><th class="num">玩家</th><th class="num">新玩家</th><th class="num">第 2 天回来</th><th class="num">第 7 天回来</th><th class="num">打开次数</th><th class="num">开局</th><th class="num">教学 开始 / 走完</th></tr></thead><tbody>
      ${r.rows.map(d => { const games = Object.entries(d.ev).filter(([k]) => k.startsWith('m:')).reduce((a, [, v]) => a + v, 0); return H`<tr><td class="nowrap">${d.date}</td><td class="num">${fmtN(d.players)}</td><td class="num">${fmtN(d.fresh)}</td>
        <td class="num">${d.back1 === null ? '—' : pctOf(d.back1, d.fresh)}</td><td class="num">${d.back7 === null ? '—' : pctOf(d.back7, d.fresh)}</td><td class="num">${fmtN(d.ev.open)}</td><td class="num">${fmtN(games)}</td><td class="num">${fmtN(d.ev.tut_start)} / ${fmtN(d.ev.tut_done)}</td></tr>`; })}
    </tbody></table></div></div>`;
}

/* ---------- 世界监控与数据库维护 ---------- */
const TABLE_DESC = {
  users: '注册玩家账号', sessions: '活跃短效会话', devices: '登录设备与续期令牌', refresh_used: '已轮换续期令牌',
  econ: '武库存档与墨锭账本', econ_nonce: '武库请求防重放编号', econ_log: '全服经济与管理流水', sanctions: '反作弊记过与封禁',
  rate: '接口限流计数器', mkt: '玩家市场挂单与成交', gift: '全服/个人补偿包', gift_got: '玩家已领补偿记录',
  code: '礼包兑换码', code_got: '玩家已兑礼包记录', cfg: '经济参数历史版本', presence: '实时在线心跳状态',
  flags: '功能灰度开关', auth_log: '账号登录安全审计', admins: '后台管理员账号', admin_sessions: '后台登录会话',
  errs: '客户端/服务端错误与慢请求', gboss: '全服天魔历代记录', gboss_hit: '天魔讨伐伤害榜', gboss_try: '天魔出战门票',
  saga_mark: '侠客列传足迹统计', chron: '全服肉鸽长卷当前进度', chron_done: '长卷已通关节点', chron_part: '长卷玩家出力记录',
  chron_claim: '长卷奖励领取记录', chron_rep: '分线上报去重凭证',
  play_visitors: '匿名游玩统计 · 编号首末日', play_days: '匿名游玩统计 · 每天来过谁', play_counts: '匿名游玩统计 · 每天各事件次数',
};
async function vMaint() {
  const m = S.maint = await api('maint');
  const b = (m.gboss && m.gboss.boss) || {};
  const hpPct = b.maxHp ? Math.max(0, Math.min(100, Math.round((b.hp / b.maxHp) * 100))) : 0;
  const cq = m.chron || {}, cs = cq.s || {}, cn = cq.curNode || {};
  const cqPct = cs.need ? Math.max(0, Math.min(100, Math.round((cs.got / cs.need) * 100))) : 0;
  const tables = Object.entries(m.tables || {});
  const totalRows = tables.reduce((s, [, n]) => s + n, 0);
  return H`<div class="card">
    <div class="row between wrap"><h2>天魔讨伐 · 实时监控 <small>第 ${b.gen || 1} 代 · ${HERO[b.hero] || b.hero || '—'}</small></h2>
      <div class="row wrap">
        <button class="btn ghost sm" data-act="worldact" data-op="gboss_reroll">重随天魔词缀…</button>
        <button class="btn ghost sm" data-act="worldact" data-op="gboss_next">结算并换下一代…</button>
      </div>
    </div>
    <div class="tiles sm" style="margin-bottom:12px">
      ${tile('当前血量', `${fmtN(b.hp || 0)} / ${fmtN(b.maxHp || 0)}`, `剩余 ${hpPct}%`)}
      ${tile('词缀', (b.affix || []).join(', ') || '无', '当前天魔特性')}
      ${tile('参战玩家', unit((m.gboss && m.gboss.players) || 0, '人'), `正在交战 ${(m.gboss && m.gboss.fighting) || 0} 人`)}
      ${tile('历史已斩杀', unit((m.gboss && m.gboss.kills) || 0, '代'), `本代截止 ${fmtT(b.until)}`)}
    </div>
    <div class="pbar"><i style="width:${hpPct}%"></i></div>
    <form class="row wrap" data-form="gbosshp" style="margin-top:12px">
      <label class="f w120">设置当前血量<input type="number" name="hp" min="1" max="1000000" step="1000" value="${b.hp || 30000}"></label>
      <button class="btn ghost sm" style="margin-top:18px">修改天魔血量…</button>
    </form>
  </div>
  <div class="card">
    <div class="row between wrap"><h2>全服肉鸽 · 江湖长卷进度 <small>第 ${(cs.node || 0) + 1} / ${cq.n || 1040} 节</small></h2>
      <button class="btn ghost sm" data-act="worldact" data-op="chron_advance">强制完成并推进一节…</button>
    </div>
    <p class="hint" style="margin:4px 0 8px">${cn.t ? `当前章节目标：${cn.t}（${cn.line || ''}）｜ 奖励：${cn.ink || 0} 墨锭` : '全服共享剧情长卷'}</p>
    <div class="row between" style="margin-bottom:6px"><span>当前进度：<b>${fmtN(cs.got || 0)} / ${fmtN(cs.need || 1)}</b>（目标类型：${cs.g || '—'}）</span><span>${cqPct}%</span></div>
    <div class="pbar"><i style="width:${cqPct}%"></i></div>
  </div>
  <div class="card">
    <div class="row between wrap"><h2>D1 数据库健康与历史清理 <small>共 ${tables.length} 张表 · 合计 ${fmtN(totalRows)} 行</small></h2>
      <div class="row wrap" style="gap:6px">
        <button class="btn sm" data-act="maintprune" data-t="expired">一键清理所有过期缓存…</button>
        <button class="btn ghost sm" data-act="maintprune" data-t="econ_nonce">清空防重放表 (econ_nonce)…</button>
        <button class="btn ghost sm" data-act="maintprune" data-t="rate">清空限速计数表 (rate)…</button>
        <button class="btn ghost sm" data-act="maintprune" data-t="econ_log_player_30d">清理 30 天前普通同步流水…</button>
        <button class="btn ghost sm" data-act="maintprune" data-t="auth_log_30d">清理 30 天前登录记录…</button>
      </div>
    </div>
    <p class="hint">实时统计 Cloudflare D1 各业务表行数，可随时释放过期会话、防重放凭证、限流计数以及陈旧流水占用的空间。</p>
    <div class="tw"><table><thead><tr><th>数据表名</th><th>用途说明</th><th class="num">当前行数</th></tr></thead><tbody>
      ${tables.map(([k, n]) => H`<tr><td class="mono">${k}</td><td>${TABLE_DESC[k] || '业务表'}</td><td class="num"><b>${fmtN(n)}</b></td></tr>`)}
    </tbody></table></div>
  </div>`;
}

/* ---------- 登录记录 ---------- */
const AUTH_ACT = { register: '注册', login: '登录', login_fail: '登录失败', logout: '退出', device_out: '退出别的设备', device_all: '所有设备退出', refresh_reuse: '续期令牌被偷用', pw_admin: '管理员重设密码' };
const AUTH_NOTE = { pw: '密码不对', noacct: '没有这个号', locked: '输错太多次，被锁住', legacy: '以前的老式登录', deleted: '账号删除了' };
async function vAuth() {
  const r = await api('authlog?q=' + encodeURIComponent(S.aq) + '&act=' + encodeURIComponent(S.aact));
  return H`<div class="card"><h2>登录记录 <small>最近 200 条，留 90 天</small></h2>
    <form class="search" data-form="authq"><input name="q" value="${S.aq}" placeholder="昵称或账号编号（不填就是所有人）" autocomplete="off" spellcheck="false" aria-label="按账号查">
      <select name="act" aria-label="只看哪一种"><option value="">全部</option>${Object.entries(AUTH_ACT).map(([k, v]) => H`<option value="${k}"${k === S.aact ? ' selected' : ''}>${v}</option>`)}</select><button class="btn">查</button></form>
    <p class="hint">IP 只存了打乱后的一段：同一段就是同一个 IP，倒推不出原来的 IP。一个号短时间里「登录失败」很多、IP 又各不相同，多半是有人在猜密码；「续期令牌被偷用」说明那台设备的登录被人拿走过，已经自动退出了。</p>
    ${r.rows.length ? H`<div class="tw"><table><thead><tr><th>时间</th><th>账号</th><th>做了什么</th><th>设备</th><th>IP</th><th>备注</th></tr></thead><tbody>
      ${r.rows.map(x => H`<tr><td class="nowrap">${fmtT(x.at)}</td><td>${x.uid ? H`<button class="link" data-act="open" data-uid="${x.uid}">${x.username || x.name || x.uid}</button>` : (x.name || '—')}</td>
        <td class="nowrap"><span class="badge${x.act === 'login_fail' || x.act === 'refresh_reuse' ? ' bad' : x.act === 'login' || x.act === 'register' ? ' ok' : ''}">${AUTH_ACT[x.act] || x.act}</span></td>
        <td class="mono">${x.dev || ''}</td><td class="mono">${x.ip}</td><td>${AUTH_NOTE[x.note] || x.note}</td></tr>`)}
    </tbody></table></div>` : H`<p class="empty">${S.aq ? '这个账号没有登录记录' : '还没有登录记录'}</p>`}
  </div>`;
}


/* ---------- 批量：删除、恢复、封号、解封 ---------- */
const BATCH = {
  delete: { t: '删除', lines: ['这些号登录不了、所有设备退出、不上排行榜，挂的单别人看不到', '存档、武库、流水一样不动，随时能恢复'], danger: true },
  restore: { t: '恢复', lines: ['恢复以后照常登录，存档、武库、流水都是删除前的样子'] },
  ban: { t: '封号', lines: ['封禁期间不能同步存档、不能交易'], danger: true },
  pardon: { t: '解封', lines: ['清空处罚记录（记过次数归零），玩家刷新网页后就能正常同步、交易'] },
};
async function batchOp(btn, op, uids, names, o = {}) {
  const B = BATCH[op], head = names.length > 1 ? names.length + ' 个号：' + names.slice(0, 12).join('、') + (names.length > 12 ? '…' : '') : names[0];
  const a = await ask({ title: B.t + ' ' + head, lines: [...(op === 'ban' ? [o.perm ? '永久封号' : '封 ' + o.days + ' 天'] : []), ...B.lines], ok: B.t, danger: B.danger });
  if (!a) return;
  await busy(btn, async () => {
    const r = await api('batch', { op, uids, why: a.why, ...(op === 'ban' ? (o.perm ? { perm: true } : { days: o.days }) : {}) });
    toast(B.t + '了 ' + r.done.length + ' 个号' + (r.skip.length ? '；没处理 ' + r.skip.length + ' 个：' + r.skip.map(x => (x.name || x.uid) + '（' + x.why + '）').join('、') : ''), r.skip.length > 0);
    render();
  });
}

/* ---------- 管理员账号（只有「全部」角色能看） ---------- */
async function vAdmins() {
  const r = await api('admins');
  S.admins = r.admins;
  return H`<div class="card"><h2>管理员账号</h2>
    <p class="hint">四种角色：只能看（所有页面都能看，不能改）；经济（还能改墨锭、补偿、兑换码、找回饰品）；封禁和账号（还能封号、解封、重设玩家密码）；全部（还能改功能开关、管理员账号）。
      改密码、停用以后，那个管理员已经登录的网页马上失效。ADMIN_SECRET 口令登录算「全部」，建好管理员账号以后平时尽量用账号登录。</p>
    ${r.admins.length ? H`<div class="tw"><table><thead><tr><th>名字</th><th>角色</th><th>状态</th><th>最近登录</th><th>谁建的</th><th></th></tr></thead><tbody>
      ${r.admins.map(a => H`<tr><td><b>${a.name}</b>${a.name.toLowerCase() === S.who.toLowerCase() ? H` <small>（你）</small>` : ''}</td>
        <td class="nowrap"><span class="badge${a.role === 'all' ? ' gold' : ''}">${ROLE[a.role] || a.role}</span></td>
        <td class="nowrap">${a.disabled ? H`<span class="badge bad">停用了</span>` : H`<span class="badge ok">能用</span>`}</td>
        <td class="nowrap">${a.last_login ? fmtT(a.last_login) : '没登录过'}</td><td class="nowrap">${a.created_by} · ${fmtT(a.created_at)}</td>
        <td class="nowrap"><button class="btn ghost sm" data-act="admedit" data-name="${a.name}">改…</button></td></tr>`)}
    </tbody></table></div>` : H`<p class="empty">还没有管理员账号，先在下面建一个</p>`}
    ${r.secrets.length ? H`<p class="hint">ADMIN_SECRET 里的名字：${r.secrets.join('、')}（这些名字不能再用来建账号）</p>` : ''}
  </div>
  <div class="card"><h2>${S.admEdit ? '改管理员 ' + S.admEdit : '建管理员账号'}</h2>
    <form data-form="admin"><div class="grid">
      <label class="f">名字<input name="name" value="${S.admEdit || ''}" maxlength="20" autocomplete="off" spellcheck="false" required${S.admEdit ? ' readonly' : ''}></label>
      <label class="f">角色<select name="role">${Object.entries(ROLE).map(([k, v]) => H`<option value="${k}"${(S.admins.find(a => a.name === S.admEdit) || { role: 'view' }).role === k ? ' selected' : ''}>${v}</option>`)}</select></label>
      <label class="f">${S.admEdit ? '新密码（不改就留空）' : '密码'}<input name="pw" type="text" minlength="12" maxlength="128" autocomplete="new-password" spellcheck="false"${S.admEdit ? '' : ' required'}></label>
      ${S.admEdit ? H`<label class="chk"><input type="checkbox" name="off"${(S.admins.find(a => a.name === S.admEdit) || {}).disabled ? ' checked' : ''}> 停用这个账号</label>` : ''}
      </div><div class="row"><button type="button" class="btn ghost" data-act="genpw">随机生成密码</button><button class="btn">${S.admEdit ? '保存' : '建账号'}</button>${S.admEdit ? H` <button type="button" class="btn ghost" data-act="admnew">不改了</button>` : ''}</div>
    </form>
  </div>`;
}

function drawGiftGives() {
  const el = $('#giftGives');
  if (el) paint(el, S.giftSkins.map((g, i) => H`<span class="chip">${itemName(g.k)}（${heroOf(g.k)}）${g.st >= 0 ? ' 斩数 ' + g.st : ''}<button type="button" data-act="delgiftgive" data-i="${i}" aria-label="去掉">×</button></span>`));
}
function drawCodeGives() {
  const el = $('#codeGives');
  if (el) paint(el, S.codeSkins.map((g, i) => H`<span class="chip">${itemName(g.k)}（${heroOf(g.k)}）${g.st >= 0 ? ' 斩数 ' + g.st : ''}<button type="button" data-act="delcodegive" data-i="${i}" aria-label="去掉">×</button></span>`));
}

