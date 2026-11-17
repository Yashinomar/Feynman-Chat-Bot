'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  LockKeyhole,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import type { CheckpointReport } from '@/lib/checkpoint-report';
import type { LearningStep } from '@/lib/learning-path';
import type { StudySession } from '@/lib/client-api';
import styles from './live-learning-experience.module.css';

type ExperienceStatus = StudySession['status'];

type Props = {
  topic: string;
  levelLabel: string;
  status: ExperienceStatus;
  learningPath: LearningStep[];
  currentStep: number;
  masteryScore: number;
  messages: StudySession['messages'];
  report: CheckpointReport | null;
  reportUnavailable?: boolean;
  reviewMaterial?: { title: string; theory: string; example: string }[];
  onContinueCourse?: () => void;
  isSubmitting: boolean;
  checkpointError?: string;
  onFocusExplanation: () => void;
  onSubmitCheckpoint: (content: string) => Promise<boolean>;
  onReturnToLibrary: () => void;
};

function StatusPill({ status }: { status: CheckpointReport['criteria'][number]['status'] }) {
  const Icon = status === 'Demonstrated' ? CheckCircle2 : TriangleAlert;
  const tone = status === 'Demonstrated'
    ? styles.statusSuccess
    : status === 'Needs practice'
      ? styles.statusPractice
      : styles.statusPartial;
  return <span className={`${styles.statusPill} ${tone}`}><Icon aria-hidden="true" size={14} />{status}</span>;
}

function LearningRoute({ status, learningPath, currentStep }: {
  status: ExperienceStatus;
  learningPath: LearningStep[];
  currentStep: number;
}) {
  const allLessonsComplete = status !== 'active';
  return (
    <section className={styles.routePanel} aria-labelledby="learning-route-title">
      <div className={styles.sectionTitleRow}>
        <div>
          <p className={styles.sectionKicker}>Your route</p>
          <h2 id="learning-route-title">Build the idea step by step</h2>
        </div>
        <strong>{allLessonsComplete ? learningPath.length : Math.min(currentStep, learningPath.length)} / {learningPath.length}</strong>
      </div>
      <ol className={styles.lessonList}>
        {learningPath.map((step, index) => {
          const complete = allLessonsComplete || index < currentStep;
          const current = status === 'active' && index === currentStep;
          return (
            <li key={`${step.title}-${index}`} className={`${styles.lessonItem} ${current ? styles.lessonReady : ''}`} aria-current={current ? 'step' : undefined}>
              <span className={`${styles.lessonIndex} ${complete ? styles.lessonComplete : ''}`}>
                {complete ? <Check aria-hidden="true" size={16} /> : current ? <Circle aria-hidden="true" size={15} /> : <LockKeyhole aria-hidden="true" size={15} />}
              </span>
              <span className={styles.lessonCopy}><strong>{step.title}</strong><small>{step.objective}</small></span>
              <span className={`${styles.compactStatus} ${complete ? styles.completeStatus : current ? styles.readyStatus : ''}`}>
                {complete ? 'Complete' : current ? 'Up next' : 'Locked'}
              </span>
            </li>
          );
        })}
        <li className={`${styles.lessonItem} ${status === 'active' ? styles.checkpointLocked : styles.checkpointReady}`}>
          <span className={styles.lessonIndex}>{status === 'active' ? <LockKeyhole aria-hidden="true" size={16} /> : <Sparkles aria-hidden="true" size={16} />}</span>
          <span className={styles.lessonCopy}><strong>Feynman checkpoint</strong><small>Explain the topic in your own words</small></span>
          <span className={`${styles.compactStatus} ${status !== 'active' ? styles.readyStatus : ''}`}>
            {status === 'active' ? 'Locked' : status === 'checkpoint' ? 'Ready' : 'Complete'}
          </span>
        </li>
      </ol>
    </section>
  );
}

function ActiveView({ topic, levelLabel, learningPath, currentStep, masteryScore, onFocusExplanation }: Props) {
  const step = learningPath[Math.min(currentStep, learningPath.length - 1)];
  const completed = Math.min(currentStep, learningPath.length);
  const progress = learningPath.length ? Math.round((completed / learningPath.length) * 100) : 0;
  return (
    <div className={styles.experience}>
      <section className={styles.courseHero} aria-labelledby="live-course-title">
        <div><p className={styles.eyebrow}>Learning path · {levelLabel}</p><h1 id="live-course-title">{topic}</h1><p>Learn each idea, explain it simply, then connect everything in a Feynman checkpoint.</p></div>
        <div className={styles.heroMark} aria-hidden="true"><span>{completed}</span><small>of {learningPath.length}</small></div>
      </section>
      <div className={styles.pathLayout}>
        <LearningRoute status="active" learningPath={learningPath} currentStep={currentStep} />
        <aside className={styles.missionCard} aria-labelledby="mission-title">
          <p className={styles.eyebrow}>Today&apos;s mission</p>
          <h2 id="mission-title">{step?.title ?? 'Continue learning'}</h2>
          <div className={styles.progressTrack} role="progressbar" aria-label={`${progress}% of lessons complete`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div>
          <p>{step?.objective ?? 'Explain the current idea in your own words.'}</p>
          <p className={styles.masteryNote}>{masteryScore}% current understanding</p>
          <button type="button" className={styles.primaryButton} onClick={onFocusExplanation}>Explain this step <ArrowRight aria-hidden="true" size={17} /></button>
        </aside>
      </div>
    </div>
  );
}

function CheckpointView({ topic, learningPath, messages, isSubmitting, checkpointError, onSubmitCheckpoint }: Props) {
  const [answer, setAnswer] = useState('');
  const [localError, setLocalError] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, []);
  const submit = async () => {
    const content = answer.trim();
    if (!content || content.length > 6000) {
      setLocalError('Please write between 1 and 6,000 characters.');
      return;
    }
    setLocalError('');
    await onSubmitCheckpoint(content);
  };
  return (
    <div className={styles.experience}>
      <header className={styles.screenHeading}>
        <p className={styles.eyebrow}>Feynman checkpoint unlocked</p>
        <h1 ref={headingRef} tabIndex={-1}>Teach {topic} back</h1>
        <p>Explain the topic simply, connect the causes, and apply the ideas to a new example or limitation.</p>
      </header>
      <div className={styles.checkpointLayout}>
        <section className={styles.promptCard} aria-labelledby="checkpoint-prompt">
          <span className={styles.promptNumber}>01</span>
          <div><p className={styles.sectionKicker}>Explain and apply</p><h2 id="checkpoint-prompt">What have you learned?</h2><p>Connect the main ideas from all {learningPath.length} sessions. Explain how they work together, then use them in a fresh example or describe a limitation.</p><ul className={styles.promptTopics}>{learningPath.map((step, index) => <li key={index}>{step.title}</li>)}</ul></div>
        </section>
        <section className={styles.answerCard} aria-labelledby="checkpoint-answer-title">
          <div className={styles.answerHeader}><div><p className={styles.sectionKicker}>Your own words</p><h2 id="checkpoint-answer-title">Your explanation</h2></div><span><Clock3 aria-hidden="true" size={15} /> About 3 min</span></div>
          <textarea aria-label="Your checkpoint explanation" value={answer} onChange={event => setAnswer(event.target.value)} disabled={isSubmitting} rows={8} maxLength={6000} placeholder={`Explain ${topic} as if you were teaching a classmate…`} />
          <div className={styles.answerMeta}><span>{answer.length.toLocaleString()} / 6,000</span><span>Your draft stays here if submission fails.</span></div>
          {(localError || checkpointError) && <p className={styles.inlineError} role="alert"><TriangleAlert aria-hidden="true" size={16} />{localError || checkpointError}</p>}
          <button type="button" className={styles.primaryButton} onClick={() => void submit()} disabled={isSubmitting || !answer.trim()}>{isSubmitting ? 'Building your report…' : 'Submit explanation'} {!isSubmitting && <ArrowRight aria-hidden="true" size={17} />}</button>
        </section>
      </div>
      {!!messages.length && <details className={styles.conversation}><summary>Previous lesson conversation</summary><div>{messages.map(message => <p key={message.id}><strong>{message.role === 'ai' ? 'Feyman' : 'You'}:</strong> {message.content}</p>)}</div></details>}
    </div>
  );
}

function ReportView({ topic, learningPath, report, onReturnToLibrary, reviewMaterial, onContinueCourse }: Props & { report: CheckpointReport }) {
  const [reviewStep, setReviewStep] = useState<number | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const nodeLabels = new Map(report.conceptMap.nodes.map(node => [node.id, node.label]));
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [reviewStep]);
  if (reviewStep !== null) {
    const step = learningPath[reviewStep];
    return (
      <div className={styles.experience}>
        <button type="button" className={styles.secondaryButton} onClick={() => setReviewStep(null)}><ArrowLeft aria-hidden="true" size={17} /> Return to report</button>
        <header className={styles.screenHeading}><p className={styles.eyebrow}>Targeted review · Lesson {reviewStep + 1}</p><h1 ref={headingRef} tabIndex={-1}>{step.title}</h1><p>{report.firstReview.explanation}</p></header>
        <section className={styles.reviewLesson}><p className={styles.sectionKicker}>Session review</p><h2>Repair this connection</h2><p>{step.objective}</p>{reviewMaterial?.[reviewStep] && <div className={styles.reviewMaterial}><h3>Theory</h3><p>{reviewMaterial[reviewStep].theory}</p><h3>Worked example</h3><p>{reviewMaterial[reviewStep].example}</p></div>}<div className={styles.reviewPrompt}><strong>Try this next</strong><p>Explain this lesson again, then reconnect it to the rest of {topic} in one or two sentences.</p></div></section>
      </div>
    );
  }
  return (
    <div className={styles.experience}>
      <header className={styles.screenHeading}><p className={styles.eyebrow}>Feynman checkpoint complete</p><h1 ref={headingRef} tabIndex={-1}>Your teach-back report</h1><p>{report.summary}</p></header>
      <div className={styles.reportTopGrid}>
        <section className={styles.conceptPanel} aria-labelledby="concept-map-title">
          <div className={styles.panelHeading}><div><p className={styles.sectionKicker}>How your ideas connect</p><h2 id="concept-map-title">Concept map</h2></div><span>{report.conceptMap.nodes.filter(node => node.status === 'connected').length} / 3 connected</span></div>
          <div className={styles.conceptMap}>{report.conceptMap.nodes.map(node => <article key={node.id} className={`${styles.conceptNode} ${node.status === 'connected' ? styles.conceptStrong : styles.conceptReview}`}><span>{node.status === 'connected' ? <CheckCircle2 aria-hidden="true" size={16} /> : <TriangleAlert aria-hidden="true" size={16} />}</span><strong>{node.label}</strong><small>{node.status === 'connected' ? 'Connected' : 'Review this idea'}</small></article>)}</div>
          <ul className={styles.connectionList} aria-label="Concept connections">
            {report.conceptMap.links.map((link, index) => <li key={`${link.from}-${link.to}-${index}`} className={link.status === 'connected' ? styles.connectionStrong : styles.connectionReview}>
              <div className={styles.connectionRoute}><strong>{nodeLabels.get(link.from)}</strong><ArrowRight aria-hidden="true" size={16} /><strong>{nodeLabels.get(link.to)}</strong></div>
              <p>{link.status === 'connected' ? <CheckCircle2 aria-hidden="true" size={14} /> : <TriangleAlert aria-hidden="true" size={14} />}<span>{link.label}</span><small>{link.status === 'connected' ? 'Connected' : 'Review this connection'}</small></p>
            </li>)}
          </ul>
        </section>
        <aside className={styles.reviewFirst} aria-labelledby="review-first-title"><p className={styles.reviewLabel}><Clock3 aria-hidden="true" size={14} /> Review first</p><h2 id="review-first-title">{report.firstReview.title}</h2><p>{report.firstReview.explanation}</p><button type="button" className={styles.reviewButton} onClick={() => setReviewStep(report.firstReview.stepIndex)}>Review lesson {report.firstReview.stepIndex + 1} <ArrowRight aria-hidden="true" size={16} /></button></aside>
      </div>
      <section className={styles.rubricSection} aria-labelledby="rubric-title">
        <div className={styles.panelHeading}><div><p className={styles.sectionKicker}>Complete feedback</p><h2 id="rubric-title">Your evidence and next steps</h2></div><p>Every criterion includes what your answer showed and one action to improve it.</p></div>
        <div className={styles.rubricHeader} aria-hidden="true"><span>Criterion</span><span>Result</span><span>Evidence</span><span>Next step</span></div>
        <div className={styles.rubricList}>{report.criteria.map(criterion => <article key={criterion.name} className={styles.rubricRow}><h3>{criterion.name}</h3><div><StatusPill status={criterion.status} /></div><p><span className={styles.mobileLabel}>Evidence</span>{criterion.evidence}</p><p><span className={styles.mobileLabel}>Next step</span>{criterion.nextStep}</p></article>)}</div>
      </section>
      <div className={styles.reportActions}><button type="button" className={styles.primaryButton} onClick={onContinueCourse ?? onReturnToLibrary}>{onContinueCourse ? 'Continue learning path' : 'Return to library'} <ArrowRight aria-hidden="true" size={17} /></button></div>
    </div>
  );
}

export default function LiveLearningExperience(props: Props) {
  if (props.status === 'active') return <ActiveView {...props} />;
  if (props.status === 'checkpoint') return <CheckpointView {...props} />;
  if (props.report) return <ReportView {...props} report={props.report} />;
  if (props.reportUnavailable) return <p className={styles.reportWarning} role="alert"><TriangleAlert aria-hidden="true" size={17} />The saved feedback report is unavailable. Your lesson conversation is still available below.</p>;
  return null;
}
