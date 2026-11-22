import {
  levels, modules, modulesWithLessons, lessons, lessonById, labs, labById,
  problems, problemById, problemCounts, weeklyPlan, stats,
  getDailyProblem, getNextLesson, getPrevLesson,
} from './data/index.js';
import { icon, hydrateIcons } from './icons.js';
import { mountSimulation } from './simulations.js';

const STORAGE_KEY = 'gewu-physics-v1';
const WEEK_GOAL = 4;
const app = document.getElementById('app');
const sidebar = document.getElementById('sidebar');
const sidebarScrim = document.getElementById('sidebarScrim');
const searchOverlay = document.getElementById('searchOverlay');
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const searchCount = document.getElementById('searchCount');
const modalLayer = document.getElementById('modalLayer');
const modal = document.getElementById('modal');
const toastEl = document.getElementById('toast');

const LAB_LESSON = {
  motion: 'kinematics',
  projectile: 'projectile',
  circuit: 'circuit',
  oscillator: 'oscillation',
  collision: 'momentum',
  lens: 'optics',
  photoelectric: 'photoelectric',
};
const LESSON_LAB = Object.fromEntries(Object.entries(LAB_LESSON).map(([lab, lesson]) => [lesson, lab]));
const LAB_CATEGORIES = {
  mechanics: '力学',
  'motion-energy': '力学',
  electric: '电磁',
  induction: '电磁',
  waves: '振动与光',
  modern: '近代',
};

const defaultState = {
  level: 'advanced',
  completedLessons: [],
  labRecords: [],
  quizHistory: [],
  bookmarks: [],
  labTasks: {},
  notebook: {},
  activity: [],
  visitedDates: [],
  streak: 1,
};

let state = loadState();
let currentRoute = { name: 'home', id: null };
let revealObserver = null;
let labCleanup = null;
let currentProblemId = null;
let activeLessonTab = 'concepts';
let quizMemory = {};
let courseFilter = { module: 'all', status: 'all' };
let labFilter = { category: 'all' };
let problemFilter = { level: 'all', module: 'all' };
let searchState = { items: [], index: 0, mode: 'suggest' };

/* =========================================================
   State
   ========================================================= */
function loadState() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
  } catch (error) {
    saved = {};
  }
  const merged = { ...defaultState, ...saved };
  merged.completedLessons = Array.isArray(merged.completedLessons) ? merged.completedLessons : [];
  merged.labRecords = Array.isArray(merged.labRecords) ? merged.labRecords : [];
  merged.quizHistory = Array.isArray(merged.quizHistory) ? merged.quizHistory : [];
  merged.bookmarks = Array.isArray(merged.bookmarks) ? merged.bookmarks : [];
  merged.activity = Array.isArray(merged.activity) ? merged.activity : [];
  merged.visitedDates = Array.isArray(merged.visitedDates) ? merged.visitedDates : [];
  merged.labTasks = merged.labTasks && typeof merged.labTasks === 'object' ? merged.labTasks : {};
  merged.notebook = merged.notebook && typeof merged.notebook === 'object' ? merged.notebook : {};
  if (!levels.some(level => level.key === merged.level)) merged.level = 'advanced';

  const today = dateKey(new Date());
  if (!merged.visitedDates.includes(today)) merged.visitedDates.push(today);
  merged.visitedDates = [...new Set(merged.visitedDates)].sort().slice(-120);
  merged.streak = computeStreak(merged.visitedDates);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch (error) { /* localStorage may be unavailable */ }
  return merged;
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) { /* ignore */ }
}

function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function computeStreak(dates) {
  const set = new Set(dates);
  let cursor = new Date();
  let streak = 0;
  while (set.has(dateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return Math.max(streak, 1);
}

function levelInfo(key = state.level) {
  return levels.find(level => level.key === key) || levels[1];
}

function moduleInfo(id) {
  return modules.find(module => module.id === id);
}

function levelClass(level) {
  if (level === '基础') return 'foundation';
  if (level === '挑战') return 'challenge';
  return 'advanced';
}

function levelBadge(level) {
  return `<span class="level-badge ${levelClass(level)}">${level}</span>`;
}

function formatDateTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function recentActivityDays() {
  const cutoff = Date.now() - 7 * 86400000;
  return state.activity.filter(item => new Date(item.date).getTime() >= cutoff);
}

function latestQuizMap() {
  const map = {};
  state.quizHistory.forEach(record => { map[record.lessonId] = record; });
  return map;
}

function progressSummary() {
  const completed = state.completedLessons.filter(id => lessonById[id]).length;
  const quizMap = latestQuizMap();
  const quizCount = Object.keys(quizMap).filter(id => lessonById[id]).length;
  const labCount = state.labRecords.filter(id => labById[id]).length;
  const lessonPct = completed / lessons.length;
  const quizPct = quizCount / lessons.length;
  const labPct = labCount / labs.length;
  const overall = Math.round((lessonPct * 0.5 + quizPct * 0.25 + labPct * 0.25) * 100);
  return { completed, quizCount, labCount, overall, quizMap };
}

function recordActivity(entry) {
  state.activity.unshift({ date: new Date().toISOString(), ...entry });
  state.activity = state.activity.slice(0, 80);
}

function toggleLessonComplete(lessonId, options = {}) {
  const lesson = lessonById[lessonId];
  if (!lesson) return;
  const index = state.completedLessons.indexOf(lessonId);
  const wasComplete = index >= 0;
  if (wasComplete && !options.forceComplete) {
    state.completedLessons.splice(index, 1);
    toast('已撤销完成标记');
  } else if (!wasComplete) {
    state.completedLessons.push(lessonId);
    recordActivity({ type: 'lesson', title: lesson.title, detail: `${moduleInfo(lesson.module)?.name || ''} · 完成课程`, lessonId });
    if (!options.silent) toast('课程已完成，计入学习档案');
    if (!options.silent) confetti();
  }
  saveState();
  updateSidebar();
  updateLessonCompletionUI(lesson);
}

function recordQuizCompletion(lesson, score, total) {
  const rounded = Math.round((score / total) * 100);
  state.quizHistory.push({
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    score,
    total,
    percent: rounded,
    date: new Date().toISOString(),
  });
  state.quizHistory = state.quizHistory.slice(-120);
  if (!state.completedLessons.includes(lesson.id)) {
    state.completedLessons.push(lesson.id);
    recordActivity({ type: 'lesson', title: lesson.title, detail: '完成自测，课程自动标记完成', lessonId: lesson.id });
  }
  recordActivity({
    type: 'quiz',
    title: `${lesson.title} · 自测`,
    detail: `${score} / ${total} 题正确`,
    score: rounded,
    lessonId: lesson.id,
  });
  saveState();
  updateSidebar();
  updateLessonCompletionUI(lesson);
}

function toggleBookmark(id) {
  const index = state.bookmarks.indexOf(id);
  if (index >= 0) {
    state.bookmarks.splice(index, 1);
    toast('已取消收藏');
  } else {
    state.bookmarks.push(id);
    toast('已加入收藏');
  }
  saveState();
  document.querySelectorAll(`[data-bookmark="${id}"]`).forEach(button => {
    button.classList.toggle('on', state.bookmarks.includes(id));
    button.innerHTML = icon('bookmark');
    button.setAttribute('aria-label', state.bookmarks.includes(id) ? '取消收藏' : '收藏');
  });
}

function setLevel(key) {
  if (!levels.some(level => level.key === key)) return;
  if (state.level === key) {
    toast(`当前已是${levelInfo(key).name}层级`);
    return;
  }
  state.level = key;
  saveState();
  updateSidebar();
  toast(`已切换到「${levelInfo(key).name}」层级`);
  if (['home', 'path', 'progress'].includes(currentRoute.name)) {
    renderRoute({ preserveScroll: true });
  }
}

/* =========================================================
   Navigation and shell
   ========================================================= */
function parseHash() {
  const raw = (location.hash || '').replace(/^#\/?/, '');
  if (!raw) return { name: 'home', id: null };
  const [name, id] = raw.split('/');
  return { name: name || 'home', id: id || null };
}

function navigate(path) {
  const target = `#/${String(path).replace(/^\/+/, '')}`;
  if (location.hash === target) {
    renderRoute();
  } else {
    location.hash = target;
  }
}

function updateShell(route) {
  const navKey = route.name === 'lesson' ? 'courses' : route.name === 'lab' ? 'labs' : route.name;
  document.querySelectorAll('#mainNav a').forEach(link => {
    link.classList.toggle('active', link.dataset.nav === navKey);
  });

  let breadcrumb = '<span>学习空间</span><i>/</i><b>学习概览</b>';
  let title = '学习概览';
  if (route.name === 'courses') {
    breadcrumb = '<span>学习空间</span><i>/</i><b>分层课堂</b>';
    title = '分层课堂';
  } else if (route.name === 'lesson') {
    const lesson = lessonById[route.id];
    breadcrumb = `<span>分层课堂</span><i>/</i><b>${lesson ? lesson.title : '课程'}</b>`;
    title = lesson ? lesson.title : '课程';
  } else if (route.name === 'labs') {
    breadcrumb = '<span>学习空间</span><i>/</i><b>实验模拟</b>';
    title = '实验模拟';
  } else if (route.name === 'lab') {
    const lab = labById[route.id];
    breadcrumb = `<span>实验模拟</span><i>/</i><b>${lab ? lab.title : '实验'}</b>`;
    title = lab ? lab.title : '实验';
  } else if (route.name === 'problems') {
    breadcrumb = '<span>学习空间</span><i>/</i><b>例题精析</b>';
    title = '例题精析';
  } else if (route.name === 'path') {
    breadcrumb = '<span>学习空间</span><i>/</i><b>学习路径</b>';
    title = '学习路径';
  } else if (route.name === 'progress') {
    breadcrumb = '<span>学习空间</span><i>/</i><b>学习档案</b>';
    title = '学习档案';
  }
  document.getElementById('breadcrumb').innerHTML = breadcrumb;
  document.title = `${title} · 格物物理`;
}

function updateSidebar() {
  const info = levelInfo();
  document.querySelectorAll('#levelSwitch button').forEach(button => {
    button.classList.toggle('active', button.dataset.level === state.level);
  });
  document.getElementById('levelHint').textContent = info.hint;

  const recent = recentActivityDays();
  const count = recent.length;
  document.getElementById('sidebarWeekProgress').textContent = `${Math.min(count, WEEK_GOAL)} / ${WEEK_GOAL}`;
  document.getElementById('sidebarWeekBar').style.width = `${Math.min(100, (count / WEEK_GOAL) * 100)}%`;
  document.getElementById('sidebarWeekText').textContent = count >= WEEK_GOAL
    ? '本周目标已达成，保持这个节奏。'
    : count > 0
      ? `再完成 ${WEEK_GOAL - count} 个学习动作即可达标。`
      : '完成 1 节课程，就能点亮进度。';
  document.getElementById('sidebarStreak').textContent = state.streak;
  document.getElementById('topStreak').textContent = state.streak;
}

function closeSidebar() {
  sidebar.classList.remove('open');
  sidebarScrim.hidden = true;
  document.getElementById('mobileMenuBtn')?.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('nav-open');
}

function openSidebar() {
  sidebar.classList.add('open');
  sidebarScrim.hidden = false;
  document.getElementById('mobileMenuBtn')?.setAttribute('aria-expanded', 'true');
  document.body.classList.add('nav-open');
}

function toast(message) {
  toastEl.innerHTML = `${icon('check-circle')}<span>${message}</span>`;
  toastEl.hidden = false;
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => { toastEl.hidden = true; }, 2600);
}

function confetti() {
  const colors = ['#72e3d1', '#f5b85a', '#6f9bff', '#d76548'];
  for (let i = 0; i < 16; i += 1) {
    const dot = document.createElement('i');
    dot.className = 'confetti-dot';
    dot.style.left = `${50 + (Math.random() - 0.5) * 20}%`;
    dot.style.top = '48%';
    dot.style.background = colors[i % colors.length];
    dot.style.setProperty('--dx', `${(Math.random() - 0.5) * 280}px`);
    dot.style.setProperty('--dy', `${-80 - Math.random() * 180}px`);
    document.body.appendChild(dot);
    setTimeout(() => dot.remove(), 900);
  }
}

/* =========================================================
   Reveal
   ========================================================= */
function setupReveal() {
  if (revealObserver) revealObserver.disconnect();
  const items = app.querySelectorAll('[data-reveal]');
  if (!items.length) return;
  revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' });
  items.forEach((item, index) => {
    item.style.transitionDelay = `${Math.min(index % 6, 5) * 45}ms`;
    revealObserver.observe(item);
  });
  setTimeout(() => {
    app.querySelectorAll('[data-reveal]:not(.is-visible)').forEach(item => {
      const rect = item.getBoundingClientRect();
      if (rect.top < window.innerHeight + 100) item.classList.add('is-visible');
    });
  }, 80);
}

/* =========================================================
   Router
   ========================================================= */
function renderRoute(options = {}) {
  if (labCleanup) {
    labCleanup();
    labCleanup = null;
  }
  const route = parseHash();
  const validNames = ['home', 'courses', 'lesson', 'labs', 'lab', 'problems', 'path', 'progress'];
  if (!validNames.includes(route.name)) {
    navigate('home');
    return;
  }
  if (route.name === 'lesson' && !lessonById[route.id]) {
    navigate('courses');
    return;
  }
  if (route.name === 'lab' && !labById[route.id]) {
    navigate('labs');
    return;
  }

  const lessonChanged = route.name === 'lesson' && currentRoute.id !== route.id;
  currentRoute = route;
  if (lessonChanged) {
    activeLessonTab = 'concepts';
  }

  let html = '';
  if (route.name === 'home') html = renderHome();
  else if (route.name === 'courses') html = renderCourses();
  else if (route.name === 'lesson') html = renderLesson(lessonById[route.id]);
  else if (route.name === 'labs') html = renderLabs();
  else if (route.name === 'lab') html = renderLab(labById[route.id]);
  else if (route.name === 'problems') html = renderProblemsPage();
  else if (route.name === 'path') html = renderPathPage();
  else if (route.name === 'progress') html = renderProgressPage();

  app.innerHTML = html;
  hydrateIcons(app);
  updateShell(route);
  updateSidebar();
  setupReveal();
  bindPageEvents();
  closeSidebar();

  if (route.name === 'lab') {
    mountLab(labById[route.id]);
  }

  if (!options.preserveScroll) {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
}

/* =========================================================
   Shared components
   ========================================================= */
function levelDots(activeKey) {
  return levels.map(level => `<button type="button" data-level="${level.key}" class="${level.key === activeKey ? 'active' : ''}">${level.name}</button>`).join('');
}

function metaRow(items) {
  return `<div class="meta-row">${items.map((item, index) => `${index ? '<span class="dot-sep"></span>' : ''}${item.icon ? `<span data-icon="${item.icon}"></span>` : ''}<span>${item.text}</span>`).join('')}</div>`;
}

function pathCards() {
  return `<div class="path-grid">
    ${levels.map((level, index) => {
      const active = level.key === state.level;
      return `<div class="path-card ${active ? 'active' : ''}">
        <div class="path-card-top">
          <span class="path-num">0${index + 1} / ${level.en}</span>
          <span class="path-icon"><span data-icon="${level.icon}"></span></span>
        </div>
        <h3>${level.name}<small>${level.subtitle}</small></h3>
        <p>${level.desc}</p>
        <ul class="path-points">${level.bullets.map(item => `<li>${item}</li>`).join('')}</ul>
        ${active ? '<span class="path-badge">当前学习层级</span>' : ''}
        <div class="path-card-foot">
          <span class="duration">${level.hours} · ${level.target}</span>
          <button class="path-pick" type="button" data-level-set="${level.key}">${active ? '保持此层级' : '切换层级'}<span data-icon="arrow-right"></span></button>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

function moduleCards() {
  return `<div class="module-grid">
    ${modulesWithLessons.map(module => {
      const done = module.lessons.filter(lesson => state.completedLessons.includes(lesson.id)).length;
      const pct = Math.round((done / module.lessons.length) * 100);
      return `<article class="module-card" style="--module-accent:${module.accent}" data-go="courses" data-module-filter="${module.id}" data-reveal>
        <div class="module-top">
          <span class="module-icon"><span data-icon="${module.icon}"></span></span>
          <span class="module-no">${module.no} / ${module.en}</span>
        </div>
        <h3>${module.name}</h3>
        <p>${module.description}</p>
        <div class="module-tags">${module.topics.map(tag => `<span>${tag}</span>`).join('')}</div>
        <div class="module-progress"><i style="width:${pct}%"></i></div>
        <div class="module-foot">
          <span class="module-count"><b>${module.lessons.length}</b> 节课程 · ${done ? `已完成 ${done}` : '尚未开始'}</span>
          <span class="module-arrow"><span data-icon="arrow-up-right"></span></span>
        </div>
      </article>`;
    }).join('')}
  </div>`;
}

function labCard(lab, reveal = true) {
  return `<article class="lab-card" data-go="lab/${lab.id}" ${reveal ? 'data-reveal' : ''}>
    <div class="lab-thumb">
      <span class="lab-thumb-label">${lab.en}</span>
      <span class="lab-thumb-level">${levelBadge(lab.level)}</span>
      ${labThumb(lab.visual)}
    </div>
    <div class="lab-card-body">
      <h3>${lab.title}</h3>
      <p>${lab.description}</p>
      <div class="lab-card-meta">
        ${metaRow([{ icon: 'clock', text: lab.duration }, { icon: 'ruler', text: lab.moduleLabel }])}
        <span class="lab-launch">进入实验<span data-icon="arrow-right"></span></span>
      </div>
    </div>
  </article>`;
}

function labThumb(type) {
  const common = 'fill="none" stroke-linecap="round" stroke-linejoin="round"';
  if (type === 'motion') {
    return `<svg viewBox="0 0 320 140">
      <defs><linearGradient id="lgMotion" x1="0" x2="1"><stop stop-color="#72e3d1" stop-opacity=".2"/><stop offset="1" stop-color="#72e3d1" stop-opacity="0"/></linearGradient></defs>
      <g ${common} stroke="rgba(170,202,225,.16)" stroke-width="1"><path d="M28 30h264M28 58h264M28 86h264M28 114h264"/><path d="M28 28v86M84 28v86M140 28v86M196 28v86M252 28v86"/></g>
      <path d="M32 101h250" stroke="rgba(114,227,209,.35)" stroke-width="1.4"/>
      <path d="M55 104 L255 40" stroke="#72e3d1" stroke-width="2" ${common}/>
      <path d="M55 104 L255 104 L255 40 Z" fill="url(#lgMotion)"/>
      <g transform="translate(100 83)">
        <rect x="-15" y="-9" width="30" height="16" rx="4" fill="#f5b85a"/>
        <circle cx="-8" cy="8" r="3.2" fill="#0b1829" stroke="#f5b85a" stroke-width="1.4"/>
        <circle cx="8" cy="8" r="3.2" fill="#0b1829" stroke="#f5b85a" stroke-width="1.4"/>
      </g>
      <g ${common} stroke="#f5b85a" stroke-width="1.3"><path d="M75 75h-16M59 75l5-4M59 75l5 4"/></g>
      <text x="39" y="124" fill="rgba(190,214,233,.45)" font-size="8" font-family="monospace">t / s</text>
      <text x="42" y="50" fill="rgba(190,214,233,.45)" font-size="8" font-family="monospace">v</text>
      <circle cx="255" cy="40" r="3" fill="#72e3d1"/>
    </svg>`;
  }
  if (type === 'projectile') {
    return `<svg viewBox="0 0 320 140">
      <g ${common} stroke="rgba(170,202,225,.13)" stroke-width="1"><path d="M20 112h280M20 84h280M20 56h280"/></g>
      <path d="M35 112 Q 145 8 285 112" stroke="#72e3d1" stroke-width="2" ${common}/>
      <path d="M35 112 Q 145 8 285 112" stroke="#72e3d1" stroke-opacity=".15" stroke-width="1" stroke-dasharray="3 5" fill="none"/>
      <circle cx="35" cy="112" r="5" fill="#f5b85a"/>
      <circle cx="252" cy="38" r="4" fill="#72e3d1"/>
      <g ${common} stroke="#f5b85a" stroke-width="1.3"><path d="M252 38v20M252 38h20"/><path d="M252 58l-3-6M252 58l3-6M272 38l-6-3M272 38l-6 3"/></g>
      <text x="262" y="52" fill="#f5b85a" font-size="8" font-family="serif" font-style="italic">v₀</text>
      <text x="262" y="72" fill="rgba(190,214,233,.55)" font-size="8" font-family="serif" font-style="italic">v_y</text>
      <path d="M35 112h250" stroke="rgba(255,255,255,.15)" stroke-width="1" stroke-dasharray="3 4"/>
      <g ${common} stroke="rgba(190,214,233,.4)" stroke-width="1"><path d="M35 112v-10M285 112v-10"/></g>
    </svg>`;
  }
  if (type === 'circuit') {
    return `<svg viewBox="0 0 320 140">
      <g ${common} stroke="rgba(190,214,233,.42)" stroke-width="1.6">
        <path d="M55 42h210v56H55Z" fill="none"/>
        <path d="M55 70h-16M55 70h16"/>
      </g>
      <g ${common} stroke="#72e3d1" stroke-width="1.8"><path d="M39 60v20M31 64v12"/></g>
      <g fill="none" stroke="#f5b85a" stroke-width="1.6"><path d="M118 42v56"/><path d="M124 48l8 8-8 8 8 8-8 8 8 8"/></g>
      <circle cx="55" cy="70" r="7" fill="#0b1829" stroke="#72e3d1" stroke-width="1.3"/>
      <path d="M51 70h8M55 66v8" stroke="#72e3d1" stroke-width="1"/>
      <circle cx="190" cy="98" r="7" fill="#0b1829" stroke="#6f9bff" stroke-width="1.3"/>
      <text x="187" y="101" fill="#6f9bff" font-size="7" font-family="monospace">A</text>
      <circle cx="235" cy="20" r="3.4" fill="#f5b85a"><animate attributeName="opacity" values="1;.2;1" dur="2s" repeatCount="indefinite"/></circle>
      <circle cx="160" cy="42" r="2.4" fill="#72e3d1"><animate attributeName="opacity" values=".2;1;.2" dur="1.6s" repeatCount="indefinite"/></circle>
      <g ${common} stroke="rgba(114,227,209,.3)" stroke-width="1"><path d="M240 56v-10M260 56v-16M280 56v-6"/></g>
    </svg>`;
  }
  if (type === 'oscillator') {
    return `<svg viewBox="0 0 320 140">
      <path d="M16 30v80" stroke="rgba(190,214,233,.3)" stroke-width="2"/>
      <g fill="none" stroke="#f5b85a" stroke-width="1.8" stroke-linejoin="round">
        <path d="M16 70h12l8-14 12 28 12-28 12 28 12-28 12 28 8-14h10"/>
      </g>
      <rect x="113" y="56" width="28" height="28" rx="5" fill="#72e3d1"/>
      <path d="M174 70 Q 188 20 202 70 T 230 70 T 258 70 T 286 70" stroke="rgba(114,227,209,.65)" stroke-width="1.8" fill="none"/>
      <path d="M174 70h112" stroke="rgba(190,214,233,.13)" stroke-width="1"/>
      <g ${common} stroke="rgba(190,214,233,.4)" stroke-width="1"><path d="M141 52v36M141 70h18"/></g>
      <text x="164" y="50" fill="rgba(190,214,233,.45)" font-size="8" font-family="monospace">x–t</text>
      <circle cx="202" cy="70" r="3" fill="#f5b85a"/>
    </svg>`;
  }
  if (type === 'collision') {
    return `<svg viewBox="0 0 320 140">
      <path d="M20 96h280" stroke="rgba(190,214,233,.3)" stroke-width="1.4"/>
      <g>
        <rect x="55" y="62" width="52" height="34" rx="7" fill="rgba(245,184,90,.9)"/>
        <rect x="145" y="62" width="52" height="34" rx="7" fill="rgba(114,227,209,.82)"/>
        <text x="77" y="84" fill="#0b1829" font-size="10" text-anchor="middle" font-family="monospace">m₁</text>
        <text x="171" y="84" fill="#0b1829" font-size="10" text-anchor="middle" font-family="monospace">m₂</text>
      </g>
      <g ${common} stroke="#f5b85a" stroke-width="1.4"><path d="M118 44h38M156 44l-6-4M156 44l-6 4"/><path d="M125 34h24"/></g>
      <g ${common} stroke="#72e3d1" stroke-width="1.4"><path d="M210 44h28M238 44l-6-4M238 44l-6 4"/></g>
      <g stroke="rgba(255,255,255,.18)" stroke-width="1"><path d="M128 52v44M139 58v32"/></g>
      <circle cx="125" cy="76" r="20" fill="none" stroke="rgba(245,184,90,.18)" stroke-width="1" stroke-dasharray="2 4"/>
    </svg>`;
  }
  if (type === 'lens') {
    return `<svg viewBox="0 0 320 140">
      <path d="M25 70h270" stroke="rgba(190,214,233,.22)" stroke-width="1"/>
      <path d="M160 22c24 26 24 70 0 96-24-26-24-70 0-96Z" fill="rgba(114,227,209,.1)" stroke="#72e3d1" stroke-width="1.6"/>
      <g ${common} stroke="rgba(245,184,90,.8)" stroke-width="1.2">
        <path d="M55 42h105M160 42l90 56M250 42h-30M160 70h90"/>
        <path d="M55 42v-10M55 42v10M250 98v10M250 98v-10"/>
      </g>
      <path d="M250 42v56" stroke="#f5b85a" stroke-width="2"/>
      <path d="M250 42l-4 8M250 42l4 8" fill="none" stroke="#f5b85a" stroke-width="1.2"/>
      <text x="150" y="128" fill="rgba(190,214,233,.4)" font-size="7.5" font-family="monospace">F</text>
      <circle cx="160" cy="70" r="2.5" fill="#72e3d1"/>
      <path d="M245 42v56" stroke="rgba(245,184,90,.35)" stroke-width="1" stroke-dasharray="3 3"/>
    </svg>`;
  }
  return `<svg viewBox="0 0 320 140">
    <path d="M46 32v76" stroke="#f5b85a" stroke-width="3"/>
    <path d="M46 32v76" stroke="rgba(245,184,90,.2)" stroke-width="10"/>
    <g ${common} stroke="#72e3d1" stroke-width="1.3">
      <path d="M90 30l-18 14 36 12-36 12 36 12-18 14"/>
      <path d="M120 30l-18 14 36 12-36 12 36 12-18 14"/>
    </g>
    <g ${common} stroke="#f5b85a" stroke-width="1.1">
      <path d="M255 34l-16 20 30 14-30 16 30 16-14 12"/>
      <path d="M285 34l-16 20 30 14-30 16 30 16-14 12"/>
    </g>
    <g ${common} stroke="rgba(190,214,233,.4)" stroke-width="1"><path d="M140 50h70M140 84h70"/></g>
    <g ${common} stroke="rgba(114,227,209,.5)" stroke-width="1"><path d="M160 50l7-4v8l-7-4ZM200 84l7-4v8l-7-4Z"/></g>
    <circle cx="164" cy="46" r="2" fill="#72e3d1"><animate attributeName="cx" values="150;215;150" dur="3.2s" repeatCount="indefinite"/></circle>
    <circle cx="187" cy="80" r="2" fill="#72e3d1"><animate attributeName="cx" values="180;245;180" dur="2.5s" repeatCount="indefinite"/></circle>
  </svg>`;
}

/* =========================================================
   Home
   ========================================================= */
function renderHome() {
  const daily = getDailyProblem();
  const progress = progressSummary();
  const resumeActivity = state.activity.find(item => item.type === 'lesson' && lessonById[item.lessonId]);
  const resumeLesson = resumeActivity ? lessonById[resumeActivity.lessonId] : null;
  const featuredLabs = labs.filter(lab => lab.featured).slice(0, 3);

  return `
    <section class="hero">
      <div class="hero-copy">
        <span class="eyebrow">分层学习 · 互动实验 · 例题精析</span>
        <h1>把物理，<br>学成<span class="mark">看得见</span>的思维</h1>
        <p class="hero-sub">从匀变速到光电效应，<strong>${stats.lessons} 节分层课程、${stats.labs} 个可操作的物理实验、${stats.problems} 道逐步解析的例题</strong>。按你的节奏，把概念、模型与迁移能力一层层搭起来。</p>
        <div class="hero-actions">
          <button class="btn btn-primary btn-lg" type="button" data-go="${resumeLesson ? `lesson/${resumeLesson.id}` : 'courses'}">
            ${resumeLesson ? `继续学习《${resumeLesson.title}》` : '开始分层学习'}
            ${icon('arrow-right')}
          </button>
          <button class="btn btn-ghost btn-lg" type="button" data-go="labs">${icon('flask')}进入实验台</button>
        </div>
        <div class="hero-note">
          <span class="icon-text">${icon('check-circle')}覆盖必修 1–3</span>
          <span class="footer-dot"></span>
          <span class="icon-text">${icon('check-circle')}选择性必修 1–3</span>
          <span class="footer-dot"></span>
          <span class="icon-text">${icon('lock')}无需注册 · 本地保存</span>
        </div>
      </div>

      <div class="hero-visual">
        <div class="hero-panel">
          <div class="panel-top">
            <div class="panel-label"><i class="live-dot"></i>INTERACTIVE PHYSICS</div>
            <span class="panel-index">LAB / 01</span>
          </div>
          <div class="orbit-stage">
            <svg viewBox="0 0 480 260" fill="none" aria-hidden="true">
              <defs>
                <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stop-color="#b8f7ec" stop-opacity=".9"/>
                  <stop offset="100%" stop-color="#72e3d1" stop-opacity="0"/>
                </radialGradient>
                <linearGradient id="orbitTrace" x1="0" x2="1">
                  <stop stop-color="#f5b85a" stop-opacity=".1"/>
                  <stop offset=".5" stop-color="#f5b85a" stop-opacity=".7"/>
                  <stop offset="1" stop-color="#f5b85a" stop-opacity=".05"/>
                </linearGradient>
              </defs>
              <ellipse class="orbit-ring" cx="240" cy="132" rx="175" ry="63" transform="rotate(-16 240 132)"/>
              <ellipse class="orbit-ring bright" cx="240" cy="132" rx="132" ry="103" transform="rotate(28 240 132)"/>
              <ellipse class="orbit-ring" cx="240" cy="132" rx="202" ry="38" transform="rotate(8 240 132)"/>
              <path d="M72 174C146 210 337 187 405 98" stroke="url(#orbitTrace)" stroke-width="1.4" stroke-dasharray="3 6"/>
              <circle cx="240" cy="132" r="36" fill="url(#coreGlow)" opacity=".24"/>
              <circle class="orbit-core" cx="240" cy="132" r="9"/>
              <path class="orbit-line" d="M240 132 342 66M240 132 128 92M240 132 305 192"/>
              <circle class="orbit-node" cx="342" cy="66" r="4"/>
              <circle class="orbit-node teal" cx="128" cy="92" r="3.4"/>
              <circle class="orbit-node" cx="305" cy="192" r="3.2"/>
              <circle cx="405" cy="98" r="2" fill="#72e3d1" opacity=".7"/>
              <circle cx="72" cy="174" r="2" fill="#f5b85a" opacity=".65"/>
              <text class="orbit-eq" x="350" y="48">F = ma</text>
              <text class="orbit-label" x="105" y="78">FORCE</text>
              <text class="orbit-eq" x="314" y="212">v = v₀ + at</text>
              <text class="orbit-label" x="316" y="224">MOTION</text>
              <text class="orbit-eq" x="70" y="128">E = hν</text>
              <text class="orbit-label" x="71" y="140">ENERGY</text>
              <text class="orbit-label" x="220" y="158" text-anchor="middle">SYSTEM</text>
              <text class="orbit-label" x="104" y="210">OBSERVE</text>
              <text class="orbit-label" x="215" y="44">MODEL</text>
            </svg>
          </div>
          <div class="panel-readout">
            <div class="readout-cell"><span>本周进度</span><b><em>${String(progress.completed).padStart(2, '0')}</em> / ${lessons.length} 课</b></div>
            <div class="readout-cell"><span>实验记录</span><b>${String(state.labRecords.length).padStart(2, '0')} 组</b></div>
            <div class="readout-cell"><span>当前层级</span><b>${levelInfo().name}</b></div>
          </div>
          <div class="panel-caption"><span>真实参数 · 实时反馈</span><span>拖动滑块，观察物理量变化 ↗</span></div>
        </div>
        <div class="float-card formula">
          <small>CORE EQUATION</small>
          <b>v = v<sub>0</sub> + at</b>
        </div>
        <div class="float-card progress-card">
          <div class="ring-mini" style="--p:${progress.overall}"><span>${progress.overall}%</span></div>
          <div class="progress-card-text">
            <b>学习进度</b>
            <small>课程 · 实验 · 自测综合</small>
          </div>
        </div>
      </div>
    </section>

    <section class="stat-strip" data-reveal>
      <div class="stat-cell"><b>${stats.modules}<span>大板块</span></b><small>覆盖高中物理核心知识网络</small></div>
      <div class="stat-cell"><b>${stats.lessons}<span>节</span></b><small>每节包含概念、模型、例题与自测</small></div>
      <div class="stat-cell"><b>${stats.labs}<span>个</span></b><small>可调参数、实时图像与数据记录</small></div>
      <div class="stat-cell"><b>${stats.problems}<span>道</span></b><small>按基础、进阶、挑战三级精析</small></div>
    </section>

    <div class="section-head" data-reveal>
      <div><h2>选择你的学习路径 <span>/ three paths</span></h2><p>同一个知识点，按你的起点重新组织。随时可以切换。</p></div>
      <button class="section-link" type="button" data-go="path">查看完整路径<span data-icon="arrow-right"></span></button>
    </div>
    ${pathCards()}

    <div class="section-head" data-reveal>
      <div><h2>知识版图 <span>/ knowledge map</span></h2><p>六大板块，从力学到近代物理，每一块都能单独进入。</p></div>
      <button class="section-link" type="button" data-go="courses">全部课程<span data-icon="arrow-right"></span></button>
    </div>
    ${moduleCards()}

    <div class="section-head" data-reveal>
      <div><h2>把公式，变成可以操作的实验 <span>/ lab</span></h2><p>不是看动画，而是改参数、做预测、记录数据。</p></div>
      <button class="section-link" type="button" data-go="labs">全部实验<span data-icon="arrow-right"></span></button>
    </div>
    <div class="lab-grid">${featuredLabs.map(lab => labCard(lab)).join('')}</div>

    <div class="section-head" data-reveal>
      <div><h2>今天，先拆一道题 <span>/ daily problem</span></h2><p>先自己想 30 秒，再展开完整的分步解析。</p></div>
      <button class="section-link" type="button" data-go="problems">进入例题库<span data-icon="arrow-right"></span></button>
    </div>
    <article class="daily-card" data-reveal>
      <div class="daily-copy">
        <span class="eyebrow">DAILY CHALLENGE · ${daily.moduleName}</span>
        <h3>${daily.title}</h3>
        <p>${stripHtml(daily.question).slice(0, 118)}…</p>
        <div class="daily-meta">
          ${levelBadge(daily.level)}
          <span class="tag">${daily.lessonTitle}</span>
          <span class="tag">${daily.source}</span>
        </div>
        <div class="daily-actions">
          <button class="btn btn-teal" type="button" data-problem-id="${daily.id}">${icon('bulb')}展开解析</button>
          <button class="btn btn-ghost" type="button" data-go="lesson/${daily.lessonId}">回到知识点</button>
        </div>
      </div>
      <div class="daily-visual">
        <svg viewBox="0 0 350 210" fill="none" aria-hidden="true">
          <g stroke="rgba(180,206,227,.12)" stroke-width="1"><path d="M25 35h300M25 75h300M25 115h300M25 155h300M25 195h300"/><path d="M75 25v170M145 25v170M215 25v170M285 25v170"/></g>
          <path d="M35 160 Q 150 20 315 140" stroke="rgba(114,227,209,.7)" stroke-width="2"/>
          <path d="M35 160H315" stroke="rgba(255,255,255,.16)" stroke-width="1" stroke-dasharray="4 5"/>
          <path d="M35 160 L160 47 L295 47" stroke="rgba(245,184,90,.4)" stroke-width="1.2" stroke-dasharray="3 4"/>
          <circle cx="35" cy="160" r="5" fill="#f5b85a"/>
          <circle cx="195" cy="64" r="4" fill="#72e3d1"/>
          <path d="M195 64v38M195 64h55" stroke="rgba(114,227,209,.55)" stroke-width="1.1"/>
          <text x="205" y="118" fill="rgba(114,227,209,.7)" font-size="11" font-family="serif" font-style="italic">v_y = gt</text>
          <text x="230" y="87" fill="rgba(190,214,233,.55)" font-size="11" font-family="serif" font-style="italic">v_x = v₀</text>
          <text x="45" y="185" fill="rgba(190,214,233,.4)" font-size="9" font-family="monospace">O</text>
          <text x="290" y="185" fill="rgba(190,214,233,.35)" font-size="8" font-family="monospace">x</text>
          <path d="M35 160c40 20 95 20 135 0" stroke="rgba(245,184,90,.18)" stroke-width="1" stroke-dasharray="2 4"/>
          <circle cx="35" cy="160" r="15" stroke="rgba(245,184,90,.18)" stroke-width="1"/>
        </svg>
      </div>
    </article>
  `;
}

/* =========================================================
   Courses
   ========================================================= */
function renderCourses() {
  const moduleFiltered = courseFilter.module === 'all'
    ? lessons
    : lessons.filter(lesson => lesson.module === courseFilter.module);
  const filtered = moduleFiltered.filter(lesson => {
    if (courseFilter.status === 'done') return state.completedLessons.includes(lesson.id);
    if (courseFilter.status === 'todo') return !state.completedLessons.includes(lesson.id);
    if (courseFilter.status === 'bookmarked') return state.bookmarks.includes(lesson.id);
    return true;
  });

  return `
    <header class="page-head" data-reveal>
      <div>
        <div class="page-kicker">STRUCTURED COURSES</div>
        <h1>分层课堂</h1>
        <p>每节课都按「概念理解 → 模型方法 → 分层例题 → 即时自测」组织。你可以从任意一层进入，也可以沿着完整路径系统学习。</p>
      </div>
      <div class="page-head-side">
        <button class="btn btn-ghost" type="button" data-go="path">${icon('route')}查看学习路径</button>
      </div>
    </header>

    <div class="filter-bar" data-reveal>
      <div class="filter-group">
        <span class="filter-label">板块</span>
        <button class="filter-chip ${courseFilter.module === 'all' ? 'active' : ''}" type="button" data-course-module="all">全部 <span class="count">${lessons.length}</span></button>
        ${modules.map(module => `<button class="filter-chip ${courseFilter.module === module.id ? 'active' : ''}" type="button" data-course-module="${module.id}">${module.name}</button>`).join('')}
      </div>
      <div class="filter-group">
        <span class="filter-label">状态</span>
        <button class="filter-chip ${courseFilter.status === 'all' ? 'active' : ''}" type="button" data-course-status="all">全部</button>
        <button class="filter-chip ${courseFilter.status === 'todo' ? 'active' : ''}" type="button" data-course-status="todo">未完成</button>
        <button class="filter-chip ${courseFilter.status === 'done' ? 'active' : ''}" type="button" data-course-status="done">已完成</button>
        <button class="filter-chip ${courseFilter.status === 'bookmarked' ? 'active' : ''}" type="button" data-course-status="bookmarked">收藏</button>
      </div>
    </div>

    <div class="course-grid">
      ${filtered.length ? filtered.map(lesson => courseCard(lesson)).join('') : emptyState('book', '没有匹配的课程', '换一个板块或状态试试。')}
    </div>
  `;
}

function courseCard(lesson) {
  const module = moduleInfo(lesson.module);
  const done = state.completedLessons.includes(lesson.id);
  const bookmarked = state.bookmarks.includes(lesson.id);
  const quiz = latestQuizMap()[lesson.id];
  return `<article class="course-card" data-go="lesson/${lesson.id}" data-reveal>
    <div class="course-no">${lesson.no}</div>
    <div class="course-main">
      <div class="course-topline">
        <h3>${lesson.title}</h3>
        <div class="icon-text">
          <span class="level-badge all">三阶</span>
          <button class="course-bookmark ${bookmarked ? 'on' : ''}" type="button" data-bookmark="${lesson.id}" aria-label="${bookmarked ? '取消收藏' : '收藏'}">${icon('bookmark')}</button>
        </div>
      </div>
      <p>${lesson.summary}</p>
      <div class="course-tags">
        <span>${module.name}</span>
        ${lesson.tags.map(tag => `<span>${tag}</span>`).join('')}
      </div>
      <div class="course-foot">
        ${metaRow([{ icon: 'clock', text: lesson.duration }, { icon: 'layers', text: '基础 / 进阶 / 挑战' }, ...(quiz ? [{ icon: 'target', text: `自测 ${quiz.score}/${quiz.total}` }] : [])])}
        ${done ? `<span class="course-done">${icon('check-circle')}已完成</span>` : `<span class="course-done" style="color:var(--muted-2)">开始学习 ${icon('arrow-right')}</span>`}
      </div>
    </div>
  </article>`;
}

/* =========================================================
   Lesson
   ========================================================= */
function renderLesson(lesson) {
  const module = moduleInfo(lesson.module);
  const completed = state.completedLessons.includes(lesson.id);
  const prev = getPrevLesson(lesson);
  const next = getNextLesson(lesson);
  const relatedLab = labById[LESSON_LAB[lesson.id]];

  return `
    <article class="lesson-hero" data-reveal>
      <div class="lesson-hero-main">
        <span class="eyebrow">${module.name} · ${module.grade} · LESSON ${lesson.no}</span>
        <h1>${lesson.title}</h1>
        <p class="lesson-hero-sub">${lesson.summary}</p>
        <div class="lesson-hero-meta">
          <span class="level-badge all">三阶分层</span>
          ${levelBadge('基础')}${levelBadge('进阶')}${levelBadge('挑战')}
          ${metaRow([{ icon: 'clock', text: lesson.duration }, { icon: 'bulb', text: `${lesson.examples.length} 道例题` }])}
        </div>
      </div>
      <div class="lesson-hero-side">
        <div class="side-label">学完这节课，你能</div>
        <ul class="lesson-goals">${lesson.objectives.map(item => `<li>${item}</li>`).join('')}</ul>
      </div>
    </article>

    <div class="lesson-layout">
      <div class="lesson-body">
        <div class="lesson-tabs" role="tablist" aria-label="课程内容">
          ${lessonTabButton('concepts', '01', '概念讲解')}
          ${lessonTabButton('models', '02', '模型方法')}
          ${lessonTabButton('examples', '03', '例题精析')}
          ${lessonTabButton('quiz', '04', '即时自测')}
        </div>
        <div class="lesson-panel ${activeLessonTab === 'concepts' ? 'active' : ''}" data-panel="concepts">
          ${renderConcepts(lesson, module)}
        </div>
        <div class="lesson-panel ${activeLessonTab === 'models' ? 'active' : ''}" data-panel="models">
          ${renderModels(lesson)}
        </div>
        <div class="lesson-panel ${activeLessonTab === 'examples' ? 'active' : ''}" data-panel="examples">
          ${renderExamples(lesson)}
        </div>
        <div class="lesson-panel ${activeLessonTab === 'quiz' ? 'active' : ''}" data-panel="quiz">
          ${renderQuiz(lesson)}
        </div>
        <div class="lesson-nav-row">
          <button class="lesson-nav-card" type="button" data-go="lesson/${prev.id}">
            <small>上一课 · ${prev.no}</small><b>${prev.title}</b>
          </button>
          <button class="lesson-nav-card next" type="button" data-go="lesson/${next.id}">
            <small>下一课 · ${next.no}</small><b>${next.title}</b>
          </button>
        </div>
      </div>

      <aside class="lesson-rail">
        <div class="rail-card">
          <div class="rail-label">本课导航</div>
          <div class="rail-nav">
            ${['concepts:01 概念讲解', 'models:02 模型方法', 'examples:03 例题精析', 'quiz:04 即时自测'].map(item => {
              const [key, label] = item.split(':');
              return `<button type="button" data-tab-target="${key}" class="${activeLessonTab === key ? 'active' : ''}"><span class="rail-num">${label.slice(0, 2)}</span>${label.slice(3)}</button>`;
            }).join('')}
          </div>
        </div>
        <div class="rail-card">
          <div class="rail-label">学习进度</div>
          <div class="rail-progress">
            <div class="rail-ring" data-rail-ring style="--p:${completed ? 100 : 0}"><span>${completed ? 100 : 0}%</span></div>
            <div class="rail-progress-text">
              <b data-rail-progress-label>${completed ? '本课已完成' : '尚未标记完成'}</b>
              <small>完成课程或自测后计入档案</small>
            </div>
          </div>
          <div class="rail-done ${completed ? 'done' : ''}" data-rail-done>
            <button class="btn ${completed ? 'btn-soft' : 'btn-primary'} btn-block btn-sm" type="button" data-complete-btn="${lesson.id}" data-completed="${completed}">
              ${completed ? `${icon('check-circle')}已完成 · 点击撤销` : `${icon('check')}标记为完成`}
            </button>
          </div>
        </div>
        <div class="rail-card rail-key">
          <div class="f-label">本课核心公式</div>
          <div class="f-expr">${lesson.formulas[0]?.expr || ''}</div>
          <div class="f-note">${lesson.formulas[0]?.note || ''}</div>
        </div>
        <div class="rail-card">
          <div class="rail-label">继续探索</div>
          <div class="rail-links">
            ${relatedLab ? `<button class="rail-link" type="button" data-go="lab/${relatedLab.id}"><span data-icon="flask"></span>配套实验：${relatedLab.title}</button>` : ''}
            <button class="rail-link" type="button" data-go="problems"><span data-icon="bulb"></span>到例题库按层级练习</button>
            <button class="rail-link" type="button" data-go="path"><span data-icon="route"></span>回到我的学习路径</button>
          </div>
        </div>
      </aside>
    </div>
  `;
}

function lessonTabButton(key, number, label) {
  return `<button class="lesson-tab ${activeLessonTab === key ? 'active' : ''}" type="button" role="tab" aria-selected="${activeLessonTab === key}" data-tab="${key}"><span style="font-family:var(--mono);font-size:8px;opacity:.55;margin-right:4px">${number}</span>${label}</button>`;
}

function renderConcepts(lesson, module) {
  return `
    <section class="content-block">
      <div class="block-title"><span class="step-no">01</span>核心概念</div>
      <div class="block-sub">先建立正确的物理图景，再进入公式与计算。</div>
      <div class="concept-list">
        ${lesson.concepts.map((concept, index) => `<div class="concept-item">
          <h3><span class="concept-index">${String(index + 1).padStart(2, '0')}</span>${concept.title}</h3>
          <p>${concept.body}</p>
          ${concept.formula ? `<div class="formula-box"><div class="f-label">关系式</div><div class="f-expr">${concept.formula}</div></div>` : ''}
          ${concept.note ? `<div class="note">${concept.note}</div>` : ''}
        </div>`).join('')}
      </div>
    </section>

    <section class="content-block">
      <div class="block-title"><span class="step-no">02</span>公式与适用条件</div>
      <div class="block-sub">公式不是越背越多，而是要清楚每一个符号和前提。</div>
      <div class="formula-grid">
        ${lesson.formulas.map(formula => `<div class="formula-box">
          <div class="f-label">${formula.name}</div>
          <div class="f-expr">${formula.expr}</div>
          <div class="f-note">${formula.note}</div>
        </div>`).join('')}
      </div>
      <div class="callout tip">
        <span data-icon="light"></span>
        <div><b>本课建议：</b>${module.outcomes} 先理解每个量的方向与单位，再开始套公式。</div>
      </div>
    </section>

    <section class="content-block">
      <div class="block-title"><span class="step-no">03</span>常见误区</div>
      <div class="block-sub">把“看起来对”的说法改成“物理上对”的表述。</div>
      <div class="misconception-grid">
        ${lesson.misconceptions.map(item => `<div class="misconception">
          <div class="wrong-cell"><b>常见错误</b>${item.wrong}</div>
          <div class="right-cell"><b>正确理解</b>${item.right}</div>
        </div>`).join('')}
      </div>
    </section>

    <div class="callout">
      <span data-icon="info"></span>
      <div>建议按 <b>概念 → 模型 → 例题 → 自测</b> 的顺序完成本课。遇到卡点，先回到“核心概念”检查物理图景，而不是继续套公式。</div>
    </div>
  `;
}

function renderModels(lesson) {
  return `
    <section class="content-block">
      <div class="block-title"><span class="step-no">01</span>典型模型</div>
      <div class="block-sub">把题目归到熟悉的模型里，是稳定得分的关键。</div>
      <div class="model-list">
        ${lesson.models.map((model, index) => `<div class="model-item">
          <h4><span>MODEL ${String(index + 1).padStart(2, '0')}</span>${model.name}</h4>
          <ul>${model.points.map(point => `<li>${point}</li>`).join('')}</ul>
        </div>`).join('')}
      </div>
    </section>

    <section class="content-block">
      <div class="block-title"><span class="step-no">02</span>解题流程</div>
      <div class="block-sub">一个可复用的思考顺序，比零散技巧更可靠。</div>
      <div class="model-list">
        <div class="model-item"><h4><span>STEP 01</span>确定研究对象与过程</h4><ul><li>明确研究哪个物体、哪一段运动过程，画出过程示意图。</li><li>标出已知量、未知量和正方向，把文字条件翻译成物理量。</li></ul></div>
        <div class="model-item"><h4><span>STEP 02</span>选择规律并列方程</h4><ul><li>优先考虑守恒量：能量、动量、电荷量；再考虑牛顿定律与运动学公式。</li><li>方程数量要与未知量数量匹配，避免漏条件。</li></ul></div>
        <div class="model-item"><h4><span>STEP 03</span>求解并检验</h4><ul><li>检查单位、数量级和方向是否符合物理情境。</li><li>用极端值或对称性快速检验结果是否合理。</li></ul></div>
      </div>
    </section>

    <section class="content-block">
      <div class="block-title"><span class="step-no">03</span>按层级练习</div>
      <div class="block-sub">同一个模型，三种难度。按当前层级选择起点。</div>
      <div class="model-list">
        <div class="model-item"><h4><span>筑基</span>先把一步走稳</h4><ul><li>能说出模型的关键条件和每个公式的适用前提。</li><li>完成本课「基础」例题，不跳步骤地写出已知、公式、代入、答案。</li></ul></div>
        <div class="model-item"><h4><span>进阶</span>把过程拆清楚</h4><ul><li>能独立完成「进阶」例题，并解释每一步为什么用这个规律。</li><li>尝试用图像法或能量法做一次交叉检验。</li></ul></div>
        <div class="model-item"><h4><span>挑战</span>迁移到新情境</h4><ul><li>完成「挑战」例题，重点检查临界条件与多过程衔接。</li><li>做完后用自己的话总结：这道题和课本模型相比，多了什么条件？</li></ul></div>
      </div>
    </section>
  `;
}

function renderExamples(lesson) {
  return `
    <section class="content-block">
      <div class="block-title"><span class="step-no">01</span>分层例题</div>
      <div class="block-sub">先遮住解析独立完成，再逐步对照。每一道都标注了难度与考点。</div>
    </section>
    ${lesson.examples.map((example, index) => renderExample(example, index)).join('')}
    <div class="callout tip">
      <span data-icon="light"></span>
      <div>做完题后不要只看答案。用一句话写下 <b>“这道题的关键一步是什么”</b>，比重复刷十道同类题更有效。</div>
    </div>
  `;
}

function renderExample(example, index) {
  return `<article class="example-card" id="example-${example.id}">
    <div class="example-head">
      <div class="example-head-left">
        <span class="example-no">E${String(index + 1).padStart(2, '0')}</span>
        <div>
          <h3>${example.title}</h3>
          <div class="example-source">${example.source}</div>
        </div>
      </div>
      ${levelBadge(example.level)}
    </div>
    <div class="example-body">
      <p class="problem-text">${example.question}</p>
      <div class="given-ask">
        <div><span>已知</span><p>${example.given}</p></div>
        <div><span>求解</span><p>${example.ask}</p></div>
      </div>
      <div class="solution-wrap">
        <button class="solution-toggle" type="button" data-solution="solution-${example.id}" aria-expanded="false">
          <span>先自己想一想 · 展开完整解析</span>
          <span data-icon="chevron-down"></span>
        </button>
        <div class="solution-steps" id="solution-${example.id}">
          ${example.steps.map((step, stepIndex) => `<div class="step-item done">
            <span class="step-dot">${stepIndex + 1}</span>
            <h4>${step.title}</h4>
            <p>${step.body}</p>
          </div>`).join('')}
          <div class="answer-box"><span>答案</span><p>${example.answer}</p></div>
          <div class="example-tip"><span data-icon="light"></span><span>${example.tip}</span></div>
        </div>
      </div>
      <div class="example-actions">
        <span class="example-status">建议用时：${example.level === '基础' ? '2–3 分钟' : example.level === '进阶' ? '4–6 分钟' : '6–8 分钟'}</span>
        <button class="btn btn-soft btn-sm" type="button" data-solution="solution-${example.id}">${icon('book-open')}展开解析</button>
      </div>
    </div>
  </article>`;
}

function renderQuiz(lesson) {
  const quizState = getQuizState(lesson);
  return `
    <section class="content-block">
      <div class="block-title"><span class="step-no">01</span>即时自测</div>
      <div class="block-sub">${lesson.quiz.length} 道题，检查概念是否真的清楚。选完立即看到解析。</div>
    </section>
    ${lesson.quiz.map((question, index) => {
      const selected = quizState.answers[index];
      const answered = selected !== undefined;
      return `<article class="quiz-card" data-quiz="${lesson.id}" data-q="${index}">
        <div class="quiz-head">
          <h3><span>Q${String(index + 1).padStart(2, '0')}</span>${question.q}</h3>
        </div>
        <div class="quiz-options">
          ${question.options.map((option, optionIndex) => {
            const classes = ['quiz-option'];
            if (answered && optionIndex === question.answer) classes.push('correct');
            if (answered && optionIndex === selected && selected !== question.answer) classes.push('wrong');
            return `<button class="${classes.join(' ')}" type="button" data-quiz-opt="${optionIndex}" ${answered ? 'disabled' : ''}>
              <span class="opt-letter">${String.fromCharCode(65 + optionIndex)}</span>
              <span>${option}</span>
            </button>`;
          }).join('')}
        </div>
        <div class="quiz-explain ${answered ? 'show' : ''}"><b>解析：</b>${question.explain}</div>
      </article>`;
    }).join('')}
    <div id="quiz-result-${lesson.id}" class="quiz-result-slot">${quizState.done ? quizResultHtml(lesson, quizState) : ''}</div>
  `;
}

function quizResultHtml(lesson, quizState) {
  const pct = Math.round((quizState.score / lesson.quiz.length) * 100);
  return `<div class="quiz-result">
    <b>${quizState.score}/${lesson.quiz.length}</b>
    <div><strong>${pct === 100 ? '全部正确，概念很扎实。' : pct >= 60 ? '基础不错，回看错题会更稳。' : '建议回到概念讲解，把关键条件再理一遍。'}</strong><br>本次自测已计入学习档案。</div>
    <button class="btn btn-ghost btn-sm" type="button" data-quiz-reset="${lesson.id}">再做一次</button>
  </div>`;
}

function getQuizState(lesson) {
  if (!quizMemory[lesson.id]) {
    quizMemory[lesson.id] = { answers: {}, score: 0, done: false };
  }
  return quizMemory[lesson.id];
}

function activateTab(key, scroll = false) {
  activeLessonTab = key;
  app.querySelectorAll('.lesson-tab').forEach(button => {
    const active = button.dataset.tab === key;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  app.querySelectorAll('.lesson-panel').forEach(panel => panel.classList.toggle('active', panel.dataset.panel === key));
  app.querySelectorAll('[data-tab-target]').forEach(button => button.classList.toggle('active', button.dataset.tabTarget === key));
  if (scroll) {
    const tabs = app.querySelector('.lesson-tabs');
    tabs?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function updateLessonCompletionUI(lesson) {
  const completed = state.completedLessons.includes(lesson.id);
  const button = app.querySelector('[data-complete-btn]');
  if (button) {
    button.dataset.completed = String(completed);
    button.className = `btn ${completed ? 'btn-soft' : 'btn-primary'} btn-block btn-sm`;
    button.innerHTML = completed ? `${icon('check-circle')}已完成 · 点击撤销` : `${icon('check')}标记为完成`;
  }
  const ring = app.querySelector('[data-rail-ring]');
  if (ring) {
    ring.style.setProperty('--p', completed ? 100 : 0);
    const label = ring.querySelector('span');
    if (label) label.textContent = completed ? '100%' : '0%';
  }
  const progressLabel = app.querySelector('[data-rail-progress-label]');
  if (progressLabel) progressLabel.textContent = completed ? '本课已完成' : '尚未标记完成';
  const railDone = app.querySelector('[data-rail-done]');
  if (railDone) railDone.classList.toggle('done', completed);
}

/* =========================================================
   Labs
   ========================================================= */
function renderLabs() {
  const categories = ['all', '力学', '电磁', '振动与光', '近代'];
  const filtered = labFilter.category === 'all'
    ? labs
    : labs.filter(lab => LAB_CATEGORIES[lab.module] === labFilter.category);
  return `
    <header class="page-head" data-reveal>
      <div>
        <div class="page-kicker">VIRTUAL LABORATORY</div>
        <h1>实验模拟</h1>
        <p>改变参数，观察物理量如何响应。每个实验都配有实验目的、操作任务、原理说明与数据记录，适合课前预学，也适合课后验证。</p>
      </div>
      <div class="page-head-side">
        <span class="tag">${icon('record')} 7 个可交互实验</span>
      </div>
    </header>
    <div class="filter-bar" data-reveal>
      <div class="filter-group">
        <span class="filter-label">分类</span>
        ${categories.map(category => `<button class="filter-chip ${labFilter.category === category ? 'active' : ''}" type="button" data-lab-category="${category}">${category === 'all' ? '全部实验' : category}</button>`).join('')}
      </div>
      <div class="filter-group">
        <span class="filter-label">操作提示</span>
        <span class="tag">拖动滑块实时改变参数</span>
        <span class="tag">记录数据生成实验表格</span>
      </div>
    </div>
    <div class="lab-grid">
      ${filtered.length ? filtered.map(lab => labCard(lab)).join('') : emptyState('flask', '这个分类还没有实验', '先看看其他分类吧。')}
    </div>
    <div class="callout tip" style="margin-top:24px" data-reveal>
      <span data-icon="light"></span>
      <div><b>实验建议：</b>先写下预测，再调参数验证。如果结果和预测不同，先检查自己使用的物理模型，而不是急着相信眼睛。</div>
    </div>
  `;
}

function renderLab(lab) {
  const relatedLesson = lessonById[LAB_LESSON[lab.id]];
  const readings = state.notebook[lab.id] || [];
  const tasks = state.labTasks[lab.id] || [];
  const done = state.labRecords.includes(lab.id);
  return `
    <div class="lab-detail-head" data-reveal>
      <div>
        <div class="page-kicker">${lab.en} · ${lab.moduleLabel}</div>
        <h1>${lab.title}</h1>
        <p>${lab.description}</p>
        <div class="hero-meta">
          ${levelBadge(lab.level)}
          ${metaRow([{ icon: 'clock', text: lab.duration }, { icon: 'record', text: readings.length ? `已记录 ${readings.length} 组数据` : '尚未记录数据' }])}
          ${done ? `<span class="course-done">${icon('check-circle')}已进入实验档案</span>` : ''}
        </div>
      </div>
      <button class="btn btn-ghost" type="button" data-go="labs">${icon('arrow-left')}返回实验台</button>
    </div>

    <div class="lab-detail-layout">
      <div>
        <div id="simMount"></div>
        <div class="lab-principle">
          <div class="lab-principle-grid">
            <section class="content-block">
              <div class="block-title"><span class="step-no">01</span>实验原理</div>
              <p style="font-size:11px;line-height:1.9;color:var(--muted);margin-top:12px">${lab.principle}</p>
              <div class="callout tip" style="margin-bottom:0">
                <span data-icon="info"></span>
                <div>先明确每个符号的含义和单位，再开始调参数。</div>
              </div>
            </section>
            <section class="content-block">
              <div class="block-title"><span class="step-no">02</span>观察重点</div>
              <div class="principle-points">
                ${lab.tasks.map((task, index) => `<div class="principle-point"><span class="pp-num">0${index + 1}</span><span>${task}</span></div>`).join('')}
              </div>
            </section>
          </div>
        </div>

        <section class="record-panel" id="recordPanel">
          <div class="record-head">
            <h3><span data-icon="table"></span>实验数据记录 <span style="color:var(--muted-2);font-weight:400;font-size:8.5px">最多保存 20 组</span></h3>
            <div class="record-actions">
              <button class="btn btn-soft btn-sm" type="button" data-export-csv="${lab.id}">${icon('download')}导出 CSV</button>
              <button class="btn btn-soft btn-sm" type="button" data-clear-record="${lab.id}">${icon('trash')}清空</button>
            </div>
          </div>
          <div id="notebookBody">${renderNotebook(lab)}</div>
        </section>
      </div>

      <aside class="lab-side">
        <div class="rail-card">
          <div class="rail-label">实验任务 · 做完打勾</div>
          <ul class="task-list">
            ${lab.tasks.map((task, index) => `<li>
              <button class="task-check ${tasks[index] ? 'done' : ''}" type="button" data-lab-task="${index}" data-lab-id="${lab.id}" aria-label="标记任务完成">${icon('check')}</button>
              <span>${task}</span>
            </li>`).join('')}
          </ul>
        </div>
        <div class="rail-card">
          <div class="rail-label">挑战问题</div>
          <div class="lab-challenge">
            <b>${icon('target')}想一想</b>
            <p>${lab.challenge}</p>
          </div>
          ${relatedLesson ? `<button class="btn btn-ghost btn-sm btn-block" style="margin-top:11px" type="button" data-go="lesson/${relatedLesson.id}">${icon('book-open')}回到相关知识点</button>` : ''}
        </div>
      </aside>
    </div>
  `;
}

function renderNotebook(lab) {
  const readings = state.notebook[lab.id] || [];
  if (!readings.length) {
    return `<div class="record-empty">还没有记录。调整参数后点击实验区的「记录当前数据」，这里会自动生成表格。</div>`;
  }
  const keys = Object.keys(readings[0]).filter(key => key !== 'time');
  return `<div style="overflow-x:auto"><table class="record-table">
    <thead><tr><th>#</th><th>时间</th>${keys.map(key => `<th>${key}</th>`).join('')}</tr></thead>
    <tbody>${readings.map((reading, index) => `<tr><td>${index + 1}</td><td>${reading.time}</td>${keys.map(key => `<td>${reading[key] ?? '—'}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}

function mountLab(lab) {
  const container = document.getElementById('simMount');
  if (!container) return;
  labCleanup = mountSimulation(lab.mount, container, {
    record(reading) {
      recordLabReading(lab, reading);
    },
    toast,
  });
}

function recordLabReading(lab, reading) {
  if (!state.notebook[lab.id]) state.notebook[lab.id] = [];
  const item = { time: new Date().toLocaleTimeString('zh-CN', { hour12: false }), ...reading };
  state.notebook[lab.id].push(item);
  state.notebook[lab.id] = state.notebook[lab.id].slice(-20);
  const isFirst = !state.labRecords.includes(lab.id);
  if (isFirst) {
    state.labRecords.push(lab.id);
    recordActivity({ type: 'lab', title: lab.title, detail: '完成一次实验数据记录', labId: lab.id });
  }
  saveState();
  updateSidebar();
  const notebookBody = document.getElementById('notebookBody');
  if (notebookBody) notebookBody.innerHTML = renderNotebook(lab);
  const meta = document.querySelector('.lab-detail-head .meta-row');
  if (meta) {
    const count = state.notebook[lab.id].length;
    meta.innerHTML = `${icon('clock')}<span>${lab.duration}</span><span class="dot-sep"></span>${icon('record')}<span>已记录 ${count} 组数据</span>`;
  }
  hydrateIcons(document);
  toast(isFirst ? '已记录第一组数据，实验已计入档案' : `已记录第 ${state.notebook[lab.id].length} 组数据`);
}

function exportCsv(labId) {
  const readings = state.notebook[labId] || [];
  if (!readings.length) {
    toast('还没有数据可以导出');
    return;
  }
  const keys = Object.keys(readings[0]);
  const rows = [keys.join(','), ...readings.map(reading => keys.map(key => `"${String(reading[key] ?? '').replace(/"/g, '""')}"`).join(','))];
  const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `格物实验数据-${labId}-${dateKey(new Date())}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
  toast('实验数据已导出');
}

/* =========================================================
   Problems
   ========================================================= */
function renderProblemsPage() {
  const filtered = getFilteredProblems();
  return `
    <header class="page-head" data-reveal>
      <div>
        <div class="page-kicker">WORKED EXAMPLES</div>
        <h1>例题精析</h1>
        <p>${problemCounts.total} 道例题，全部来自 ${stats.lessons} 节核心课程。按难度筛选，先独立完成，再展开逐步解析。</p>
      </div>
      <div class="page-head-side">
        <button class="btn btn-ghost" type="button" data-go="courses">${icon('book')}回到课程</button>
      </div>
    </header>

    <div class="problem-summary" data-reveal>
      <div class="problem-stat foundation">
        <span class="p-icon" data-icon="layers"></span>
        <div><b>${problemCounts.foundation}</b><small>基础题 · 概念与公式直接应用</small></div>
      </div>
      <div class="problem-stat advanced">
        <span class="p-icon" data-icon="target"></span>
        <div><b>${problemCounts.advanced}</b><small>进阶题 · 模型与方法综合</small></div>
      </div>
      <div class="problem-stat challenge">
        <span class="p-icon" data-icon="sparkles"></span>
        <div><b>${problemCounts.challenge}</b><small>挑战题 · 多过程与临界分析</small></div>
      </div>
    </div>

    <div class="filter-bar" data-reveal>
      <div class="filter-group">
        <span class="filter-label">难度</span>
        ${['all', '基础', '进阶', '挑战'].map(level => `<button class="filter-chip ${problemFilter.level === level ? 'active' : ''}" type="button" data-problem-level="${level}">${level === 'all' ? '全部' : level}</button>`).join('')}
      </div>
      <div class="filter-group">
        <span class="filter-label">板块</span>
        <button class="filter-chip ${problemFilter.module === 'all' ? 'active' : ''}" type="button" data-problem-module="all">全部</button>
        ${modules.map(module => `<button class="filter-chip ${problemFilter.module === module.id ? 'active' : ''}" type="button" data-problem-module="${module.id}">${module.name}</button>`).join('')}
      </div>
    </div>

    <div class="problem-list">
      ${filtered.length ? filtered.map((problem, index) => `<button class="problem-row" type="button" data-problem-id="${problem.id}" data-reveal>
        <span class="problem-row-no">${String(index + 1).padStart(2, '0')}</span>
        <span class="problem-row-main">
          <h3>${problem.title}</h3>
          <p>${stripHtml(problem.question)}</p>
        </span>
        <span class="problem-row-right">
          ${levelBadge(problem.level)}
          <span class="meta-row">${problem.moduleName}<span class="dot-sep"></span>${problem.lessonTitle}</span>
          <span class="problem-row-arrow" data-icon="arrow-right"></span>
        </span>
      </button>`).join('') : emptyState('bulb', '没有匹配的例题', '调整难度或板块筛选试试。')}
    </div>
  `;
}

function getFilteredProblems() {
  return problems.filter(problem => {
    if (problemFilter.level !== 'all' && problem.level !== problemFilter.level) return false;
    if (problemFilter.module !== 'all' && problem.module !== problemFilter.module) return false;
    return true;
  });
}

function openProblem(id) {
  const problem = problemById[id];
  if (!problem) return;
  currentProblemId = id;
  const ordered = problems;
  const index = ordered.findIndex(item => item.id === id);
  const prev = ordered[index - 1] || null;
  const next = ordered[index + 1] || null;
  modal.innerHTML = `
    <div class="modal-head">
      <div style="flex:1;min-width:0">
        <div class="modal-head-left">
          ${levelBadge(problem.level)}
          <span class="tag">${problem.moduleName}</span>
          <span class="tag">${problem.lessonTitle}</span>
        </div>
        <h2 id="modalTitle">${problem.title}</h2>
      </div>
      <button class="modal-close" type="button" data-close-modal aria-label="关闭">${icon('close')}</button>
    </div>
    <div class="modal-body">
      <p class="problem-text">${problem.question}</p>
      <div class="given-ask">
        <div><span>已知</span><p>${problem.given}</p></div>
        <div><span>求解</span><p>${problem.ask}</p></div>
      </div>
      <div class="solution-wrap">
        <button class="solution-toggle" type="button" data-solution="modal-solution" aria-expanded="false">
          <span>先自己思考 · 展开完整解析</span>
          <span data-icon="chevron-down"></span>
        </button>
        <div class="solution-steps" id="modal-solution">
          ${problem.steps.map((step, stepIndex) => `<div class="step-item done">
            <span class="step-dot">${stepIndex + 1}</span>
            <h4>${step.title}</h4>
            <p>${step.body}</p>
          </div>`).join('')}
          <div class="answer-box"><span>答案</span><p>${problem.answer}</p></div>
          <div class="example-tip"><span data-icon="light"></span><span>${problem.tip}</span></div>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost btn-sm" type="button" data-go="lesson/${problem.lessonId}">${icon('book-open')}回到知识点</button>
        <div class="problem-nav">
          <button class="btn btn-soft btn-sm" type="button" data-problem-id="${prev ? prev.id : ''}" ${prev ? '' : 'disabled'}>${icon('arrow-left')}上一题</button>
          <button class="btn btn-soft btn-sm" type="button" data-problem-id="${next ? next.id : ''}" ${next ? '' : 'disabled'}>下一题${icon('arrow-right')}</button>
        </div>
      </div>
    </div>
  `;
  modalLayer.hidden = false;
  modal.scrollTop = 0;
  document.body.classList.add('modal-open');
  hydrateIcons(modal);
}

function closeModal() {
  modalLayer.hidden = true;
  modal.innerHTML = '';
  document.body.classList.remove('modal-open');
  currentProblemId = null;
}

/* =========================================================
   Learning path
   ========================================================= */
function renderPathPage() {
  const info = levelInfo();
  const progress = progressSummary();
  const recommended = lessons.find(lesson => !state.completedLessons.includes(lesson.id)) || lessons[0];
  const currentStep = Math.min(3, Math.floor(progress.completed / 4));
  return `
    <section class="path-page-hero" data-reveal>
      <span class="eyebrow">YOUR LEARNING ROUTE</span>
      <h1>不是把所有课都学一遍，<br>而是在对的时候，学对的那一层。</h1>
      <p>三条路径共享同一套知识框架，区别在于起点、节奏和训练重点。选定后，课程卡片、推荐顺序和学习档案都会跟着调整。</p>
      <div class="path-metrics">
        <div class="path-metric"><b>${info.hours}<span>建议投入</span></b><small>${info.target}</small></div>
        <div class="path-metric"><b>${stats.lessons}<span>节</span></b><small>每节都支持三阶学习</small></div>
        <div class="path-metric"><b>${stats.labs}<span>个</span></b><small>实验穿插在对应知识点中</small></div>
        <div class="path-metric"><b>${progress.completed}<span>节已完成</span></b><small>总进度 ${progress.overall}%</small></div>
      </div>
    </section>

    <div class="section-head" style="margin-top:0" data-reveal>
      <div><h2>先选一个起点 <span>/ choose a level</span></h2><p>没有对错，只有适不适合现在的你。随时可以切换。</p></div>
    </div>
    <div class="level-choose" data-reveal>
      ${levels.map(level => `<button class="level-choice ${state.level === level.key ? 'active' : ''}" type="button" data-level-set="${level.key}">
        <div class="level-choice-top"><span class="level-badge ${level.key === 'foundation' ? 'foundation' : level.key === 'challenge' ? 'challenge' : 'advanced'}">${level.name}</span><span class="lc-radio"></span></div>
        <h3>${level.subtitle}</h3>
        <p>${level.desc}</p>
        <span class="lc-tag">${level.hours}</span>
      </button>`).join('')}
    </div>

    <div class="section-head" style="margin-top:24px" data-reveal>
      <div><h2>${info.name}路径 · 六段知识地图 <span>/ roadmap</span></h2><p>青色进度条表示该板块的课程完成情况，点击任意课程直接进入。</p></div>
      <button class="btn btn-primary btn-sm" type="button" data-go="lesson/${recommended.id}">${icon('play')}从《${recommended.title}》开始</button>
    </div>
    <div class="roadmap" data-reveal>
      ${modulesWithLessons.map(module => {
        const done = module.lessons.filter(lesson => state.completedLessons.includes(lesson.id)).length;
        const pct = Math.round((done / module.lessons.length) * 100);
        return `<div class="roadmap-row" style="--module-accent:${module.accent}">
          <div class="roadmap-module">
            <span class="roadmap-icon"><span data-icon="${module.icon}"></span></span>
            <div><h4>${module.name}</h4><small>${module.grade} · ${module.lessons.length} 节</small></div>
          </div>
          <div class="roadmap-lessons">
            ${module.lessons.map(lesson => `<button class="roadmap-pill ${state.completedLessons.includes(lesson.id) ? 'done' : ''}" type="button" data-go="lesson/${lesson.id}">
              ${state.completedLessons.includes(lesson.id) ? `<span class="rp-check">${icon('check')}</span>` : `<span style="font-family:var(--mono);font-size:7px;opacity:.55">${lesson.no}</span>`}${lesson.title}
            </button>`).join('')}
          </div>
          <div class="roadmap-progress"><b>${pct}%</b><small>${done}/${module.lessons.length} 完成</small><div class="roadmap-bar"><i style="width:${pct}%"></i></div></div>
        </div>`;
      }).join('')}
    </div>

    <section class="timeline-card" data-reveal>
      <h2>一个可执行的 16 周节奏</h2>
      <p>不追求一次学完。每周 2–3 个学习动作，配合实验和自测，让知识真正留下来。</p>
      <div class="timeline">
        ${weeklyPlan.map((step, index) => `<div class="timeline-step ${index === currentStep ? 'current' : ''}">
          <div class="timeline-dot">${index + 1}</div>
          <h4>${step.title}</h4>
          <p>${step.desc}</p>
          <small>${step.weeks} · ${step.focus}</small>
        </div>`).join('')}
      </div>
    </section>

    <div class="callout tip" style="margin-top:18px" data-reveal>
      <span data-icon="light"></span>
      <div><b>路径使用建议：</b>每学完一节，至少完成一次自测或一个实验。看懂不等于会做，能讲清楚、能做对、能迁移，才是真的掌握。</div>
    </div>
  `;
}

/* =========================================================
   Progress
   ========================================================= */
function renderProgressPage() {
  const progress = progressSummary();
  const info = levelInfo();
  const quizMap = progress.quizMap;
  const quizRecords = Object.values(quizMap);
  const avg = quizRecords.length
    ? Math.round(quizRecords.reduce((sum, item) => sum + item.percent, 0) / quizRecords.length)
    : 0;
  const history = state.activity.slice(0, 7);
  const fullScore = quizRecords.some(record => record.score === record.total);
  const exploredModules = modulesWithLessons.filter(module => module.lessons.some(lesson => state.completedLessons.includes(lesson.id))).length;
  const badges = [
    { key: 'first', name: '初次点亮', desc: '完成第 1 节课程', icon: 'star', earned: progress.completed >= 1 },
    { key: 'lab', name: '实验玩家', desc: '记录 1 组数据', icon: 'flask', earned: progress.labCount >= 1 },
    { key: 'quiz', name: '自测达人', desc: '完成 3 次自测', icon: 'target', earned: progress.quizCount >= 3 },
    { key: 'module', name: '六边形探索', desc: '涉猎全部 6 个板块', icon: 'compass', earned: exploredModules >= modules.length },
    { key: 'full', name: '满分时刻', desc: '自测全部答对', icon: 'trophy', earned: fullScore },
    { key: 'streak', name: '坚持不懈', desc: '连续学习 3 天', icon: 'flame', earned: state.streak >= 3 },
  ];

  return `
    <section class="profile-hero" data-reveal>
      <div class="profile-ident">
        <div class="profile-avatar-lg">学</div>
        <div>
          <h1>我的学习档案</h1>
          <p>${info.name}模式 · ${info.subtitle}</p>
          <p>连续学习 <b style="color:var(--amber)">${state.streak}</b> 天 · 最近记录 ${state.activity.length ? formatDateTime(state.activity[0].date) : '还没有'}</p>
        </div>
      </div>
      <div class="profile-ring-big" style="--p:${progress.overall}">
        <div><b>${progress.overall}<span>%</span></b><small>综合进度</small></div>
      </div>
    </section>

    <div class="overview-grid" data-reveal>
      <div class="overview-card"><div class="oc-top"><span>已完成课程</span><span class="oc-icon" data-icon="book"></span></div><b>${progress.completed}<small>/ ${lessons.length}</small></b><small>完成课程或自测都会计入</small></div>
      <div class="overview-card"><div class="oc-top"><span>自测平均分</span><span class="oc-icon" data-icon="target"></span></div><b>${avg}<small>%</small></b><small>基于 ${quizRecords.length} 次自测记录</small></div>
      <div class="overview-card"><div class="oc-top"><span>实验记录</span><span class="oc-icon" data-icon="flask"></span></div><b>${progress.labCount}<small>/ ${labs.length}</small></b><small>已完成数据记录的实验</small></div>
      <div class="overview-card"><div class="oc-top"><span>连续学习</span><span class="oc-icon" data-icon="flame"></span></div><b>${state.streak}<small>天</small></b><small>每天打开学习空间即计入</small></div>
    </div>

    <div class="profile-columns">
      <div style="display:grid;gap:15px">
        <section class="panel-card" data-reveal>
          <div class="panel-card-head"><h2>最近学习</h2><span>${state.activity.length} 条记录</span></div>
          <div class="panel-card-body">
            ${history.length ? `<div class="history-list">${history.map(item => {
              const isQuiz = item.type === 'quiz';
              const isLab = item.type === 'lab';
              const iconName = isQuiz ? 'target' : isLab ? 'flask' : 'check-circle';
              const cls = isQuiz ? 'quiz' : isLab ? '' : 'done';
              return `<div class="history-item ${cls}">
                <span class="history-icon">${icon(iconName)}</span>
                <div class="history-main"><b>${item.title}</b><small>${item.detail} · ${formatDateTime(item.date)}</small></div>
                <span class="history-val ${isQuiz ? 'score' : ''}">${isQuiz ? `${item.score}%` : isLab ? '实验' : '完成'}</span>
              </div>`;
            }).join('')}</div>` : `<div class="record-empty" style="padding:28px 0">还没有学习记录。完成一节课程或一次实验，这里就会开始生长。</div>`}
          </div>
        </section>

        <section class="panel-card" data-reveal>
          <div class="panel-card-head"><h2>板块进度</h2><span>按课程完成数统计</span></div>
          <div class="panel-card-body">
            <div class="module-progress-list">
              ${modulesWithLessons.map(module => {
                const done = module.lessons.filter(lesson => state.completedLessons.includes(lesson.id)).length;
                const pct = Math.round((done / module.lessons.length) * 100);
                return `<div class="mpl-row" style="--module-accent:${module.accent}">
                  <div class="mpl-top"><b>${module.name}</b><span>${done}/${module.lessons.length} · ${pct}%</span></div>
                  <div class="mpl-bar"><i style="width:${pct}%"></i></div>
                </div>`;
              }).join('')}
            </div>
          </div>
        </section>
      </div>

      <div style="display:grid;gap:15px">
        <section class="panel-card" data-reveal>
          <div class="panel-card-head"><h2>学习徽章</h2><span>${badges.filter(badge => badge.earned).length} / ${badges.length}</span></div>
          <div class="panel-card-body">
            <div class="badge-grid">
              ${badges.map(badge => `<div class="badge-item ${badge.earned ? 'earned' : ''}" title="${badge.desc}">
                <div class="badge-icon">${icon(badge.icon)}</div>
                <b>${badge.name}</b>
                <small>${badge.desc}</small>
              </div>`).join('')}
            </div>
          </div>
        </section>

        <section class="panel-card" data-reveal>
          <div class="panel-card-head"><h2>下一步建议</h2><span>根据当前进度生成</span></div>
          <div class="panel-card-body">
            <p style="font-size:10.5px;line-height:1.8;color:var(--muted)">${buildNextStep(progress)}</p>
            <button class="btn btn-primary btn-sm btn-block" style="margin-top:13px" type="button" data-go="lesson/${(lessons.find(lesson => !state.completedLessons.includes(lesson.id)) || lessons[0]).id}">${icon('arrow-right')}继续下一节</button>
          </div>
        </section>

        <section class="panel-card" data-reveal>
          <div class="panel-card-head"><h2>学习设置</h2><span>仅保存在本机</span></div>
          <div class="panel-card-body">
            <div class="level-switch" style="background:var(--surface-3);border-color:var(--line)">${levels.map(level => `<button type="button" data-level-set="${level.key}" class="${state.level === level.key ? 'active' : ''}" style="${state.level === level.key ? 'background:#fff;color:var(--ink);box-shadow:0 1px 3px rgba(0,0,0,.08)' : 'color:var(--muted)'}">${level.name}</button>`).join('')}</div>
            <div class="danger-zone">
              <p><b>清空学习档案</b>课程、实验、自测与收藏记录都会被删除，操作不可撤销。</p>
              <button class="btn btn-ghost btn-sm text-danger" type="button" data-reset-progress>${icon('trash')}清空</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  `;
}

function buildNextStep(progress) {
  if (!progress.completed) return '建议从《匀变速直线运动》开始。先完成概念讲解，再做一个配套实验，最后用自测确认理解。';
  if (!progress.labCount) return '课程已经开始积累，下一步去实验台亲手调一次参数。实验能帮你把公式和真实过程对应起来。';
  if (progress.quizCount < 3) return '试着完成 3 次自测。做题时不要翻解析，先独立写出关键方程，再对照答案。';
  if (progress.completed < lessons.length) return '保持当前节奏，优先补齐尚未完成的板块。遇到综合题时，回到对应课程复习模型。';
  return '所有课程已完成。建议重做挑战题，并用自己的话总结每个板块的核心模型，形成自己的知识网络。';
}

function openResetModal() {
  modal.innerHTML = `
    <div class="modal-head">
      <div><div class="modal-head-left"><span class="level-badge challenge">注意</span></div><h2 id="modalTitle">清空全部学习档案？</h2></div>
      <button class="modal-close" type="button" data-close-modal aria-label="关闭">${icon('close')}</button>
    </div>
    <div class="modal-body">
      <p class="problem-text">这会删除本机上所有课程完成记录、实验数据、自测成绩、收藏和学习历史。操作不可撤销。</p>
      <div class="modal-foot">
        <button class="btn btn-ghost" type="button" data-close-modal>取消</button>
        <button class="btn btn-primary" type="button" data-confirm-reset>确认清空</button>
      </div>
    </div>
  `;
  modalLayer.hidden = false;
  document.body.classList.add('modal-open');
  hydrateIcons(modal);
}

function resetProgress() {
  const level = state.level;
  state = {
    ...defaultState,
    level,
    completedLessons: [],
    labRecords: [],
    quizHistory: [],
    bookmarks: [],
    labTasks: {},
    notebook: {},
    activity: [],
    visitedDates: [dateKey(new Date())],
    streak: 1,
  };
  quizMemory = {};
  courseFilter = { module: 'all', status: 'all' };
  problemFilter = { level: 'all', module: 'all' };
  labFilter = { category: 'all' };
  saveState();
  updateSidebar();
  closeModal();
  navigate('home');
  toast('学习档案已清空，可以重新开始');
}

/* =========================================================
   Search
   ========================================================= */
function buildSearchItems() {
  const items = [];
  lessons.forEach(lesson => {
    items.push({
      type: '课程',
      id: lesson.id,
      icon: 'book',
      title: lesson.title,
      meta: `${moduleInfo(lesson.module)?.name || ''} · ${lesson.duration}`,
      haystack: [lesson.title, lesson.subtitle, lesson.summary, lesson.tags.join(' '), moduleInfo(lesson.module)?.name].join(' ').toLowerCase(),
      action: () => navigate(`lesson/${lesson.id}`),
    });
  });
  labs.forEach(lab => {
    items.push({
      type: '实验',
      id: lab.id,
      icon: 'flask',
      title: lab.title,
      meta: `${lab.moduleLabel} · ${lab.duration}`,
      haystack: [lab.title, lab.description, lab.moduleLabel, lab.tasks.join(' ')].join(' ').toLowerCase(),
      action: () => navigate(`lab/${lab.id}`),
    });
  });
  problems.forEach(problem => {
    items.push({
      type: '例题',
      id: problem.id,
      icon: 'bulb',
      title: problem.title,
      meta: `${problem.level} · ${problem.lessonTitle}`,
      haystack: [problem.title, stripHtml(problem.question), problem.moduleName, problem.lessonTitle, problem.level].join(' ').toLowerCase(),
      action: () => openProblem(problem.id),
    });
  });
  return items;
}

function openSearch() {
  searchOverlay.hidden = false;
  document.body.classList.add('search-open');
  searchInput.value = '';
  renderSearch('');
  setTimeout(() => searchInput.focus(), 30);
}

function closeSearch() {
  searchOverlay.hidden = true;
  document.body.classList.remove('search-open');
  searchInput.value = '';
  searchState = { items: [], index: 0, mode: 'suggest' };
}

function renderSearch(query) {
  const allItems = buildSearchItems();
  const q = query.trim().toLowerCase();
  if (!q) {
    searchState.mode = 'suggest';
    searchState.index = 0;
    const progress = progressSummary();
    const resume = lessons.find(lesson => !state.completedLessons.includes(lesson.id)) || lessons[0];
    const daily = getDailyProblem();
    const suggestions = [
      { type: '继续', id: resume.id, icon: 'play', title: resume.title, meta: `${moduleInfo(resume.module)?.name} · 接下来学这节`, action: () => navigate(`lesson/${resume.id}`) },
      { type: '实验', id: 'motion', icon: 'flask', title: '匀变速直线运动实验', meta: '拖动参数，观察图像与运动同步变化', action: () => navigate('lab/motion') },
      { type: '挑战', id: daily.id, icon: 'sparkles', title: daily.title, meta: `今日挑战 · ${daily.lessonTitle}`, action: () => openProblem(daily.id) },
      { type: '进度', id: 'progress', icon: 'chart', title: '查看我的学习档案', meta: `综合进度 ${progress.overall}% · 连续 ${state.streak} 天`, action: () => navigate('progress') },
    ];
    searchState.items = suggestions;
    searchCount.textContent = '4';
    searchResults.innerHTML = `<div class="search-group-label">推荐继续</div>${suggestions.map((item, index) => searchResultHtml(item, index)).join('')}`;
    return;
  }

  const matched = allItems
    .filter(item => item.haystack.includes(q))
    .sort((a, b) => {
      const aTitle = a.title.toLowerCase();
      const bTitle = b.title.toLowerCase();
      const aStarts = aTitle.startsWith(q) ? 2 : aTitle.includes(q) ? 1 : 0;
      const bStarts = bTitle.startsWith(q) ? 2 : bTitle.includes(q) ? 1 : 0;
      return bStarts - aStarts;
    })
    .slice(0, 18);
  searchState.mode = 'results';
  searchState.items = matched;
  searchState.index = 0;
  searchCount.textContent = String(matched.length);

  if (!matched.length) {
    searchResults.innerHTML = `<div class="search-empty">没有找到「${escapeHtml(query)}」相关内容。<br>试试“牛顿”“平抛”“电磁感应”或“光电效应”。</div>`;
    return;
  }

  const groups = ['课程', '实验', '例题'];
  searchResults.innerHTML = groups.map(group => {
    const groupItems = matched.filter(item => item.type === group);
    if (!groupItems.length) return '';
    return `<div class="search-group-label">${group}</div>${groupItems.map(item => searchResultHtml(item, matched.indexOf(item))).join('')}`;
  }).join('');
}

function searchResultHtml(item, index) {
  return `<button class="search-result ${index === searchState.index ? 'selected' : ''}" type="button" data-search-index="${index}">
    <span class="sr-icon">${icon(item.icon)}</span>
    <span class="sr-main"><b>${item.title}</b><small>${item.meta}</small></span>
    <span class="sr-type">${item.type}</span>
  </button>`;
}

function selectSearchItem(index) {
  const item = searchState.items[index];
  if (!item) return;
  if (item.action) {
    closeSearch();
    item.action();
  }
}

/* =========================================================
   Page events
   ========================================================= */
function bindPageEvents() {
  app.onclick = event => {
    const solutionButton = event.target.closest('[data-solution]');
    if (solutionButton) {
      const target = document.getElementById(solutionButton.dataset.solution);
      if (target) {
        const isOpen = target.classList.toggle('open');
        solutionButton.classList.toggle('open', isOpen);
        solutionButton.setAttribute('aria-expanded', String(isOpen));
        const label = solutionButton.querySelector('span:first-child');
        if (label && !label.textContent.includes('先自己')) label.textContent = isOpen ? '收起解析' : '展开解析';
      }
      event.stopPropagation();
      return;
    }

    const tabButton = event.target.closest('[data-tab]');
    if (tabButton) {
      activateTab(tabButton.dataset.tab);
      return;
    }
    const railTab = event.target.closest('[data-tab-target]');
    if (railTab) {
      activateTab(railTab.dataset.tabTarget);
      return;
    }

    const completeButton = event.target.closest('[data-complete-btn]');
    if (completeButton) {
      toggleLessonComplete(completeButton.dataset.completeBtn);
      return;
    }

    const bookmarkButton = event.target.closest('[data-bookmark]');
    if (bookmarkButton) {
      event.stopPropagation();
      toggleBookmark(bookmarkButton.dataset.bookmark);
      return;
    }

    const quizOption = event.target.closest('[data-quiz-opt]');
    if (quizOption) {
      handleQuizAnswer(quizOption);
      return;
    }

    const quizReset = event.target.closest('[data-quiz-reset]');
    if (quizReset) {
      delete quizMemory[quizReset.dataset.quizReset];
      renderRoute({ preserveScroll: true });
      return;
    }

    const moduleFilter = event.target.closest('[data-course-module]');
    if (moduleFilter) {
      courseFilter.module = moduleFilter.dataset.courseModule;
      renderRoute({ preserveScroll: true });
      return;
    }
    const statusFilter = event.target.closest('[data-course-status]');
    if (statusFilter) {
      courseFilter.status = statusFilter.dataset.courseStatus;
      renderRoute({ preserveScroll: true });
      return;
    }
    const labCategory = event.target.closest('[data-lab-category]');
    if (labCategory) {
      labFilter.category = labCategory.dataset.labCategory;
      renderRoute({ preserveScroll: true });
      return;
    }
    const problemLevel = event.target.closest('[data-problem-level]');
    if (problemLevel) {
      problemFilter.level = problemLevel.dataset.problemLevel;
      renderRoute({ preserveScroll: true });
      return;
    }
    const problemModule = event.target.closest('[data-problem-module]');
    if (problemModule) {
      problemFilter.module = problemModule.dataset.problemModule;
      renderRoute({ preserveScroll: true });
      return;
    }

    const labTask = event.target.closest('[data-lab-task]');
    if (labTask) {
      const labId = labTask.dataset.labId;
      const taskIndex = Number(labTask.dataset.labTask);
      if (!state.labTasks[labId]) state.labTasks[labId] = [];
      state.labTasks[labId][taskIndex] = !state.labTasks[labId][taskIndex];
      saveState();
      labTask.classList.toggle('done', Boolean(state.labTasks[labId][taskIndex]));
      hydrateIcons(labTask);
      return;
    }

    const clearRecord = event.target.closest('[data-clear-record]');
    if (clearRecord) {
      const labId = clearRecord.dataset.clearRecord;
      state.notebook[labId] = [];
      saveState();
      const body = document.getElementById('notebookBody');
      if (body) body.innerHTML = renderNotebook(labById[labId]);
      toast('实验数据已清空');
      return;
    }

    const exportButton = event.target.closest('[data-export-csv]');
    if (exportButton) {
      exportCsv(exportButton.dataset.exportCsv);
      return;
    }

    const resetButton = event.target.closest('[data-reset-progress]');
    if (resetButton) {
      openResetModal();
      return;
    }
  };
}

function handleQuizAnswer(optionButton) {
  const card = optionButton.closest('.quiz-card');
  if (!card) return;
  const lessonId = card.dataset.quiz;
  const questionIndex = Number(card.dataset.q);
  const lesson = lessonById[lessonId];
  if (!lesson) return;
  const quizState = getQuizState(lesson);
  if (quizState.answers[questionIndex] !== undefined) return;
  const question = lesson.quiz[questionIndex];
  const chosen = Number(optionButton.dataset.quizOpt);
  quizState.answers[questionIndex] = chosen;
  if (chosen === question.answer) quizState.score += 1;

  const options = card.querySelectorAll('.quiz-option');
  options.forEach((option, index) => {
    option.disabled = true;
    if (index === question.answer) option.classList.add('correct');
    if (index === chosen && chosen !== question.answer) option.classList.add('wrong');
  });
  card.querySelector('.quiz-explain')?.classList.add('show');

  const answered = Object.keys(quizState.answers).length;
  const resultSlot = document.getElementById(`quiz-result-${lesson.id}`);
  if (answered === lesson.quiz.length && !quizState.done) {
    quizState.done = true;
    if (resultSlot) resultSlot.innerHTML = quizResultHtml(lesson, quizState);
    recordQuizCompletion(lesson, quizState.score, lesson.quiz.length);
    hydrateIcons(resultSlot || app);
    toast(`自测完成：${quizState.score}/${lesson.quiz.length} 题正确`);
    if (quizState.score === lesson.quiz.length) confetti();
  } else if (resultSlot) {
    resultSlot.innerHTML = `<div class="quiz-result" style="background:var(--surface-2);border-color:var(--line);color:var(--muted)">已完成 ${answered}/${lesson.quiz.length} 题，继续完成剩余题目即可生成自测结果。</div>`;
    hydrateIcons(resultSlot);
  }
}

/* =========================================================
   Global events
   ========================================================= */
function bindGlobalEvents() {
  document.addEventListener('click', event => {
    const go = event.target.closest('[data-go]');
    if (go) {
      if (go.dataset.moduleFilter) courseFilter.module = go.dataset.moduleFilter;
      closeModal();
      closeSearch();
      navigate(go.dataset.go);
      return;
    }

    const levelButton = event.target.closest('[data-level-set]');
    if (levelButton) {
      setLevel(levelButton.dataset.levelSet);
      return;
    }

    const openSearchButton = event.target.closest('[data-open-search]');
    if (openSearchButton) {
      openSearch();
      return;
    }

    const closeSearchButton = event.target.closest('[data-close-search]');
    if (closeSearchButton) {
      closeSearch();
      return;
    }

    const closeModalButton = event.target.closest('[data-close-modal]');
    if (closeModalButton) {
      closeModal();
      return;
    }

    const problemButton = event.target.closest('[data-problem-id]');
    if (problemButton && problemButton.dataset.problemId) {
      closeModal();
      openProblem(problemButton.dataset.problemId);
      return;
    }

    const solutionButton = event.target.closest('[data-solution]');
    if (solutionButton) {
      const target = document.getElementById(solutionButton.dataset.solution);
      if (target) {
        const open = target.classList.toggle('open');
        solutionButton.classList.toggle('open', open);
        solutionButton.setAttribute('aria-expanded', String(open));
        const label = solutionButton.querySelector('span:first-child');
        if (label) label.textContent = open ? '收起解析' : '先自己思考 · 展开完整解析';
      }
      return;
    }

    const confirmReset = event.target.closest('[data-confirm-reset]');
    if (confirmReset) {
      resetProgress();
      return;
    }

    const searchResult = event.target.closest('[data-search-index]');
    if (searchResult) {
      selectSearchItem(Number(searchResult.dataset.searchIndex));
      return;
    }

    if (event.target.closest('#mobileMenuBtn')) {
      sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
      return;
    }
    if (event.target === sidebarScrim) {
      closeSidebar();
      return;
    }
    if (event.target.closest('[data-level]')) {
      const key = event.target.closest('[data-level]').dataset.level;
      setLevel(key);
    }
  });

  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      searchOverlay.hidden ? openSearch() : closeSearch();
      return;
    }
    if (event.key === 'Escape') {
      if (!searchOverlay.hidden) {
        closeSearch();
        return;
      }
      if (!modalLayer.hidden) {
        closeModal();
        return;
      }
      if (sidebar.classList.contains('open')) closeSidebar();
      return;
    }
    if (!searchOverlay.hidden) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        searchState.index = Math.min(searchState.index + 1, Math.max(0, searchState.items.length - 1));
        updateSearchSelection();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        searchState.index = Math.max(searchState.index - 1, 0);
        updateSearchSelection();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        selectSearchItem(searchState.index);
      }
    }
  });

  searchInput.addEventListener('input', () => renderSearch(searchInput.value));

  document.querySelectorAll('[data-level]').forEach(button => {
    button.classList.toggle('active', button.dataset.level === state.level);
  });
}

function updateSearchSelection() {
  searchResults.querySelectorAll('[data-search-index]').forEach(button => {
    button.classList.toggle('selected', Number(button.dataset.searchIndex) === searchState.index);
  });
  const selected = searchResults.querySelector('.search-result.selected');
  selected?.scrollIntoView({ block: 'nearest' });
}

/* =========================================================
   Helpers
   ========================================================= */
function stripHtml(value) {
  const div = document.createElement('div');
  div.innerHTML = value;
  return div.textContent || '';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function emptyState(iconName, title, text) {
  return `<div class="empty-state" style="grid-column:1/-1">
    <span data-icon="${iconName}"></span>
    <h3>${title}</h3>
    <p>${text}</p>
  </div>`;
}

/* =========================================================
   Init
   ========================================================= */
function init() {
  hydrateIcons(document);
  bindGlobalEvents();
  updateSidebar();
  window.addEventListener('hashchange', () => renderRoute());
  if (!location.hash) {
    history.replaceState(null, '', '#/home');
  }
  renderRoute();
}

init();
