export default [
  {
    name: 'v1.5.0: trSamples works, replay pinning protects favorites from LRU eviction, and filter/preview work',
    fn: `(() => {
      if (typeof trSamples !== 'function') return { pass: false, error: 'trSamples missing' };
      const fakeM = { ch: [0, 1], w: 0, mode: 'cpu', tr: [[1,1,1,1,0,0,0,0,0.4,0.6,0,0,1,-1,1,1,0,0,1,8,0]], trStart: 0, trEvery: 4 };
      const samples = trSamples(fakeM);
      if (!Array.isArray(samples) || samples.length !== 1) return { pass: false, error: 'trSamples returned wrong count' };

      const list = [];
      for (let i = 0; i < 12; i++) list.push({ ch: [0, 1], t: 1000 + i, mode: i % 2 === 0 ? 'tag3' : 'cpu', w: 0, wins: [2, 0], frames: 240, v: VERSION, names: ['P1', 'AI'], pinned: i === 11 });
      rpTrimList(list);
      if (list.length !== RP_MAX) return { pass: false, error: 'rpTrimList did not cap to RP_MAX' };
      if (!list[0].pinned || list[0].t !== 1011) return { pass: false, error: 'pinned replay was evicted or not sorted first' };

      const pinnedOnly = rpFilterMatches(list, 'pinned', '');
      const tag3Only = rpFilterMatches(list, 'tag3', '');
      if (pinnedOnly.length !== 1 || tag3Only.length === 0) return { pass: false, error: 'rpFilterMatches failed' };

      const code = rpEncodeCode({ v: VERSION, kind: 'loc', mode: 'cpu', ch: [0, 1], w: 0, wins: [2, 0], frames: 360, t: Date.now(), st0: { M: {} }, ev: [] });
      const pv = rpCodePreviewText(code);
      if (!pv || !pv.includes('00:03')) return { pass: false, error: 'rpCodePreviewText failed: ' + pv };
      return { pass: true };
    })()`
  },
  {
    name: 'v1.5.0: Live Spectator HUD ticker shows Living Ink, 3v3 Assist readiness, and Synergy window',
    fn: `(() => {
      startTag3Match([0, 1, 2], [3, 4, 5], 'hard');
      M.phase = 'fight';
      M.watchAi = true;
      inkZoneInit();
      inkZoneSpawn(800, 0, 100, '20,20,30');
      B.synTag = { heroId: 'chixiao', team: 0, t: clock };
      SPEC_HUD.focusIdx = -1;
      specHudRender(true);
      const txt = ($id('specTicker') && $id('specTicker').textContent) || '';
      if (!txt.includes('1/12')) return { pass: false, error: 'Living Ink count missing in specTicker: ' + txt };
      if (!txt.includes('援')) return { pass: false, error: '3v3 Assist status missing in specTicker: ' + txt };
      if (!txt.includes('武学共鸣')) return { pass: false, error: 'Synergy indicator missing in specTicker: ' + txt };
      return { pass: true };
    })()`
  },
  {
    name: 'v1.5.0: rkPeakArchive computes all-time peak across PROF.rkHist and current season',
    fn: `(() => {
      const prevHist = PROF.rkHist;
      PROF.rkHist = { S1: { pts: 1520, peak: 1680, label: 'A+' } };
      const arch = rkPeakArchive({ peak: 1400 });
      PROF.rkHist = prevHist;
      if (arch.bestPts !== 1680 || arch.bestSeason !== 'S1' || arch.entries.length !== 1) {
        return { pass: false, error: 'rkPeakArchive mismatch: ' + JSON.stringify(arch) };
      }
      return { pass: true };
    })()`
  }
];
