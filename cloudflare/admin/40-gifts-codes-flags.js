/* ---------- 补偿 ---------- */
const GIFT_TPLS = [
  { label: '例行维护补偿', ink: 500, c1: 1, term: 0, tags: 0, days: 14, note: '服务器例行维护补偿' },
  { label: '紧急故障补偿', ink: 1200, c1: 2, term: 1, tags: 0, days: 14, note: '服务器异常波动补偿' },
  { label: '版本更新贺礼', ink: 1500, c7: 1, term: 1, tags: 1, days: 30, note: '新版本上线全服贺礼' },
  { label: '周末福利补给', ink: 600, c2: 1, term: 0, tags: 0, days: 7, note: '周末江湖修整福利' },
];
async function vGifts() {
  const r = await api('gifts');
  S.gifts = r.gifts;
  const now = Date.now();
  const state = g => g.off ? H`<span class="badge">停发了</span>` : g.until <= now ? H`<span class="badge">过期了</span>` : H`<span class="badge ok">发放中</span>`;
  return H`<form class="card" data-form="gift" novalidate>
    <div class="row between wrap"><h2>发补偿</h2>
      <div class="row wrap"><span class="hint">快速模板：</span>${GIFT_TPLS.map((t, i) => H`<button type="button" class="btn ghost sm" data-act="gifttpl" data-i="${i}">${t.label}</button>`)}</div></div>
    <p class="hint">玩家下次登录或者打开武库时自动领到，每个账号只领一次；游戏里会弹出「开发组补偿：说明（内容）」。</p>
    <div class="grid">
      <label class="f">发给<select name="to"><option value="all">所有人</option><option value="one">一个账号</option></select></label>
      <label class="f hidden" data-one>昵称或账号编号<input name="user" autocomplete="off" spellcheck="false"></label>
      <label class="f">墨锭<input type="number" name="ink" min="0" max="1000000" step="1" placeholder="0"></label>
      ${CAT.caseIds.map(c => H`<label class="f">${caseName(c)}<input type="number" name="gc_${c}" min="0" max="100" step="1" placeholder="0"></label>`)}
      <label class="f">货郎<input type="number" name="term" min="0" max="100" step="1" placeholder="0"></label>
      <label class="f">改名标签<input type="number" name="tags" min="0" max="100" step="1" placeholder="0"></label>
      <label class="f">几天内能领<input type="number" name="days" min="1" max="90" step="1" value="14"></label>
    </div>
    <h3>附赠饰品</h3>
    <div class="giverow">
      <select name="gk" aria-label="选一件饰品">${itemOptions()}</select>
      <label class="chk"><input type="checkbox" name="gst"> 斩数版</label>
      <input type="number" name="gstn" min="0" step="1" value="0" aria-label="斩数（记了多少次击倒）">
      <button type="button" class="btn ghost" data-act="addgiftgive">加进清单</button>
    </div>
    <div id="giftGives" class="chips"></div>
    <label class="f" style="margin-top:8px">给玩家看的说明（2～60 个字）<input name="note" maxlength="60" placeholder="比如：服务器维护补偿"></label>
    <label class="chk" style="margin-top:10px" data-all><input type="checkbox" name="newToo"> 之后新注册的账号也能领（不勾就只发给现在已经注册的，免得有人开小号来领）</label>
    <div class="row end"><button class="btn">检查并发出…</button></div>
  </form>
  <div class="card"><h2>发过的补偿 <small>最近 50 份</small></h2>
    ${r.gifts.length ? H`<div class="tw"><table><thead><tr><th>说明</th><th>发给</th><th>内容</th><th class="num">领了</th><th>谁发的</th><th>发出</th><th>截止</th><th>状态</th><th></th></tr></thead><tbody>
      ${r.gifts.map(g => H`<tr><td class="mw">${g.note}</td><td class="nowrap">${g.uid === '*' ? (g.born > g.at ? '所有人（含新号）' : '所有人') : (g.username || g.uid)}</td><td class="mw">${giftText(g)}</td>
        <td class="num">${fmtN(g.got)}</td><td>${g.by}</td><td class="nowrap">${fmtT(g.at)}</td><td class="nowrap">${fmtT(g.until)}</td><td>${state(g)}</td>
        <td>${!g.off && g.until > now ? H`<button class="btn ghost sm" data-act="giftoff" data-id="${g.id}">停发…</button>` : ''}</td></tr>`)}
    </tbody></table></div>` : H`<p class="empty">还没发过补偿</p>`}
  </div>`;
}

/* ---------- 兑换码 ---------- */
const CODE_TPLS = [
  { label: '新手助力码', ink: 800, c1: 2, term: 1, tags: 0, uses: 500, days: 30, note: '新手江湖助力礼包' },
  { label: '群友福利码', ink: 1000, c3: 1, term: 1, tags: 1, uses: 200, days: 14, note: '官方社群专属福利' },
  { label: '赛事应援码', ink: 1500, c7: 1, term: 1, tags: 0, uses: 1000, days: 7, note: '刃影赛事应援礼包' },
];
async function vCodes() {
  const r = await api('codes');
  S.codes = r.codes;
  const now = Date.now();
  const state = c => c.off ? H`<span class="badge">停用了</span>` : c.until <= now ? H`<span class="badge">过期了</span>` : c.got >= c.uses ? H`<span class="badge">领完了</span>` : H`<span class="badge ok">能领</span>`;
  return H`<form class="card" data-form="code" novalidate>
    <div class="row between wrap"><h2>建兑换码</h2>
      <div class="row wrap"><span class="hint">快速模板：</span>${CODE_TPLS.map((t, i) => H`<button type="button" class="btn ghost sm" data-act="codetpl" data-i="${i}">${t.label}</button>`)}</div></div>
    <p class="hint">玩家在游戏的「任务 → 礼包兑换」里输入就能领，要登录云端账号，每个号只领一次。码只存在服务器上，不在代码里。公开发出去的码，看到的人都能领，领满人数就停；只想给少数人的，用随机生成的码。</p>
    <div class="grid">
      <label class="f">兑换码（不填就随机生成）<input name="code" maxlength="20" placeholder="比如 SPRING2026" autocomplete="off" spellcheck="false"></label>
      <label class="f">墨锭<input type="number" name="ink" min="0" max="1000000" step="1" placeholder="0"></label>
      ${CAT.caseIds.map(c => H`<label class="f">${caseName(c)}<input type="number" name="cc_${c}" min="0" max="100" step="1" placeholder="0"></label>`)}
      <label class="f">货郎<input type="number" name="term" min="0" max="100" step="1" placeholder="0"></label>
      <label class="f">改名标签<input type="number" name="tags" min="0" max="100" step="1" placeholder="0"></label>
      <label class="f">最多几个号能领<input type="number" name="uses" min="1" max="100000" step="1" value="100"></label>
      <label class="f">几天内能领<input type="number" name="days" min="1" max="90" step="1" value="14"></label>
    </div>
    <h3>附赠饰品</h3>
    <div class="giverow">
      <select name="ck" aria-label="选一件饰品">${itemOptions()}</select>
      <label class="chk"><input type="checkbox" name="cst"> 斩数版</label>
      <input type="number" name="cstn" min="0" step="1" value="0" aria-label="斩数（记了多少次击倒）">
      <button type="button" class="btn ghost" data-act="addcodegive">加进清单</button>
    </div>
    <div id="codeGives" class="chips"></div>
    <label class="f" style="margin-top:8px">给玩家看的说明（2～60 个字）<input name="note" maxlength="60" placeholder="比如：新春礼包"></label>
    <div class="row end"><button class="btn">检查并建码…</button></div>
  </form>
  <div class="card"><h2>建过的兑换码 <small>最近 50 个</small></h2>
    ${r.codes.length ? H`<div class="tw"><table><thead><tr><th>兑换码</th><th>说明</th><th>内容</th><th class="num">领了 / 最多</th><th>谁建的</th><th>建于</th><th>截止</th><th>状态</th><th></th></tr></thead><tbody>
      ${r.codes.map(c => H`<tr><td class="mono nowrap">${c.code} <button type="button" class="btn ghost sm" data-act="copy" data-v="${c.code}" style="padding:2px 6px;font-size:11px">复制</button></td><td class="mw">${c.note}</td><td class="mw">${giftText(c)}</td>
        <td class="num nowrap">${fmtN(c.got)} / ${fmtN(c.uses)}</td><td>${c.by}</td><td class="nowrap">${fmtT(c.at)}</td><td class="nowrap">${fmtT(c.until)}</td><td>${state(c)}</td>
        <td>${!c.off && c.until > now ? H`<button class="btn ghost sm" data-act="codeoff" data-code="${c.code}">停用…</button>` : ''}</td></tr>`)}
    </tbody></table></div>` : H`<p class="empty">还没建过兑换码</p>`}
  </div>`;
}


/* ---------- 功能开关 ---------- */
async function vFlags() {
  const [r, bn] = await Promise.all([api('flags'), api('banner').catch(() => ({ banner: null }))]);
  S.flags = r.flags;
  const b = (bn && bn.banner) || {};
  const items = Array.isArray(b.items) ? b.items : [];
  return H`<div class="card"><h2>功能开关</h2>
    <p class="hint">大改动先做成开关：可以先只对 Dev 账号打开试，没问题再对所有人开，出了问题一键关回去。改完 30 秒内各处生效；网页那边的开关要玩家刷新网页才换。</p>
    ${r.flags.length ? H`<div class="tw"><table><thead><tr><th>开关</th><th>说明</th><th>现在</th><th>默认</th><th>最后改动</th><th></th></tr></thead><tbody>
      ${r.flags.map(f => H`<tr><td class="mono nowrap">${f.k}${f.client ? H` <span class="badge">网页</span>` : ''}</td><td class="mw">${f.desc}</td>
        <td class="nowrap"><span class="badge${f.mode === 'all' ? ' ok' : f.mode === 'dev' ? ' gold' : ''}">${FLAG_MODE[f.mode]}</span></td><td class="nowrap">${FLAG_MODE[f.def]}</td>
        <td class="mw">${f.at ? H`${f.by} · ${fmtT(f.at)}<br><small>${f.note}</small>` : '没改过'}</td>
        <td class="nowrap">${['off', 'dev', 'all'].filter(m => m !== f.mode).map(m => H`<button class="btn ghost sm" data-act="flagset" data-k="${f.k}" data-mode="${m}">改成${FLAG_MODE[m]}…</button> `)}</td></tr>`)}
    </tbody></table></div>` : H`<p class="empty">现在没有登记的开关</p>`}
  </div>
  <form class="card" data-form="banner" novalidate>
    <div class="row between wrap">
      <h2>启动更新横幅管理 <small>${b.title ? '已自定义' : '使用客户端内置默认'}</small></h2>
      ${b.title ? H`<button type="button" class="btn ghost sm" data-act="bannerreset">恢复内置默认…</button>` : ''}
    </div>
    <p class="hint">每次玩家打开游戏首页顶部都会展示该更新横幅；留空或恢复默认将显示代码内置的最新版本公告。${bn && bn.at ? ' 上次修改：' + bn.by + ' · ' + fmtT(bn.at) : ''}</p>
    <div class="grid">
      <label class="f">角标标签（最多 24 字）<input name="tag" maxlength="24" value="${b.tag || ''}" placeholder="最新大更新"></label>
      <label class="f grow">横幅主标题（最多 80 字）<input name="title" maxlength="80" value="${b.title || ''}" placeholder="如：8v8 群雄团战 · 4 位新侠客 · 随行灵宠与自选招式上线"></label>
    </div>
    <h3>重点更新条目（最多 4 条，每条写「类别」与「内容」）</h3>
    <div class="grid">
      ${[0, 1, 2, 3].map(i => H`<label class="f">条目 ${i + 1} 类别<input name="bk_${i}" maxlength="24" value="${(items[i] && items[i].k) || ''}" placeholder="如：新模式"></label>
        <label class="f">条目 ${i + 1} 内容<input name="bv_${i}" maxlength="90" value="${(items[i] && items[i].v) || ''}" placeholder="如：3v3–8v8 群雄大乱斗 / 夺旗战"></label>`)}
    </div>
    <div class="row end"><button class="btn">保存并全服发布…</button></div>
  </form>`;
}

