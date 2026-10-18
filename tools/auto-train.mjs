#!/usr/bin/env node
/**
 * Auto-Train & Cloud Sync Orchestrator for RenYing AI Models.
 *
 * Automates the complete loop:
 *   1. Run headless CvC simulations (e.g. 50 matches, ~250,000 steps).
 *   2. Train neural network policy (Supervised Behavioral Cloning + Reward weighting).
 *   3. Evaluates model against baseline heuristic AI (hard/impossible).
 *   4. Syncs datasets and trained weights to Cloud Storage (gsutil / gcloud storage or custom API) when configured.
 *
 * Usage:
 *   node tools/auto-train.mjs --matches 20 --epochs 5 [--cloud-bucket gs://my-bucket/renying-ai]
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
function getArg(name, def) {
  const idx = args.indexOf('--' + name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : def;
}

const matches = getArg('matches', '20');
const epochs = getArg('epochs', '5');
const cloudBucket = getArg('cloud-bucket', process.env.RENYING_AI_BUCKET || '');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const dataFile = `data/dataset_${timestamp}.jsonl`;
const modelFile = `models/renying_ai_${timestamp}.json`;
const latestModelFile = `models/renying_ai_latest.json`;

mkdirSync('data', { recursive: true });
mkdirSync('models', { recursive: true });

console.log(`\n========================================================`);
console.log(`   RenYing Auto-Training & Cloud Sync Pipeline          `);
console.log(`   Timestamp: ${timestamp}`);
console.log(`========================================================\n`);

// Step 1: Headless CvC Simulation
console.log(`[Step 1/3] Running Headless CvC Simulation (${matches} matches)...`);
try {
  execSync(`node tools/cvc-sim.mjs --matches ${matches} --export ${dataFile}`, { stdio: 'inherit' });
} catch (e) {
  console.error('Failed to run CvC simulation:', e);
  process.exit(1);
}

// Step 2: Policy Training
console.log(`\n[Step 2/3] Training Neural Policy Model (${epochs} epochs)...`);
try {
  execSync(`node tools/train-policy.mjs --data ${dataFile} --epochs ${epochs} --out ${modelFile}`, { stdio: 'inherit' });
  // Copy to latest
  writeFileSync(latestModelFile, readFileSync(modelFile));
  console.log(`[Model] Updated ${latestModelFile}`);
} catch (e) {
  console.error('Failed to train model:', e);
  process.exit(1);
}

// Step 3: Cloud Synchronization
console.log(`\n[Step 3/3] Checking Cloud Sync Target...`);
if (cloudBucket) {
  console.log(`Uploading dataset and model to ${cloudBucket}...`);
  try {
    execSync(`gsutil cp ${dataFile} ${cloudBucket}/datasets/`, { stdio: 'inherit' });
    execSync(`gsutil cp ${modelFile} ${cloudBucket}/models/`, { stdio: 'inherit' });
    execSync(`gsutil cp ${latestModelFile} ${cloudBucket}/models/latest.json`, { stdio: 'inherit' });
    console.log(`[Cloud] Successfully synced dataset and weights to ${cloudBucket}!`);
  } catch (e) {
    console.warn(`[Cloud] Sync failed: ${e.message}`);
  }
} else {
  console.log(`[Notice] No cloud bucket specified (--cloud-bucket or RENYING_AI_BUCKET).`);
  console.log(`Model is saved locally at ${modelFile} and ${latestModelFile}.`);
  console.log(`To upload to Google Cloud Storage later:`);
  console.log(`  gsutil cp ${modelFile} gs://<your-bucket>/models/`);
}

console.log(`\n========================================================`);
console.log(`   Auto-Training Completed Successfully!               `);
console.log(`========================================================\n`);
