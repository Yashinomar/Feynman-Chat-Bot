'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from '@/components/courses.module.css';

export default function AdminLogin() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <main className={styles.manager} style={{ maxWidth: 480 }}><h1>Administrator sign in</h1><p>Use your administrator username and password to manage courses and lessons.</p>
    <form className={styles.editor} onSubmit={async event => {
      event.preventDefault(); if (busy) return;
      const fields = new FormData(event.currentTarget); setBusy(true); setError('');
      try {
        const result = await signIn('credentials', { username: fields.get('username'), password: fields.get('password'), redirect: false });
        if (result?.error) throw new Error('Invalid username or password.');
        const response = await fetch('/api/admin/courses');
        if (!response.ok) throw new Error(response.status === 403 ? 'This account does not have administrator access.' : 'Unable to verify access. Please try again.');
        router.push('/admin'); router.refresh();
      } catch (err) { setError(err instanceof Error ? err.message : 'Unable to sign in.'); }
      finally { setBusy(false); }
    }}><label>Admin username<input name="username" autoComplete="username" required maxLength={32} /></label><label>Admin password<input name="password" type="password" autoComplete="current-password" required /></label>{error && <p role="alert">{error}</p>}<button disabled={busy}>{busy ? 'Signing in…' : 'Open admin center'}</button></form>
    <Link href="/">Return home</Link>
  </main>;
}
