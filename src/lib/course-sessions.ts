import type { CourseContent, CourseSession } from './course-content';

export function topicSessions(topic: CourseContent['lessons'][number]): CourseSession[] {
  if (topic.sessions?.length) return topic.sessions;
  // Preserve published legacy content as a theory session until an author adds quizzes.
  return [{ id: topic.id, title: topic.title, theory: topic.body, example: topic.sublessons.map(sub => `${sub.title}\n\n${sub.body}`).join('\n\n') }];
}
export function flattenSessions(course: CourseContent) {
  return course.lessons.flatMap(topic => topicSessions(topic).map(session => ({ ...session, topicId: topic.id, topicTitle: topic.title })));
}
export function isCorrectAnswer(quiz: CourseSession['quiz'], answer: string[]) {
  return !quiz ? answer.length === 0 : answer.length === quiz.answer.length && answer.every((id, index) => id === quiz.answer[index]);
}
