import { icon } from '../icons.js';
import {
  COLORS, clamp, fmt, prepareCanvas, startLoop, bindRange, setFill, readout, setReading,
  drawArrow, drawLabel, roundRect,
} from './base.js';

export function mountCollision(container, api) {
  container.innerHTML = `
    <div class="sim-card">
      <div class="sim-stage">
        <div class="stage-label">AIR TRACK · 1D COLLISION</div>
        <div class="stage-tools">
          <button class="stage-tool" type="button" data-reset title="重置">${icon('reset')}</button>
        </div>
        <canvas></canvas>
      </div>
      <div class="sim-controls">
        <div class="sim-controls-head">
          <b>COLLISION CONTROL</b>
          <div class="sim-playbar">
            <button class="sim-btn primary" type="button" data-play>${icon('pause')}<span>暂停</span></button>
            <button class="sim-btn" type="button" data-record>${icon('record')}记录</button>
          </div>
        </div>
        <div class="control-grid">
          <div class="sim-control">
            <label for="range-cm1">质量 m₁<b><span data-out="m1">2.0 kg</span></b></label>
            <input id="range-cm1" type="range" data-param="m1" data-suffix=" kg" data-decimals="1" min="0.5" max="5" step="0.5" value="2">
          </div>
          <div class="sim-control">
            <label for="range-cm2">质量 m₂<b><span data-out="m2">1.0 kg</span></b></label>
            <input id="range-cm2" type="range" data-param="m2" data-suffix=" kg" data-decimals="1" min="0.5" max="5" step="0.5" value="1">
          </div>
          <div class="sim-control">
            <label for="range-cv1">碰前 v₁<b><span data-out="v1">3.0 m/s</span></b></label>
            <input id="range-cv1" type="range" data-param="v1" data-suffix=" m/s" data-decimals="1" min="0" max="5" step="0.5" value="3">
          </div>
          <div class="sim-control">
            <label for="range-cv2">碰前 v₂<b><span data-out="v2">0.0 m/s</span></b></label>
            <input id="range-cv2" type="range" data-param="v2" data-suffix=" m/s" data-decimals="1" min="-2" max="2" step="0.5" value="0">
          </div>
          <div class="sim-control">
            <label for="range-ce">恢复系数 e<b><span data-out="e">1.0</span></b></label>
            <input id="range-ce" type="range" data-param="e" data-suffix="" data-decimals="1" min="0" max="1" step="0.1" value="1">
          </div>
          <div class="sim-control">
            <label>碰撞类型</label>
            <div style="font-size:9.5px;color:var(--muted);padding:7px 0" data-type>完全弹性碰撞</div>
          </div>
        </div>
      </div>
      <div class="sim-readouts">
        ${readout('碰后 v₁′', 'v1p', 'm/s')}
        ${readout('碰后 v₂′', 'v2p', 'm/s')}
        ${readout('系统总动量', 'p', 'kg·m/s')}
        ${readout('动能损失', 'loss', 'J')}
      </div>
      <div class="sim-note" data-note>${icon('light')}<span>先保持 e = 1，比较碰撞前后的动量与动能。</span></div>
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
  const typeEl = root.querySelector('[data-type]');

  let m1 = 2;
  let m2 = 1;
  let v1 = 3;
  let v2 = 0;
  let e = 1;
  let playing = true;
  let sim = makeSim();
  let flash = 0;

  bindRange(root, 'm1', value => `${fmt(value, 1)} kg`, value => { m1 = value; reset(); });
  bindRange(root, 'm2', value => `${fmt(value, 1)} kg`, value => { m2 = value; reset(); });
  bindRange(root, 'v1', value => `${fmt(value, 1)} m/s`, value => { v1 = value; reset(); });
  bindRange(root, 'v2', value => `${fmt(value, 1)} m/s`, value => { v2 = value; reset(); });
  bindRange(root, 'e', value => `${fmt(value, 1)}`, value => { e = value; reset(); });
  ['m1', 'm2', 'v1', 'v2', 'e'].forEach(key => {
    const input = root.querySelector(`input[data-param="${key}"]`);
    if (input) setFill(input);
  });

  function theory() {
    const collides = v1 > v2;
    const denominator = m1 + m2;
    const v1p = ((m1 - e * m2) * v1 + (1 + e) * m2 * v2) / denominator;
    const v2p = ((m2 - e * m1) * v2 + (1 + e) * m1 * v1) / denominator;
    const p = m1 * v1 + m2 * v2;
    const ek0 = 0.5 * m1 * v1 * v1 + 0.5 * m2 * v2 * v2;
    const ek1 = 0.5 * m1 * v1p * v1p + 0.5 * m2 * v2p * v2p;
    return { collides, v1p, v2p, p, loss: Math.max(0, ek0 - ek1), ek0 };
  }

  function makeSim() {
    return { x1: 2.2, x2: 7.6, v1, v2, collided: false, ended: false };
  }

  function reset() {
    sim = makeSim();
    flash = 0;
    playing = false;
    updatePlayButton();
    update();
  }

  function updatePlayButton() {
    playButton.innerHTML = playing ? `${icon('pause')}<span>暂停</span>` : `${icon('play')}<span>开始</span>`;
  }

  playButton.addEventListener('click', () => {
    if (sim.ended) sim = makeSim();
    playing = !playing;
    updatePlayButton();
  });

  resetButton.addEventListener('click', reset);
  recordButton.addEventListener('click', () => {
    const result = theory();
    api.record({
      'm₁ / kg': fmt(m1, 1),
      'm₂ / kg': fmt(m2, 1),
      'v₁ / m·s⁻¹': fmt(v1, 1),
      'v₂ / m·s⁻¹': fmt(v2, 1),
      'e': fmt(e, 1),
      'v₁′ / m·s⁻¹': fmt(result.v1p, 2),
      'v₂′ / m·s⁻¹': fmt(result.v2p, 2),
    });
  });

  function update() {
    const result = theory();
    if (!result.collides) {
      setReading(root, 'v1p', '—');
      setReading(root, 'v2p', '—');
    } else {
      setReading(root, 'v1p', fmt(result.v1p, 2));
      setReading(root, 'v2p', fmt(result.v2p, 2));
    }
    setReading(root, 'p', fmt(result.p, 2));
    setReading(root, 'loss', result.collides ? fmt(result.loss, 2) : '0');

    let type = '完全弹性碰撞';
    if (!result.collides) type = '不会碰撞';
    else if (e <= 0.001) type = '完全非弹性碰撞';
    else if (e < 0.999) type = '非弹性碰撞';
    typeEl.textContent = type;

    let hint = '';
    if (!result.collides) {
      hint = 'v₁ ≤ v₂，两车不会追上。增大 v₁ 或减小 v₂ 再试。';
    } else if (e === 1) {
      hint = 'e = 1：动量守恒，动能也守恒。碰后两车交换了一部分速度。';
    } else if (e === 0) {
      hint = 'e = 0：碰后两车共速，动能损失最大，但总动量仍然守恒。';
    } else {
      hint = '0 < e < 1：动量守恒，部分动能转化为内能。e 越小，能量损失越多。';
    }
    noteEl.innerHTML = `${icon(e === 1 ? 'check-circle' : 'light')}<span>${hint}</span>`;
    draw();
  }

  function draw() {
    const w = size.w;
    const h = size.h;
    ctx.clearRect(0, 0, w, h);
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, 'rgba(20, 43, 66, .3)');
    gradient.addColorStop(1, 'rgba(7, 17, 29, .05)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    const trackY = h * 0.56;
    const left = 36;
    const right = w - 34;
    const scale = (right - left) / 10;
    const mapX = x => left + x * scale;
    const r1 = 0.3 + m1 * 0.035;
    const r2 = 0.3 + m2 * 0.035;

    ctx.save();
    ctx.strokeStyle = 'rgba(184, 207, 228, .26)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, trackY);
    ctx.lineTo(right, trackY);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(184, 207, 228, .14)';
    for (let i = 0; i <= 10; i += 1) {
      const px = mapX(i);
      ctx.beginPath();
      ctx.moveTo(px, trackY - 4);
      ctx.lineTo(px, trackY + 10);
      ctx.stroke();
    }
    for (let i = 0; i <= 10; i += 2) {
      drawLabel(ctx, `${i} m`, mapX(i), trackY + 25, { align: 'center', size: 7.5, mono: true });
    }
    ctx.restore();

    drawCart(mapX(sim.x1), trackY, r1 * scale, m1, COLORS.amber, sim.v1, 'm₁');
    drawCart(mapX(sim.x2), trackY, r2 * scale, m2, COLORS.teal, sim.v2, 'm₂');

    if (flash > 0) {
      const contactX = (mapX(sim.x1) + mapX(sim.x2)) / 2;
      ctx.save();
      ctx.strokeStyle = `rgba(255, 248, 220, ${flash * 0.7})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(contactX, trackY - 20, 18 + (1 - flash) * 30, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const result = theory();
    drawLabel(ctx, '碰撞前后', 30, 30, { size: 8, mono: true, color: 'rgba(184,207,228,.45)' });
    drawLabel(ctx, `e = ${fmt(e, 1)}`, w - 32, 58, { align: 'right', size: 9, mono: true, color: COLORS.amber });
    drawLabel(ctx, `p = ${fmt(result.p, 2)} kg·m/s`, w - 32, 74, { align: 'right', size: 8, mono: true, color: 'rgba(230,240,250,.52)' });
    if (!sim.collided) {
      drawLabel(ctx, '碰撞前', left, trackY - 86, { size: 8, color: 'rgba(184,207,228,.45)' });
    } else {
      drawLabel(ctx, '碰撞后', left, trackY - 86, { size: 8, color: 'rgba(114,227,209,.55)' });
    }
  }

  function drawCart(x, trackY, halfWidth, mass, color, velocity, label) {
    const width = clamp(halfWidth * 2, 38, 78);
    const height = 32 + mass * 2.2;
    const y = trackY - height - 4;
    ctx.save();
    ctx.shadowColor = color === COLORS.amber ? 'rgba(245,184,90,.28)' : 'rgba(114,227,209,.28)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = color;
    roundRect(ctx, x - width / 2, y, width, height, 6);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,.3)';
    ctx.lineWidth = 1;
    roundRect(ctx, x - width / 2, y, width, height, 6);
    ctx.stroke();
    ctx.fillStyle = 'rgba(8,20,33,.8)';
    ctx.beginPath();
    ctx.arc(x - width * 0.24, trackY + 1, 4, 0, Math.PI * 2);
    ctx.arc(x + width * 0.24, trackY + 1, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    drawLabel(ctx, label, x, y + height / 2 + 4, { align: 'center', size: 10, mono: true, color: 'rgba(8,20,33,.82)' });

    if (Math.abs(velocity) > 0.05) {
      const len = clamp(Math.abs(velocity) * 22, 14, 65);
      const arrowY = y - 16;
      drawArrow(ctx, x, arrowY, x + Math.sign(velocity) * len, arrowY, color, 1.4);
      drawLabel(ctx, `${fmt(velocity, 1)} m/s`, x + Math.sign(velocity) * (len + 6), arrowY - 5, {
        align: Math.sign(velocity) > 0 ? 'left' : 'right', size: 8, color,
      });
    }
  }

  update();
  const stop = startLoop(dt => {
    if (flash > 0) flash = Math.max(0, flash - dt * 1.8);
    if (!playing) {
      draw();
      return;
    }
    const r1 = 0.3 + m1 * 0.035;
    const r2 = 0.3 + m2 * 0.035;
    sim.x1 += sim.v1 * dt;
    sim.x2 += sim.v2 * dt;
    if (!sim.collided && sim.v1 > sim.v2 && sim.x2 - sim.x1 <= r1 + r2) {
      sim.x2 = sim.x1 + r1 + r2;
      const result = theory();
      sim.collided = true;
      sim.v1 = result.v1p;
      sim.v2 = result.v2p;
      flash = 1;
    }
    if (sim.x1 > 10.6 || sim.x2 > 10.6 || sim.x1 < -0.6 || sim.x2 < -0.6) {
      sim.ended = true;
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
