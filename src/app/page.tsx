'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BrainCircuit, BookOpen, Star, Zap, BookCopy, Users, Plus, LogIn, FileText, TrendingUp } from 'lucide-react';
import styles from './page.module.css';
import type { Session } from './chat/[id]/page';

export default function DashboardHome() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Record<string, Session>>({});
  const [isMounted, setIsMounted] = useState(false);
  const [newTopic, setNewTopic] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [isHosting, setIsHosting] = useState(false);
  const [gameMode, setGameMode] = useState('classic');
  const [ragTopic, setRagTopic] = useState('');
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [isEmbedding, setIsEmbedding] = useState(false);
  const [ragError, setRagError] = useState('');

  const [showPersonaModal, setShowPersonaModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<any>(null);
  const [studentLevel, setStudentLevel] = useState<'kid' | 'highschool' | 'professional'>('highschool');
  const [studentBehavior, setStudentBehavior] = useState<'curious' | 'skeptical' | 'enthusiastic' | 'distracted'>('curious');

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

  const prepSoloSession = () => {
    if (!newTopic.trim()) return;
    setPendingAction({ type: 'solo', topic: newTopic.trim() });
    setShowPersonaModal(true);
  };

  const executeSoloSession = (topicStr: string) => {
    const id = Date.now().toString();
    const newSession: Session = {
      id,
      topic: topicStr,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [
        {
          id: Date.now().toString(),
          role: 'ai',
          content: `Let’s dig into ${topicStr} together. Start by explaining the main idea in your own words, as if you were chatting with a friend who’s new to it.`
        }
      ],
      status: 'active',
      masteryScore: 0,
      reviewDate: Date.now(),
      interval: 0,
      repetition: 0,
      efactor: 2.5,
      studentLevel,
      studentBehavior
    };
    
    const updatedSessions = { ...sessions, [id]: newSession };
    localStorage.setItem('feynman_sessions', JSON.stringify(updatedSessions));

    router.push(`/chat/${id}`);
  };

  const prepMultiplayerSession = () => {
    if (!newTopic.trim()) return;
    setPendingAction({ type: 'multiplayer', topic: newTopic.trim(), mode: gameMode });
    setShowPersonaModal(true);
  };

  const executeMultiplayerSession = async (topicStr: string, modeStr: string) => {
    setIsHosting(true);
    
    const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
    
    await fetch('/api/signaling', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        room: roomId, 
        action: 'create-room', 
        data: { topic: topicStr, gameMode: modeStr, studentLevel, studentBehavior } 
      })
    });

    router.push(`/multiplayer/${roomId}?mode=host`);
  };

  const handleJoinMultiplayer = () => {
    if (!joinCode.trim()) return;
    router.push(`/multiplayer/${joinCode.toUpperCase()}?mode=guest`);
  };

  const prepRagSession = () => {
    if (!ragTopic.trim() || !documentFile || isEmbedding) return;
    setPendingAction({ type: 'rag', topic: ragTopic.trim(), file: documentFile });
    setShowPersonaModal(true);
  };

  const executeRagSession = async (topicStr: string, fileData: File) => {
    setIsEmbedding(true);
    setRagError('');
    setShowPersonaModal(false);
    
    try {
      let documentText = "";
      
      if (fileData.type === 'application/pdf' || fileData.name.toLowerCase().endsWith('.pdf')) {
          const arrayBuffer = await fileData.arrayBuffer();
          const pdfjs = await import('pdfjs-dist');
          
          pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
          
          const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
          let maxPages = pdf.numPages;
          for (let j = 1; j <= maxPages; j++) {
            const page = await pdf.getPage(j);
            const textContent = await page.getTextContent();
            documentText += textContent.items.map((s: any) => s.str).join(" ") + " \n";
          }
      } else {
          const buffer = await fileData.arrayBuffer();
          documentText = new TextDecoder().decode(buffer);
      }

      const res = await fetch('/api/rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentText, topic: topicStr }),
      });
      const data = await res.json();
      
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to parse PDF and generate embeddings.');
      }
      
      if (data.sessionId) {
        const id = data.sessionId;
        const newSession: Session = {
          id,
          topic: topicStr,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: [
            {
              id: Date.now().toString(),
              role: 'ai',
              content: `I’ve gone through your document **${topicStr}**. When you’re ready, start by telling me one key idea from it and we’ll build from there.`
            }
          ],
          status: 'active',
          masteryScore: 0,
          reviewDate: Date.now(),
          interval: 0,
          repetition: 0,
          efactor: 2.5,
          isRagSession: true,
          studentLevel,
          studentBehavior
        };
        
        const updatedSessions = { ...sessions, [id]: newSession };
        localStorage.setItem('feynman_sessions', JSON.stringify(updatedSessions));
        router.push(`/chat/${id}`);
      }
      } catch (error: any) {
      console.error("Embedding failed", error);
      setRagError(error.message || 'Something went wrong while reading the file. Please try again in a moment.');
    } finally {
      setIsEmbedding(false);
    }
  };

  const handleLaunchPendingAction = () => {
    if (!pendingAction) return;
    
    if (pendingAction.type === 'solo') {
      executeSoloSession(pendingAction.topic);
    } else if (pendingAction.type === 'multiplayer') {
      executeMultiplayerSession(pendingAction.topic, pendingAction.mode);
      setShowPersonaModal(false);
    } else if (pendingAction.type === 'rag') {
      executeRagSession(pendingAction.topic, pendingAction.file);
    }
  };

  const stats = useMemo(() => {
    const list = Object.values(sessions);
    if (!list.length) return { totalTopics: 0, avgMastery: 0, totalMessages: 0 };
    
    const totalTopics = list.length;
    const totalMessages = list.reduce((acc, curr) => acc + curr.messages.length, 0);
    const avgMastery = Math.round(list.reduce((acc, curr) => acc + curr.masteryScore, 0) / totalTopics);
    
    return { totalTopics, totalMessages, avgMastery };
  }, [sessions]);

  if (!isMounted) return null;

  return (
    <div className={styles.container}>
      <main className={styles.mainContent} style={{ alignItems: 'center', paddingTop: '60px', overflowY: 'auto', paddingBottom: '60px' }}>
        
        <header className={styles.homeHeader} style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ display: 'inline-flex', padding: '16px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '24px', marginBottom: '20px' }}>
            <BrainCircuit size={48} color="#60a5fa" />
          </div>
          <h1 style={{ fontSize: '3rem', fontWeight: 800, marginBottom: '16px', background: 'linear-gradient(to right, #60a5fa, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            TeachBack AI
          </h1>
          <p style={{ fontSize: '1.2rem', color: '#94a3b8', maxWidth: '600px', margin: '0 auto' }}>
            Master complex subjects through the Feynman Technique. Explain topics naturally, and our AI tutor will identify your knowledge gaps.
          </p>
        </header>

        {/* Global Stats Grid */}
        <div style={{ display: 'flex', gap: '24px', marginBottom: '48px', width: '100%', maxWidth: '800px' }}>
          <div style={{ flex: 1, background: 'rgba(30, 41, 59, 0.5)', padding: '24px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
            <BookCopy size={24} color="#3b82f6" style={{ margin: '0 auto 12px auto' }} />
            <div style={{ fontSize: '2rem', fontWeight: 700, color: 'white' }}>{stats.totalTopics}</div>
            <div style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '4px' }}>Topics Learned</div>
          </div>
          <div style={{ flex: 1, background: 'rgba(30, 41, 59, 0.5)', padding: '24px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
            <Star size={24} color="#f59e0b" style={{ margin: '0 auto 12px auto' }} />
            <div style={{ fontSize: '2rem', fontWeight: 700, color: 'white' }}>{stats.avgMastery}%</div>
            <div style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '4px' }}>Avg. Mastery</div>
          </div>
          <div style={{ flex: 1, background: 'rgba(30, 41, 59, 0.5)', padding: '24px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
            <Zap size={24} color="#8b5cf6" style={{ margin: '0 auto 12px auto' }} />
            <div style={{ fontSize: '2rem', fontWeight: 700, color: 'white' }}>{stats.totalMessages}</div>
            <div style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '4px' }}>Concepts Explained</div>
          </div>
        </div>

        {/* Start New Session CTA */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', width: '100%', maxWidth: '1000px', alignItems: 'stretch' }}>
          
          {/* Solo Mode Card */}
          <div className={styles.newSessionCard} style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(59, 130, 246, 0.3)', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ fontSize: '1.2rem', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BookOpen size={20} color="#3b82f6" /> Solo Study
            </h2>
            <div className={styles.newSessionForm} style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
              <input
                type="text"
                placeholder="Topic to master..."
                value={newTopic}
                onChange={(e) => setNewTopic(e.target.value)}
                style={{ width: '100%', padding: '16px', fontSize: '1rem', background: 'rgba(30, 41, 59, 0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: 'white', outline: 'none' }}
              />
              <button 
                onClick={prepSoloSession}
                disabled={!newTopic.trim()}
                style={{ width: '100%', padding: '14px', background: newTopic.trim() ? '#3b82f6' : '#1e293b', color: newTopic.trim() ? 'white' : '#64748b', border: 'none', borderRadius: '12px', fontSize: '1rem', fontWeight: 600, cursor: newTopic.trim() ? 'pointer' : 'not-allowed', transition: 'all 0.2s', marginTop: 'auto' }}
              >
                Start Solo Session
              </button>
            </div>
          </div>

          {/* Multiplayer Mode Card */}
          <div className={styles.newSessionCard} style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(139, 92, 246, 0.3)', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ fontSize: '1.2rem', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={20} color="#8b5cf6" /> Co-Op Multiplayer
            </h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              <select 
                value={gameMode}
                onChange={(e) => setGameMode(e.target.value)}
                style={{ width: '100%', padding: '12px', fontSize: '0.95rem', background: 'rgba(30, 41, 59, 0.8)', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '10px', color: 'white', outline: 'none', marginBottom: '8px', appearance: 'none', cursor: 'pointer' }}
              >
                <option value="classic">🟢 Classic Co-Op</option>
                <option value="survival">🔴 15-Convo Survival</option>
                <option value="rush">⚡ 3-Min Rush Timer</option>
              </select>

              <button 
                onClick={prepMultiplayerSession}
                disabled={!newTopic.trim() || isHosting}
                style={{ width: '100%', padding: '14px', background: newTopic.trim() ? 'rgba(139, 92, 246, 0.1)' : '#1e293b', color: newTopic.trim() ? '#a78bfa' : '#64748b', border: newTopic.trim() ? '1px solid rgba(139, 92, 246, 0.4)' : '1px solid transparent', borderRadius: '12px', fontSize: '1rem', fontWeight: 600, cursor: newTopic.trim() ? 'pointer' : 'not-allowed', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                <Plus size={18} /> {isHosting ? 'Creating Room...' : 'Host Room (Requires Topic)'}
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '16px 0' }}>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
              <span style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>OR</span>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
              <input
                type="text"
                placeholder="4-Digit Code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 4))}
                style={{ flex: 1, padding: '14px', fontSize: '1rem', background: 'rgba(30, 41, 59, 0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: 'white', outline: 'none', textAlign: 'center', letterSpacing: '2px', fontFamily: 'monospace', minWidth: 0 }}
              />
              <button 
                onClick={handleJoinMultiplayer}
                disabled={joinCode.length < 4}
                style={{ padding: '0 20px', background: joinCode.length === 4 ? '#8b5cf6' : '#1e293b', color: joinCode.length === 4 ? 'white' : '#64748b', border: 'none', borderRadius: '12px', fontSize: '1rem', fontWeight: 600, cursor: joinCode.length === 4 ? 'pointer' : 'not-allowed', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}
              >
                <LogIn size={18} /> Join
              </button>
            </div>
          </div>
          
          {/* RAG Document Card */}
          <div className={styles.newSessionCard} style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(16, 185, 129, 0.3)', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ fontSize: '1.2rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={20} color="#10b981" /> RAG Notes Study
            </h2>
            <div className={styles.newSessionForm} style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
              <input
                type="text"
                placeholder="Document Title..."
                value={ragTopic}
                onChange={(e) => setRagTopic(e.target.value)}
                style={{ width: '100%', padding: '12px', fontSize: '0.95rem', background: 'rgba(30, 41, 59, 0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'white', outline: 'none' }}
              />
              <div style={{ background: 'rgba(30, 41, 59, 0.8)', border: '1px dashed rgba(16, 185, 129, 0.5)', borderRadius: '12px', padding: '16px', textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative' }}>
                <FileText size={24} color="#10b981" style={{ marginBottom: '8px', opacity: 0.8 }} />
                <span style={{ fontSize: '0.9rem', color: '#10b981', fontWeight: 500 }}>
                  {documentFile ? documentFile.name.substring(0,25) + (documentFile.name.length > 25 ? "..." : "") : "Tap to exact PDF Notes"}
                </span>
                <input
                  type="file"
                  accept=".pdf,.txt"
                  title="Upload Document"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setDocumentFile(e.target.files[0]);
                    }
                  }}
                  style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }}
                />
              </div>
              {ragError && (
                <div style={{ fontSize: '0.85rem', color: '#f87171', background: 'rgba(248, 113, 113, 0.1)', padding: '8px', borderRadius: '8px', textAlign: 'center', border: '1px solid rgba(248, 113, 113, 0.2)' }}>
                  {ragError}
                </div>
              )}
              <button 
                onClick={prepRagSession}
                disabled={!ragTopic.trim() || !documentFile || isEmbedding}
                style={{ width: '100%', padding: '14px', background: (ragTopic.trim() && documentFile) ? '#10b981' : '#1e293b', color: (ragTopic.trim() && documentFile) ? 'white' : '#64748b', border: 'none', borderRadius: '12px', fontSize: '1rem', fontWeight: 600, cursor: (ragTopic.trim() && documentFile && !isEmbedding) ? 'pointer' : 'not-allowed', transition: 'all 0.2s', marginTop: 'auto' }}
              >
                {isEmbedding ? 'Generating Embeddings...' : 'Upload & Study PDF'}
              </button>
            </div>
          </div>

        </div>

        {stats.totalTopics > 0 && (
          <div style={{ marginTop: '40px', display: 'flex', gap: '24px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <Link href="/library" style={{ padding: '12px 24px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '12px', color: '#60a5fa', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem', fontWeight: 500, transition: 'all 0.2s' }}>
              <BookOpen size={18} /> Browse your Topic Library
            </Link>
            <Link href="/dashboard" style={{ padding: '12px 24px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '12px', color: '#34d399', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem', fontWeight: 500, transition: 'all 0.2s' }}>
              <TrendingUp size={18} /> View Analytics & Achievements
            </Link>
          </div>
        )}

      </main>

      {/* Persona Configurator Modal */}
      {showPersonaModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', animation: 'fadeIn 0.2s ease forwards' }}>
          <div style={{ background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.98))', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '24px', padding: '40px', width: '100%', maxWidth: '600px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 30px rgba(59, 130, 246, 0.1) inset' }}>
            <h2 style={{ fontSize: '1.6rem', marginBottom: '8px', color: 'white', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <BrainCircuit color="#3b82f6" size={28} /> Configure AI Student
            </h2>
            <p style={{ color: '#94a3b8', marginBottom: '32px', fontSize: '1.05rem' }}>Who are you teaching today? Adjust their intellect and behavior.</p>

            <div style={{ marginBottom: '28px' }}>
              <h3 style={{ fontSize: '1.1rem', color: '#e2e8f0', marginBottom: '16px', fontWeight: 500 }}>AI Intellect Level</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }}>
                {['kid', 'highschool', 'professional'].map(lvl => (
                  <button 
                    key={lvl}
                    onClick={() => setStudentLevel(lvl as any)}
                    style={{ padding: '16px 12px', background: studentLevel === lvl ? 'rgba(59, 130, 246, 0.15)' : 'rgba(30, 41, 59, 0.5)', border: studentLevel === lvl ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', color: studentLevel === lvl ? '#60a5fa' : '#94a3b8', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}
                  >
                    <span style={{ fontSize: '1.5rem' }}>{lvl === 'kid' ? '🧒' : lvl === 'highschool' ? '🏫' : '🎓'}</span>
                    <span style={{ fontWeight: studentLevel === lvl ? 600 : 400, fontSize: '0.9rem' }}>{lvl === 'kid' ? 'Lower Primary' : lvl === 'highschool' ? 'High School' : 'Professional'}</span>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '40px' }}>
              <h3 style={{ fontSize: '1.1rem', color: '#e2e8f0', marginBottom: '16px', fontWeight: 500 }}>Student Behavior</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {['curious', 'skeptical', 'enthusiastic', 'distracted'].map(beh => (
                  <button 
                    key={beh}
                    onClick={() => setStudentBehavior(beh as any)}
                    style={{ padding: '14px', background: studentBehavior === beh ? 'rgba(16, 185, 129, 0.15)' : 'rgba(30, 41, 59, 0.5)', border: studentBehavior === beh ? '1px solid #10b981' : '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', color: studentBehavior === beh ? '#34d399' : '#94a3b8', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  >
                    <span style={{ fontSize: '1.2rem' }}>{beh === 'curious' ? '🤔' : beh === 'skeptical' ? '🤨' : beh === 'enthusiastic' ? '🤩' : '🫠'}</span>
                    <span style={{ fontWeight: studentBehavior === beh ? 600 : 400, fontSize: '0.95rem' }}>{beh === 'curious' ? 'Curious' : beh === 'skeptical' ? 'Skeptical' : beh === 'enthusiastic' ? 'Enthusiastic' : 'Distracted'}</span>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '16px' }}>
              <button 
                onClick={() => setShowPersonaModal(false)}
                style={{ flex: 1, padding: '16px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', borderRadius: '16px', cursor: 'pointer', fontWeight: 600, fontSize: '1.05rem', transition: 'all 0.2s' }}
                onMouseOver={(e: any) => { e.target.style.background = 'rgba(255,255,255,0.05)'; e.target.style.color = 'white'; }}
                onMouseOut={(e: any) => { e.target.style.background = 'transparent'; e.target.style.color = '#94a3b8'; }}
              >
                Cancel
              </button>
              <button 
                onClick={handleLaunchPendingAction}
                style={{ flex: 2, padding: '16px', background: 'linear-gradient(135deg, #3b82f6, #2563eb)', border: 'none', color: 'white', borderRadius: '16px', cursor: 'pointer', fontWeight: 600, fontSize: '1.05rem', boxShadow: '0 4px 15px rgba(37, 99, 235, 0.4)', transition: 'all 0.2s' }}
                onMouseOver={(e: any) => { e.target.style.transform = 'translateY(-2px)'; e.target.style.boxShadow = '0 8px 25px rgba(37, 99, 235, 0.6)'; }}
                onMouseOut={(e: any) => { e.target.style.transform = 'translateY(0)'; e.target.style.boxShadow = '0 4px 15px rgba(37, 99, 235, 0.4)'; }}
              >
                Launch Session
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
