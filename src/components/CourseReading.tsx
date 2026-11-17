import type { CourseContent } from '@/lib/course-content';
import styles from './courses.module.css';

export default function CourseReading({ content }: { content: CourseContent }) {
  return <article className={styles.reading}><h2>{content.title}</h2><p>{content.description}</p>{content.lessons.map((lesson, i) => <section key={lesson.id}><h3>{i + 1}. {lesson.title}</h3><p>{lesson.body}</p>{lesson.sublessons.map(sub => <section key={sub.id}><h4>{sub.title}</h4><p>{sub.body}</p></section>)}{lesson.sessions?.map(session => <section key={session.id}><h4>Session: {session.title}</h4><p>{session.theory}</p><h5>Worked example</h5><p>{session.example}</p>{session.quiz && <><h5>{session.quiz.kind} quiz: {session.quiz.prompt}</h5><ul>{session.quiz.options.map(option => <li key={option.id}>{option.label}</li>)}</ul><p>Explanation: {session.quiz.explanation}</p></>}</section>)}</section>)}</article>;
}
