Object.assign(ULTS, {
  // ---- 玉箫 · 大招 E：广陵散（guangling） ----
  guangling: { name: '广陵散', desc: '奏一曲广陵散：六道音刃从左右两侧轮番穿过对手（每道 14 伤害），曲终一记【绝响】从对手脚下炸开（60 伤害，身上每枚音律再 +15，不可格挡，挑空）。曲罢音律回满，清音冷却清零。',
    begin(f) { f.sp = 'cast'; f.spN = 0; f.spPose = 'yx_play'; f.invul = 0.3; SFX.superOn(); },
    update(f, foe) {
      const T = [0.05, 0.2, 0.35, 0.5, 0.65, 0.8];
      if (f.spN < 6 && f.t >= T[f.spN]) {
        const sd = f.spN % 2 ? 1 : -1; f.spN++;
        f.spPose = f.spN % 2 ? 'yx_play' : 'yx_push'; SFX.note(f.spN % 4);
        spawnProj(f, { kind: 'note', x: clamp(foe.x + sd * 520, -280, STAGE_W + 280), y: foe.y - 50 - (f.spN % 3) * 18, vx: -sd * 1100, w: 50, h: 50, life: 0.9, dmg: 14, kb: [60, 0], stun: 0.3, hs: 0.03, ult: true, noScale: true, pierce: true, maxHits: 1, notes: 0 });   // 出生点要在出界回收线（±300）以内，贴着墙放的这一局才有六道音刃
      }
      if (f.spN === 6 && f.t >= 1.0) {
        f.spN = 7; f.spPose = 'yx_push';
        spawnProj(f, { kind: 'chord', vx: 0, x: foe.x, y: -100, delay: 0.12, track: 8, trackEnd: 0.03, w: 190, h: 200, life: 0.42, dmg: 60 + 15 * Math.min(3, f.notes || 0), kb: [300, -760], stun: 0.6, hs: 0.18, launch: true, unblockable: true, ult: true, noScale: true, big: true, unbreakable: true });
        f.notes = 3; f.skillCD = 0;
        addP({ type: 'text', text: '曲终绝响 · 音律回满', x: f.x, y: f.y - 120, life: 1.1, max: 1.1, rgb: '150,240,200' });
      }
      if (f.t >= 1.35) endSpecial(f);
    } },
});
