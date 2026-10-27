// 试验：每人场上最多 2 个会伤人的飞行道具，再放就把最早那个收掉（不能用一屏暗器封路）。
(() => {
  const sp = spawnProj; spawnProj = function (f, o) {
    const r = sp.apply(this, arguments);
    if (o.dmg > 0 && !o.fx && !o.ult) {
      const mine = projs.filter(p => !p.dead && p.owner === f.idx && p.dmg > 0 && !p.fx && !p.ult);
      for (let i = 0; i < mine.length - 2; i++) mine[i].dead = true;
    }
    return r;
  };
})();
