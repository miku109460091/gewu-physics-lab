const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/><path d="M8 7h8M8 11h6"/>',
  route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18h4a4 4 0 0 0 0-8h-2a4 4 0 0 1 0-8h4"/>',
  flask: '<path d="M9 3h6M10 3v5.5L4.5 18a2.3 2.3 0 0 0 2 3.5h11a2.3 2.3 0 0 0 2-3.5L14 8.5V3"/><path d="M7.5 15h9"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M8.4 14.5a6 6 0 1 1 7.2 0c-.7.5-1.1 1.3-1.1 2.1V18H9.5v-1.4c0-.8-.4-1.6-1.1-2.1Z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  search: '<circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 4.5 4.5"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  close: '<path d="m5 5 14 14M19 5 5 19"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'arrow-right': '<path d="M4 12h16M14 6l6 6-6 6"/>',
  'arrow-left': '<path d="M20 12H4M10 6l-6 6 6 6"/>',
  'arrow-up-right': '<path d="M7 17 17 7M8 7h9v9"/>',
  flame: '<path d="M12 22c4 0 7-2.8 7-6.7 0-3-1.8-5.2-3.6-7.2C13.9 6.5 13 4.5 13 2c-3.2 1.4-5.5 4.7-5.5 8 0 .9.2 1.7.5 2.5-1.1-.4-2-1.3-2.5-2.4C4.5 11.4 4 12.8 4 14.5 4 19 7.6 22 12 22Z"/><path d="M12 18.5c-1.4-.8-2-2-2-3.2 0-1.1.6-2 1.5-2.8.4 1.1 1.1 1.8 1.8 2.4.5.5.7 1.1.7 1.8 0 .9-.7 1.5-2 1.8Z"/>',
  play: '<path d="m8 5 11 7-11 7V5Z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  check: '<path d="m4.5 12.5 5 5 10-11"/>',
  'check-circle': '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.6 2.6L16.5 9"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
  bookmark: '<path d="M6 3h12v18l-6-4.2L6 21V3Z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
  atom: '<circle cx="12" cy="12" r="2.2"/><ellipse cx="12" cy="12" rx="9.3" ry="4.1" transform="rotate(32 12 12)"/><ellipse cx="12" cy="12" rx="9.3" ry="4.1" transform="rotate(-42 12 12)"/>',
  motion: '<path d="M3 17h4l3-9 4 9h4"/><circle cx="18.5" cy="17" r="2.3"/><path d="M3 21h18"/>',
  orbit: '<circle cx="12" cy="12" r="2.4"/><ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(35 12 12)"/><circle cx="20" cy="7.5" r="1.5" fill="currentColor" stroke="none"/>',
  circuit: '<path d="M3 12h4M17 12h4M8 8v8M16 8v8"/><circle cx="8" cy="12" r="2"/><path d="M12 9v6M10.5 10.5h3M10.5 13.5h3"/>',
  spring: '<path d="M3 12h3c1 0 1-5 2.3-5S9.7 17 11 17s1.5-10 2.8-10S15.7 17 17 17s1.2-5 2.2-5H21"/>',
  wave: '<path d="M2 12c2.5-7 5-7 7.5 0s5 7 7.5 0 3-6 5-3"/><path d="M2 18h20"/>',
  lens: '<path d="M12 3c4 4 4 14 0 18-4-4-4-14 0-18Z"/><path d="M2 12h20M6 6l12 12M18 6 6 18"/>',
  heat: '<path d="M10 14V5a2 2 0 1 1 4 0v9a4 4 0 1 1-4 0Z"/><path d="M12 9v7"/><path d="M17 4c2 2 2 4 0 6M20 2c3 3 3 7 0 10"/>',
  nuclear: '<circle cx="12" cy="12" r="2"/><circle cx="12" cy="4" r="2.2"/><circle cx="18.9" cy="16" r="2.2"/><circle cx="5.1" cy="16" r="2.2"/><path d="m12 6.2-2 3.8M16.8 14.3l-3.2-1M7.2 14.3l3.2-1"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5L16 8Z"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  sparkles: '<path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/><path d="m5 14 .7 1.8L7.5 16l-1.8.7L5 19l-.7-2.3L2.5 16l1.8-.2L5 14Z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  warning: '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v5M12 17h.01"/>',
  expand: '<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/>',
  record: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10M15 10v10"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4Z"/><path d="M8 5H4v2a4 4 0 0 0 4 4M16 5h4v2a4 4 0 0 1-4 4M12 13v5M8 21h8M9 18h6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  'book-open': '<path d="M12 6.5C10 4.5 6 4 3 5v14c3-1 7-.5 9 1.5 2-2 6-2.5 9-1.5V5c-3-1-7-.5-9 1.5Z"/><path d="M12 6.5v14"/>',
  graduation: '<path d="m2 8 10-5 10 5-10 5L2 8Z"/><path d="M6 10v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5M22 8v6"/>',
  wrench: '<path d="M14.5 6.5a4.2 4.2 0 0 1 5-4.1l-2.6 2.6 2.1 2.1 2.6-2.6a4.2 4.2 0 0 1-5.4 5.1L7.7 18a2 2 0 1 1-2.8-2.8l8.4-8.4a4.2 4.2 0 0 1 1.2-.3Z"/>',
  eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.8"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  flame2: '<path d="M12 22c4 0 7-2.8 7-6.7 0-3-1.8-5.2-3.6-7.2C13.9 6.5 13 4.5 13 2c-3.2 1.4-5.5 4.7-5.5 8 0 .9.2 1.7.5 2.5-1.1-.4-2-1.3-2.5-2.4C4.5 11.4 4 12.8 4 14.5 4 19 7.6 22 12 22Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  light: '<path d="M9 18h6M10 21h4"/><path d="M8.4 14.5a6 6 0 1 1 7.2 0c-.7.5-1.1 1.3-1.1 2.1V18H9.5v-1.4c0-.8-.4-1.6-1.1-2.1Z"/>',
  ruler: '<path d="m3 17 14-14 4 4L7 21l-4-4Z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/>',
  scale: '<path d="M12 3v18M7 21h10M4 7h16"/><path d="m6 7-3 6h6L6 7ZM18 7l-3 6h6l-3-6Z"/>',
  magnet: '<path d="M5 3v9a7 7 0 0 0 14 0V3h-4v9a3 3 0 0 1-6 0V3H5Z"/><path d="M5 7h4M15 7h4"/>',
};

export function icon(name, className = '') {
  const body = ICONS[name] || ICONS.info;
  return `<svg class="${className}" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(el => {
    if (el.dataset.hydrated === '1') return;
    el.innerHTML = icon(el.dataset.icon);
    el.dataset.hydrated = '1';
  });
}
