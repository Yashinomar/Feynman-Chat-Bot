'use client';

import styles from '../app/page.module.css';
import { useState, useRef, useEffect } from 'react';
import WikipediaModal from './WikipediaModal';
import { Mic, Loader2 } from 'lucide-react';

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
    const [isLearnModalOpen, setIsLearnModalOpen] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<BlobPart[]>([]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoading]);

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    audioChunksRef.current.push(e.data);
                }
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                await handleTranscription(audioBlob);
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
        } catch (error: any) {
            console.error("Error accessing microphone:", error);
            alert(`Microphone access is required. Error: ${error.message || error}`);
            setIsRecording(false);
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    const handleTranscription = async (audioBlob: Blob) => {
        setIsTranscribing(true);
        try {
            // Because Node.js (and Xenova/transformers) doesn't have a reliable built-in AudioContext to parse 
            // WebM files without external C++ FFmpeg dependencies, we will do the heavy lifting right here 
            // in the browser where full audio processing power is available!
            
            // 1. Read the Blob as an ArrayBuffer
            const arrayBuffer = await audioFileToBuffer(audioBlob);
            
            // 2. Decode it into 16kHz Float32 Audio Buffer using browser's AudioContext
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            const decodedAudioData = await audioContext.decodeAudioData(arrayBuffer);
            
            // 3. Extract the actual raw Float32 data array from the first channel (mono)
            const float32Data = decodedAudioData.getChannelData(0);
            
            // 4. Send this exact raw float32 array as a giant JSON array to our Node.js server! 
            // (It's slightly larger than WebM, but guarantees 100% compatibility with Transformers pipeline)
            
            const response = await fetch('/api/transcribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    audio: Array.from(float32Data) 
                }),
            });

            if (response.ok) {
                const data = await response.json();
                if (data.text) {
                    setInputText(prev => prev ? `${prev} ${data.text}` : data.text);
                }
            } else {
                console.error("Transcription failed", await response.text());
                alert("Transcription failed. The local API might be busy processing another item.");
            }
        } catch (error) {
            console.error("Error during transcription:", error);
            alert("An error occurred during audio processing or transcription.");
        } finally {
            setIsTranscribing(false);
        }
    };
    
    // Helper to read blob
    const audioFileToBuffer = (blob: Blob) => {
        return new Promise<ArrayBuffer>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as ArrayBuffer);
            reader.onerror = reject;
            reader.readAsArrayBuffer(blob);
        });
    };

    const toggleRecording = () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    };

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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2>Current topic: <span>{topic}</span></h2>
                    <button 
                        className="button-secondary" 
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px' }}
                        onClick={() => setIsLearnModalOpen(true)}
                        title="Learn more about this topic"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="16" x2="12" y2="12"></line>
                            <line x1="12" y1="8" x2="12.01" y2="8"></line>
                        </svg>
                        Learn
                    </button>
                </div>
            </header>

            {isLearnModalOpen && (
                <WikipediaModal 
                    topic={topic} 
                    onClose={() => setIsLearnModalOpen(false)} 
                />
            )}

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
                    <button
                        className={`${styles.recordBtn} ${isRecording ? styles.recordingPulse : ''}`}
                        onClick={toggleRecording}
                        disabled={isLoading || isTranscribing || masteryScore === 100}
                        title={isRecording ? "Stop recording" : "Start speaking"}
                    >
                        {isTranscribing ? <Loader2 size={20} className="animate-spin" /> : <Mic size={20} color={isRecording ? '#ef4444' : 'currentColor'} />}
                    </button>
                    <textarea
                        placeholder={masteryScore === 100 ? "You’ve wrapped this one up nicely." : isTranscribing ? "Transcribing..." : isRecording ? "Listening..." : "Explain it as if I’ve never seen it before..."}
                        className={styles.textarea}
                        rows={1}
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={isLoading || isTranscribing || masteryScore === 100}
                    ></textarea>
                    <button
                        className="button-primary"
                        onClick={handleSend}
                        disabled={isLoading || isTranscribing || (!inputText.trim() && !isRecording) || masteryScore === 100}
                    >
                        {isLoading ? '...' : 'Send'}
                    </button>
                </div>
            </div>
        </div>
    );
}
