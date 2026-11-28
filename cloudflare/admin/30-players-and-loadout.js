/* ---------- 玩家：搜索与多维排序 ---------- */
function sortTh(col, label, isNum) {
  const active = S.pSort === col;
  const arrow = active ? (S.pDir === 'asc' ? ' ↑' : ' ↓') : ' ↕';
  return H`<th class="${isNum ? 'num' : ''}"><button type="button" class="sortbtn${active ? ' active' : ''}" data-act="psort" data-col="${col}">${label}${arrow}</button></th>`;
}
async function vPlayers() {
  if (S.uid) return vPlayer();
  const qs = 'q=' + encodeURIComponent(S.q)
    + (S.pFilter === 'deleted' ? '&del=1' : '')
    + (['banned', 'wealth', 'flagged', 'active24h'].includes(S.pFilter) ? '&filter=' + S.pFilter : '')
    + (S.pSort ? '&sort=' + encodeURIComponent(S.pSort) + '&dir=' + encodeURIComponent(S.pDir || 'desc') : '')
    + '&limit=' + (S.pLimit || 20)
    + '&offset=' + (S.pOffset || 0);
  const r = await api('find?' + qs);
  S.found = r.users;
  S.pTotal = r.total !== undefined ? r.total : r.users.length;
  const isDel = S.pFilter === 'deleted';
  const filterDesc = S.pFilter === 'banned' ? '封禁中的账号'
    : S.pFilter === 'wealth' ? '墨锭 ≥ 10,000 的富豪榜'
    : S.pFilter === 'flagged' ? '有反作弊记过的账号'
    : S.pFilter === 'active24h' ? '24 小时内活跃的账号'
    : isDel ? '删除了的账号' : '所有账号';
  return H`<div class="card">
    <div class="row between wrap"><h2>玩家</h2><div class="row wrap">
      <button class="btn ghost sm" data-act="fltview" data-f="" aria-pressed="${String(!S.pFilter)}">所有账号</button>
      <button class="btn ghost sm" data-act="fltview" data-f="active24h" aria-pressed="${String(S.pFilter === 'active24h')}">24h 活跃</button>
      <button class="btn ghost sm" data-act="fltview" data-f="wealth" aria-pressed="${String(S.pFilter === 'wealth')}">富豪榜</button>
      <button class="btn ghost sm" data-act="fltview" data-f="flagged" aria-pressed="${String(S.pFilter === 'flagged')}">有记过</button>
      <button class="btn ghost sm" data-act="fltview" data-f="banned" aria-pressed="${String(S.pFilter === 'banned')}">封禁中</button>
      <button class="btn ghost sm" data-act="fltview" data-f="deleted" aria-pressed="${String(isDel)}">删除了的</button>
      <button class="btn ghost sm" data-act="export">导出 CSV</button></div></div>
    <form class="search" data-form="find">
      <input name="q" value="${S.q}" placeholder="按昵称搜索（支持子串、开头匹配）或账号编号（u_ 开头）" autocomplete="off" spellcheck="false" aria-label="搜索玩家">
      ${S.q ? H`<button type="button" class="btn ghost sm" data-act="clearsearch">清空</button>` : ''}
      <button class="btn">搜索</button>
    </form>
    <p class="hint">${filterDesc}${S.q ? ' · 匹配 “' + S.q + '”' : ''}（共 ${fmtN(S.pTotal)} 个结果）。点表头可按昵称、墨锭、记过次数、活跃时间或注册时间排序；勾上多个可批量处理。</p>
    ${r.users.length ? H`<form data-form="batch"><div class="tw"><table><thead><tr><th><input type="checkbox" data-pickall aria-label="全选"></th>${sortTh('username', '昵称')}${sortTh('ink', '墨锭', true)}${sortTh('strikes', '记过 / 状态', true)}${sortTh('updated', '上次活跃')}${sortTh('created', '注册时间')}</tr></thead><tbody>
      ${r.users.map(u => {
        const isBan = !!(u.perm || u.ban_until > Date.now());
        return H`<tr class="${u.deleted_at ? 'mute' : ''}"><td><input type="checkbox" name="pick" value="${u.id}" aria-label="选 ${u.username}"></td>
        <td><button type="button" class="link" data-act="open" data-uid="${u.id}">${u.username}</button>${u.deleted_at ? H` <span class="badge bad">${fmtT(u.deleted_at)} 删除</span>` : ''}${isBan ? H` <span class="badge bad">${u.perm ? '永久封禁' : '封禁中'}</span>` : ''}<div class="hint mono">${u.id}</div></td>
        <td class="num">${u.ink === null || u.ink === undefined ? '—' : fmtN(u.ink)}</td>
        <td class="num">${u.strikes ? H`<span class="badge bad">${u.strikes} 次</span>` : H`<span class="hint">0</span>`}</td>
        <td class="nowrap">${ago(u.updated_at)}</td><td class="nowrap">${fmtT(u.created_at)}</td></tr>`;
      })}
    </tbody></table></div>
    <div class="row between wrap" style="margin-top:12px;padding-top:10px;border-top:1px solid var(--line)">
      <div class="row">
        <span class="hint">每页</span>
        <select data-act="pagesize" style="width:auto">
          <option value="20"${S.pLimit === 20 ? ' selected' : ''}>20 条</option>
          <option value="50"${S.pLimit === 50 ? ' selected' : ''}>50 条</option>
          <option value="100"${S.pLimit === 100 ? ' selected' : ''}>100 条</option>
        </select>
        <span class="hint">第 ${fmtN(S.pTotal ? S.pOffset + 1 : 0)} - ${fmtN(Math.min(S.pOffset + S.pLimit, S.pTotal))} 条 / 共 ${fmtN(S.pTotal)} 条</span>
      </div>
      <div class="row">
        <button type="button" class="btn ghost sm" data-act="page" data-dir="-1"${S.pOffset <= 0 ? ' disabled' : ''}>上一页</button>
        <button type="button" class="btn ghost sm" data-act="page" data-dir="1"${S.pOffset + S.pLimit >= S.pTotal ? ' disabled' : ''}>下一页</button>
      </div>
    </div>
    <div class="row wrap" style="margin-top:10px"><span class="hint">勾上的：</span>
      <button type="button" class="btn ghost sm" data-act="batch" data-op="ban">封号…</button><button type="button" class="btn ghost sm" data-act="batch" data-op="pardon">解封…</button>
      <button type="button" class="btn ghost sm" data-act="batch" data-op="delete">删除…</button><button type="button" class="btn ghost sm" data-act="batch" data-op="restore">恢复…</button>
      <label class="f w120">封几天<input type="number" name="days" min="1" max="3650" step="1" value="1"></label><label class="chk"><input type="checkbox" name="perm"> 永久</label></div>
    </form>` : H`<p class="empty">${isDel ? '没有删除了的号' : '没找到符合条件的账号'}</p>`}
  </div>${S.q.toLowerCase() === 'dev' && !r.users.some(u => String(u.username).toLowerCase() === 'dev') ? devCard() : ''}`;
}
function devCard() {   // 云端还没有 Dev：只能在这里建，别人注册不了
  return H`<form class="card" data-form="mkdev" novalidate>
    <h2>建 Dev 账号</h2>
    <p class="hint">云端还没有 Dev。Dev 是开发组的市场账号，库存不受限，只能在这里建。填一个密码（至少 12 位），或者点「随机生成」。</p>
    <div class="row wrap"><label class="f grow">密码<input name="pw" type="text" maxlength="128" autocomplete="off" spellcheck="false"></label>
      <button type="button" class="btn ghost" data-act="genpw" style="margin-top:18px">随机生成</button>
      <button class="btn" style="margin-top:18px">建号…</button></div>
  </form>`;
}

/* ---------- 玩家：一个号的详情、加减、设备、挂单管理、历史清理 ---------- */
function itemOptions() {
  return H`<option value="">选一件饰品…</option>${CAT.caseIds.map(c => H`<optgroup label="${caseName(c)}">${CAT.order
    .flatMap(t => Object.values(CAT.items).filter(x => x.col === c && x.tier === t))
    .map(x => H`<option value="${x.k}">${itemName(x.k)} · ${heroOf(x.k)} · ${CAT.tiers[x.tier].n}</option>`)}</optgroup>`)}`;
}
async function vPlayer() {
  const p = S.p = await api('econ?uid=' + encodeURIComponent(S.uid));
  S.give = [];
  const e = p.econ, s = (e && e.state) || {}, now = Date.now();
  const inv = Array.isArray(s.inv) ? s.inv : [], lst = Array.isArray(s.lst) ? s.lst : [], cases = s.cases || {};
  const worn = new Set(Object.values(s.eq || {})), sc = p.sanction || {}, isBan = !!(sc.perm || sc.banUntil > now);
  const nCases = CAT.caseIds.reduce((a, c) => a + (+cases[c] || 0), 0), pr = p.profile || {};
  return H`<div class="crumbs row between wrap"><button class="btn ghost sm" data-act="back">← 玩家列表</button>
    <button class="btn ghost sm" data-act="exportplayer" data-uid="${p.uid}">导出该玩家存档快照 (JSON)</button></div>
  <div class="card head">
    <div class="who"><h2>${p.username}</h2>${p.deletedAt ? H`<span class="badge bad">删除了</span>` : ''}${isBan ? H`<span class="badge bad">${sc.perm ? '永久封禁' : '封禁中'}</span>` : ''}</div>
    <div class="meta"><span class="mono">${p.uid}</span><button class="btn ghost sm" data-act="copy" data-v="${p.uid}">复制编号</button>
      <span>注册于 ${fmtT(p.createdAt)}</span><span>上次动武库：${e ? ago(e.at) : '还没打开过'}</span></div>
    <div class="tiles sm">
      ${tile('墨锭', e ? e.ink : 0)}${tile('饰品', unit(inv.length, '件'))}${tile('在卖', unit(lst.length, '单'))}${tile('武器箱', unit(nCases, '个'))}
      ${tile('货郎', unit(+s.term || 0, '台'))}${tile('改名标签', unit(+s.tags || 0, '张'))}${tile('段位分', pr.rating === undefined ? '—' : pr.rating)}${tile('联机', H`${pr.netWins || 0}<small>胜</small> ${pr.netLosses || 0}<small>负</small>`)}
    </div>
    ${e ? '' : H`<p class="hint" style="margin-top:10px">这个号还没打开过武库：第一次调整时会先按它的存档建好武库，再加减。</p>`}
  </div>
  <form data-form="adjust" novalidate>
    <div class="card">
      <h2>加减</h2>
      <p class="hint">正数是加，负数是扣，空着就是不动。墨锭一次最多 ±1,000,000；武器箱、货郎、改名标签一次最多 ±1,000。扣不成负数。</p>
      <div class="grid">
        <label class="f">墨锭<span class="cur">现有 ${fmtN(e ? e.ink : 0)}</span><input type="number" name="ink" step="1" placeholder="0"></label>
        ${CAT.caseIds.map(c => H`<label class="f">${caseName(c)}<span class="cur">现有 ${+cases[c] || 0}</span><input type="number" name="case_${c}" step="1" placeholder="0"></label>`)}
        <label class="f">货郎<span class="cur">现有 ${+s.term || 0}</span><input type="number" name="term" step="1" placeholder="0"></label>
        <label class="f">改名标签<span class="cur">现有 ${+s.tags || 0}</span><input type="number" name="tags" step="1" placeholder="0"></label>
      </div>
      <h3>发饰品</h3>
      <div class="giverow">
        <select name="gk" aria-label="选一件饰品">${itemOptions()}</select>
        <label class="chk"><input type="checkbox" name="gst"> 斩数版</label>
        <input type="number" name="gstn" min="0" step="1" value="0" aria-label="斩数（记了多少次击倒）">
        <button type="button" class="btn ghost" data-act="addgive">加进清单</button>
      </div>
      <div class="row end" style="margin-top:8px"><button type="button" class="btn ghost sm" data-act="markallgive">清单全部设为斩数版</button></div>
      <div class="setgiverow">
        <select name="gset" aria-label="选择整套饰品"><option value="">选一套饰品…</option><option value="all">全部饰品</option>${CAT.caseIds.map(c => H`<option value="${c}">${caseName(c)}整套</option>`)}</select>
        <button type="button" class="btn ghost" data-act="addsetgive">加整套进清单</button>
      </div>
      <p class="hint">可以单件、整套或全部发放。勾选“斩数版”会把上面的斩数应用到清单中新加的每件饰品。</p>
      <div id="gives" class="chips"></div>
      <p class="hint">要收走饰品，在下面的库存里勾上。挂在市场上的可以先强制撤下再收。</p>
      <div class="row end"><button class="btn">检查并提交…</button></div>
    </div>
    <div class="card">
      <h2>库存 <small>${inv.length} 件</small></h2>
      ${inv.length ? H`<div class="tw"><table><thead><tr><th>收走</th><th>编号</th><th>饰品</th><th>品质</th><th>武器箱</th><th>来源</th><th>拿到</th></tr></thead><tbody>
        ${inv.slice().sort((a, b) => b.i - a.i).map(it => { const d = CAT.items[it.k] || {}; return H`<tr>
          <td><input type="checkbox" name="take" value="${it.i}" aria-label="收走第 ${it.i} 号"></td><td class="mono">#${it.i}</td>
          <td>${itemTag(it.k, it.st)}${worn.has(it.i) ? H` <span class="badge ok">穿着</span>` : ''}${it.n ? H`<div class="hint">改了名：${it.n}</div>` : ''}</td>
          <td>${tierTag(d.tier)}</td><td class="nowrap">${caseName(d.col)}</td><td class="nowrap">${SRC[it.src] || it.src || '—'}</td><td class="nowrap">${fmtT(it.t)}</td></tr>`; })}
      </tbody></table></div>` : H`<p class="empty">库存是空的</p>`}
      ${lst.length ? H`<h3>挂在玩家市场上的 <small>可强制撤下退回卖家</small></h3><div class="tw"><table><thead><tr><th>编号</th><th>单号</th><th>饰品</th><th>品质</th><th class="num">标价</th><th>操作</th></tr></thead><tbody>
        ${lst.map(L => H`<tr><td class="mono">#${L.it.i}</td><td class="mono">${L.l}</td><td>${itemTag(L.it.k, L.it.st)}</td><td>${tierTag((CAT.items[L.it.k] || {}).tier)}</td><td class="num">${fmtN(L.price)}</td>
          <td><button type="button" class="btn ghost sm" data-act="mktcancel" data-id="${L.l}">强制撤下…</button></td></tr>`)}
      </tbody></table></div>` : ''}
    </div>
  </form>
  ${loadoutCard(p)}
  ${devicesCard(p)}
  ${lostCard(p)}
  ${banCard(sc, isBan, p)}
  ${pwCard(p)}
  ${delCard(p)}
  ${logCard(p.log || [], p)}
  ${mktCard(p)}`;
}

const BADGE_TIER_LABEL = { silver: '银纹', gold: '赤金', purpgold: '紫金' };
const PET_TIER_LABEL = { basic: '灵雏', spirit: '灵魄', immortal: '仙兽' };
function loadoutCard(p) {
  const s = (p.econ && p.econ.state) || {};
  const bOwn = s.badgeOwned || {}, bEq = s.badgeEquip || {}, pOwn = s.petOwned || {}, pEq = s.petEquip || {};
  const stances = s.stances || {}, skLoad = s.skillLoadout || {}, heroes = CAT.heroes.length ? CAT.heroes : Object.keys(HERO);
  const badgeEntries = Object.entries(CAT.badges), petEntries = Object.entries(CAT.pets);
  const svEntries = Object.entries(CAT.skillVariants);
  return H`<form class="card" data-form="loadout" novalidate>
    <div class="row between wrap">
      <h2>武学 · 灵宠 · 招式 · 架势管理</h2>
      <button type="button" class="btn sm" data-act="unlockall">一键全满配（全徽记紫金/全灵宠仙兽/全二式/全招式）…</button>
    </div>
    <p class="hint">可单独发放/升级/移除任意武学徽记或灵宠、加减徽记碎片，或为任意侠客指定架势、装备徽记、随行灵宠与 Q/R/E 流派。</p>
    <div class="grid">
      <label class="f">徽记碎片<span class="cur">现有 ${fmtN(+s.badgeSigils || 0)} 枚</span><input type="number" name="sigils" step="1" placeholder="0"></label>
    </div>
    <h3>武学徽记 <small>已拥有 ${Object.keys(bOwn).length} / ${badgeEntries.length}</small></h3>
    <div class="grid">
      ${badgeEntries.map(([id, name]) => H`<label class="f">${name}<span class="cur">${bOwn[id] ? (BADGE_TIER_LABEL[bOwn[id]] || bOwn[id]) : '未拥有'}</span>
        <select name="bdg_${id}"><option value="">不改</option><option value="__rm__">移除</option><option value="silver">银纹</option><option value="gold">赤金</option><option value="purpgold">紫金</option></select></label>`)}
    </div>
    <h3>随行灵宠 <small>已拥有 ${Object.keys(pOwn).length} / ${petEntries.length}</small></h3>
    <div class="grid">
      ${petEntries.map(([id, name]) => H`<label class="f">${name}<span class="cur">${pOwn[id] ? (PET_TIER_LABEL[pOwn[id]] || pOwn[id]) : '未拥有'}</span>
        <select name="pet_${id}"><option value="">不改</option><option value="__rm__">移除</option><option value="basic">灵雏</option><option value="spirit">灵魄</option><option value="immortal">仙兽</option></select></label>`)}
    </div>
    <h3>单侠客装配定制</h3>
    <div class="grid">
      <label class="f">选择侠客<select name="lh"><option value="">不改单侠客装配</option>${heroes.map(h => H`<option value="${h}">${HERO[h] || h}</option>`)}</select></label>
      <label class="f">架势<select name="lh_stance"><option value="">不改</option><option value="0">原式</option><option value="1">二式（自动解锁）</option></select></label>
      <label class="f">装备徽记<select name="lh_badge"><option value="">不改</option><option value="__rm__">卸下</option>${badgeEntries.map(([id, name]) => H`<option value="${id}">${name}</option>`)}</select></label>
      <label class="f">随行灵宠<select name="lh_pet"><option value="">不改</option><option value="__rm__">卸下</option>${petEntries.map(([id, name]) => H`<option value="${id}">${name}</option>`)}</select></label>
      <label class="f">Q 招式流派<select name="lh_q"><option value="">不改</option>${svEntries.map(([id, name]) => H`<option value="${id}">${name}</option>`)}</select></label>
      <label class="f">R 招式流派<select name="lh_r"><option value="">不改</option>${svEntries.map(([id, name]) => H`<option value="${id}">${name}</option>`)}</select></label>
      <label class="f">E 绝技流派<select name="lh_e"><option value="">不改</option>${svEntries.map(([id, name]) => H`<option value="${id}">${name}</option>`)}</select></label>
    </div>
    <div class="row end"><button class="btn">检查并保存武学配置…</button></div>
    <details style="margin-top:12px"><summary class="hint" style="cursor:pointer">展开全部 ${heroes.length} 位侠客当前装配总览</summary>
      <div class="tw"><table><thead><tr><th>侠客</th><th>架势</th><th>装备徽记</th><th>随行灵宠</th><th>Q / R / E 招式</th></tr></thead><tbody>
        ${heroes.map(h => { const sl = skLoad[h] || {}; return H`<tr><td><b>${HERO[h] || h}</b></td><td>${stances[h] ? H`<span class="badge gold">二式</span>` : '原式'}</td>
          <td>${bEq[h] ? (CAT.badges[bEq[h]] || bEq[h]) : '—'}</td><td>${pEq[h] ? (CAT.pets[pEq[h]] || pEq[h]) : '—'}</td>
          <td class="nowrap">${(CAT.skillVariants[sl.q || 'std'] || '原式')} / ${(CAT.skillVariants[sl.r || 'std'] || '原式')} / ${(CAT.skillVariants[sl.e || 'std'] || '原式')}</td></tr>`; })}
      </tbody></table></div>
    </details>
  </form>`;
}

function devicesCard(p) {
  const devs = p.devices || [], leg = p.legacySessions || 0;
  return H`<div class="card">
    <div class="row between wrap"><h2>登录设备与会话 <small>${devs.length} 台设备${leg ? ' · ' + leg + ' 个旧式会话' : ''}</small></h2>
      ${(devs.length || leg) ? H`<button type="button" class="btn ghost sm" data-act="dropdev" data-dev="all">强制下线全部设备…</button>` : ''}</div>
    <p class="hint">管理该账号当前在线的设备令牌，可单独踢下某台设备或将全部登录状态强制下线。</p>
    ${devs.length ? H`<div class="tw"><table><thead><tr><th>设备编号</th><th>系统与浏览器</th><th>最近活跃</th><th>登录时间</th><th>过期时间</th><th></th></tr></thead><tbody>
      ${devs.map(d => H`<tr><td class="mono">${d.id}</td><td>${d.label || '未知设备'}</td><td class="nowrap">${ago(d.last_seen)}</td><td class="nowrap">${fmtT(d.created_at)}</td><td class="nowrap">${fmtT(d.expires_at)}</td>
        <td><button type="button" class="btn ghost sm" data-act="dropdev" data-dev="${d.id}">踢下线…</button></td></tr>`)}
    </tbody></table></div>` : H`<p class="empty">${leg ? '只有 ' + leg + ' 个旧式 30 天登录会话' : '当前没有活跃的登录设备'}</p>`}
  </div>`;
}

// 找回饰品：按流水查这个号拿到过、现在没有的饰品。正常没的（熔铸、一键卖掉、市场卖掉）只列出来，去向不明和管理员收走的可以勾上找回
const LOST_TEXT = { trade: '熔铸掉了', sellDupes: '一键卖掉了重复的', sold: '在玩家市场卖掉了', admin: '管理员收走了', odd: '在这一步里不见了', unknown: '去向不明（流水里没记）', restored: '已经找回过了' };
function lostCard(p) {
  const L = S.lost && S.lost.uid === p.uid ? S.lost.items : null;
  if (!L) return H`<div class="card"><div class="row between wrap"><h2>找回饰品</h2><button type="button" class="btn ghost" data-act="lost">查一查丢了什么</button></div>
    <p class="hint">按这个号的流水，列出拿到过、现在库存和挂单里都没有的饰品，写明是哪一步没的。去向不明的、管理员收走的可以找回，每件只能找回一次。</p></div>`;
  const can = L.filter(x => x.can);
  return H`<form class="card" data-form="restore" novalidate><div class="row between wrap"><h2>找回饰品 <small>${L.length} 件不在了，${can.length} 件能找回</small></h2><button type="button" class="btn ghost sm" data-act="lost">重新查</button></div>
    ${L.length ? H`<div class="tw"><table><thead><tr><th>找回</th><th>编号</th><th>饰品</th><th>拿到</th><th>没了</th><th>去向</th></tr></thead><tbody>
      ${L.map(x => H`<tr class="${x.can ? '' : 'mute'}"><td>${x.can ? H`<input type="checkbox" name="restore" value="${x.i}" aria-label="找回第 ${x.i} 号">` : ''}</td><td class="mono">#${x.i}</td><td>${itemTag(x.k, x.st)}</td>
        <td class="nowrap">${x.got ? fmtT(x.got.at) + ' ' + (ACT[x.got.act] || x.got.act) : '—'}</td><td class="nowrap">${x.gone ? fmtT(x.gone.at) + ' ' + (ACT[x.gone.act] || x.gone.act) : '—'}</td>
        <td>${x.why === 'restored' ? H`<span class="badge ok">${LOST_TEXT.restored}</span>` : x.can ? H`<span class="badge bad">${LOST_TEXT[x.why]}</span>` : LOST_TEXT[x.why] || x.why}</td></tr>`)}
    </tbody></table></div>
    ${can.length ? H`<div class="row end"><button type="button" class="btn ghost" data-act="restoreselect">全选可找回</button><button class="btn">找回勾上的…</button></div>` : ''}` : H`<p class="empty">流水里拿到过的饰品都还在</p>`}
  </form>`;
}
function banCard(sc, isBan, p) {
  return H`<form class="card" data-form="ban" novalidate>
    <div class="row between wrap"><h2>封号与处罚记录</h2>
      ${(sc.strikes || (sc.log && sc.log.length)) ? H`<button type="button" class="btn ghost sm" data-act="clearhist" data-k="sanctions">清空记过历史…</button>` : ''}</div>
    ${isBan ? H`<p>${sc.perm ? '永久封禁。' : '封禁中，到 ' + fmtT(sc.banUntil) + '。'}</p><div class="row"><button type="button" class="btn" data-act="pardon">解封…</button></div>`
      : H`<div class="row wrap"><label class="f w120">封几天<input type="number" name="days" min="1" max="3650" step="1" value="1"></label>
        <label class="chk" style="margin-top:18px"><input type="checkbox" name="perm"> 永久封号</label>
        <button class="btn danger" style="margin-top:18px">封号…</button></div>`}
    <p class="hint" style="margin-top:10px">反作弊记过 ${sc.strikes || 0} 次${sc.pardon ? '，上次解封在 ' + fmtT(sc.pardon) : ''}。封禁期间不能同步存档、不能交易；解封后玩家刷新网页就好了。</p>
    ${(sc.log || []).length ? H`<div class="tw"><table><thead><tr><th>时间</th><th>原因</th><th>来源</th></tr></thead><tbody>
      ${sc.log.slice().reverse().map(x => H`<tr><td class="nowrap">${fmtT(x.at)}</td><td>${x.r}</td><td class="nowrap">${String(x.src || '').replace(/^admin:/, '管理员 ').replace(/^client$/, '网页检测').replace(/^server$/, '服务器检测')}</td></tr>`)}
    </tbody></table></div>` : ''}
  </form>`;
}
function delCard(p) {
  return H`<div class="card">
    <h2>删除账号与历史移除</h2>
    ${p.deletedAt ? H`<p><span class="badge bad">${fmtT(p.deletedAt)} 删除了</span> 登录不了、不上排行榜，挂的单别人看不到。存档、武库、流水都还在。</p>
      <div class="row wrap"><button type="button" class="btn" data-act="restoreone">恢复这个号…</button>
        <button type="button" class="btn ghost sm" data-act="clearhist" data-k="auth_log">清空该号登录记录…</button></div>`
      : H`<p class="hint">删除以后这个号登录不了、所有设备退出、不上排行榜，挂的单别人看不到。存档、武库、流水一样不动，昵称还占着，随时能恢复，恢复后什么都不丢。</p>
      <div class="row wrap"><button type="button" class="btn danger" data-act="delone">删除这个号…</button>
        <button type="button" class="btn ghost sm" data-act="clearhist" data-k="auth_log">清空该号登录记录…</button></div>`}
  </div>`;
}
function pwCard(p) {
  const dev = String(p.username || '').toLowerCase() === 'dev';
  return H`<form class="card" data-form="pw" novalidate>
    <h2>重设密码</h2>
    <p class="hint">${dev ? 'Dev 是开发组的市场账号，它的密码只能在这里改。' : ''}填一个新密码（至少 12 位），或者点「随机生成」。重设以后，这个号在所有设备上的登录都会退出，要用新密码重新登录。</p>
    <div class="row wrap"><label class="f grow">新密码<input id="newpw" name="pw" type="text" maxlength="128" autocomplete="off" spellcheck="false"></label>
      <button type="button" class="btn ghost" data-act="genpw" style="margin-top:18px">随机生成</button>
      <button class="btn danger" style="margin-top:18px">重设密码…</button></div>
  </form>`;
}
function logCard(log, p) {
  return H`<div class="card"><div class="row between wrap"><h2>流水 <small>最近 ${log.length} 条</small></h2>
    ${log.length ? H`<button type="button" class="btn ghost sm" data-act="clearhist" data-k="econ_log">清空该号流水历史…</button>` : ''}</div>
    ${log.length ? H`<div class="tw"><table><thead><tr><th>时间</th><th>操作</th><th class="num">墨锭</th><th>详情</th></tr></thead><tbody>
      ${log.map(r => H`<tr class="${r.ok ? '' : 'fail'}"><td class="nowrap">${fmtT(r.at)}</td><td class="nowrap">${ACT[r.act] || r.act}${r.ok ? '' : H` <span class="badge bad">没成</span>`}</td>
        <td class="num">${inkCell(r)}</td><td class="detail">${detailText(r.act, r.detail, true)}</td></tr>`)}
    </tbody></table></div>` : H`<p class="empty">还没有流水</p>`}</div>`;
}
function mktCard(p) {
  const rows = p.mkt || [];
  if (!rows.length) return '';
  const stText = r => r.state === 0 ? '在卖' : r.state === 2 ? '撤下了' : r.seller === p.uid ? (r.paid ? '卖掉了，已到账' : '卖掉了，下次动武库时到账') : '买到了';
  return H`<div class="card"><h2>玩家市场 <small>最近 ${rows.length} 单</small></h2><div class="tw"><table>
    <thead><tr><th>时间</th><th>买还是卖</th><th>饰品</th><th class="num">价格</th><th>状态</th><th></th></tr></thead><tbody>
    ${rows.map(r => H`<tr><td class="nowrap">${fmtT(r.done_at || r.at)}</td><td>${r.seller === p.uid ? '卖' : '买'}</td><td>${itemTag(r.k, r.st)}</td><td class="num">${fmtN(r.price)}</td><td class="nowrap">${stText(r)}</td>
      <td>${r.state === 0 ? H`<button type="button" class="btn ghost sm" data-act="mktcancel" data-id="${r.id}">撤单…</button>` : ''}</td></tr>`)}
  </tbody></table></div></div>`;
}
function drawGives() {
  const el = $('#gives');
  if (el) paint(el, S.give.map((g, i) => H`<span class="chip">${itemName(g.k)}（${heroOf(g.k)}）${g.st >= 0 ? ' 斩数 ' + g.st : ''}<button type="button" data-act="delgive" data-i="${i}" aria-label="去掉">×</button></span>`));
}

