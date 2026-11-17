'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookOpen, Calendar, Star, Trash2, ArrowRight } from 'lucide-react';
import styles from './library.module.css';
import { useSession } from 'next-auth/react';
import { errorMessage, requestJson, studySessionsSchema, type StudySession as Session } from '@/lib/client-api';
import DeleteSessionDialog from '@/components/DeleteSessionDialog';

export default function Library() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Session | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusHeadingAfterDelete = useRef(false);
  
  const { status } = useSession();

  useEffect(() => {
    let active = true;
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (status === 'authenticated') {
      requestJson('/api/sessions', studySessionsSchema)
        .then(data => { if (active) setSessions(data); })
        .catch(err => { if (active) setError(errorMessage(err)); })
        .finally(() => { if (active) setIsLoading(false); });
    }
    return () => { active = false; };
  }, [status, router]);

  useEffect(() => {
    if (!deleteTarget && focusHeadingAfterDelete.current) {
      focusHeadingAfterDelete.current = false;
      headingRef.current?.focus();
    }
  }, [deleteTarget]);

  const removeDeletedSession = (id: string) => {
    focusHeadingAfterDelete.current = true;
    setSessions(prev => prev.filter(session => session.id !== id));
    setDeleteTarget(null);
  };

  if (isLoading || status !== 'authenticated') return <p role="status">Loading your study history…</p>;

  return (
    <div className={styles.container}>
      <main className={styles.mainContent}>
        {error && <p role="alert">{error}</p>}
        
        <header className={styles.header}>
          <div className={styles.headerTitle}>
            <BookOpen size={32} color="#8b5cf6" />
            <h1 ref={headingRef} tabIndex={-1}>Topic Library</h1>
          </div>
          <p>Look back over past sessions, skim your notes, and see when you last worked on each topic.</p>
        </header>

        {!error && sessions.length === 0 ? (
          <div className={styles.emptyState}>
            <h2>Your library is empty</h2>
            <p>Teach a topic once and it will show up here.</p>
            <Link href="/" className={styles.startBtn}>Start a New Session</Link>
          </div>
        ) : (
          <div className={styles.grid}>
            {sessions.map((session) => {
              const dateObj = new Date(session.updatedAt);
              return (
                <div 
                  key={session.id} 
                  className={styles.card}
                >
                  <div className={styles.cardHeader}>
                    <h3 className={styles.topic}>{session.topic}</h3>
                    <button 
                      className={styles.deleteBtn}
                      type="button"
                      onClick={event => {
                        event.currentTarget.focus();
                        setDeleteTarget(session);
                      }}
                      aria-label={`Delete ${session.topic}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  
                  <div className={styles.meta}>
                    <div className={styles.metaItem}>
                      <Star size={14} color="#f59e0b" />
                      <span>{session.masteryScore}% Mastery</span>
                    </div>
                    <div className={styles.metaItem}>
                      <Calendar size={14} color="#64748b" />
                      <span>{dateObj.toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className={styles.resumeArea}>
                    <span>{session.messages.length} messages</span>
                    <Link className={styles.resumeBtn} href={`/chat/${session.id}`} aria-label={`Resume ${session.topic}`}>
                      Resume <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {deleteTarget && (
          <DeleteSessionDialog id={deleteTarget.id} topic={deleteTarget.topic}
            onDismiss={() => setDeleteTarget(null)} onDeleted={() => removeDeletedSession(deleteTarget.id)} />
        )}
      </main>
    </div>
  );
}
