'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ShieldCheck, Users, BrainCircuit, Star, ArrowLeft, Loader2, Database } from 'lucide-react';
import styles from '../dashboard/dashboard.module.css';

interface UserData {
  id: string;
  username: string;
  role: string;
  createdAt: string;
  sessions: {
    id: string;
    topic: string;
    masteryScore: number;
    updatedAt: string;
  }[];
}

interface AdminStats {
  globalStats: {
    totalUsers: number;
    totalSessions: number;
    avgMasteryScore: number;
  };
  users: UserData[];
}

export default function AdminDashboard() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [data, setData] = useState<AdminStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }

    if (status === 'authenticated') {
      const role = (session?.user as any)?.role;
      if (role !== 'ADMIN') {
        router.push('/');
        return;
      }

      // Fetch admin stats
      fetch('/api/admin/stats')
        .then(res => {
          if (!res.ok) throw new Error('Forbidden');
          return res.json();
        })
        .then(resData => {
          setData(resData);
          setIsLoading(false);
        })
        .catch(err => {
          console.error(err);
          router.push('/');
        });
    }
  }, [status, session, router]);

  if (isLoading || status === 'loading') {
    return (
      <div className={styles.container} style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={48} color="#60a5fa" className="spin" />
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes spin { 100% { transform: rotate(360deg); } }
          .spin { animation: spin 1s linear infinite; }
        `}} />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ background: 'rgba(244, 63, 94, 0.1)', padding: '12px', borderRadius: '16px' }}>
            <ShieldCheck size={32} color="#f43f5e" />
          </div>
          <div>
            <h1>Admin Control Center</h1>
            <p style={{ color: '#94a3b8' }}>Monitor site traffic and user learning progress.</p>
          </div>
        </div>
        <Link href="/" className={styles.backBtn}>
          <ArrowLeft size={18} /> Exit Admin
        </Link>
      </header>

      {/* Global Stats */}
      <h2 style={{ fontSize: '1.25rem', color: 'white', marginBottom: '16px' }}>Global Statistics</h2>
      <div className={styles.statsGrid}>
        <div className={styles.statCard} style={{ borderColor: 'rgba(59, 130, 246, 0.3)' }}>
          <span className={styles.statLabel}><Users size={16} style={{display: 'inline', marginRight: 8}}/> Total Users</span>
          <span className={styles.statValue} style={{ color: '#60a5fa' }}>{data?.globalStats.totalUsers}</span>
        </div>
        <div className={styles.statCard} style={{ borderColor: 'rgba(16, 185, 129, 0.3)' }}>
          <span className={styles.statLabel}><Database size={16} style={{display: 'inline', marginRight: 8}}/> Total Sessions</span>
          <span className={styles.statValue} style={{ color: '#34d399' }}>{data?.globalStats.totalSessions}</span>
        </div>
        <div className={styles.statCard} style={{ borderColor: 'rgba(245, 158, 11, 0.3)' }}>
          <span className={styles.statLabel}><Star size={16} style={{display: 'inline', marginRight: 8}}/> Avg Mastery Score</span>
          <span className={styles.statValue} style={{ color: '#fbbf24' }}>{data?.globalStats.avgMasteryScore}%</span>
        </div>
      </div>

      {/* User Directory */}
      <h2 style={{ fontSize: '1.25rem', color: 'white', marginTop: '40px', marginBottom: '16px' }}>User Directory</h2>
      <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '24px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <th style={{ padding: '16px 24px', color: '#94a3b8', fontWeight: 600, fontSize: '0.9rem' }}>Username</th>
              <th style={{ padding: '16px 24px', color: '#94a3b8', fontWeight: 600, fontSize: '0.9rem' }}>Role</th>
              <th style={{ padding: '16px 24px', color: '#94a3b8', fontWeight: 600, fontSize: '0.9rem' }}>Sessions Count</th>
              <th style={{ padding: '16px 24px', color: '#94a3b8', fontWeight: 600, fontSize: '0.9rem' }}>Recent Topic</th>
              <th style={{ padding: '16px 24px', color: '#94a3b8', fontWeight: 600, fontSize: '0.9rem' }}>Joined</th>
            </tr>
          </thead>
          <tbody>
            {data?.users.map(u => (
              <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '16px 24px', color: 'white', fontWeight: 500 }}>{u.username}</td>
                <td style={{ padding: '16px 24px' }}>
                  <span style={{ 
                    padding: '4px 8px', 
                    borderRadius: '8px', 
                    fontSize: '0.8rem', 
                    background: u.role === 'ADMIN' ? 'rgba(244, 63, 94, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                    color: u.role === 'ADMIN' ? '#f43f5e' : '#60a5fa',
                    fontWeight: 600
                  }}>
                    {u.role}
                  </span>
                </td>
                <td style={{ padding: '16px 24px', color: '#94a3b8' }}>{u.sessions.length}</td>
                <td style={{ padding: '16px 24px', color: '#94a3b8' }}>
                  {u.sessions.length > 0 ? (
                    <span>{u.sessions[0].topic} <span style={{ color: '#fbbf24', marginLeft: '4px' }}>({u.sessions[0].masteryScore}%)</span></span>
                  ) : '-'}
                </td>
                <td style={{ padding: '16px 24px', color: '#64748b', fontSize: '0.9rem' }}>
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
