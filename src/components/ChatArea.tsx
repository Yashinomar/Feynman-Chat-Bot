'use client';

import styles from '../app/page.module.css';
import { useState, useRef, useEffect } from 'react';

type Role = 'ai' | 'user';

export interface Message {
    id: string;
    role: Role;
    content: string;
}

interface ChatAreaProps {
    topic: string;
    messages: Message[];
    onSendMessage: (text: string) => void;
    isLoading: boolean;
    masteryScore?: number;
}

export default function ChatArea({ topic, messages, onSendMessage, isLoading, masteryScore = 0 }: ChatAreaProps) {
    const [inputText, setInputText] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoading]);

    const handleSend = () => {
        if (inputText.trim() && !isLoading) {
            onSendMessage(inputText);
            setInputText('');
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className={styles.chatWrapper}>
            <header className={styles.chatHeader}>
                <h2>Current topic: <span>{topic}</span></h2>
            </header>

            <div id="chat-history-container" className={styles.chatArea}>
                {messages.map((msg) => (
                    <div
                        key={msg.id}
                        className={`${styles.message} ${msg.role === 'ai' ? styles.aiMessage : styles.userMessage} animate-fade-in`}
                    >
                        <div className={styles.avatar}>
                            {msg.role === 'ai' ? 'AI' : 'You'}
                        </div>
                        <div className={styles.messageContent}>
                            <p>{msg.content}</p>
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div className={`${styles.message} ${styles.aiMessage} animate-fade-in`}>
                        <div className={styles.avatar}>AI</div>
                        <div className={styles.messageContent}>
                            <p>Thinking this through…</p>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {masteryScore === 100 && (
                <div style={{ textAlign: 'center', padding: '16px', background: 'rgba(16, 185, 129, 0.2)', borderTop: '1px solid rgba(16, 185, 129, 0.4)', color: '#10b981', fontWeight: 600, borderBottomLeftRadius: '16px', borderBottomRightRadius: '16px' }}>
                    🎉 Topic mastered — you’ve explained the big ideas clearly.
                </div>
            )}

            <div className={styles.inputArea}>
                <div className={styles.inputWrapper}>
                    <textarea
                        placeholder={masteryScore === 100 ? "You’ve wrapped this one up nicely." : "Explain it as if I’ve never seen it before..."}
                        className={styles.textarea}
                        rows={1}
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={isLoading || masteryScore === 100}
                    ></textarea>
                    <button
                        className="button-primary"
                        onClick={handleSend}
                        disabled={isLoading || !inputText.trim() || masteryScore === 100}
                    >
                        {isLoading ? '...' : 'Send'}
                    </button>
                </div>
            </div>
        </div>
    );
}
