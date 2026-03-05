'use client';

import styles from '../app/page.module.css';
import { useState } from 'react';
import { Message } from './ChatArea';

interface SidebarProps {
    topic: string;
    masteryScore: number;
    messages: Message[];
    onGoHome: () => void;
}

export default function Sidebar({ topic, masteryScore, messages, onGoHome }: SidebarProps) {
    const [hint, setHint] = useState<string | null>(null);
    const [isLoadingHint, setIsLoadingHint] = useState(false);

    const requestHint = async () => {
        setIsLoadingHint(true);
        setHint(null);
        try {
            const response = await fetch('/api/hint', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic, messages, score: masteryScore })
            });
            if (response.ok) {
                const data = await response.json();
                setHint(data.hint);
            } else {
                setHint("Couldn't load a hint right now. Try again!");
            }
        } catch (e) {
            console.error(e);
            setHint("Failed to get hint.");
        } finally {
            setIsLoadingHint(false);
        }
    };

    return (
        <aside className={`glass-panel ${styles.sidebar}`}>
            <div className={styles.sidebarHeader}>
                <div className={styles.headerTop}>
                    <h1>Feynman AI</h1>
                    <button className={styles.homeBtn} onClick={onGoHome} title="Back to Home">
                        🏠
                    </button>
                </div>
                <p className={styles.subtitle}>Teach to Learn</p>
            </div>

            <div className={styles.progressSection}>
                <div className={styles.progressHeader}>
                    <h3>Topic Mastery</h3>
                    <span>{masteryScore}%</span>
                </div>
                <div className={styles.progressBarBg}>
                    <div
                        className={styles.progressBarFill}
                        style={{ width: `${masteryScore}%` }}
                    ></div>
                </div>
                <p className={styles.progressText}>
                    {masteryScore === 0 ? "Start explaining to increase mastery." :
                        masteryScore < 50 ? "Good start! Keep explaining details." :
                            masteryScore < 90 ? "You're getting there! Give some examples." :
                                "Excellent mastery of the topic!"}
                </p>
            </div>

            <div className={styles.hintSection}>
                <h3>Need a nudge?</h3>
                <p>Get a hint on what to explain next.</p>
                <button
                    className="button-secondary"
                    onClick={requestHint}
                    disabled={isLoadingHint}
                >
                    {isLoadingHint ? "Thinking..." : "Request Hint"}
                </button>
                {hint && (
                    <div className="animate-fade-in" style={{ marginTop: '12px', padding: '12px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '8px', border: '1px solid rgba(59,130,246,0.3)', fontSize: '13px', color: '#e2e8f0' }}>
                        <strong style={{ color: '#60a5fa' }}>Hint:</strong> {hint}
                    </div>
                )}
            </div>
        </aside>
    );
}
