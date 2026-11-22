import { icon } from '../icons.js';
import {
  COLORS, clamp, fmt, prepareCanvas, startLoop, bindRange, setFill, readout, setReading,
  drawGrid, drawArrow, drawLabel, roundRect,
} from './base.js';

export function mountOscillator(container, api) {
  container.innerHTML = `
    <div class="sim-card">
      <div class="sim-stage">
        <div class="stage-label">SPRING OSCILLATOR · X-T</div>
        <div class="stage-tools">
          <button class="stage-tool" type="button" data-reset title="重置">${icon('reset')}</button>
        </div>
        <canvas></canvas>
      </div>
      <div class="sim-controls">
        <div class="sim-controls-head">
          <b>OSCILLATOR CONTROL</b>
          <div class="sim-playbar">
            <button class="sim-btn primary" type="button" data-play>${icon('pause')}<span>暂停</span></button>
            <button class="sim-btn" type="button" data-record>${icon('record')}记录</button>
          </div>
        </div>
        <div class="control-grid">
          <div class="sim-control">
            <label for="range-om">振子质量 m<b><span data-out="m">1.0 kg</span></b></label>
            <input id="range-om" type="range" data-param="m" data-suffix=" kg" data-decimals="1" min="0.5" max="5" step="0.1" value="1">
          </div>
          <div class="sim-control">
            <label for="range-ok">劲度系数 k<b><span data-out="k">40 N/m</span></b></label>
            <input id="range-ok" type="range" data-param="k" data-suffix=" N/m" data-decimals="0" min="5" max="100" step="5" value="40">
          </div>
          <div class="sim-control">
            <label for="range-oa">振幅 A<b><span data-out="A">15 cm</span></b></label>
            <input id="range-oa" type="range" data-param="A" data-suffix=" cm" data-decimals="0" min="5" max="30" step="1" value="15">
          </div>
        </div>
      </div>
      <div class="sim-readouts">
        ${readout('周期 T', 'T', 's')}
        ${readout('频率 f', 'f', 'Hz')}
        ${readout('最大速度', 'vmax', 'm/s')}
        ${readout('总机械能', 'E', 'J')}
      </div>
      <div class="sim-note" data-note>${icon('light')}<span>只改变振幅，周期会变吗？先预测，再拖动 A 验证。</span></div>
    </div>
  `;

  const root = container.querySelector('.sim-card');
  const stage = root.querySelector('.sim-stage');
  const view = prepareCanvas(stage);
  const { ctx, size } = view;
  const playButton = root.querySelector('[data-play]');
  const recordButton = root.querySelector('[data-record]');
  const resetButton = root.querySelector('[data-reset]');
  const noteEl = root.querySelector('[data-note]');

  let m = 1;
  let k = 40;
  let A = 0.15;
  let playing = true;
  let t = 0;
  let omega = Math.sqrt(k / m);
  let period = (2 * Math.PI) / omega;

  bindRange(root, 'm', value => `${fmt(value, 1)} kg`, value => { m = value; recompute(); });
  bindRange(root, 'k', value => `${fmt(value, 0)} N/m`, value => { k = value; recompute(); });
  bindRange(root, 'A', value => `${fmt(value, 0)} cm`, value => { A = value / 100; recompute(); });
  setFill(root.querySelector('input[data-param="m"]'));
  setFill(root.querySelector('input[data-param="k"]'));
  setFill(root.querySelector('input[data-param="A"]'));

  function recompute() {
    omega = Math.sqrt(k / m);
    period = (2 * Math.PI) / omega;
    t = 0;
    update();
  }

  function displacement() {
    return A * Math.cos(omega * t);
  }

  function velocity() {
    return -A * omega * Math.sin(omega * t);
  }

  function updatePlayButton() {
    playButton.innerHTML = playing ? `${icon('pause')}<span>暂停</span>` : `${icon('play')}<span>继续</span>`;
  }

  playButton.addEventListener('click', () => {
    playing = !playing;
    updatePlayButton();
  });
  resetButton.addEventListener('click', () => {
    t = 0;
    playing = false;
    updatePlayButton();
    update();
  });
  recordButton.addEventListener('click', () => {
    api.record({
      'm / kg': fmt(m, 1),
      'k / N·m⁻¹': fmt(k, 0),
      'A / cm': fmt(A * 100, 0),
      'T / s': fmt(period, 3),
    });
  });

  function update() {
    setReading(root, 'T', fmt(period, 3));
    setReading(root, 'f', fmt(1 / period, 3));
    setReading(root, 'vmax', fmt(omega * A, 3));
    setReading(root, 'E', fmt(0.5 * k * A * A, 3));
    const x = displacement();
    const phase = ((omega * t) / (2 * Math.PI)) % 1;
    let hint = 'T = 2π√(m/k)，周期由质量和劲度系数决定，与振幅无关。';
    if (x > A * 0.95) hint = '此刻振子在最大位移处：速度为零，加速度最大，势能最大。';
    else if (Math.abs(x) < A * 0.05) hint = '此刻振子经过平衡位置：速度最大，加速度为零，动能最大。';
    else hint = '位移为振幅的一半时，弹性势能是总机械能的 1/4，动能为 3/4。';
    noteEl.innerHTML = `${icon('light')}<span>${hint} 当前相位约为 ${fmt(phase, 2)}。</span>`;
    draw();
  }

  function draw() {
    const w = size.w;
    const h = size.h;
    ctx.clearRect(0, 0, w, h);
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, 'rgba(18, 44, 65, .3)');
    gradient.addColorStop(1, 'rgba(7, 17, 29, .06)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    drawSpringScene(w, h);
    drawXGraph(w, h);
  }

  function drawSpringScene(w, h) {
    const springY = Math.max(100, h * 0.27);
    const wallX = 48;
    const eqX = Math.min(w * 0.44, wallX + 240);
    const scale = 260;
    const x = displacement();
    const massW = 46;
    const massH = 44;
    const massCenter = eqX + x * scale;
    const massLeft = massCenter - massW / 2;

    ctx.save();
    ctx.fillStyle = 'rgba(184, 207, 228, .12)';
    ctx.fillRect(wallX - 14, springY - 70, 14, 140);
    ctx.strokeStyle = 'rgba(184, 207, 228, .28)';
    ctx.lineWidth = 1;
    for (let y = springY - 65; y < springY + 70; y += 14) {
      ctx.beginPath();
      ctx.moveTo(wallX - 14, y);
      ctx.lineTo(wallX, y + 7);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(114, 227, 209, .32)';
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(eqX, springY - 66);
    ctx.lineTo(eqX, springY + 66);
    ctx.stroke();
    ctx.setLineDash([]);
    drawLabel(ctx, '平衡位置', eqX, springY - 74, { align: 'center', size: 8, color: 'rgba(114,227,209,.55)' });

    drawSpring(wallX, springY, massLeft, 12, 10);
    ctx.save();
    ctx.shadowColor = 'rgba(114, 227, 209, .35)';
    ctx.shadowBlur = 15;
    ctx.fillStyle = COLORS.teal;
    roundRect(ctx, massLeft, springY - massH / 2, massW, massH, 7);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,.25)';
    ctx.lineWidth = 1;
    roundRect(ctx, massLeft, springY - massH / 2, massW, massH, 7);
    ctx.stroke();
    drawLabel(ctx, 'm', massCenter, springY + 3, { align: 'center', size: 12, mono: true, color: 'rgba(8,20,33,.8)' });

    if (Math.abs(x) > 0.002) {
      drawArrow(ctx, eqX, springY + 58, massCenter, springY + 58, COLORS.amber, 1.2);
      drawLabel(ctx, `x = ${fmt(x * 100, 1)} cm`, (eqX + massCenter) / 2, springY + 79, {
        align: 'center', size: 8, mono: true, color: 'rgba(245,184,90,.7)',
      });
    }

    const v = velocity();
    if (Math.abs(v) > 0.02) {
      const len = clamp(Math.abs(v) * 48, 14, 70);
      drawArrow(ctx, massCenter, springY + 18, massCenter + Math.sign(v) * len, springY + 18, COLORS.blue, 1.3);
      drawLabel(ctx, `v = ${fmt(v, 2)} m/s`, massCenter + Math.sign(v) * (len + 8), springY + 22, {
        align: Math.sign(v) > 0 ? 'left' : 'right', size: 8, color: COLORS.blue,
      });
    }

    const totalE = 0.5 * k * A * A;
    const potential = 0.5 * k * x * x;
    const kinetic = Math.max(0, totalE - potential);
    const barX = w - 132;
    const barY = 62;
    drawLabel(ctx, '能量转化', barX, barY - 8, { size: 8, color: 'rgba(184,207,228,.5)' });
    drawEnergyBar(barX, barY + 4, 84, 6, kinetic / totalE, '动能', COLORS.teal);
    drawEnergyBar(barX, barY + 28, 84, 6, potential / totalE, '势能', COLORS.amber);
  }

  function drawSpring(x1, y, x2, coils, amp) {
    const length = x2 - x1;
    if (length < 10) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(245, 184, 90, .85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y);
    const start = x1 + 10;
    const end = x2 - 6;
    const seg = (end - start) / coils;
    for (let i = 0; i < coils; i += 1) {
      const px = start + seg * (i + 0.5);
      ctx.lineTo(px, y + (i % 2 === 0 ? -amp : amp));
    }
    ctx.lineTo(end, y);
    ctx.lineTo(x2, y);
    ctx.stroke();
    ctx.restore();
  }

  function drawEnergyBar(x, y, w, h, ratio, label, color) {
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, .07)';
    roundRect(ctx, x, y, w, h, 3);
    ctx.fill();
    ctx.fillStyle = color;
    roundRect(ctx, x, y, Math.max(0, Math.min(1, ratio)) * w, h, 3);
    ctx.fill();
    drawLabel(ctx, label, x - 6, y + h + 1, { align: 'right', size: 7.5, color: 'rgba(184,207,228,.5)' });
    ctx.restore();
  }

  function drawXGraph(w, h) {
    const x = 55;
    const y = h * 0.64;
    const gw = w - 82;
    const gh = h - y - 30;
    if (gw < 60 || gh < 45) return;
    drawGrid(ctx, x, y, gw, gh, 6, 2, 'rgba(170, 202, 225, .08)');
    const centerY = y + gh / 2;
    ctx.save();
    ctx.strokeStyle = 'rgba(184, 207, 228, .25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, centerY);
    ctx.lineTo(x + gw, centerY);
    ctx.stroke();
    ctx.restore();

    const windowSpan = Math.max(3 * period, 1);
    const start = Math.max(0, t - windowSpan);
    const end = start + windowSpan;
    const mapT = time => x + ((time - start) / windowSpan) * gw;
    const mapX = value => centerY - (value / Math.max(A, 0.001)) * (gh * 0.36);

    const curve = (ctx2, from, to, color, width, dashed) => {
      ctx2.save();
      ctx2.strokeStyle = color;
      ctx2.lineWidth = width;
      if (dashed) ctx2.setLineDash([3, 5]);
      ctx2.beginPath();
      for (let time = from; time <= to + 0.001; time += windowSpan / 240) {
        const px = mapT(time);
        const py = mapX(A * Math.cos(omega * time));
        if (time === from) ctx2.moveTo(px, py);
        else ctx2.lineTo(px, py);
      }
      ctx2.stroke();
      ctx2.restore();
    };

    curve(ctx, start, end, 'rgba(114, 227, 209, .22)', 1, true);
    if (t > start) curve(ctx, start, t, COLORS.teal, 1.8, false);

    const px = mapT(t);
    const py = mapX(displacement());
    ctx.save();
    ctx.fillStyle = COLORS.amber;
    ctx.beginPath();
    ctx.arc(px, py, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(245, 184, 90, .3)';
    ctx.beginPath();
    ctx.arc(px, py, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    drawLabel(ctx, 'x–t 图像', x + gw - 2, y + 12, { align: 'right', size: 8, mono: true, color: 'rgba(245,184,90,.55)' });
    drawLabel(ctx, 't', x + gw + 8, centerY + 3, { size: 8, mono: true });
    drawLabel(ctx, 'x', x - 6, y + 8, { align: 'right', size: 8, mono: true });
    drawLabel(ctx, `T = ${fmt(period, 2)} s`, x + 4, y + 12, { size: 8, mono: true, color: 'rgba(184,207,228,.5)' });
  }

  update();
  const stop = startLoop(dt => {
    if (!playing) return;
    t += dt;
    update();
  });

  return () => {
    stop();
    view.dispose();
  };
}
