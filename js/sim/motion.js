import { icon } from '../icons.js';
import {
  COLORS, clamp, fmt, prepareCanvas, startLoop, bindRange, setFill, readout, setReading,
  drawGrid, drawArrow, roundRect, drawLabel,
} from './base.js';

export function mountMotion(container, api) {
  container.innerHTML = `
    <div class="sim-card">
      <div class="sim-stage">
        <div class="stage-label">TRACK · V-T / X-T</div>
        <div class="stage-tools">
          <button class="stage-tool" type="button" data-reset title="重置实验">${icon('reset')}</button>
        </div>
        <canvas></canvas>
      </div>
      <div class="sim-controls">
        <div class="sim-controls-head">
          <b>KINEMATICS CONTROL</b>
          <div class="sim-playbar">
            <button class="sim-btn primary" type="button" data-play>${icon('pause')}<span>暂停</span></button>
            <button class="sim-btn" type="button" data-record>${icon('record')}记录</button>
            <select class="sim-speed" data-speed aria-label="播放速度">
              <option value="0.5">0.5×</option>
              <option value="1" selected>1×</option>
              <option value="2">2×</option>
            </select>
          </div>
        </div>
        <div class="control-grid">
          <div class="sim-control">
            <label for="range-v0">初速度 v₀<b><span data-out="v0">6 m/s</span></b></label>
            <input id="range-v0" type="range" data-param="v0" data-suffix=" m/s" data-decimals="1" min="0" max="15" step="0.5" value="6">
          </div>
          <div class="sim-control">
            <label for="range-a">加速度 a<b><span data-out="a">1 m/s²</span></b></label>
            <input id="range-a" type="range" data-param="a" data-suffix=" m/s²" data-decimals="1" min="-6" max="6" step="0.5" value="1">
          </div>
          <div class="sim-control">
            <label for="graphType">图像显示</label>
            <select id="graphType" data-graph>
              <option value="v" selected>v–t 图像</option>
              <option value="x">x–t 图像</option>
            </select>
          </div>
        </div>
      </div>
      <div class="sim-readouts">
        ${readout('时间 t', 't', 's')}
        ${readout('速度 v', 'v', 'm/s')}
        ${readout('位移 x', 'x', 'm')}
        ${readout('加速度 a', 'a', 'm/s²')}
      </div>
      <div class="sim-note" data-note>${icon('light')}<span>调节 v₀ 或 a 后按播放。先观察加速，再试着让小车在 4 s 时恰好停下。</span></div>
    </div>
  `;

  const root = container.querySelector('.sim-card');
  const stage = root.querySelector('.sim-stage');
  const canvasView = prepareCanvas(stage);
  const { ctx, size } = canvasView;
  const playButton = root.querySelector('[data-play]');
  const recordButton = root.querySelector('[data-record]');
  const resetButton = root.querySelector('[data-reset]');
  const graphSelect = root.querySelector('[data-graph]');
  const speedSelect = root.querySelector('[data-speed]');
  const noteEl = root.querySelector('[data-note]');

  let v0 = 6;
  let a = 1;
  let t = 0;
  let playing = true;
  let speed = 1;
  let graphType = 'v';
  let challengeDone = false;

  const TMAX = 10;
  const xAt = time => v0 * time + 0.5 * a * time * time;
  const vAt = time => v0 + a * time;

  bindRange(root, 'v0', value => `${fmt(value, 1)} m/s`, value => {
    v0 = value;
    resetTime(false);
    update();
  });
  bindRange(root, 'a', value => `${value < 0 ? '−' : ''}${fmt(Math.abs(value), 1)} m/s²`, value => {
    a = value;
    resetTime(false);
    update();
  });
  setFill(root.querySelector('input[data-param="v0"]'));
  setFill(root.querySelector('input[data-param="a"]'));

  graphSelect.addEventListener('change', () => {
    graphType = graphSelect.value;
  });
  speedSelect.addEventListener('change', () => {
    speed = Number(speedSelect.value);
  });

  function resetTime(keepPlaying = false) {
    t = 0;
    playing = keepPlaying;
    updatePlayButton();
  }

  function updatePlayButton() {
    playButton.innerHTML = playing ? `${icon('pause')}<span>暂停</span>` : `${icon('play')}<span>开始</span>`;
  }

  playButton.addEventListener('click', () => {
    if (t >= TMAX - 0.01) t = 0;
    playing = !playing;
    updatePlayButton();
  });

  resetButton.addEventListener('click', () => {
    resetTime(false);
    update();
  });

  recordButton.addEventListener('click', () => {
    api.record({
      't / s': fmt(t, 2),
      'v / m·s⁻¹': fmt(vAt(t), 2),
      'x / m': fmt(xAt(t), 2),
      'a / m·s⁻²': fmt(a, 1),
    });
  });

  function update() {
    setReading(root, 't', fmt(t, 2));
    setReading(root, 'v', fmt(vAt(t), 2));
    setReading(root, 'x', fmt(xAt(t), 2));
    setReading(root, 'a', fmt(a, 1));

    const stopTime = a !== 0 ? -v0 / a : Infinity;
    const stopsAt4 = Math.abs(vAt(4)) < 0.06 && stopTime > 0;
    if (stopsAt4 && !challengeDone) {
      challengeDone = true;
      api.toast('挑战达成：小车在 4 s 时恰好停下');
    }
    let hint = '';
    if (graphType === 'v') {
      hint = 'v–t 图像的斜率是加速度，图线与时间轴围成的面积是位移。';
    } else {
      hint = 'x–t 图像的斜率是速度。图线弯曲说明速度在变化，不是运动轨迹。';
    }
    if (stopsAt4) hint = '很好：v₀ + a×4 = 0，此时小车在 4 s 末恰好停下。';
    noteEl.innerHTML = `${icon(stopsAt4 ? 'check-circle' : 'light')}<span>${hint}</span>`;
    draw();
  }

  function draw() {
    const w = size.w;
    const h = size.h;
    ctx.clearRect(0, 0, w, h);
    drawBackground(w, h);
    drawTrack(w, h);
    drawGraph(w, h);
  }

  function drawBackground(w, h) {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(18, 43, 67, .25)');
    grad.addColorStop(1, 'rgba(6, 17, 29, .1)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    drawGrid(ctx, 30, 30, w - 60, h * 0.46, 8, 3, 'rgba(170, 202, 225, .055)');
  }

  function drawTrack(w, h) {
    const trackY = Math.max(118, h * 0.29);
    const left = 48;
    const right = w - 38;
    let xmin = 0;
    let xmax = 0;
    for (let time = 0; time <= TMAX; time += 0.25) {
      const x = xAt(time);
      xmin = Math.min(xmin, x);
      xmax = Math.max(xmax, x);
    }
    if (xmax - xmin < 1) xmax = xmin + 1;
    const pad = (xmax - xmin) * 0.08;
    xmin -= pad;
    xmax += pad;
    const mapX = x => left + ((x - xmin) / (xmax - xmin)) * (right - left);

    ctx.save();
    ctx.strokeStyle = 'rgba(184, 207, 228, .22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, trackY);
    ctx.lineTo(right, trackY);
    ctx.stroke();

    for (let i = 0; i <= 4; i += 1) {
      const x = xmin + ((xmax - xmin) / 4) * i;
      const px = mapX(x);
      ctx.strokeStyle = 'rgba(184, 207, 228, .12)';
      ctx.beginPath();
      ctx.moveTo(px, trackY - 6);
      ctx.lineTo(px, trackY + 12);
      ctx.stroke();
      drawLabel(ctx, `${fmt(x, 0)} m`, px, trackY + 26, { align: 'center', size: 8, mono: true, color: 'rgba(184,207,228,.36)' });
    }

    const startX = mapX(0);
    ctx.strokeStyle = 'rgba(245, 184, 90, .32)';
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(startX, trackY - 52);
    ctx.lineTo(startX, trackY + 2);
    ctx.stroke();
    ctx.setLineDash([]);
    drawLabel(ctx, '起点', startX, trackY - 58, { align: 'center', size: 8, color: 'rgba(245,184,90,.5)' });

    const carX = mapX(xAt(t));
    drawCar(carX, trackY, w);
    const v = vAt(t);
    if (Math.abs(v) > 0.15) {
      const dir = Math.sign(v);
      const len = clamp(Math.abs(v) * 4.2, 18, 92);
      drawArrow(ctx, carX, trackY - 35, carX + dir * len, trackY - 35, COLORS.teal, 1.6);
      drawLabel(ctx, `v = ${fmt(v, 2)} m/s`, carX + dir * (len + 8), trackY - 38, {
        align: dir > 0 ? 'left' : 'right', size: 9, color: COLORS.teal,
      });
    }
    if (Math.abs(a) > 0.05) {
      drawArrow(ctx, carX, trackY - 17, carX + Math.sign(a) * Math.min(60, 20 + Math.abs(a) * 5), trackY - 17, COLORS.blue, 1.2);
      drawLabel(ctx, `a = ${fmt(a, 1)} m/s²`, carX + Math.sign(a) * 70, trackY - 14, {
        align: Math.sign(a) > 0 ? 'left' : 'right', size: 8, color: COLORS.blue,
      });
    }
    drawLabel(ctx, `t = ${fmt(t, 2)} s`, 34, trackY - 66, { size: 9, mono: true, color: 'rgba(230,240,250,.6)' });
    ctx.restore();
  }

  function drawCar(x, trackY, w) {
    const bodyW = 38;
    const bodyH = 16;
    const y = trackY - bodyH - 4;
    ctx.save();
    ctx.shadowColor = 'rgba(245, 184, 90, .3)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = COLORS.amber;
    roundRect(ctx, x - bodyW / 2, y, bodyW, bodyH, 4);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(8, 20, 33, .85)';
    ctx.beginPath();
    ctx.arc(x - 11, y + bodyH + 1, 3.6, 0, Math.PI * 2);
    ctx.arc(x + 11, y + bodyH + 1, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(245, 184, 90, .55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x - 11, y + bodyH + 1, 5, 0, Math.PI * 2);
    ctx.arc(x + 11, y + bodyH + 1, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawGraph(w, h) {
    const x = 54;
    const y = h * 0.52;
    const gw = w - 82;
    const gh = h - y - 32;
    if (gw < 60 || gh < 50) return;
    drawGrid(ctx, x, y, gw, gh, 6, 4, 'rgba(170, 202, 225, .09)');

    const values = [];
    for (let time = 0; time <= TMAX; time += 0.1) {
      values.push(graphType === 'v' ? vAt(time) : xAt(time));
    }
    let min = Math.min(0, ...values);
    let max = Math.max(0, ...values);
    if (max - min < 0.001) max = min + 1;
    const pad = (max - min) * 0.12;
    min -= pad;
    max += pad;
    const mapY = value => y + gh - ((value - min) / (max - min)) * gh;
    const mapX = time => x + (time / TMAX) * gw;

    const zeroY = mapY(0);
    if (zeroY >= y && zeroY <= y + gh) {
      ctx.strokeStyle = 'rgba(184, 207, 228, .28)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, zeroY);
      ctx.lineTo(x + gw, zeroY);
      ctx.stroke();
    }
    drawLabel(ctx, graphType === 'v' ? 'v / m·s⁻¹' : 'x / m', x - 7, y + 3, { align: 'right', size: 8, mono: true });
    drawLabel(ctx, 't / s', x + gw + 7, y + gh + 3, { align: 'right', size: 8, mono: true });

    const fullPath = (ctx2, endT, dashed) => {
      ctx2.save();
      ctx2.strokeStyle = dashed ? 'rgba(114, 227, 209, .25)' : COLORS.teal;
      ctx2.lineWidth = dashed ? 1 : 1.8;
      if (dashed) ctx2.setLineDash([4, 5]);
      ctx2.beginPath();
      for (let time = 0; time <= endT + 0.001; time += 0.05) {
        const px = mapX(time);
        const py = mapY(graphType === 'v' ? vAt(time) : xAt(time));
        if (time === 0) ctx2.moveTo(px, py);
        else ctx2.lineTo(px, py);
      }
      ctx2.stroke();
      ctx2.restore();
    };

    if (graphType === 'v') {
      ctx.save();
      ctx.fillStyle = 'rgba(114, 227, 209, .08)';
      ctx.beginPath();
      ctx.moveTo(mapX(0), zeroY);
      for (let time = 0; time <= t + 0.001; time += 0.05) {
        ctx.lineTo(mapX(time), mapY(vAt(time)));
      }
      ctx.lineTo(mapX(t), zeroY);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    fullPath(ctx, TMAX, true);

    const actualEnd = Math.max(0.001, Math.min(t, TMAX));
    ctx.save();
    ctx.strokeStyle = COLORS.teal;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let time = 0; time <= actualEnd + 0.001; time += 0.02) {
      const px = mapX(time);
      const py = mapY(graphType === 'v' ? vAt(time) : xAt(time));
      if (time === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();

    const currentValue = graphType === 'v' ? vAt(t) : xAt(t);
    const px = mapX(t);
    const py = mapY(currentValue);
    ctx.save();
    ctx.strokeStyle = 'rgba(245, 184, 90, .35)';
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px, y + gh);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.amber;
    ctx.beginPath();
    ctx.arc(px, py, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    drawLabel(ctx, graphType === 'v' ? 'v–t 图像' : 'x–t 图像', x + gw - 4, y + 12, {
      align: 'right', size: 8, mono: true, color: 'rgba(245,184,90,.55)',
    });
    drawLabel(ctx, fmt(max, 1), x - 7, y + 8, { align: 'right', size: 7, mono: true });
    drawLabel(ctx, fmt(min, 1), x - 7, y + gh, { align: 'right', size: 7, mono: true });
  }

  update();
  const stop = startLoop(dt => {
    if (playing) {
      t += dt * speed;
      if (t >= TMAX) {
        t = TMAX;
        playing = false;
        updatePlayButton();
      }
      update();
    }
  });

  return () => {
    stop();
    canvasView.dispose();
  };
}
