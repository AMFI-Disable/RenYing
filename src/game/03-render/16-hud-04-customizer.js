// =====================================================================
//  Per-Mode Customizable Combat HUD & 3 Consistent Display Presets
//  Presets: verbose (详尽) / normal (常规) / quiet (静默 — HP & Fury only)
// =====================================================================
const HUD_CFG_KEY = 'renying-hud-cfg-v2';
const HUD_PRESETS = {
  verbose: {
    name: '详尽', en: 'Verbose', desc: '显示全部招式、冷却、点穴状态、物理动量、平衡架势、小地图与快捷键提示',
    vis: { playerBar: true, enemyBar: true, skillBar: true, minimap: true, physicsGauge: true, comboMeter: true, squadBar: true, keyHints: true },
  },
  normal: {
    name: '常规', en: 'Normal', desc: '保留气血、真气、核心招式冷却与团战小地图，精简招式详情',
    vis: { playerBar: true, enemyBar: true, skillBar: true, minimap: true, physicsGauge: false, comboMeter: true, squadBar: true, keyHints: false },
  },
  quiet: {
    name: '静默', en: 'Quiet', desc: '极简沉浸：仅保留气血与真气条',
    vis: { playerBar: true, enemyBar: true, skillBar: false, minimap: false, physicsGauge: false, comboMeter: false, squadBar: false, keyHints: false },
  },
};
const HUD_ELEMENTS = [
  { id: 'playerBar', name: '我方气血与真气', dx: 0, dy: 0 },
  { id: 'enemyBar', name: '敌方气血与真气', dx: 0, dy: 0 },
  { id: 'skillBar', name: '招式与灵宠冷却栏', dx: 0, dy: 0 },
  { id: 'minimap', name: '大型战场小地图', dx: 0, dy: 0 },
  { id: 'physicsGauge', name: '物理动量/平衡/点穴仪', dx: 0, dy: 0 },
  { id: 'comboMeter', name: '连击与合击计数', dx: 0, dy: 0 },
  { id: 'squadBar', name: '小队指令与团战计分', dx: 0, dy: 0 },
  { id: 'keyHints', name: '底部快捷键提示', dx: 0, dy: 0 },
];
let HUD_STORE = {};
try { HUD_STORE = JSON.parse(localStorage.getItem(HUD_CFG_KEY) || '{}') || {}; } catch (e) { HUD_STORE = {}; }
function saveHudStore() {
  try { localStorage.setItem(HUD_CFG_KEY, JSON.stringify(HUD_STORE)); } catch (e) {}
}
function hudModeKey() {
  return (typeof M !== 'undefined' && M && M.mode) ? String(M.mode) : 'cpu';
}
function hudConfigForMode(mode) {
  const k = mode || hudModeKey();
  const saved = HUD_STORE[k] || {};
  const preset = HUD_PRESETS[saved.preset] ? saved.preset : (HUD_STORE._defaultPreset || 'normal');
  const baseVis = HUD_PRESETS[preset].vis;
  const elems = {};
  for (const el of HUD_ELEMENTS) {
    const o = (saved.elems && saved.elems[el.id]) || {};
    elems[el.id] = {
      visible: o.visible !== undefined ? !!o.visible : !!baseVis[el.id],
      ox: Number.isFinite(+o.ox) ? clamp(+o.ox, -400, 400) : 0,
      oy: Number.isFinite(+o.oy) ? clamp(+o.oy, -240, 240) : 0,
      scale: Number.isFinite(+o.scale) ? clamp(+o.scale, 0.6, 1.6) : 1,
    };
  }
  return { mode: k, preset, elems };
}
function hudPreset(mode) { return hudConfigForMode(mode).preset; }
function hudElemCfg(elId, mode) { return hudConfigForMode(mode).elems[elId] || { visible: true, ox: 0, oy: 0, scale: 1 }; }
function hudShow(elId, mode) { return !!hudElemCfg(elId, mode).visible; }
function setHudPreset(preset, applyAll) {
  if (!HUD_PRESETS[preset]) return;
  if (applyAll) {
    HUD_STORE._defaultPreset = preset;
    for (const k of Object.keys(HUD_STORE)) {
      if (k !== '_defaultPreset' && HUD_STORE[k]) HUD_STORE[k] = { preset, elems: {} };
    }
  } else {
    const k = hudModeKey();
    HUD_STORE[k] = { preset, elems: {} };
  }
  saveHudStore();
}
function updateHudElem(elId, patch, mode) {
  const k = mode || hudModeKey();
  const cur = hudConfigForMode(k);
  if (!HUD_STORE[k]) HUD_STORE[k] = { preset: cur.preset, elems: {} };
  if (!HUD_STORE[k].elems) HUD_STORE[k].elems = {};
  HUD_STORE[k].elems[elId] = { ...cur.elems[elId], ...patch };
  saveHudStore();
}
function resetHudMode(mode) {
  const k = mode || hudModeKey();
  delete HUD_STORE[k];
  saveHudStore();
}

// 详尽模式：物理引擎动量、平衡、架势、居合蓄势与点穴状态实时仪表
function drawPhysicsTelemetryHUD() {
  if (typeof M === 'undefined' || M.mode === 'demo' || !hudShow('physicsGauge')) return;
  const f = (typeof hudLocalPlayer === 'function' ? hudLocalPlayer() : (typeof A !== 'undefined' ? A : null));
  if (!f || !f.ch) return;
  const cfg = hudElemCfg('physicsGauge');
  const tel = (typeof RYPhysics !== 'undefined' && RYPhysics.getTelemetry) ? RYPhysics.getTelemetry(f) : null;
  const W = typeof cv !== 'undefined' ? cv.width : 1280;
  const H = typeof cv !== 'undefined' ? cv.height : 720;
  const bx = Math.round(18 + cfg.ox), by = Math.round(H - 134 + cfg.oy);
  ctx.save();
  ctx.translate(bx, by);
  ctx.scale(cfg.scale, cfg.scale);
  ctx.fillStyle = 'rgba(10,12,26,0.78)';
  ctx.strokeStyle = 'rgba(233,196,106,0.38)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(0, 0, 268, 78, 8); else ctx.rect(0, 0, 268, 78);
  ctx.fill(); ctx.stroke();

  const bal = tel ? Math.round(tel.balance) : 100;
  const spd = tel ? Math.round(tel.speed) : Math.round(Math.hypot(f.vx || 0, f.vy || 0));
  const ke = tel ? Math.round(tel.kineticEnergy) : 0;
  const iaido = tel ? Math.round((tel.iaidoCharge || 0) * 100) : 0;
  const acu = tel && tel.acupoints ? tel.acupoints.length : (f.acupointT > 0 ? 1 : 0);
  const moveNm = f.move || f.state || 'idle';

  ctx.font = `bold 11.5px ${BODY_FONT}`;
  ctx.fillStyle = '#e9c46a';
  ctx.fillText(`武学物理 · ${moveNm} · 速度 ${spd} · 动能 ${ke}`, 10, 17);
  // Balance bar
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(10, 25, 118, 7);
  ctx.fillStyle = bal > 45 ? '#74d9ad' : bal > 20 ? '#e9c46a' : '#ff6e64';
  ctx.fillRect(10, 25, Math.round(118 * clamp(bal / 100, 0, 1)), 7);
  ctx.font = `10.5px ${BODY_FONT}`; ctx.fillStyle = '#efe8d8';
  ctx.fillText(`平衡 ${bal}%`, 10, 44);
  // Iaido / Acupoint bar
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(138, 25, 118, 7);
  ctx.fillStyle = '#c88cff';
  ctx.fillRect(138, 25, Math.round(118 * clamp(iaido / 100, 0, 1)), 7);
  ctx.fillText(`居合 ${iaido}% · 封脉 ${acu}`, 138, 44);
  // Keybind quick-strip in Verbose
  ctx.fillStyle = 'rgba(239,232,216,0.72)';
  ctx.fillText('J轻 U重 I腿 O居合 H擒拿 C虚招 F弹反 V灵宠', 10, 64);
  ctx.restore();
}

// 交互式分模式 HUD 自定义面板（可拖拽偏移、缩放、显隐单项与三档预设切换）
function openHudCustomizer() {
  let dlg = $id('hudCustomModal');
  if (!dlg) {
    dlg = document.createElement('div');
    dlg.id = 'hudCustomModal';
    dlg.className = 'hud-custom-modal';
    document.body.appendChild(dlg);
  }
  const renderModal = () => {
    const cfg = hudConfigForMode();
    const presetBtns = Object.entries(HUD_PRESETS).map(([k, p]) =>
      `<button type="button" class="${cfg.preset === k ? 'go' : 'ghost'} small" data-hc-preset="${k}" title="${p.desc}">${p.name} (${p.en})</button>`
    ).join('');
    const rows = HUD_ELEMENTS.map(el => {
      const c = cfg.elems[el.id];
      return `<div class="hc-row">
        <label class="hc-chk"><input type="checkbox" data-hc-vis="${el.id}" ${c.visible ? 'checked' : ''}><span>${el.name}</span></label>
        <label class="hc-sl">X<input type="range" min="-300" max="300" step="10" value="${c.ox}" data-hc-ox="${el.id}"><small>${c.ox}</small></label>
        <label class="hc-sl">Y<input type="range" min="-180" max="180" step="10" value="${c.oy}" data-hc-oy="${el.id}"><small>${c.oy}</small></label>
        <label class="hc-sl">缩放<input type="range" min="0.6" max="1.6" step="0.05" value="${c.scale}" data-hc-sc="${el.id}"><small>${Math.round(c.scale * 100)}%</small></label>
      </div>`;
    }).join('');
    dlg.innerHTML = `<div class="hc-card">
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px">
        <h3 style="margin:0;color:var(--gold)">界面与 HUD 自定义（当前模式：${cfg.mode}）</h3>
        <button type="button" class="ghost small" data-hc-close="1">关闭</button>
      </div>
      <p style="font-size:12.5px;color:var(--dim);margin:0 0 10px">每个游戏模式均可独立保存界面布局、大小、位置与显隐；也可一键应用三档预设到所有模式。</p>
      <div class="row" style="gap:6px;flex-wrap:wrap;margin-bottom:10px">${presetBtns}<button type="button" class="ghost small" data-hc-applyall="1">将当前预设应用到全部模式</button><button type="button" class="ghost small" data-hc-reset="1">恢复本模式默认</button></div>
      <div class="hc-list">${rows}</div>
    </div>`;
  };
  renderModal();
  dlg.style.display = 'flex';
  dlg.onclick = e => {
    if (e.target === dlg) { dlg.style.display = 'none'; return; }
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.hcClose) { dlg.style.display = 'none'; return; }
    if (b.dataset.hcPreset) { setHudPreset(b.dataset.hcPreset, false); renderModal(); return; }
    if (b.dataset.hcApplyall) { setHudPreset(hudPreset(), true); if (typeof toast === 'function') toast('已将当前界面预设同步到全部模式'); renderModal(); return; }
    if (b.dataset.hcReset) { resetHudMode(); renderModal(); return; }
  };
  dlg.oninput = e => {
    const t = e.target;
    if (t.dataset.hcVis) updateHudElem(t.dataset.hcVis, { visible: t.checked });
    else if (t.dataset.hcOx) { updateHudElem(t.dataset.hcOx, { ox: +t.value }); if (t.nextSibling) t.nextSibling.textContent = t.value; }
    else if (t.dataset.hcOy) { updateHudElem(t.dataset.hcOy, { oy: +t.value }); if (t.nextSibling) t.nextSibling.textContent = t.value; }
    else if (t.dataset.hcSc) { updateHudElem(t.dataset.hcSc, { scale: +t.value }); if (t.nextSibling) t.nextSibling.textContent = Math.round(+t.value * 100) + '%'; }
  };
}
if (typeof window !== 'undefined') {
  window.HUD_PRESETS = HUD_PRESETS;
  window.hudPreset = hudPreset;
  window.hudShow = hudShow;
  window.hudElemCfg = hudElemCfg;
  window.setHudPreset = setHudPreset;
  window.openHudCustomizer = openHudCustomizer;
}
