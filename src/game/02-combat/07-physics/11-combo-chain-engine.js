// ============================================================================
// RenYing Martial Arts Physics — Module 11: Combo Chain & Cancel Engine
// ----------------------------------------------------------------------------
// Deterministic, rollback-safe martial arts combo & frame-advantage solver:
//   - Combo chain directed graph & cancel-route legality matrix:
//       light -> directional -> kick -> heavy -> iaido -> grapple -> skill -> ult
//   - 9 directional attack modifiers (↑/↓/→ + Light/Heavy/Kick)
//   - Prorated damage, hitstun deterioration & juggle gravity scaling curves
//   - Counter-hit (破招) & Punish (确反) frame-advantage solver
//   - 2v2 / 8v8 Team-Synergy Assist Chain detector (合击连携)
// ============================================================================
(function (root) {
  'use strict';

  var RYPhysics = (typeof window !== 'undefined'
    ? (window.RYPhysics = window.RYPhysics || {})
    : (root.RYPhysics = root.RYPhysics || {}));

  // --------------------------------------------------------------------------
  // 1. Deterministic Math & Environment Helpers
  // --------------------------------------------------------------------------
  var FPS = 60;
  var FRAME_DT = 1 / FPS;

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function quantize(v) {
    return Math.round(v * 1000) * 0.001;
  }

  function signOr(v, fallback) {
    if (v > 1e-6) return 1;
    if (v < -1e-6) return -1;
    return fallback !== undefined ? fallback : 1;
  }

  function getFighterTeam(f) {
    if (!f) return -1;
    if (typeof fighterTeam === 'function') return fighterTeam(f);
    return (f.idx || 0) % 2;
  }

  function isFighterGrounded(f) {
    if (!f) return true;
    if (typeof f.onGround === 'function') return !!f.onGround();
    return (f.y || 0) >= -2 && (f.vy || 0) >= 0;
  }

  function getActiveFighters(listOverride) {
    if (Array.isArray(listOverride)) return listOverride;
    if (typeof allFighters === 'function') return allFighters();
    if (typeof FIGHTERS !== 'undefined' && Array.isArray(FIGHTERS)) {
      var out = [];
      for (var i = 0; i < FIGHTERS.length; i++) {
        if (FIGHTERS[i] && !FIGHTERS[i].hidden) out.push(FIGHTERS[i]);
      }
      return out;
    }
    return [];
  }

  function findFighterByIdx(idx, pool) {
    if (idx < 0) return null;
    if (typeof fighterByIdx === 'function') {
      var f = fighterByIdx(idx);
      if (f && f.idx === idx) return f;
    }
    var list = getActiveFighters(pool);
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].idx === idx) return list[i];
    }
    return null;
  }

  // --------------------------------------------------------------------------
  // 2. Combo Chain Graph & Cancel-Route Legality Matrix
  // --------------------------------------------------------------------------
  // Priority order: light (1) -> directional (2) -> kick (3) -> heavy (4)
  //                 -> iaido (5) -> grapple (6) -> skill (7) -> ult (8)
  var CATEGORIES = {
    light:       { id: 'light',       rank: 1, label: '轻击', minProration: 0.18, starterProration: 0.88, stepDecay: 0.91, baseRecovery: 0.20, meterCost: 0 },
    directional: { id: 'directional', rank: 2, label: '方向技', minProration: 0.20, starterProration: 0.92, stepDecay: 0.90, baseRecovery: 0.24, meterCost: 0 },
    kick:        { id: 'kick',        rank: 3, label: '腿法', minProration: 0.22, starterProration: 0.94, stepDecay: 0.89, baseRecovery: 0.26, meterCost: 0 },
    heavy:       { id: 'heavy',       rank: 4, label: '重击', minProration: 0.25, starterProration: 1.00, stepDecay: 0.87, baseRecovery: 0.34, meterCost: 0 },
    iaido:       { id: 'iaido',       rank: 5, label: '居合', minProration: 0.30, starterProration: 1.05, stepDecay: 0.86, baseRecovery: 0.38, meterCost: 0 },
    grapple:     { id: 'grapple',     rank: 6, label: '擒拿', minProration: 0.28, starterProration: 0.82, stepDecay: 0.85, baseRecovery: 0.30, meterCost: 0 },
    skill:       { id: 'skill',       rank: 7, label: '武技', minProration: 0.32, starterProration: 0.96, stepDecay: 0.88, baseRecovery: 0.40, meterCost: 0 },
    ult:         { id: 'ult',         rank: 8, label: '绝学', minProration: 0.44, starterProration: 1.00, stepDecay: 0.94, baseRecovery: 0.52, meterCost: 100 },
    jump_cancel: { id: 'jump_cancel', rank: 9, label: '跳取消', minProration: 1.00, starterProration: 1.00, stepDecay: 1.00, baseRecovery: 0.08, meterCost: 0 },
    dash_cancel: { id: 'dash_cancel', rank: 9, label: '闪取消', minProration: 1.00, starterProration: 1.00, stepDecay: 1.00, baseRecovery: 0.10, meterCost: 25 }
  };

  // Directed cancel-route legality matrix:
  // mode: 'hit_or_block' | 'hit_only' | 'counter_only' | 'always'
  // winStart / winEnd: normalized move progress [0..1] during which cancel is legal
  // maxSelfChain: max times same category can chain into itself in one string
  var CANCEL_MATRIX = {
    light: {
      light:       { mode: 'hit_or_block', winStart: 0.28, winEnd: 0.82, maxSelfChain: 2, label: '连轻' },
      directional: { mode: 'hit_or_block', winStart: 0.26, winEnd: 0.85, label: '变招' },
      kick:        { mode: 'hit_or_block', winStart: 0.28, winEnd: 0.85, label: '轻接腿' },
      heavy:       { mode: 'hit_or_block', winStart: 0.30, winEnd: 0.86, label: '轻接重' },
      iaido:       { mode: 'hit_only',     winStart: 0.32, winEnd: 0.85, label: '轻入居合' },
      grapple:     { mode: 'hit_or_block', winStart: 0.35, winEnd: 0.78, label: '轻转擒拿' },
      skill:       { mode: 'hit_or_block', winStart: 0.24, winEnd: 0.90, label: '武技取消' },
      ult:         { mode: 'hit_or_block', winStart: 0.24, winEnd: 0.92, label: '绝学取消' },
      jump_cancel: { mode: 'hit_only',     winStart: 0.30, winEnd: 0.80, label: '跳取消' }
    },
    directional: {
      kick:        { mode: 'hit_or_block', winStart: 0.30, winEnd: 0.86, label: '方向接腿' },
      heavy:       { mode: 'hit_or_block', winStart: 0.32, winEnd: 0.88, label: '方向接重' },
      iaido:       { mode: 'hit_only',     winStart: 0.34, winEnd: 0.86, label: '方向入居合' },
      grapple:     { mode: 'hit_only',     winStart: 0.38, winEnd: 0.80, label: '贴身擒拿' },
      skill:       { mode: 'hit_or_block', winStart: 0.26, winEnd: 0.90, label: '武技取消' },
      ult:         { mode: 'hit_or_block', winStart: 0.26, winEnd: 0.92, label: '绝学取消' },
      jump_cancel: { mode: 'hit_only',     winStart: 0.32, winEnd: 0.82, label: '升龙跳取消' }
    },
    kick: {
      heavy:       { mode: 'hit_or_block', winStart: 0.32, winEnd: 0.88, label: '腿接重斩' },
      iaido:       { mode: 'hit_or_block', winStart: 0.34, winEnd: 0.86, label: '腿入居合' },
      grapple:     { mode: 'hit_only',     winStart: 0.36, winEnd: 0.82, label: '腿转擒拿' },
      skill:       { mode: 'hit_or_block', winStart: 0.28, winEnd: 0.90, label: '武技取消' },
      ult:         { mode: 'hit_or_block', winStart: 0.28, winEnd: 0.92, label: '绝学取消' },
      jump_cancel: { mode: 'hit_only',     winStart: 0.34, winEnd: 0.84, label: '空连跳取消' },
      dash_cancel: { mode: 'hit_or_block', winStart: 0.35, winEnd: 0.85, label: '疾闪取消' }
    },
    heavy: {
      iaido:       { mode: 'hit_or_block', winStart: 0.36, winEnd: 0.88, label: '重入居合' },
      grapple:     { mode: 'counter_only', winStart: 0.40, winEnd: 0.84, label: '破招擒拿' },
      skill:       { mode: 'hit_or_block', winStart: 0.32, winEnd: 0.90, label: '武技取消' },
      ult:         { mode: 'hit_or_block', winStart: 0.30, winEnd: 0.92, label: '绝学取消' },
      jump_cancel: { mode: 'hit_only',     winStart: 0.38, winEnd: 0.84, requireLauncher: true, label: '浮空跳取消' },
      dash_cancel: { mode: 'hit_or_block', winStart: 0.38, winEnd: 0.88, label: '疾闪取消' }
    },
    iaido: {
      grapple:     { mode: 'hit_only',     winStart: 0.42, winEnd: 0.86, label: '居合转擒' },
      skill:       { mode: 'hit_only',     winStart: 0.36, winEnd: 0.90, label: '居合武技取消' },
      ult:         { mode: 'hit_or_block', winStart: 0.34, winEnd: 0.94, label: '居合绝学取消' },
      dash_cancel: { mode: 'hit_only',     winStart: 0.38, winEnd: 0.86, label: '居合疾闪' }
    },
    grapple: {
      light:       { mode: 'hit_only',     winStart: 0.72, winEnd: 0.98, requireLauncher: true, label: '抛后追击' },
      skill:       { mode: 'hit_only',     winStart: 0.70, winEnd: 0.98, requireLauncher: true, label: '抛接武技' },
      ult:         { mode: 'hit_only',     winStart: 0.70, winEnd: 0.98, label: '擒拿绝学' },
      jump_cancel: { mode: 'hit_only',     winStart: 0.68, winEnd: 0.96, requireLauncher: true, label: '腾空追击' }
    },
    skill: {
      ult:         { mode: 'hit_or_block', winStart: 0.40, winEnd: 0.94, label: '超杀取消' },
      dash_cancel: { mode: 'hit_only',     winStart: 0.45, winEnd: 0.90, label: '武技闪取消' }
    },
    ult: {
      // Ultimates are combo finishers (no cancel out)
    }
  };

  // --------------------------------------------------------------------------
  // 3. Directional Attack Modifiers (↑/↓/→ + Light / Heavy / Kick)
  // --------------------------------------------------------------------------
  var DIRECTIONAL_MODIFIERS = {
    up_light: {
      id: 'up_light',
      baseCategory: 'light',
      dirKey: 'up',
      name: '挑击',
      zone: 'anti_air',
      dmgMul: 1.05,
      startupMul: 0.95,
      recoveryMul: 1.02,
      guardDmgMul: 0.90,
      kb: [75, -245],
      lungeVx: 45,
      launch: false,
      antiAirInvul: true,
      jumpCancelable: true,
      hitstunBonusSec: 0.04,
      blockstunBonusSec: -0.02
    },
    down_light: {
      id: 'down_light',
      baseCategory: 'light',
      dirKey: 'down',
      name: '点刺',
      zone: 'low',
      dmgMul: 0.88,
      startupMul: 0.85,
      recoveryMul: 0.90,
      guardDmgMul: 0.85,
      kb: [65, 0],
      lungeVx: 30,
      launch: false,
      lowHit: true,
      jumpCancelable: false,
      hitstunBonusSec: 0.03,
      blockstunBonusSec: 0.02
    },
    forward_light: {
      id: 'forward_light',
      baseCategory: 'light',
      dirKey: 'forward',
      name: '突刺',
      zone: 'mid',
      dmgMul: 1.12,
      startupMul: 1.05,
      recoveryMul: 1.05,
      guardDmgMul: 1.05,
      kb: [135, -40],
      lungeVx: 195,
      launch: false,
      jumpCancelable: false,
      hitstunBonusSec: 0.02,
      blockstunBonusSec: 0.01
    },
    up_heavy: {
      id: 'up_heavy',
      baseCategory: 'heavy',
      dirKey: 'up',
      name: '冲天斩',
      zone: 'anti_air',
      dmgMul: 1.15,
      startupMul: 1.02,
      recoveryMul: 1.10,
      guardDmgMul: 1.15,
      kb: [110, -560],
      lungeVx: 70,
      launch: true,
      antiAirInvul: true,
      jumpCancelable: true,
      hitstunBonusSec: 0.14,
      blockstunBonusSec: -0.04
    },
    down_heavy: {
      id: 'down_heavy',
      baseCategory: 'heavy',
      dirKey: 'down',
      name: '下段重扫',
      zone: 'low',
      dmgMul: 1.08,
      startupMul: 1.04,
      recoveryMul: 1.18,
      guardDmgMul: 1.25,
      kb: [165, -180],
      lungeVx: 120,
      launch: false,
      lowHit: true,
      hardKnockdown: true,
      jumpCancelable: false,
      hitstunBonusSec: 0.10,
      blockstunBonusSec: -0.06
    },
    forward_heavy: {
      id: 'forward_heavy',
      baseCategory: 'heavy',
      dirKey: 'forward',
      name: '破军重劈',
      zone: 'overhead',
      dmgMul: 1.28,
      startupMul: 1.18,
      recoveryMul: 1.12,
      guardDmgMul: 1.55,
      kb: [290, -140],
      lungeVx: 230,
      launch: false,
      overheadHit: true,
      wallBounce: true,
      jumpCancelable: false,
      hitstunBonusSec: 0.09,
      blockstunBonusSec: 0.04
    },
    up_kick: {
      id: 'up_kick',
      baseCategory: 'kick',
      dirKey: 'up',
      name: '腾空蹬',
      zone: 'anti_air',
      dmgMul: 1.10,
      startupMul: 0.96,
      recoveryMul: 1.04,
      guardDmgMul: 1.05,
      kb: [95, -470],
      lungeVx: 85,
      launch: true,
      antiAirInvul: true,
      jumpCancelable: true,
      hitstunBonusSec: 0.11,
      blockstunBonusSec: -0.03
    },
    down_kick: {
      id: 'down_kick',
      baseCategory: 'kick',
      dirKey: 'down',
      name: '剪腿',
      zone: 'low',
      dmgMul: 0.95,
      startupMul: 0.90,
      recoveryMul: 0.96,
      guardDmgMul: 0.95,
      kb: [90, -90],
      lungeVx: 95,
      launch: false,
      lowHit: true,
      jumpCancelable: false,
      hitstunBonusSec: 0.05,
      blockstunBonusSec: 0.00
    },
    forward_kick: {
      id: 'forward_kick',
      baseCategory: 'kick',
      dirKey: 'forward',
      name: '正蹬飞踢',
      zone: 'mid',
      dmgMul: 1.18,
      startupMul: 1.06,
      recoveryMul: 1.08,
      guardDmgMul: 1.38,
      kb: [380, -120],
      lungeVx: 250,
      launch: false,
      wallBounce: true,
      armorBreak: true,
      jumpCancelable: false,
      hitstunBonusSec: 0.06,
      blockstunBonusSec: 0.02
    }
  };

  // --------------------------------------------------------------------------
  // 4. Scaling, Counter-Hit & Team-Synergy Configuration
  // --------------------------------------------------------------------------
  var CONFIG = {
    comboTimeoutSec: 1.45,          // Max idle gap before active combo string resets
    inputBufferSec: 0.11,           // ~6.6 frames deterministic cancel buffer
    staleMoveFactor: 0.86,          // Penalty for repeating exact same move ID
    maxProrationHits: 18,

    // Hitstun deterioration curve
    hitstunDecayPerHit: 0.045,
    hitstunDecayPerSec: 0.065,
    minHitstunScale: 0.34,

    // Juggle gravity scaling curve
    juggleGravLinear: 0.14,
    juggleGravQuad: 0.026,
    maxJuggleGravScale: 2.65,
    juggleLaunchDecay: 0.075,
    minJuggleLaunchScale: 0.48,

    // Counter-Hit (破招) & Punish (确反) modifiers
    counterDmgMul: 1.18,
    counterHitstunBonusSec: 0.12,
    counterHitstopBonusSec: 0.045,
    counterProrationRelief: 0.10,
    counterMeterBonus: 6,

    punishDmgMul: 1.12,
    punishHitstunBonusSec: 0.08,
    punishHitstopBonusSec: 0.025,
    punishMeterBonus: 5,

    // 2v2 / 8v8 Team-Synergy Assist Chain (合击连携)
    synergyWindowSec: 1.35,         // Max time since ally hit victim to trigger assist chain
    synergyProrationBoost: 0.12,    // Damage floor lift per unique ally in chain
    synergyMaxProrationBoost: 0.32,
    synergyGravRelief: 0.18,        // Reduces juggle gravity on ally handoff hit
    synergyMeterInitiator: 7,
    synergyMeterFollower: 9,
    synergyDmgBonusPerTier: 0.08    // +8% per extra unique ally (2-man +8%, 3-man +16%, 4+ +24%)
  };

  // --------------------------------------------------------------------------
  // 5. Serializable Per-Fighter Combo State
  // --------------------------------------------------------------------------
  function createDefaultState() {
    return {
      // Attacker-side chain tracking
      currentCategory: '',
      currentMoveId: '',
      currentMoveProgress: 0,
      currentMoveRecoverySec: 0,
      currentMoveIsLauncher: false,
      lastHitOutcome: 'none',       // none | hit | block | counter | punish
      selfChainCount: 0,
      comboCount: 0,
      comboTimer: 0,
      comboTotalDamage: 0,
      maxComboRecorded: 0,
      starterProration: 1.0,
      prorationScale: 1.0,
      usedMoves: {},                // { moveId: count }
      cancelCount: 0,

      // Input cancel buffer
      bufferedCategory: '',
      bufferedMoveId: '',
      bufferedDirX: 0,
      bufferedDirY: 0,
      bufferTimer: 0,

      // Frame advantage telemetry
      lastFrameAdv: 0,
      lastAdvOnBlock: false,
      lastHitQuality: 'normal',     // normal | counter | punish | synergy
      counterHitsTotal: 0,
      punishHitsTotal: 0,

      // Victim-side tracking (for hitstun/juggle scaling & 2v2/8v8 team synergy)
      takenComboHits: 0,
      takenComboTime: 0,
      takenJuggleCount: 0,
      lastAttackerIdx: -1,
      lastAttackerTeam: -1,
      lastHitAge: 99,
      synergyAttackersMask: 0,      // Bitmask of ally indices who hit this victim in current combo
      synergyChainCount: 0,
      synergyTier: 0,               // Number of unique allies in current assist chain
      synergyTriggeredTotal: 0
    };
  }

  function ensureState(f) {
    if (!f) return null;
    if (!f._ryPhys) f._ryPhys = {};
    if (!f._ryPhys.combo) f._ryPhys.combo = createDefaultState();
    return f._ryPhys.combo;
  }

  function resetState(f) {
    if (!f) return null;
    if (!f._ryPhys) f._ryPhys = {};
    f._ryPhys.combo = createDefaultState();
    return f._ryPhys.combo;
  }

  function cloneUsedMoves(map) {
    var out = {};
    if (!map) return out;
    for (var k in map) {
      if (Object.prototype.hasOwnProperty.call(map, k)) out[k] = map[k];
    }
    return out;
  }

  function snapshotState(f) {
    var s = ensureState(f);
    if (!s) return null;
    return {
      currentCategory: s.currentCategory,
      currentMoveId: s.currentMoveId,
      currentMoveProgress: s.currentMoveProgress,
      currentMoveRecoverySec: s.currentMoveRecoverySec,
      currentMoveIsLauncher: s.currentMoveIsLauncher,
      lastHitOutcome: s.lastHitOutcome,
      selfChainCount: s.selfChainCount,
      comboCount: s.comboCount,
      comboTimer: s.comboTimer,
      comboTotalDamage: s.comboTotalDamage,
      maxComboRecorded: s.maxComboRecorded,
      starterProration: s.starterProration,
      prorationScale: s.prorationScale,
      usedMoves: cloneUsedMoves(s.usedMoves),
      cancelCount: s.cancelCount,
      bufferedCategory: s.bufferedCategory,
      bufferedMoveId: s.bufferedMoveId,
      bufferedDirX: s.bufferedDirX,
      bufferedDirY: s.bufferedDirY,
      bufferTimer: s.bufferTimer,
      lastFrameAdv: s.lastFrameAdv,
      lastAdvOnBlock: s.lastAdvOnBlock,
      lastHitQuality: s.lastHitQuality,
      counterHitsTotal: s.counterHitsTotal,
      punishHitsTotal: s.punishHitsTotal,
      takenComboHits: s.takenComboHits,
      takenComboTime: s.takenComboTime,
      takenJuggleCount: s.takenJuggleCount,
      lastAttackerIdx: s.lastAttackerIdx,
      lastAttackerTeam: s.lastAttackerTeam,
      lastHitAge: s.lastHitAge,
      synergyAttackersMask: s.synergyAttackersMask,
      synergyChainCount: s.synergyChainCount,
      synergyTier: s.synergyTier,
      synergyTriggeredTotal: s.synergyTriggeredTotal
    };
  }

  function restoreState(f, snap) {
    if (!f || !snap) return;
    var s = ensureState(f);
    for (var k in snap) {
      if (Object.prototype.hasOwnProperty.call(snap, k)) {
        s[k] = k === 'usedMoves' ? cloneUsedMoves(snap[k]) : snap[k];
      }
    }
  }

  function resetAttackerCombo(s) {
    s.comboCount = 0;
    s.comboTimer = 0;
    s.comboTotalDamage = 0;
    s.starterProration = 1.0;
    s.prorationScale = 1.0;
    s.usedMoves = {};
    s.cancelCount = 0;
    s.selfChainCount = 0;
  }

  function resetVictimCombo(s) {
    s.takenComboHits = 0;
    s.takenComboTime = 0;
    s.takenJuggleCount = 0;
    s.lastAttackerIdx = -1;
    s.lastAttackerTeam = -1;
    s.lastHitAge = 99;
    s.synergyAttackersMask = 0;
    s.synergyChainCount = 0;
    s.synergyTier = 0;
  }

  // --------------------------------------------------------------------------
  // 6. Directional Modifier Resolution
  // --------------------------------------------------------------------------
  function resolveDirectionalModifier(f, baseCategory, inputDir) {
    var cat = baseCategory || 'light';
    if (cat !== 'light' && cat !== 'heavy' && cat !== 'kick') {
      return null;
    }

    var dx = 0;
    var dy = 0;
    if (inputDir && (typeof inputDir.x === 'number' || typeof inputDir.y === 'number')) {
      dx = inputDir.x || 0;
      dy = inputDir.y || 0;
    } else if (f && f.ctrl && f.ctrl.held) {
      dx = (f.ctrl.held.right ? 1 : 0) - (f.ctrl.held.left ? 1 : 0);
      dy = (f.ctrl.held.down ? 1 : 0) - (f.ctrl.held.up ? 1 : 0);
    }

    var face = signOr(f ? f.face : 1, 1);
    var relX = dx * face;

    var dirKey = '';
    if (dy < 0) dirKey = 'up';
    else if (dy > 0) dirKey = 'down';
    else if (relX > 0) dirKey = 'forward';
    else return null;

    var key = dirKey + '_' + cat;
    var mod = DIRECTIONAL_MODIFIERS[key];
    return mod || null;
  }

  function applyDirectionalModifierToMove(baseMove, mod, facing) {
    if (!baseMove || !mod) return baseMove;
    var face = signOr(facing, 1);
    var out = {};
    for (var k in baseMove) {
      if (Object.prototype.hasOwnProperty.call(baseMove, k)) out[k] = baseMove[k];
    }
    out.directionalId = mod.id;
    out.directionalName = mod.name;
    out.zone = mod.zone;
    out.dmg = Math.max(1, Math.round((baseMove.dmg || 16) * mod.dmgMul));
    out.guardBreakMul = (baseMove.guardBreakMul || 1.0) * mod.guardDmgMul;
    out.kb = [
      Math.round(mod.kb[0] * face),
      Math.round(mod.kb[1])
    ];
    out.lungeVx = Math.round(mod.lungeVx * face);
    out.launch = !!(baseMove.launch || mod.launch);
    out.lowHit = !!mod.lowHit;
    out.overheadHit = !!mod.overheadHit;
    out.antiAirInvul = !!mod.antiAirInvul;
    out.hardKnockdown = !!mod.hardKnockdown;
    out.wallBounce = !!mod.wallBounce;
    out.armorBreak = !!mod.armorBreak;
    out.jumpCancelable = !!mod.jumpCancelable;
    out.hitstunBonusSec = mod.hitstunBonusSec || 0;
    out.blockstunBonusSec = mod.blockstunBonusSec || 0;
    if (typeof baseMove.startup === 'number') out.startup = quantize(baseMove.startup * mod.startupMul);
    if (typeof baseMove.recovery === 'number') out.recovery = quantize(baseMove.recovery * mod.recoveryMul);
    return out;
  }

  // --------------------------------------------------------------------------
  // 7. Cancel-Route Legality & Input Buffer Engine
  // --------------------------------------------------------------------------
  function notifyMoveStart(att, category, moveId, opts) {
    opts = opts || {};
    var s = ensureState(att);
    if (!s) return;
    var catInfo = CATEGORIES[category] || CATEGORIES.light;
    if (s.currentCategory === category && s.comboCount > 0) {
      s.selfChainCount++;
    } else {
      s.selfChainCount = 0;
    }
    s.currentCategory = catInfo.id;
    s.currentMoveId = moveId || catInfo.id;
    s.currentMoveProgress = 0;
    s.currentMoveRecoverySec = opts.recoverySec !== undefined ? opts.recoverySec : catInfo.baseRecovery;
    s.currentMoveIsLauncher = !!opts.isLauncher;
    s.lastHitOutcome = 'none';
  }

  function updateMoveProgress(att, progress, remainingRecoverySec) {
    var s = ensureState(att);
    if (!s) return;
    s.currentMoveProgress = clamp(progress || 0, 0, 1);
    if (typeof remainingRecoverySec === 'number') {
      s.currentMoveRecoverySec = Math.max(0, remainingRecoverySec);
    }
  }

  function canCancelInto(att, targetCategory, opts) {
    opts = opts || {};
    var s = ensureState(att);
    if (!s) return { legal: false, reason: 'no_fighter' };

    var fromCat = s.currentCategory;
    var toCat = targetCategory;

    // Idle / neutral can always start any legal move (subject to meter)
    if (!fromCat || att.state === 'idle' || att.state === 'walk' || att.state === 'air') {
      var catDefNeutral = CATEGORIES[toCat];
      if (!catDefNeutral) return { legal: false, reason: 'unknown_category' };
      if ((att.meter || 0) < catDefNeutral.meterCost) {
        return { legal: false, reason: 'insufficient_meter' };
      }
      return { legal: true, isCancel: false, label: catDefNeutral.label };
    }

    var row = CANCEL_MATRIX[fromCat];
    if (!row || !row[toCat]) {
      return { legal: false, reason: 'route_forbidden', from: fromCat, to: toCat };
    }
    var edge = row[toCat];

    // Meter check (e.g., Ult requires 100 meter, Dash Cancel requires 25 meter)
    var toDef = CATEGORIES[toCat];
    if (toDef && (att.meter || 0) < toDef.meterCost) {
      return { legal: false, reason: 'insufficient_meter', required: toDef.meterCost };
    }

    // Self-chain cap (e.g., light -> light max 2 times)
    if (fromCat === toCat && edge.maxSelfChain !== undefined && s.selfChainCount >= edge.maxSelfChain) {
      return { legal: false, reason: 'self_chain_limit' };
    }

    // Launcher requirement (e.g., heavy -> jump_cancel or grapple -> skill)
    if (edge.requireLauncher && !s.currentMoveIsLauncher) {
      return { legal: false, reason: 'requires_launcher' };
    }

    // Hit / block / counter-hit requirement
    var outcome = opts.outcomeOverride || s.lastHitOutcome;
    if (edge.mode === 'hit_only') {
      if (outcome !== 'hit' && outcome !== 'counter' && outcome !== 'punish') {
        return { legal: false, reason: 'requires_hit' };
      }
    } else if (edge.mode === 'hit_or_block') {
      if (outcome === 'none') {
        return { legal: false, reason: 'requires_contact' };
      }
    } else if (edge.mode === 'counter_only') {
      if (outcome !== 'counter' && outcome !== 'punish') {
        return { legal: false, reason: 'requires_counter' };
      }
    }

    // Timing window check
    var prog = opts.progressOverride !== undefined ? opts.progressOverride : s.currentMoveProgress;
    if (prog < edge.winStart || prog > edge.winEnd) {
      return { legal: false, reason: 'outside_cancel_window', progress: prog, winStart: edge.winStart, winEnd: edge.winEnd };
    }

    return {
      legal: true,
      isCancel: true,
      from: fromCat,
      to: toCat,
      label: edge.label,
      meterCost: toDef ? toDef.meterCost : 0
    };
  }

  function bufferCancel(att, targetCategory, moveId, inputDir) {
    var s = ensureState(att);
    if (!s) return false;
    s.bufferedCategory = targetCategory || '';
    s.bufferedMoveId = moveId || targetCategory || '';
    s.bufferedDirX = inputDir ? (inputDir.x || 0) : 0;
    s.bufferedDirY = inputDir ? (inputDir.y || 0) : 0;
    s.bufferTimer = CONFIG.inputBufferSec;
    return true;
  }

  function tryConsumeBufferedCancel(att) {
    var s = ensureState(att);
    if (!s || s.bufferTimer <= 0 || !s.bufferedCategory) return null;
    var check = canCancelInto(att, s.bufferedCategory);
    if (!check.legal) return null;

    var result = {
      category: s.bufferedCategory,
      moveId: s.bufferedMoveId,
      dirX: s.bufferedDirX,
      dirY: s.bufferedDirY,
      cancelInfo: check
    };

    if (check.meterCost > 0) {
      att.meter = Math.max(0, (att.meter || 0) - check.meterCost);
    }
    if (check.isCancel) {
      s.cancelCount++;
    }
    s.bufferedCategory = '';
    s.bufferedMoveId = '';
    s.bufferTimer = 0;
    return result;
  }

  // --------------------------------------------------------------------------
  // 8. Proration, Hitstun Deterioration & Juggle Gravity Scaling Curves
  // --------------------------------------------------------------------------
  function getProrationScale(att, def, opts) {
    opts = opts || {};
    var as = ensureState(att);
    var ds = ensureState(def);
    var catDef = CATEGORIES[opts.category] || CATEGORIES.light;
    var hitIndex = ds ? ds.takenComboHits : (as ? as.comboCount : 0);

    // First hit uses starter proration (counter-hits ignore negative starter proration)
    var scale = 1.0;
    if (hitIndex <= 0) {
      scale = opts.isCounter ? Math.max(1.0, catDef.starterProration) : catDef.starterProration;
    } else {
      var starter = as ? as.starterProration : 1.0;
      var effectiveHits = Math.min(hitIndex, CONFIG.maxProrationHits);
      // Smooth exponential-piecewise decay
      var decay = Math.pow(catDef.stepDecay, effectiveHits);
      scale = starter * decay;
    }

    // Staling penalty for repeating exact same move ID in the same combo
    if (as && opts.moveId) {
      var repeats = as.usedMoves[opts.moveId] || 0;
      if (repeats > 0) {
        scale *= Math.pow(CONFIG.staleMoveFactor, Math.min(repeats, 5));
      }
    }

    // Counter-hit relief
    if (opts.isCounter) {
      scale += CONFIG.counterProrationRelief;
    }

    // Team-synergy floor boost (2v2 / 8v8合击连携 rewards ally handoffs!)
    var minFloor = catDef.minProration;
    if (ds && ds.synergyTier >= 2) {
      var boost = Math.min(
        CONFIG.synergyMaxProrationBoost,
        (ds.synergyTier - 1) * CONFIG.synergyProrationBoost
      );
      minFloor = Math.min(0.85, minFloor + boost);
      scale += boost * 0.5;
    }

    return quantize(clamp(scale, minFloor, 1.35));
  }

  function getProratedDamage(att, def, baseDamage, opts) {
    opts = opts || {};
    var scale = getProrationScale(att, def, opts);
    var qualityMul = 1.0;
    if (opts.isCounter) qualityMul *= CONFIG.counterDmgMul;
    else if (opts.isPunish) qualityMul *= CONFIG.punishDmgMul;

    var ds = ensureState(def);
    if (ds && ds.synergyTier >= 2) {
      qualityMul *= (1 + Math.min(3, ds.synergyTier - 1) * CONFIG.synergyDmgBonusPerTier);
    }

    return Math.max(1, Math.round(baseDamage * scale * qualityMul));
  }

  function getHitstunScale(def, isCounter) {
    var ds = ensureState(def);
    if (!ds || ds.takenComboHits <= 0) return isCounter ? 1.15 : 1.0;
    var decay = 1.0
      - (ds.takenComboHits * CONFIG.hitstunDecayPerHit)
      - (ds.takenComboTime * CONFIG.hitstunDecayPerSec);
    if (isCounter) decay += 0.12;
    return quantize(clamp(decay, CONFIG.minHitstunScale, 1.2));
  }

  function getJuggleGravityScale(def) {
    var ds = ensureState(def);
    if (!ds || ds.takenJuggleCount <= 0) return 1.0;
    var j = ds.takenJuggleCount;
    var gScale = 1.0 + CONFIG.juggleGravLinear * j + CONFIG.juggleGravQuad * j * j;
    // Slight gravity relief on active team-synergy handoff
    if (ds.synergyTier >= 2 && ds.lastHitAge < 0.25) {
      gScale *= (1 - CONFIG.synergyGravRelief);
    }
    return quantize(clamp(gScale, 1.0, CONFIG.maxJuggleGravScale));
  }

  function getJuggleLaunchScale(def) {
    var ds = ensureState(def);
    if (!ds || ds.takenJuggleCount <= 0) return 1.0;
    var scale = 1.0 - ds.takenJuggleCount * CONFIG.juggleLaunchDecay;
    return quantize(clamp(scale, CONFIG.minJuggleLaunchScale, 1.0));
  }

  // --------------------------------------------------------------------------
  // 9. Counter-Hit (破招), Punish (确反) & Frame-Advantage Solver
  // --------------------------------------------------------------------------
  function evaluateHitContext(att, def, opts) {
    opts = opts || {};
    var defState = (def && def.state) ? def.state : 'idle';
    var isBlocked = !!opts.blocked;
    var isCounter = false;
    var isPunish = false;
    var isCrossUp = false;

    if (!isBlocked && def) {
      // Counter-Hit: defender was in startup/active frames of an attack, skill, or grab
      var defMoveProg = (def._ryPhys && def._ryPhys.combo) ? def._ryPhys.combo.currentMoveProgress : 0.2;
      if (defState === 'attack' || defState === 'skill' || defState === 'grapple_start') {
        if (defMoveProg < 0.65) {
          isCounter = true;
        } else {
          isPunish = true;
        }
      } else if (defState === 'grapple_whiff' || defState === 'recovery') {
        isPunish = true;
      }

      // Cross-up / Back-attack check
      if (att && typeof att.x === 'number' && typeof def.x === 'number') {
        var attackSide = signOr(att.x - def.x, -signOr(att.face, 1));
        if (attackSide !== signOr(def.face, 1)) {
          isCrossUp = true;
        }
      }
    }

    return {
      blocked: isBlocked,
      isCounter: isCounter,
      isPunish: isPunish,
      isCrossUp: isCrossUp,
      quality: isCounter ? 'counter' : (isPunish ? 'punish' : 'normal'),
      label: isCounter ? '破招' : (isPunish ? '确反' : '')
    };
  }

  function solveFrameAdvantage(att, def, stunSec, recoverySec, isBlocked) {
    var netSec = (stunSec || 0) - (recoverySec || 0);
    var frames = Math.round(netSec * FPS);
    var as = ensureState(att);
    if (as) {
      as.lastFrameAdv = frames;
      as.lastAdvOnBlock = !!isBlocked;
    }
    return {
      frames: frames,
      netSec: quantize(netSec),
      isPlus: frames > 0,
      isSafe: frames >= -4,
      isPunishable: frames <= -6,
      onBlock: !!isBlocked
    };
  }

  // --------------------------------------------------------------------------
  // 10. 2v2 / 8v8 Team-Synergy Assist Chain Detector (合击连携)
  // --------------------------------------------------------------------------
  function countSetBits(mask) {
    var c = 0;
    var m = mask >>> 0;
    while (m !== 0) {
      m &= (m - 1);
      c++;
    }
    return c;
  }

  function evaluateTeamSynergy(att, def, fighters) {
    if (!att || !def) return { triggered: false, tier: 0, label: '' };
    var ds = ensureState(def);
    var attTeam = getFighterTeam(att);
    var defTeam = getFighterTeam(def);
    if (attTeam === defTeam) return { triggered: false, tier: 0, label: '' };

    var attBit = 1 << (att.idx & 31);
    var victimInCombo = ds.takenComboHits > 0
      && ds.lastHitAge <= CONFIG.synergyWindowSec
      && ds.lastAttackerTeam === attTeam;

    if (!victimInCombo) {
      // Fresh combo chain started by att
      ds.synergyAttackersMask = attBit;
      ds.synergyChainCount = 0;
      ds.synergyTier = 1;
      return { triggered: false, tier: 1, label: '' };
    }

    var isAllyHandoff = ds.lastAttackerIdx >= 0 && ds.lastAttackerIdx !== att.idx;
    ds.synergyAttackersMask |= attBit;
    var uniqueAllies = countSetBits(ds.synergyAttackersMask);
    ds.synergyTier = uniqueAllies;

    if (isAllyHandoff && uniqueAllies >= 2) {
      ds.synergyChainCount++;
      ds.synergyTriggeredTotal++;

      // Reward both previous ally and current follow-up ally with qi
      var prevAlly = findFighterByIdx(ds.lastAttackerIdx, fighters);
      if (prevAlly) {
        prevAlly.meter = clamp((prevAlly.meter || 0) + CONFIG.synergyMeterInitiator, 0, 100);
        var ps = ensureState(prevAlly);
        if (ps) ps.synergyTriggeredTotal++;
      }
      att.meter = clamp((att.meter || 0) + CONFIG.synergyMeterFollower, 0, 100);
      var as = ensureState(att);
      if (as) as.synergyTriggeredTotal++;

      var label = uniqueAllies === 2 ? '合击连携'
        : (uniqueAllies === 3 ? '三才合击' : '群侠合击');

      return {
        triggered: true,
        tier: uniqueAllies,
        chainCount: ds.synergyChainCount,
        prevAttackerIdx: ds.lastAttackerIdx,
        attackerIdx: att.idx,
        victimIdx: def.idx,
        label: label
      };
    }

    return { triggered: false, tier: uniqueAllies, label: '' };
  }

  // --------------------------------------------------------------------------
  // 11. Unified Hit Registration & Per-Frame Stepping
  // --------------------------------------------------------------------------
  function recordHit(att, def, hitInfo, fighters) {
    hitInfo = hitInfo || {};
    var as = ensureState(att);
    var ds = ensureState(def);
    if (!as || !ds) return null;

    var ctx = evaluateHitContext(att, def, { blocked: !!hitInfo.blocked });
    var cat = hitInfo.category || as.currentCategory || 'light';
    var moveId = hitInfo.moveId || as.currentMoveId || cat;
    var catDef = CATEGORIES[cat] || CATEGORIES.light;

    // Evaluate 2v2 / 8v8 team synergy on unblocked hits
    var synergy = !ctx.blocked ? evaluateTeamSynergy(att, def, fighters) : { triggered: false, tier: 0, label: '' };

    // Calculate proration & scaled damage
    var proration = getProrationScale(att, def, {
      category: cat,
      moveId: moveId,
      isCounter: ctx.isCounter
    });
    var baseDmg = hitInfo.damage !== undefined ? hitInfo.damage : 16;
    var finalDmg = ctx.blocked
      ? Math.max(0, Math.round(baseDmg * 0.12))
      : getProratedDamage(att, def, baseDmg, {
          category: cat,
          moveId: moveId,
          isCounter: ctx.isCounter,
          isPunish: ctx.isPunish
        });

    // Calculate scaled stun & frame advantage
    var baseStun = hitInfo.stunSec !== undefined ? hitInfo.stunSec : 0.28;
    var stunScale = ctx.blocked ? 1.0 : getHitstunScale(def, ctx.isCounter);
    var finalStun = baseStun * stunScale;
    if (ctx.isCounter) finalStun += CONFIG.counterHitstunBonusSec;
    else if (ctx.isPunish) finalStun += CONFIG.punishHitstunBonusSec;
    if (hitInfo.hitstunBonusSec && !ctx.blocked) finalStun += hitInfo.hitstunBonusSec;
    if (hitInfo.blockstunBonusSec && ctx.blocked) finalStun += hitInfo.blockstunBonusSec;
    finalStun = Math.max(0.08, quantize(finalStun));

    var recSec = hitInfo.recoverySec !== undefined ? hitInfo.recoverySec : as.currentMoveRecoverySec;
    var frameAdv = solveFrameAdvantage(att, def, finalStun, recSec, ctx.blocked);

    // Update attacker & victim combo states
    as.lastHitOutcome = ctx.blocked ? 'block' : (ctx.isCounter ? 'counter' : (ctx.isPunish ? 'punish' : 'hit'));
    as.lastHitQuality = synergy.triggered ? 'synergy' : ctx.quality;

    if (!ctx.blocked) {
      if (as.comboCount === 0) {
        as.starterProration = ctx.isCounter ? Math.max(1.0, catDef.starterProration) : catDef.starterProration;
      }
      as.comboCount++;
      as.comboTimer = CONFIG.comboTimeoutSec;
      as.comboTotalDamage += finalDmg;
      as.prorationScale = proration;
      as.usedMoves[moveId] = (as.usedMoves[moveId] || 0) + 1;
      if (as.comboCount > as.maxComboRecorded) as.maxComboRecorded = as.comboCount;

      if (ctx.isCounter) {
        as.counterHitsTotal++;
        att.meter = clamp((att.meter || 0) + CONFIG.counterMeterBonus, 0, 100);
      } else if (ctx.isPunish) {
        as.punishHitsTotal++;
        att.meter = clamp((att.meter || 0) + CONFIG.punishMeterBonus, 0, 100);
      }

      ds.takenComboHits++;
      ds.lastAttackerIdx = att.idx;
      ds.lastAttackerTeam = getFighterTeam(att);
      ds.lastHitAge = 0;

      var airborne = !isFighterGrounded(def) || !!hitInfo.launch;
      if (airborne) {
        ds.takenJuggleCount++;
      }
    }

    var gravScale = getJuggleGravityScale(def);
    var launchScale = getJuggleLaunchScale(def);
    var hitstopBonus = ctx.isCounter
      ? CONFIG.counterHitstopBonusSec
      : (ctx.isPunish ? CONFIG.punishHitstopBonusSec : 0);

    return {
      damage: finalDmg,
      proration: proration,
      stunSec: finalStun,
      hitstopBonusSec: hitstopBonus,
      gravityScale: gravScale,
      launchScale: launchScale,
      comboCount: as.comboCount,
      takenComboHits: ds.takenComboHits,
      context: ctx,
      frameAdvantage: frameAdv,
      synergy: synergy
    };
  }

  function stepFighter(f, dt) {
    if (!f || f.hidden) return;
    var s = ensureState(f);

    // Tick input cancel buffer
    if (s.bufferTimer > 0) {
      s.bufferTimer = Math.max(0, s.bufferTimer - dt);
      if (s.bufferTimer === 0) {
        s.bufferedCategory = '';
        s.bufferedMoveId = '';
      }
    }

    // Tick attacker combo timeout
    if (s.comboCount > 0) {
      s.comboTimer = Math.max(0, s.comboTimer - dt);
      if (s.comboTimer === 0) {
        resetAttackerCombo(s);
      }
    }

    // Clear current move tracking when back to neutral
    var st = f.state || 'idle';
    if (st === 'idle' || st === 'walk' || st === 'air' || st === 'hitstun' || st === 'knockdown') {
      s.currentCategory = '';
      s.currentMoveId = '';
      s.currentMoveProgress = 0;
      s.currentMoveIsLauncher = false;
      s.lastHitOutcome = 'none';
      s.selfChainCount = 0;
    }

    // Tick victim-side combo & juggle state
    if (s.takenComboHits > 0) {
      s.lastHitAge += dt;
      var inStunOrAir = st === 'hitstun' || st === 'thrown' || st === 'clinched' || !isFighterGrounded(f);
      if (inStunOrAir) {
        s.takenComboTime += dt;
      } else if (s.lastHitAge > 0.18 && (f.stun || 0) <= 0) {
        // Victim recovered to neutral on ground -> reset juggle & combo taken counters
        resetVictimCombo(s);
      }
    }
  }

  function stepAll(fighters, dt) {
    var pool = getActiveFighters(fighters);
    for (var i = 0; i < pool.length; i++) {
      stepFighter(pool[i], dt);
    }
  }

  function getTelemetry(f) {
    var s = ensureState(f);
    if (!s) return null;
    return {
      comboCount: s.comboCount,
      comboTotalDamage: s.comboTotalDamage,
      maxComboRecorded: s.maxComboRecorded,
      prorationScale: s.prorationScale,
      lastFrameAdv: s.lastFrameAdv,
      lastAdvOnBlock: s.lastAdvOnBlock,
      lastHitQuality: s.lastHitQuality,
      counterHitsTotal: s.counterHitsTotal,
      punishHitsTotal: s.punishHitsTotal,
      takenJuggleCount: s.takenJuggleCount,
      juggleGravityScale: getJuggleGravityScale(f),
      synergyTier: s.synergyTier,
      synergyTriggeredTotal: s.synergyTriggeredTotal
    };
  }

  // --------------------------------------------------------------------------
  // 12. Public Export on RYPhysics.ComboEngine
  // --------------------------------------------------------------------------
  RYPhysics.ComboEngine = {
    CONFIG: CONFIG,
    CATEGORIES: CATEGORIES,
    CANCEL_MATRIX: CANCEL_MATRIX,
    DIRECTIONAL_MODIFIERS: DIRECTIONAL_MODIFIERS,
    ensureState: ensureState,
    resetState: resetState,
    snapshotState: snapshotState,
    restoreState: restoreState,
    resolveDirectionalModifier: resolveDirectionalModifier,
    applyDirectionalModifierToMove: applyDirectionalModifierToMove,
    notifyMoveStart: notifyMoveStart,
    updateMoveProgress: updateMoveProgress,
    canCancelInto: canCancelInto,
    bufferCancel: bufferCancel,
    tryConsumeBufferedCancel: tryConsumeBufferedCancel,
    getProrationScale: getProrationScale,
    getProratedDamage: getProratedDamage,
    getHitstunScale: getHitstunScale,
    getJuggleGravityScale: getJuggleGravityScale,
    getJuggleLaunchScale: getJuggleLaunchScale,
    evaluateHitContext: evaluateHitContext,
    solveFrameAdvantage: solveFrameAdvantage,
    evaluateTeamSynergy: evaluateTeamSynergy,
    recordHit: recordHit,
    stepFighter: stepFighter,
    stepAll: stepAll,
    getTelemetry: getTelemetry
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
