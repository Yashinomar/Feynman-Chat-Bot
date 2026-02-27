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
}

export default function ChatArea({ topic, messages, onSendMessage, isLoading }: ChatAreaProps) {
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
        <main className={styles.main}>
            <header className={styles.chatHeader}>
                <h2>Current Topic: <span>{topic}</span></h2>
            </header>

            <div className={styles.chatArea}>
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
                            <p>Thinking...</p>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className={styles.inputArea}>
                <div className={styles.inputWrapper}>
                    <textarea
                        placeholder="Explain it like I'm a beginner..."
                        className={styles.textarea}
                        rows={1}
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={isLoading}
                    ></textarea>
                    <button
                        className="button-primary"
                        onClick={handleSend}
                        disabled={isLoading}
                    >
                        Send
                    </button>
                </div>
            </div>
        </main>
    );
}
