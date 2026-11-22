import { icon } from '../icons.js';
import {
  COLORS, clamp, fmt, prepareCanvas, startLoop, bindRange, setFill, readout, setReading,
  drawGrid, drawArrow, drawLabel, roundRect,
} from './base.js';

const HC = 1240;

export function mountPhotoelectric(container, api) {
  container.innerHTML = `
    <div class="sim-card">
      <div class="sim-stage">
        <div class="stage-label">PHOTOELECTRIC EFFECT · I–V</div>
        <div class="stage-tools">
          <button class="stage-tool" type="button" data-reset title="重置">${icon('reset')}</button>
        </div>
        <canvas></canvas>
      </div>
      <div class="sim-controls">
        <div class="sim-controls-head">
          <b>PHOTON CONTROL</b>
          <div class="sim-playbar">
            <button class="sim-btn primary" type="button" data-play>${icon('pause')}<span>暂停</span></button>
            <button class="sim-btn" type="button" data-record>${icon('record')}记录</button>
          </div>
        </div>
        <div class="control-grid">
          <div class="sim-control">
            <label for="range-wl">入射波长 λ<b><span data-out="wl">400 nm</span></b></label>
            <input id="range-wl" type="range" data-param="wl" data-suffix=" nm" data-decimals="0" min="200" max="700" step="5" value="400">
          </div>
          <div class="sim-control">
            <label for="range-w0">逸出功 W₀<b><span data-out="w0">2.2 eV</span></b></label>
            <input id="range-w0" type="range" data-param="w0" data-suffix=" eV" data-decimals="1" min="1.5" max="4.5" step="0.1" value="2.2">
          </div>
          <div class="sim-control">
            <label for="range-int">光强<b><span data-out="intensity">60%</span></b></label>
            <input id="range-int" type="range" data-param="intensity" data-suffix="%" data-decimals="0" min="10" max="100" step="5" value="60">
          </div>
          <div class="sim-control">
            <label for="range-volt">电压 U<b><span data-out="voltage">0.0 V</span></b></label>
            <input id="range-volt" type="range" data-param="voltage" data-suffix=" V" data-decimals="1" min="-5" max="5" step="0.1" value="0">
          </div>
        </div>
      </div>
      <div class="sim-readouts">
        ${readout('光子能量 hν', 'energy', 'eV')}
        ${readout('最大初动能', 'ekmax', 'eV')}
        ${readout('遏止电压 Uc', 'uc', 'V')}
        ${readout('光电流', 'current', 'a.u.')}
      </div>
      <div class="sim-note" data-note>${icon('light')}<span>固定频率，只改变光强，观察饱和光电流如何变化。</span></div>
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

  let wavelength = 400;
  let w0 = 2.2;
  let intensity = 60;
  let voltage = 0;
  let playing = true;
  let photons = [];
  let electrons = [];
  let spawnTimer = 0;

  bindRange(root, 'wl', value => `${fmt(value, 0)} nm`, value => { wavelength = value; onParamChange(); });
  bindRange(root, 'w0', value => `${fmt(value, 1)} eV`, value => { w0 = value; onParamChange(); });
  bindRange(root, 'intensity', value => `${fmt(value, 0)}%`, value => { intensity = value; onParamChange(); });
  bindRange(root, 'voltage', value => `${fmt(value, 1)} V`, value => { voltage = value; update(); });
  ['wl', 'w0', 'intensity', 'voltage'].forEach(key => {
    const input = root.querySelector(`input[data-param="${key}"]`);
    if (input) setFill(input);
  });

  function physics() {
    const energy = HC / wavelength;
    const emitted = energy > w0 + 1e-9;
    const ekmax = Math.max(0, energy - w0);
    const uc = ekmax;
    let current = 0;
    if (emitted && voltage > -uc - 1e-9) {
      current = (intensity / 100) * clamp(1 + voltage / Math.max(uc, 0.0001), 0, 1);
    }
    return { energy, emitted, ekmax, uc, current };
  }

  function onParamChange() {
    resetParticles();
    update();
  }

  function resetParticles() {
    photons = [];
    electrons = [];
    spawnTimer = 0;
    const count = Math.max(4, Math.round(intensity / 7));
    for (let i = 0; i < count; i += 1) {
      photons.push({
        x: Math.random(),
        y: 0.2 + Math.random() * 0.6,
        speed: 0.1 + Math.random() * 0.12,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  function updatePlayButton() {
    playButton.innerHTML = playing ? `${icon('pause')}<span>暂停</span>` : `${icon('play')}<span>继续</span>`;
  }

  playButton.addEventListener('click', () => {
    playing = !playing;
    updatePlayButton();
  });
  resetButton.addEventListener('click', () => {
    wavelength = 400;
    w0 = 2.2;
    intensity = 60;
    voltage = 0;
    const values = { wl: 400, w0: 2.2, intensity: 60, voltage: 0 };
    Object.entries(values).forEach(([key, value]) => {
      const input = root.querySelector(`input[data-param="${key}"]`);
      if (input) {
        input.value = value;
        setFill(input);
      }
    });
    root.querySelector('[data-out="wl"]').textContent = '400 nm';
    root.querySelector('[data-out="w0"]').textContent = '2.2 eV';
    root.querySelector('[data-out="intensity"]').textContent = '60%';
    root.querySelector('[data-out="voltage"]').textContent = '0.0 V';
    resetParticles();
    playing = false;
    updatePlayButton();
    update();
  });
  recordButton.addEventListener('click', () => {
    const p = physics();
    api.record({
      'λ / nm': fmt(wavelength, 0),
      'W₀ / eV': fmt(w0, 1),
      'hν / eV': fmt(p.energy, 2),
      'Ekmax / eV': fmt(p.ekmax, 2),
      'Uc / V': fmt(p.uc, 2),
    });
  });

  function update() {
    const p = physics();
    setReading(root, 'energy', fmt(p.energy, 2));
    setReading(root, 'ekmax', p.emitted ? fmt(p.ekmax, 2) : '0');
    setReading(root, 'uc', p.emitted ? fmt(p.uc, 2) : '—');
    setReading(root, 'current', fmt(p.current, 2));

    let hint = '';
    if (!p.emitted) {
      hint = `hν = ${fmt(p.energy, 2)} eV < W₀ = ${fmt(w0, 1)} eV，无论光多强都不能发生光电效应。`;
    } else if (voltage <= -p.uc) {
      hint = `反向电压已达到遏止电压 ${fmt(p.uc, 2)} V，光电流为零。`;
    } else {
      hint = `最大初动能 = hν − W₀ = ${fmt(p.ekmax, 2)} eV。改变光强只改变光电子数目，不改变最大初动能。`;
    }
    noteEl.innerHTML = `${icon(p.emitted && voltage > -p.uc ? 'check-circle' : 'light')}<span>${hint}</span>`;
    draw();
  }

  function draw() {
    const w = size.w;
    const h = size.h;
    ctx.clearRect(0, 0, w, h);
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, 'rgba(18, 42, 65, .3)');
    gradient.addColorStop(1, 'rgba(7, 17, 29, .06)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    const tubeH = h * 0.56;
    const tubeY = 24;
    const p = physics();
    drawTube(w, h, tubeY, tubeH, p);
    drawGraph(w, h, h * 0.66);
  }

  function colorForWavelength() {
    const hue = clamp(((700 - wavelength) / 300) * 280, 0, 280);
    return `hsl(${hue}, 85%, 66%)`;
  }

  function drawTube(w, h, y, tubeHeight, p) {
    const tubeX = 28;
    const tubeW = w - 56;
    ctx.save();
    ctx.strokeStyle = 'rgba(184, 207, 228, .2)';
    ctx.lineWidth = 1;
    roundRect(ctx, tubeX, y, tubeW, tubeHeight, 14);
    ctx.stroke();
    drawLabel(ctx, '真空管', tubeX + 14, y + 18, { size: 7.5, mono: true, color: 'rgba(184,207,228,.35)' });

    const cathodeX = tubeX + tubeW * 0.42;
    const anodeX = tubeX + tubeW * 0.74;
    const plateTop = y + tubeHeight * 0.24;
    const plateBottom = y + tubeHeight * 0.82;
    const color = colorForWavelength();

    const lampX = tubeX + 22;
    const lampY = y + tubeHeight * 0.5;
    const glow = ctx.createRadialGradient(lampX, lampY, 2, lampX, lampY, 34);
    glow.addColorStop(0, color);
    glow.addColorStop(0.25, color.replace('66%', '55%'));
    glow.addColorStop(1, 'transparent');
    ctx.globalAlpha = 0.25 + intensity / 220;
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(lampX, lampY, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    roundRect(ctx, lampX - 8, lampY - 14, 16, 28, 5);
    ctx.fill();
    drawLabel(ctx, '光源', lampX, lampY + 28, { align: 'center', size: 7.5, color: 'rgba(184,207,228,.5)' });

    ctx.fillStyle = 'rgba(184, 207, 228, .2)';
    ctx.fillRect(cathodeX - 4, plateTop, 8, plateBottom - plateTop);
    ctx.fillRect(anodeX - 4, plateTop, 8, plateBottom - plateTop);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.35 + intensity / 180;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cathodeX - 3, plateTop);
    ctx.lineTo(cathodeX - 3, plateBottom);
    ctx.stroke();
    ctx.globalAlpha = 1;
    drawLabel(ctx, '阴极 K', cathodeX, plateTop - 9, { align: 'center', size: 7.5, color: 'rgba(184,207,228,.55)' });
    drawLabel(ctx, '阳极 A', anodeX, plateTop - 9, { align: 'center', size: 7.5, color: 'rgba(184,207,228,.55)' });

    photons.forEach(photon => {
      const px = lampX + 18 + photon.x * (cathodeX - lampX - 26);
      const py = y + tubeHeight * 0.18 + photon.y * tubeHeight * 0.64;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.35 + intensity / 220;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i < 4; i += 1) {
        const dx = i * 4;
        const yy = py + Math.sin(photon.phase + i * 1.2) * 2.2;
        if (i === 0) ctx.moveTo(px + dx, yy);
        else ctx.lineTo(px + dx, yy);
      }
      ctx.stroke();
      ctx.restore();
    });

    electrons.forEach(electron => {
      const px = cathodeX + electron.x * (anodeX - cathodeX);
      const py = y + tubeHeight * 0.25 + electron.y * tubeHeight * 0.55;
      ctx.save();
      ctx.fillStyle = COLORS.teal;
      ctx.shadowColor = 'rgba(114, 227, 209, .6)';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(px, py, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    ctx.save();
    ctx.strokeStyle = 'rgba(245, 184, 90, .5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cathodeX, plateBottom + 12);
    ctx.lineTo(cathodeX, y + tubeHeight - 8);
    ctx.lineTo(anodeX, y + tubeHeight - 8);
    ctx.lineTo(anodeX, plateBottom + 12);
    ctx.stroke();
    ctx.restore();
    drawLabel(ctx, `U = ${fmt(voltage, 1)} V`, (cathodeX + anodeX) / 2, y + tubeHeight - 14, {
      align: 'center', size: 8, mono: true, color: 'rgba(245,184,90,.7)',
    });

    if (!p.emitted) {
      drawLabel(ctx, '无光电子逸出', (cathodeX + anodeX) / 2, y + tubeHeight * 0.52, {
        align: 'center', size: 9, color: 'rgba(255,123,123,.75)',
      });
    } else if (voltage <= -p.uc) {
      drawLabel(ctx, '光电流被完全遏止', (cathodeX + anodeX) / 2, y + tubeHeight * 0.52, {
        align: 'center', size: 9, color: 'rgba(245,184,90,.75)',
      });
    }
  }

  function drawGraph(w, h, y) {
    const x = 56;
    const gw = w - 88;
    const gh = h - y - 26;
    if (gw < 80 || gh < 40) return;
    drawGrid(ctx, x, y, gw, gh, 5, 2, 'rgba(170, 202, 225, .08)');
    const mapX = v => x + ((v + 5) / 10) * gw;
    const mapY = i => y + gh - clamp(i, 0, 1) * gh;

    ctx.save();
    ctx.strokeStyle = 'rgba(184, 207, 228, .25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + gh);
    ctx.lineTo(x + gw, y + gh);
    ctx.stroke();
    ctx.restore();

    const p = physics();
    const points = [];
    for (let v = -5; v <= 5.001; v += 0.05) {
      let current = 0;
      if (p.emitted && v > -p.uc - 1e-9) {
        current = (intensity / 100) * clamp(1 + v / Math.max(p.uc, 0.0001), 0, 1);
      }
      points.push([mapX(v), mapY(current)]);
    }

    ctx.save();
    ctx.strokeStyle = COLORS.amber;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    points.forEach(([px, py], index) => index ? ctx.lineTo(px, py) : ctx.moveTo(px, py));
    ctx.stroke();
    ctx.restore();

    if (p.emitted && p.uc > 0) {
      const ux = mapX(-p.uc);
      ctx.save();
      ctx.strokeStyle = 'rgba(114, 227, 209, .3)';
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(ux, y);
      ctx.lineTo(ux, y + gh);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      drawLabel(ctx, `−Uc = ${fmt(-p.uc, 2)} V`, ux + 4, y + 10, { size: 7.5, mono: true, color: 'rgba(114,227,209,.55)' });
    }

    const mx = mapX(voltage);
    const my = mapY(p.current);
    ctx.save();
    ctx.fillStyle = COLORS.teal;
    ctx.beginPath();
    ctx.arc(mx, my, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(114, 227, 209, .3)';
    ctx.beginPath();
    ctx.arc(mx, my, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    drawLabel(ctx, 'I / a.u.', x - 5, y + 3, { align: 'right', size: 8, mono: true });
    drawLabel(ctx, 'U / V', x + gw, y + gh + 14, { align: 'right', size: 8, mono: true });
    drawLabel(ctx, 'I–V 特性曲线', x + gw, y + 12, { align: 'right', size: 7.5, mono: true, color: 'rgba(245,184,90,.55)' });
  }

  resetParticles();
  update();
  const stop = startLoop(dt => {
    if (playing) {
      const p = physics();
      photons.forEach(photon => {
        photon.x += photon.speed * dt * (0.7 + intensity / 140);
        photon.phase += dt * 4;
        if (photon.x > 1) {
          photon.x = 0;
          photon.y = 0.2 + Math.random() * 0.6;
        }
      });
      if (p.current > 0) {
        spawnTimer += dt;
        if (spawnTimer > 0.08) {
          spawnTimer = 0;
          electrons.push({
            x: 0,
            y: Math.random() * 0.9,
            speed: 0.35 + Math.random() * 0.3 + p.ekmax * 0.04,
          });
        }
      }
      electrons.forEach(electron => { electron.x += electron.speed * dt; });
      electrons = electrons.filter(electron => electron.x <= 1.05);
      if (electrons.length > 45) electrons = electrons.slice(-45);
      draw();
    }
  });

  return () => {
    stop();
    view.dispose();
  };
}
