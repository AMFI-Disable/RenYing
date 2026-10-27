// 试验：只改几个技能的冷却和墨羽墨团的瞄准，不动伤害、气血和角色定位。
// TWEAKS 环境变量可以只开其中几项（逗号分隔），不写就全开。
(() => {
  const on = k => !window.__TWEAKS || window.__TWEAKS.includes(k);
  // 墨羽：普攻甩出的墨团不再自动飞向对手，固定落在身前约 220 像素（远处要自己找角度）
  if (on('ink')) { const sp = spawnProj; spawnProj = function (f, o) {
    if (o.kind === 'inkblob') { const T = 0.42, G = o.g, tx = f.x + f.face * 220, ty = -60; o = { ...o, vx: (tx - o.x) / T, vy: (ty - o.y - 0.5 * G * T * T) / T }; }
    return sp.call(this, f, o); }; }
  if (on('wind')) SKILLS.windblade.cd = 4.0;      // 流云 风刃 3.0 → 4.0
  if (on('moon')) SKILLS.moonring.cd = 4.5;       // 月华 月轮 3.5 → 4.5
  if (on('gale')) SKILLS.gale.cd = 6.0;           // 青锋 疾风斩 5 → 6
  if (on('spindle')) SKILLS.spindle.cd = 5.0;     // 凌雀 穿叶飞梭 6.5 → 5（更容易挂上雀芒）
  if (on('hook')) SKILLS.hook.cd = 4.0;           // 勾陈 飞锤 5 → 4
  if (on('whirl')) SKILLS.whirl.cd = 5.0;         // 勾陈 旋锤 6 → 5
})();
