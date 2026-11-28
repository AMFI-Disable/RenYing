/* ---------- 总览看板 ---------- */
async function vHome() {
  const [s, a] = await Promise.all([api('stats'), api('audit')]);
  const rows = a.rows.slice(0, 8);
  const inkNet = (s.inkIn24 || 0) - (s.inkOut24 || 0);
  const sh = s.d1Shield || {};
  const err24 = s.errors24 || { types: 0, total: 0 };
  const dbRows = s.dbRows || {};
  const dbTotal = Object.values(dbRows).reduce((sum, n) => sum + (+n || 0), 0);
  const topModes = Array.isArray(s.topModes7d) ? s.topModes7d : [];
  const ai = s.aiSummary || { heroes: 20, modes: 10, difficulties: 5 };
  const shieldOk = !sh.tripped;
  const rPct = sh.readCap ? Math.min(100, Math.round(((sh.reads || 0) / sh.readCap) * 100)) : 0;
  const wPct = sh.writeCap ? Math.min(100, Math.round(((sh.writes || 0) / sh.writeCap) * 100)) : 0;
  return H`<div class="tiles kpi">
      ${tile('实时在线', unit(s.online || 0, '人'), `对战 ${fmtN(s.playing || 0)} · 匹配 ${fmtN(s.waiting || 0)}`)}
      ${tile('注册账号', s.users, '24h 新增 ' + fmtN(s.newToday))}
      ${tile('活跃武库', s.accounts, '全服墨锭 ' + fmtN(s.inkTotal))}
      ${tile('24h 墨锭净增', (inkNet > 0 ? '+' : '') + fmtN(inkNet), `流入 +${fmtN(s.inkIn24 || 0)} / 流出 ${fmtN(s.inkOut24 || 0)}`)}
      ${tile('市场成交 (24h)', unit(s.deals24, '单'), `在卖 ${fmtN(s.open)} 单 · ${fmtN(s.dealInk24)} 墨`)}
      ${tile('封禁 / 软删', H`${fmtN(s.banned)}<small>封</small> / ${fmtN(s.deleted || 0)}<small>删</small>`, `24h 开箱 ${fmtN(s.open24 || 0)} 次`)}
    </div>
    <div class="dash-2col">
      <div class="card">
        <div class="row between wrap">
          <h2>系统健康与服务状态</h2>
          <span class="badge ${shieldOk && err24.total === 0 ? 'ok' : shieldOk ? 'gold' : 'bad'}">${shieldOk ? (err24.total ? '运行正常 · 有告警' : '健康在线') : 'D1 配额保护已触发'}</span>
        </div>
        <div class="kv-list">
          <div class="kv-row"><span>服务版本 / 服务器时间</span><b>v${s.version || '1.1.0'} · ${fmtT(s.now)}</b></div>
          <div class="kv-row"><span>24h 异常监控</span><b><button class="link" data-act="tab" data-tab="errors">${fmtN(err24.types)} 种 / ${fmtN(err24.total)} 次</button></b></div>
          <div class="kv-row"><span>D1 读配额保护</span><b>${sh.reads !== undefined ? `${fmtN(sh.reads)} / ${fmtN(sh.readCap || 0)} (${rPct}%)` : '正常监控中'}</b></div>
          ${sh.readCap ? H`<div class="qbar${rPct >= 80 ? ' warn' : ''}"><i style="width:${rPct}%"></i></div>` : ''}
          <div class="kv-row"><span>D1 写配额保护</span><b>${sh.writes !== undefined ? `${fmtN(sh.writes)} / ${fmtN(sh.writeCap || 0)} (${wPct}%)` : '正常监控中'}</b></div>
          ${sh.writeCap ? H`<div class="qbar${wPct >= 80 ? ' warn' : ''}"><i style="width:${wPct}%"></i></div>` : ''}
        </div>
      </div>
      <div class="card">
        <div class="row between wrap">
          <h2>D1 数据库资源概览</h2>
          <button class="btn ghost sm" data-act="tab" data-tab="maint">维护与清理</button>
        </div>
        <p class="hint" style="margin:4px 0 6px">核心业务表实时行数（合计 ${fmtN(dbTotal)} 行），建议定期清理 30 天前陈旧流水与过期会话。</p>
        <div class="kv-list">
          <div class="kv-row"><span>玩家账号 (users) / 武库存档 (econ)</span><b>${fmtN(dbRows.users || 0)} / ${fmtN(dbRows.econ || 0)}</b></div>
          <div class="kv-row"><span>经济与审计流水 (econ_log)</span><b>${fmtN(dbRows.econ_log || 0)} 行</b></div>
          <div class="kv-row"><span>玩家市场记录 (mkt)</span><b>${fmtN(dbRows.mkt || 0)} 行</b></div>
          <div class="kv-row"><span>登录安全日志 (auth_log) / 错误表 (errs)</span><b>${fmtN(dbRows.auth_log || 0)} / ${fmtN(dbRows.errs || 0)}</b></div>
        </div>
      </div>
    </div>
    <div class="dash-2col">
      ${drawSparkline(s.signups7d) || H`<div class="card"><h2>近 7 天新注册走势</h2><p class="empty">暂无注册数据</p></div>`}
      ${drawInkFlowChart(s.inkFlow7d, s.caseCounts7d) || H`<div class="card"><h2>近 7 天经济流速</h2><p class="empty">暂无经济流水</p></div>`}
    </div>
    <div class="dash-2col">
      <div class="card">
        <div class="row between wrap">
          <h2>游戏统计与 AI 基准信息</h2>
          <button class="btn ghost sm" data-act="tab" data-tab="play">完整游玩统计</button>
        </div>
        <div class="kv-list">
          <div class="kv-row"><span>当前阵容与模式</span><b>${ai.heroes} 位侠客 · ${ai.modes} 种模式 · ${ai.difficulties} 档 AI</b></div>
          <div class="kv-row"><span>团战战术与 AI 引擎</span><b>智策自适配 (238 万帧验证 · 62–74% 胜率)</b></div>
          <div class="kv-row"><span>近 7 天热门模式</span><b>${topModes.length ? topModes.map(m => `${PLAY_MODE_NAME[m.mode] || m.mode} (${fmtN(m.n)})`).join(' · ') : '暂无开局统计'}</b></div>
        </div>
      </div>
      <div class="card">
        <div class="row between wrap"><h2>常用管理与快捷入口</h2><button class="btn ghost sm" data-act="cmdk">⌘K 快捷面板</button></div>
        <div class="row wrap" style="margin-top:8px">
          <button class="btn ghost sm" data-act="tab" data-tab="players">玩家管理与排序</button>
          <button class="btn ghost sm" data-act="tab" data-tab="gifts">发全服补偿</button>
          <button class="btn ghost sm" data-act="tab" data-tab="codes">建兑换码</button>
          <button class="btn ghost sm" data-act="tab" data-tab="flags">功能开关与横幅</button>
          <button class="btn ghost sm" data-act="tab" data-tab="maint">天魔、长卷与清理</button>
          <button class="btn ghost sm" data-act="tab" data-tab="audit">操作审计记录</button>
          <button class="btn ghost sm" data-act="tab" data-tab="errors">错误诊断与导出</button>
        </div>
        ${(S.role === 'econ' || S.role === 'all') ? H`<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--line)">
          <div class="row between wrap"><span class="hint">全服饰品巡检（仅查有获得记录且去向不明的饰品，扫描不改号）</span><button class="btn ghost sm" data-act="scanlost">扫描全部账号</button></div>
          ${S.lostScan ? H`<p style="margin-top:6px">已扫描 ${S.lostScan.scanned} 个账号；${S.lostScan.matches.length} 个账号共 ${S.lostScan.matches.reduce((n, x) => n + x.ids.length, 0)} 件可找回。</p>${S.lostScan.matches.length ? H`<div class="chips">${S.lostScan.matches.map(x => H`<label class="chip"><input type="checkbox" name="lostAccount" value="${x.uid}"> ${x.username} · ${x.ids.length} 件</label>`)}</div><div class="row wrap"><button class="btn ghost sm" data-act="selectlostaccounts">全选账号</button><button class="btn sm" data-act="restoreunknown">找回所选账号…</button></div>` : ''}` : ''}
        </div>` : ''}
      </div>
    </div>
    <div class="card"><div class="row between"><h2>最近的操作</h2><button class="btn ghost sm" data-act="tab" data-tab="audit">全部记录</button></div>
      ${rows.length ? H`<div class="tw"><table><thead><tr><th>时间</th><th>谁</th><th>做了什么</th><th>对象</th><th>内容</th></tr></thead><tbody>
        ${rows.map(r => { const d = parse(r.detail) || {}; return H`<tr><td class="nowrap">${fmtT(r.at)}</td><td>${d.by || '—'}</td><td class="nowrap"><span class="badge${r.act === 'adm_digest' ? ' gold' : ''}">${ACT[r.act] || r.act}</span></td><td>${target(r)}</td><td class="detail">${detailText(r.act, r.detail)}${d.why ? H`<div class="hint">原因：${d.why}</div>` : ''}</td></tr>`; })}
      </tbody></table></div>` : H`<p class="empty">还没有管理员操作</p>`}
    </div>`;
}
