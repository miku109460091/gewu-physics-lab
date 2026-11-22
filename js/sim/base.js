export const COLORS = {
  ink: '#e6f0fa',
  muted: 'rgba(184, 207, 228, .56)',
  faint: 'rgba(184, 207, 228, .28)',
  grid: 'rgba(170, 202, 225, .11)',
  gridStrong: 'rgba(170, 202, 225, .2)',
  teal: '#72e3d1',
  tealSoft: 'rgba(114, 227, 209, .16)',
  amber: '#f5b85a',
  amberSoft: 'rgba(245, 184, 90, .16)',
  blue: '#7aa2ff',
  blueSoft: 'rgba(122, 162, 255, .16)',
  coral: '#ff8a6a',
  red: '#ff7b7b',
  panel: 'rgba(255, 255, 255, .035)',
};

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function fmt(value, decimals = 2) {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) < 0.5 * 10 ** (-decimals)) value = 0;
  const fixed = value.toFixed(decimals);
  if (!fixed.includes('.')) return fixed;
  return fixed.replace(/0+$/, '').replace(/\.$/, '') || '0';
}

export function prepareCanvas(stage) {
  const canvas = stage.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const size = { w: 0, h: 0 };
  const resize = () => {
    const rect = stage.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    size.w = width;
    size.h = height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  resize();
  return { canvas, ctx, size, resize, dispose: () => observer.disconnect() };
}

export function startLoop(callback) {
  let raf = 0;
  let last = performance.now();
  let alive = true;
  const tick = now => {
    if (!alive) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    callback(dt, now);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    alive = false;
    cancelAnimationFrame(raf);
  };
}

export function setFill(input) {
  const min = Number(input.min);
  const max = Number(input.max);
  const value = Number(input.value);
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;
  input.style.setProperty('--fill', `${pct}%`);
}

export function bindRange(root, key, formatter, onChange) {
  const input = root.querySelector(`input[data-param="${key}"]`);
  const output = root.querySelector(`[data-out="${key}"]`);
  if (!input) return null;
  const sync = fire => {
    setFill(input);
    if (output) output.textContent = formatter(Number(input.value));
    if (fire && onChange) onChange(Number(input.value));
  };
  input.addEventListener('input', () => sync(true));
  sync(false);
  return input;
}

export function bindAllRanges(root, onChange) {
  root.querySelectorAll('input[type="range"]').forEach(input => {
    input.addEventListener('input', () => {
      setFill(input);
      const output = root.querySelector(`[data-out="${input.dataset.param}"]`);
      if (output && input.dataset.suffix) {
        output.textContent = `${fmt(Number(input.value), Number(input.dataset.decimals || 1))}${input.dataset.suffix}`;
      }
    });
  });
}

export function readout(label, key, unit = '') {
  return `<div class="sim-readout"><span>${label}</span><b><span data-reading="${key}">—</span>${unit ? `<em>${unit}</em>` : ''}</b></div>`;
}

export function setReading(root, key, value) {
  const el = root.querySelector(`[data-reading="${key}"]`);
  if (el) el.textContent = value;
}

export function rangeControl({ key, label, min, max, step, value, unit = '', decimals = 1 }) {
  return `<div class="sim-control">
    <label for="range-${key}">${label}<b><span data-out="${key}">${fmt(Number(value), decimals)}${unit}</span></b></label>
    <input id="range-${key}" type="range" data-param="${key}" data-suffix="${unit}" data-decimals="${decimals}" min="${min}" max="${max}" step="${step}" value="${value}">
  </div>`;
}

export function drawGrid(ctx, x, y, w, h, cols = 6, rows = 4, color = COLORS.grid) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (let i = 0; i <= cols; i += 1) {
    const px = x + (w / cols) * i;
    ctx.beginPath();
    ctx.moveTo(px, y);
    ctx.lineTo(px, y + h);
    ctx.stroke();
  }
  for (let j = 0; j <= rows; j += 1) {
    const py = y + (h / rows) * j;
    ctx.beginPath();
    ctx.moveTo(x, py);
    ctx.lineTo(x + w, py);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawArrow(ctx, x1, y1, x2, y2, color = COLORS.amber, width = 1.5) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = 6;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  if (Math.hypot(x2 - x1, y2 - y1) > 8) {
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - head * Math.cos(angle - 0.4), y2 - head * Math.sin(angle - 0.4));
    ctx.lineTo(x2 - head * Math.cos(angle + 0.4), y2 - head * Math.sin(angle + 0.4));
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export function roundRect(ctx, x, y, w, h, r = 8) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function drawLabel(ctx, text, x, y, options = {}) {
  ctx.save();
  ctx.fillStyle = options.color || COLORS.muted;
  ctx.font = `${options.italic ? 'italic ' : ''}${options.size || 10}px ${options.mono ? '"Cascadia Code", Consolas, monospace' : '"Microsoft YaHei", "PingFang SC", sans-serif'}`;
  ctx.textAlign = options.align || 'left';
  ctx.textBaseline = options.baseline || 'alphabetic';
  ctx.fillText(text, x, y);
  ctx.restore();
}

export function setPlayLabel(button, playing) {
  if (!button) return;
  button.innerHTML = playing ? `${iconPause()}<span>暂停</span>` : `${iconPlay()}<span>继续</span>`;
}

function iconPause() {
  return '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M8 5v14M16 5v14"/></svg>';
}

function iconPlay() {
  return '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m8 5 11 7-11 7V5Z"/></svg>';
}

export function playIcon(name) {
  if (name === 'pause') return iconPause();
  if (name === 'play') return iconPlay();
  return '';
}

export function labelScale(ctx, x, y, w, h, xMin, xMax, yMin, yMax, xLabel, yLabel) {
  drawLabel(ctx, xLabel, x + w, y + h + 18, { align: 'right', size: 8, mono: true });
  drawLabel(ctx, yLabel, x - 8, y + 4, { align: 'right', size: 8, mono: true });
}
