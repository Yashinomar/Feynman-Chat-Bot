'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CheckCircle2, Lightbulb, TriangleAlert } from 'lucide-react';
import type { CourseSession } from '@/lib/course-content';
import { isCorrectAnswer } from '@/lib/course-sessions';
import styles from './session-player.module.css';

type Props = { session: CourseSession; topic: string; number: number; total: number; guest: boolean; onExit: () => void; onComplete: (answer: string[]) => Promise<boolean>; error: string };
export default function SessionPlayer({ session, topic, number, total, guest, onExit, onComplete, error }: Props) {
  const stages = ['Theory', ...(session.example.trim() ? ['Worked example'] : []), ...(session.quiz ? ['Quick check'] : [])];
  const [step, setStep] = useState(0);
  const [answer, setAnswer] = useState<string[]>(session.quiz?.kind === 'order' ? session.quiz.options.map(option => option.id).reverse() : []);
  const [checked, setChecked] = useState<'correct' | 'retry' | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const lock = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    // Each new panel starts beneath the navigation, including sessions opened far down the path.
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [step, saved]);
  const stage = stages[step];
  const quiz = session.quiz;
  const update = (next: string[]) => { setAnswer(next); setChecked(null); };
  const move = (index: number, offset: number) => { const next = [...answer]; [next[index], next[index + offset]] = [next[index + offset], next[index]]; update(next); };
  async function finish() {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try { if (await onComplete(answer)) setSaved(true); }
    finally { lock.current = false; setBusy(false); }
  }
  const last = step === stages.length - 1;
  return <section className={styles.player} aria-label="Learning session">
    <header className={styles.topbar}><button onClick={onExit} disabled={busy} className={styles.back}><ArrowLeft size={18} /> Back to sessions</button><span>{topic} · Session {number} of {total}</span></header>
    <div className={styles.progressRow}><span>{saved ? 'Session complete' : `${step + 1} of ${stages.length} · ${stage}`}</span><progress value={saved ? stages.length : step} max={stages.length} aria-label="Session progress" /></div>
    <article className={styles.content}>
      <span className={styles.kicker}>{saved ? 'NICE WORK' : stage}</span>
      <h1 ref={heading} tabIndex={-1}>{saved ? 'One more idea made clearer.' : session.title}</h1>
      {saved ? <div className={styles.success}><CheckCircle2 size={48} /><h2>Session complete</h2><p>Your progress is saved. Return to the topic to see your next session or Feynman checkpoint.</p></div> : <>
        {stage === 'Theory' && <>{session.visual && <ol className={styles.visual} aria-label="How the ideas connect">{session.visual.map((label, index) => <li key={index}><span>{label}</span>{index < session.visual!.length - 1 && <ArrowRight size={22} aria-hidden="true" />}</li>)}</ol>}<div className={styles.prose}>{session.theory.split('\n\n').map((text, i) => <p key={i}>{text}</p>)}</div></>}
        {stage === 'Worked example' && <div className={styles.example}><Lightbulb size={30} aria-hidden="true" /><h2>See the idea in action</h2><div className={styles.prose}>{session.example.split('\n\n').map((text, i) => <p key={i}>{text}</p>)}</div></div>}
        {stage === 'Quick check' && quiz && <fieldset className={styles.quiz} disabled={busy}><legend>{quiz.prompt}</legend>
          {quiz.kind === 'choice' && <div className={styles.options}>{quiz.options.map(option => <label key={option.id} className={answer[0] === option.id ? styles.selected : ''}><input type="radio" name={`quiz-${quiz.id}`} checked={answer[0] === option.id} onChange={() => update([option.id])} /><span>{option.label}</span></label>)}</div>}
          {quiz.kind === 'order' && <><p className={styles.help}>Use the arrows to put the steps in order.</p><ol className={styles.order}>{answer.map((id, index) => <li key={id}><span className={styles.position}>{index + 1}</span><strong>{quiz.options.find(option => option.id === id)?.label}</strong><div><button aria-label={`Move ${quiz.options.find(option => option.id === id)?.label} up`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={19} /></button><button aria-label={`Move ${quiz.options.find(option => option.id === id)?.label} down`} disabled={index === answer.length - 1} onClick={() => move(index, 1)}><ArrowDown size={19} /></button></div></li>)}</ol></>}
          {quiz.kind === 'match' && <div className={styles.matches}>{quiz.targets?.map((target, index) => <label key={index}><span>{target}</span><select value={answer[index] ?? ''} onChange={event => { const next = Array.from({ length: quiz.options.length }, (_, i) => answer[i] ?? ''); next[index] = event.target.value; update(next); }}><option value="">Choose a match</option>{[...quiz.options].reverse().map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>)}</div>}
          {checked && <div className={checked === 'correct' ? styles.feedbackGood : styles.feedbackRetry} role="status">{checked === 'correct' ? <CheckCircle2 size={22} /> : <TriangleAlert size={22} />}<div><strong>{checked === 'correct' ? 'That’s right.' : 'Not quite. Give it another try.'}</strong><p>{quiz.explanation}</p></div></div>}
        </fieldset>}
      </>}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </article>
    <footer className={styles.actions}>
      {!saved && <button className={styles.back} disabled={step === 0 || busy} onClick={() => setStep(value => value - 1)}><ArrowLeft size={18} /> Previous</button>}
      {saved ? <button className={styles.primary} onClick={onExit}>Return to sessions <ArrowRight size={18} /></button> : stage === 'Quick check' && checked !== 'correct' ? <button className={styles.primary} disabled={busy || !answer.length || answer.some(id => !id) || (quiz?.kind === 'match' && answer.length !== quiz.options.length)} onClick={() => setChecked(isCorrectAnswer(quiz, answer) ? 'correct' : 'retry')}>Check answer</button> : last ? guest ? <Link href="/login" className={styles.primary}>Sign in to save progress <ArrowRight size={18} /></Link> : <button className={styles.primary} disabled={busy} onClick={() => void finish()}>{busy ? 'Saving…' : 'Complete session'}<CheckCircle2 size={18} /></button> : <button className={styles.primary} onClick={() => setStep(value => value + 1)}>Continue <ArrowRight size={18} /></button>}
    </footer>
  </section>;
}
