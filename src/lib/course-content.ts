import { z } from 'zod';

const section = z.object({ id: z.string().uuid(), title: z.string().trim().min(1).max(100), body: z.string().max(12000) }).strict();
export const sessionQuizSchema = z.object({
  id: z.string().uuid(), kind: z.enum(['choice', 'order', 'match']),
  prompt: z.string().trim().min(1).max(1000),
  options: z.array(z.object({ id: z.string().uuid(), label: z.string().trim().min(1).max(300) }).strict()).min(2).max(6),
  answer: z.array(z.string().uuid()).min(1).max(6),
  targets: z.array(z.string().trim().min(1).max(300)).max(6).optional(),
  explanation: z.string().trim().min(1).max(2000),
}).strict().superRefine((quiz, ctx) => {
  const ids = new Set(quiz.options.map(option => option.id));
  if (ids.size !== quiz.options.length || quiz.answer.some(id => !ids.has(id)) || new Set(quiz.answer).size !== quiz.answer.length ||
    quiz.answer.length !== (quiz.kind === 'choice' ? 1 : quiz.options.length) ||
    (quiz.kind === 'match' && quiz.targets?.length !== quiz.options.length)) {
    ctx.addIssue({ code: 'custom', message: 'Choose one valid answer, or use every option exactly once for ordering and matching. Matching needs one target per option.' });
  }
});
export const courseSessionSchema = z.object({
  id: z.string().uuid(), title: z.string().trim().min(1).max(100),
  theory: z.string().max(12000), example: z.string().max(12000),
  visual: z.array(z.string().trim().min(1).max(100)).min(2).max(4).optional(),
  quiz: sessionQuizSchema.optional(),
}).strict();
export type CourseSession = z.infer<typeof courseSessionSchema>;
export type SessionQuiz = z.infer<typeof sessionQuizSchema>;
export const courseContentSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().max(2000),
  level: z.enum(['kid', 'highschool', 'professional']),
  lessons: z.array(section.extend({ sublessons: z.array(section).max(20), sessions: z.array(courseSessionSchema).max(20).optional() })).max(30),
}).strict().superRefine((course, ctx) => {
  const ids = course.lessons.flatMap(lesson => [lesson.id, ...lesson.sublessons.map(sub => sub.id), ...(lesson.sessions ?? []).map(session => session.id)]);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'Lesson identifiers must be unique.' });
});
export type CourseContent = z.infer<typeof courseContentSchema>;
export const courseRecordSchema = z.object({
  id: z.string().uuid(), version: z.number().int(), content: courseContentSchema,
  published: z.boolean(), updatedAt: z.string(),
});
export type CourseRecord = z.infer<typeof courseRecordSchema>;
export const courseWriteSchema = z.object({
  id: z.string().uuid(), expectedVersion: z.number().int().min(-1),
  action: z.enum(['save', 'publish', 'unpublish']), content: courseContentSchema,
}).strict();
export function publicationProblem(course: CourseContent) {
  if (!course.lessons.length) return 'Add at least one lesson before publishing.';
  if (course.lessons.some(lesson => !lesson.body.trim() || lesson.sublessons.some(sub => !sub.body.trim()))) {
    return 'Write content for every lesson and sublesson before publishing.';
  }
  if (course.lessons.some(lesson => lesson.sessions && (!lesson.sessions.length || lesson.sessions.some(session => !session.theory.trim() || !session.example.trim() || !session.quiz)))) {
    return 'Every topic needs at least one session with theory, a worked example and a predefined quiz.';
  }
  return null;
}
