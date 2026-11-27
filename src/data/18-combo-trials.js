// ======================= 二十侠客连招试炼与专精等级表 (#57) =======================
// 每位侠客 3 阶连招试炼（入门 / 进阶 / 宗师，共 60 项），严格使用各侠客真实技能名。
const MASTERY_LEVEL_XP = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200];
const MASTERY_TITLES = [
  '初窥门径', '登堂入室', '炉火纯青', '出神入化', '一代宗师',
  '武林泰斗', '剑心通明', '天人合一', '绝世无双', '万法归宗'
];

const TRIAL_STEP_LABELS = {
  light: '普攻命中',
  light3: '普攻三连',
  charge: '蓄力斩',
  air: '空中攻击',
  skill: 'Q 门派技',
  skill2: 'R 特殊技',
  ult: 'E 终极奥义',
};

function buildComboTrials() {
  const map = {};
  if (typeof CHARS === 'undefined' || !Array.isArray(CHARS)) return map;
  for (const ch of CHARS) {
    const sk1 = (typeof SKILLS !== 'undefined' && SKILLS[ch.skill] && SKILLS[ch.skill].name) ? SKILLS[ch.skill].name.split('·')[0].trim() : 'Q 技能';
    const sk2 = (typeof SKILLS !== 'undefined' && SKILLS[ch.skill2] && SKILLS[ch.skill2].name) ? SKILLS[ch.skill2].name.split('·')[0].trim() : 'R 技能';
    const ul = (typeof ULTS !== 'undefined' && ULTS[ch.ult] && ULTS[ch.ult].name) ? ULTS[ch.ult].name.split('·')[0].trim() : 'E 奥义';
    map[ch.id] = [
      {
        id: `${ch.id}_t1`,
        heroId: ch.id,
        tier: 'basic',
        tierName: '入门',
        name: `基础起手 · 普攻接${sk1}`,
        steps: ['light', 'skill'],
        stepLabels: ['普攻命中', `Q · ${sk1}`],
        xp: 60,
        ink: 20,
      },
      {
        id: `${ch.id}_t2`,
        heroId: ch.id,
        tier: 'advanced',
        tierName: '进阶',
        name: `双技连携 · ${sk1}转${sk2}`,
        steps: ['light', 'skill', 'skill2'],
        stepLabels: ['普攻命中', `Q · ${sk1}`, `R · ${sk2}`],
        xp: 100,
        ink: 35,
      },
      {
        id: `${ch.id}_t3`,
        heroId: ch.id,
        tier: 'master',
        tierName: '宗师',
        name: `绝学收尾 · 破势接${ul}`,
        steps: ['charge', 'skill', 'ult'],
        stepLabels: ['蓄力斩', `Q · ${sk1}`, `E · ${ul}`],
        xp: 160,
        ink: 60,
      },
    ];
  }
  return map;
}
