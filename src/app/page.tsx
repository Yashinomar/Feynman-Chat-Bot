'use client';

import { useState, useEffect } from 'react';
import styles from './page.module.css';
import Sidebar from '../components/Sidebar';
import ChatArea, { Message } from '../components/ChatArea';

export interface Session {
  id: string;
  topic: string;
  messages: Message[];
  masteryScore: number;
  updatedAt: number;
}

export default function Home() {
  const [sessions, setSessions] = useState<Record<string, Session>>({});
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [newTopic, setNewTopic] = useState('');
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const stored = localStorage.getItem('feynman_sessions');
    if (stored) {
      try {
        setSessions(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse sessions", e);
      }
    }
  }, []);

  useEffect(() => {
    if (isMounted) {
      localStorage.setItem('feynman_sessions', JSON.stringify(sessions));
    }
  }, [sessions, isMounted]);

  const handleCreateSession = () => {
    if (!newTopic.trim()) return;
    const id = Date.now().toString();
    const newSession: Session = {
      id,
      topic: newTopic.trim(),
      messages: [{
        id: '1',
        role: 'ai',
        content: `Hello! I'm ready to learn. You mentioned we're studying ${newTopic.trim()} today. I don't know much about it. Can you explain the basic idea to me?`
      }],
      masteryScore: 0,
      updatedAt: Date.now()
    };
    setSessions(prev => ({ ...prev, [id]: newSession }));
    setCurrentSessionId(id);
    setNewTopic('');
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
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: newMessages,
          topic: session.topic,
        }),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const data = await response.json();

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: data.reply
      };

      setSessions(prev => {
        const currentSession = prev[currentSessionId];
        return {
          ...prev,
          [currentSessionId]: {
            ...currentSession,
            messages: [...currentSession.messages, aiMessage],
            masteryScore: data.score !== undefined ? data.score : currentSession.masteryScore,
            updatedAt: Date.now()
          }
        };
      });

    } catch (error) {
      console.error("Failed to send message:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: "Oops, I had trouble processing that. Could you try explaining it again?"
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
      <div className={styles.homeContainer}>
        <header className={styles.homeHeader}>
          <h1>TeachBack AI</h1>
          <p>Master any topic by teaching it.</p>
        </header>

        <div className={styles.newSessionCard}>
          <h2>Start a New Topic</h2>
          <div className={styles.newSessionForm}>
            <input
              type="text"
              placeholder="E.g., Quantum Mechanics, Photosynthesis..."
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCreateSession();
                }
              }}
              className={styles.topicInput}
            />
            <button className={`${styles.newSessionBtn} button-primary`} onClick={handleCreateSession}>
              New Session
            </button>
          </div>
        </div>

        {Object.keys(sessions).length > 0 && (
          <div className={styles.sessionsWrapper}>
            <h2>Recent Topics</h2>
            <div className={styles.sessionList}>
              {Object.values(sessions).sort((a, b) => b.updatedAt - a.updatedAt).map(session => (
                <div
                  key={session.id}
                  className={styles.sessionCard}
                  onClick={() => setCurrentSessionId(session.id)}
                >
                  <div className={styles.sessionCardHeader}>
                    <h3>{session.topic}</h3>
                  </div>
                  <div className={styles.sessionMeta}>
                    <span>💬 {session.messages.length} messages</span>
                    <span>📈 {session.masteryScore}% Mastery</span>
                  </div>
                  <div className={styles.sessionDate}>
                    {new Date(session.updatedAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Sidebar
        topic={currentSession.topic}
        masteryScore={currentSession.masteryScore}
        messages={currentSession.messages}
        onGoHome={() => setCurrentSessionId(null)}
      />
      <ChatArea
        topic={currentSession.topic}
        messages={currentSession.messages}
        onSendMessage={handleSendMessage}
        isLoading={isLoading}
      />
    </div>
  );
}
