#!/usr/bin/env node
// 将云端管理员接口里的匿名训练样本逐行导出；把输出重定向到模型目录之外的临时文件。
// RENYING_ADMIN_ENDPOINT=https://worker.example node tools/ai/export-user-matches.mjs > /tmp/renying-user-matches.jsonl
const endpoint = String(process.env.RENYING_ADMIN_ENDPOINT || '').replace(/\/$/, '');
const token = String(process.env.RENYING_ADMIN_TOKEN || '');
if (!/^https?:\/\//.test(endpoint) || !token) {
  console.error('Set RENYING_ADMIN_ENDPOINT and RENYING_ADMIN_TOKEN first.');
  process.exit(2);
}
let after = 0, batches = 0, samples = 0;
for (;;) {
  const url = `${endpoint}/api/admin/ai-training/export?after=${after}&limit=10`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Export failed (${response.status}): ${await response.text()}`);
  const page = await response.json();
  if (!page.ok || !Array.isArray(page.samples)) throw new Error('Export returned an invalid page.');
  for (const row of page.samples) process.stdout.write(JSON.stringify(row) + '\n');
  batches += page.count || 0;
  samples += page.samples.length;
  if (!page.count || !page.next || page.next <= after) break;
  after = page.next;
}
console.error(`Exported ${samples} samples from ${batches} matches.`);
