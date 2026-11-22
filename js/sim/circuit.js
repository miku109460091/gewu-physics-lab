import { icon } from '../icons.js';
import {
  COLORS, clamp, fmt, prepareCanvas, startLoop, bindRange, setFill, readout, setReading,
  drawGrid, drawLabel, roundRect,
} from './base.js';

export function mountCircuit(container, api) {
  container.innerHTML = `
    <div class="sim-card">
      <div class="sim-stage">
        <div class="stage-label">CLOSED CIRCUIT · P–R</div>
        <div class="stage-tools">
          <button class="stage-tool" type="button" data-reset title="重置相位">${icon('reset')}</button>
        </div>
        <canvas></canvas>
      </div>
      <div class="sim-controls">
        <div class="sim-controls-head">
          <b>CIRCUIT CONTROL</b>
          <div class="sim-playbar">
            <button class="sim-btn primary" type="button" data-play>${icon('pause')}<span>暂停</span></button>
            <button class="sim-btn" type="button" data-record>${icon('record')}记录</button>
          </div>
        </div>
        <div class="control-grid">
          <div class="sim-control">
            <label for="range-emf">电动势 E<b><span data-out="emf">6 V</span></b></label>
            <input id="range-emf" type="range" data-param="emf" data-suffix=" V" data-decimals="1" min="1.5" max="12" step="0.5" value="6">
          </div>
          <div class="sim-control">
            <label for="range-R">外电阻 R<b><span data-out="R">4 Ω</span></b></label>
            <input id="range-R" type="range" data-param="R" data-suffix=" Ω" data-decimals="1" min="1" max="20" step="0.5" value="4">
          </div>
          <div class="sim-control">
            <label for="range-r">内阻 r<b><span data-out="r">1 Ω</span></b></label>
            <input id="range-r" type="range" data-param="r" data-suffix=" Ω" data-decimals="1" min="0.5" max="4" step="0.5" value="1">
          </div>
        </div>
      </div>
      <div class="sim-readouts">
        ${readout('电流 I', 'I', 'A')}
        ${readout('路端电压 U', 'U', 'V')}
        ${readout('输出功率 P', 'P', 'W')}
        ${readout('电源效率 η', 'eff', '%')}
      </div>
      <div class="sim-note" data-note>${icon('light')}<span>拖动外电阻，观察路端电压与输出功率如何一起变化。</span></div>
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

  let emf = 6;
  let R = 4;
  let r = 1;
  let playing = true;
  let phase = 0;

  bindRange(root, 'emf', value => `${fmt(value, 1)} V`, value => { emf = value; update(); });
  bindRange(root, 'R', value => `${fmt(value, 1)} Ω`, value => { R = value; update(); });
  bindRange(root, 'r', value => `${fmt(value, 1)} Ω`, value => { r = value; update(); });
  setFill(root.querySelector('input[data-param="emf"]'));
  setFill(root.querySelector('input[data-param="R"]'));
  setFill(root.querySelector('input[data-param="r"]'));

  function values() {
    const I = emf / (R + r);
    const U = I * R;
    const P = I * I * R;
    const efficiency = (R / (R + r)) * 100;
    return { I, U, P, efficiency };
  }

  function updatePlayButton() {
    playButton.innerHTML = playing ? `${icon('pause')}<span>暂停</span>` : `${icon('play')}<span>继续</span>`;
  }

  playButton.addEventListener('click', () => {
    playing = !playing;
    updatePlayButton();
  });
  resetButton.addEventListener('click', () => {
    phase = 0;
    playing = false;
    updatePlayButton();
  });
  recordButton.addEventListener('click', () => {
    const v = values();
    api.record({
      'E / V': fmt(emf, 1),
      'R / Ω': fmt(R, 1),
      'r / Ω': fmt(r, 1),
      'I / A': fmt(v.I, 3),
      'U / V': fmt(v.U, 2),
    });
  });

  function update() {
    const v = values();
    setReading(root, 'I', fmt(v.I, 2));
    setReading(root, 'U', fmt(v.U, 2));
    setReading(root, 'P', fmt(v.P, 2));
    setReading(root, 'eff', fmt(v.efficiency, 1));
    let hint = 'I = E/(R+r)，U = E − Ir。外电阻越大，电流越小、路端电压越大。';
    if (Math.abs(R - r) < 0.1) {
      hint = 'R = r：输出功率达到最大值 P = E²/(4r)，此时效率恰好为 50%。';
    } else if (R > r) {
      hint = 'R > r：效率提高，但输出功率已越过最大值，继续增大 R 会让功率下降。';
    } else {
      hint = 'R < r：电流较大，更多能量消耗在电源内部，输出功率仍可继续增大。';
    }
    noteEl.innerHTML = `${icon(Math.abs(R - r) < 0.1 ? 'check-circle' : 'light')}<span>${hint}</span>`;
    draw();
  }

  function draw() {
    const w = size.w;
    const h = size.h;
    ctx.clearRect(0, 0, w, h);
    const gradient = ctx.createLinearGradient(0, 0, w, h);
    gradient.addColorStop(0, 'rgba(19, 42, 66, .28)');
    gradient.addColorStop(1, 'rgba(7, 17, 30, .06)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    const compact = w < 600;
    if (compact) {
      drawCircuit(24, 34, w - 48, h * 0.48);
      drawGraph(36, h * 0.6, w - 66, h * 0.3);
    } else {
      drawCircuit(26, 40, w * 0.52, h - 80);
      drawGraph(w * 0.6, 48, w * 0.34, h - 116);
    }
  }

  function drawCircuit(x, y, w, h) {
    const x0 = x + 18;
    const y0 = y + 18;
    const x1 = x + w - 20;
    const y1 = y + h - 20;
    if (x1 - x0 < 80 || y1 - y0 < 80) return;
    const v = values();

    ctx.save();
    ctx.strokeStyle = 'rgba(184, 207, 228, .45)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x0, y1);
    ctx.closePath();
    ctx.stroke();

    const perimeter = 2 * ((x1 - x0) + (y1 - y0));
    const spacing = 26;
    const offset = (phase * (18 + v.I * 26)) % perimeter;

    ctx.save();
    const pathPoint = distance => {
      let d = ((distance % perimeter) + perimeter) % perimeter;
      if (d <= x1 - x0) return [x0 + d, y0];
      d -= x1 - x0;
      if (d <= y1 - y0) return [x1, y0 + d];
      d -= y1 - y0;
      if (d <= x1 - x0) return [x1 - d, y1];
      d -= x1 - x0;
      return [x0, y1 - d];
    };
    ctx.fillStyle = 'rgba(114, 227, 209, .7)';
    for (let d = offset; d < perimeter; d += spacing) {
      const [px, py] = pathPoint(d);
      ctx.beginPath();
      ctx.arc(px, py, 1.9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    const midY = (y0 + y1) / 2;
    ctx.strokeStyle = COLORS.amber;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(x0 - 12, midY - 14);
    ctx.lineTo(x0 - 12, midY + 14);
    ctx.moveTo(x0 + 12, midY - 8);
    ctx.lineTo(x0 + 12, midY + 8);
    ctx.stroke();
    drawLabel(ctx, 'E', x0 - 14, midY - 22, { size: 9, mono: true, color: COLORS.amber, align: 'center' });
    drawLabel(ctx, 'r', x0 + 4, midY + 26, { size: 8, mono: true, color: 'rgba(245,184,90,.7)' });

    const resW = Math.min(96, (x1 - x0) * 0.34);
    const resX = (x0 + x1) / 2 - resW / 2;
    const resY = y0;
    ctx.strokeStyle = 'rgba(184, 207, 228, .5)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(resX, resY);
    for (let i = 0; i < 6; i += 1) {
      ctx.lineTo(resX + (resW / 6) * (i + 0.5), resY + (i % 2 === 0 ? -7 : 7));
    }
    ctx.lineTo(resX + resW, resY);
    ctx.stroke();
    drawLabel(ctx, 'R', resX + resW / 2, resY - 14, { size: 9, mono: true, color: 'rgba(230,240,250,.7)', align: 'center' });

    ctx.strokeStyle = 'rgba(122, 162, 255, .55)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x1, midY, 13, 0, Math.PI * 2);
    ctx.stroke();
    drawLabel(ctx, 'A', x1, midY + 3, { size: 9, mono: true, color: COLORS.blue, align: 'center' });

    ctx.fillStyle = 'rgba(114, 227, 209, .08)';
    roundRect(ctx, x0 + 10, y1 + 8, Math.min(150, x1 - x0 - 20), 38, 7);
    ctx.fill();
    drawLabel(ctx, `I = ${fmt(v.I, 2)} A`, x0 + 22, y1 + 25, { size: 10, mono: true, color: COLORS.teal });
    drawLabel(ctx, `U = ${fmt(v.U, 2)} V`, x0 + 22, y1 + 39, { size: 9, mono: true, color: 'rgba(230,240,250,.6)' });

    drawLabel(ctx, `P = ${fmt(v.P, 2)} W`, x1 - 8, y0 + 22, { size: 9, mono: true, color: COLORS.amber, align: 'right' });
    ctx.restore();
  }

  function drawGraph(x, y, w, h) {
    if (w < 80 || h < 50) return;
    const v = values();
    const maxP = Math.max((emf * emf) / (4 * r), v.P, 0.1) * 1.15;
    const mapX = resistance => x + (resistance / 20) * w;
    const mapY = power => y + h - (power / maxP) * h;
    drawGrid(ctx, x, y, w, h, 4, 3, 'rgba(170, 202, 225, .09)');
    ctx.save();
    ctx.strokeStyle = 'rgba(184, 207, 228, .28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.stroke();
    ctx.restore();

    const curve = [];
    for (let resistance = 0.2; resistance <= 20; resistance += 0.1) {
      curve.push([mapX(resistance), mapY((emf * emf * resistance) / (resistance + r) ** 2)]);
    }
    ctx.save();
    ctx.strokeStyle = 'rgba(245, 184, 90, .8)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    curve.forEach(([px, py], index) => index ? ctx.lineTo(px, py) : ctx.moveTo(px, py));
    ctx.stroke();
    ctx.restore();

    const rx = mapX(Math.min(r, 20));
    ctx.save();
    ctx.strokeStyle = 'rgba(114, 227, 209, .35)';
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(rx, y);
    ctx.lineTo(rx, y + h);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    drawLabel(ctx, 'R = r', rx + 4, y + 10, { size: 7.5, mono: true, color: 'rgba(114,227,209,.5)' });

    const px = mapX(R);
    const py = mapY(v.P);
    ctx.save();
    ctx.fillStyle = COLORS.teal;
    ctx.beginPath();
    ctx.arc(px, py, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(114, 227, 209, .25)';
    ctx.beginPath();
    ctx.arc(px, py, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    drawLabel(ctx, 'P / W', x - 4, y + 3, { align: 'right', size: 8, mono: true });
    drawLabel(ctx, 'R / Ω', x + w, y + h + 14, { align: 'right', size: 8, mono: true });
    drawLabel(ctx, '输出功率随外电阻变化', x + w, y + 14, { align: 'right', size: 7.5, mono: true, color: 'rgba(245,184,90,.55)' });
  }

  update();
  const stop = startLoop(dt => {
    if (!playing) return;
    phase += dt;
    draw();
  });

  return () => {
    stop();
    view.dispose();
  };
}
