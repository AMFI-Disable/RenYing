#!/usr/bin/env node
// Deterministic AI-only relay exploration. This is not a substitute for player testing.
import { makeEnv } from './ai-arena.mjs';

const overrides = ['AI_BAL', 'AI_EXP', 'AI_SNAP', 'AI_FULL', 'TWEAKS'].filter(k => process.env[k]);
if (overrides.length) throw new Error(`Unset simulation overrides before running this study: ${overrides.join(', ')}`);

const maps = ['cliff', 'ice', 'bamboo', 'thunder', 'pagoda', 'wine'];
const pairs = [
  [[0, 3, 14], [1, 5, 15]],
  [[6, 9, 13], [2, 7, 11]],
];
const env = await makeEnv();
const results = [];
for (let mi = 0; mi < maps.length; mi++) for (let trial = 0; trial < 4; trial++) {
  const map = maps[mi], seed = 8100 + trial;
  const pair = pairs[Math.floor(trial / 2)];
  const teams = trial % 2 ? [pair[1], pair[0]] : pair;
  env.seed(seed);
  const result = env.run(`(() => {
    const teams = ${JSON.stringify(teams)};
    M.map = ${JSON.stringify(map)}; teamMutator = 'normal';
    const prep = preMatchCreate(M.map, ${seed}); preMatchSetPicks(prep, teams);
    for (let s = 0; s < 2; s++) for (let i = 0; i < 3; i++) preMatchSelect(prep, s, i, prep.recommendations[s][i]);
    M.competitiveScrolls = competitiveScrollMap(prep); M.hasBuffs = true;
    startTag3Match(teams[0], teams[1], 'normal', true);
    let frames = 0, fightFrames = 0, maxDeficit = [0, 0];
    const limit = 120 * 60 * 16;
    while (M.phase !== 'end' && frames < limit) {
      if (M.phase === 'fight') fightFrames++;
      step(); frames++;
      maxDeficit[0] = Math.max(maxDeficit[0], M.teamIdx[0] - M.teamIdx[1]);
      maxDeficit[1] = Math.max(maxDeficit[1], M.teamIdx[1] - M.teamIdx[0]);
    }
    const winner = M.phase === 'end' ? (M.teamIdx[0] < M.teamIdx[1] ? 0 : M.teamIdx[1] < M.teamIdx[0] ? 1 : M.wins[0] >= M.wins[1] ? 0 : 1) : -1;
    return { frames, fightFrames, round: M.round, winner, maxDeficit, complete: M.phase === 'end' };
  })()`);
  results.push({ map, seed, teams, heroIds: teams.map(team => team.map(i => env.CHARS[i].id)), ...result });
  console.log(JSON.stringify(results.at(-1)));
}
if (results.some(r => !r.complete)) process.exitCode = 1;
