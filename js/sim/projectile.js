import { icon } from '../icons.js';
import {
  COLORS, clamp, fmt, prepareCanvas, startLoop, bindRange, setFill, readout, setReading,
  drawArrow, drawLabel, roundRect,
} from './base.js';

const G = 9.8;

export function mountProjectile(container, api) {
  container.innerHTML = `
    <div class="sim-card">
      <div class="sim-stage">
        <div class="stage-label">PROJECTILE · TRAJECTORY</div>
        <div class="stage-tools">
          <button class="stage-tool" type="button" data-reset title="重置">${icon('reset')}</button>
        </div>
        <canvas></canvas>
      </div>
      <div class="sim-controls">
        <div class="sim-controls-head">
          <b>LAUNCH PARAMETERS</b>
          <div class="sim-playbar">
            <button class="sim-btn primary" type="button" data-play>${icon('pause')}<span>暂停</span></button>
            <button class="sim-btn" type="button" data-vectors>${icon('eye')}<span>矢量</span></button>
            <button class="sim-btn" type="button" data-record>${icon('record')}记录</button>
          </div>
        </div>
        <div class="control-grid">
          <div class="sim-control">
            <label for="range-pv0">初速度 v₀<b><span data-out="v0">12 m/s</span></b></label>
            <input id="range-pv0" type="range" data-param="v0" data-suffix=" m/s" data-decimals="0" min="5" max="30" step="1" value="12">
          </div>
          <div class="sim-control">
            <label for="range-angle">抛射角 θ<b><span data-out="angle">0°</span></b></label>
            <input id="range-angle" type="range" data-param="angle" data-suffix="°" data-decimals="0" min="0" max="80" step="1" value="0">
          </div>
          <div class="sim-control">
            <label for="range-ph">抛出高度 h<b><span data-out="h">20 m</span></b></label>
            <input id="range-ph" type="range" data-param="h" data-suffix=" m" data-decimals="0" min="0" max="40" step="1" value="20">
          </div>
        </div>
      </div>
      <div class="sim-readouts">
        ${readout('水平射程', 'range', 'm')}
        ${readout('最大高度', 'maxH', 'm')}
        ${readout('飞行时间', 'flight', 's')}
        ${readout('落地速度', 'impact', 'm/s')}
      </div>
      <div class="sim-note" data-note>${icon('light')}<span>先预测：只改变初速度，飞行时间会变吗？</span></div>
    </div>
  `;

  const root = container.querySelector('.sim-card');
  const stage = root.querySelector('.sim-stage');
  const view = prepareCanvas(stage);
  const { ctx, size } = view;
  const playButton = root.querySelector('[data-play]');
  const vectorsButton = root.querySelector('[data-vectors]');
  const recordButton = root.querySelector('[data-record]');
  const resetButton = root.querySelector('[data-reset]');
  const noteEl = root.querySelector('[data-note]');

  let v0 = 12;
  let angle = 0;
  let h = 20;
  let t = 0;
  let playing = true;
  let showVectors = true;

  const state = physics();

  bindRange(root, 'v0', value => `${fmt(value, 0)} m/s`, value => { v0 = value; reset(); });
  bindRange(root, 'angle', value => `${fmt(value, 0)}°`, value => { angle = value; reset(); });
  bindRange(root, 'h', value => `${fmt(value, 0)} m`, value => { h = value; reset(); });
  setFill(root.querySelector('input[data-param="v0"]'));
  setFill(root.querySelector('input[data-param="angle"]'));
  setFill(root.querySelector('input[data-param="h"]'));

  function physics() {
    const rad = angle * Math.PI / 180;
    const vx = v0 * Math.cos(rad);
    const vy = v0 * Math.sin(rad);
    const flight = (vy + Math.sqrt(vy * vy + 2 * G * h)) / G;
    const range = vx * flight;
    const maxH = h + (vy > 0 ? (vy * vy) / (2 * G) : 0);
    const impact = Math.sqrt(vx * vx + (vy - G * flight) ** 2);
    return { rad, vx, vy, flight, range, maxH, impact };
  }

  function reset() {
    Object.assign(state, physics());
    t = 0;
    playing = false;
    updatePlayButton();
    update();
  }

  function updatePlayButton() {
    playButton.innerHTML = playing ? `${icon('pause')}<span>暂停</span>` : `${icon('play')}<span>发射</span>`;
  }

  playButton.addEventListener('click', () => {
    if (t >= state.flight) t = 0;
    playing = !playing;
    updatePlayButton();
  });

  vectorsButton.addEventListener('click', () => {
    showVectors = !showVectors;
    vectorsButton.style.color = showVectors ? 'var(--teal)' : '';
  });

  resetButton.addEventListener('click', reset);
  recordButton.addEventListener('click', () => {
    api.record({
      'v₀ / m·s⁻¹': fmt(v0, 0),
      'θ / °': fmt(angle, 0),
      'h / m': fmt(h, 0),
      '射程 / m': fmt(state.range, 1),
      '飞行 / s': fmt(state.flight, 2),
    });
  });

  function update() {
    setReading(root, 'range', fmt(state.range, 1));
    setReading(root, 'maxH', fmt(state.maxH, 1));
    setReading(root, 'flight', fmt(state.flight, 2));
    setReading(root, 'impact', fmt(state.impact, 1));
    const isHorizontal = angle === 0;
    let hint = isHorizontal
      ? '平抛：水平方向匀速，竖直方向自由落体。飞行时间只由高度决定。'
      : '斜抛：水平方向匀速，竖直方向做竖直上抛。最大高度出现在竖直分速度为零时。';
    if (isHorizontal && h > 0) hint += ' 改变 v₀，观察射程与飞行时间的变化。';
    noteEl.innerHTML = `${icon('light')}<span>${hint}</span>`;
    draw();
  }

  function draw() {
    const w = size.w;
    const hh = size.h;
    ctx.clearRect(0, 0, w, hh);
    const gradient = ctx.createLinearGradient(0, 0, 0, hh);
    gradient.addColorStop(0, 'rgba(20, 44, 68, .3)');
    gradient.addColorStop(1, 'rgba(7, 18, 31, .08)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, hh);

    const left = 54;
    const right = w - 34;
    const ground = hh - 48;
    const top = 28;
    const xMax = Math.max(state.range * 1.08, 2);
    const yMax = Math.max(state.maxH, h, 1);
    const scale = Math.min((right - left) / xMax, (ground - top) / (yMax * 1.3));
    const originX = left;
    const launchY = ground - h * scale;
    const mapX = x => originX + x * scale;
    const mapY = y => ground - y * scale;

    ctx.save();
    ctx.strokeStyle = 'rgba(184, 207, 228, .25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(36, ground);
    ctx.lineTo(w - 22, ground);
    ctx.stroke();
    drawLabel(ctx, '地面', w - 26, ground + 16, { align: 'right', size: 8, mono: true });

    if (h > 0) {
      const platW = Math.max(22, 8 + h * 1.4);
      ctx.fillStyle = 'rgba(184, 207, 228, .12)';
      roundRect(ctx, originX - 12, launchY, platW, ground - launchY, 3);
      ctx.fill();
      ctx.strokeStyle = 'rgba(184, 207, 228, .2)';
      ctx.stroke();
      drawLabel(ctx, `${fmt(h, 0)} m`, originX - 16, (launchY + ground) / 2, { align: 'right', size: 8, mono: true });
    }

    const fullPoints = [];
    const steps = 100;
    for (let i = 0; i <= steps; i += 1) {
      const time = (state.flight * i) / steps;
      fullPoints.push([mapX(state.vx * time), mapY(h + state.vy * time - 0.5 * G * time * time)]);
    }
    ctx.save();
    ctx.strokeStyle = 'rgba(114, 227, 209, .32)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    fullPoints.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    const currentT = clamp(t, 0, state.flight);
    const currentX = state.vx * currentT;
    const currentY = h + state.vy * currentT - 0.5 * G * currentT * currentT;
    const trail = [];
    for (let i = 0; i <= 80; i += 1) {
      const time = (currentT * i) / 80;
      trail.push([mapX(state.vx * time), mapY(h + state.vy * time - 0.5 * G * time * time)]);
    }
    ctx.save();
    ctx.strokeStyle = COLORS.teal;
    ctx.lineWidth = 2;
    ctx.beginPath();
    trail.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.stroke();
    ctx.restore();

    const apexT = state.vy > 0 ? state.vy / G : 0;
    if (apexT > 0 && apexT < state.flight) {
      const apexY = h + state.vy * apexT - 0.5 * G * apexT * apexT;
      ctx.save();
      ctx.strokeStyle = 'rgba(245, 184, 90, .3)';
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.moveTo(mapX(state.vx * apexT), mapY(apexY));
      ctx.lineTo(mapX(state.vx * apexT), ground);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COLORS.amber;
      ctx.beginPath();
      ctx.arc(mapX(state.vx * apexT), mapY(apexY), 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      drawLabel(ctx, '最高点', mapX(state.vx * apexT) + 7, mapY(apexY) - 4, { size: 8, color: 'rgba(245,184,90,.7)' });
    }

    const px = mapX(currentX);
    const py = mapY(currentY);
    if (showVectors) {
      const vxNow = state.vx;
      const vyNow = state.vy - G * currentT;
      const scaleV = 1.6;
      drawArrow(ctx, px, py, px + vxNow * scaleV, py, COLORS.blue, 1.3);
      drawArrow(ctx, px, py, px, py - vyNow * scaleV, COLORS.amber, 1.3);
      drawArrow(ctx, px, py, px + vxNow * scaleV, py - vyNow * scaleV, COLORS.teal, 1.1);
      drawLabel(ctx, 'vₓ', px + vxNow * scaleV + 4, py + 3, { size: 8, color: COLORS.blue });
      drawLabel(ctx, 'v_y', px + 5, py - vyNow * scaleV - 4, { size: 8, color: COLORS.amber });
    }

    ctx.save();
    ctx.shadowColor = 'rgba(245, 184, 90, .6)';
    ctx.shadowBlur = 15;
    ctx.fillStyle = COLORS.amber;
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(245, 184, 90, .25)';
    ctx.beginPath();
    ctx.arc(originX, launchY, 13, 0, Math.PI * 2);
    ctx.stroke();
    drawArrow(ctx, originX, launchY, originX + Math.cos(state.rad) * 23, launchY - Math.sin(state.rad) * 23, 'rgba(245,184,90,.55)', 1.2);

    if (state.range > 0.1) {
      const y = ground + 28;
      ctx.save();
      ctx.strokeStyle = 'rgba(184, 207, 228, .25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(originX, y);
      ctx.lineTo(mapX(state.range), y);
      ctx.moveTo(originX, y - 3);
      ctx.lineTo(originX, y + 3);
      ctx.moveTo(mapX(state.range), y - 3);
      ctx.lineTo(mapX(state.range), y + 3);
      ctx.stroke();
      ctx.restore();
      drawLabel(ctx, `射程 ${fmt(state.range, 1)} m`, (originX + mapX(state.range)) / 2, y + 13, {
        align: 'center', size: 8, mono: true, color: 'rgba(184,207,228,.55)',
      });
    }

    drawLabel(ctx, `t = ${fmt(currentT, 2)} s`, 36, 28, { size: 9, mono: true, color: 'rgba(230,240,250,.55)' });
    drawLabel(ctx, angle === 0 ? '平抛' : '斜抛', w - 34, 58, { align: 'right', size: 8, mono: true, color: 'rgba(245,184,90,.6)' });
  }

  update();
  const stop = startLoop(dt => {
    if (!playing) return;
    t += dt;
    if (t >= state.flight) {
      t = state.flight;
      playing = false;
      updatePlayButton();
    }
    update();
  });

  return () => {
    stop();
    view.dispose();
  };
}
