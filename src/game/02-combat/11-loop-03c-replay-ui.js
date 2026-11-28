// ======================= 回放库界面、置顶保护与筛选预览 =======================
// 本文件：#replays 回放列表渲染、收藏置顶（免受自动淘汰）、模式/侠客筛选搜索、RYRP2 回放码实时预览与导入导出。
const RP_UI = { mode: 'all', query: '' };

function rpModeBucket(m) {
  if (!m) return 'solo';
  if (m.mode === 'net' || m.kind === 'net') return 'net';
  if (m.mode === 'tag3' || m.tag3) return 'tag3';
  if (m.four || m.large || m.raid || ['2v2', 'melee', 'ctf', 'quad', 'raid'].includes(m.mode)) return 'team';
  return 'solo';
}

function rpFilterMatches(list, mode = RP_UI.mode, query = RP_UI.query) {
  const q = String(query || '').trim().toLowerCase();
  const out = [];
  for (let i = 0; i < (list || []).length; i++) {
    const m = list[i];
    if (!m) continue;
    if (mode === 'pinned' && !m.pinned) continue;
    if (mode !== 'all' && mode !== 'pinned' && rpModeBucket(m) !== mode) continue;
    if (q) {
      const hay = `${rpTitle(m)} ${rpSub(m)}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }
    out.push({ m, i });
  }
  return out;
}

function rpTogglePin(idx) {
  const list = rpList();
  const m = list[idx];
  if (!m) return false;
  if (!m.pinned) {
    const pinnedCount = list.filter(x => x && x.pinned).length;
    if (pinnedCount >= RP_PIN_MAX) {
      toast(`最多置顶 ${RP_PIN_MAX} 场回放，请先取消其他置顶`);
      return false;
    }
    m.pinned = true;
  } else {
    delete m.pinned;
  }
  rpTrimList(list);
  rpStore(list);
  renderReplays();
  toast(m.pinned ? '已置顶回放（不会因新对局被自动清理）' : '已取消置顶');
  return !!m.pinned;
}

function rpCodePreviewText(code) {
  const raw = String(code || '').trim();
  if (!raw) return '';
  try {
    const m = rpDecodeCode(raw);
    const dur = formatReviewTime(m.frames || 0);
    return `${cvT('回放预览')} · ${rpTitle(m)} · ${replayModeTag(m)} · ${dur}`;
  } catch (err) {
    return raw.startsWith(RP_CODE_PREFIX) ? cvT('回放码不完整或格式有误') : cvT('请粘贴 RYRP2: 开头的回放分享码');
  }
}

function renderReplays() {
  const list = rpList(), setN = trSet().length;
  const filtered = rpFilterMatches(list, RP_UI.mode, RP_UI.query);
  const trRow = setN ? `<div class="rprow"><div class="rpm"><div class="rpt">${cvT('训练集')}</div><div class="rps">${setN} ${cvT('个样本')}</div></div><div style="display:flex;gap:6px;"><button class="ghost" data-trdl="1">${cvT('导出')}</button><button class="ghost" data-trclear="1">${cvT('清空')}</button></div></div>` : '';
  const rowsHtml = filtered.length
    ? filtered.map(({ m, i }) => `<div class="rprow${m.pinned ? ' is-pinned' : ''}"><div class="rpm"><div class="rpt">${m.pinned ? `<span class="rp-pin-tag">${cvT('置顶')}</span>` : ''}${escapeHTML(rpTitle(m))}</div><div class="rps">${escapeHTML(rpSub(m))}</div></div><div style="display:flex;gap:6px;flex-wrap:wrap;"><button class="go" data-rp="${i}">${cvT('播放')}</button><button class="ghost rp-pin-btn${m.pinned ? ' is-pinned' : ''}" data-rppin="${i}">${cvT(m.pinned ? '已置顶' : '置顶')}</button><button class="ghost" data-rpcode="${i}">${cvT('回放码')}</button><button class="ghost" data-rptrain="${i}">${cvT('训AI')}</button><button class="ghost" data-rpexp="${i}">${cvT('导出')}</button><button class="ghost" data-rpdel="${i}">${cvT('删除')}</button></div></div>`).join('')
    : uiState('empty', list.length ? '当前筛选条件下没有匹配的回放。' : '还没有回放。完成一场支持录像的战斗后，回放会自动保存在这里。');
  if ($id('rpList')) $id('rpList').innerHTML = rowsHtml + trRow;
}

if ($id('rpFilterMode')) {
  $id('rpFilterMode').addEventListener('change', e => {
    RP_UI.mode = e.target.value || 'all';
    renderReplays();
  });
}
if ($id('rpFilterQuery')) {
  $id('rpFilterQuery').addEventListener('input', e => {
    RP_UI.query = e.target.value || '';
    renderReplays();
  });
}
if ($id('rpCodeIn')) {
  $id('rpCodeIn').addEventListener('input', e => {
    const pv = $id('rpCodePreview');
    if (!pv) return;
    const txt = rpCodePreviewText(e.target.value);
    pv.textContent = txt;
    pv.classList.toggle('hidden', !txt);
  });
}

if ($id('rpList')) {
  $id('rpList').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const list = rpList();
    if (b.dataset.trdl !== undefined) {
      const set = trSet();
      if (trDownload(set, `renying-train-set_${Date.now()}.jsonl`)) toast(`已导出训练集：${set.length} 个样本`);
      return;
    }
    if (b.dataset.trclear !== undefined) {
      try { localStorage.removeItem(TR_KEY); } catch (e) {}
      renderReplays(); toast('训练集已清空');
      return;
    }
    if (b.dataset.rp !== undefined) { const m = list[+b.dataset.rp]; if (m) startReplay(m); }
    else if (b.dataset.rppin !== undefined) { rpTogglePin(+b.dataset.rppin); }
    else if (b.dataset.rpcode !== undefined) {
      const m = list[+b.dataset.rpcode];
      if (!m) return;
      try {
        const code = rpEncodeCode(m);
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(() => toast('回放码已复制到剪贴板')).catch(() => toast('回放码已生成'));
        else toast('回放码已生成');
      } catch (err) { toast(err.message || '生成回放码失败'); }
    }
    else if (b.dataset.rpdel !== undefined) { list.splice(+b.dataset.rpdel, 1); rpStore(list); renderReplays(); }
    else if (b.dataset.rptrain !== undefined) {
      const m = list[+b.dataset.rptrain];
      if (!m) return;
      const samples = trSamples(m);
      if (!samples.length) {
        toast('这局没有采集到逐帧状态（旧版本录的或导入的回放），没法生成训练轨迹');
        return;
      }
      if (trDownload(samples, `user_fight_${m.t || Date.now()}.jsonl`)) {
        toast(`已导出这一局的真实轨迹：${samples.length} 个样本（s = 19 维状态，a = 按键位掩码，r = 本帧回血/掉血与终局胜负）`);
      }
    }
    else if (b.dataset.rpexp !== undefined) {
      const m = list[+b.dataset.rpexp];
      if (!m) return;
      const blob = new Blob([JSON.stringify(m, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `RenYing-Replay-${m.t || Date.now()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('录像已导出');
    }
  });
}

if ($id('rpTrainUploadBtn')) {
  $id('rpTrainUploadBtn').addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,.jsonl,application/json';
    inp.onchange = e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = evt => {
        try {
          const txt = evt.target.result;
          if (file.name.endsWith('.jsonl')) {
            const r = trImportText(txt);
            if (!r.added) throw new Error(r.bad.length ? `没有可用的样本（第 ${r.bad.slice(0, 3).join('、')} 行格式不对）` : '文件里没有样本');
            if (r.ok === false) throw new Error('本机空间不够，训练集没存下');
            renderReplays();
            toast(`已加入 ${r.added} 个样本${r.bad.length ? `（跳过 ${r.bad.length} 行格式不对的）` : ''} · 训练集共 ${r.total} 个`);
          } else {
            const m = JSON.parse(txt);
            if (!m || !Array.isArray(m.ch)) throw new Error('无效战局录像');
            const list = rpList();
            list.unshift(m);
            rpTrimList(list);
            rpStore(list);
            renderReplays();
            toast('战局已成功导入！点击「训AI」即可生成训练数据集');
          }
        } catch (err) {
          toast(err.message || '战局上传失败');
        }
      };
      reader.readAsText(file);
    };
    inp.click();
  });
}
if ($id('rpImportBtn')) {
  $id('rpImportBtn').addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.onchange = e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = evt => {
        try {
          const m = JSON.parse(evt.target.result);
          if (!m || !m.ev || !m.st0 || !Array.isArray(m.ch)) {
            throw new Error('录像文件格式不正确');
          }
          const list = rpList();
          list.unshift(m);
          rpTrimList(list);
          rpStore(list);
          renderReplays();
          toast('录像导入成功');
        } catch (err) {
          toast(err.message || '录像解析失败');
        }
      };
      reader.readAsText(file);
    };
    inp.click();
  });
}
if ($id('rpCodeImportBtn')) {
  $id('rpCodeImportBtn').addEventListener('click', () => {
    const box = $id('rpCodeBox'), inp = $id('rpCodeIn'), pv = $id('rpCodePreview');
    if (!box) return;
    box.classList.toggle('hidden');
    if (pv) { pv.textContent = ''; pv.classList.add('hidden'); }
    if (!box.classList.contains('hidden') && inp) { inp.value = ''; inp.focus(); }
  });
}
if ($id('rpCodeCancelBtn')) {
  $id('rpCodeCancelBtn').addEventListener('click', () => {
    if ($id('rpCodeBox')) $id('rpCodeBox').classList.add('hidden');
    if ($id('rpCodePreview')) { $id('rpCodePreview').textContent = ''; $id('rpCodePreview').classList.add('hidden'); }
  });
}
if ($id('rpCodeApplyBtn')) {
  $id('rpCodeApplyBtn').addEventListener('click', () => {
    const inp = $id('rpCodeIn');
    if (!inp) return;
    try {
      const m = rpDecodeCode(inp.value);
      const list = rpList();
      list.unshift(m);
      rpTrimList(list);
      rpStore(list);
      if ($id('rpCodeBox')) $id('rpCodeBox').classList.add('hidden');
      if ($id('rpCodePreview')) { $id('rpCodePreview').textContent = ''; $id('rpCodePreview').classList.add('hidden'); }
      renderReplays();
      toast('回放码导入成功');
    } catch (err) { toast(err.message || '回放码导入失败'); }
  });
}
