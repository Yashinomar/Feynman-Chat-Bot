'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ArrowRight, BookOpen, Map, MessageCircle, Sprout } from 'lucide-react';
import styles from './home.module.css';

export default function DashboardHome() {
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  if (status !== 'authenticated') return <p role="status">Loading your account…</p>;

  return <main className={styles.home}>
    <header className={styles.header}>
      <span className={styles.eyebrow}><Sprout size={18} aria-hidden="true" /> A LITTLE EVERY DAY</span>
      <h1>One small step.<br /><span>A clearer understanding.</span></h1>
      <p>Follow your learning path, connect the ideas, and explain them in your own words.</p>
    </header>
    <section className={styles.path} aria-labelledby="path-title">
      <div className={styles.pathIcon}><Map size={32} aria-hidden="true" /></div>
      <div className={styles.pathCopy}><span className={styles.eyebrow}>YOUR LEARNING PATH</span><h2 id="path-title">Make room for your next discovery.</h2><p>Short lessons, one clear next step, and Feynman practice along the way.</p></div>
      <Link href="/courses" className={styles.primary}>Open my learning path <ArrowRight size={19} aria-hidden="true" /></Link>
    </section>
    <div className={styles.rhythm} aria-label="How learning works">
      <span><BookOpen size={18} aria-hidden="true" /> Learn a little</span><ArrowRight size={16} aria-hidden="true" />
      <span><MessageCircle size={18} aria-hidden="true" /> Explain it simply</span><ArrowRight size={16} aria-hidden="true" />
      <span><Sprout size={18} aria-hidden="true" /> Build understanding</span>
    </div>
    <footer className={styles.footer}><p>Returning to something you started?</p><Link href="/library">Open saved practice <ArrowRight size={16} aria-hidden="true" /></Link></footer>
  </main>;
}
