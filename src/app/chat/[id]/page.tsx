'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { z } from 'zod';
import styles from '../../page.module.css';
import feynmanStyles from './feynman.module.css';
import Sidebar from '../../../components/Sidebar';
import ChatArea from '../../../components/ChatArea';
import DeleteSessionDialog from '@/components/DeleteSessionDialog';
import LiveLearningExperience from '@/components/learning-path/LiveLearningExperience';
import { checkpointReportSchema } from '@/lib/checkpoint-report';
import { errorMessage, jsonBody, RequestError, requestJson, studySessionSchema, type StudySession } from '@/lib/client-api';

const chatResultSchema = z.object({
  session: studySessionSchema, reply: z.string(), score: z.number().min(0).max(100),
  sources: z.array(z.object({ id: z.string(), position: z.number(), text: z.string() })).optional(),
});
const factCheckSchema = z.object({ status: z.enum(['accurate', 'inaccurate', 'unverified']), correction: z.string().optional(), reason: z.string().optional() });
const learningPathSchema = z.array(z.object({
  title: z.string().trim().min(3).max(80),
  objective: z.string().trim().min(8).max(220),
}).strict()).min(4).max(6);
const checkpointResultSchema = z.object({
  session: studySessionSchema,
  report: checkpointReportSchema,
  replayed: z.boolean().optional(),
}).strict();

function hasValidCheckpointReport(saved: StudySession) {
  if (!saved.checkpointReport || !saved.learningPath) return false;
  try {
    const report = checkpointReportSchema.safeParse(JSON.parse(saved.checkpointReport));
    const path = learningPathSchema.safeParse(JSON.parse(saved.learningPath));
    return report.success && path.success && report.data.firstReview.stepIndex < path.data.length;
  } catch { return false; }
}

export default function ChatSession() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const currentSessionId = params.id;
  const [session, setSession] = useState<StudySession | null>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [factCheck, setFactCheck] = useState<z.infer<typeof factCheckSchema> | null>(null);
  const [sources, setSources] = useState<z.infer<typeof chatResultSchema>['sources']>([]);
  const pendingTurn = useRef<{ sessionId: string; content: string; requestId: string; expectedVersion: number } | null>(null);
  const pendingCheckpoint = useRef<{ sessionId: string; content: string; requestId: string; expectedVersion: number } | null>(null);
  const inFlight = useRef(false);
  const mainContentRef = useRef<HTMLElement>(null);
  const factCheckGeneration = useRef(0);
  const factCheckAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    factCheckAbort.current = controller;
    requestJson(`/api/sessions/${currentSessionId}`, studySessionSchema)
      .then(saved => {
        if (active) { setSession(saved); setError(''); setSources([]); setFactCheck(null); }
      })
      .catch(err => { if (active) setError(errorMessage(err)); })
      .finally(() => { if (active) setLoadedId(currentSessionId); });
    return () => { active = false; controller.abort(); };
  }, [currentSessionId]);

  const dismissCorrection = async () => {
    if (!session || session.id !== currentSessionId || inFlight.current) return;
    inFlight.current = true;
    setIsSending(true);
    setError('');
    ++factCheckGeneration.current;
    const signal = factCheckAbort.current?.signal;
    try {
      const saved = await requestJson(`/api/sessions/${currentSessionId}`, studySessionSchema, {
        ...jsonBody({ activeCorrection: null, expectedVersion: session.version }), method: 'PUT', signal,
      });
      if (!signal?.aborted) {
        setSession(saved);
        setFactCheck(null);
      }
    } catch (err) {
      if (signal?.aborted) return;
      if (err instanceof RequestError && err.status === 409) {
        try {
          const refreshed = await requestJson(`/api/sessions/${currentSessionId}`, studySessionSchema, { signal });
          if (!signal?.aborted) {
            setSession(refreshed);
            setFactCheck(null);
          }
        } catch { /* Preserve the current correction when the refresh fails. */ }
      }
      if (!signal?.aborted) setError(errorMessage(err));
    }
    finally { inFlight.current = false; setIsSending(false); }
  };

  const handleSendMessage = async (text: string): Promise<boolean> => {
    if (!session || session.id !== currentSessionId || inFlight.current || deleteSessionId === currentSessionId) return false;
    const content = text.trim();
    if (!content || content.length > 6000) { setError('Please use between 1 and 6,000 characters.'); return false; }
    inFlight.current = true;
    setIsSending(true);
    setError('');
    setFactCheck(null);
    const generation = ++factCheckGeneration.current;
    const signal = factCheckAbort.current?.signal;
    if (!pendingTurn.current || pendingTurn.current.sessionId !== currentSessionId || pendingTurn.current.content !== content) {
      pendingTurn.current = { sessionId: currentSessionId, content, requestId: crypto.randomUUID(), expectedVersion: session.version };
    }
    const turn = pendingTurn.current;
    try {
      const result = await requestJson('/api/chat', chatResultSchema, jsonBody(turn));
      if (signal?.aborted) return false;
      // Only a committed server response may change the conversation or mastery score.
      setSession(result.session);
      setSources(result.sources ?? []);
      pendingTurn.current = null;
      const committedVersion = turn.expectedVersion + 1;
      if (result.session.version === committedVersion) {
        void requestJson('/api/factcheck', factCheckSchema, {
          ...jsonBody({ sessionId: turn.sessionId, requestId: turn.requestId, expectedVersion: committedVersion }),
          signal,
        })
          .then(check => { if (!signal?.aborted && factCheckGeneration.current === generation) setFactCheck(check); })
          .catch(err => {
            if (signal?.aborted || factCheckGeneration.current !== generation || (err instanceof RequestError && err.status === 409)) return;
            setFactCheck({ status: 'unverified', reason: 'Fact-checking is temporarily unavailable.' });
          });
      }
      return true;
    } catch (err) {
      if (signal?.aborted) return false;
      if (err instanceof RequestError && err.status === 409) {
        // Another tab changed this session. Keep the draft, but use the new version on retry.
        pendingTurn.current = null;
        try { setSession(await requestJson(`/api/sessions/${currentSessionId}`, studySessionSchema)); }
        catch { /* Preserve the current saved view and report the original conflict. */ }
      }
      setError(`${errorMessage(err)} Your draft has been kept. Retry to confirm it was saved.`);
      return false;
    } finally {
      inFlight.current = false;
      setIsSending(false);
    }
  };

  const handleSubmitCheckpoint = async (text: string): Promise<boolean> => {
    if (!session || session.id !== currentSessionId || session.status !== 'checkpoint' || inFlight.current || deleteSessionId === currentSessionId) return false;
    const content = text.trim();
    if (!content || content.length > 6000) { setError('Please use between 1 and 6,000 characters.'); return false; }
    inFlight.current = true;
    setIsSending(true);
    setError('');
    const signal = factCheckAbort.current?.signal;
    if (!pendingCheckpoint.current || pendingCheckpoint.current.sessionId !== currentSessionId || pendingCheckpoint.current.content !== content) {
      pendingCheckpoint.current = { sessionId: currentSessionId, content, requestId: crypto.randomUUID(), expectedVersion: session.version };
    }
    const submission = pendingCheckpoint.current;
    try {
      const result = await requestJson(`/api/sessions/${currentSessionId}/checkpoint`, checkpointResultSchema, { ...jsonBody(submission), signal });
      if (signal?.aborted) return false;
      setSession(result.session);
      pendingCheckpoint.current = null;
      return true;
    } catch (err) {
      if (signal?.aborted) return false;
      if (err instanceof RequestError && err.status === 409) {
        try {
          const refreshed = await requestJson(`/api/sessions/${currentSessionId}`, studySessionSchema, { signal });
          if (signal?.aborted) return false;
          setSession(refreshed);
          if (refreshed.status === 'checkpoint' && pendingCheckpoint.current?.content === content) {
            pendingCheckpoint.current.expectedVersion = refreshed.version;
          } else if (refreshed.status === 'completed' && hasValidCheckpointReport(refreshed)) {
            pendingCheckpoint.current = null;
            setError('');
            return true;
          }
        } catch { /* Keep the saved view and retained draft when refresh also fails. */ }
      }
      setError(`${errorMessage(err)} Your checkpoint draft has been kept.`);
      return false;
    } finally {
      inFlight.current = false;
      setIsSending(false);
    }
  };

  if (loadedId !== currentSessionId) return <p role="status">Loading your study session…</p>;
  if (!session || session.id !== currentSessionId) return (
    <main className={styles.homeContainer}>
      <h2>Unable to open this session</h2>
      <p role="alert">{error || 'This session was deleted or is not available to your account.'}</p>
      <Link href="/">Return home</Link>
    </main>
  );
  const parsedPath = (() => {
    if (!session.learningPath) return null;
    try { return learningPathSchema.safeParse(JSON.parse(session.learningPath)); }
    catch { return null; }
  })();
  const learningPath = parsedPath?.success ? parsedPath.data : null;
  const parsedReport = (() => {
    if (!session.checkpointReport) return null;
    try { return checkpointReportSchema.safeParse(JSON.parse(session.checkpointReport)); }
    catch { return null; }
  })();
  const checkpointReport = parsedReport?.success && learningPath && parsedReport.data.firstReview.stepIndex < learningPath.length ? parsedReport.data : null;
  const reportUnavailable = !!session.checkpointReport && !checkpointReport;
  const currentStep = session.pathIndex ?? 0;
  const correction = factCheck?.status === 'inaccurate' ? factCheck.correction : factCheck ? null : session.activeCorrection;
  const levelLabel = session.studentLevel === 'kid' ? 'Lower Primary' : session.studentLevel === 'professional' ? 'Professional' : 'High School';
  const showChat = session.status === 'active' || (session.status === 'completed' && !checkpointReport);
  const courseMaterial = (() => {
    try { return z.object({ sessions: z.array(z.object({ title: z.string(), theory: z.string(), example: z.string() })) }).parse(JSON.parse(session.courseContext ?? 'null')).sessions; }
    catch { return undefined; }
  })();
  return (
    <div className={`${styles.studyChatLayout} ${feynmanStyles.shell} ${!showChat ? feynmanStyles.focused : ''}`}>
      {showChat && <Sidebar key={session.id} sessionId={session.id} topic={session.topic} masteryScore={session.masteryScore} messages={session.messages}
        onGoHome={() => router.push('/')} onDeleteSession={() => { if (!inFlight.current) setDeleteSessionId(session.id); }} disabled={isSending} />}
      <main ref={mainContentRef} className={styles.mainContent}>
        <nav className={feynmanStyles.breadcrumb} aria-label="Study navigation"><Link href="/courses">← Learning path</Link><span>Feynman practice</span><Link href="/library">Saved practice</Link></nav>
        {error && session.status !== 'checkpoint' && <p role="alert" style={{ color: '#fca5a5', padding: '12px' }}>{error}</p>}
        {learningPath ? <LiveLearningExperience
          topic={session.topic}
          levelLabel={levelLabel}
          status={session.status}
          learningPath={learningPath}
          currentStep={currentStep}
          masteryScore={session.masteryScore}
          messages={session.messages}
          report={checkpointReport}
          reportUnavailable={reportUnavailable}
          reviewMaterial={courseMaterial}
          onContinueCourse={session.courseCheckpointKey ? () => router.push('/courses') : undefined}
          isSubmitting={isSending}
          checkpointError={session.status === 'checkpoint' ? error : undefined}
          onFocusExplanation={() => mainContentRef.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus()}
          onSubmitCheckpoint={handleSubmitCheckpoint}
          onReturnToLibrary={() => router.push('/library')}
        /> : (reportUnavailable || session.learningPath ? <p role="alert" style={{ color: '#fca5a5', padding: '12px' }}>{reportUnavailable
          ? 'The saved feedback report is unavailable because its learning path could not be loaded. Your conversation remains below.'
          : 'This saved learning path is unavailable. Your conversation remains below.'}</p> : null)}
        {showChat && <>
          {correction && <div className={styles.correctionBanner}><div className={styles.correctionIcon}>Fact check</div><p>{correction}</p><button className={styles.dismissCorrection} disabled={isSending} onClick={dismissCorrection} aria-label="Dismiss correction">×</button></div>}
          {factCheck?.status === 'unverified' && <p role="status" style={{ padding: '12px', color: '#cbd5e1' }}>Could not verify this explanation. {factCheck.reason}</p>}
          {factCheck?.status === 'accurate' && <p role="status" style={{ padding: '12px', color: '#a7f3d0' }}>The checked explanation agrees with the available source.</p>}
          {session.status === 'completed' && <p role="status" style={{ padding: '12px 16px', color: '#34d399' }}>Learning path complete. Your conversation is saved for review.</p>}
          <ChatArea key={session.id} topic={session.topic} messages={session.messages} onSendMessage={handleSendMessage} isLoading={isSending} isComplete={session.status === 'completed'} masteryScore={session.masteryScore} />
          {session.reviewDate && <p style={{ padding: '8px 16px' }}>Next review: {new Date(session.reviewDate).toLocaleDateString()}</p>}
          {!!sources?.length && <details className={styles.studyDisclosure}><summary>Notes used for this reply</summary>{sources.map(source => <p key={source.id}>Passage {source.position + 1}: {source.text}</p>)}</details>}
        </>}
      </main>
      {deleteSessionId === session.id && <DeleteSessionDialog id={session.id} topic={session.topic}
        onDismiss={() => setDeleteSessionId(null)} onDeleted={() => router.push('/')} />}
    </div>
  );
}
