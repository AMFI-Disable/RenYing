// ======================= 战场地图数据表 =======================
// 每张地图面向所有侠客开放，具有通用的几何结构（多层穿透高台、标准竞技边界）、地面特性与天象环境律则；
// 同时设有 2 位具有特定身法与招式共鸣的【地利侠客】（在点将台点将席位以流金边框与「★ 地利」标出）。
const MAPS = {
  bamboo: {
    id: 'bamboo',
    name: '竹海悬岩',
    sub: '两端竹台高悬 · 疾风呼啸',
    desc: '两侧架设竹楼高台，全员可借力攀空；每 18 秒刮起强风，顺风冲刺 +20% 冲力，飞行道具沿风加速。',
    width: { normal: 1800, multi: 2600 },
    theme: 'bamboo',
    platforms: [
      { id: 'bamboo_l', x: 420, y: -115, w: 240, h: 12, kind: 'bamboo' },
      { id: 'bamboo_r', x: 1380, y: -115, w: 240, h: 12, kind: 'bamboo' }
    ],
    favored: ['qingfeng', 'yanling'],
    favoredDesc: {
      qingfeng: '剑气借风势呼啸：破空斩与蓄力剑气顺风释放时飞行速度提升 25% 且附带额外击退。',
      yanling: '乘风御空：高台凌空滑翔及空中腾挪时长提升 25%，浮空受击硬直轻微减弱。'
    }
  },
  thunder: {
    id: 'thunder',
    name: '雷泽石坛',
    sub: '中央石坛耸峙 · 孤峰引雷',
    desc: '中央耸立远古石坛；每 24 秒九天雷云聚顶，雷霆轰击石坛最高点，被击中者破防浮空。',
    width: { normal: 1800, multi: 2600 },
    theme: 'thunder',
    platforms: [
      { id: 'thunder_mid', x: 900, y: -120, w: 320, h: 14, kind: 'stone' }
    ],
    favored: ['leiming', 'gouchen'],
    favoredDesc: {
      leiming: '引雷淬体：身处中央雷击范围免受雷罚，更直接蓄满 +35 怒气并进入电弧充能状态。',
      gouchen: '巨力踏石：重击地裂及千钧坠砸在石坛或水洼时，震荡波定力穿透额外提高 15 点。'
    }
  },
  ice: {
    id: 'ice',
    name: '凌霜冻潭',
    sub: '极寒玄冰如镜 · 步法滑行',
    desc: '极寒玄冰地面摩擦力降低 40%，冲刺回旋滑行更远；格挡重击时受力后滑，立回变幻莫测。',
    width: { normal: 1800, multi: 2600 },
    theme: 'ice',
    platforms: [],
    favored: ['lingshuang', 'tieshan'],
    favoredDesc: {
      lingshuang: '玄冰如履平地：冲刺轻击滑步距离延长 30% 且后摇减免，闪身如极光掠影。',
      tieshan: '千斤神力镇压：庞大体量不受冰面失稳干扰，肩撞与蓄力猛击冲撞速度更上一层楼。'
    }
  },
  pagoda: {
    id: 'pagoda',
    name: '皇城飞檐',
    sub: '三重殿宇飞檐 · 凌空绝壁',
    desc: '三层飞檐殿顶错落；两端为开阔悬空绝壁（无红柱撞墙硬直），将对手击落飞檐使其硬直更久。',
    width: { normal: 1800, multi: 2600 },
    theme: 'pagoda',
    platforms: [
      { id: 'pagoda_l', x: 380, y: -105, w: 220, h: 12, kind: 'wood' },
      { id: 'pagoda_mid', x: 900, y: -180, w: 260, h: 12, kind: 'wood' },
      { id: 'pagoda_r', x: 1420, y: -105, w: 220, h: 12, kind: 'wood' }
    ],
    favored: ['feiying', 'lingque'],
    favoredDesc: {
      feiying: '飞檐隐匿：瞬身突刺越过殿檐落差时身法如魅，获得 0.25 秒额外残影无敌判定。',
      lingque: '绝壁雀影：高低檐台穿梭时雀影突刺跟踪角度扩大，击中高处敌人破绽倍增。'
    }
  },
  wine: {
    id: 'wine',
    name: '醉翁墨阁',
    sub: '水榭亭台酒肆 · 墨香酒雾',
    desc: '中央水榭亭台林立；击碎酒坛升腾醉雾，身处雾中每秒恢复定力，但转身略微迟缓。',
    width: { normal: 1800, multi: 2600 },
    theme: 'wine',
    platforms: [
      { id: 'wine_l', x: 520, y: -110, w: 240, h: 12, kind: 'wood' },
      { id: 'wine_r', x: 1280, y: -110, w: 240, h: 12, kind: 'wood' }
    ],
    favored: ['zuixian', 'moyu'],
    favoredDesc: {
      zuixian: '酒香浸染：酒肆环境使醉意自然增长加快，与民同乐消耗减免 20%。',
      moyu: '水榭湿润：地面画符与墨池陷阱蔓延范围扩大 35%，对敌缠足迟缓效果更为持久。'
    }
  }
};

const MAP_KEYS = Object.keys(MAPS);
function getRandomMapId() {
  return MAP_KEYS[(Math.random() * MAP_KEYS.length) | 0];
}
function getMapById(id) {
  return (id && MAPS[id]) ? MAPS[id] : MAPS.bamboo;
}
