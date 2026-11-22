import { icon } from '../icons.js';
import {
  COLORS, clamp, fmt, prepareCanvas, startLoop, bindRange, setFill, readout, setReading,
  drawArrow, drawLabel, roundRect,
} from './base.js';

export function mountLens(container, api) {
  container.innerHTML = `
    <div class="sim-card">
      <div class="sim-stage">
        <div class="stage-label">RAY DIAGRAM · THIN LENS</div>
        <div class="stage-tools">
          <button class="stage-tool" type="button" data-reset title="重置">${icon('reset')}</button>
        </div>
        <canvas></canvas>
      </div>
      <div class="sim-controls">
        <div class="sim-controls-head">
          <b>OPTICS BENCH</b>
          <div class="sim-playbar">
            <button class="sim-btn" type="button" data-record>${icon('record')}记录</button>
          </div>
        </div>
        <div class="control-grid">
          <div class="sim-control">
            <label for="range-lf">焦距 f<b><span data-out="f">10 cm</span></b></label>
            <input id="range-lf" type="range" data-param="f" data-suffix=" cm" data-decimals="0" min="5" max="25" step="1" value="10">
          </div>
          <div class="sim-control">
            <label for="range-lu">物距 u<b><span data-out="u">15 cm</span></b></label>
            <input id="range-lu" type="range" data-param="u" data-suffix=" cm" data-decimals="0" min="5" max="60" step="1" value="15">
          </div>
          <div class="sim-control">
            <label for="range-lh">物高 h<b><span data-out="h">4.0 cm</span></b></label>
            <input id="range-lh" type="range" data-param="h" data-suffix=" cm" data-decimals="1" min="2" max="10" step="0.5" value="4">
          </div>
        </div>
      </div>
      <div class="sim-readouts">
        ${readout('像距 v', 'v', 'cm')}
        ${readout('放大率 |m|', 'm', '×')}
        ${readout('像高', 'hi', 'cm')}
        ${readout('像的性质', 'type', '')}
      </div>
      <div class="sim-note" data-note>${icon('light')}<span>把物体移到焦点以内，观察实像如何变成虚像。</span></div>
    </div>
  `;

  const root = container.querySelector('.sim-card');
  const stage = root.querySelector('.sim-stage');
  const view = prepareCanvas(stage);
  const { ctx, size } = view;
  const recordButton = root.querySelector('[data-record]');
  const resetButton = root.querySelector('[data-reset]');
  const noteEl = root.querySelector('[data-note]');

  let f = 10;
  let u = 15;
  let h = 4;

  bindRange(root, 'f', value => `${fmt(value, 0)} cm`, value => { f = value; update(); });
  bindRange(root, 'u', value => `${fmt(value, 0)} cm`, value => { u = value; update(); });
  bindRange(root, 'h', value => `${fmt(value, 1)} cm`, value => { h = value; update(); });
  setFill(root.querySelector('input[data-param="f"]'));
  setFill(root.querySelector('input[data-param="u"]'));
  setFill(root.querySelector('input[data-param="h"]'));

  resetButton.addEventListener('click', () => {
    f = 10;
    u = 15;
    h = 4;
    root.querySelector('input[data-param="f"]').value = 10;
    root.querySelector('input[data-param="u"]').value = 15;
    root.querySelector('input[data-param="h"]').value = 4;
    setFill(root.querySelector('input[data-param="f"]'));
    setFill(root.querySelector('input[data-param="u"]'));
    setFill(root.querySelector('input[data-param="h"]'));
    root.querySelector('[data-out="f"]').textContent = '10 cm';
    root.querySelector('[data-out="u"]').textContent = '15 cm';
    root.querySelector('[data-out="h"]').textContent = '4.0 cm';
    update();
  });

  recordButton.addEventListener('click', () => {
    const result = optics();
    api.record({
      'f / cm': fmt(f, 0),
      'u / cm': fmt(u, 0),
      'v / cm': Number.isFinite(result.v) ? fmt(result.v, 1) : '不成像',
      '|m|': Number.isFinite(result.m) ? fmt(Math.abs(result.m), 2) : '—',
    });
  });

  function optics() {
    const denom = u - f;
    if (Math.abs(denom) < 0.001) return { v: Infinity, m: Infinity, hi: Infinity, type: '不成像' };
    const v = (u * f) / denom;
    const m = -v / u;
    const hi = m * h;
    const type = v > 0 ? '倒立实像' : '正立虚像';
    return { v, m, hi, type };
  }

  function update() {
    const r = optics();
    const limited = Math.abs(r.v) > 999;
    setReading(root, 'v', Number.isFinite(r.v) && !limited ? fmt(r.v, 1) : '∞');
    setReading(root, 'm', Number.isFinite(r.m) && !limited ? fmt(Math.abs(r.m), 2) : '—');
    setReading(root, 'hi', Number.isFinite(r.hi) && !limited ? fmt(Math.abs(r.hi), 1) : '—');
    setReading(root, 'type', limited ? '不成像' : r.type);

    let hint = '';
    if (Math.abs(u - f) < 0.1) hint = 'u = f：折射光平行射出，既不成实像也不成虚像。';
    else if (u < f) hint = 'u < f：成正立、放大的虚像。放大镜使用的就是这一区域。';
    else if (u < 2 * f) hint = 'f < u < 2f：成倒立、放大的实像，像在 2f 以外。';
    else if (u === 2 * f) hint = 'u = 2f：成倒立、等大的实像，像距也等于 2f。';
    else hint = 'u > 2f：成倒立、缩小的实像，像在 f 与 2f 之间。';
    noteEl.innerHTML = `${icon('light')}<span>${hint} 薄透镜公式 1/f = 1/u + 1/v。</span>`;
    draw();
  }

  function draw() {
    const w = size.w;
    const hh = size.h;
    ctx.clearRect(0, 0, w, hh);
    const gradient = ctx.createLinearGradient(0, 0, 0, hh);
    gradient.addColorStop(0, 'rgba(18, 42, 64, .3)');
    gradient.addColorStop(1, 'rgba(7, 17, 29, .06)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, hh);

    const result = optics();
    const noImage = !Number.isFinite(result.v) || Math.abs(u - f) < 0.1;
    const vDraw = noImage ? f * 2.5 : clamp(result.v, -220, 220);
    const hiDraw = noImage ? h : clamp(result.hi, -200, 200);
    const xMin = Math.min(-u, -2 * f, vDraw, -2) - 5;
    const xMax = Math.max(2 * f, vDraw, 2 * f + 5, 10) + 5;
    const yMax = Math.max(h, Math.abs(hiDraw), f * 0.2, 1) * 1.35;
    const axisY = hh * 0.52;
    const scale = Math.min((w - 90) / (xMax - xMin), (hh * 0.6) / (2 * yMax));
    const lensX = 46 + (-xMin) * scale;
    const mapX = x => lensX + x * scale;
    const mapY = y => axisY - y * scale;

    ctx.save();
    ctx.strokeStyle = 'rgba(184, 207, 228, .22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(26, axisY);
    ctx.lineTo(w - 22, axisY);
    ctx.stroke();
    drawLabel(ctx, '主光轴', w - 24, axisY + 15, { align: 'right', size: 8, mono: true });
    ctx.restore();

    const lensHeight = clamp(hh * 0.58, 120, hh - 70);
    ctx.save();
    ctx.fillStyle = 'rgba(114, 227, 209, .08)';
    ctx.strokeStyle = 'rgba(114, 227, 209, .55)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(lensX, axisY, Math.max(7, lensHeight * 0.075), lensHeight / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    drawFocal(mapX(-2 * f), axisY, '2F', hh);
    drawFocal(mapX(-f), axisY, 'F', hh);
    drawFocal(mapX(f), axisY, 'F′', hh);
    drawFocal(mapX(2 * f), axisY, '2F′', hh);

    const objX = mapX(-u);
    const objY = mapY(h);
    drawArrow(ctx, objX, axisY, objX, objY, COLORS.amber, 2.2);
    drawLabel(ctx, '物', objX, objY - 9, { align: 'center', size: 8, color: COLORS.amber });
    drawLabel(ctx, `u = ${fmt(u, 0)} cm`, objX, axisY + 18, { align: 'center', size: 8, mono: true, color: 'rgba(245,184,90,.55)' });

    const lensTop = mapY(h);
    if (!noImage) {
      const imageX = mapX(vDraw);
      const imageY = mapY(hiDraw);
      const virtual = result.v < 0;
      ctx.save();
      if (virtual) {
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(114, 227, 209, .55)';
      } else {
        ctx.strokeStyle = COLORS.teal;
      }
      drawArrow(ctx, imageX, axisY, imageX, imageY, virtual ? 'rgba(114,227,209,.65)' : COLORS.teal, 2.2);
      ctx.restore();
      drawLabel(ctx, virtual ? '虚像' : '实像', imageX, imageY + (imageY > axisY ? 14 : -9), {
        align: 'center', size: 8, color: 'rgba(114,227,209,.7)',
      });
      drawLabel(ctx, `v = ${fmt(result.v, 1)} cm`, imageX, axisY - 18, {
        align: 'center', size: 8, mono: true, color: 'rgba(114,227,209,.55)',
      });
    }

    ctx.save();
    ctx.strokeStyle = 'rgba(245, 184, 90, .65)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(objX, objY);
    ctx.lineTo(lensX, lensTop);
    ctx.stroke();
    if (!noImage) {
      const focusX = mapX(f);
      const focusY = axisY;
      const dx = focusX - lensX;
      const dy = focusY - lensTop;
      const extend = 1200;
      const len = Math.hypot(dx, dy) || 1;
      ctx.strokeStyle = 'rgba(114, 227, 209, .55)';
      ctx.beginPath();
      ctx.moveTo(lensX, lensTop);
      ctx.lineTo(lensX + (dx / len) * extend, lensTop + (dy / len) * extend);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(122, 162, 255, .55)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    const centerY = axisY;
    const dx2 = lensX - objX;
    const dy2 = centerY - objY;
    const len2 = Math.hypot(dx2, dy2) || 1;
    const ext2 = 1400;
    ctx.moveTo(objX, objY);
    ctx.lineTo(objX + (dx2 / len2) * ext2, objY + (dy2 / len2) * ext2);
    ctx.stroke();
    ctx.restore();

    if (noImage) {
      ctx.save();
      ctx.strokeStyle = 'rgba(114, 227, 209, .5)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(lensX, lensTop);
      ctx.lineTo(w - 24, lensTop);
      ctx.stroke();
      ctx.restore();
      drawLabel(ctx, '折射光平行，不成像', lensX + 18, lensTop - 10, { size: 9, color: 'rgba(245,184,90,.75)' });
    }

    drawLabel(ctx, '凸透镜', lensX, axisY + lensHeight / 2 + 16, { align: 'center', size: 8, color: 'rgba(114,227,209,.55)' });
    drawLabel(ctx, `f = ${fmt(f, 0)} cm`, lensX, 26, { align: 'center', size: 8, mono: true, color: 'rgba(184,207,228,.5)' });
  }

  function drawFocal(x, y, label, hh) {
    ctx.save();
    ctx.fillStyle = 'rgba(184, 207, 228, .55)';
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(184, 207, 228, .14)';
    ctx.beginPath();
    ctx.moveTo(x, y - 10);
    ctx.lineTo(x, y + 10);
    ctx.stroke();
    ctx.restore();
    drawLabel(ctx, label, x, y + 20, { align: 'center', size: 7.5, mono: true, color: 'rgba(184,207,228,.45)' });
  }

  update();
  const stop = startLoop(() => {
    // Redraws on resize; drawing is otherwise static.
    draw();
  });

  return () => {
    stop();
    view.dispose();
  };
}
