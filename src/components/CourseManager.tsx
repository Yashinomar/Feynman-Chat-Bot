'use client';

import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { CourseContent, CourseRecord, courseContentSchema, courseRecordSchema, publicationProblem } from '@/lib/course-content';
import { errorMessage, requestJson, jsonBody } from '@/lib/client-api';
import styles from './courses.module.css';
import CourseReading from './CourseReading';
import CourseSessionEditor from './CourseSessionEditor';

const blank = (): CourseRecord => ({ id: crypto.randomUUID(), version: -1, published: false, updatedAt: '', content: { title: 'New course', description: '', level: 'highschool', lessons: [] } });
export default function CourseManager() {
  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [selected, setSelected] = useState<CourseRecord | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const lock = useRef(false);
  const load = () => requestJson('/api/admin/courses', z.array(courseRecordSchema)).then(setCourses);
  useEffect(() => { load().catch(err => setError(errorMessage(err))).finally(() => setLoading(false)); }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const choose = (record: CourseRecord) => {
    if (dirty && !window.confirm('Discard your unsaved course edits?')) return;
    setSelected(record); setDirty(false); setNotice(''); setError('');
  };
  const edit = (content: CourseContent) => { if (selected) setSelected({ ...selected, content }); setDirty(true); setNotice(''); };
  const save = async (action: 'save' | 'publish' | 'unpublish') => {
    if (!selected || lock.current) return;
    const parsed = courseContentSchema.safeParse(selected.content);
    if (!parsed.success) { setError(parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(' ')); return; }
    const problem = action === 'publish' ? publicationProblem(parsed.data) : null;
    if (problem) { setError(problem); return; }
    if (action !== 'save' && !window.confirm(action === 'publish' ? 'Publish this version for all students?' : 'Hide this course from students? Your draft will be kept.')) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const saved = await requestJson('/api/admin/courses', courseRecordSchema, { ...jsonBody({ id: selected.id, expectedVersion: selected.version, content: parsed.data, action }), method: 'PUT' });
      setSelected(saved); setCourses(list => [saved, ...list.filter(item => item.id !== saved.id)]); setDirty(false);
      setNotice(action === 'publish' ? 'Published. Students can now open this version.' : action === 'unpublish' ? 'Course unpublished. Your draft is saved.' : 'Draft saved. The published version has not changed.');
    } catch (err) { setError(`${errorMessage(err)} Your edits are still in the editor.`); }
    finally { lock.current = false; setBusy(false); }
  };
  const content = selected?.content;
  const changeLesson = (index: number, lesson: CourseContent['lessons'][number]) => { if (content) edit({ ...content, lessons: content.lessons.map((item, i) => i === index ? lesson : item) }); };
  const move = <T,>(items: T[], index: number, offset: number) => { const next = [...items]; [next[index], next[index + offset]] = [next[index + offset], next[index]]; return next; };
  return <section className={styles.manager} aria-labelledby="course-manager-title">
    <header><h2 id="course-manager-title">Topics, sessions & courses</h2><p>Arrange topics, then add sessions with theory, worked examples and predefined quizzes. Existing lessons remain readable until you add sessions.</p></header>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <div className={styles.actions}><button disabled={busy || loading} onClick={() => choose(blank())}>New course</button><button disabled={busy} onClick={() => { void load().then(() => setError('')).catch(err => setError(errorMessage(err))); }}>Refresh course list</button><a href="/courses">Student courses</a></div>
    {loading ? <p role="status">Loading courses…</p> : <div className={styles.layout}>
      <nav aria-label="Manage courses">{!courses.length && <p>No courses yet. Create your first course.</p>}{courses.map(course => <button key={course.id} disabled={busy} aria-current={selected?.id === course.id ? 'page' : undefined} onClick={() => choose(course)}>{course.content.title}<small>{course.published ? 'Published + editable draft' : 'Draft only'}</small></button>)}</nav>
      {content && selected ? <fieldset disabled={busy} className={styles.editor}><legend>{dirty ? 'Unsaved changes' : 'Course editor'}</legend>
        <label>Course title<input maxLength={100} value={content.title} onChange={e => edit({ ...content, title: e.target.value })} /></label>
        <label>Description<textarea maxLength={2000} value={content.description} onChange={e => edit({ ...content, description: e.target.value })} /></label>
        <label>Student level<select value={content.level} onChange={e => edit({ ...content, level: e.target.value as CourseContent['level'] })}><option value="kid">Lower primary</option><option value="highschool">High school</option><option value="professional">Professional</option></select></label>
        {content.lessons.map((lesson, i) => <section className={styles.lesson} key={lesson.id}><h3>Topic {i + 1}</h3>
          <label>Lesson title<input maxLength={100} value={lesson.title} onChange={e => changeLesson(i, { ...lesson, title: e.target.value })} /></label>
          <label>Lesson content<textarea rows={6} maxLength={12000} value={lesson.body} onChange={e => changeLesson(i, { ...lesson, body: e.target.value })} /></label>
          <div className={styles.actions}><button disabled={i === 0} onClick={() => edit({ ...content, lessons: move(content.lessons, i, -1) })}>Move lesson up</button><button disabled={i === content.lessons.length - 1} onClick={() => edit({ ...content, lessons: move(content.lessons, i, 1) })}>Move lesson down</button><button onClick={() => { if (window.confirm(`Remove ${lesson.title} and its sublessons from this draft?`)) edit({ ...content, lessons: content.lessons.filter((_, n) => n !== i) }); }}>Remove lesson</button></div>
          {lesson.sublessons.map((sub, j) => <section className={styles.sublesson} key={sub.id}><h4>Sublesson {i + 1}.{j + 1}</h4>
            <label>Sublesson title<input maxLength={100} value={sub.title} onChange={e => changeLesson(i, { ...lesson, sublessons: lesson.sublessons.map((s, n) => n === j ? { ...s, title: e.target.value } : s) })} /></label>
            <label>Sublesson content<textarea rows={4} maxLength={12000} value={sub.body} onChange={e => changeLesson(i, { ...lesson, sublessons: lesson.sublessons.map((s, n) => n === j ? { ...s, body: e.target.value } : s) })} /></label>
            <div className={styles.actions}><button disabled={j === 0} onClick={() => changeLesson(i, { ...lesson, sublessons: move(lesson.sublessons, j, -1) })}>Move sublesson up</button><button disabled={j === lesson.sublessons.length - 1} onClick={() => changeLesson(i, { ...lesson, sublessons: move(lesson.sublessons, j, 1) })}>Move sublesson down</button><button onClick={() => { if (window.confirm(`Remove ${sub.title} from this draft?`)) changeLesson(i, { ...lesson, sublessons: lesson.sublessons.filter((_, n) => n !== j) }); }}>Remove sublesson</button></div>
          </section>)}
          <button disabled={lesson.sublessons.length >= 20} onClick={() => changeLesson(i, { ...lesson, sublessons: [...lesson.sublessons, { id: crypto.randomUUID(), title: 'New sublesson', body: '' }] })}>Add sublesson</button>
          <CourseSessionEditor sessions={lesson.sessions ?? []} onChange={sessions => changeLesson(i, { ...lesson, sessions })} />
        </section>)}
        <button disabled={content.lessons.length >= 30} onClick={() => edit({ ...content, lessons: [...content.lessons, { id: crypto.randomUUID(), title: 'New lesson', body: '', sublessons: [], sessions: [] }] })}>Add lesson</button>
        <details><summary>Preview student content</summary><CourseReading content={content} /></details>
        <div className={styles.actions}><button onClick={() => void save('save')}>{busy ? 'Saving…' : 'Save draft'}</button><button onClick={() => void save('publish')}>Publish this version</button>{selected.published && <button onClick={() => void save('unpublish')}>Unpublish</button>}</div>
      </fieldset> : <p>Select a course or create a new one to begin.</p>}
    </div>}
  </section>;
}
