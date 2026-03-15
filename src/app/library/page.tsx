'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookOpen, Calendar, Star, Trash2, ArrowRight } from 'lucide-react';
import styles from './library.module.css';
import type { Session } from '../chat/[id]/page';

export default function Library() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const stored = localStorage.getItem('feynman_sessions');
    if (stored) {
      try {
        const parsed: Record<string, Session> = JSON.parse(stored);
        // Sort by most recently updated
        const sorted = Object.values(parsed).sort((a, b) => b.updatedAt - a.updatedAt);
        setSessions(sorted);
      } catch (e) {
        console.error("Failed to parse sessions", e);
      }
    }
  }, []);

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    const stored = localStorage.getItem('feynman_sessions');
    if (stored) {
      const parsed: Record<string, Session> = JSON.parse(stored);
      delete parsed[id];
      localStorage.setItem('feynman_sessions', JSON.stringify(parsed));
      setSessions(prev => prev.filter(s => s.id !== id));
    }
  };

  if (!isMounted) return null;

  return (
    <div className={styles.container}>
      <main className={styles.mainContent}>
        
        <header className={styles.header}>
          <div className={styles.headerTitle}>
            <BookOpen size={32} color="#8b5cf6" />
            <h1>Topic Library</h1>
          </div>
          <p>Look back over past sessions, skim your notes, and see when you last worked on each topic.</p>
        </header>

        {sessions.length === 0 ? (
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
                  onClick={() => router.push(`/chat/${session.id}`)}
                >
                  <div className={styles.cardHeader}>
                    <h3 className={styles.topic}>{session.topic}</h3>
                    <button 
                      className={styles.deleteBtn}
                      onClick={(e) => handleDelete(e, session.id)}
                      title="Delete Session"
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
                    <div className={styles.resumeBtn}>
                      Resume <ArrowRight size={14} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </main>
    </div>
  );
}
