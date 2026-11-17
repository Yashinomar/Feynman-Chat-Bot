'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  FlaskConical,
  Leaf,
  Lightbulb,
  LockKeyhole,
  RotateCcw,
  Sparkles,
  Target,
  TriangleAlert,
} from 'lucide-react';
import styles from './learning-path-demo.module.css';

type DemoView =
  | 'path'
  | 'lesson'
  | 'lessonRetry'
  | 'lessonReady'
  | 'unlocked'
  | 'checkpoint'
  | 'report'
  | 'review'
  | 'unit2';

type CriterionStatus = 'Demonstrated' | 'Partly demonstrated' | 'Needs practice';

type RubricCriterion = {
  name: string;
  status: CriterionStatus;
  evidence: string;
  nextStep: string;
};

const PREDEFINED_ANSWER =
  'Leaves use light energy, water, and carbon dioxide to make sugar. The sugar helps the plant grow. I think both seedlings would grow at the same rate because they get the same light.';

const LESSONS = [
  { title: 'Light powers the process', subtitle: 'Where plants get their energy' },
  { title: 'Water enters through roots', subtitle: 'How water reaches the leaves' },
  { title: 'Carbon dioxide enters leaves', subtitle: 'Where the carbon in sugar comes from' },
  { title: 'Leaves make sugars', subtitle: 'How inputs become stored energy' },
  { title: 'Plants release oxygen', subtitle: 'What leaves release as sugars form' },
] as const;

const RUBRIC: RubricCriterion[] = [
  {
    name: 'Accuracy',
    status: 'Demonstrated',
    evidence: 'You correctly described what leaves use to make sugar.',
    nextStep: 'Keep this precise description in your next explanation.',
  },
  {
    name: 'Coverage',
    status: 'Partly demonstrated',
    evidence: 'You covered the inputs and sugar.',
    nextStep: 'Add what the plant releases during photosynthesis.',
  },
  {
    name: 'Cause-and-effect reasoning',
    status: 'Partly demonstrated',
    evidence: 'You linked sugar to growth.',
    nextStep: 'Explain how less carbon dioxide affects how much sugar the plant can make.',
  },
  {
    name: 'Clarity',
    status: 'Demonstrated',
    evidence: 'You used plain language and kept your explanation easy to follow.',
    nextStep: 'Keep using short sentences and familiar words.',
  },
  {
    name: 'Application',
    status: 'Needs practice',
    evidence: 'You held light constant, but did not use carbon dioxide in the prediction.',
    nextStep: 'Predict what happens when carbon dioxide becomes the limiting factor.',
  },
];

const transitionMessage: Record<DemoView, string> = {
  path: 'Learning path opened. Lesson five is ready.',
  lesson: 'Lesson five opened.',
  lessonRetry: 'Try the quick check again.',
  lessonReady: 'Quick check correct. Lesson five can now be completed.',
  unlocked: 'Lesson five complete. The Feynman checkpoint is unlocked.',
  checkpoint: 'Feynman checkpoint opened.',
  report: 'Teach-back feedback report opened.',
  review: 'Targeted carbon dioxide review opened.',
  unit2: 'Unit 2 is unlocked.',
};

function StatusPill({ status }: { status: CriterionStatus }) {
  const className =
    status === 'Demonstrated'
      ? styles.statusSuccess
      : status === 'Needs practice'
        ? styles.statusPractice
        : styles.statusPartial;
  const Icon = status === 'Demonstrated' ? CheckCircle2 : TriangleAlert;

  return (
    <span className={`${styles.statusPill} ${className}`}>
      <Icon aria-hidden="true" size={14} />
      {status}
    </span>
  );
}

function ScreenHeading({ eyebrow, title, description, headingRef }: {
  eyebrow: string;
  title: string;
  description: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <header className={styles.screenHeading}>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h1 ref={headingRef} tabIndex={-1}>{title}</h1>
      <p>{description}</p>
    </header>
  );
}

function CourseHero() {
  return (
    <section className={styles.courseHero} aria-labelledby="course-title">
      <div>
        <p className={styles.eyebrow}>Learning path · High-school biology</p>
        <h2 id="course-title">Photosynthesis</h2>
        <p>Follow the energy and matter that help a plant grow.</p>
      </div>
      <div className={styles.heroIllustration} aria-hidden="true">
        <span className={styles.sun} />
        <span className={styles.stem} />
        <span className={`${styles.leafShape} ${styles.leafLeft}`} />
        <span className={`${styles.leafShape} ${styles.leafRight}`} />
        <span className={styles.flowDotOne} />
        <span className={styles.flowDotTwo} />
      </div>
    </section>
  );
}

function LearningPath({ unlocked, onOpenLesson, onOpenCheckpoint }: {
  unlocked: boolean;
  onOpenLesson: () => void;
  onOpenCheckpoint: () => void;
}) {
  return (
    <>
      <CourseHero />
      <div className={styles.pathLayout}>
        <section className={styles.routePanel} aria-labelledby="unit-one-title">
          <div className={styles.sectionTitleRow}>
            <div>
              <p className={styles.sectionKicker}>Unit 01</p>
              <h2 id="unit-one-title">How plants build sugars</h2>
            </div>
            <strong>{unlocked ? '5 / 5' : '4 / 5'}</strong>
          </div>
          <ol className={styles.lessonList}>
            {LESSONS.map((lesson, index) => {
              const completed = index < 4 || unlocked;
              const ready = index === 4 && !unlocked;
              return (
                <li key={lesson.title} className={`${styles.lessonItem} ${ready ? styles.lessonReady : ''}`}>
                  <span className={`${styles.lessonIndex} ${completed ? styles.lessonComplete : ''}`}>
                    {completed ? <Check aria-hidden="true" size={16} /> : '05'}
                  </span>
                  <span className={styles.lessonCopy}>
                    <strong>{lesson.title}</strong>
                    <small>{lesson.subtitle}</small>
                  </span>
                  <span className={`${styles.compactStatus} ${completed ? styles.completeStatus : styles.readyStatus}`}>
                    {completed ? <><Check aria-hidden="true" size={13} /> Complete</> : <><Circle aria-hidden="true" size={13} /> Up next</>}
                  </span>
                </li>
              );
            })}
            <li className={`${styles.lessonItem} ${unlocked ? styles.checkpointReady : styles.checkpointLocked}`}>
              <span className={styles.lessonIndex}>
                {unlocked ? <Sparkles aria-hidden="true" size={17} /> : <LockKeyhole aria-hidden="true" size={17} />}
              </span>
              <span className={styles.lessonCopy}>
                <strong>Feynman checkpoint</strong>
                <small>Explain the unit in your own words</small>
              </span>
              <span className={`${styles.compactStatus} ${unlocked ? styles.readyStatus : ''}`}>
                {unlocked ? 'Ready' : 'Locked'}
              </span>
            </li>
          </ol>
        </section>

        <aside className={styles.pathAside} aria-label="Daily learning plan">
          <section className={styles.missionCard}>
            <p className={styles.eyebrow}>Today&apos;s mission</p>
            <h2>{unlocked ? 'Teach it back' : 'Finish lesson five'}</h2>
            <div
              className={styles.progressTrack}
              role="progressbar"
              aria-label={`${unlocked ? 100 : 80}% of Unit 1 complete`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={unlocked ? 100 : 80}
            >
              <span style={{ width: unlocked ? '100%' : '80%' }} />
            </div>
            <p>{unlocked ? 'Your checkpoint is ready. Explain what you understand.' : 'About 6 minutes. Your teach-back unlocks next.'}</p>
            {unlocked ? (
              <button type="button" className={styles.primaryButton} onClick={onOpenCheckpoint}>
                Open Feynman checkpoint <ArrowRight aria-hidden="true" size={17} />
              </button>
            ) : (
              <button type="button" className={styles.primaryButton} onClick={onOpenLesson}>
                Open lesson five <ArrowRight aria-hidden="true" size={17} />
              </button>
            )}
          </section>
          <section className={styles.previewCard}>
            <span className={styles.previewIcon}><Target aria-hidden="true" size={19} /></span>
            <div>
              <p className={styles.sectionKicker}>Up next · Unit 02</p>
              <h3>What limits photosynthesis?</h3>
              <p>Use what you learned to predict plant growth.</p>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}

function LessonScreen({ view, headingRef, onBack, onCheck, onComplete }: {
  view: Extract<DemoView, 'lesson' | 'lessonRetry' | 'lessonReady'>;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
  onCheck: (answer: string) => void;
  onComplete: () => void;
}) {
  const [answer, setAnswer] = useState('');
  const isRetry = view === 'lessonRetry';
  const isReady = view === 'lessonReady';

  return (
    <>
      <button type="button" className={styles.backButton} onClick={onBack}>
        <ArrowLeft aria-hidden="true" size={17} /> Back to learning path
      </button>
      <ScreenHeading
        eyebrow="Unit 01 · Lesson 05"
        title="Plants release oxygen"
        description="Learn what leaves release as they use light, water, and carbon dioxide to make sugars."
        headingRef={headingRef}
      />
      <div className={styles.lessonLayout}>
        <article className={styles.lessonArticle}>
          <section>
            <div className={styles.contentIcon}><Leaf aria-hidden="true" size={21} /></div>
            <div>
              <p className={styles.sectionKicker}>The key idea</p>
              <h2>Sugar stays. Oxygen leaves.</h2>
              <p>Inside a leaf, light energy helps rearrange carbon dioxide and water. The plant keeps much of the sugar for energy and growth, while oxygen moves out through tiny openings in the leaf.</p>
            </div>
          </section>
          <section className={styles.workedExample}>
            <div className={styles.contentIcon}><FlaskConical aria-hidden="true" size={21} /></div>
            <div>
              <p className={styles.sectionKicker}>Worked example</p>
              <h2>Look for the bubbles</h2>
              <p>An aquatic plant placed under a lamp releases bubbles into the water. Those bubbles contain oxygen made during photosynthesis.</p>
              <div className={styles.equation} aria-label="Carbon dioxide plus water, with light energy, produces sugar plus oxygen">
                <span>Carbon dioxide + water</span>
                <ArrowRight aria-hidden="true" size={18} />
                <span>Sugar + oxygen</span>
              </div>
            </div>
          </section>
        </article>

        <section className={styles.quickCheck} aria-labelledby="quick-check-title">
          <div className={styles.quickCheckHeader}>
            <span><Lightbulb aria-hidden="true" size={18} /></span>
            <div>
              <p className={styles.sectionKicker}>Quick check</p>
              <h2 id="quick-check-title">What gas do the bubbles contain?</h2>
            </div>
          </div>
          <fieldset disabled={isReady}>
            <legend className={styles.srOnly}>Choose the gas released by the plant</legend>
            {['Carbon dioxide', 'Sugar', 'Oxygen'].map(option => (
              <label key={option} className={styles.answerOption}>
                <input
                  type="radio"
                  name="quick-check"
                  value={option}
                  checked={answer === option}
                  onChange={event => setAnswer(event.target.value)}
                />
                <span>{option}</span>
              </label>
            ))}
          </fieldset>
          {isRetry && (
            <p className={styles.retryMessage} role="alert">
              <TriangleAlert aria-hidden="true" size={17} />
              Try again. Think about the gas released in the pond-plant example.
            </p>
          )}
          {isReady && (
            <p className={styles.successMessage} role="status">
              <CheckCircle2 aria-hidden="true" size={17} />
              Correct. Oxygen is released while the plant keeps the sugar.
            </p>
          )}
          {isReady ? (
            <button type="button" className={styles.primaryButton} onClick={onComplete}>
              Complete lesson five <ArrowRight aria-hidden="true" size={17} />
            </button>
          ) : (
            <button type="button" className={styles.primaryButton} disabled={!answer} onClick={() => onCheck(answer)}>
              Check answer
            </button>
          )}
        </section>
      </div>
    </>
  );
}

function CheckpointScreen({ headingRef, onBack, onSubmit }: {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
  onSubmit: () => void;
}) {
  return (
    <>
      <button type="button" className={styles.backButton} onClick={onBack}>
        <ArrowLeft aria-hidden="true" size={17} /> Back to learning path
      </button>
      <ScreenHeading
        eyebrow="Unit 01 · Feynman checkpoint"
        title="Teach it back"
        description="Explain the idea simply, connect the causes, and apply it to a new situation."
        headingRef={headingRef}
      />
      <div className={styles.checkpointLayout}>
        <section className={styles.promptCard} aria-labelledby="checkpoint-prompt">
          <span className={styles.promptNumber}>01</span>
          <div>
            <p className={styles.sectionKicker}>Explain and predict</p>
            <h2 id="checkpoint-prompt">How does a plant make sugars?</h2>
            <p>Explain how a plant uses light, water, and carbon dioxide to make sugar. Then predict what happens when two seedlings receive equal light but one receives less carbon dioxide.</p>
          </div>
        </section>
        <section className={styles.answerCard} aria-labelledby="your-answer-title">
          <div className={styles.answerHeader}>
            <div>
              <p className={styles.sectionKicker}>Predefined demo answer</p>
              <h2 id="your-answer-title">Your explanation</h2>
            </div>
            <span><Clock3 aria-hidden="true" size={15} /> About 2 min</span>
          </div>
          <textarea aria-label="Your explanation" value={PREDEFINED_ANSWER} readOnly rows={7} />
          <p className={styles.answerHint}>The report is matched to this example answer so you can explore the complete feedback flow.</p>
          <button type="button" className={styles.primaryButton} onClick={onSubmit}>
            Submit explanation <ArrowRight aria-hidden="true" size={17} />
          </button>
        </section>
      </div>
    </>
  );
}

function ConceptMap() {
  return (
    <section className={styles.conceptPanel} aria-labelledby="concept-map-title">
      <div className={styles.panelHeading}>
        <div>
          <h2 id="concept-map-title">Concept map</h2>
          <p>2 of 3 links explained. Review the missing connection next.</p>
        </div>
        <span className={styles.mapCount}>2 / 3 linked</span>
      </div>
      <div className={styles.conceptMap}>
        <div className={`${styles.conceptNode} ${styles.conceptStrong}`}>
          <CheckCircle2 aria-hidden="true" size={16} />
          <strong>Inputs + sugar</strong>
          <small>Light, water, and CO₂</small>
        </div>
        <ArrowRight className={styles.mapArrow} aria-hidden="true" size={20} />
        <div className={`${styles.conceptNode} ${styles.conceptStrong}`}>
          <CheckCircle2 aria-hidden="true" size={16} />
          <strong>Sugar + growth</strong>
          <small>Sugar supports growth</small>
        </div>
        <ArrowRight className={styles.mapArrow} aria-hidden="true" size={20} />
        <div className={`${styles.conceptNode} ${styles.conceptReview}`}>
          <TriangleAlert aria-hidden="true" size={16} />
          <strong>Low CO₂ → less sugar</strong>
          <small>Connection to revisit</small>
        </div>
      </div>
    </section>
  );
}

function ReportScreen({ headingRef, onCheckpoint, onReview, onContinue }: {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onCheckpoint: () => void;
  onReview: () => void;
  onContinue: () => void;
}) {
  return (
    <>
      <ScreenHeading
        eyebrow="Unit 01 · Feynman checkpoint"
        title="Your teach-back report"
        description="2 strengths · 2 developing · 1 priority. Unit 2 is open."
        headingRef={headingRef}
      />
      <div className={styles.reportTopGrid}>
        <ConceptMap />
        <aside className={styles.reviewFirst} aria-labelledby="review-first-title">
          <p className={styles.reviewLabel}><Clock3 aria-hidden="true" size={14} /> Next 3-minute review</p>
          <h2 id="review-first-title">What changes when carbon dioxide runs low?</h2>
          <p>Connect carbon dioxide → sugar → growth, then retry your prediction.</p>
          <button type="button" className={styles.reviewButton} onClick={onReview}>
            Review lesson 3 <ArrowRight aria-hidden="true" size={16} />
          </button>
        </aside>
      </div>

      <section className={styles.rubricSection} aria-labelledby="rubric-title">
        <div className={styles.panelHeading}>
          <div>
            <p className={styles.sectionKicker}>Complete feedback</p>
            <h2 id="rubric-title">Your evidence and next steps</h2>
          </div>
          <p>Every criterion includes the evidence we saw and one action you can take.</p>
        </div>
        <div className={styles.rubricHeader} aria-hidden="true">
          <span>Criterion</span><span>Result</span><span>Evidence</span><span>Next step</span>
        </div>
        <div className={styles.rubricList}>
          {RUBRIC.map(criterion => (
            <article key={criterion.name} className={styles.rubricRow}>
              <h3>{criterion.name}</h3>
              <div><StatusPill status={criterion.status} /></div>
              <p><span className={styles.mobileLabel}>Evidence</span>{criterion.evidence}</p>
              <p><span className={styles.mobileLabel}>Next step</span>{criterion.nextStep}</p>
            </article>
          ))}
        </div>
      </section>

      <div className={styles.reportActions}>
        <button type="button" className={styles.primaryButton} onClick={onContinue}>
          Continue when ready <ArrowRight aria-hidden="true" size={17} />
        </button>
        <button type="button" className={styles.secondaryButton} onClick={onCheckpoint}>
          <ArrowLeft aria-hidden="true" size={17} /> Back to teach-back
        </button>
      </div>
    </>
  );
}

function ReviewScreen({ headingRef, onBack }: {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
}) {
  return (
    <>
      <button type="button" className={styles.backButton} onClick={onBack}>
        <ArrowLeft aria-hidden="true" size={17} /> Back to report
      </button>
      <ScreenHeading
        eyebrow="Targeted review · Lesson 03"
        title="What changes when carbon dioxide runs low?"
        description="Repair the missing connection, then use it in your seedling prediction."
        headingRef={headingRef}
      />
      <div className={styles.reviewLessonGrid}>
        <section className={styles.reviewLessonCard}>
          <div className={styles.contentIcon}><Leaf aria-hidden="true" size={22} /></div>
          <div>
            <p className={styles.sectionKicker}>The missing link</p>
            <h2>Carbon dioxide supplies carbon for sugar</h2>
            <p>Even with the same amount of light, a seedling with less carbon dioxide may make less sugar. Less available sugar can slow its growth.</p>
          </div>
        </section>
        <section className={styles.reviewPrompt}>
          <p className={styles.sectionKicker}>Try the prediction again</p>
          <h2>Which seedling grows more slowly?</h2>
          <p>The seedling receiving less carbon dioxide is likely to grow more slowly because carbon dioxide has become the limiting factor.</p>
          <div className={styles.causalChain}>
            <span>Less CO₂</span><ArrowRight aria-hidden="true" size={18} /><span>Less sugar</span><ArrowRight aria-hidden="true" size={18} /><span>Slower growth</span>
          </div>
          <button type="button" className={styles.primaryButton} onClick={onBack}>
            Return to report <ArrowRight aria-hidden="true" size={17} />
          </button>
        </section>
      </div>
    </>
  );
}

function UnitTwoScreen({ headingRef, onRestart }: {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onRestart: () => void;
}) {
  return (
    <section className={styles.unitComplete}>
      <div className={styles.unlockIcon}><Sparkles aria-hidden="true" size={32} /></div>
      <p className={styles.eyebrow}>Unit 01 complete</p>
      <h1 ref={headingRef} tabIndex={-1}>Unit 2 is unlocked</h1>
      <p>You can now explore how light, temperature, and carbon dioxide limit photosynthesis.</p>
      <div className={styles.unitPreview}>
        <span>02</span>
        <div>
          <p className={styles.sectionKicker}>Next learning path</p>
          <h2>What limits photosynthesis?</h2>
          <p>Predict how changing one input changes sugar production and growth.</p>
        </div>
        <ArrowRight aria-hidden="true" size={21} />
      </div>
      <button type="button" className={styles.secondaryButton} onClick={onRestart}>
        <RotateCcw aria-hidden="true" size={17} /> Restart demo
      </button>
    </section>
  );
}

export default function LearningPathDemo() {
  const [view, setView] = useState<DemoView>('path');
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
    const reduceMotion = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [view]);

  const changeView = (nextView: DemoView) => setView(nextView);
  const lessonComplete = ['unlocked', 'checkpoint', 'report', 'review', 'unit2'].includes(view);

  return (
    <main className={styles.demoShell}>
      <div className={styles.demoCanvas}>
        <div className={styles.demoBar}>
          <div className={styles.demoBrand}><span>F</span><strong>Feyman</strong></div>
          <div className={styles.demoMeta}><BookOpen aria-hidden="true" size={15} /> Biology · Interactive demo</div>
        </div>
        <p className={styles.srOnly} aria-live="polite">{transitionMessage[view]}</p>

        <div className={styles.demoContent}>
          {view === 'path' && (
            <>
              <ScreenHeading
                eyebrow="Your learning path"
                title="Build understanding one step at a time"
                description="Complete five short lessons, then explain the whole idea in a Feynman checkpoint."
                headingRef={headingRef}
              />
              <LearningPath unlocked={false} onOpenLesson={() => changeView('lesson')} onOpenCheckpoint={() => changeView('checkpoint')} />
            </>
          )}
          {(view === 'lesson' || view === 'lessonRetry' || view === 'lessonReady') && (
            <LessonScreen
              view={view}
              headingRef={headingRef}
              onBack={() => changeView('path')}
              onCheck={answer => changeView(answer === 'Oxygen' ? 'lessonReady' : 'lessonRetry')}
              onComplete={() => changeView('unlocked')}
            />
          )}
          {view === 'unlocked' && (
            <>
              <div className={styles.unlockBanner} role="status">
                <CheckCircle2 aria-hidden="true" size={21} />
                <div><strong>Lesson five complete</strong><span>Your Feynman checkpoint is now unlocked.</span></div>
              </div>
              <ScreenHeading
                eyebrow="Unit 01 · Checkpoint ready"
                title="You are ready to teach it back"
                description="Use your own words to connect the lessons and apply them to a new situation."
                headingRef={headingRef}
              />
              <LearningPath unlocked onOpenLesson={() => changeView('lessonReady')} onOpenCheckpoint={() => changeView('checkpoint')} />
            </>
          )}
          {view === 'checkpoint' && (
            <CheckpointScreen headingRef={headingRef} onBack={() => changeView(lessonComplete ? 'unlocked' : 'path')} onSubmit={() => changeView('report')} />
          )}
          {view === 'report' && (
            <ReportScreen
              headingRef={headingRef}
              onCheckpoint={() => changeView('checkpoint')}
              onReview={() => changeView('review')}
              onContinue={() => changeView('unit2')}
            />
          )}
          {view === 'review' && <ReviewScreen headingRef={headingRef} onBack={() => changeView('report')} />}
          {view === 'unit2' && <UnitTwoScreen headingRef={headingRef} onRestart={() => changeView('path')} />}
        </div>
      </div>
    </main>
  );
}
