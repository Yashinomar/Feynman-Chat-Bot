import { createHash } from 'node:crypto';
import type { CourseContent } from './course-content';

// An edited lesson must be read again; unrelated lesson edits retain progress.
export function lessonRevision(lesson: CourseContent['lessons'][number]) {
  return createHash('sha256').update(JSON.stringify(lesson)).digest('hex');
}
