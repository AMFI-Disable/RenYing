// ======================= 天机乱斗 / 神决：随机异变的模式 =======================
// 本文件：天机乱斗（CHAOS_MUTATIONS：每隔一段时间换一种异变，名字和效果都在表里）、神决（mayhem）的开局，
// 以及问剑密卷、天机、神决几个模式卡上的按钮。
// 找 bug 提示：异变按对局随机数抽（rollChaosMutation），联机两边一致；效果在 updateChaos 里每帧生效。
const CHAOS_MUTATIONS = [
  { id: "chaos_1", name: "「疾风·天罡」", icon: "🌪️", type: "spd", val: 1.45, desc: "身法迅疾，移动速度提升45% · 天罡北斗，刚劲无俦" },
  { id: "chaos_2", name: "「疾风·地煞」", icon: "🌪️", type: "spd", val: 1.45, desc: "身法迅疾，移动速度提升45% · 地煞幽冥，出奇制胜" },
  { id: "chaos_3", name: "「疾风·青龙」", icon: "🌪️", type: "spd", val: 1.45, desc: "身法迅疾，移动速度提升45% · 青龙出海，威动乾坤" },
  { id: "chaos_4", name: "「疾风·白虎」", icon: "🌪️", type: "spd", val: 1.45, desc: "身法迅疾，移动速度提升45% · 白虎啸风，势不可挡" },
  { id: "chaos_5", name: "「疾风·朱雀」", icon: "🌪️", type: "spd", val: 1.45, desc: "身法迅疾，移动速度提升45% · 朱雀振羽，生生不息" },
  { id: "chaos_6", name: "「疾风·玄武」", icon: "🌪️", type: "spd", val: 1.45, desc: "身法迅疾，移动速度提升45% · 玄武镇岳，坚固磐石" },
  { id: "chaos_7", name: "「疾风·破晓」", icon: "🌪️", type: "spd", val: 1.45, desc: "身法迅疾，移动速度提升45% · 破晓晨光，势如长虹" },
  { id: "chaos_8", name: "「疾风·残月」", icon: "🌪️", type: "spd", val: 1.45, desc: "身法迅疾，移动速度提升45% · 孤月映水，来去无痕" },
  { id: "chaos_9", name: "「疾风·奔雷」", icon: "🌪️", type: "spd", val: 1.45, desc: "身法迅疾，移动速度提升45% · 狂雷贯顶，迅若闪电" },
  { id: "chaos_10", name: "「疾风·离火」", icon: "🌪️", type: "spd", val: 1.45, desc: "身法迅疾，移动速度提升45% · 炽火焚天，烽烟万里" },
  { id: "chaos_11", name: "「迅影·天罡」", icon: "⚡", type: "dash_cd", val: 0.4, desc: "轻功拔群，冲刺冷却缩减60% · 天罡北斗，刚劲无俦" },
  { id: "chaos_12", name: "「迅影·地煞」", icon: "⚡", type: "dash_cd", val: 0.4, desc: "轻功拔群，冲刺冷却缩减60% · 地煞幽冥，出奇制胜" },
  { id: "chaos_13", name: "「迅影·青龙」", icon: "⚡", type: "dash_cd", val: 0.4, desc: "轻功拔群，冲刺冷却缩减60% · 青龙出海，威动乾坤" },
  { id: "chaos_14", name: "「迅影·白虎」", icon: "⚡", type: "dash_cd", val: 0.4, desc: "轻功拔群，冲刺冷却缩减60% · 白虎啸风，势不可挡" },
  { id: "chaos_15", name: "「迅影·朱雀」", icon: "⚡", type: "dash_cd", val: 0.4, desc: "轻功拔群，冲刺冷却缩减60% · 朱雀振羽，生生不息" },
  { id: "chaos_16", name: "「迅影·玄武」", icon: "⚡", type: "dash_cd", val: 0.4, desc: "轻功拔群，冲刺冷却缩减60% · 玄武镇岳，坚固磐石" },
  { id: "chaos_17", name: "「迅影·破晓」", icon: "⚡", type: "dash_cd", val: 0.4, desc: "轻功拔群，冲刺冷却缩减60% · 破晓晨光，势如长虹" },
  { id: "chaos_18", name: "「迅影·残月」", icon: "⚡", type: "dash_cd", val: 0.4, desc: "轻功拔群，冲刺冷却缩减60% · 孤月映水，来去无痕" },
  { id: "chaos_19", name: "「迅影·奔雷」", icon: "⚡", type: "dash_cd", val: 0.4, desc: "轻功拔群，冲刺冷却缩减60% · 狂雷贯顶，迅若闪电" },
  { id: "chaos_20", name: "「迅影·离火」", icon: "⚡", type: "dash_cd", val: 0.4, desc: "轻功拔群，冲刺冷却缩减60% · 炽火焚天，烽烟万里" },
  { id: "chaos_21", name: "「千钧·天罡」", icon: "💥", type: "dmg", val: 1.4, desc: "力拔千钧，招式伤害提升40% · 天罡北斗，刚劲无俦" },
  { id: "chaos_22", name: "「千钧·地煞」", icon: "💥", type: "dmg", val: 1.4, desc: "力拔千钧，招式伤害提升40% · 地煞幽冥，出奇制胜" },
  { id: "chaos_23", name: "「千钧·青龙」", icon: "💥", type: "dmg", val: 1.4, desc: "力拔千钧，招式伤害提升40% · 青龙出海，威动乾坤" },
  { id: "chaos_24", name: "「千钧·白虎」", icon: "💥", type: "dmg", val: 1.4, desc: "力拔千钧，招式伤害提升40% · 白虎啸风，势不可挡" },
  { id: "chaos_25", name: "「千钧·朱雀」", icon: "💥", type: "dmg", val: 1.4, desc: "力拔千钧，招式伤害提升40% · 朱雀振羽，生生不息" },
  { id: "chaos_26", name: "「千钧·玄武」", icon: "💥", type: "dmg", val: 1.4, desc: "力拔千钧，招式伤害提升40% · 玄武镇岳，坚固磐石" },
  { id: "chaos_27", name: "「千钧·破晓」", icon: "💥", type: "dmg", val: 1.4, desc: "力拔千钧，招式伤害提升40% · 破晓晨光，势如长虹" },
  { id: "chaos_28", name: "「千钧·残月」", icon: "💥", type: "dmg", val: 1.4, desc: "力拔千钧，招式伤害提升40% · 孤月映水，来去无痕" },
  { id: "chaos_29", name: "「千钧·奔雷」", icon: "💥", type: "dmg", val: 1.4, desc: "力拔千钧，招式伤害提升40% · 狂雷贯顶，迅若闪电" },
  { id: "chaos_30", name: "「千钧·离火」", icon: "💥", type: "dmg", val: 1.4, desc: "力拔千钧，招式伤害提升40% · 炽火焚天，烽烟万里" },
  { id: "chaos_31", name: "「重浪·天罡」", icon: "🌊", type: "kb", val: 2.0, desc: "惊涛裂岸，攻击击退力提升100% · 天罡北斗，刚劲无俦" },
  { id: "chaos_32", name: "「重浪·地煞」", icon: "🌊", type: "kb", val: 2.0, desc: "惊涛裂岸，攻击击退力提升100% · 地煞幽冥，出奇制胜" },
  { id: "chaos_33", name: "「重浪·青龙」", icon: "🌊", type: "kb", val: 2.0, desc: "惊涛裂岸，攻击击退力提升100% · 青龙出海，威动乾坤" },
  { id: "chaos_34", name: "「重浪·白虎」", icon: "🌊", type: "kb", val: 2.0, desc: "惊涛裂岸，攻击击退力提升100% · 白虎啸风，势不可挡" },
  { id: "chaos_35", name: "「重浪·朱雀」", icon: "🌊", type: "kb", val: 2.0, desc: "惊涛裂岸，攻击击退力提升100% · 朱雀振羽，生生不息" },
  { id: "chaos_36", name: "「重浪·玄武」", icon: "🌊", type: "kb", val: 2.0, desc: "惊涛裂岸，攻击击退力提升100% · 玄武镇岳，坚固磐石" },
  { id: "chaos_37", name: "「重浪·破晓」", icon: "🌊", type: "kb", val: 2.0, desc: "惊涛裂岸，攻击击退力提升100% · 破晓晨光，势如长虹" },
  { id: "chaos_38", name: "「重浪·残月」", icon: "🌊", type: "kb", val: 2.0, desc: "惊涛裂岸，攻击击退力提升100% · 孤月映水，来去无痕" },
  { id: "chaos_39", name: "「重浪·奔雷」", icon: "🌊", type: "kb", val: 2.0, desc: "惊涛裂岸，攻击击退力提升100% · 狂雷贯顶，迅若闪电" },
  { id: "chaos_40", name: "「重浪·离火」", icon: "🌊", type: "kb", val: 2.0, desc: "惊涛裂岸，攻击击退力提升100% · 炽火焚天，烽烟万里" },
  { id: "chaos_41", name: "「踏虚·天罡」", icon: "🪶", type: "grav", val: 0.5, desc: "御风凌虚，重力减半滞空延长 · 天罡北斗，刚劲无俦" },
  { id: "chaos_42", name: "「踏虚·地煞」", icon: "🪶", type: "grav", val: 0.5, desc: "御风凌虚，重力减半滞空延长 · 地煞幽冥，出奇制胜" },
  { id: "chaos_43", name: "「踏虚·青龙」", icon: "🪶", type: "grav", val: 0.5, desc: "御风凌虚，重力减半滞空延长 · 青龙出海，威动乾坤" },
  { id: "chaos_44", name: "「踏虚·白虎」", icon: "🪶", type: "grav", val: 0.5, desc: "御风凌虚，重力减半滞空延长 · 白虎啸风，势不可挡" },
  { id: "chaos_45", name: "「踏虚·朱雀」", icon: "🪶", type: "grav", val: 0.5, desc: "御风凌虚，重力减半滞空延长 · 朱雀振羽，生生不息" },
  { id: "chaos_46", name: "「踏虚·玄武」", icon: "🪶", type: "grav", val: 0.5, desc: "御风凌虚，重力减半滞空延长 · 玄武镇岳，坚固磐石" },
  { id: "chaos_47", name: "「踏虚·破晓」", icon: "🪶", type: "grav", val: 0.5, desc: "御风凌虚，重力减半滞空延长 · 破晓晨光，势如长虹" },
  { id: "chaos_48", name: "「踏虚·残月」", icon: "🪶", type: "grav", val: 0.5, desc: "御风凌虚，重力减半滞空延长 · 孤月映水，来去无痕" },
  { id: "chaos_49", name: "「踏虚·奔雷」", icon: "🪶", type: "grav", val: 0.5, desc: "御风凌虚，重力减半滞空延长 · 狂雷贯顶，迅若闪电" },
  { id: "chaos_50", name: "「踏虚·离火」", icon: "🪶", type: "grav", val: 0.5, desc: "御风凌虚，重力减半滞空延长 · 炽火焚天，烽烟万里" },
  { id: "chaos_51", name: "「凌霄·天罡」", icon: "🕊️", type: "jump", val: 1.45, desc: "凌云蹑虚，起跳高度提升45% · 天罡北斗，刚劲无俦" },
  { id: "chaos_52", name: "「凌霄·地煞」", icon: "🕊️", type: "jump", val: 1.45, desc: "凌云蹑虚，起跳高度提升45% · 地煞幽冥，出奇制胜" },
  { id: "chaos_53", name: "「凌霄·青龙」", icon: "🕊️", type: "jump", val: 1.45, desc: "凌云蹑虚，起跳高度提升45% · 青龙出海，威动乾坤" },
  { id: "chaos_54", name: "「凌霄·白虎」", icon: "🕊️", type: "jump", val: 1.45, desc: "凌云蹑虚，起跳高度提升45% · 白虎啸风，势不可挡" },
  { id: "chaos_55", name: "「凌霄·朱雀」", icon: "🕊️", type: "jump", val: 1.45, desc: "凌云蹑虚，起跳高度提升45% · 朱雀振羽，生生不息" },
  { id: "chaos_56", name: "「凌霄·玄武」", icon: "🕊️", type: "jump", val: 1.45, desc: "凌云蹑虚，起跳高度提升45% · 玄武镇岳，坚固磐石" },
  { id: "chaos_57", name: "「凌霄·破晓」", icon: "🕊️", type: "jump", val: 1.45, desc: "凌云蹑虚，起跳高度提升45% · 破晓晨光，势如长虹" },
  { id: "chaos_58", name: "「凌霄·残月」", icon: "🕊️", type: "jump", val: 1.45, desc: "凌云蹑虚，起跳高度提升45% · 孤月映水，来去无痕" },
  { id: "chaos_59", name: "「凌霄·奔雷」", icon: "🕊️", type: "jump", val: 1.45, desc: "凌云蹑虚，起跳高度提升45% · 狂雷贯顶，迅若闪电" },
  { id: "chaos_60", name: "「凌霄·离火」", icon: "🕊️", type: "jump", val: 1.45, desc: "凌云蹑虚，起跳高度提升45% · 炽火焚天，烽烟万里" },
  { id: "chaos_61", name: "「狂涌·天罡」", icon: "🔥", type: "meter_gain", val: 2.0, desc: "真气狂涌，聚气速度翻倍 · 天罡北斗，刚劲无俦" },
  { id: "chaos_62", name: "「狂涌·地煞」", icon: "🔥", type: "meter_gain", val: 2.0, desc: "真气狂涌，聚气速度翻倍 · 地煞幽冥，出奇制胜" },
  { id: "chaos_63", name: "「狂涌·青龙」", icon: "🔥", type: "meter_gain", val: 2.0, desc: "真气狂涌，聚气速度翻倍 · 青龙出海，威动乾坤" },
  { id: "chaos_64", name: "「狂涌·白虎」", icon: "🔥", type: "meter_gain", val: 2.0, desc: "真气狂涌，聚气速度翻倍 · 白虎啸风，势不可挡" },
  { id: "chaos_65", name: "「狂涌·朱雀」", icon: "🔥", type: "meter_gain", val: 2.0, desc: "真气狂涌，聚气速度翻倍 · 朱雀振羽，生生不息" },
  { id: "chaos_66", name: "「狂涌·玄武」", icon: "🔥", type: "meter_gain", val: 2.0, desc: "真气狂涌，聚气速度翻倍 · 玄武镇岳，坚固磐石" },
  { id: "chaos_67", name: "「狂涌·破晓」", icon: "🔥", type: "meter_gain", val: 2.0, desc: "真气狂涌，聚气速度翻倍 · 破晓晨光，势如长虹" },
  { id: "chaos_68", name: "「狂涌·残月」", icon: "🔥", type: "meter_gain", val: 2.0, desc: "真气狂涌，聚气速度翻倍 · 孤月映水，来去无痕" },
  { id: "chaos_69", name: "「狂涌·奔雷」", icon: "🔥", type: "meter_gain", val: 2.0, desc: "真气狂涌，聚气速度翻倍 · 狂雷贯顶，迅若闪电" },
  { id: "chaos_70", name: "「狂涌·离火」", icon: "🔥", type: "meter_gain", val: 2.0, desc: "真气狂涌，聚气速度翻倍 · 炽火焚天，烽烟万里" },
  { id: "chaos_71", name: "「神通·天罡」", icon: "✨", type: "cd", val: 0.4, desc: "招意通灵，技能冷却缩减60% · 天罡北斗，刚劲无俦" },
  { id: "chaos_72", name: "「神通·地煞」", icon: "✨", type: "cd", val: 0.4, desc: "招意通灵，技能冷却缩减60% · 地煞幽冥，出奇制胜" },
  { id: "chaos_73", name: "「神通·青龙」", icon: "✨", type: "cd", val: 0.4, desc: "招意通灵，技能冷却缩减60% · 青龙出海，威动乾坤" },
  { id: "chaos_74", name: "「神通·白虎」", icon: "✨", type: "cd", val: 0.4, desc: "招意通灵，技能冷却缩减60% · 白虎啸风，势不可挡" },
  { id: "chaos_75", name: "「神通·朱雀」", icon: "✨", type: "cd", val: 0.4, desc: "招意通灵，技能冷却缩减60% · 朱雀振羽，生生不息" },
  { id: "chaos_76", name: "「神通·玄武」", icon: "✨", type: "cd", val: 0.4, desc: "招意通灵，技能冷却缩减60% · 玄武镇岳，坚固磐石" },
  { id: "chaos_77", name: "「神通·破晓」", icon: "✨", type: "cd", val: 0.4, desc: "招意通灵，技能冷却缩减60% · 破晓晨光，势如长虹" },
  { id: "chaos_78", name: "「神通·残月」", icon: "✨", type: "cd", val: 0.4, desc: "招意通灵，技能冷却缩减60% · 孤月映水，来去无痕" },
  { id: "chaos_79", name: "「神通·奔雷」", icon: "✨", type: "cd", val: 0.4, desc: "招意通灵，技能冷却缩减60% · 狂雷贯顶，迅若闪电" },
  { id: "chaos_80", name: "「神通·离火」", icon: "✨", type: "cd", val: 0.4, desc: "招意通灵，技能冷却缩减60% · 炽火焚天，烽烟万里" },
  { id: "chaos_81", name: "「霸体·天罡」", icon: "🛡️", type: "armor", val: 1, desc: "金石铸身，出招附带强韧霸体 · 天罡北斗，刚劲无俦" },
  { id: "chaos_82", name: "「霸体·地煞」", icon: "🛡️", type: "armor", val: 1, desc: "金石铸身，出招附带强韧霸体 · 地煞幽冥，出奇制胜" },
  { id: "chaos_83", name: "「霸体·青龙」", icon: "🛡️", type: "armor", val: 1, desc: "金石铸身，出招附带强韧霸体 · 青龙出海，威动乾坤" },
  { id: "chaos_84", name: "「霸体·白虎」", icon: "🛡️", type: "armor", val: 1, desc: "金石铸身，出招附带强韧霸体 · 白虎啸风，势不可挡" },
  { id: "chaos_85", name: "「霸体·朱雀」", icon: "🛡️", type: "armor", val: 1, desc: "金石铸身，出招附带强韧霸体 · 朱雀振羽，生生不息" },
  { id: "chaos_86", name: "「霸体·玄武」", icon: "🛡️", type: "armor", val: 1, desc: "金石铸身，出招附带强韧霸体 · 玄武镇岳，坚固磐石" },
  { id: "chaos_87", name: "「霸体·破晓」", icon: "🛡️", type: "armor", val: 1, desc: "金石铸身，出招附带强韧霸体 · 破晓晨光，势如长虹" },
  { id: "chaos_88", name: "「霸体·残月」", icon: "🛡️", type: "armor", val: 1, desc: "金石铸身，出招附带强韧霸体 · 孤月映水，来去无痕" },
  { id: "chaos_89", name: "「霸体·奔雷」", icon: "🛡️", type: "armor", val: 1, desc: "金石铸身，出招附带强韧霸体 · 狂雷贯顶，迅若闪电" },
  { id: "chaos_90", name: "「霸体·离火」", icon: "🛡️", type: "armor", val: 1, desc: "金石铸身，出招附带强韧霸体 · 炽火焚天，烽烟万里" },
  { id: "chaos_91", name: "「金刚·天罡」", icon: "🔔", type: "guard_stab", val: 2.0, desc: "不动如山，架势防御强度翻倍 · 天罡北斗，刚劲无俦" },
  { id: "chaos_92", name: "「金刚·地煞」", icon: "🔔", type: "guard_stab", val: 2.0, desc: "不动如山，架势防御强度翻倍 · 地煞幽冥，出奇制胜" },
  { id: "chaos_93", name: "「金刚·青龙」", icon: "🔔", type: "guard_stab", val: 2.0, desc: "不动如山，架势防御强度翻倍 · 青龙出海，威动乾坤" },
  { id: "chaos_94", name: "「金刚·白虎」", icon: "🔔", type: "guard_stab", val: 2.0, desc: "不动如山，架势防御强度翻倍 · 白虎啸风，势不可挡" },
  { id: "chaos_95", name: "「金刚·朱雀」", icon: "🔔", type: "guard_stab", val: 2.0, desc: "不动如山，架势防御强度翻倍 · 朱雀振羽，生生不息" },
  { id: "chaos_96", name: "「金刚·玄武」", icon: "🔔", type: "guard_stab", val: 2.0, desc: "不动如山，架势防御强度翻倍 · 玄武镇岳，坚固磐石" },
  { id: "chaos_97", name: "「金刚·破晓」", icon: "🔔", type: "guard_stab", val: 2.0, desc: "不动如山，架势防御强度翻倍 · 破晓晨光，势如长虹" },
  { id: "chaos_98", name: "「金刚·残月」", icon: "🔔", type: "guard_stab", val: 2.0, desc: "不动如山，架势防御强度翻倍 · 孤月映水，来去无痕" },
  { id: "chaos_99", name: "「金刚·奔雷」", icon: "🔔", type: "guard_stab", val: 2.0, desc: "不动如山，架势防御强度翻倍 · 狂雷贯顶，迅若闪电" },
  { id: "chaos_100", name: "「金刚·离火」", icon: "🔔", type: "guard_stab", val: 2.0, desc: "不动如山，架势防御强度翻倍 · 炽火焚天，烽烟万里" },
  { id: "chaos_101", name: "「血煞·天罡」", icon: "🩸", type: "vamp", val: 0.25, desc: "饮血淬锋，命中吸血25% · 天罡北斗，刚劲无俦" },
  { id: "chaos_102", name: "「血煞·地煞」", icon: "🩸", type: "vamp", val: 0.25, desc: "饮血淬锋，命中吸血25% · 地煞幽冥，出奇制胜" },
  { id: "chaos_103", name: "「血煞·青龙」", icon: "🩸", type: "vamp", val: 0.25, desc: "饮血淬锋，命中吸血25% · 青龙出海，威动乾坤" },
  { id: "chaos_104", name: "「血煞·白虎」", icon: "🩸", type: "vamp", val: 0.25, desc: "饮血淬锋，命中吸血25% · 白虎啸风，势不可挡" },
  { id: "chaos_105", name: "「血煞·朱雀」", icon: "🩸", type: "vamp", val: 0.25, desc: "饮血淬锋，命中吸血25% · 朱雀振羽，生生不息" },
  { id: "chaos_106", name: "「血煞·玄武」", icon: "🩸", type: "vamp", val: 0.25, desc: "饮血淬锋，命中吸血25% · 玄武镇岳，坚固磐石" },
  { id: "chaos_107", name: "「血煞·破晓」", icon: "🩸", type: "vamp", val: 0.25, desc: "饮血淬锋，命中吸血25% · 破晓晨光，势如长虹" },
  { id: "chaos_108", name: "「血煞·残月」", icon: "🩸", type: "vamp", val: 0.25, desc: "饮血淬锋，命中吸血25% · 孤月映水，来去无痕" },
  { id: "chaos_109", name: "「血煞·奔雷」", icon: "🩸", type: "vamp", val: 0.25, desc: "饮血淬锋，命中吸血25% · 狂雷贯顶，迅若闪电" },
  { id: "chaos_110", name: "「血煞·离火」", icon: "🩸", type: "vamp", val: 0.25, desc: "饮血淬锋，命中吸血25% · 炽火焚天，烽烟万里" },
  { id: "chaos_111", name: "「破军·天罡」", icon: "🗡️", type: "crit", val: 1.5, desc: "锋芒毕露，破招破防暴伤提升50% · 天罡北斗，刚劲无俦" },
  { id: "chaos_112", name: "「破军·地煞」", icon: "🗡️", type: "crit", val: 1.5, desc: "锋芒毕露，破招破防暴伤提升50% · 地煞幽冥，出奇制胜" },
  { id: "chaos_113", name: "「破军·青龙」", icon: "🗡️", type: "crit", val: 1.5, desc: "锋芒毕露，破招破防暴伤提升50% · 青龙出海，威动乾坤" },
  { id: "chaos_114", name: "「破军·白虎」", icon: "🗡️", type: "crit", val: 1.5, desc: "锋芒毕露，破招破防暴伤提升50% · 白虎啸风，势不可挡" },
  { id: "chaos_115", name: "「破军·朱雀」", icon: "🗡️", type: "crit", val: 1.5, desc: "锋芒毕露，破招破防暴伤提升50% · 朱雀振羽，生生不息" },
  { id: "chaos_116", name: "「破军·玄武」", icon: "🗡️", type: "crit", val: 1.5, desc: "锋芒毕露，破招破防暴伤提升50% · 玄武镇岳，坚固磐石" },
  { id: "chaos_117", name: "「破军·破晓」", icon: "🗡️", type: "crit", val: 1.5, desc: "锋芒毕露，破招破防暴伤提升50% · 破晓晨光，势如长虹" },
  { id: "chaos_118", name: "「破军·残月」", icon: "🗡️", type: "crit", val: 1.5, desc: "锋芒毕露，破招破防暴伤提升50% · 孤月映水，来去无痕" },
  { id: "chaos_119", name: "「破军·奔雷」", icon: "🗡️", type: "crit", val: 1.5, desc: "锋芒毕露，破招破防暴伤提升50% · 狂雷贯顶，迅若闪电" },
  { id: "chaos_120", name: "「破军·离火」", icon: "🗡️", type: "crit", val: 1.5, desc: "锋芒毕露，破招破防暴伤提升50% · 炽火焚天，烽烟万里" },
];

let chaosP1 = 0, chaosP2 = 1;
// 天机乱斗正在生效的异变记在 M.chaos：{ i: CHAOS_MUTATIONS 里第几条（-1 还没抽）, t: 这条生效了几秒 }。
// 放在 M 里，联机回滚的存档、录像都带着它；联机时两边（和放录像时）用对局随机数抽，抽到的是同一条，两边都生效
const chaosOn = () => M.mode === 'chaos' || ((M.mode === 'tag3' || M.mode === '2v2' || M.mode === 'watch2v2' || M.mode === 'replay' || M.mode === 'net') && M.teamMutator === 'chaos') || (netRoom() || {}).rule === 'chaos';
// 现在生效的异变；给了 type 就只在是这一种时返回
function chaosNow(type) {
  const c = chaosOn() && M.chaos, mut = c && c.i >= 0 ? CHAOS_MUTATIONS[c.i] : null;
  return mut && (!type || mut.type === type) ? mut : null;
}
const chaosLeft = () => Math.max(0, Math.ceil(CHAOS_INTERVAL - ((M.chaos && M.chaos.t) || 0)));   // 这条还剩几秒

function rollChaosMutation() {
  const i = Math.floor((netSim() ? grnd() : Math.random()) * CHAOS_MUTATIONS.length) % CHAOS_MUTATIONS.length, mut = CHAOS_MUTATIONS[i];
  M.chaos = { i, t: 0 };
  if (RESIM) return mut;   // 回滚重算时只改状态，提示已经出过了
  flashA = Math.max(flashA, 0.3);
  flashRGB = '233,196,106';
  shake = Math.max(shake, 8);
  SFX.gong();
  say('天机异变 · ' + mut.name, 1.8, 'big', mut.desc);
  if (typeof addP === 'function' && typeof A !== 'undefined') {
    addP({ type: 'text', text: mut.icon + ' ' + cvT(mut.name), x: STAGE_W / 2, y: -160, life: 1.8, max: 1.8, rgb: '233,196,106' });
  }
  return mut;
}

function updateChaos(dt) {
  if (!chaosOn() || M.phase !== 'fight') return;
  if (!M.chaos) M.chaos = { i: -1, t: 0 };
  M.chaos.t += dt;
  if (M.chaos.i < 0 || M.chaos.t >= CHAOS_INTERVAL) rollChaosMutation();
}

function renderChaos() {}   // 电脑境界用共用的那一条（pickLevel）

function startChaos(p1, p2, lv, isWatch = false) {
  initAudio();
  paused = false;
  chaosP1 = p1 !== undefined ? p1 : chaosP1;
  chaosP2 = p2 !== undefined ? p2 : chaosP2;
  M.mode = 'chaos';
  M.level = lv || pickLevel;   // 这局用的境界；不改玩家选好的那一条
  M.round = 1;
  M.wins = [0, 0];
  M.stage = null;
  M.watchAi = !!isWatch;
  M.chaos = { i: -1, t: 0 };
  setChars(chaosP1, chaosP2);
  A.ctrl = isWatch ? new AICtrl(M.level || 'god') : human[0];
  B.ctrl = new AICtrl(M.level || 'god');
  A.meter = B.meter = 0;
  human[0].clear(); human[1].clear();
  showScreen(null);
  startRound();
  say(isWatch ? '天机乱斗 · 乾坤异变观战' : '天机乱斗 · 乾坤异变', 1.4);
  rollChaosMutation();
}

const towerStartBtn = document.getElementById('towerStartBtn');
if (towerStartBtn) towerStartBtn.addEventListener('click', () => {
  bpStart('tower', { isWatch: false });
});

const towerResumeBtn = document.getElementById('towerResumeBtn');
if (towerResumeBtn) towerResumeBtn.addEventListener('click', () => resumeTower());

const chaosStartBtn = document.getElementById('chaosStartBtn');
if (chaosStartBtn) chaosStartBtn.addEventListener('click', () => {
  bpStart('chaos', { level: pickLevel, isWatch: false });
});

const chaosWatchBtn = document.getElementById('chaosWatchBtn');
if (chaosWatchBtn) chaosWatchBtn.addEventListener('click', () => {
  bpStart('chaos', { level: pickLevel || 'god', isWatch: true });
});

let mayhemP1 = 0, mayhemP2 = 1;
function renderMayhem() {}   // 电脑境界用共用的那一条（pickLevel）

function startMayhem(p1, p2, lv, isWatch = false) {
  initAudio();
  paused = false;
  mayhemP1 = p1 !== undefined ? p1 : mayhemP1;
  mayhemP2 = p2 !== undefined ? p2 : mayhemP2;
  M.mode = 'mayhem';
  M.level = lv || pickLevel;
  M.round = 1;
  M.wins = [0, 0];
  M.stage = null;
  M.watchAi = !!isWatch;
  setChars(mayhemP1, mayhemP2);
  A.ctrl = isWatch ? new AICtrl(M.level || 'god') : human[0];
  B.ctrl = new AICtrl(M.level || 'god');
  A.meter = B.meter = 100;
  human[0].clear(); human[1].clear();
  showScreen(null);
  startRound();
  say(isWatch ? '通天神决 · 神魔 AI 观战' : '通天神决 · 大显神通', 1.4);
}

const mayhemStartBtn = document.getElementById('mayhemStartBtn');
if (mayhemStartBtn) mayhemStartBtn.addEventListener('click', () => {
  bpStart('mayhem', { level: pickLevel, isWatch: false });
});

const mayhemWatchBtn = document.getElementById('mayhemWatchBtn');
if (mayhemWatchBtn) mayhemWatchBtn.addEventListener('click', () => {
  bpStart('mayhem', { level: pickLevel || 'god', isWatch: true });
});
