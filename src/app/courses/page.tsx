'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { ArrowRight, BookOpen, Check, ChevronDown, Leaf, LockKeyhole, MessageCircle, Target } from 'lucide-react';
import { courseContentSchema } from '@/lib/course-content';
import { flattenSessions, topicSessions } from '@/lib/course-sessions';
import { starterCourse } from '@/lib/starter-course';
import SessionPlayer from '@/components/learning-path/SessionPlayer';
import { errorMessage, requestJson, jsonBody, RequestError } from '@/lib/client-api';
import styles from './path.module.css';

const catalog = z.array(z.object({ id: z.string(), content: courseContentSchema }));
const stateSchema = z.object({ completed: z.array(z.string()), revisions: z.record(z.string(), z.string()), checkpoints: z.array(z.object({ block: z.number(), id: z.string().nullable(), status: z.string() })) });
export default function Courses() {
  const router = useRouter();
  const [courses, setCourses] = useState<z.infer<typeof catalog>>([starterCourse]);
  const [selected, setSelected] = useState(starterCourse.id);
  const [state, setState] = useState<z.infer<typeof stateSchema> & { courseId: string }>({ courseId: '', completed: [], revisions: {}, checkpoints: [] });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [guest, setGuest] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    requestJson('/api/courses', catalog).then(published => { if (active) setCourses([starterCourse, ...published]); })
      .catch(err => { if (active && !(err instanceof RequestError && err.status === 401)) setError(errorMessage(err)); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    requestJson(`/api/courses/sessions?courseId=${encodeURIComponent(selected)}`, stateSchema)
      .then(saved => { if (active) { setState({ courseId: selected, ...saved }); setGuest(false); } })
      .catch(err => { if (active) { setState({ courseId: selected, completed: [], revisions: {}, checkpoints: [] }); if (err instanceof RequestError && err.status === 401) setGuest(true); else setError(errorMessage(err)); } });
    return () => { active = false; };
  }, [selected]);
  const course = courses.find(item => item.id === selected) ?? starterCourse;
  const sessions = flattenSessions(course.content);
  const loading = state.courseId !== selected;
  const completed = new Set(loading ? [] : state.completed);
  const count = sessions.filter(session => completed.has(session.id)).length;
  const nextIndex = sessions.findIndex(session => !completed.has(session.id));
  const activeSession = sessions.find(session => session.id === activeId);
  const open = (id: string) => { setActionError(''); setActiveId(id); };
  async function finish(answer: string[]) {
    if (!activeSession || lock.current) return false;
    lock.current = true; setActionError('');
    try {
      const saved = await requestJson('/api/courses/sessions', z.object({ completed: z.array(z.string()) }), jsonBody({ courseId: selected, sessionId: activeSession.id, revision: state.revisions[activeSession.id], answer }));
      setState(previous => ({ ...previous, completed: saved.completed })); return true;
    } catch (err) { setActionError(errorMessage(err)); return false; }
    finally { lock.current = false; }
  }
  async function checkpoint(block: number) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setActionError('');
    try { const result = await requestJson('/api/courses/checkpoint', z.object({ id: z.string() }), jsonBody({ courseId: selected, block })); router.push(`/chat/${result.id}`); }
    catch (err) { setActionError(errorMessage(err)); }
    finally { lock.current = false; setBusy(false); }
  }
  if (activeSession) return <SessionPlayer key={activeSession.id} session={activeSession} topic={activeSession.topicTitle} number={sessions.findIndex(session => session.id === activeId) + 1} total={sessions.length} guest={guest} onExit={() => setActiveId(null)} onComplete={finish} error={actionError} />;
  return <main className={styles.page}>
    <header className={styles.heading}><div><span className={styles.eyebrow}>A LITTLE EVERY DAY</span><h1>Your learning path</h1><p>Choose a topic. Take one session at a time.</p></div><span className={styles.subject}><Leaf size={20} /> Learn by explaining</span></header>
    {guest && <p className={styles.welcome}>Try the first session, including its quiz. <Link href="/login">Sign in to save your progress</Link>.</p>}
    {error && <p className={styles.error} role="alert">{error} <button onClick={() => window.location.reload()}>Reload path</button></p>}
    <div className={styles.sessionLayout}>
      <aside className={styles.courseRail} aria-label="Courses"><h2>Your courses</h2>{courses.map(item => <button key={item.id} className={`${styles.courseChoice} ${selected === item.id ? styles.selected : ''}`} aria-pressed={selected === item.id} onClick={() => { setSelected(item.id); setError(''); setActionError(''); }}><BookOpen size={23} /><span>{item.content.title}<small>{item.content.lessons.length} TOPICS · {flattenSessions(item.content).length} SESSIONS</small></span></button>)}<Link href="/library" className={styles.textLink}>Saved practice <ArrowRight size={16} /></Link></aside>
      <section className={styles.topicPath} aria-label={`${course.content.title} learning path`}>
        <div className={styles.unitBanner}><div><span className={styles.eyebrow}>YOUR COURSE</span><h2>{course.content.title}</h2></div><BookOpen size={30} /></div>
        <p className={styles.courseIntro}>{course.content.description}</p>
        <div className={styles.progressLabel}><span>{count} of {sessions.length} sessions complete</span><span>{Math.round(count / Math.max(1, sessions.length) * 100)}%</span></div>
        <progress className={styles.progress} value={count} max={sessions.length || 1} aria-label="Sessions complete" />
        {loading && <p role="status">Loading your sessions…</p>}
        <div className={styles.topics}>{course.content.lessons.map((topic, topicIndex) => {
          const items = topicSessions(topic);
          return <details key={topic.id} className={styles.topic} open><summary><span className={styles.topicNumber}>{topicIndex + 1}</span><span><small>TOPIC {topicIndex + 1}</small><strong>{topic.title}</strong><span>{items.filter(session => completed.has(session.id)).length} / {items.length} sessions complete</span></span><ChevronDown size={20} /></summary>
            <ol className={styles.sessionList}>{items.map(item => {
              const index = sessions.findIndex(session => session.id === item.id);
              const done = completed.has(item.id);
              const checkpointBlocked = state.checkpoints.some(checkpoint => checkpoint.block < Math.floor(index / 5) && checkpoint.status !== 'completed');
              const locked = !done && (index !== nextIndex || checkpointBlocked);
              const checkpointDue = (index + 1) % 5 === 0;
              const ready = sessions.slice(index - 4, index + 1).every(session => completed.has(session.id));
              return <li key={item.id}><div className={`${styles.sessionCard} ${!locked && !done ? styles.sessionCurrent : ''}`}><span className={styles.sessionIcon}>{done ? <Check size={25} /> : locked ? <LockKeyhole size={23} /> : <BookOpen size={25} />}</span><div><small>SESSION {index + 1} {done ? '· COMPLETE' : locked ? '· LOCKED' : '· UP NEXT'}</small><h3>{item.title}</h3><p>Theory{item.example ? ' · Example' : ''}{item.quiz ? ` · ${item.quiz.kind === 'choice' ? 'Quick quiz' : item.quiz.kind === 'order' ? 'Ordering practice' : 'Matching practice'}` : ''}</p></div><button disabled={locked || loading} className={styles.sessionAction} onClick={() => open(item.id)} aria-label={`${done ? 'Review' : 'Start'} session: ${item.title}`}>{done ? 'Review' : locked ? 'Locked' : 'Learn'}<ArrowRight size={16} /></button></div>
              {checkpointDue && <section className={`${styles.checkpoint} ${ready ? styles.checkpointReady : ''}`} aria-label={`Feynman checkpoint ${Math.floor(index / 5) + 1}`}><MessageCircle size={27} /><div><span className={styles.eyebrow}>AFTER FIVE SESSIONS</span><h3>Connect it. Explain it.</h3><p>{state.checkpoints[Math.floor(index / 5)]?.status === 'completed' ? 'Checkpoint complete. Your feedback is saved.' : ready ? 'Explain these five sessions to unlock the next group and get feedback.' : `Complete sessions ${index - 3}–${index + 1} to unlock your checkpoint.`}</p></div><button className={styles.checkpointButton} disabled={!ready || busy} onClick={() => checkpoint(Math.floor(index / 5))}>{busy ? 'Opening…' : state.checkpoints[Math.floor(index / 5)]?.status === 'completed' ? 'View feedback' : 'Open checkpoint'}<ArrowRight size={16} /></button></section>}
              </li>;
            })}</ol>
          </details>;
        })}</div>
        {actionError && <p role="alert" className={styles.error}>{actionError}</p>}
      </section>
      <aside className={styles.support}><section className={styles.card}><Target size={30} className={styles.greenIcon} /><h2>One session, one clear idea.</h2><p>Read the theory, explore an example, then check your understanding with a short quiz.</p><small>After five completed sessions, explain the connections in your own words. Your report covers accuracy, coverage, reasoning, clarity and application.</small></section></aside>
    </div>
  </main>;
}
