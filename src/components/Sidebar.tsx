'use client';

import styles from '../app/page.module.css';
import { useId, useState } from 'react';
import { Message } from './ChatArea';
import { z } from 'zod';
import { errorMessage, jsonBody, requestJson } from '@/lib/client-api';

interface SidebarProps {
    sessionId: string;
    disabled?: boolean;
    topic: string;
    masteryScore: number;
    messages: Message[];
    onGoHome: () => void;
    onDeleteSession: () => void;
}

export default function Sidebar({ sessionId, disabled = false, topic, masteryScore, messages, onGoHome, onDeleteSession }: SidebarProps) {
    const [hint, setHint] = useState<string | null>(null);
    const [isLoadingHint, setIsLoadingHint] = useState(false);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
    const [exportError, setExportError] = useState('');
    const [showTools, setShowTools] = useState(false);
    const toolsId = useId();

    const handleDownloadPDF = async () => {
        setIsGeneratingPDF(true);
        setExportError('');
        try {
            const html2pdf = (await import('html2pdf.js')).default;
            const chatElement = document.getElementById('chat-history-container');
            if (!chatElement) return;

            const clone = chatElement.cloneNode(true) as HTMLElement;
            clone.style.padding = '20px';
            clone.style.background = '#0f172a'; // Match theme
            clone.style.color = '#e2e8f0';
            clone.style.height = 'auto';
            clone.style.overflow = 'visible';

            const titleNode = document.createElement('h1');
            titleNode.innerText = `${topic} - Study Guide`;
            titleNode.style.textAlign = 'center';
            titleNode.style.marginBottom = '30px';
            titleNode.style.borderBottom = '1px solid #334155';
            titleNode.style.paddingBottom = '10px';
            clone.insertBefore(titleNode, clone.firstChild);

            const opt = {
                margin:       0.5,
                filename:     `${topic.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_study_guide.pdf`,
                image:        { type: 'jpeg' as const, quality: 0.98 },
                html2canvas:  { scale: 2, useCORS: true, windowWidth: clone.scrollWidth },
                jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' as const }
            };

            await html2pdf().set(opt).from(clone).save();
        } catch (e) {
            setExportError(errorMessage(e, 'PDF export failed. Please try again.'));
        } finally {
            setIsGeneratingPDF(false);
        }
    };

    const requestHint = async () => {
        setIsLoadingHint(true);
        setHint(null);
        try {
            const data = await requestJson('/api/hint', z.object({ hint: z.string() }), jsonBody({ sessionId }));
            setHint(data.hint);
        } catch (error) {
            setHint(errorMessage(error, 'Could not load a hint. Please try again.'));
        } finally {
            setIsLoadingHint(false);
        }
    };

    return (
        <aside className={`glass-panel ${styles.sidebar}`}>
            <button type="button" className={`button-secondary ${styles.studyToolsToggle}`} aria-expanded={showTools}
                aria-controls={toolsId} onClick={() => setShowTools(open => !open)}>
                Study tools · {masteryScore}% mastery
            </button>
            <div id={toolsId} className={styles.studyToolsContent} data-expanded={showTools}>
            <div className={styles.sidebarHeader}>
                <div className={styles.headerTop} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <h2 style={{ flex: 1, fontSize: '20px', color: '#e5efe8' }}>Feynman tools</h2>
                    <button className={styles.homeBtn} onClick={onGoHome} title="Back to Home">
                        🏠
                    </button>
                    <button type="button" className={styles.deleteBtn} onClick={event => {
                        event.currentTarget.focus();
                        onDeleteSession();
                    }} disabled={disabled} title="Delete Session" aria-label="Delete Session">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
                <p className={styles.subtitle}>Explain, connect, improve</p>
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
                <h3>Study guide export</h3>
                <p>Save this chat as a simple PDF you can review later.</p>
                <button
                    className="button-primary"
                    onClick={handleDownloadPDF}
                    disabled={isGeneratingPDF || messages.length < 3}
                    style={{ background: 'var(--success-color)' }}
                >
                    {isGeneratingPDF ? "Building your PDF..." : "Download as PDF"}
                </button>
                {exportError && <p role="alert">{exportError}</p>}
            </div>

            <div className={styles.hintSection}>
                <h3>Need a nudge?</h3>
                <p>Ask for a small hint on what to explain next.</p>
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
            </div>
        </aside>
    );
}
