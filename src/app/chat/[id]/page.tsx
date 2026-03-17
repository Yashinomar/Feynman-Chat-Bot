'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import styles from '../../page.module.css';
import Sidebar from '../../../components/Sidebar';
import ChatArea, { Message } from '../../../components/ChatArea';
import { Send, FileText, Download, Award, BrainCircuit, Share2, CornerDownLeft, Network } from 'lucide-react';
import html2pdf from 'html2pdf.js';

export interface Session {
  id: string;
  topic: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  status: 'active' | 'completed';
  masteryScore: number;
  reviewDate?: number;
  interval?: number;
  repetition?: number;
  efactor?: number;
  activeCorrection?: string | null;
  isRagSession?: boolean;
  studentLevel?: 'kid' | 'highschool' | 'professional';
  studentBehavior?: 'curious' | 'skeptical' | 'enthusiastic' | 'distracted';
}

// SuperMemo-2 SRS Algorithm
export function calculateNextReview(score: number, repetition = 0, efactor = 2.5, interval = 0) {
  let grade = 0;
  if (score >= 90) grade = 5;
  else if (score >= 80) grade = 4;
  else if (score >= 60) grade = 3;
  else if (score >= 40) grade = 2;
  else if (score >= 20) grade = 1;

  let nextInterval;
  let nextRepetition;
  let nextEfactor;

  if (grade >= 3) {
    if (repetition === 0) nextInterval = 1;
    else if (repetition === 1) nextInterval = 6;
    else nextInterval = Math.round(interval * efactor);
    nextRepetition = repetition + 1;
  } else {
    nextRepetition = 0;
    nextInterval = 1;
  }

  nextEfactor = efactor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
  if (nextEfactor < 1.3) nextEfactor = 1.3;

  const nextReviewDate = Date.now() + (nextInterval * 24 * 60 * 60 * 1000);

  return { interval: nextInterval, repetition: nextRepetition, efactor: nextEfactor, reviewDate: nextReviewDate };
}

export default function ChatSession() {
  const params = useParams();
  const router = useRouter();
  const currentSessionId = params.id as string;

  const [sessions, setSessions] = useState<Record<string, Session>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [newTopic, setNewTopic] = useState('');
  const [isMounted, setIsMounted] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [hintMessage, setHintMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsMounted(true);
    fetch('/api/sessions')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          const fetchedSessions: Record<string, Session> = {};
          data.forEach((s: any) => {
            fetchedSessions[s.id] = s;
          });
          setSessions(fetchedSessions);
        }
      })
      .catch(e => console.error("Failed to fetch sessions", e));
  }, []);

  const handleDeleteSession = async (e: React.MouseEvent | null, id: string) => {
    if (e) {
      e.stopPropagation();
    }

    try {
      await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
      setSessions(prev => {
        const newSessions = { ...prev };
        delete newSessions[id];
        return newSessions;
      });

      if (currentSessionId === id) {
        router.push('/');
      }
    } catch (err) {
      console.error("Failed to delete session", err);
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!currentSessionId) return;

    const session = sessions[currentSessionId];
    if (!session) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text
    };

    const newMessages = [...session.messages, userMessage];

    setSessions(prev => ({
      ...prev,
      [currentSessionId]: {
        ...prev[currentSessionId],
        messages: newMessages,
        updatedAt: Date.now()
      }
    }));

    setIsLoading(true);

    try {
      await fetch(`/api/sessions/${currentSessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'user', content: text })
      });

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: newMessages,
          topic: session.topic,
          sessionId: currentSessionId,
          isRagSession: session.isRagSession,
          studentLevel: session.studentLevel || 'highschool',
          studentBehavior: session.studentBehavior || 'curious'
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Network response was not ok');
      }

      const data = await response.json();

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: data.reply
      };

      await fetch(`/api/sessions/${currentSessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'ai', content: data.reply })
      });

      setSessions(prev => {
        const currentSession = prev[currentSessionId];
        const newScore = data.score !== undefined ? data.score : currentSession.masteryScore;
        
        // Calculate new spaced repetition intervals when the score updates
        let srsUpdates = {};
        if (data.score !== undefined) {
          srsUpdates = calculateNextReview(
            newScore, 
            currentSession.repetition, 
            currentSession.efactor, 
            currentSession.interval
          );
        }

        return {
          ...prev,
          [currentSessionId]: {
            ...currentSession,
            ...srsUpdates,
            messages: [...currentSession.messages, aiMessage],
            masteryScore: newScore,
            updatedAt: Date.now()
          }
        };
      });

      if (data.score !== undefined) {
        const srsUpdates = calculateNextReview(
          data.score, 
          session.repetition, 
          session.efactor, 
          session.interval
        );
        fetch(`/api/sessions/${currentSessionId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ masteryScore: data.score, ...srsUpdates })
        }).catch(e => console.error(e));
      }

      if (currentSessionId && currentSession) {
        fetch('/api/factcheck', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: currentSession.topic,
            latestMessage: text
          })
        })
      .then(res => res.json())
      .then(correctionData => {
        if (correctionData && correctionData.isAccurate === false && correctionData.correction) {
          setSessions(prev => {
            const snap = { ...prev };
            if (snap[currentSessionId]) {
              snap[currentSessionId].activeCorrection = correctionData.correction;
            }
            return snap;
          });
        }
      })
      .catch(err => console.error("Fact-checker failed silently:", err));
      }

    } catch (error: any) {
      console.error("Failed to send message:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: `I wasn’t able to handle that request properly: ${error.message || 'something went wrong on my side.'}`
      };
      setSessions(prev => {
        const currentSession = prev[currentSessionId];
        return {
          ...prev,
          [currentSessionId]: {
            ...currentSession,
            messages: [...currentSession.messages, errorMessage],
            updatedAt: Date.now()
          }
        };
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isMounted) return null;

  const currentSession = currentSessionId ? sessions[currentSessionId] : null;

  if (!currentSession) {
    return (
      <div className={styles.homeContainer} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column' }}>
        <h2>Session Not Found</h2>
        <p style={{ color: '#64748b', marginBottom: '20px' }}>This study session may have been deleted or doesn't exist.</p>
        <Link href="/" className="button-primary" style={{ textDecoration: 'none' }}>
          Return to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Sidebar
        topic={currentSession.topic}
        masteryScore={currentSession.masteryScore}
        messages={currentSession.messages}
        onGoHome={() => router.push('/')}
        onDeleteSession={() => handleDeleteSession(null, currentSessionId!)}
      />
      <main className={styles.mainContent}>
        {currentSession.activeCorrection && (
          <div className={styles.correctionBanner}>
            <div className={styles.correctionIcon}>🚨 Fact Check</div>
            <p>{currentSession.activeCorrection}</p>
            <button 
              className={styles.dismissCorrection} 
              onClick={() => {
                setSessions(prev => {
                  const snap = { ...prev };
                  if (currentSessionId && snap[currentSessionId]) {
                    snap[currentSessionId].activeCorrection = null;
                  }
                  return snap;
                });
              }}
            >
              ×
            </button>
          </div>
        )}
        <ChatArea
          topic={currentSession.topic}
          messages={currentSession.messages}
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
          masteryScore={currentSession.masteryScore}
        />
      </main>
      <div className={styles.actionButtons}>
        {currentSession.masteryScore >= 90 && (
          <button /*onClick={generatePDF}*/ className={styles.downloadBtn} title="Download Study Guide">
            <Download size={18} />
            <span>Study Guide</span>
          </button>
        )}
      </div>
    </div>
  );
}
