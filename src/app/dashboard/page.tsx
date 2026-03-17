'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, BrainCircuit, MessageSquare, TrendingUp, Award, Zap, Star, ShieldCheck, BookOpen, Trophy, Calendar } from 'lucide-react';
import styles from './dashboard.module.css';
import badgeStyles from './badges.module.css';
import { useSession } from 'next-auth/react';
import type { Session } from '../chat/[id]/page';

export default function Dashboard() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const { data: authSession, status } = useSession();

  useEffect(() => {
    setIsMounted(true);
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (status === 'authenticated') {
      fetch('/api/sessions')
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            setSessions(data);
          }
        })
        .catch(e => console.error("Failed to fetch sessions from DB", e));
    }
  }, [status, router]);

  const stats = useMemo(() => {
    if (!sessions.length) return null;
    
    const totalTopics = sessions.length;
    const totalMessages = sessions.reduce((acc, curr) => acc + curr.messages.length, 0);
    const avgMastery = Math.round(
      sessions.reduce((acc, curr) => acc + curr.masteryScore, 0) / totalTopics
    );
    
    // Find highest scoring topic
    const bestTopic = sessions.reduce((prev, current) => 
      (prev.masteryScore > current.masteryScore) ? prev : current
    ).topic;

    return { totalTopics, totalMessages, avgMastery, bestTopic };
  }, [sessions]);

  const leaderboardItems = useMemo(() => {
    return [...sessions]
      .sort((a, b) => b.masteryScore - a.masteryScore)
      .slice(0, 5); // display top 5
  }, [sessions]);

  const recentActivity = useMemo(() => {
    return [...sessions]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 5); // display last 5
  }, [sessions]);

  const badges = useMemo(() => {
    return [
      {
        id: 'first_steps',
        title: 'First Steps',
        desc: 'Completed your first study session.',
        icon: <Zap size={24} />,
        unlocked: sessions.length >= 1
      },
      {
        id: 'perfectionist',
        title: 'Perfectionist',
        desc: 'Achieved 95%+ Mastery on a topic.',
        icon: <Star size={24} />,
        unlocked: sessions.some(s => s.masteryScore >= 95)
      },
      {
        id: 'endurance',
        title: 'Endurance',
        desc: 'Had a conversation over 10 messages long.',
        icon: <ShieldCheck size={24} />,
        unlocked: sessions.some(s => s.messages.length > 10)
      },
      {
        id: 'scholar',
        title: 'Dedicated Scholar',
        desc: 'Completed 5 different topic sessions.',
        icon: <BookOpen size={24} />,
        unlocked: sessions.length >= 5
      }
    ];
  }, [sessions]);

  if (!isMounted) return null;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Learning Analytics</h1>
        <Link href="/" className={styles.backBtn}>
          <ArrowLeft size={18} /> Back to Home
        </Link>
      </header>

      {sessions.length === 0 ? (
        <div className={styles.emptyState}>
          <BrainCircuit size={48} opacity={0.5} />
          <h2>No data yet</h2>
          <p>Run a couple of study sessions and we’ll start filling this page with your progress.</p>
        </div>
      ) : (
        <>
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <span className={styles.statLabel}><TrendingUp size={16} style={{display: 'inline', marginRight: 8}}/> Average Mastery</span>
              <span className={styles.statValue}>{stats?.avgMastery}%</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statLabel}><BrainCircuit size={16} style={{display: 'inline', marginRight: 8}}/> Topics Explored</span>
              <span className={styles.statValue}>{stats?.totalTopics}</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statLabel}><MessageSquare size={16} style={{display: 'inline', marginRight: 8}}/> Total Messages</span>
              <span className={styles.statValue}>{stats?.totalMessages}</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statLabel}><Award size={16} style={{display: 'inline', marginRight: 8}}/> Strongest Subject</span>
              <span className={styles.statValue} style={{fontSize: '1.5rem', marginTop: 'auto'}}>{stats?.bestTopic}</span>
            </div>
          </div>

          <div style={{ marginTop: '24px', marginBottom: '8px' }}>
            <h2 style={{ fontSize: '1.25rem', color: 'var(--text-primary)' }}>Achievements & Badges</h2>
            <div className={badgeStyles.badgesRow}>
              {badges.map(b => (
                <div key={b.id} className={`${badgeStyles.badge} ${b.unlocked ? badgeStyles.unlocked : badgeStyles.locked}`}>
                  <div className={badgeStyles.badgeIcon}>{b.icon}</div>
                  <h3>{b.title}</h3>
                  <p>{b.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.splitLayout}>
            <div className={styles.sectionCard}>
              <h2><Trophy size={20} color="#f59e0b" /> Subject Leaderboard</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {leaderboardItems.map(item => (
                  <div key={item.id} className={styles.leaderboardItem}>
                    <div className={styles.leaderboardInfo}>
                      <span className={styles.leaderboardTopic}>{item.topic}</span>
                      <span className={styles.leaderboardMeta}>
                        {item.messages.length} messages • Next review: {item.reviewDate ? new Date(item.reviewDate).toLocaleDateString() : 'N/A'}
                      </span>
                    </div>
                    <div className={styles.leaderboardScore}>
                      {item.masteryScore}%
                    </div>
                  </div>
                ))}
                {leaderboardItems.length === 0 && <p style={{ color: '#64748b' }}>No topics trained yet.</p>}
              </div>
            </div>

            <div className={styles.sectionCard}>
              <h2><Calendar size={20} color="#10b981" /> Recent Activity</h2>
              <div className={styles.timeline}>
                {recentActivity.map(activity => (
                  <div key={activity.id} className={styles.timelineItem}>
                    <div className={styles.timelineDot} />
                    <div className={styles.timelineContent}>
                      <span className={styles.timelineDate}>
                        {new Date(activity.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}
                      </span>
                      <span className={styles.timelineTitle}>
                        Trained <strong>{activity.topic}</strong> to {activity.masteryScore}% mastery.
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
