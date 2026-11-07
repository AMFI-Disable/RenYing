// 试验：格挡住飞行道具时，挡的人回 6 点气（被远程压的一方攒大招更快，有翻盘手段）。
(() => {
  const ah = applyHit; applyHit = function (att, def, m, pt) {
    const st = def.state, hold = def.ctrl && def.ctrl.held && def.ctrl.held.down, hp0 = def.hp;
    const r = ah.apply(this, arguments);
    if (m.isProj && !m.ult && !m.unblockable && (st === 'block' || st === 'blockstun' || hold) && def.onGround() && def.hp >= hp0 - (m.dmg || 0) * 0.5) def.meter = Math.min(100, def.meter + 6);
    return r;
  };
})();
