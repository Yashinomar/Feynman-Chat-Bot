'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Target, Heart, CheckCircle2, XCircle, ArrowRight, RefreshCcw, History, Home, Loader2, Sparkles, BookA } from 'lucide-react';
import styles from './quiz.module.css';
import Link from 'next/link';

import { useSession } from 'next-auth/react';

interface QuizQuestion {
  question: string;
  options: string[];
  answer: string;
}

type GameState = 'setup' | 'loading' | 'playing' | 'result';

export default function QuizPage() {
  const router = useRouter();
  const { data: authSession, status } = useSession();
  
  // Game Configuration State
  const [gameState, setGameState] = useState<GameState>('setup');
  const [topicInput, setTopicInput] = useState('');
  const [historyTopics, setHistoryTopics] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  // Active Game State
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [hearts, setHearts] = useState(3);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [score, setScore] = useState(0);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (status === 'authenticated') {
      fetch('/api/sessions')
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            const topics = data.map((s: any) => s.topic as string);
            const uniqueTopics = Array.from(new Set(topics)).filter(Boolean);
            setHistoryTopics(uniqueTopics);
          }
        })
        .catch(e => console.error('Failed to fetch sessions history', e));
    }
  }, [status, router]);

  const handleStartQuiz = async (topicToUse: string) => {
    if (!topicToUse.trim()) return;
    
    setGameState('loading');
    setErrorMsg('');
    setQuestions([]);
    setCurrentQIndex(0);
    setHearts(3);
    setScore(0);
    setSelectedOption(null);
    setIsChecking(false);

    try {
      const res = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topicToUse })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate quiz');
      }

      setQuestions(data.questions);
      setGameState('playing');
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred while building your quiz.');
      setGameState('setup');
    }
  };

  const currentQuestion = questions[currentQIndex];

  const handleCheck = () => {
    if (isChecking) {
      // Proceed to next question / check result state
      const isGameOver = hearts === 0;
      const isQuizCompleated = currentQIndex === questions.length - 1;

      if (isGameOver || isQuizCompleated) {
        setGameState('result');
      } else {
        setCurrentQIndex(prev => prev + 1);
        setSelectedOption(null);
        setIsChecking(false);
      }
      return;
    }

    if (!selectedOption) return;

    setIsChecking(true);
    if (selectedOption === currentQuestion.answer) {
      setScore(prev => prev + 1);
    } else {
      setHearts(prev => prev - 1);
    }
  };

  const handleRestart = () => {
    setGameState('setup');
    setTopicInput('');
  };

  // ---------------------------------------------------------------------------
  // RENDER: SETUP
  // ---------------------------------------------------------------------------
  if (gameState === 'setup') {
    return (
      <div className={styles.container}>
        <div className={styles.setupContainer}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
              <div style={{ padding: '16px', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '24px' }}>
                <Target size={48} color="#f59e0b" />
              </div>
            </div>
            <h1 className={styles.title}>Knowledge Quiz</h1>
            <p className={styles.subtitle}>Test your mastery with AI-generated questions. 3 hearts, 10 questions. Good luck!</p>
          </div>

          <div className={styles.inputGroup}>
            <input 
              type="text" 
              className={styles.input}
              placeholder="Enter any topic (e.g., Photosynthesis, React Hooks)" 
              value={topicInput}
              onChange={e => setTopicInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleStartQuiz(topicInput)}
            />
            
            {errorMsg && (
              <div style={{ color: '#ef4444', fontSize: '0.9rem', textAlign: 'center', background: 'rgba(239, 68, 68, 0.1)', padding: '8px', borderRadius: '8px' }}>
                {errorMsg}
              </div>
            )}

            <button 
              className={styles.primaryBtn} 
              disabled={!topicInput.trim()}
              onClick={() => handleStartQuiz(topicInput)}
            >
              <Sparkles size={18} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'text-bottom' }} />
              Generate Quiz
            </button>
          </div>

          {historyTopics.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <History size={16} color="#94a3b8" />
                <span style={{ color: '#94a3b8', fontSize: '0.9rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>Or select past topic</span>
              </div>
              <div className={styles.historyList}>
                {historyTopics.map((ht, idx) => (
                  <button 
                    key={idx} 
                    className={styles.historyItem}
                    onClick={() => {
                      setTopicInput(ht);
                      handleStartQuiz(ht);
                    }}
                  >
                    <BookA size={16} />
                    {ht}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: LOADING
  // ---------------------------------------------------------------------------
  if (gameState === 'loading') {
    return (
      <div className={styles.container}>
        <div className={styles.loadingContainer} style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', minHeight: '400px' }}>
          <div className={styles.spinner}></div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '24px' }}>Briefing the AI...</h2>
          <p style={{ color: '#94a3b8' }}>Generating 10 custom questions about <strong style={{ color: 'white' }}>{topicInput}</strong></p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: PLAYING
  // ---------------------------------------------------------------------------
  if (gameState === 'playing' && currentQuestion) {
    const progressPercent = ((currentQIndex) / questions.length) * 100;
    const isCorrect = selectedOption === currentQuestion.answer;
    
    return (
      <div className={styles.container}>
        <div className={styles.quizContainer}>
          
          {/* Header */}
          <div className={styles.quizHeader}>
            <div className={styles.progressContainer}>
              <div className={styles.progressBar} style={{ width: `${progressPercent}%` }}></div>
            </div>
            <div className={styles.hearts}>
              {[1, 2, 3].map((val) => (
                <Heart 
                  key={val} 
                  size={24} 
                  fill={val <= hearts ? "currentColor" : "none"} 
                  className={val <= hearts ? '' : styles.heartEmpty} 
                />
              ))}
            </div>
          </div>

          {/* Question Text */}
          <h2 className={styles.questionText}>{currentQuestion.question}</h2>

          {/* Options */}
          <div className={styles.optionsGrid}>
            {currentQuestion.options.map((opt, idx) => {
              let btnClass = styles.option;
              
              if (selectedOption === opt) {
                btnClass += ` ${styles.optionSelected}`;
              }
              
              if (isChecking) {
                btnClass += ` ${styles.optionDisabled}`;
                if (opt === currentQuestion.answer) {
                  btnClass += ` ${styles.optionCorrect}`;
                } else if (selectedOption === opt && opt !== currentQuestion.answer) {
                  btnClass += ` ${styles.optionIncorrect}`;
                }
              }

              return (
                <button
                  key={idx}
                  className={btnClass}
                  onClick={() => !isChecking && setSelectedOption(opt)}
                  disabled={isChecking}
                >
                  {opt}
                  {isChecking && opt === currentQuestion.answer && <CheckCircle2 size={20} />}
                  {isChecking && selectedOption === opt && opt !== currentQuestion.answer && <XCircle size={20} />}
                </button>
              );
            })}
          </div>

          {/* Feedback & Action Area */}
          <div style={{ marginTop: 'auto', paddingTop: '16px' }}>
            {isChecking && (
              <div className={`${styles.feedbackBar} ${isCorrect ? styles.feedbackCorrect : styles.feedbackIncorrect}`}>
                <div className={styles.feedbackText}>
                  <h3>{isCorrect ? 'Excellent!' : 'Incorrect'}</h3>
                  {!isCorrect && <p>Correct answer: {currentQuestion.answer}</p>}
                </div>
              </div>
            )}
            
            <div style={{ marginTop: '16px' }}>
              <button 
                className={styles.primaryBtn} 
                disabled={!selectedOption && !isChecking}
                onClick={handleCheck}
                style={{ 
                  background: isChecking ? (isCorrect ? '#10b981' : '#ef4444') : undefined,
                  boxShadow: isChecking ? 'none' : undefined
                }}
              >
                {isChecking ? 'Continue' : 'Check'}
              </button>
            </div>
          </div>

        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: RESULT
  // ---------------------------------------------------------------------------
  const isDead = hearts === 0;

  return (
    <div className={styles.container}>
      <div className={styles.resultContainer} style={{ alignItems: 'center', textAlign: 'center' }}>
        
        <div className={styles.resultIcon}>
          {isDead ? (
            <div style={{ padding: '20px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '50%' }}>
              <Heart size={64} fill="#ef4444" color="#ef4444" style={{ animation: 'pulse 2s infinite' }} opacity={0.5} />
            </div>
          ) : (
            <div style={{ padding: '20px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '50%' }}>
              <Target size={64} color="#10b981" />
            </div>
          )}
        </div>

        <h1 className={styles.title} style={{ background: isDead ? '#ef4444' : undefined, WebkitBackgroundClip: isDead ? 'text' : undefined }}>
          {isDead ? 'Out of Hearts!' : 'Quiz Complete!'}
        </h1>
        
        <p className={styles.subtitle}>
          {isDead 
            ? `You ran out of hearts on question ${currentQIndex + 1}. Better luck next time!` 
            : `You completed the quiz about ${topicInput}.`
          }
        </p>

        {!isDead && (
          <div className={styles.resultScore}>
            {score} / 10
          </div>
        )}

        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '24px' }}>
          <button className={styles.primaryBtn} onClick={handleRestart}>
            <RefreshCcw size={18} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'text-bottom' }} />
            Try Another Quiz
          </button>
          
          <Link href="/" passHref style={{ textDecoration: 'none', width: '100%' }}>
            <button className={styles.secondaryBtn}>
              <Home size={18} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'text-bottom' }} />
              Return to Dashboard
            </button>
          </Link>
        </div>

      </div>
    </div>
  );
}
