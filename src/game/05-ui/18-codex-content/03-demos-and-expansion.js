const HERO_ULT_REPLAYS = {
  qingfeng: [
    { p: 'qf_charge', d: 0.48, lab: '纳刀 · 蓄势' },
    { p: 'qf_thrust', d: 0.24, dx: 46, fx: 'crescent', hit: 1, badge: '居合突刺' },
    { p: 'l1a', d: 0.12, hit: 1 }, { p: 'l2a', d: 0.12, hit: 1 },
    { p: 'l1a', d: 0.12, hit: 1 }, { p: 'l2a', d: 0.12, hit: 1 },
    { p: 'l1a', d: 0.12, hit: 1 }, { p: 'l2a', d: 0.12, hit: 1 },
    { p: 'jump', d: 0.16, dy: -38, lab: '残月剑气 · 追斩' },
    { p: 'hva', d: 0.32, dy: 0, hit: 3, launch: true, fx: 'crescent', badge: '终结斩' },
    { p: 'victory', d: 0.46, reset: true, lab: '剑意通明 · 收势' }
  ],
  feiying: [
    { p: 'fy_seal', d: 0.42, lab: '结印 · 入影' },
    { p: 'dash', d: 0.28, dx: 90, fx: 'shadows', badge: '瞬步近身' },
    { p: 'fy_xslash', d: 0.1, hit: 1 }, { p: 'l1a', d: 0.1, hit: 1 },
    { p: 'l2a', d: 0.1, hit: 1 }, { p: 'fy_xslash', d: 0.1, hit: 1 },
    { p: 'l1a', d: 0.1, hit: 1 }, { p: 'l2a', d: 0.1, hit: 1 },
    { p: 'fy_xslash', d: 0.1, hit: 1 }, { p: 'l1a', d: 0.1, hit: 1 },
    { p: 'fy_xslash', d: 0.25, hit: 2, launch: true, badge: '双刃终结' },
    { p: 'victory', d: 0.42, reset: true, lab: '暗影绝杀 · 收势' }
  ],
  tieshan: [
    { p: 'ts_lift', d: 0.3, lab: '擎刃 · 起跳' },
    { p: 'jump', d: 0.35, dy: -92, lab: '滞空 · 调整落点' },
    { p: 'ts_slam', d: 0.16, dy: 0, fx: 'avalanche', hit: 1, launch: true, badge: '泰山压顶' },
    { p: 'victory', d: 0.52, reset: true, lab: '地裂 · 回涌' }
  ],
  lingshuang: [
    { p: 'ls_stance', d: 0.45, lab: '拄枪 · 凝神' },
    { p: 'ls_thrust', d: 0.35, fx: 'timestop', lab: '天地停滞 · 枪影铺开' },
    { p: 'ls_thrust', d: 0.28, dx: 84, hit: 1, launch: true, badge: '寒芒贯日' },
    { p: 'ls_plant', d: 0.3, reset: true, lab: '冰封 · 收枪' }
  ],
  liuyun: [
    { p: 'ly_fanswipe', d: 0.3, lab: '展扇 · 引风' },
    { p: 'ly_hover', d: 0.32, dy: -32, fx: 'tornado', badge: '双道龙卷' },
    { p: 'ly_hover', d: 0.32, dy: -20, hit: 1, launch: true, badge: '卷入高空' },
    { p: 'victory', d: 0.42, dy: 0, reset: true, lab: '扶摇万里 · 浮空' }
  ],
  leiming: [
    { p: 'lm_kick', d: 0.18, fx: 'thunder', hit: 1, launch: true, badge: '第一道天雷' },
    { p: 'lm_boxer', d: 0.36, fx: 'thunder', hit: 1, launch: true, badge: '第二道天雷' },
    { p: 'lm_kick', d: 0.36, fx: 'thunder', hit: 1, launch: true, badge: '第三道天雷' },
    { p: 'victory', d: 0.42, reset: true, lab: '雷帝灌顶 · 收势' }
  ],
  moyu: [
    { p: 'my_stroke', d: 0.4, lab: '展纸 · 运笔' },
    { p: 'my_paint', d: 0.55, fx: 'inkdragon', lab: '全场染纸 · 符印浮现' },
    { p: 'my_paint', d: 0.24, hit: 2, launch: true, badge: '符阵引爆' },
    { p: 'victory', d: 0.46, reset: true, lab: '朱砂散尽 · 收笔' }
  ],
  yuehua: [
    { p: 'yh_lotus', d: 0.5, fx: 'moonflow', lab: '结月印 · 凝露回气' },
    { p: 'yh_lotus', d: 0.14, hit: 1, launch: true, badge: '月芒震退' },
    { p: 'victory', d: 0.38, reset: true, lab: '月魄护体 · 收势' }
  ],
  yanling: [
    { p: 'yl_wings', d: 0.34, dy: -66, lab: '展翼 · 冲上九霄' },
    { p: 'a1a', d: 0.28, dy: -66, fx: 'featherstorm', count: 7, hit: 2, launch: true, badge: '翎羽齐射' },
    { p: 'yl_wings', d: 0.28, dy: -40, fx: 'featherstorm', count: 7, hit: 2, launch: true, badge: '破甲暴雨' },
    { p: 'victory', d: 0.4, dy: 0, reset: true, lab: '凌霄破虚 · 回落' }
  ],
  yuxiao: [
    { p: 'yx_play', d: 0.3, lab: '起奏 · 广陵散' },
    { p: 'yx_push', d: 0.15, fx: 'note', badge: '音刃一' },
    { p: 'yx_play', d: 0.15, fx: 'note', badge: '音刃二' },
    { p: 'yx_push', d: 0.15, fx: 'note', badge: '音刃三' },
    { p: 'yx_play', d: 0.15, fx: 'note', badge: '音刃四' },
    { p: 'yx_push', d: 0.15, fx: 'note', badge: '音刃五' },
    { p: 'yx_play', d: 0.2, fx: 'note', badge: '音刃六' },
    { p: 'yx_push', d: 0.28, fx: 'guangling', hit: 3, launch: true, badge: '曲终绝响' },
    { p: 'yx_play', d: 0.42, reset: true, lab: '音律回满 · 曲终' }
  ],
  zuixian: [
    { p: 'zx_drink', d: 0.34, fx: 'shanshui', lab: '举酒 · 展开山水' },
    { p: 'zx_sway', d: 0.17, hit: 1, badge: '墨染一' }, { p: 'zx_drink', d: 0.17, hit: 1 },
    { p: 'zx_sway', d: 0.17, hit: 1 }, { p: 'zx_drink', d: 0.17, hit: 1 },
    { p: 'zx_sway', d: 0.17, hit: 1 }, { p: 'zx_drink', d: 0.17, hit: 1 },
    { p: 'zx_sway', d: 0.17, hit: 1 }, { p: 'zx_upper', d: 0.2, hit: 1, badge: '八重墨浪' },
    { p: 'victory', d: 0.4, reset: true, lab: '蓬莱境 · 收卷' }
  ],
  gouchen: [
    { p: 'gc_wind', d: 0.4, lab: '抡锤 · 锁定目标' },
    { p: 'gc_wind', d: 0.55, fx: 'skynet', hit: 1, badge: '巨锤砸落 · 震晕' },
    { p: 'gc_pull', d: 0.16, fx: 'magnet', lab: '扯链 · 回锤' },
    { p: 'gc_sweep', d: 0.3, hit: 2, launch: true, badge: '近身重抡' },
    { p: 'victory', d: 0.38, reset: true, lab: '震魄 · 收链' }
  ],
  lingque: [
    { p: 'du_l1s', d: 0.2, dy: -60, lab: '跃起 · 织网' },
    { p: 'du_l2a', d: 0.08, dy: -60, fx: 'needlestorm', hit: 1, badge: '悬丝一' },
    { p: 'du_l1a', d: 0.08, dy: -60, hit: 1, badge: '悬丝二' },
    { p: 'du_l2a', d: 0.08, dy: -60, hit: 1, badge: '悬丝三' },
    { p: 'du_l1a', d: 0.08, dy: -60, hit: 1, badge: '悬丝四' },
    { p: 'du_l2a', d: 0.08, dy: -60, hit: 1, badge: '悬丝五' },
    { p: 'du_l1a', d: 0.08, dy: -60, hit: 1, badge: '悬丝六' },
    { p: 'du_l2a', d: 0.12, dy: -60, hit: 1, badge: '悬丝七' },
    { p: 'l3a', d: 0.28, dy: 0, hit: 3, launch: true, badge: '终结 · 雀芒入魂' },
    { p: 'victory', d: 0.38, reset: true, lab: '悬丝归宗 · 落地' }
  ],
  liying: [
    { p: 'fy_seal', d: 0.3, lab: '结印 · 雾身齐发' },
    { p: 'fy_xslash', d: 0.16, fx: 'mistarray', badge: '雾身刀光' },
    { p: 'l1a', d: 0.14, hit: 1 }, { p: 'l2a', d: 0.14, hit: 1 },
    { p: 'dash', d: 0.3, dx: 74, fx: 'blink', lab: '瞬身 · 追至身前' },
    { p: 'l2a', d: 0.22, hit: 2, launch: true, badge: '本体补刀' },
    { p: 'victory', d: 0.36, reset: true, lab: '雾身散尽 · 收势' }
  ],
  cixian: [
    { p: 'lm_boxer', d: 0.28, fx: 'magnet', lab: '异极 · 磁石升起' },
    { p: 'victory', d: 0.5, fx: 'sandwich', lab: '双极合拢 · 吸住目标' },
    { p: 'lm_jab', d: 0.18, hit: 2, badge: '天地夹击' },
    { p: 'victory', d: 0.42, reset: true, lab: '定身 · 收势' }
  ],
  qianji: [
    { p: 'fy_seal', d: 0.25, fx: 'geartriple', lab: '机轮三穿 · 横扫战场', badge: '三次穿击' },
    { p: 'qf_charge', d: 0.42, lab: '傀丸疾返 · 穿身而过' },
    { p: 'spa', d: 0.22, badge: '傀丸回手' },
    { p: 'victory', d: 0.36, reset: true, lab: '三穿归一 · 傀丸回手' }
  ]
};

const HERO_FULL_DEMO = {
  liying: [
    { p: 'idle', d: 0.2, reset: true },
    { p: 'l1s', d: 0.07, lab: '普攻' }, { p: 'l1a', d: 0.12, dx: 10, hit: 1 },
    { p: 'l3s', d: 0.08 }, { p: 'l3a', d: 0.2, dx: 14, hit: 2, launch: true },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'fy_seal', d: 0.12, fx: 'mist', lab: 'Q · 留影' }, { p: 'l2a', d: 0.24, dx: 40, hit: 2, badge: '留下雾身' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'fy_seal', d: 0.1, lab: 'R · 渡影' }, { p: 'idle', d: 0.08, fx: 'mistswap', dx: -60, badge: '换位' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'fy_seal', d: 0.2, lab: 'E · 万影归一' }, { p: 'l3a', d: 0.45, dx: 40, fx: 'mistarray', hit: 3, launch: true, badge: '雾身齐斩' },
    { p: 'victory', d: 0.55, reset: true }
  ],
  yuxiao: [
    { p: 'idle', d: 0.2, reset: true },
    { p: 'yx_play', d: 0.08, lab: '普攻' }, { p: 'yx_push', d: 0.12, dx: 10, hit: 1 },
    { p: 'fn_l1s', d: 0.08 }, { p: 'lca', d: 0.18, dx: 14, hit: 2, badge: '音律 +3' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'yx_play', d: 0.14, lab: 'Q · 清音' }, { p: 'yx_push', d: 0.36, fx: 'note', hit: 2, launch: true, badge: '三律齐鸣' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'yx_play', d: 0.4, fx: 'mirror', hit: 1, lab: 'R · 回音壁', badge: '回音' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'yx_play', d: 0.2, lab: 'E · 广陵散' }, { p: 'yx_push', d: 0.45, fx: 'guangling', hit: 3, launch: true, badge: '曲终绝响' },
    { p: 'victory', d: 0.55, reset: true }
  ],
  zuixian: [
    { p: 'idle', d: 0.2, reset: true },
    { p: 'zx_sway', d: 0.08, lab: '普攻' }, { p: 'lm_jab', d: 0.1, dx: 10, hit: 1 },
    { p: 'zx_drink', d: 0.08 }, { p: 'zx_upper', d: 0.2, dx: 12, hit: 2, launch: true },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'zx_sway', d: 0.15, lab: 'Q · 亭中留客' }, { p: 'gc_wind', d: 0.32, fx: 'avalanche', hit: 2, badge: '飞亭砸落' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'zx_drink', d: 0.25, lab: 'R · 与民同乐' }, { p: 'gc_throw', d: 0.3, fx: 'proj', hit: 1, badge: '掷坛共饮' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'zx_drink', d: 0.2, lab: 'E · 山水之间' }, { p: 'zx_upper', d: 0.48, fx: 'shanshui', hit: 8, launch: true, badge: '全屏墨染' },
    { p: 'victory', d: 0.55, reset: true }
  ],
  gouchen: [
    { p: 'idle', d: 0.2, reset: true },
    { p: 'gc_wind', d: 0.08, lab: '普攻' }, { p: 'gc_throw', d: 0.12, dx: 12, hit: 1 },
    { p: 'gc_pull', d: 0.08 }, { p: 'gc_sweep', d: 0.2, dx: 14, hit: 2, launch: true },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'gc_throw', d: 0.2, fx: 'proj', lab: 'Q · 飞锤' }, { p: 'gc_pull', d: 0.3, hit: 1, badge: '震魄' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'gc_spin', d: 0.4, fx: 'spin', hit: 2, lab: 'R · 旋锤' }, { p: 'gc_throw', d: 0.25, hit: 2, badge: '击飞' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'gc_wind', d: 0.25, lab: 'E · 开天一锤' }, { p: 'gc_sweep', d: 0.42, fx: 'skynet', hit: 3, launch: true, badge: '巨锤震晕' },
    { p: 'victory', d: 0.55, reset: true }
  ],
  cixian: [
    { p: 'idle', d: 0.2, reset: true },
    { p: 'lm_boxer', d: 0.07, lab: '普攻' }, { p: 'lm_jab', d: 0.11, dx: 8, hit: 1 },
    { p: 'l2s', d: 0.07 }, { p: 'lm_jab', d: 0.12, dx: 8, hit: 1 },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'idle', d: 0.3, fx: 'ironwall', lab: 'Q · 极性反转', badge: '⊕ ⇄ ⊖' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'lm_boxer', d: 0.15, lab: 'R · 磁极' }, { p: 'hva', d: 0.25, fx: 'ironwall', hit: 2, launch: true, badge: '弹开' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'lm_boxer', d: 0.15, lab: 'E · 天地磁合' }, { p: 'victory', d: 0.5, fx: 'crescent', hit: 1, badge: '夹成肉饼' },
    { p: 'victory', d: 0.55, reset: true }
  ],
  lingque: [
    { p: 'idle', d: 0.2, reset: true },
    { p: 'du_l1s', d: 0.07, lab: '普攻' }, { p: 'du_l1a', d: 0.11, dx: 12, hit: 1 },
    { p: 'du_l2s', d: 0.07 }, { p: 'lca', d: 0.16, dx: 14, hit: 2, launch: true },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'du_l1s', d: 0.12, lab: 'Q · 穿叶飞梭' }, { p: 'du_l1a', d: 0.24, fx: 'proj', hit: 1, badge: '雀芒印记' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'du_l1s', d: 0.08, lab: 'R · 移形换影' }, { p: 'dash', d: 0.22, dx: 45, hit: 2, launch: true, badge: '雀芒引爆' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'du_l1s', d: 0.15, lab: 'E · 万线归宗' }, { p: 'du_l2a', d: 0.45, fx: 'needlestorm', hit: 8, launch: true, badge: '全域悬丝' },
    { p: 'victory', d: 0.55, reset: true }
  ],
  qingfeng: [
    { p: 'idle', d: 0.2, reset: true },
    { p: 'l1s', d: 0.08, lab: '普攻' }, { p: 'l1a', d: 0.12, dx: 10, hit: 1 },
    { p: 'l2s', d: 0.07 }, { p: 'l2a', d: 0.12, dx: 10, hit: 1 },
    { p: 'l3s', d: 0.09 }, { p: 'l3a', d: 0.22, dx: 16, hit: 2, launch: true },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'qf_charge', d: 0.14, lab: 'Q · 疾风斩' }, { p: 'qf_thrust', d: 0.32, dx: 46, hit: 2, fx: 'gale', badge: '居合斩穴' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'qf_charge', d: 0.14, lab: 'R · 剑气' }, { p: 'qf_thrust', d: 0.36, fx: 'swordqi', hit: 1, launch: true, badge: '掀天挑空' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'qf_charge', d: 0.2, lab: 'E · 残月' }, { p: 'qf_thrust', d: 0.14, dx: 40, hit: 1, fx: 'crescent' },
    { p: 'l1a', d: 0.09, hit: 1 }, { p: 'l2a', d: 0.09, hit: 1 }, { p: 'hva', d: 0.3, hit: 3, launch: true, badge: '剑意通明' },
    { p: 'victory', d: 0.55, reset: true }
  ],
  tieshan: [
    { p: 'idle', d: 0.2, reset: true },
    { p: 'gs_l1s', d: 0.1, lab: '普攻' }, { p: 'gs_l1a', d: 0.18, dx: 12, hit: 2 },
    { p: 'l2s', d: 0.08 }, { p: 'ts_slam', d: 0.24, dx: 16, hit: 3, launch: true },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'ts_lift', d: 0.2, lab: 'Q · 震地' }, { p: 'ts_slam', d: 0.35, hit: 2, fx: 'quake', launch: true, badge: '💥 撼地重震' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'ts_lift', d: 0.14, lab: 'R · 铁壁冲' }, { p: 'ts_shoulder', d: 0.34, dx: 42, hit: 2, fx: 'ironwall', launch: true, badge: '💥 崩山破势' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'ts_lift', d: 0.24, lab: 'E · 山崩' }, { p: 'ts_slam', d: 0.42, dx: 38, hit: 4, fx: 'avalanche', launch: true, badge: '💫 怒意回涌' },
    { p: 'victory', d: 0.6, reset: true }
  ],
  feiying: [
    { p: 'idle', d: 0.18, reset: true },
    { p: 'du_l1s', d: 0.05, lab: '普攻' }, { p: 'du_l1a', d: 0.09, dx: 10, hit: 1 },
    { p: 'du_l2s', d: 0.05 }, { p: 'fy_xslash', d: 0.18, dx: 14, hit: 2, launch: true },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'fy_seal', d: 0.14, lab: 'Q · 影遁' }, { p: 'fy_xslash', d: 0.3, dx: 50, hit: 2, fx: 'blink', badge: '🌑 背后绞杀' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'fy_seal', d: 0.12, lab: 'R · 飞镖' }, { p: 'fy_crouch', d: 0.32, fx: 'kunai', hit: 1, badge: '极速截击' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'fy_seal', d: 0.18, lab: 'E · 千影' }, { p: 'fy_xslash', d: 0.14, dx: 40, hit: 2, fx: 'shadows' },
    { p: 'l1a', d: 0.08, hit: 1 }, { p: 'fy_xslash', d: 0.26, hit: 3, launch: true, badge: '暗影绝杀' },
    { p: 'victory', d: 0.5, reset: true }
  ],
  liuyun: [
    { p: 'idle', d: 0.2, reset: true },
    { p: 'fn_l1s', d: 0.08, lab: '普攻' }, { p: 'fn_l1a', d: 0.1, dx: 10, hit: 1 },
    { p: 'ly_fanswipe', d: 0.22, dx: 16, hit: 2, launch: true },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'ly_fanswipe', d: 0.1, lab: 'Q · 风刃' }, { p: 'idle', d: 0.35, fx: 'windblade', hit: 1, badge: '🌪️ 狂风推搡' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'ly_hover', d: 0.3, dx: -40, fx: 'windstep', hit: 1, lab: 'R · 开扇', badge: '🍿 爆米花' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'ly_fanswipe', d: 0.2, lab: 'E · 龙卷' }, { p: 'ly_hover', d: 0.42, fx: 'tornado', hit: 3, launch: true, badge: '🌪️ 扶摇万里' },
    { p: 'victory', d: 0.55, reset: true }
  ],
  leiming: [
    { p: 'idle', d: 0.2, reset: true },
    { p: 'lm_boxer', d: 0.05, lab: '六连击' }, { p: 'lm_jab', d: 0.06, dx: 5, hit: 1 },
    { p: 'lm_boxer', d: 0.05 }, { p: 'lm_jab', d: 0.06, dx: 5, hit: 1 },
    { p: 'lm_kick', d: 0.2, dx: 16, hit: 2, launch: true },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'lm_boxer', d: 0.1, lab: 'Q · 雷闪' }, { p: 'lm_jab', d: 0.32, dx: 48, hit: 2, fx: 'thunderfist', badge: '⚡ 触电麻痹' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'lm_kick', d: 0.16, lab: 'R · 金刚雷铠' }, { p: 'ts_slam', d: 0.36, fx: 'stomp', hit: 2, launch: true, badge: '⚡ 引雷反震' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'lm_kick', d: 0.2, lab: 'E · 雷霆万钧' }, { p: 'lm_boxer', d: 0.26, fx: 'thunder', hit: 3, launch: true, badge: '⚡ 雷帝灌顶' },
    { p: 'victory', d: 0.55, reset: true }
  ],
  lingshuang: [
    { p: 'idle', d: 0.2, reset: true },
    { p: 'sp_l1s', d: 0.08, lab: '普攻' }, { p: 'sp_l1a', d: 0.13, dx: 14, hit: 1 },
    { p: 'sp_l2a', d: 0.12, dx: 14, hit: 1 },
    { p: 'ls_thrust', d: 0.2, dx: 18, hit: 2, launch: true },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'ls_stance', d: 0.2, dx: -22, lab: 'Q · 回马枪' }, { p: 'ls_thrust', d: 0.34, dx: 36, hit: 2, fx: 'backthrust', launch: true, badge: '枪尖穿心' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'ls_stance', d: 0.12, lab: 'R · 枪旋' }, { p: 'ls_plant', d: 0.15, fx: 'spin', hit: 1 }, { p: 'ls_thrust', d: 0.24, dx: 20, hit: 2, launch: true, badge: '乾坤回旋' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'ls_stance', d: 0.22, lab: 'E · 刹那' }, { p: 'ls_thrust', d: 0.38, dx: 55, hit: 3, fx: 'timestop', launch: true, badge: '❄️ 寒芒贯日' },
    { p: 'victory', d: 0.55, reset: true }
  ],
  moyu: [
    { p: 'idle', d: 0.2, reset: true },
    { p: 'my_stroke', d: 0.08, lab: '普攻' }, { p: 'my_paint', d: 0.13, dx: 12, hit: 1 },
    { p: 'my_stroke', d: 0.08 }, { p: 'lda', d: 0.22, dx: 16, hit: 2, launch: true },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'my_stroke', d: 0.16, lab: 'Q · 墨阵' }, { p: 'my_paint', d: 0.34, fx: 'inktrap', hit: 1, badge: '深墨禁锢' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'my_stroke', d: 0.14, lab: 'R · 画符' }, { p: 'my_paint', d: 0.36, fx: 'inkblob', hit: 1, launch: true, badge: '墨迹遮目' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'my_stroke', d: 0.18, lab: 'E · 符阵' }, { p: 'my_paint', d: 0.44, fx: 'inkdragon', hit: 3, launch: true, badge: '📜 符爆' },
    { p: 'victory', d: 0.55, reset: true }
  ],
  yuehua: [
    { p: 'idle', d: 0.2, reset: true },
    { p: 'l1a', d: 0.1, dx: 10, hit: 1, lab: '普攻' }, { p: 'l2a', d: 0.1, dx: 10, hit: 1 },
    { p: 'hva', d: 0.22, dx: 16, hit: 2, launch: true },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'yh_mirror', d: 0.22, fx: 'mirror', lab: 'Q · 月镜' }, { p: 'hva', d: 0.3, dx: 24, hit: 3, launch: true, badge: '🌙 太阴绝罚' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'yh_mirror', d: 0.12, lab: 'R · 月轮' }, { p: 'l2a', d: 0.42, fx: 'moonring', hit: 2, launch: true, badge: '🌙 背袭破防' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'yh_lotus', d: 0.45, fx: 'moonflow', hit: 1, lab: 'E · 月华如水', badge: '🌙 月魄霸体' },
    { p: 'victory', d: 0.55, reset: true }
  ],
  yanling: [
    { p: 'idle', d: 0.2, reset: true },
    { p: 'l1a', d: 0.1, dx: 10, hit: 1, lab: '普攻' }, { p: 'a1a', d: 0.2, dx: 16, hit: 2, launch: true },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'yl_wings', d: 0.14, lab: 'Q · 俯冲' }, { p: 'yl_dive', d: 0.34, dx: 44, hit: 2, fx: 'dive', badge: '鹰击钉地' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'yl_wings', d: 0.12, lab: 'R · 翎羽' }, { p: 'a1a', d: 0.32, fx: 'feather', hit: 1, badge: '极速穿透' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'yl_wings', d: 0.18, lab: 'E · 万羽' }, { p: 'a1a', d: 0.46, fx: 'featherstorm', hit: 3, launch: true, badge: '🪶 凌霄破虚' },
    { p: 'victory', d: 0.55, reset: true }
  ],
  qianji: [
    { p: 'idle', d: 0.2, reset: true },
    { p: 'l1s', d: 0.07, lab: '铜手连推' }, { p: 'l1a', d: 0.11, dx: 10, hit: 1 },
    { p: 'l2s', d: 0.07 }, { p: 'l3a', d: 0.18, dx: 16, hit: 2, launch: true },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'qf_charge', d: 0.15, lab: 'Q · 金丝回环' }, { p: 'l1a', d: 0.3, fx: 'proj', hit: 1, badge: '限距往返' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'fy_seal', d: 0.2, lab: 'R · 穿丝急袭' }, { p: 'hva', d: 0.25, fx: 'ironwall', hit: 1, launch: true, badge: '傀丸穿击' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'fy_seal', d: 0.2, lab: 'E · 机轮三穿' }, { p: 'victory', d: 0.48, fx: 'geartriple', hit: 3, badge: '三穿回手' },
    { p: 'victory', d: 0.5, reset: true }
  ]
};

const SKILL_FUN = {
  qingfeng: { passive: '师父说他悟性一般，攒气倒是一绝。', light: '五剑连刺，每一剑都在心里喊招式名。', charge: '憋了半天就为这一下，憋不住就是普通一刀。', air: '跳起来砍人，是剑客的基本修养。', skill: '一步过去，对手还没回头就定住了。', ranged: '剑气出鞘，隔空也要把你挑上天。', ult: '残月一出，月亮都得往旁边让让。', esc: '打不过就飞，这叫战术性腾空。' },
  feiying: { passive: '血条薄如纸，跑得比消息还快。', light: '刀快到连自己都看不清。', charge: '蓄力背刺，专治站桩选手。', air: '从天而降的不只有惊喜。', skill: '“我在你身后。”经典台词，屡试不爽。', ranged: '四枚飞镖，总有一枚能中。', ult: '九个分身，哪个是真的？都是。', esc: '留下一缕烟，人早溜了。' },
  tieshan: { passive: '出门从不带伞，雨点打在身上算挠痒。', light: '慢是慢了点，挨一下你就知道了。', charge: '蓄满这一刀，连地板都害怕。', air: '他能跳起来，本身就是奇迹。', skill: '砸地之前，请确认脚下不是自家院子。', ranged: '掀起通天巨浪，飞得再高也得被拍下来。', ult: '跳起来砸你，落点还能自己挑。', esc: '一百八十斤腾空，地面松了口气。' },
  lingshuang: { passive: '一寸长一寸强，贴脸了一寸也不强。', light: '枪出如龙，每一下都戳在节奏上。', charge: '一枪捅穿防御，顺便捅穿你的心态。', air: '空中挑枪，专挑跳得高的。', skill: '先退半步，是为了捅得更远。', ranged: '转起来像风车，暗器都绕道走。', ult: '时间停一下，够她把话说完。', esc: '枪往地上一撑，人就弹出去了。' },
  liuyun: { passive: '三段跳是基本操作，落地才算失误。', light: '扇子不是用来扇风的，是用来扇人的。', charge: '蓄一口大风，把人吹到地图那头。', air: '他在天上的时间比在地上多。', skill: '一扇子风刃，顺手吹散飞镖。', ranged: '后翻一下原地起风，优雅退场。', ult: '今日天气：平地龙卷，有人起飞。', esc: '风往哪吹，他就往哪飘。' },
  leiming: { passive: '出家人不打诳语，只打六连。', light: '六连重拳，数到第四下你就晕了。', charge: '蓄力一拳，阿弥陀佛。', air: '跳起来的和尚最危险。', skill: '带电冲拳，碰一下全身发麻。', ranged: '一脚跺出雷柱，邻居以为要下雨。', ult: '三道天雷，师父说这招不许在庙里用。', esc: '金刚一吼，震开一切。' },
  moyu: { passive: '画师的笔，比刀还难缠。', light: '每一笔都是真迹，挨打也算收藏。', charge: '大印落下，盖章认证“你输了”。', air: '空中挥毫，落笔即是落人。', skill: '地上画个圈，踩进去就别想走。', ranged: '一团墨泼过去，糊脸又糊眼。', ult: '画龙点睛，龙就真的飞出来了。', esc: '化作一滩墨，洗都洗不掉。' },
  yuehua: { passive: '不打架的时候会悄悄回血，很养生。', light: '双刀如月，一刀圆一刀缺。', charge: '合璧一斩，月亮都满了。', air: '月下起舞，顺便斩人。', skill: '你打过来，我就照回去，物理反弹。', ranged: '月轮会自己飞回来，像回旋镖但更贵。', ult: '月华如水，泼你一身。', esc: '踏月而退，拒绝贴贴。' },
  yanling: { passive: '恐高？不存在的。', light: '翅膀扇人，羽毛乱飞。', charge: '振翅一扑，落地像只大鹅。', air: '天上就是她的主场。', skill: '鹰击长空，专啄脑门。', ranged: '三根翎羽，一根比一根快。', ult: '漫天羽毛，下雨天记得带伞。', esc: '振翅一飞，你够不着了。' },
  yuxiao: { passive: '打人也讲节奏，三拍一小节。', light: '箫管敲头，咚咚咚，是节拍。', charge: '横扫一记，音符都震飞了。', air: '跳起来吹一个高音。', skill: '攒满三个音符再吹，伤害翻倍不是梦。', ranged: '你的暗器我收下了，原样奉还。', ult: '广陵散于今绝矣？今天再奏一遍。', esc: '一个休止符，人先撤了。' },
  zuixian: { passive: '酒量即战力，放招添酒打中添酒，东倒西歪能闪避。', light: '东倒西歪五连拳，步法虚实难测。', charge: '蓄力一撞，重若巨石倾覆。', air: '醉步腾跃，飘忽不定难预测。', skill: '亭中留客，飞亭砸落禁锢两秒任你痛揍。', ranged: '与民同乐，半壶酒掷向对手，共醉回春。', ult: '山水之间，水墨泼染全屏八段重创。', esc: '醉意腾身，踏风撤步。' },
  gouchen: { passive: '锤子拴链子，走路都叮当响。', light: '链锤甩出去，回来时小心别砸到自己。', charge: '蓄力一锤，链子都绷直了。', air: '空中甩锤，物理老师看了都说好。', skill: '“过来吧你！”一链子拽到面前。', ranged: '抡圆了转，转晕的是对手。', ult: '锤子扔上天，下来大了一号。', esc: '锤子先走，人跟着链子飞。' },
  liying: { passive: '一缕魂留在原地，碰一下就散。', light: '单刀五连，干净利落。', charge: '雾里藏着的那一刀最重。', air: '只有一段跳，跳之前先想好落点。', skill: '人往前走，魂留在后面。', ranged: '结个印，人就到了雾身那里。', ult: '雾身一起出刀，本体最后补上。', esc: '雾一散，人已退开。' },
  qianji: { passive: '金丝约束傀丸往返回环，击打可改向加速。', light: '铜臂推掌，击中傀丸就能改向传动。', charge: '蓄力重击，让傀丸短暂高速穿行。', air: '空中翻掌，能将傀丸击向新方向。', skill: '金丝回环，限距往返持续施压。', ranged: '穿丝急袭，沿朝穿击并受击解控。', ult: '机轮三穿，三次横扫后回手重置 Q。', esc: '金丝借力，腾跃后退。' },
  cixian: { passive: '一会儿正极一会儿负极，脾气说变就变。', light: '负极一掌一吸，越打越近。', charge: '蓄满一掌，磁力把格挡都推开。', air: '跳起来拍一掌，像拍苍蝇。', skill: '红圈变蓝圈，R 也跟着刷新。', ranged: '正极弹飞，负极吸回，来回都是我说了算。', ult: '天一块地一块，中间夹着你。', esc: '磁力一托，人就飘起来了。' },
  lingque: { passive: '飞梭织悬丝，碰一下就留下印记。', light: '子母飞梭刺得比针还快。', charge: '蓄力一梭子，隔着衣服都疼。', air: '凌波踏空，身法灵巧似惊雀。', skill: '飞梭脱手，丝线连着千里之外。', ranged: '印记一亮，瞬身穿刺直接清空CD！', ult: '万线归宗，漫天悬丝罗网避无可避。', esc: '悬丝一荡，人已在数丈之外。' }
};

// ======================= 扩展 20 位侠客专属图鉴内容与全套动画脚本 =======================
Object.assign(PASSIVE_SHORT, {
  chixiao: '重击蓄力霸体 · 烈焰突刺与炎轮点燃对手(860血)',
  xuanji: '三臂星规控距 · 星火压制与重力场削减架势(810血)',
  qingluan: '翠羽济世回春 · 清风击退迟缓与近身护体(805血)',
  xuanwu: '玄甲不动霸体 · 冲撞削防与镇岳壁垒回势(940血)',
});

Object.assign(ADV_SHORT, {
  chixiao: 'Q 烈焰突刺近身点燃后，立刻接 R 炎轮扫荡挑空追击',
  xuanji: 'R 天枢重力把敌人拉进中距削防后，接 Q 星规流火精准补伤',
  qingluan: '中距用 Q 翠羽清风控场拉扯，被贴身时用 R 鸾羽回春震退回血',
  xuanwu: '先开 R 镇岳壁垒拿霸体与架势回复，再用 Q 玄甲冲撞顶飞对手',
});

Object.assign(HERO_METER_EXPLAIN, {
  chixiao: '【火耙炙魂 · 灼烧积怒】三齿火耙重击霸体换血与持续点燃稳定攒气；奥义「炽霄焚天」六连火星连斩接跃起火耙重劈。',
  xuanji: '【星枢牵引 · 刻线聚元】星规流火与重力力场持续削防攒气；奥义「星宿归元」循星轨六连斩后合拢三臂重击。',
  qingluan: '【翠羽灵风 · 绵延聚气】远程清风拉扯与回春续航持久作战；奥义「鸾鸣九霄」六道清风扇影连扫接鸾鸣风爆。',
  xuanwu: '【玄甲承伤 · 镇岳积威】顶级气血与玄甲壁垒承伤攒气极快；奥义「玄武镇岳」四记撼岳重锤连震后泰山压顶。',
});

(() => {
  const EXP_HEROES = [
    ['chixiao', 'rk', '三齿火耙连挑', '烈焰重耙', '凌空火耙', '烈焰突刺', '炎轮扫荡', '炽霄焚天', '火耙腾跃', 'dash', 'mid', 'gale', 'quake', 'avalanche', '点燃灼烧', '炎轮挑空', '六连火耙重劈', '火耙不是农具，烧起来比刀还烫。', '三齿齐出，火星子能点亮整条街。'],
    ['xuanji', 'sg', '星规弧斩', '三臂合击', '凌空测影', '星规流火', '天枢重力', '星宿归元', '星轨撤步', 'ranged', 'trap', 'proj', 'inktrap', 'timestop', '星火穿刺', '重力削防', '六连星轨合击', '他打架前先量距离，误差不超过半寸。', '星规一合，重力场里谁都跑不快。'],
    ['qingluan', 'jf', '翠羽扇舞', '青鸾蓄风', '御风轻扇', '翠羽清风', '鸾羽回春', '鸾鸣九霄', '翠羽腾空', 'ranged', 'counter', 'windblade', 'moonflow', 'tornado', '清风迟缓', '回春震退', '六道鸾风扫荡', '医扇既能救人，也能把人扇出三丈远。', '别急着贴脸，回春扇一震你就飞了。'],
    ['xuanwu', 'bs', '玄甲重盾砸', '镇岳蓄撞', '凌空龟甲压', '玄甲冲撞', '镇岳壁垒', '玄武镇岳', '玄甲腾跃', 'dash', 'counter', 'ironwall', 'mirror', 'avalanche', '霸体撞飞', '壁垒回势', '四记撼岳重锤', '玄武龟甲敲起来咚咚响，震麻的是你的手。', '开起镇岳壁垒，你先打完一套我再动。'],
  ];
  for (const [id, pfx, lName, cName, aName, qName, rName, eName, escName, qType, rType, qFx, rFx, eFx, qTag, rTag, eTag, fun1, fun2] of EXP_HEROES) {
    const s1 = pfx + '_l1s', a1 = pfx + '_l1a', s2 = pfx + '_l2s', a2 = pfx + '_l2a';
    HERO_MOVE_TYPES[id] = {
      light: { type: 'melee', label: '近战连招', rng: 'melee' },
      charge: { type: 'melee', label: '蓄力破防', rng: 'melee' },
      air: { type: 'air', label: '空中连击', rng: 'air' },
      skill: { type: qType, label: qTag, rng: qType === 'ranged' ? 'ranged' : 'mid', icon: qType === 'ranged' ? 'ranged' : qType === 'trap' ? 'magic_trap' : 'melee' },
      ranged: { type: rType, label: rTag, rng: rType === 'ranged' ? 'ranged' : 'mid', icon: rType === 'counter' ? 'shield_bash' : rType === 'trap' ? 'magic_trap' : rType === 'ranged' ? 'ranged' : 'melee' },
      ult: { type: 'fullscreen', label: eTag, rng: 'screen' },
      esc: { type: 'esc', label: '身法' }
    };
    HERO_HIT_DETAILS[id] = {
      light: { name: lName, badge: '✦ 专属兵器连段', badgeCls: 'badge-buff', dmg: '5段连击', desc: `${lName}，以专属兵器轨迹连环压制，末段击飞。` },
      charge: { name: cName, badge: '💥 破防打倒', badgeCls: 'badge-break', dmg: '满蓄破防', desc: `长按蓄力施展${cName}，正面击穿防御并打倒对手。` },
      air: { name: aName, badge: '🌪️ 空中压制', badgeCls: 'badge-buff', dmg: '空中2段', desc: `跃起施展${aName}，灵活衔接空中追击与下压。` },
      skill: { name: qName, badge: `⚡ ${qTag}`, badgeCls: 'badge-stun', dmg: 'Q 技能', desc: `施展${qName}，${qTag}并创造连段节奏。` },
      ranged: { name: rName, badge: `✦ ${rTag}`, badgeCls: 'badge-break', dmg: 'R 绝技', desc: `施展${rName}，${rTag}扭转战局。` },
      ult: { name: eName, badge: `✦ ${eTag}`, badgeCls: 'badge-stun', dmg: '终极奥义', desc: `气满爆发「${eName}」，${eTag}重创对手。` },
      esc: { name: escName, badge: '🛡️ 霸体解控', badgeCls: 'badge-break', dmg: '—', desc: '强解受击硬直，腾空后撤位移，落地前无敌。' }
    };
    HERO_MOVE_SEQS[id] = {
      light: [
        { p: 'idle', d: 0.1, reset: true },
        { p: s1, d: 0.08, lab: lName }, { p: a1, d: 0.13, dx: 12, hit: 1 },
        { p: s2, d: 0.08 }, { p: a2, d: 0.13, dx: 14, hit: 1 },
        { p: s1, d: 0.08 }, { p: a2, d: 0.22, dx: 18, hit: 2, launch: true, badge: '末段击飞' },
        { p: 'idle', d: 0.32, reset: true }
      ],
      charge: [
        { p: 'idle', d: 0.1, reset: true },
        { p: 'charge', d: 0.42, lab: cName },
        { p: a2, d: 0.3, dx: 34, hit: 3, launch: true, badge: '💥 破防打倒' },
        { p: 'idle', d: 0.32, reset: true }
      ],
      air: [
        { p: 'idle', d: 0.1, reset: true },
        { p: 'jump', d: 0.16, dy: -46, lab: aName },
        { p: a1, d: 0.16, dy: -42, hit: 1 },
        { p: a2, d: 0.24, dy: 0, hit: 2, launch: true },
        { p: 'idle', d: 0.32, reset: true }
      ],
      skill: [
        { p: 'idle', d: 0.1, reset: true },
        { p: s1, d: 0.14, lab: `Q · ${qName}` },
        { p: a1, d: 0.34, dx: qType === 'dash' ? 48 : 18, hit: 2, fx: qFx, launch: qType === 'mid', badge: qTag },
        { p: 'idle', d: 0.32, reset: true }
      ],
      ranged: [
        { p: 'idle', d: 0.1, reset: true },
        { p: s2, d: 0.14, lab: `R · ${rName}` },
        { p: a2, d: 0.36, dx: rType === 'dash' ? 44 : 14, hit: 2, fx: rFx, launch: true, badge: rTag },
        { p: 'idle', d: 0.32, reset: true }
      ],
      ult: [
        { p: 'idle', d: 0.1, reset: true },
        { p: s1, d: 0.2, lab: `E · ${eName}` },
        { p: a1, d: 0.16, dx: 42, hit: 1, fx: eFx },
        { p: a2, d: 0.14, hit: 1 },
        { p: a1, d: 0.14, hit: 1 },
        { p: a2, d: 0.32, hit: 3, launch: true, fx: eFx, badge: eTag },
        { p: 'victory', d: 0.45, reset: true }
      ],
      esc: [
        { p: 'idle', d: 0.1, reset: true },
        { p: 'jump', d: 0.14, lab: `右键 · ${escName}` },
        { p: 'bdash', d: 0.3, dx: -36, badge: escName },
        { p: 'idle', d: 0.32, reset: true }
      ]
    };
    HERO_ULT_REPLAYS[id] = [
      { p: s1, d: 0.36, lab: `${eName} · 蓄势` },
      { p: 'dash', d: 0.22, dx: 54, fx: eFx, badge: '疾驰突进' },
      { p: a1, d: 0.12, hit: 1 }, { p: a2, d: 0.12, hit: 1 },
      { p: a1, d: 0.12, hit: 1 }, { p: a2, d: 0.12, hit: 1 },
      { p: s2, d: 0.16, dy: -32, lab: `${eTag} · 终结` },
      { p: a2, d: 0.32, dy: 0, hit: 3, launch: true, fx: eFx, badge: eTag },
      { p: 'victory', d: 0.42, reset: true, lab: `${eName} · 收势` }
    ];
    HERO_FULL_DEMO[id] = [
      { p: 'idle', d: 0.18, reset: true },
      { p: s1, d: 0.08, lab: lName }, { p: a1, d: 0.12, dx: 12, hit: 1 },
      { p: s2, d: 0.08 }, { p: a2, d: 0.2, dx: 16, hit: 2, launch: true },
      { p: 'idle', d: 0.22, reset: true },
      { p: s1, d: 0.14, lab: `Q · ${qName}` }, { p: a1, d: 0.32, dx: qType === 'dash' ? 44 : 16, hit: 2, fx: qFx, badge: qTag },
      { p: 'idle', d: 0.22, reset: true },
      { p: s2, d: 0.14, lab: `R · ${rName}` }, { p: a2, d: 0.34, dx: rType === 'dash' ? 40 : 14, hit: 2, fx: rFx, launch: true, badge: rTag },
      { p: 'idle', d: 0.22, reset: true },
      { p: s1, d: 0.2, lab: `E · ${eName}` }, { p: a1, d: 0.14, dx: 42, hit: 1, fx: eFx },
      { p: a2, d: 0.12, hit: 1 }, { p: a2, d: 0.32, hit: 3, launch: true, fx: eFx, badge: eTag },
      { p: 'victory', d: 0.5, reset: true }
    ];
    SKILL_FUN[id] = {
      passive: fun1,
      light: `${lName}，每一式都带着独门兵器的劲道。`,
      charge: `蓄满${cName}，格挡在它面前像纸一样薄。`,
      air: `凌空使出${aName}，制空追击一气呵成。`,
      skill: fun2,
      ranged: `${rName}一出，${rTag}让对手措手不及。`,
      ult: `气满施展「${eName}」，${eTag}定乾坤。`,
      esc: `${escName}顺势抽身，化险为夷。`
    };
  }
})();

let cxPrev = null;   // 正在预览的皮肤（null = 用自己装备的）
