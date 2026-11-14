// ======================= 新手教学 =======================
// 本文件有三块互不相关的内容（按出现顺序）：
//   1. 新手教学（TUT_STEPS：每一步的提示和完成条件）和第一次进来时选语言
//   2. 回滚联机（ROLL）：存档 capState / 读档 restState / 校验 hashState，收到对方迟到的输入就回到那一帧重算（rollResim）
//   3. 手机和平板的触屏操作（TOUCH / TUI：虚拟摇杆和按钮）
// 找 bug 提示：存档会自动带上每位侠客身上的所有字段（F_SKIP 里列的除外）、M、飞行道具、替身、对局随机数和几个全局计时；
// 回滚不同步多半是新状态放在了别的全局变量里（不进存档），或者被误加进了 F_SKIP。
// 在木人桩里一步一步教，每一步都检测你是不是真的做到了
let TUT = null;
function stunA() { A.state = 'hitstun'; A.t = 0; A.stun = 3; A.vx = 0; A.flash = 0.1; A.comboHits = 3; }
const TUT_STEPS = [
  { t: '移动身法', d: '按 A、D 左右走动，熟悉侠客的立回步法。', ok: () => Math.abs(A.x - TUT.x0) > 260 },
  { t: '起跳与滞空', d: '按 W 或空格起跳，身在半空再按一次，便是二段跳。', ok: () => A.jumps >= 2 },
  { t: '地面五段连段', d: '贴近稻草人连续点按左键打满五段（L1~L5）；末段强力挑飞击退对手。', ok: () => TUT.hit.l5 },
  { t: '破势蓄力斩', d: '按住左键蓄力，待寒芒一闪、剑鸣铮铮时松手。蓄满的一斩为霸体不可挡，能强行破防！', ok: () => TUT.hit.cs2 },
  { t: '挑飞追空打击', d: '将对手打飞或跃起后，在空中点左键（空斩 A1），再点一下下砸（A2），实现空中追打追击。', ok: () => A.state === 'attack' && /^a[12]$/.test(A.moveName) },
  { t: '远程暗器 / 剑气', d: '按住左键再点右键（或直接按 R）。各派武学各异，青锋可挥出疾速剑气。', ok: () => A.skill2CD > 0 },
  { t: '核心门派技能', d: '按 Q 施展专属门派武学。青锋的「疾风斩」附带位移穿透与破防。', ok: () => A.skillCD > 0 },
  { t: '严密格挡', d: '稻草人会朝你连发风刃，按住 S 挡下两次！记得面朝来袭方向。', ok: () => TUT.blocks >= 2, setup: () => { TUT.shotT = 0.5; } },
  { t: '精准弹刀 (招架)', d: '在近身来袭瞬间（受击前 0.09 秒内）轻按 S，即可触发「精准招架」，完全不掉架势且反震硬直！', ok: () => (TUT.justGuards || 0) >= 1, setup: () => { TUT.parryShotT = 0.6; } },
  { t: '绝境腾空闪', d: '受到硬直连击陷入绝境时，按右键（或左 Shift）引爆真气触发「腾空闪」逃脱并获短暂无敌！', ok: () => A.escInvul, setup: () => { A.breakCD = 0; stunA(); } },
  { t: '真元爆发 · 绝招', d: '怒气已为你灌满！按 E 释放震撼全场的天地绝技！', ok: () => A.state === 'special', setup: () => { A.meter = 100; } },
];
// 快速上手只走五步：走动、五段连击、门派技能、腾空闪、大招（一分钟内学完）；完整教学十一步都走，在帮助里开
const TUT_QUICK = [0, 2, 6, 9, 10];
const tutCur = () => TUT ? TUT.list[TUT.step] : -1;
function tutSkillName(slot) {
  const ch = CHARS[trainChar] || CHARS[0], key = slot === 2 ? ch.skill2 : ch.skill;
  return (SKILLS[key] && SKILLS[key].name) || (slot === 2 ? '远程招式' : '门派技能');
}
function tutDescription(i) {
  const en = window.I18N && I18N.getLang() === 'en';
  if (i === 5) return en ? `Hold attack and tap R (or press R directly) to use ${cvT(tutSkillName(2))}.` : `按住左键再点右键（或直接按 R），施展「${tutSkillName(2)}」。`;
  if (i === 6) return en ? `Press Q to use ${cvT(tutSkillName(1))}, then learn its timing and purpose.` : `按 Q 施展「${tutSkillName(1)}」，熟悉它的时机与用途。`;
  return TUT_STEPS[i].d;
}
function tutTouchDescription(i) {
  const en = window.I18N && I18N.getLang() === 'en';
  if (i === 5) return en ? `Tap R to use ${cvT(tutSkillName(2))}.` : `点击「远程」施展「${tutSkillName(2)}」。`;
  if (i === 6) return en ? `Tap Skill to use ${cvT(tutSkillName(1))}.` : `点击「技能」施展「${tutSkillName(1)}」。`;
  return TUT_TOUCH[i];
}
function startTutorial(full) {
  try { localStorage.setItem('renying-tut-seen', '1'); } catch (e) {}
  trainChar = typeof menuHeroPick === 'function' ? menuHeroPick() : 0;
  if (typeof setMenuHero === 'function') setMenuHero(trainChar);
  dummyCfg.act = 'stand';   // 教学里稻草人只按教学的安排出手
  if (typeof STATQ !== 'undefined') STATQ.skip = true;   // 教学用的木人桩局不算一局
  startTraining('dummy');
  if (typeof STATQ !== 'undefined') STATQ.skip = false;
  B.x = STAGE_W / 2 + 220; A.x = STAGE_W / 2 - 220;
  TUT = { list: full === true ? TUT_STEPS.map((_, i) => i) : TUT_QUICK, full: full === true, step: -1, wait: 0, x0: A.x, hit: {}, blocks: 0, justGuards: 0, prev: '', shotT: 0, parryShotT: 0 };
  tutNext();
  $id('tutBox').classList.remove('hidden');
  if (typeof statEv === 'function') statEv('tut_start');
}
const TUT_TOUCH = [
  '拨动左摇杆，左右走动熟悉身法。',
  '向上推摇杆或点「跳」；在半空中再点一次触发二段跳。',
  '贴近稻草人，连点「攻击」打满五段连击。',
  '按住「攻击」蓄力，待寒芒闪耀与剑鸣时松手，劈出霸体破防斩！',
  '起跳后在空中点「攻击」，随后再点下砸完成追空！',
  '点击「远程」放出远程武学，青锋施展远程剑气。',
  '点击「技能」施展专属门派武学，穿透对手。',
  '稻草人放风刃袭来，摇杆下推防御挡下两次。',
  '在受到攻击瞬间快速下拉摇杆，触发「精准招架」反震对手！',
  '受到攻击陷入僵直时，点「闪」腾空闪逃脱危局！',
  '真元已蓄满，点击发光的「大招」释放天地绝技！'
];
function tutNext() {
  TUT.step++; TUT.wait = 0; TUT.hit = {}; TUT.x0 = A.x;
  const st = TUT_STEPS[tutCur()];
  if (!st) return tutFinish();
  $id('tutBox').classList.remove('ok');
  $id('tutN').textContent = `${TUT.full ? '完整教学' : '快速上手'} ${TUT.step + 1} / ${TUT.list.length}`;
  $id('tutT').textContent = cvT(st.t); $id('tutD').textContent = TOUCH ? tutTouchDescription(tutCur()) : tutDescription(tutCur());
  if (st.setup) st.setup();
}
function tutTick(dt) {
  const cur = tutCur(), st = TUT_STEPS[cur]; if (!st) return;
  A.hp = A.maxHp; A.breakCD = cur === 9 ? 0 : A.breakCD;
  if (A.state === 'attack' && A.hitConfirmed) TUT.hit[A.moveName] = true;
  if (A.state === 'blockstun' && TUT.prev !== 'blockstun') TUT.blocks++;
  TUT.prev = A.state;
  // 教学第8步：风刃防御
  if (cur === 7 && !TUT.wait) {
    TUT.shotT -= dt;
    if (TUT.shotT <= 0) {
      TUT.shotT = 1.6; const dir = A.x >= B.x ? 1 : -1;
      spawnProj(B, { kind: 'wind', x: B.x + dir * 40, y: B.y - 62, vx: dir * 620, w: 56, h: 52, life: 2.4, dmg: 2, kb: [160, 0], stun: 0.3, hs: 0.04 });
    }
  }
  // 教学第9步：近战出招诱导精准招架
  if (cur === 8 && !TUT.wait) {
    TUT.parryShotT = (TUT.parryShotT || 0) - dt;
    if (TUT.parryShotT <= 0 && B.state === 'idle') {
      TUT.parryShotT = 2.0;
      B.x = A.x + (A.face === 1 ? 75 : -75);
      B.face = -A.face;
      startAttack(B, 'l1');
    }
  }
  if (cur === 9 && !TUT.wait && !A.escInvul && A.onGround() && A.state !== 'hitstun' && A.state !== 'getup') stunA();
  if (TUT.wait) { TUT.wait -= dt; if (TUT.wait <= 0) tutNext(); return; }
  if (st.ok()) { TUT.wait = 1; $id('tutBox').classList.add('ok'); SFX.chargeFull(); }
}
function updateTutBtn() {
  let done = false; try { done = !!localStorage.getItem('renying-tut-done'); } catch (e) {}
  if (!PROF.guest && PROF.tutorial) done = true;
  const b = document.querySelector('#menu [data-go="tutorial"]'); if (b) b.style.display = done ? 'none' : '';
}
async function tutFinish() {
  if (typeof statEv === 'function') statEv('tut_done');
  try { localStorage.setItem('renying-tut-done', '1'); } catch (e) {}
  updateTutBtn();
  $id('tutBox').classList.add('hidden');
  const wasFull = TUT && TUT.full;
  let msg = wasFull ? '该会的都会了。去找电脑或是同学，过几招吧。' : '基本招式会了。格挡和精准招架这些进阶操作，在「帮助」里的完整教学能学到。';
  if (!PROF.guest) {
    if (!PROF.tutorial && typeof rwServer === 'function' && rwServer()) {   // 云端账号：找服务器领，每个号只给一次（本机标记不算数）
      PROF.tutorial = 1; saveFlag('tutorial', 1);
      const g = await rwClaim('tut', null, true);
      if (g > 0) msg += `<br>奖励 <b style="color:#e9c46a">${g} 墨锭</b>，去武库买个武器箱试试手气吧！`;
      else if (g === -2) msg += '<br>这个号已经领过教学奖励了。';
    } else if (!PROF.tutorial) {
      PROF.tutorial = 1; saveFlag('tutorial', 1);
      PROF.ink = (PROF.ink || 0) + 300;
      if (window.CloudSave) CloudSave.saveProfile(PROF);
      applyProfile(PROF);
      msg += '<br>奖励 <b style="color:#e9c46a">300 墨锭</b>，去武库买个武器箱试试手气吧！';
    }
  } else {
    msg += '<br>登录之后再走一遍教学，可领 300 墨锭。';
  }
  $id('tutReward').innerHTML = msg;
  TUT = null; paused = true; showScreen('tutdone'); SFX.gong();
}
function endTutorial() { TUT = null; $id('tutBox').classList.add('hidden'); }
$id('tutMenu').addEventListener('click', () => { paused = false; toMenu(); });
$id('tutStay').addEventListener('click', () => { paused = false; showScreen(null); });
// 教学打完直接给两条路：和电脑打一局、和朋友联机（离线版没有联机，openScreen 会换成闯关）
if ($id('tutCpu')) $id('tutCpu').addEventListener('click', () => { paused = false; toMenu(); openScreen('cpu'); });
if ($id('tutNet')) $id('tutNet').addEventListener('click', () => { paused = false; toMenu(); openScreen('netp'); });
$id('tutYes').addEventListener('click', () => startTutorial());
$id('tutNo').addEventListener('click', () => { if (typeof statEv === 'function') statEv('tut_skip'); try { localStorage.setItem('renying-tut-seen', '1'); } catch (e) {} backToMenu(); });
// 初次进入游戏语言偏好引导弹窗
let langPromptDone = false;
try {
  langPromptDone = !!localStorage.getItem('renying-lang-chosen');
} catch (e) {}

function chooseLang(l) {
  try { localStorage.setItem('renying-lang-chosen', '1'); } catch (e) {}
  langPromptDone = true;
  SETTINGS.lang = l;
  saveSettings();
  if (window.I18N) window.I18N.setLang(l);
  backToMenu();
  let seen = false; try { seen = !!localStorage.getItem('renying-tut-seen'); } catch (err) {}
  if (!seen && $id('menu').classList.contains('on')) showScreen('tutask');
}

if ($id('lpPickZh')) $id('lpPickZh').addEventListener('click', () => chooseLang('zh'));
if ($id('lpPickEn')) $id('lpPickEn').addEventListener('click', () => chooseLang('en'));
if ($id('tnLangBtn')) $id('tnLangBtn').addEventListener('click', () => {
  const next = (window.I18N && window.I18N.getLang() === 'en') ? 'zh' : 'en';
  SETTINGS.lang = next;
  saveSettings();
  if (window.I18N) window.I18N.setLang(next);
  toast(next === 'en' ? 'Switched to English mode' : '已切换至中文模式');
});

setTimeout(() => { if ($id('menu').classList.contains('on')) showScreen('menu'); }, 0);   // 一打开就和点返回回来的首页一个样子（顶栏在、底栏不变）
setTimeout(() => {
  if (!langPromptDone && $id('menu').classList.contains('on')) {
    showScreen('langPrompt');
    return;
  }
  let seen = false; try { seen = !!localStorage.getItem('renying-tut-seen'); } catch (e) {}
  if (!seen && $id('menu').classList.contains('on')) showScreen('tutask');
}, 1000);

