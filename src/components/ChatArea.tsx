'use client';

import styles from '../app/page.module.css';
import { useState, useRef, useEffect } from 'react';
import WikipediaModal from './WikipediaModal';
import { Mic, Loader2 } from 'lucide-react';
import { z } from 'zod';
import { errorMessage, jsonBody, requestJson } from '@/lib/client-api';

type Role = 'ai' | 'user';

export interface Message {
    id: string;
    role: Role;
    content: string;
}

interface ChatAreaProps {
    topic: string;
    messages: Message[];
    onSendMessage: (text: string) => Promise<boolean>;
    isLoading: boolean;
    isComplete?: boolean;
    masteryScore?: number;
}

export default function ChatArea({ topic, messages, onSendMessage, isLoading, isComplete = false, masteryScore = 0 }: ChatAreaProps) {
    const [inputText, setInputText] = useState('');
    const [isLearnModalOpen, setIsLearnModalOpen] = useState(false);
    const transcriptRef = useRef<HTMLDivElement>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<BlobPart[]>([]);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mountedRef = useRef(true);
    const sendingRef = useRef(false);
    const startingRecordingRef = useRef(false);
    const [mediaError, setMediaError] = useState('');

    useEffect(() => {
        const transcript = transcriptRef.current;
        if (transcript) transcript.scrollTop = transcript.scrollHeight;
    }, [messages, isLoading]);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
            const recorder = mediaRecorderRef.current;
            if (recorder && recorder.state !== 'inactive') {
                recorder.onstop = null;
                recorder.stop();
            }
            mediaStreamRef.current?.getTracks().forEach(track => track.stop());
        };
    }, []);

    const handleTranscription = async (audioBlob: Blob) => {
        if (!mountedRef.current) return;
        setIsTranscribing(true);
        setMediaError('');
        let audioContext: AudioContext | undefined;
        try {
            audioContext = new AudioContext();
            const decoded = await audioContext.decodeAudioData(await audioBlob.arrayBuffer());
            if (decoded.duration <= 0 || decoded.duration > 60) throw new Error('Please record between a moment and 60 seconds of audio.');
            // Render to mono at 16kHz rather than assuming the browser honors a requested rate.
            const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
            const source = offline.createBufferSource();
            source.buffer = decoded;
            source.connect(offline.destination);
            source.start();
            const rendered = await offline.startRendering();
            const samples = Array.from(rendered.getChannelData(0), sample => Math.max(-1, Math.min(1, sample)));
            const data = await requestJson('/api/transcribe', z.object({ text: z.string() }), jsonBody({ audio: samples, sampleRate: 16000 }));
            if (mountedRef.current) {
                const combined = `${inputText}${inputText ? ' ' : ''}${data.text}`;
                setInputText(combined.slice(0, 6000));
                if (combined.length > 6000) setMediaError('The transcript exceeds the 6,000-character message limit. Only the first part was added; please send it before recording more.');
                if (!data.text.trim()) setMediaError('No speech was detected. Try again in a quiet place.');
            }
        } catch (error) {
            if (mountedRef.current) setMediaError(errorMessage(error, 'Audio could not be transcribed. Please try again.'));
        } finally {
            await audioContext?.close().catch(() => undefined);
            if (mountedRef.current) setIsTranscribing(false);
        }
    };

    const stopRecording = () => {
        if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
        if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
        mediaStreamRef.current?.getTracks().forEach(track => track.stop());
        if (mountedRef.current) setIsRecording(false);
    };

    const startRecording = async () => {
        if (startingRecordingRef.current) return;
        startingRecordingRef.current = true;
        setMediaError('');
        try {
            if (!navigator.mediaDevices?.getUserMedia) throw new Error('Recording requires a supported browser and HTTPS (or localhost).');
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            if (!mountedRef.current) { stream.getTracks().forEach(track => track.stop()); return; }
            mediaStreamRef.current = stream;
            const recorder = new MediaRecorder(stream);
            mediaRecorderRef.current = recorder;
            audioChunksRef.current = [];
            recorder.ondataavailable = event => { if (event.data.size > 0) audioChunksRef.current.push(event.data); };
            recorder.onerror = () => { stopRecording(); setMediaError('Recording failed. Please try again.'); };
            recorder.onstop = () => {
                stream.getTracks().forEach(track => track.stop());
                if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
                if (mountedRef.current) {
                    setIsRecording(false);
                    void handleTranscription(new Blob(audioChunksRef.current, { type: recorder.mimeType }));
                }
            };
            recorder.start();
            setIsRecording(true);
            stopTimerRef.current = setTimeout(stopRecording, 59_000);
        } catch (error) {
            mediaStreamRef.current?.getTracks().forEach(track => track.stop());
            setMediaError(errorMessage(error, 'Microphone access is unavailable. You can type your explanation.'));
            setIsRecording(false);
        } finally { startingRecordingRef.current = false; }
    };

    const toggleRecording = () => { if (isRecording) stopRecording(); else void startRecording(); };

    const handleSend = async () => {
        if (!inputText.trim() || isLoading || isRecording || isTranscribing || sendingRef.current) return;
        sendingRef.current = true;
        try {
            const saved = await onSendMessage(inputText);
            if (saved) setInputText('');
        } catch {
            setMediaError('Your message could not be saved. The draft has been kept; please retry.');
        } finally { sendingRef.current = false; }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className={styles.chatWrapper}>
            <header className={styles.chatHeader}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <h2>Current topic: <span>{topic}</span></h2>
                    <button 
                        className="button-secondary" 
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px' }}
                        onClick={event => {
                            event.currentTarget.focus();
                            setIsLearnModalOpen(true);
                        }}
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

            <div ref={transcriptRef} id="chat-history-container" className={styles.chatArea} role="log" aria-label="Study conversation" tabIndex={0}>
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
            </div>

            {masteryScore === 100 && (
                <div style={{ textAlign: 'center', padding: '16px', background: 'rgba(16, 185, 129, 0.2)', borderTop: '1px solid rgba(16, 185, 129, 0.4)', color: '#10b981', fontWeight: 600, borderBottomLeftRadius: '16px', borderBottomRightRadius: '16px' }}>
                    🎉 Topic mastered — you’ve explained the big ideas clearly.
                </div>
            )}

            {mediaError && <p role="alert" style={{ color: '#fca5a5', padding: '8px 16px' }}>{mediaError}</p>}
            {isRecording && <p role="status">Recording stops automatically after one minute.</p>}
            <div className={styles.inputArea}>
                <div className={styles.inputWrapper}>
                    <button
                        className={`${styles.recordBtn} ${isRecording ? styles.recordingPulse : ''}`}
                        onClick={toggleRecording}
                        disabled={isLoading || isComplete || isTranscribing}
                        title={isRecording ? "Stop recording" : "Start speaking"}
                    >
                        {isTranscribing ? <Loader2 size={20} className="animate-spin" /> : <Mic size={20} color={isRecording ? '#ef4444' : 'currentColor'} />}
                    </button>
                    <textarea
                        placeholder={isTranscribing ? "Transcribing..." : isRecording ? "Listening..." : "Explain it as if I’ve never seen it before..."}
                        className={styles.textarea}
                        rows={1}
                        maxLength={6000}
                        aria-label="Your explanation"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={isLoading || isComplete || isTranscribing || isRecording}
                    ></textarea>
                    <button
                        className="button-primary"
                        onClick={handleSend}
                        disabled={isLoading || isComplete || isTranscribing || isRecording || !inputText.trim()}
                    >
                        {isLoading ? '...' : 'Send'}
                    </button>
                </div>
            </div>
        </div>
    );
}
