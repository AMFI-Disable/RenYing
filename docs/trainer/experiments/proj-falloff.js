// 试验：飞行道具飞得越远伤害越低（飞 0 像素 100%，每 100 像素 -6%，最低 50%）。远程角色站远了打不疼，贴近了照样疼。
(() => {
  const sp = spawnProj; spawnProj = function (f, o) { return sp.call(this, f, { x0: o.x, ...o }); };
  const ah = applyHit; applyHit = function (att, def, m, pt) {
    if (m.isProj && !m.ult && m.dmg && m.x0 !== undefined) m = { ...m, dmg: m.dmg * Math.max(0.5, 1 - Math.abs(m.x - m.x0) / 100 * 0.06) };
    return ah.call(this, att, def, m, pt);
  };
})();
