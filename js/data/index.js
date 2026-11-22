import { levels, modules, labs, weeklyPlan } from './core.js';
import { mechanicsLessons } from './lessons-a.js';
import { electricityLessons } from './lessons-b.js';
import { wavesModernLessons } from './lessons-c.js';

export { levels, modules, labs, weeklyPlan };

export const lessons = [...mechanicsLessons, ...electricityLessons, ...wavesModernLessons]
  .sort((a, b) => Number(a.no) - Number(b.no));

export const lessonById = Object.fromEntries(lessons.map(lesson => [lesson.id, lesson]));
export const labById = Object.fromEntries(labs.map(lab => [lab.id, lab]));
export const moduleById = Object.fromEntries(modules.map(module => [module.id, module]));

export const modulesWithLessons = modules.map(module => ({
  ...module,
  lessons: lessons.filter(lesson => lesson.module === module.id),
}));

export const problems = lessons.flatMap(lesson => {
  const module = moduleById[lesson.module];
  return lesson.examples.map(example => ({
    ...example,
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    lessonNo: lesson.no,
    module: lesson.module,
    moduleName: module?.name || '',
    moduleAccent: module?.accent || '#16856a',
  }));
});

export const problemById = Object.fromEntries(problems.map(problem => [problem.id, problem]));

export const problemCounts = {
  foundation: problems.filter(problem => problem.level === '基础').length,
  advanced: problems.filter(problem => problem.level === '进阶').length,
  challenge: problems.filter(problem => problem.level === '挑战').length,
  total: problems.length,
};

export function getDailyProblem(date = new Date()) {
  const pool = problems.filter(problem => problem.level === '挑战');
  const start = new Date(date.getFullYear(), 0, 0);
  const day = Math.floor((date - start) / 86400000);
  return pool[day % pool.length] || problems[0];
}

export function getNextLesson(lesson) {
  if (!lesson) return null;
  const index = lessons.findIndex(item => item.id === lesson.id);
  return lessons[(index + 1) % lessons.length] || null;
}

export function getPrevLesson(lesson) {
  if (!lesson) return null;
  const index = lessons.findIndex(item => item.id === lesson.id);
  return lessons[(index - 1 + lessons.length) % lessons.length] || null;
}

export const stats = {
  modules: modules.length,
  lessons: lessons.length,
  labs: labs.length,
  problems: problems.length,
};
