// ======================= 普攻招式和取消规则 =======================
// MOVES 是所有侠客共用的普攻底子，每位侠客再按自己的 stat 缩放（speed 管前摇后摇、swing 管判定、dmg、reach），
// 并用自己文件里的 char.moveMods 改个别招式（src/data/heroes/）。改一招的帧数只改这里或那位侠客的 moveMods。
// 一招的字段（时间都是秒，1 帧 = 1/60 秒）：
//   p     动作 [起手, 出手]；su 前摇（出手前）；ac 判定持续；rc 后摇（判定结束到能动）
//   dmg 伤害、kb 击退 [横, 竖]、stun 硬直、hs 打中时的顿帧、box 判定框 [左, 上, 右, 下]（朝右时，相对脚下）
//   lunge 出手时往前冲多少；air 空中招；track 出手时追向对手；spike 往下砸；launch 挑飞；knock 击倒；snd 音效
//   next  连段：判定打到一半以后（CANCEL.chainAt）按轻 / 重接哪一招，{} 是连段到头
//   hitNext 只有打中了才接的招；jumpCancel 打中后能跳起取消
// l1~l5 地上轻攻击连段，l6~l10 是一套备用的快拳连段（目前只有雷鸣的第六拳从 l6 改出来），hv 重击，cs1 / cs2 蓄力斩（半蓄 / 满蓄），
// a1 / a2 空中轻 / 重，dl 下蹲试探；cf 目前没有地方用到。
const MOVES = {
  l1: { p: ['l1s', 'l1a'], su: .075, ac: .07, rc: .17, dmg: 14, kb: [170, 0], stun: .32, hs: .055, box: [8, -112, 82, -28], lunge: 150, next: { light: 'l2', heavy: 'hv' }, snd: 'swing' },
  l2: { p: ['l2s', 'l2a'], su: .07, ac: .07, rc: .18, dmg: 15, kb: [170, 0], stun: .32, hs: .055, box: [8, -108, 84, -36], lunge: 160, next: { light: 'l3', heavy: 'hv' }, snd: 'swing' },
  l3: { p: ['lcs', 'lca'], su: .075, ac: .075, rc: .18, dmg: 18, kb: [170, 0], stun: .34, hs: .06, box: [8, -96, 90, -10], lunge: 170, next: { light: 'l4', heavy: 'hv' }, snd: 'swing' },
  l4: { p: ['lds', 'lda'], su: .09, ac: .08, rc: .2, dmg: 22, kb: [180, 0], stun: .36, hs: .07, box: [6, -120, 92, -8], lunge: 180, next: { light: 'l5', heavy: 'hv' }, snd: 'heavy' },
  l6: { p: ['l1s', 'l1a'], su: .07, ac: .07, rc: .17, dmg: 10, kb: [110, 0], stun: .32, hs: .05, box: [8, -112, 82, -28], lunge: 120, next: { light: 'l7' }, snd: 'swing' },
  l7: { p: ['l2s', 'l2a'], su: .07, ac: .07, rc: .17, dmg: 10, kb: [110, 0], stun: .32, hs: .05, box: [8, -108, 84, -36], lunge: 120, next: { light: 'l8' }, snd: 'swing' },
  l8: { p: ['lcs', 'lca'], su: .07, ac: .07, rc: .17, dmg: 10, kb: [110, 0], stun: .32, hs: .05, box: [8, -96, 90, -10], lunge: 120, next: { light: 'l9' }, snd: 'swing' },
  l9: { p: ['lds', 'lda'], su: .07, ac: .07, rc: .17, dmg: 10, kb: [110, 0], stun: .34, hs: .06, box: [6, -120, 92, -8], lunge: 120, next: { light: 'l10' }, snd: 'swing' },
  l10: { p: ['l3s', 'l3a'], su: .09, ac: .08, rc: .24, dmg: 12, kb: [520, -260], stun: .5, hs: .09, box: [20, -92, 116, -46], lunge: 260, launch: true, next: {}, snd: 'heavy' },
  l5: { p: ['l3s', 'l3a'], su: .1, ac: .09, rc: .28, dmg: 28, kb: [560, -240], stun: .5, hs: .09, box: [20, -92, 116, -46], lunge: 300, launch: true, next: {}, snd: 'heavy' },
  hv: { p: ['hvs', 'hva'], su: .14, ac: .09, rc: .3, dmg: 38, kb: [80, -1020], stun: .6, hs: .11, box: [0, -150, 84, -8], lunge: 130, launch: true, jumpCancel: true, next: {}, snd: 'heavy' },
  a1: { p: ['a1s', 'a1a'], air: true, su: .06, ac: .09, rc: .14, dmg: 18, kb: [150, -430], stun: .4, hs: .065, box: [0, -84, 86, 6], next: { light: 'a2' }, snd: 'swing' },
  cs1: { p: ['charge', 'spa'], su: .04, ac: .12, rc: .06, dmg: 36, kb: [540, 0], stun: .5, hs: .12, box: [0, -112, 112, -18], lunge: 900, next: {}, snd: 'heavy' },
  cs2: { p: ['charge', 'spa'], su: .04, ac: .16, rc: .08, knock: true, dmg: 58, kb: [720, -720], stun: .6, hs: .2, box: [0, -120, 124, -10], lunge: 1350, launch: true, unblockable: true, big: true, next: {}, snd: 'heavy' },
  cf: { p: ['hvs', 'hva'], su: .05, ac: .1, rc: .26, dmg: 22, kb: [320, -420], stun: .45, hs: .08, box: [-6, -160, 104, -6], track: true, launch: true, next: {}, snd: 'swing' },
  a2: { p: ['a2s', 'a2a'], air: true, su: .08, ac: .09, rc: .22, dmg: 26, kb: [240, 1000], stun: .5, hs: .11, box: [-4, -70, 80, 24], spike: true, next: {}, snd: 'heavy' },
  dl: { p: ['fy_crouch', 'fy_crouch'], su: .055, ac: .06, rc: .12, dmg: 5, kb: [45, 0], stun: .28, hs: .03, box: [12, -45, 82, 0], lunge: 60, next: { light: 'l1', heavy: 'hv' }, hitNext: { light: 'l1', heavy: 'hv' }, snd: 'swing' },
};
const FINAL = { ult: true, noScale: true, dmg: 85, kb: [520, -900], stun: .6, hs: .24, launch: true, unblockable: true };
const SP_SLASH = { ult: true, noScale: true, dmg: 16, kb: [0, 0], stun: .3, hs: .035, unblockable: true, hold: true };

// 取消规则（所有侠客通用；某位侠客要不一样，就在他文件的 char.cancel 里只写要改的那几项）
//   blockEarly  前摇的前这么多（比例）内按住 S 能转成格挡；没打中的收招里也能转
//   chainAt     判定持续过了这么多（比例）以后才能按 next 接下一招
//   skill2FromLight  轻攻击（l1~l10）任何时候都能用右键招式取消
//   skillOnHit  打中以后能用 Q / 右键招式取消
const CANCEL = { blockEarly: 0.6, chainAt: 0.6, skill2FromLight: true, skillOnHit: true };
