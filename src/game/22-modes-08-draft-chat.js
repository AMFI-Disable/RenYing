// ======================= 选人时聊天和表情 =======================
const FACE = (inner, fill = '#f4ead5') => `<svg viewBox="0 0 48 48"><circle cx="24" cy="25" r="19" fill="${fill}" stroke="#1a1426" stroke-width="2.6"/>${inner}</svg>`;
const SEAL = (a, b) => `<svg viewBox="0 0 48 48"><rect x="5" y="5" width="38" height="38" rx="4" fill="#b8392e" transform="rotate(-4 24 24)"/><rect x="9" y="9" width="30" height="30" rx="2" fill="none" stroke="rgba(255,240,225,.6)" stroke-width="1.4" transform="rotate(-4 24 24)"/><text x="24" y="23" font-family="Ma Shan Zheng, STKaiti, KaiTi, serif" font-size="15" fill="#fbeee0" text-anchor="middle">${a}</text><text x="24" y="38" font-family="Ma Shan Zheng, STKaiti, KaiTi, serif" font-size="15" fill="#fbeee0" text-anchor="middle">${b}</text></svg>`;
const K = 'stroke="#1a1426" stroke-width="2.4" fill="none" stroke-linecap="round"';
const EMOTES = [
  { id: 'hi', name: '你好', svg: FACE(`<path d="M15 23q3-4 6 0M27 23q3-4 6 0" ${K}/><path d="M17 31q7 6 14 0" ${K}/><circle cx="13" cy="29" r="3" fill="#f2a1a1"/><circle cx="35" cy="29" r="3" fill="#f2a1a1"/>`) },
  { id: 'haha', name: '哈哈', svg: FACE(`<path d="M14 22q4-5 7 0M27 22q4-5 7 0" ${K}/><path d="M15 28h18q-2 11-9 11t-9-11z" fill="#7a1f2a" stroke="#1a1426" stroke-width="2"/><path d="M11 20q-3 6 1 8" stroke="#6fc3ff" stroke-width="3" fill="none" stroke-linecap="round"/>`) },
  { id: 'cry', name: '呜呜', svg: FACE(`<path d="M15 22h6M27 22h6" ${K}/><path d="M18 24v13M30 24v13" stroke="#6fc3ff" stroke-width="3.2" stroke-linecap="round"/><path d="M19 35q5-4 10 0" ${K}/>`) },
  { id: 'angry', name: '生气', svg: FACE(`<path d="M14 18l8 4M34 18l-8 4" ${K}/><circle cx="19" cy="25" r="2.2" fill="#1a1426"/><circle cx="29" cy="25" r="2.2" fill="#1a1426"/><path d="M17 35q7-5 14 0" ${K}/><path d="M35 9l3 3m0-3l-3 3" stroke="#b8392e" stroke-width="2.4" stroke-linecap="round"/>`, '#ffc7b8') },
  { id: 'shock', name: '震惊', svg: FACE(`<circle cx="18" cy="23" r="4.5" fill="#fff" stroke="#1a1426" stroke-width="2"/><circle cx="30" cy="23" r="4.5" fill="#fff" stroke="#1a1426" stroke-width="2"/><circle cx="18" cy="23" r="1.6" fill="#1a1426"/><circle cx="30" cy="23" r="1.6" fill="#1a1426"/><ellipse cx="24" cy="34" rx="3.5" ry="4.5" fill="#1a1426"/>`) },
  { id: 'cool', name: '淡定', svg: FACE(`<path d="M11 21h26v3q-1 5-6 5t-6-5h-2q-1 5-6 5t-6-5z" fill="#1a1426"/><path d="M19 34q7 3 11-2" ${K}/>`) },
  { id: 'fight', name: '来战', svg: SEAL('来', '战') },
  { id: 'gg', name: '好局', svg: SEAL('好', '局') },
  { id: 'bow', name: '承让', svg: SEAL('承', '让') },
];
const EMO = Object.fromEntries(EMOTES.map(e => [e.id, e]));
let chatLastT = 0;
function chatClear() { $id('chatLog').innerHTML = ''; for (const b of document.querySelectorAll('.bubble')) b.remove(); }
function chatAdd(side, c) {
  const log = $id('chatLog'), mine = side === bpMySide();
  const who = mine ? '你' : bpSideName(side), col = side === 0 ? 'var(--p1)' : 'var(--p2)';
  const body = c.k === 'e' && EMO[c.v] ? `<span class="emo" title="${EMO[c.v].name}">${EMO[c.v].svg}</span>` : `<span>${escapeHTML(String(c.v).slice(0, 40))}</span>`;
  const ln = document.createElement('div'); ln.className = 'ln';
  ln.innerHTML = `<span class="who" style="color:${col}">${escapeHTML(who)}</span>${body}`;
  log.appendChild(ln); log.scrollTop = log.scrollHeight;
  const box = $id('bpS' + side); if (!box) return;
  for (const b of box.querySelectorAll('.bubble')) b.remove();
  const bb = document.createElement('div'); bb.className = 'bubble'; bb.innerHTML = body; box.appendChild(bb);
  setTimeout(() => bb.remove(), 3200);
}
function chatSend(c) {
  if (bpMode !== 'net' || !NET.open) return;
  const now = performance.now(); if (now - chatLastT < 700) return; chatLastT = now;
  send({ chat: c }); chatAdd(bpMySide(), c); sTone(700, 900, 0.08, 0.04);
}
function chatRecv(c) {
  if (!c || (c.k !== 't' && c.k !== 'e')) return;
  chatAdd(1 - bpMySide(), c); sTone(900, 700, 0.1, 0.05);
}
$id('emoBar').innerHTML = EMOTES.map(e => `<button data-e="${e.id}" title="${e.name}" aria-label="${e.name}">${e.svg}</button>`).join('');
$id('emoBar').addEventListener('click', e => { const b = e.target.closest('button'); if (b) chatSend({ k: 'e', v: b.dataset.e }); });
function chatSendText() { const v = $id('chatIn').value.trim(); if (!v) return; $id('chatIn').value = ''; chatSend({ k: 't', v: v.slice(0, 40) }); }
$id('chatSend').addEventListener('click', chatSendText);
$id('chatIn').addEventListener('keydown', e => { if (e.key === 'Enter') chatSendText(); });

// ======================= 禁用与选人 =======================
// 顺序：1P 禁用 → 2P 禁用 → 1P 选人 → 2P 选人。联机时由房主记录结果并同步。
const BP_STEPS = BP_ORDERS.duel;   // 各模式的点将台顺序在 src/data/11-bp-orders.js，哪个模式用哪个在 src/data/10-modes.js
const bpSteps = () => (BP && BP.steps) || BP_STEPS;
const isMultiPickBP = () => !!(BP && Array.isArray(BP.picks) && Array.isArray(BP.picks[0]));
const isLocalBothHumanBP = () => bpMode === '2v2' && !!(bpCustomOpts && bpCustomOpts.subMode === 'pp_pp');
const isMyTurnBP = () => {
  if (!BP || BP.step >= bpSteps().length) return false;
  const isWatch = bpMode === 'cpuWatch' || (bpCustomOpts && bpCustomOpts.isWatch);
  if (isWatch) return false;
  if (isLocalBothHumanBP()) return true;
  // 2v2 p_cc: 玩家只操控 Side 0 的第 1 个席位（禁选第一手），队友由电脑自动挑选
  if (bpMode === '2v2' && bpCustomOpts && bpCustomOpts.subMode === 'p_cc') {
    const curStep = bpSteps()[BP.step];
    if (curStep[0] !== bpMySide()) return false;
    // Side 0 的第 2 个 pick 归电脑队友
    const priorPicksSide0 = bpSteps().slice(0, BP.step).filter(st => st[0] === 0 && st[1] === 'pick').length;
    if (curStep[1] === 'pick' && priorPicksSide0 >= 1) return false;
    return true;
  }
  return bpSteps()[BP.step][0] === bpMySide();
};
let BP = null, bpMode = 'cpu', bpSel = -1, bpHover = -1, bpCpuT = 0, bpCustomOpts = null;
const PORTRAITS = [];
