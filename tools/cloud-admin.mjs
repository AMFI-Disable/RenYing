#!/usr/bin/env node
/**
 * 刃影 Google Cloud / Firebase Firestore 开发者云端管理与编辑工具
 *
 * 用法：
 *   node tools/cloud-admin.mjs status                   查看 Google Cloud 连通性与配置
 *   node tools/cloud-admin.mjs unlock-dev               将 Dev 账号直接在云端全量解锁（全英雄+全皮肤+99999墨锭）
 *   node tools/cloud-admin.mjs get <uid>                获取指定用户的 Cloud Firestore 档案
 *   node tools/cloud-admin.mjs set <uid> '<json>'       直接修改更新 Cloud Firestore 中的玩家档案
 *   node tools/cloud-admin.mjs config                   显示当前配置
 *
 * 环境变量支持：
 *   FIREBASE_CONFIG='{"apiKey":"...","projectId":"..."}'
 *   GCP_PROJECT / FIREBASE_PROJECT_ID
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const DEV_ALL_CHARS = ['qingfeng', 'yanling', 'leiming', 'tieshan', 'liuyun', 'lingshuang', 'moyu', 'feiying', 'yuehua'];
const DEV_ALL_SKINS = [
  'qf_gold', 'qf_frost', 'yl_phoenix', 'yl_raven', 'lm_sun', 'lm_violet',
  'ts_bronze', 'ts_obsidian', 'ly_sky', 'ly_dusk', 'ls_plum', 'ls_aurora',
  'my_cinnabar', 'my_ghost', 'fy_blood', 'fy_jade', 'yh_sakura', 'yh_nether'
];

function getFirebaseConfig() {
  if (process.env.FIREBASE_CONFIG) {
    try {
      return JSON.parse(process.env.FIREBASE_CONFIG);
    } catch (e) {
      console.warn('⚠️ FIREBASE_CONFIG 环境变量解析错误:', e.message);
    }
  }

  const localCfgPath = path.join(ROOT, '.firebase-config.json');
  if (fs.existsSync(localCfgPath)) {
    try {
      return JSON.parse(fs.readFileSync(localCfgPath, 'utf8'));
    } catch (e) {}
  }

  return {
    apiKey: process.env.FIREBASE_API_KEY || '',
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.GCP_PROJECT || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
  };
}

function makeDevProfile() {
  return {
    name: 'Dev',
    ink: 99999,
    owned: DEV_ALL_CHARS.slice(),
    frags: {
      qingfeng: 99, yanling: 99, leiming: 99, tieshan: 99,
      liuyun: 99, lingshuang: 99, moyu: 99, feiying: 99, yuehua: 99
    },
    pity: 0,
    spity: 0,
    skins: DEV_ALL_SKINS.slice(),
    equip: {},
    netWins: 99,
    netLosses: 0,
    online10Unlocked: true,
    stageStars: { s1: 3, s2: 3, s3: 3, s4: 3, s5: 3, s6: 3, s7: 3, s8: 3, s9: 3, s10: 3 },
    qfx: 99,
    updatedAt: Date.now()
  };
}

// 转换格式为 Firestore REST API 格式
function toFirestoreFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') {
      fields[k] = { stringValue: v };
    } else if (typeof v === 'number') {
      if (Number.isInteger(v)) fields[k] = { integerValue: String(v) };
      else fields[k] = { doubleValue: v };
    } else if (typeof v === 'boolean') {
      fields[k] = { booleanValue: v };
    } else if (Array.isArray(v)) {
      fields[k] = {
        arrayValue: {
          values: v.map(item => ({ stringValue: String(item) }))
        }
      };
    } else if (v && typeof v === 'object') {
      fields[k] = {
        mapValue: {
          fields: toFirestoreFields(v)
        }
      };
    }
  }
  return fields;
}

// 将 Firestore REST API 格式转换为纯 JS 对象
function fromFirestoreFields(fields) {
  if (!fields) return {};
  const res = {};
  for (const [k, v] of Object.entries(fields)) {
    if ('stringValue' in v) res[k] = v.stringValue;
    else if ('integerValue' in v) res[k] = parseInt(v.integerValue, 10);
    else if ('doubleValue' in v) res[k] = parseFloat(v.doubleValue);
    else if ('booleanValue' in v) res[k] = v.booleanValue;
    else if ('arrayValue' in v) {
      res[k] = (v.arrayValue.values || []).map(val => (val.stringValue ?? Object.values(val)[0]));
    } else if ('mapValue' in v) {
      res[k] = fromFirestoreFields(v.mapValue.fields);
    }
  }
  return res;
}

async function loginOrRegisterDev(cfg, email = 'ry_dev@renying.game', password = 'IAMADEVBRO') {
  if (!cfg.apiKey) throw new Error('缺少 Firebase apiKey');
  
  // 1. Try sign in
  const signInUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${cfg.apiKey}`;
  const signInRes = await fetch(signInUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });

  if (signInRes.ok) {
    const data = await signInRes.json();
    return { idToken: data.idToken, localId: data.localId };
  }

  // 2. If not found, try sign up
  const signUpUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${cfg.apiKey}`;
  const signUpRes = await fetch(signUpUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });

  if (signUpRes.ok) {
    const data = await signUpRes.json();
    return { idToken: data.idToken, localId: data.localId };
  }

  const errData = await signUpRes.json().catch(() => ({}));
  throw new Error(`Firebase Auth 失败: ${JSON.stringify(errData)}`);
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0] || 'status';
  const cfg = getFirebaseConfig();

  if (cmd === 'status') {
    console.log('--- Google Cloud / Firebase 配置状态 ---');
    console.log('Project ID :', cfg.projectId || '(未配置)');
    console.log('API Key    :', cfg.apiKey ? (cfg.apiKey.slice(0, 8) + '...') : '(未配置)');
    console.log('Auth Domain:', cfg.authDomain || '(未配置)');
    if (!cfg.projectId || !cfg.apiKey) {
      console.log('\n💡 提示：可通过 FIREBASE_CONFIG 环境变量或在游戏内“云存档设置”中配置。');
    } else {
      console.log('\n✅ 配置格式正常，可执行 unlock-dev / get / set 等操作。');
    }
    return;
  }

  if (cmd === 'config') {
    console.log(JSON.stringify(cfg, null, 2));
    return;
  }

  if (cmd === 'unlock-dev') {
    if (!cfg.projectId || !cfg.apiKey) {
      console.error('❌ 错误：需要有效的 projectId 和 apiKey 才能连接 Google Cloud。');
      process.exit(1);
    }
    console.log('🚀 正在连接 Google Cloud 登录 Dev 账号...');
    const auth = await loginOrRegisterDev(cfg);
    console.log(`✓ 登录成功，UID: ${auth.localId}`);

    const devProf = makeDevProfile();
    const docUrl = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/users/${auth.localId}?key=${cfg.apiKey}`;
    
    console.log('☁️ 正在将 9 位英雄 + 18 套皮肤 + 99999 墨锭写入 Cloud Firestore...');
    const firestoreRes = await fetch(docUrl, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${auth.idToken}`
      },
      body: JSON.stringify({ fields: toFirestoreFields(devProf) })
    });

    if (!firestoreRes.ok) {
      const err = await firestoreRes.text();
      console.error('❌ 写入 Firestore 失败:', err);
      process.exit(1);
    }

    console.log('🎉 成功！Google Cloud 端 Dev 账号已完成全量解锁！');
    return;
  }

  if (cmd === 'get') {
    const uid = args[1];
    if (!uid) {
      console.error('用法: node tools/cloud-admin.mjs get <uid>');
      process.exit(1);
    }
    const docUrl = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/users/${uid}?key=${cfg.apiKey}`;
    const res = await fetch(docUrl);
    if (!res.ok) {
      console.error('❌ 获取失败:', await res.text());
      process.exit(1);
    }
    const data = await res.json();
    console.log(JSON.stringify(fromFirestoreFields(data.fields), null, 2));
    return;
  }

  if (cmd === 'set') {
    const uid = args[1];
    const jsonStr = args[2];
    if (!uid || !jsonStr) {
      console.error("用法: node tools/cloud-admin.mjs set <uid> '<json>'");
      process.exit(1);
    }
    const parsed = JSON.parse(jsonStr);
    const auth = await loginOrRegisterDev(cfg);
    const docUrl = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/users/${uid}?key=${cfg.apiKey}`;
    const res = await fetch(docUrl, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${auth.idToken}`
      },
      body: JSON.stringify({ fields: toFirestoreFields(parsed) })
    });
    if (!res.ok) {
      console.error('❌ 设置失败:', await res.text());
      process.exit(1);
    }
    console.log('✓ 已成功更新 Google Cloud Firestore 文档');
    return;
  }

  console.log('未知命令:', cmd);
  console.log('可用命令: status, unlock-dev, get, set, config');
}

main().catch(err => {
  console.error('运行错误:', err.message);
  process.exit(1);
});
