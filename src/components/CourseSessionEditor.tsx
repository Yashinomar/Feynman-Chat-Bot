'use client';

import type { CourseSession, SessionQuiz } from '@/lib/course-content';
import styles from './courses.module.css';

export default function CourseSessionEditor({ sessions, onChange }: { sessions: CourseSession[]; onChange: (sessions: CourseSession[]) => void }) {
  const update = (index: number, patch: Partial<CourseSession>) => onChange(sessions.map((session, i) => i === index ? { ...session, ...patch } : session));
  const move = (index: number, offset: number) => { const next = [...sessions]; [next[index], next[index + offset]] = [next[index + offset], next[index]]; onChange(next); };
  function newQuiz(): SessionQuiz {
    const options = [{ id: crypto.randomUUID(), label: 'First option' }, { id: crypto.randomUUID(), label: 'Second option' }];
    return { id: crypto.randomUUID(), kind: 'choice', prompt: 'Which statement is correct?', options, answer: [options[0].id], explanation: 'Explain why the answer is correct.' };
  }
  return <section><h4>Sessions in this topic</h4><p>Each session has a theory screen, a worked example, and a quiz. A Feynman checkpoint appears after every five sessions across the course.</p>
    {sessions.map((session, index) => {
      const quiz = session.quiz;
      const changeQuiz = (patch: Partial<SessionQuiz>) => { if (quiz) update(index, { quiz: { ...quiz, ...patch } }); };
      return <fieldset key={session.id} className={styles.sublesson}><legend>Session {index + 1}</legend>
        <label>Session title<input maxLength={100} value={session.title} onChange={event => update(index, { title: event.target.value })} /></label>
        <label>Theory<textarea rows={5} maxLength={12000} value={session.theory} onChange={event => update(index, { theory: event.target.value })} /></label>
        <label>Optional flow diagram (2–4 labels, one per line)<textarea rows={4} value={session.visual?.join('\n') ?? ''} onChange={event => update(index, { visual: event.target.value ? event.target.value.split('\n') : undefined })} /></label>
        <label>Worked example<textarea rows={4} maxLength={12000} value={session.example} onChange={event => update(index, { example: event.target.value })} /></label>
        {quiz ? <fieldset className={styles.sublesson}><legend>Predefined quiz</legend>
          <label>Question type<select value={quiz.kind} onChange={event => { const kind = event.target.value as SessionQuiz['kind']; changeQuiz({ kind, answer: kind === 'choice' ? [quiz.options[0].id] : quiz.options.map(option => option.id), targets: kind === 'match' ? quiz.options.map((_, i) => `Description ${i + 1}`) : undefined }); }}><option value="choice">Multiple choice</option><option value="order">Put in order</option><option value="match">Match the pairs</option></select></label>
          <label>Question<input maxLength={1000} value={quiz.prompt} onChange={event => changeQuiz({ prompt: event.target.value })} /></label>
          {quiz.options.map((option, optionIndex) => <label key={option.id}>Option {optionIndex + 1}<input maxLength={300} value={option.label} onChange={event => changeQuiz({ options: quiz.options.map(item => item.id === option.id ? { ...item, label: event.target.value } : item) })} /></label>)}
          <div className={styles.actions}><button type="button" disabled={quiz.options.length >= 6} onClick={() => { const option = { id: crypto.randomUUID(), label: 'New option' }; changeQuiz({ options: [...quiz.options, option], answer: quiz.kind === 'choice' ? quiz.answer : [...quiz.answer, option.id], ...(quiz.kind === 'match' ? { targets: [...(quiz.targets ?? []), 'New description'] } : {}) }); }}>Add option</button><button type="button" disabled={quiz.options.length <= 2} onClick={() => { const options = quiz.options.slice(0, -1); const remaining = quiz.answer.filter(id => options.some(option => option.id === id)); changeQuiz({ options, answer: remaining.length ? remaining : [options[0].id], ...(quiz.kind === 'match' ? { targets: quiz.targets?.slice(0, -1) } : {}) }); }}>Remove last option</button></div>
          {Array.from({ length: quiz.kind === 'choice' ? 1 : quiz.options.length }, (_, answerIndex) => <div key={answerIndex}>
            {quiz.kind === 'match' && <label>Match description {answerIndex + 1}<input maxLength={300} value={quiz.targets?.[answerIndex] ?? ''} onChange={event => changeQuiz({ targets: quiz.options.map((_, i) => i === answerIndex ? event.target.value : quiz.targets?.[i] ?? '') })} /></label>}
            <label>{quiz.kind === 'choice' ? 'Correct answer' : quiz.kind === 'order' ? `Correct position ${answerIndex + 1}` : `Correct match ${answerIndex + 1}`}<select value={quiz.answer[answerIndex] ?? ''} onChange={event => changeQuiz({ answer: Array.from({ length: quiz.kind === 'choice' ? 1 : quiz.options.length }, (_, i) => i === answerIndex ? event.target.value : quiz.answer[i]) })}>{quiz.options.map((option, i) => <option key={option.id} value={option.id}>{i + 1}. {option.label}</option>)}</select></label>
          </div>)}
          <label>Answer explanation<textarea rows={3} maxLength={2000} value={quiz.explanation} onChange={event => changeQuiz({ explanation: event.target.value })} /></label>
        </fieldset> : <button type="button" onClick={() => update(index, { quiz: newQuiz() })}>Add predefined quiz</button>}
        <div className={styles.actions}><button type="button" disabled={index === 0} onClick={() => move(index, -1)}>Move session up</button><button type="button" disabled={index === sessions.length - 1} onClick={() => move(index, 1)}>Move session down</button><button type="button" onClick={() => { if (window.confirm(`Remove ${session.title} from this draft?`)) onChange(sessions.filter((_, i) => i !== index)); }}>Remove session</button></div>
      </fieldset>;
    })}
    <button type="button" disabled={sessions.length >= 20} onClick={() => onChange([...sessions, { id: crypto.randomUUID(), title: 'New session', theory: '', example: '', quiz: newQuiz() }])}>Add session</button>
  </section>;
}
