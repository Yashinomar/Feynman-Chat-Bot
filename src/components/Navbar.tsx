import Link from 'next/link';
import styles from './Navbar.module.css';
import { BrainCircuit, BookOpen, User, PlusCircle, TrendingUp, Home, Target } from 'lucide-react';

export default function Navbar() {
  return (
    <nav className={styles.navbar}>
      <div className={styles.navContainer}>
        <Link href="/" className={styles.logo}>
          <div className={styles.logoIcon}>
            <BrainCircuit size={24} />
          </div>
          <span className={styles.logoText}>TeachBack</span>
        </Link>
        
        <div className={styles.navLinks}>
          <Link href="/" className={styles.navLink}>
            <Home size={18} />
            <span>Home</span>
          </Link>
          <Link href="/library" className={styles.navLink}>
            <BookOpen size={18} />
            <span>Library</span>
          </Link>
          <Link href="/quiz" className={styles.navLink}>
            <Target size={18} />
            <span>Quiz</span>
          </Link>
          <Link href="/dashboard" className={styles.navLink}>
            <TrendingUp size={18} />
            <span>Achievements</span>
          </Link>
        </div>

        <div className={styles.navActions}>
          <Link href="/?action=new" className={styles.newSessionBtn}>
            <PlusCircle size={18} />
            <span>New Session</span>
          </Link>
        </div>
      </div>
    </nav>
  );
}
