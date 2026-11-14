// ======================= 老站数据继承与导入 =======================
const LEGACY_USERS = [{"id": 1, "name": "Luffy", "wins": 8, "losses": 8, "rating": 1035, "placed": 11, "ink": 1358, "owned": ["qingfeng", "yanling", "leiming", "tieshan"], "frags": {"yuehua": 12, "liuyun": 13, "lingshuang": 12, "moyu": 13, "feiying": 13}, "pity": 1, "spity": 1, "skins": ["ly_dusk", "yl_phoenix", "lm_violet", "qf_gold", "ts_obsidian", "ts_bronze"], "equip": {"yanling": "yl_phoenix", "qingfeng": "qf_gold"}}, {"id": 2, "name": "设计失败的草履虫", "wins": 11, "losses": 11, "rating": 1152, "placed": 17, "ink": 478, "owned": ["qingfeng", "leiming", "tieshan", "liuyun", "lingshuang"], "frags": {"yuehua": 15, "feiying": 22, "yanling": 15, "moyu": 15}, "pity": 1, "spity": 5, "skins": ["qf_gold", "lm_sun"], "equip": {"qingfeng": "qf_gold", "leiming": "lm_sun"}}, {"id": 3, "name": "tct33x7", "wins": 1, "losses": 1, "rating": 1103, "placed": 2, "ink": 650, "owned": ["qingfeng", "lingshuang", "leiming", "liuyun"], "frags": {"moyu": 4, "tieshan": 10, "yanling": 1}, "pity": 9, "spity": 0, "skins": [], "equip": {}}, {"id": 4, "name": "明媚的地球", "wins": 9, "losses": 4, "rating": 1093, "placed": 8, "ink": 44, "owned": ["qingfeng", "lingshuang", "liuyun", "feiying", "yuehua", "leiming", "tieshan", "yanling", "moyu"], "frags": {}, "pity": 0, "spity": 0, "skins": ["lm_violet", "ly_dusk", "yh_sakura", "lm_sun", "ly_sky", "fy_jade", "ts_obsidian", "ts_bronze", "my_cinnabar", "ls_plum"], "equip": {"leiming": "lm_sun", "tieshan": "ts_obsidian", "moyu": "my_cinnabar", "feiying": "fy_jade", "liuyun": "ly_sky"}}, {"id": 5, "name": "张涵", "wins": 0, "losses": 0, "rating": 1100, "placed": 0, "ink": 92, "owned": ["qingfeng", "lingshuang", "feiying", "yanling", "leiming", "tieshan"], "frags": {"liuyun": 24, "yuehua": 12, "moyu": 10}, "pity": 9, "spity": 1, "skins": ["ls_plum", "yl_phoenix", "qf_frost", "lm_sun", "fy_jade"], "equip": {"qingfeng": "qf_frost", "lingshuang": "ls_plum", "yanling": "yl_phoenix"}}, {"id": 6, "name": "Luffy_iMac", "wins": 1, "losses": 2, "rating": 1135, "placed": 1, "ink": 790, "owned": ["qingfeng", "lingshuang"], "frags": {}, "pity": 0, "spity": 0, "skins": [], "equip": {}}, {"id": 7, "name": "cxt", "wins": 0, "losses": 0, "rating": 1100, "placed": 0, "ink": 50, "owned": ["qingfeng"], "frags": {}, "pity": 0, "spity": 0, "skins": [], "equip": {}}, {"id": 8, "name": "cxy", "wins": 2, "losses": 1, "rating": 1134, "placed": 1, "ink": 300, "owned": ["qingfeng", "liuyun"], "frags": {"tieshan": 13, "lingshuang": 6, "leiming": 9, "yanling": 13, "yuehua": 7, "feiying": 9, "moyu": 6}, "pity": 0, "spity": 8, "skins": ["ly_dusk", "ly_sky", "qf_gold"], "equip": {"liuyun": "ly_sky", "qingfeng": "qf_gold"}}, {"id": 9, "name": "MoYu", "wins": 0, "losses": 0, "rating": 1100, "placed": 0, "ink": 690, "owned": ["qingfeng", "moyu"], "frags": {}, "pity": 0, "spity": 0, "skins": [], "equip": {}}, {"id": 10, "name": "越来越挤的大巴", "wins": 0, "losses": 0, "rating": 1100, "placed": 0, "ink": 210, "owned": ["qingfeng", "moyu", "feiying"], "frags": {"leiming": 2, "liuyun": 7, "tieshan": 2, "lingshuang": 1}, "pity": 1, "spity": 0, "skins": [], "equip": {}}, {"id": 11, "name": "hanz", "wins": 1, "losses": 2, "rating": 1068, "placed": 3, "ink": 192, "owned": ["qingfeng", "lingshuang", "tieshan"], "frags": {"yuehua": 3, "leiming": 5, "liuyun": 4, "moyu": 5, "yanling": 3}, "pity": 9, "spity": 7, "skins": ["qf_frost"], "equip": {"qingfeng": "qf_frost"}}, {"id": 12, "name": "zmjjkk", "wins": 1, "losses": 2, "rating": 1100, "placed": 0, "ink": 770, "owned": ["qingfeng", "leiming"], "frags": {}, "pity": 0, "spity": 0, "skins": [], "equip": {}}, {"id": 13, "name": "wqfnkjrnbjv", "wins": 0, "losses": 0, "rating": 1100, "placed": 0, "ink": 36, "owned": ["qingfeng", "moyu", "liuyun"], "frags": {"leiming": 8, "feiying": 1, "tieshan": 1, "yuehua": 2, "yanling": 1}, "pity": 2, "spity": 0, "skins": [], "equip": {}}, {"id": 14, "name": "Ger1m0", "wins": 0, "losses": 0, "rating": 1100, "placed": 0, "ink": 560, "owned": ["qingfeng", "lingshuang"], "frags": {}, "pity": 0, "spity": 0, "skins": [], "equip": {}}, {"id": 15, "name": "AAAAAAAA风铃批发", "wins": 1, "losses": 0, "rating": 1127, "placed": 1, "ink": 280, "owned": ["qingfeng", "moyu"], "frags": {"liuyun": 4, "leiming": 9, "yuehua": 1, "feiying": 4, "tieshan": 1}, "pity": 3, "spity": 8, "skins": ["qf_frost"], "equip": {"qingfeng": "qf_frost"}}, {"id": 16, "name": "Hilbert", "wins": 7, "losses": 34, "rating": 963, "placed": 39, "ink": 344, "owned": ["qingfeng", "liuyun", "feiying", "yanling", "leiming", "tieshan", "moyu", "lingshuang", "yuehua"], "frags": {}, "pity": 11, "spity": 0, "skins": ["qf_gold", "lm_violet", "ly_dusk", "yl_raven", "fy_jade", "fy_blood", "qf_frost", "my_cinnabar", "ly_sky", "ts_obsidian", "yl_phoenix", "ts_bronze"], "equip": {"qingfeng": "qf_gold", "feiying": "fy_blood", "liuyun": "ly_dusk", "leiming": "lm_violet", "yanling": "yl_raven", "tieshan": "ts_obsidian", "moyu": "my_cinnabar"}}, {"id": 17, "name": "CJ", "wins": 7, "losses": 5, "rating": 1113, "placed": 12, "ink": 86, "owned": ["qingfeng", "feiying", "moyu", "lingshuang", "tieshan", "leiming"], "frags": {"yuehua": 13, "liuyun": 16, "yanling": 18}, "pity": 10, "spity": 15, "skins": ["qf_frost", "lm_sun"], "equip": {}}, {"id": 18, "name": "神明", "wins": 35, "losses": 13, "rating": 1204, "placed": 46, "ink": 28, "owned": ["qingfeng", "yanling", "tieshan", "liuyun", "feiying", "lingshuang", "leiming"], "frags": {"yuehua": 38, "moyu": 39}, "pity": 11, "spity": 1, "skins": ["qf_gold", "qf_frost", "yl_raven", "yl_phoenix", "ly_dusk", "ts_bronze", "lm_sun"], "equip": {"qingfeng": "qf_gold", "yanling": "yl_raven", "liuyun": "ly_dusk", "tieshan": "ts_bronze", "leiming": "lm_sun"}}, {"id": 19, "name": "duyiuiavuda", "wins": 0, "losses": 1, "rating": 1071, "placed": 1, "ink": 770, "owned": ["qingfeng", "feiying"], "frags": {}, "pity": 0, "spity": 0, "skins": [], "equip": {}}, {"id": 20, "name": "青霜", "wins": 1, "losses": 0, "rating": 1142, "placed": 1, "ink": 1125, "owned": ["qingfeng", "moyu"], "frags": {}, "pity": 0, "spity": 0, "skins": [], "equip": {}}, {"id": 21, "name": "111111", "wins": 0, "losses": 1, "rating": 1054, "placed": 1, "ink": 540, "owned": ["qingfeng", "lingshuang"], "frags": {}, "pity": 0, "spity": 0, "skins": [], "equip": {}}];

let currentLegacyList = [];

function populateLegacyDropdown(list, selectedName) {
  const container = $id('importSelectArea');
  if (!container) return;
  currentLegacyList = list || [];
  if (!currentLegacyList.length) {
    container.classList.add('hidden');
    container.innerHTML = '';
    return;
  }
  container.classList.remove('hidden');
  const target = (selectedName || (ACC.name || (window.CloudSave && CloudSave.getUser() ? CloudSave.getUser().name : ''))).toLowerCase();
  container.innerHTML = `
    <div style="display:flex;gap:6px;margin-bottom:8px">
      <select id="legacyAccSelect" style="flex:1;min-width:0;padding:5px 8px;font-size:12px;background:rgba(0,0,0,0.5);color:var(--ink);border:1px solid var(--faint);border-radius:5px">
        <option value="">-- 选择导入包中的账号（共 ${currentLegacyList.length} 位） --</option>
        ${currentLegacyList.map(a => {
          const ownCount = (a.owned || []).length;
          const skinCount = (a.skins || []).length;
          const ink = a.ink || 0;
          const matchText = (a.wins || 0) + '胜' + (a.losses || 0) + '负';
          const isSel = (target && target === a.name.toLowerCase()) ? ' selected' : '';
          return `<option value="${escapeHTML(a.name)}"${isSel}>${escapeHTML(a.name)} (${ink}墨锭 · ${ownCount}英雄 · ${skinCount}皮肤 · ${matchText})</option>`;
        }).join('')}
      </select>
      <button class="go small" id="claimLegacyBtn" style="font-size:12px;padding:5px 12px;white-space:nowrap">导入此账号</button>
    </div>
  `;
  const claimBtn = $id('claimLegacyBtn');
  if (claimBtn) {
    claimBtn.addEventListener('click', () => {
      const sel = $id('legacyAccSelect');
      const val = sel ? sel.value : '';
      if (!val) {
        if ($id('importMsg')) {
          $id('importMsg').style.color = '#ff6b6b';
          $id('importMsg').textContent = '请先在下拉菜单中选择一个账号';
        }
        return;
      }
      const found = currentLegacyList.find(a => a.name === val);
      if (!found) {
        if ($id('importMsg')) $id('importMsg').textContent = '未找到该账号信息';
        return;
      }
      claimLegacyAccount(found);
    });
  }
}

function claimLegacyAccount(accData) {
  if (!accData) return;
  const name = accData.name;

  // 1. 英雄拥有集合并集
  const oldOwned = Array.isArray(PROF.owned) ? PROF.owned : ['qingfeng'];
  const newOwned = Array.isArray(accData.owned) ? accData.owned : ['qingfeng'];
  PROF.owned = Array.from(new Set([...oldOwned, ...newOwned]));

  // 2. 皮肤拥有集合并集
  const oldSkins = Array.isArray(PROF.skins) ? PROF.skins : [];
  const newSkins = Array.isArray(accData.skins) ? accData.skins : [];
  PROF.skins = Array.from(new Set([...oldSkins, ...newSkins]));

  // 3. 碎片最大值合并
  PROF.frags = PROF.frags || {};
  if (accData.frags && typeof accData.frags === 'object') {
    for (const [cid, cnt] of Object.entries(accData.frags)) {
      PROF.frags[cid] = Math.max(PROF.frags[cid] || 0, cnt || 0);
    }
  }

  // 4. 墨锭取更大值（未签名或老版存档施加合理保护上限）
  const incomingInk = Math.min(Math.max(0, accData.ink || 0), accData._sig ? 999999 : 5000);
  PROF.ink = Math.max(PROF.ink || 0, incomingInk);

  // 5. 保底次数合并
  PROF.pity = Math.max(PROF.pity || 0, accData.pity || 0);
  PROF.spity = Math.max(PROF.spity || 0, accData.spity || 0);

  // 6. 皮肤装配（严格仅保留已解锁的皮肤）
  const validSkins = new Set(PROF.skins || []);
  const rawEquip = Object.assign({}, accData.equip || {}, PROF.equip || {});
  PROF.equip = {};
  for (const [cid, sk] of Object.entries(rawEquip)) {
    if (sk && (validSkins.has(sk) || OFFLINE_BUILD || freeSkinEvent())) {
      PROF.equip[cid] = sk;
    }
  }
  try { localStorage.setItem('renying-equip', JSON.stringify(PROF.equip)); } catch (e) {}

  // 7. 战绩与排位
  PROF.netWins = Math.max(PROF.netWins || 0, accData.wins || 0);
  PROF.netLosses = Math.max(PROF.netLosses || 0, accData.losses || 0);
  if (accData.rating) PROF.rating = accData.rating;
  if (accData.placed) PROF.placed = Math.max(PROF.placed || 0, accData.placed || 0);

  // 8. 账号绑定
  if (!ACC.name) {
    ACC.name = name;
  }
  PROF.guest = false;

  // 9. 存储同步（本地镜像与云端）
  if (window.CloudSave) {
    CloudSave.saveProfile(PROF, true);
  }

  // 10. 刷新界面
  applyProfile(PROF);
  renderAcc();

  const msg = `已成功继承【${name}】！已解锁 ${PROF.owned.length} 位英雄、${PROF.skins.length} 款皮肤、${PROF.ink} 墨锭！`;
  if ($id('importMsg')) {
    $id('importMsg').style.color = '#46d3ea';
    $id('importMsg').textContent = msg;
  }
  toast(msg);
}

if ($id('toggleImportBoxBtn')) {
  $id('toggleImportBoxBtn').addEventListener('click', () => {
    $id('importBox').classList.toggle('hidden');
    $id('toggleImportBoxBtn').textContent = $id('importBox').classList.contains('hidden') ? '📜 存档导入与继承' : '收起导入设置';
  });
}

if ($id('importFileInput')) {
  $id('importFileInput').addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        const d = JSON.parse(ev.target.result);

        // 格式 A: 单账号导出格式或裸 Profile
        if (d.format === 'single-account' || (d.profile && d.account) || Array.isArray(d.owned)) {
          if (!window.CloudSave) throw new Error('存档系统未就绪');
          const res = await CloudSave.importAccountData(d);
          ACC.name = res.name;
          ACC.token = res.uid;
          PROF.guest = false;
          setAcc.last = ACC.token + '|' + ACC.name; adaptLoad();
          applyProfile(res.profile);
          renderAcc();
          if ($id('importFileStatus')) $id('importFileStatus').textContent = `已成功导入【${res.name}】`;
          // 导入就是切换到这个账号（本机账号），要说出来；旧版备份只校验了一部分，也要说
          const sw = `已切换到导入的本机账号【${res.name}】`;
          if ($id('importMsg')) {
            $id('importMsg').style.color = res.note ? '#e9c46a' : '#46d3ea';
            $id('importMsg').textContent = `${sw}：${(res.profile.owned || ['qingfeng']).length} 位英雄、${res.profile.ink || 0} 墨锭。${res.note ? res.note + '。' : ''}`;
          }
          toast(`${sw}${res.note ? '（' + res.note + '）' : ''}`, 5);
          return;
        }

        // 格式 B: 全账号打包备份格式
        if (d.format === 'all-accounts-backup' && Array.isArray(d.accounts)) {
          if (!window.CloudSave) throw new Error('存档系统未就绪');
          const res = { name: '', profile: null };   // 全备份包在这里逐个写本机，不需要走单账号导入
          const list = d.accounts.map(item => {
            const a = item.account || {};
            const p = item.profile || {};
            return {
              id: a.uid,
              name: a.name,
              wins: p.netWins || 0,
              losses: p.netLosses || 0,
              rating: p.rating || 1100,
              placed: p.placed || 0,
              ink: p.ink || 0,
              owned: p.owned || ['qingfeng'],
              frags: p.frags || {},
              pity: p.pity || 0,
              spity: p.spity || 0,
              skins: p.skins || [],
              equip: p.equip || {}
            };
          });
          populateLegacyDropdown(list);
          if (res.name && res.profile) {
            ACC.name = res.name;
            PROF.guest = false;
            applyProfile(res.profile);
            renderAcc();
          }
          if ($id('importFileStatus')) $id('importFileStatus').textContent = `已载入全备份包（共 ${list.length} 个账号）`;
          if ($id('importMsg')) {
            $id('importMsg').style.color = '#e9c46a';
            $id('importMsg').textContent = `成功恢复 ${list.length} 个账号，请在下拉框选择切换！`;
          }
          toast(`成功恢复 ${list.length} 个账号`);
          return;
        }

        // 格式 C: 老站 SQLite 导出文件 (users + profiles)
        const users = d.users || [];
        const profiles = d.profiles || [];
        if (!Array.isArray(users) || !users.length) throw new Error('导出文件中未发现有效玩家用户数据');

        const profById = {};
        for (const p of profiles) {
          if (p && p.user_id) profById[p.user_id] = p;
        }

        const list = users.map(u => {
          const p = profById[u.id] || {};
          const pdata = (p.data && typeof p.data === 'object') ? p.data : (typeof p.data === 'string' ? JSON.parse(p.data || '{}') : {});
          return {
            id: u.id,
            name: u.name,
            wins: u.wins || 0,
            losses: u.losses || 0,
            rating: p.rating || 1100,
            placed: p.placed || 0,
            ink: pdata.ink || 50,
            owned: pdata.owned || ['qingfeng'],
            frags: pdata.frags || {},
            pity: pdata.pity || 0,
            spity: pdata.spity || 0,
            skins: pdata.skins || [],
            equip: pdata.equip || {}
          };
        });

        populateLegacyDropdown(list);
        if ($id('importFileStatus')) $id('importFileStatus').textContent = `已读取 ${file.name}（${list.length} 个账号）`;
        if ($id('importMsg')) {
          $id('importMsg').style.color = '#e9c46a';
          $id('importMsg').textContent = `文件解析成功！请在下拉框中选择要继承的账号后点击【一键继承】`;
        }
        toast(`成功载入 ${list.length} 个账号数据`);
      } catch (err) {
        if ($id('importMsg')) {
          $id('importMsg').style.color = '#ff6b6b';
          $id('importMsg').textContent = '导入失败：' + err.message;
        }
        uiConfirm('文件解析失败：' + err.message, { alert: true });
      }
    };
    reader.readAsText(file);
  });
}

let lbKind = 'rank', lbTok = 0;
$id('lbTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { lbKind = b.dataset.k; openLeaderboard(); } });
// 排行榜：读取中、空榜、出错都用通用的 uiState 画在表格的位置上；说明文字只在有人上榜时显示
function lbShow(sub, state, rows) {
  $id('lbSub').textContent = sub; $id('lbSub').hidden = !sub;
  $id('lbState').innerHTML = state; $id('lbTable').innerHTML = rows;
}
async function openLeaderboard() {
  menuCam.tz = 1.35; showScreen('lb');
  const tok = ++lbTok, kind = lbKind;
  for (const b of $id('lbTabs').children) b.classList.toggle('sel', b.dataset.k === kind);
  lbShow('', uiState('loading', '正在读取排行榜…'), '');
  const fail = err => { if (tok === lbTok) lbShow('', uiState('error', (err && err.message) || '排行榜暂时读不到，稍后再试'), ''); };
  if (kind === 'rank') {
    // 以前这里请求的是网页自己所在网站的 /api/ranklb，GitHub Pages 上没有这个接口，榜单永远“读取失败”；现在走云端 Worker
    try {
      const j = await CloudSave.leaderboard('rank', rkSeason().id);
      if (tok !== lbTok) return;   // 读的时候换了标签：这份结果不要了
      if (!j.list.length) { lbShow('', uiState('empty', '还没有人完成定级赛。排位赛打满 3 场就能上榜！'), ''); return; }
      lbShow(`本赛季打满 ${RK.PLACE} 场定级赛后上榜。段位从低到高：${RK_TIERS.map(t => t.l + ' ' + t.n).join('、')}`, '',
        '<tr><th>名次</th><th>昵称</th><th>段位</th><th class="n">段位分</th></tr>' + j.list.map((r, i) =>
        `<tr class="${i < 3 ? 'top' + (i + 1) : ''}${r.me ? ' me' : ''}"><td class="rk">${i + 1}</td><td>${escapeHTML(r.name)}${r.me ? '（你）' : ''}</td><td>${escapeHTML(rkTier(r.pts).label + ' · ' + rkTier(r.pts).name)}</td><td class="n">${r.pts}</td></tr>`).join(''));
    } catch (err) { fail(err); }
    return;
  }
  try {
    const j = await CloudSave.leaderboard('wins');
    if (tok !== lbTok) return;
    if (!j.list.length) { lbShow('', uiState('empty', '还没有人打过联机——去赢下第一场吧！'), ''); return; }
    lbShow(`已注册玩家 ${j.players} 位，按联机胜场排`, '', '<tr><th>名次</th><th>昵称</th><th class="n">胜</th><th class="n">负</th><th class="n">胜率</th></tr>' + j.list.map((r, i) => {
      const g = r.wins + r.losses, rate = g ? Math.round(r.wins / g * 100) + '%' : '-';
      return `<tr class="${i < 3 ? 'top' + (i + 1) : ''}${r.me ? ' me' : ''}"><td class="rk">${i + 1}</td><td>${escapeHTML(r.name)}${r.me ? '（你）' : ''}</td><td class="n">${r.wins}</td><td class="n">${r.losses}</td><td class="n">${rate}</td></tr>`;
    }).join(''));
  } catch (err) { fail(err); }
}
$id('lbBack').addEventListener('click', backToMenu);
adaptLoad();

// 检查云端/本地已有登录并载入存档
if (window.CloudSave) {
  const cu = CloudSave.getUser();
  if (cu && cu.name) {
    ACC.name = cu.name;
    ACC.token = cu.uid;
    PROF.guest = false;
    CloudSave.loadProfile().then(p => {
      if (p) applyProfile(p);
      else CloudSave.saveProfile(PROF, true);
      renderAcc();
    }).catch(() => {});
  } else {
    PROF.guest = !OFFLINE_BUILD;   // 没登录就是游客：身份看账号，不看存档里那个会丢的标记（离线单文件版没有账号，不算游客）
    CloudSave.loadProfile().then(p => {
      if (p) applyProfile(p);
      renderAcc();
    }).catch(() => {});
  }
}

renderAcc();
