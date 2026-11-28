function drawTrail(f) {
  const tr = f.trail; if (tr.length < 2) return;
  if (f.look.fx && M.mode !== 'mayhem') return skinTrail(f, tr);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const mul = M.mode === 'mayhem' ? 2.4 : 1.15;
  for (let i = 1; i < tr.length; i++) {
    const a = tr[i - 1], b = tr[i], al = Math.max(0, b.life);
    // 外层气韵柔光带
    if (a.h && b.h) {
      ctx.fillStyle = `rgba(${f.look.slash},${Math.min(0.42, 0.22 * al * mul)})`;
      ctx.beginPath(); ctx.moveTo(a.h[0], a.h[1]); ctx.lineTo(a.t[0], a.t[1]); ctx.lineTo(b.t[0], b.t[1]); ctx.lineTo(b.h[0], b.h[1]); ctx.closePath(); ctx.fill();
    }
    // 中层主锋芒缎带
    ctx.fillStyle = `rgba(${f.look.slash},${Math.min(1, 0.58 * al * mul)})`;
    ctx.beginPath(); ctx.moveTo(a.b[0], a.b[1]); ctx.lineTo(a.t[0], a.t[1]); ctx.lineTo(b.t[0], b.t[1]); ctx.lineTo(b.b[0], b.b[1]); ctx.closePath(); ctx.fill();
    // 内锋高亮刃尖线
    ctx.strokeStyle = M.mode === 'mayhem' ? `rgba(255,220,90,${0.96 * al})` : `rgba(255,255,255,${0.9 * al})`;
    ctx.lineWidth = (2.6 * al + 0.6) * (M.mode === 'mayhem' ? 2.5 : 1.15);
    ctx.beginPath(); ctx.moveTo(a.t[0], a.t[1]); ctx.lineTo(b.t[0], b.t[1]); ctx.stroke();
  }
  ctx.restore();
}
const line = (a, b) => { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); };
const circle = (p, r) => { ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.fill(); };
function drawParticles(glowOnly) {
  const cullOn = typeof RENDER_CULL !== 'undefined' && RENDER_CULL.active;
  for (const p of particles) {
    if (glowOnly && (p.ng || !(p.type === 'spark' || p.type === 'slash' || p.type === 'ring' || p.type === 'glyph' || p.type === 'lightning' || p.type === 'beam' || SKIN_GLOW_P[p.type]))) continue;   // ng：品质特效不进泛光；命中闪光本身就是一团柔光，再泛一遍就糊成一团白
    if (cullOn) {
      const pad = Math.max(120, (p.r || p.len || 40) * 1.5);
      if (p.x2 !== undefined) {
        const x0 = Math.min(p.x, p.x2), x1 = Math.max(p.x, p.x2);
        const y0 = Math.min(p.y, p.y2), y1 = Math.max(p.y, p.y2);
        if (x1 < RENDER_CULL.minX - pad || x0 > RENDER_CULL.maxX + pad || y1 < RENDER_CULL.minY - pad || y0 > RENDER_CULL.maxY + pad) {
          if (!glowOnly) RENDER_CULL.culledParticles++;
          continue;
        }
      } else if (!inRenderFrustum(p.x, p.y, pad, pad)) {
        if (!glowOnly) RENDER_CULL.culledParticles++;
        continue;
      }
    }
    const k = clamp(p.life / p.max, 0, 1);
    if (p.type === 'spark') {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(${p.rgb},${k})`; ctx.lineWidth = p.w; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke(); ctx.restore();
    } else if (p.type === 'ring') {
      ctx.strokeStyle = `rgba(${p.rgb},${k * 0.9})`; ctx.lineWidth = 3 * k + 0.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.15 - k * 0.8), 0, Math.PI * 2); ctx.stroke();
    } else if (p.type === 'flash') {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const R = p.r * 1.7, g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R);   // 亮的只有中间一小团，外圈很快淡下去：击倒慢放时闪光停得久，整块白圆盘会把人盖住
      g.addColorStop(0, `rgba(255,255,255,${k})`); g.addColorStop(0.22, `rgba(255,255,255,${k * 0.55})`); g.addColorStop(0.55, `rgba(255,255,255,${k * 0.14})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(p.x - R, p.y - R, R * 2, R * 2); ctx.restore();
    } else if (p.type === 'dmg') {
      const pop = 1 + Math.max(0, (p.life - p.max + 0.12) / 0.12) * 0.6;
      ctx.save(); ctx.translate(p.x, p.y); ctx.scale(p.s * pop, p.s * pop);
      ctx.globalAlpha = Math.min(1, k * 2.5); ctx.font = `800 21px ${BODY_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(10,8,20,0.85)'; ctx.strokeText(p.text, 0, 0);
      ctx.shadowColor = `rgba(${p.edge},0.9)`; ctx.shadowBlur = 10; ctx.fillStyle = `rgb(${p.rgb})`; ctx.fillText(p.text, 0, 0); ctx.restore();
    } else if (p.type === 'shape') {   // 皮肤碎片：雪花、花瓣、羽毛……（锦鲤朝着游的方向，蝴蝶基本立着、轻轻晃）
      ctx.save(); ctx.translate(p.x, p.y);
      ctx.rotate(p.sh === 'koi' ? Math.atan2(p.vy || 0, p.vx || 1) : p.sh === 'butterfly' ? Math.sin(p.life * 7 + p.r * 5) * 0.35 : (p.spin || 0) * (p.max - p.life));
      if (WX_RISE[p.sh] || p.sh === 'spark') ctx.globalCompositeOperation = 'lighter';
      drawShape(p.sh, p.r, p.rgb, Math.min(1, k * 1.5)); ctx.restore();
    } else if (p.type === 'glyph') {   // 皮肤命中图案
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(p.x, p.y); ctx.rotate((p.rot || 0) + (p.spin || 0) * (p.max - p.life));
      drawGlyph(p.g2, p.r * (0.55 + 0.6 * Math.sqrt(1 - k)), p.rgb, k * 0.95); ctx.restore();
    } else if (p.type === 'ink') {
      ctx.fillStyle = `rgba(${p.rgb},${k * 0.9})`; circle([p.x, p.y], p.r * (p.y >= 0 ? 1.3 : 1));
    } else if (p.type === 'text') {
      ctx.save(); ctx.font = `28px ${TITLE_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.globalAlpha = k; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      const txt = typeof p.text === 'string' && p.text.length > 1 ? cvT(p.text) : p.text;   // 单个字（闪、破、斩）是印章式的字眼，英文也照原样
      const yy = p.y - (1 - k) * 30; ctx.strokeText(txt, p.x, yy); ctx.fillStyle = `rgb(${p.rgb})`; ctx.fillText(txt, p.x, yy); ctx.restore();
    } else if (p.type === 'mag') {   // 磁仙的小磁石
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot || 0); ctx.globalAlpha = Math.min(1, k * 1.5);
      ctx.fillStyle = p.pol > 0 ? '#c8382e' : '#2e5ec8'; ctx.strokeStyle = 'rgba(10,10,18,0.8)'; ctx.lineWidth = 2;
      ctx.fillRect(-p.r, -p.r * 0.6, p.r * 2, p.r * 1.2); ctx.strokeRect(-p.r, -p.r * 0.6, p.r * 2, p.r * 1.2); ctx.restore();
      drawMagSym(p.x, p.y, p.r * 0.5, p.pol, Math.min(1, k * 1.5));
    } else if (p.type === 'callout') {
      const pop = 1 + Math.max(0, (p.life - p.max + 0.15) / 0.15) * 0.75;
      const sc = (p.scale || 2) * pop;
      ctx.save(); ctx.translate(p.x, p.y - (1 - k) * 22); ctx.scale(sc, sc);
      ctx.globalAlpha = Math.min(1, k * 1.8);
      ctx.font = `900 36px ${TITLE_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const txt = typeof p.text === 'string' && p.text.length > 1 ? cvT(p.text) : p.text;
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(8,6,12,0.92)'; ctx.strokeText(txt, 0, 0);
      ctx.shadowColor = `rgba(${p.rgb},0.95)`; ctx.shadowBlur = 18;
      ctx.fillStyle = `rgb(${p.rgb})`; ctx.fillText(txt, 0, 0);
      ctx.restore();
    } else if (p.type === 'smoke') {
      ctx.fillStyle = `rgba(215,210,232,${k * 0.32})`; circle([p.x, p.y], p.r * (1.8 - k * 0.8));
    } else if (p.type === 'dust') {
      ctx.fillStyle = `rgba(200,190,230,${k * 0.18})`; circle([p.x, p.y], p.r * (1.6 - k * 0.6));
    } else if (p.type === 'slash') {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(p.x, p.y); ctx.rotate(p.ang);
      const len = p.len * (1.2 - k * 0.2);
      ctx.fillStyle = `rgba(${p.rgb},${k * 0.8})`;
      ctx.beginPath(); ctx.moveTo(-len / 2, 0); ctx.quadraticCurveTo(0, -7 * k, len / 2, 0); ctx.quadraticCurveTo(0, 7 * k, -len / 2, 0); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${k})`; ctx.fillRect(-len / 2, -0.8, len, 1.6);
      ctx.restore();
    } else if (p.type === 'lightning') {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const segs = 6, dx = (p.x2 - p.x) / segs, dy = (p.y2 - p.y) / segs;
      ctx.strokeStyle = `rgba(${p.rgb || '255,240,150'},${k * 0.92})`; ctx.lineWidth = (p.w || 3) * (1.4 + 0.6 * k);
      ctx.beginPath(); ctx.moveTo(p.x, p.y);
      for (let s = 1; s < segs; s++) ctx.lineTo(p.x + dx * s + rand(-16, 16), p.y + dy * s + rand(-16, 16));
      ctx.lineTo(p.x2, p.y2); ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${k})`; ctx.lineWidth = Math.max(1.2, (p.w || 3) * 0.45); ctx.stroke();
      ctx.restore();
    } else if (p.type === 'beam') {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(${p.rgb || '180,235,255'},${k * 0.72})`; ctx.lineWidth = (p.w || 16) * k; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x2, p.y2); ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${k * 0.95})`; ctx.lineWidth = (p.w || 16) * 0.32 * k; ctx.stroke();
      ctx.restore();
    } else if (p.type === 'debris') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot || 0); ctx.globalAlpha = Math.min(1, k * 1.4);
      ctx.fillStyle = `rgb(${p.rgb || '135,115,98'})`; ctx.strokeStyle = 'rgba(28,22,20,0.8)'; ctx.lineWidth = 1.2;
      const r = p.r || 6;
      ctx.beginPath(); ctx.moveTo(-r, -r * 0.6); ctx.lineTo(r * 0.7, -r); ctx.lineTo(r, r * 0.5); ctx.lineTo(-r * 0.5, r * 0.8); ctx.closePath();
      ctx.fill(); ctx.stroke(); ctx.restore();
    } else drawSkinParticle(p, k);
  }
}
function drawComboTotals() {
  for (let i = 0; i < 2; i++) {
    const cu = comboUI[i], d = [A, B][1 - i], atk = [A, B][i];
    if (!d || d.hidden || cu.t <= 0 || cu.n < 2 || cu.dmg <= 0) continue;
    const a = clamp(cu.t / 0.5, 0, 1), pop = 1 + Math.max(0, cu.t - 1.25) * 2;
    ctx.save(); ctx.translate(d.x, d.y - 200 * (d.size || 1)); ctx.scale(pop, pop); ctx.globalAlpha = a;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `800 30px ${BODY_FONT}`; ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(10,8,20,0.85)';
    const t = String(Math.round(cu.dmg));
    ctx.strokeText(t, 0, 0); ctx.shadowColor = `rgba(${atk.look.slash},0.95)`; ctx.shadowBlur = 16; ctx.fillStyle = '#ffe9b0'; ctx.fillText(t, 0, 0);
    ctx.shadowBlur = 0; ctx.font = `13px ${TITLE_FONT}`; ctx.lineWidth = 3.5; const hits = cvT(`${cu.n} 连击`); ctx.strokeText(hits, 0, 24); ctx.fillStyle = `rgb(${atk.look.slash})`; ctx.fillText(hits, 0, 24);
    ctx.restore();
  }
}
function drawProjs(glowOnly) {
  const cullOn = typeof RENDER_CULL !== 'undefined' && RENDER_CULL.active;
  for (const p of projs) {
    if (glowOnly && (p.kind === 'dragon' || p.kind === 'trap' || p.kind === 'quake' || p.kind === 'pavilion' || p.kind === 'popcorn')) continue;
    if (cullOn) {
      const padX = Math.max(200, (p.w || 60) + (p.kind === 'dragon' ? 400 : 120));
      const padY = Math.max(260, (p.h || 60) + (p.kind === 'bolt' || p.kind === 'pavilion' ? 680 : 160));
      const keepTether = p.kind === 'ironball' && inRenderFrustum(fighterByIdx(p.owner).x, fighterByIdx(p.owner).y - 50, 220, 220);
      if (!keepTether && !inRenderFrustum(p.x, p.y, padX, padY)) {
        if (!glowOnly) RENDER_CULL.culledProjs++;
        continue;
      }
    }
    const L = fighterByIdx(p.owner).look;   // 多人团战里最多 16 名侠客的技能也会生成弹道
    ctx.save();
    if (p.kind === 'popcorn') {   // 爆米花：落下时一小撮，半秒后噼啪炸开
      if (p.delay > 0) {
        const j = p.delay < 0.15 ? Math.sin(p.age * 90) * 2 : 0;   // 快炸的时候抖一抖
        for (let k = 0; k < 4; k++) {
          const a = p.seed + k * 1.7, x = p.x + Math.cos(a) * 7 + j, y = p.y + Math.sin(a) * 5;
          ctx.fillStyle = k % 2 ? '#fff6dc' : '#ffe9a8'; ctx.beginPath(); ctx.arc(x, y, 5.5, 0, 7); ctx.fill();
          ctx.fillStyle = 'rgba(214,150,60,0.8)'; ctx.beginPath(); ctx.arc(x + 1.5, y + 1.5, 1.8, 0, 7); ctx.fill();
        }
      } else {
        const k = clamp(1 - p.life / 0.12, 0, 1);
        ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.x, p.y, 14 + k * 30, 0, 7); ctx.stroke();
      }
    } else if (p.kind === 'wind') {
      ctx.globalCompositeOperation = 'lighter'; ctx.translate(p.x, p.y);
      const scX = (Math.sign(p.vx) || 1) * ((p.w || 56) / 56), scY = (p.h || 52) / 52;
      ctx.scale(scX, scY);
      ctx.fillStyle = `rgba(${L.slash},0.55)`; ctx.beginPath(); ctx.moveTo(-26, -22); ctx.quadraticCurveTo(34, 0, -26, 22); ctx.quadraticCurveTo(10, 0, -26, -22); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-24, -20); ctx.quadraticCurveTo(30, 0, -24, 20); ctx.stroke();
    } else if (p.kind === 'quake') {
      const gy = p.groundY !== undefined ? p.groundY : 0;
      ctx.fillStyle = 'rgba(135,105,76,0.92)';
      for (let i = 0; i < 5; i++) { const x = p.x - Math.sign(p.vx) * i * 12, h = (26 - i * 4) * (0.8 + 0.2 * Math.sin(p.age * 40 + i)); ctx.beginPath(); ctx.moveTo(x - 9, gy); ctx.lineTo(x, gy - h); ctx.lineTo(x + 9, gy); ctx.fill(); }
      if (Math.random() < 0.45) dust(p.x, gy, 1);
    } else if (p.kind === 'tornado') {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 9; i++) {
        const y = p.y + p.h / 2 - i * (p.h / 9), w = 16 + i * 6, off = Math.sin(p.age * 14 + i) * 8;
        ctx.strokeStyle = `rgba(${L.slash},${0.25 + 0.05 * i})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(p.x + off, y, w, 6, 0, p.age * 10 + i, p.age * 10 + i + 4.5); ctx.stroke();
      }
    } else if (p.kind === 'bolt') {
      const gy = p.groundY !== undefined ? p.groundY : 0;
      const top = gy - (p.h || (p.small ? 360 : 720));
      if (p.delay > 0) {
        const k = 1 - p.delay / 0.46;
        ctx.strokeStyle = `rgba(255,235,120,${0.4 + 0.5 * Math.sin(clock * 30)})`; ctx.lineWidth = p.small ? 4 : 5;
        ctx.beginPath(); ctx.ellipse(p.x, gy, (p.w || 64) * 0.5 * (0.6 + 0.4 * k), 9, 0, 0, Math.PI * 2); ctx.stroke();
        if (!p.small) { ctx.fillStyle = 'rgba(255,235,120,0.22)'; ctx.fillRect(p.x - 1.5, top, 3, gy - top); }
      } else {
        ctx.globalCompositeOperation = 'lighter';
        const col = p.rgb || '255,245,170';
        ctx.strokeStyle = `rgba(${col},0.95)`; ctx.lineWidth = p.small ? 9 : 11;
        ctx.beginPath(); ctx.moveTo(p.x, top);
        const pts = [[p.x, top]];
        for (let y = top + 55; y < gy; y += 55) { const nx = p.x + rand(-26, 26); ctx.lineTo(nx, y); pts.push([nx, y]); }
        ctx.lineTo(p.x, gy); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,1)'; ctx.lineWidth = 3; ctx.stroke();
        ctx.strokeStyle = `rgba(${col},0.72)`; ctx.lineWidth = 2.4;
        for (let b = 1; b < pts.length; b += 2) {
          const [bx, by] = pts[b], side = b % 4 === 1 ? 1 : -1;
          ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + side * rand(28, 62), by + rand(25, 55)); ctx.lineTo(bx + side * rand(55, 105), by + rand(55, 95)); ctx.stroke();
        }
      }
    } else if (p.kind === 'arrow') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy || 0, p.vx || 1));
      const len = Math.max(24, (p.w || 34) * 0.85);
      ctx.strokeStyle = `rgba(${p.rgb || L.slash},0.55)`; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(-len * 1.1, 0); ctx.lineTo(len * 0.5, 0); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(-len * 0.85, 0); ctx.lineTo(len * 0.65, 0); ctx.stroke();
      ctx.fillStyle = `rgb(${p.rgb || L.slash})`;
      ctx.beginPath(); ctx.moveTo(len * 0.85, 0); ctx.lineTo(len * 0.25, -5.5); ctx.lineTo(len * 0.4, 0); ctx.lineTo(len * 0.25, 5.5); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = `rgba(${p.rgb || L.slash},0.9)`; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-len * 0.8, 0); ctx.lineTo(-len * 1.05, -5); ctx.moveTo(-len * 0.8, 0); ctx.lineTo(-len * 1.05, 5); ctx.stroke();
    } else if (p.kind === 'fire') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy || 0, p.vx || 1));
      const r = Math.max(12, (p.w || 34) * 0.45);
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, r * 1.35);
      g.addColorStop(0, 'rgba(255,255,220,0.98)'); g.addColorStop(0.45, 'rgba(255,135,45,0.85)'); g.addColorStop(1, 'rgba(220,40,15,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 1.35, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,180,60,0.65)'; ctx.beginPath(); ctx.moveTo(-r * 2.1, 0); ctx.quadraticCurveTo(-r * 0.4, -r * 0.8, r * 0.6, 0); ctx.quadraticCurveTo(-r * 0.4, r * 0.8, -r * 2.1, 0); ctx.fill();
    } else if (p.kind === 'dart') {
      ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy || 0, p.vx || 1));
      ctx.strokeStyle = `rgba(${p.rgb || L.slash},0.65)`; ctx.lineWidth = 3.2;
      ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(12, 0); ctx.stroke();
      ctx.fillStyle = '#e8fff5'; ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(-4, -3.5); ctx.lineTo(-4, 3.5); ctx.closePath(); ctx.fill();
    } else if (p.kind === 'ice') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy || 0, p.vx || 1));
      const len = Math.max(22, (p.w || 40) * 0.6);
      ctx.fillStyle = 'rgba(150,230,255,0.88)';
      ctx.beginPath(); ctx.moveTo(len, 0); ctx.lineTo(0, -7); ctx.lineTo(-len * 0.75, 0); ctx.lineTo(0, 7); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6; ctx.stroke();
    } else if (p.kind === 'star') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(p.x, p.y); ctx.rotate(p.age * 7);
      const r = Math.max(12, (p.w || 34) * 0.4);
      ctx.strokeStyle = `rgba(${p.rgb || '255,220,120'},0.85)`; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.15, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#fff8dc';
      ctx.beginPath(); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, rr = k % 2 ? r * 0.42 : r; k ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); ctx.fill();
    } else if (p.kind === 'wave') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(p.x, p.y); const dir = Math.sign(p.vx || 1);
      ctx.scale(dir, 1);
      const r = Math.max(28, (p.h || 70) * 0.55);
      ctx.strokeStyle = `rgba(${p.rgb || L.slash},0.85)`; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.arc(-r * 0.45, 0, r, -1.15, 1.15); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = 2.6; ctx.stroke();
    } else if (p.kind === 'rock') {
      ctx.translate(p.x, p.y); ctx.rotate((p.rot || 0) + p.age * 8);
      ctx.fillStyle = '#5a5060'; ctx.strokeStyle = '#2a2230'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-14, -6); ctx.lineTo(-4, -14); ctx.lineTo(12, -9); ctx.lineTo(15, 6); ctx.lineTo(2, 13); ctx.lineTo(-12, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(-6, -10, 8, 4);
    } else if (p.kind === 'dragon') {   // 墨龙：水墨身子蜿蜒，金眼、长须，墨雾拖尾
      const dir = Math.sign(p.vx) || 1, t = p.age;
      ctx.translate(p.x, p.y); ctx.scale(dir, 1);
      const pts = [];
      for (let i = 0; i <= 16; i++) pts.push([-i * 22, Math.sin(t * 9 - i * 0.55) * (8 + i * 1.4)]);
      for (let i = pts.length - 1; i > 0; i--) {               // 身子：从尾到头，越往前越粗越浓
        const k = 1 - i / pts.length, w = 6 + k * 34;
        ctx.strokeStyle = `rgba(12,12,20,${0.25 + 0.7 * k})`; ctx.lineWidth = w; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[i - 1][0], pts[i - 1][1]); ctx.stroke();
        if (i % 3 === 0) { ctx.strokeStyle = `rgba(200,190,170,${0.18 * k})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(pts[i][0], pts[i][1] - w * 0.2, w * 0.35, 3.6, 5.8); ctx.stroke(); }   // 鳞光
      }
      for (const [i, s2] of [[5, 1], [10, -1]]) {               // 爪子
        const [x0, y0] = pts[i]; ctx.strokeStyle = 'rgba(12,12,20,0.8)'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + 8, y0 + 24 * s2); ctx.lineTo(x0 + 16, y0 + 20 * s2); ctx.stroke();
      }
      ctx.fillStyle = '#0c0c14';                                // 龙头
      ctx.beginPath(); ctx.moveTo(-8, -26); ctx.quadraticCurveTo(40, -30, 66, -10); ctx.lineTo(50, 0); ctx.lineTo(70, 10); ctx.quadraticCurveTo(36, 30, -8, 22); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(232,220,190,0.85)'; ctx.lineWidth = 2;   // 角
      ctx.beginPath(); ctx.moveTo(14, -22); ctx.quadraticCurveTo(0, -48, -18, -52); ctx.moveTo(24, -24); ctx.quadraticCurveTo(16, -46, 2, -58); ctx.stroke();
      ctx.strokeStyle = 'rgba(232,220,190,0.6)'; ctx.lineWidth = 1.2;   // 须
      ctx.beginPath(); ctx.moveTo(58, 2); ctx.bezierCurveTo(40, 30 + Math.sin(t * 7) * 8, 10, 26, -20, 40 + Math.sin(t * 5) * 10); ctx.moveTo(56, -6); ctx.bezierCurveTo(40, -30, 10, -20 + Math.sin(t * 6) * 8, -26, -36); ctx.stroke();
      ctx.fillStyle = '#e9c46a'; ctx.beginPath(); ctx.arc(34, -10, 3.5, 0, 7); ctx.fill();   // 金眼
      ctx.fillStyle = 'rgba(233,196,106,0.25)'; ctx.beginPath(); ctx.arc(34, -10, 9, 0, 7); ctx.fill();
      if (Math.random() < 0.8) { const q = pts[4 + (Math.random() * 12 | 0)]; addP({ type: 'smoke', x: p.x + q[0] * dir, y: p.y + q[1], vx: -p.vx * 0.05, vy: rand(-30, 30), drag: 2, life: 0.6, max: 0.6, r: rand(8, 16) }); }
    } else if (p.kind === 'dragonOld') {
      const dir = Math.sign(p.vx) || 1;
      ctx.translate(p.x, p.y); ctx.scale(dir, 1);
      ctx.fillStyle = '#0b0b12';
      for (let i = 6; i >= 1; i--) { const x = -i * 26, y = Math.sin(p.age * 12 - i * 0.8) * 14; ctx.beginPath(); ctx.arc(x, y, 30 - i * 3, 0, 7); ctx.fill(); }
      ctx.beginPath(); ctx.moveTo(-10, -34); ctx.quadraticCurveTo(70, -20, 76, 6); ctx.quadraticCurveTo(40, 36, -10, 34); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e8e2d0'; ctx.beginPath(); ctx.moveTo(30, -26); ctx.lineTo(4, -54); ctx.lineTo(18, -24); ctx.fill();
      ctx.fillStyle = '#ff5a4a'; ctx.beginPath(); ctx.arc(40, -8, 4.5, 0, 7); ctx.fill();
    } else if (p.kind === 'qi') {
      ctx.globalCompositeOperation = 'lighter'; ctx.translate(p.x, p.y);
      const scX = (Math.sign(p.vx) || 1) * ((p.w || 60) / 60), scY = (p.h || 70) / 70;
      ctx.scale(scX, scY);
      const a = clamp(p.life / 0.2, 0, 1);
      ctx.strokeStyle = `rgba(${L.slash},${0.85 * a})`; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(-18, 0, 34, -1.1, 1.1); ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = 2; ctx.stroke();
    } else if (p.kind === 'note') {   // 音波：几道弧线 + 一个音符
      const dir = Math.sign(p.vx) || 1, r = p.w * 0.5, a = clamp(p.life / 0.25, 0, 1), big = p.notes >= 3;
      ctx.translate(p.x, p.y); ctx.scale(dir, 1); ctx.globalAlpha = a;
      for (let k = 0; k < 3; k++) {
        ctx.strokeStyle = 'rgba(' + L.slash + ',' + ((big ? 0.75 : 0.6) - k * 0.15) + ')'; ctx.lineWidth = (big ? 3.2 : 2.4) - k * 0.5;
        ctx.beginPath(); ctx.arc(-k * 10, 0, r * (0.55 + k * 0.2), -0.85, 0.85); ctx.stroke();
      }
      ctx.fillStyle = L.blade; ctx.strokeStyle = L.blade; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(-r * 0.35, 6, 5, 3.6, -0.4, 0, 7); ctx.fill();
      line([-r * 0.35 + 4, 5], [-r * 0.35 + 4, -12]); line([-r * 0.35 + 4, -12], [-r * 0.35 + 10, -6]);
    } else if (p.kind === 'chord') {   // 绝响：脚下一圈五线谱，然后一柱音浪
      const gy = p.groundY !== undefined ? p.groundY : 0;
      if (p.delay > 0) {
        ctx.strokeStyle = 'rgba(' + L.slash + ',0.5)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.ellipse(p.x, gy, p.w * 0.5, 8, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      } else {
        const a = clamp(p.life / 0.3, 0, 1);
        for (let k = 0; k < 5; k++) {
          const y = p.y - p.h * 0.4 + k * p.h * 0.2, wob = Math.sin(p.age * 30 + k) * 6;
          ctx.strokeStyle = 'rgba(' + L.slash + ',' + (0.55 * a) + ')'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(p.x - p.w * 0.5, y + wob); ctx.quadraticCurveTo(p.x, y - wob * 2, p.x + p.w * 0.5, y + wob); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(' + L.slash + ',' + (0.16 * a) + ')'; ctx.fillRect(p.x - p.w * 0.25, p.y - p.h * 0.5, p.w * 0.5, p.h);
      }
    } else if (p.kind === 'flame') {   // 酒火
      const dir = Math.sign(p.vx) || 1, a = clamp(p.life / 0.12, 0, 1);
      ctx.translate(p.x, p.y); ctx.scale(dir, 1);
      for (let k = 0; k < 6; k++) {
        const q = k / 5, x = -p.w * 0.45 + q * p.w * 0.9, r = 10 + q * p.h * 0.32 + Math.sin(p.age * 40 + k) * 3;
        ctx.fillStyle = 'rgba(255,' + (200 - k * 18) + ',' + (80 - k * 10) + ',' + ((0.55 - q * 0.25) * a) + ')';
        ctx.beginPath(); ctx.arc(x, Math.sin(p.age * 25 + k * 2) * 4, r, 0, 7); ctx.fill();
      }
    } else if (p.kind === 'hook') {   // 飞锤：链子和锤头由勾陈的链锤物理画，这里只画破风线
      const dir = Math.sign(p.vx) || 1;
      ctx.strokeStyle = 'rgba(' + L.slash + ',0.45)'; ctx.lineWidth = 2;
      for (let k = 0; k < 3; k++) line([p.x - dir * (26 + k * 10), p.y - 12 + k * 12], [p.x - dir * (60 + k * 16), p.y - 12 + k * 12]);
    } else if (p.kind === 'net') {   // 开天一锤：链锤甩上天变成巨锤砸下来，落地一圈震波
      const gy = p.groundY !== undefined ? p.groundY : 0;
      const drop = p.delay > 0 ? p.delay / 0.25 : 0, hw = 64, hh = 40;
      const cy = p.y + 45 - drop * 320, top = cy - hh;
      if (p.delay > 0) { ctx.strokeStyle = 'rgba(' + L.slash + ',0.45)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.ellipse(p.x, gy, hw + 20, 8, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
      ctx.globalAlpha = p.delay > 0 ? 1 : clamp(p.life / 0.3, 0, 1) * 0.55;
      ctx.fillStyle = '#3a2a1e'; ctx.fillRect(p.x - 7, top - 22, 14, 22);
      ctx.fillStyle = L.outline; ctx.fillRect(p.x - hw - 3, cy - hh - 3, hw * 2 + 6, hh * 2 + 6);
      ctx.fillStyle = '#7d8492'; ctx.fillRect(p.x - hw, cy - hh, hw * 2, hh * 2);
      ctx.fillStyle = L.blade; ctx.fillRect(p.x - hw, cy - hh, hw * 2, 7);
      ctx.fillStyle = 'rgba(30,34,42,0.5)'; ctx.fillRect(p.x - hw, cy + hh - 8, hw * 2, 8);
      ctx.fillStyle = L.scarf; ctx.fillRect(p.x - 10, cy - hh, 20, hh * 2);
      ctx.globalAlpha = 1;
      if (p.delay <= 0) {
        const k = clamp(1 - p.life / 0.3, 0, 1);
        ctx.strokeStyle = 'rgba(' + L.slash + ',' + (0.5 * (1 - k)) + ')'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(p.x, gy, hw + 40 + k * 120, 10 + k * 8, 0, 0, Math.PI * 2); ctx.stroke();
      }
    } else if (p.kind === 'kunai') {
      ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy, p.vx));
      ctx.fillStyle = '#d9dde6'; ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2a1a22'; ctx.fillRect(-12, -1.5, 8, 3); ctx.strokeStyle = `rgb(${L.slash})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(-14, 0, 3, 0, 7); ctx.stroke();
    } else if (p.kind === 'inkblob') {
      const r = (p.w || 34) * 0.44;
      ctx.fillStyle = '#0c0c12'; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(p.x - Math.sign(p.vx) * r * 0.9, p.y + 4, r * 0.5, 0, 7); ctx.fill();
    } else if (p.kind === 'moonring') {
      ctx.translate(p.x, p.y); ctx.rotate(p.age * 18);
      const r = (p.w || 44) * 0.45;
      ctx.fillStyle = `rgba(${L.slash},0.95)`; ctx.beginPath(); ctx.arc(0, 0, r, 0.3, Math.PI * 2 - 0.3); ctx.arc(r * 0.3, 0, r * 0.75, Math.PI * 2 - 0.4, 0.4, true); ctx.closePath(); ctx.fill();
    } else if (p.kind === 'feather') {
      ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy, p.vx) - Math.PI / 2);
      ctx.fillStyle = `rgba(${L.slash},0.9)`; ctx.beginPath(); ctx.ellipse(0, 0, 5, 18, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(0, 18); ctx.stroke();
    } else if (p.kind === 'spindle') {  // 凌雀：子母飞梭与悬丝
      ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy, p.vx));
      ctx.fillStyle = L.blade || '#ffe8fa'; ctx.beginPath(); ctx.ellipse(0, 0, 15, 4.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = L.metal || '#e056b0'; ctx.fillRect(-3, -2.5, 6, 5);
      ctx.strokeStyle = `rgba(${L.slash},0.85)`; ctx.lineWidth = 1.5;
      line([-15, 0], [15, 0]);
      // 尾部牵引丝线
      ctx.strokeStyle = `rgba(${L.slash},0.6)`; ctx.lineWidth = 1.2;
      line([-15, 0], [-45, 0]);
    } else if (p.kind === 'needle') {  // 千机暴雨梨花钢针
      ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy, p.vx));
      ctx.fillStyle = '#ffdf7a'; ctx.fillRect(-10, -1.5, 20, 3);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(4, -1, 6, 2);
    } else if (p.kind === 'ironball') {  // 千机：天工金丝傀丸（机关球）
      const r = (p.w || 36) * 0.45;
      const ownerF = fighterByIdx(p.owner);
      // 金丝牵引连线
      if (ownerF && !p.dead) {
        ctx.save();
        const yoyoBurst = p.yoyoPhase === 'lash' || p.yoyoPhase === 'ult-pass' || p.yoyoPhase === 'ult-return';
        const tetherRange = Math.max(1, p.yoyoRange || 600);
        const tension = p.yoyo ? clamp(Math.abs(p.x - ownerF.x) / tetherRange, 0, 1) : 0;
        const anchorX = ownerF.x + (ownerF.face || 1) * 18;
        const anchorY = ownerF.y - 50;
        ctx.strokeStyle = yoyoBurst ? 'rgba(255,225,120,0.92)' : `rgba(235,165,70,${0.38 + tension * 0.32})`;
        ctx.lineWidth = yoyoBurst ? 2.4 : 1 + tension * 0.8;
        if (yoyoBurst) { ctx.shadowColor = '#ffd24a'; ctx.shadowBlur = 8; }
        ctx.beginPath(); ctx.moveTo(anchorX, anchorY);
        ctx.quadraticCurveTo((p.x + anchorX) / 2, Math.min(p.y, anchorY) - (p.recalling ? 5 : 30 * (1 - tension)), p.x, p.y);
        ctx.stroke();
        if (tension > 0.82 && !yoyoBurst) {
          ctx.globalAlpha = (tension - 0.82) * 3.5;
          ctx.strokeStyle = 'rgba(255,232,175,0.8)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(anchorX, anchorY); ctx.lineTo(p.x, p.y); ctx.stroke();
        }
        ctx.restore();
      }
      ctx.translate(p.x, p.y);
      ctx.rotate(p.age * (p.resting ? 0.5 : (p.vx * 0.015)));
      // 外层青铜齿轮边缘与金属铆钉
      ctx.fillStyle = p.speedTier === 3 ? '#ffcf56' : '#d49b42';
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#261e17'; ctx.beginPath(); ctx.arc(0, 0, r * 0.75, 0, Math.PI * 2); ctx.fill();
      // 内部旋转十字金枢与铜心
      ctx.strokeStyle = p.speedTier >= 2 ? '#fff' : '#e5a558'; ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-r * 0.7, 0); ctx.lineTo(r * 0.7, 0);
      ctx.moveTo(0, -r * 0.7); ctx.lineTo(0, r * 0.7);
      ctx.stroke();
      ctx.fillStyle = p.speedTier === 3 ? '#fff' : '#e5a558';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2); ctx.fill();
      // 高速气流光环与拖尾光效
      if (p.speedTier >= 2) {
        ctx.strokeStyle = p.speedTier === 3 ? 'rgba(255,230,120,0.8)' : 'rgba(235,165,70,0.6)';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(0, 0, r + 4, 0, Math.PI * 2); ctx.stroke();
      }
    } else if (p.kind === 'trap') {
      const armed = p.delay <= 0, r = (p.w || 84) * 0.48, gy = p.groundY !== undefined ? p.groundY : 0;
      ctx.translate(p.x, gy); ctx.scale(1, 0.28);
      ctx.strokeStyle = armed ? 'rgba(20,20,30,0.95)' : 'rgba(20,20,30,0.45)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
      ctx.rotate(p.age * 1.5); ctx.lineWidth = 3;
      for (let i = 0; i < 6; i++) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(r * 0.35, 0); ctx.lineTo(r * 0.8, 6); ctx.stroke(); }
    } else if (p.kind === 'bottle') {   // 醉翁飞掷酒坛
      ctx.translate(p.x, p.y); ctx.rotate(p.age * 12);
      ctx.fillStyle = '#8a5a36'; ctx.strokeStyle = '#2b1b10'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(0, 0, 10, 14, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#683f20'; ctx.fillRect(-4, -18, 8, 6); ctx.strokeRect(-4, -18, 8, 6);
      ctx.fillStyle = '#d8452f'; ctx.fillRect(-5, -6, 10, 8);
      ctx.fillStyle = 'rgba(255,220,150,0.5)'; ctx.fillRect(-2, -4, 4, 4);
    } else if (p.kind === 'pavilion') {   // 亭中留客：醉翁亭从天而降（按目标所在平台层高落脚）
      const gy = p.groundY !== undefined ? p.groundY : 0;
      const drop = p.delay > 0 ? p.delay / 0.45 : 0;
      if (p.delay > 0) { ctx.strokeStyle = 'rgba(255,190,90,0.5)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.ellipse(p.x, gy, 100, 9, 0, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
      drawWengTing(p.x, gy - drop * drop * 640, 1, 1);
    }
    ctx.restore();
  }
}
function drawPetals() {
  for (const p of petals) {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
    ctx.fillStyle = 'rgba(255,205,220,0.55)';
    ctx.beginPath(); ctx.ellipse(0, 0, p.s, p.s * 0.45, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
}

