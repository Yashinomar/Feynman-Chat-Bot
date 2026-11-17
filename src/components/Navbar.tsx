import Link from 'next/link';
import styles from './Navbar.module.css';
import { BrainCircuit, BookOpen, User, ArrowRight, Home, Map } from 'lucide-react';

export default function Navbar() {
  return (
    <nav className={styles.navbar} aria-label="Primary">
      <div className={styles.navContainer}>
        <Link href="/" className={styles.logo} aria-label="TeachBack home">
          <div className={styles.logoIcon}>
            <BrainCircuit size={24} />
          </div>
          <span className={styles.logoText}>TeachBack</span>
        </Link>
        
        <div className={styles.navLinks}>
          <Link href="/" className={styles.navLink} aria-label="Home">
            <Home size={18} />
            <span>Home</span>
          </Link>
          <Link href="/courses" className={styles.navLink} aria-label="Courses">
            <Map size={18} />
            <span>Learn</span>
          </Link>
          <Link href="/library" className={styles.navLink} aria-label="Library">
            <BookOpen size={18} />
            <span>Library</span>
          </Link>
          <Link href="/dashboard" className={styles.navLink} aria-label="Profile">
            <User size={18} />
            <span>Profile</span>
          </Link>
        </div>

        <div className={styles.navActions}>
          <Link href="/courses" className={styles.newSessionBtn} aria-label="Learning path">
            <ArrowRight size={18} />
            <span>Learning path</span>
          </Link>
        </div>
      </div>
    </nav>
  );
}
