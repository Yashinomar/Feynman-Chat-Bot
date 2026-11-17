'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Send, Users, Activity, CheckCircle2, ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import styles from './multiplayer.module.css';

interface ChatMessage { id: string; sender: 'You' | 'Partner' | 'AI Tutor'; content: string }
interface RoomState {
  room: string; topic: string; gameMode: 'classic' | 'survival' | 'rush'; role: 'host' | 'guest';
  hostOffer?: RTCSessionDescriptionInit; guestAnswer?: RTCSessionDescriptionInit;
  hostIceCandidates: RTCIceCandidateInit[]; guestIceCandidates: RTCIceCandidateInit[];
}
const CONNECTED = 'Connected! Tutor is listening.';
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, cache: 'no-store' });
  const data = await res.json();
  if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'The request failed. Please try again.');
  return data as T;
}

export default function MultiplayerRoom() {
  const params = useParams<{ room: string }>();
  const room = params.room;
  const [topic, setTopic] = useState('');
  const [role, setRole] = useState<'host' | 'guest' | null>(null);
  const [status, setStatus] = useState('Setting things up...');
  const [error, setError] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isAITyping, setIsAITyping] = useState(false);
  const [gameMode, setGameMode] = useState<'classic' | 'survival' | 'rush'>('classic');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const dataChannel = useRef<RTCDataChannel | null>(null);
  const processedMessages = useRef(new Set<string>());
  const generationBusy = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const messagesLeft = Math.max(0, 15 - messages.filter(message => message.sender !== 'AI Tutor').length);
  const timeLeft = startedAt === null ? 180 : Math.max(0, 180 - Math.floor((now - startedAt) / 1_000));
  const isGameOver = (gameMode === 'survival' && messagesLeft === 0) || (gameMode === 'rush' && timeLeft === 0);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => {
    if (gameMode !== 'rush' || startedAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [gameMode, startedAt]);

  useEffect(() => {
    alive.current = true;
    let stopped = false;
    let peer: RTCPeerConnection | undefined;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let processedIce = 0;
    let failures = 0;
    const abort = new AbortController();
    const signal = async (action: string, data: unknown) => api('/api/signaling', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: abort.signal,
      body: JSON.stringify({ room, action, data }),
    });
    const fail = (cause: unknown) => {
      if (stopped) return;
      setError(cause instanceof Error ? cause.message : 'The connection failed. Try creating a new room.');
    };
    const append = (message: ChatMessage) => setMessages(previous => previous.some(item => item.id === message.id) ? previous : [...previous, message].slice(-500));

    async function initialize() {
      try {
        const initial = await api<RoomState>(`/api/signaling?room=${encodeURIComponent(room)}`, { signal: abort.signal });
        if (stopped) return;
        const isHost = initial.role === 'host';
        setRole(initial.role);
        setTopic(initial.topic);
        setGameMode(initial.gameMode);
        setStatus(isHost ? 'Waiting for partner to join...' : 'Connecting to host...');
        append({ id: 'welcome', sender: 'AI Tutor', content: `Welcome! Take turns explaining ${initial.topic}. This room’s conversation is temporary and is not saved to your study history.` });
        peer = new RTCPeerConnection({ iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
        ] });
        const connection = peer;
        connection.onconnectionstatechange = () => {
          if (!stopped && ['failed', 'disconnected'].includes(connection.connectionState)) {
            setStatus('Partner disconnected');
            setError('The peer connection was lost. Create a new room to reconnect. Restrictive networks may need a TURN relay.');
          }
        };
        connection.onicecandidate = (event) => {
          if (event.candidate && !stopped) void signal(isHost ? 'host-ice' : 'guest-ice', event.candidate.toJSON()).catch(fail);
        };
        const attachChannel = (channel: RTCDataChannel) => {
          dataChannel.current = channel;
          channel.onopen = () => {
            if (stopped) return;
            setStatus(CONNECTED);
            setError('');
            if (isHost) {
              const start = Date.now();
              setStartedAt(start); setNow(start);
              channel.send(JSON.stringify({ type: 'ready', startedAt: start }));
            }
          };
          channel.onclose = () => { if (!stopped) setStatus('Partner disconnected'); };
          channel.onerror = () => fail(new Error('The peer connection failed. Create a new room to reconnect.'));
          channel.onmessage = (event: MessageEvent<unknown>) => {
            if (stopped || typeof event.data !== 'string' || event.data.length > 12_000) return;
            try {
              const payload: unknown = JSON.parse(event.data);
              if (!payload || typeof payload !== 'object') return;
              if ('type' in payload && payload.type === 'ready' && !isHost && 'startedAt' in payload && typeof payload.startedAt === 'number' && Number.isFinite(payload.startedAt)) {
                // Local elapsed time avoids trusting the peer's clock.
                setStartedAt(Date.now()); setNow(Date.now()); return;
              }
              if (!('id' in payload) || typeof payload.id !== 'string' || payload.id.length > 64 ||
                  !('content' in payload) || typeof payload.content !== 'string' || !payload.content.trim() || payload.content.length > 6_000 ||
                  !('sender' in payload) || (payload.sender !== 'Partner' && !(payload.sender === 'AI Tutor' && !isHost))) return;
              append({ id: payload.id, content: payload.content, sender: payload.sender });
            } catch { fail(new Error('A message from your partner could not be read.')); }
          };
        };
        if (isHost) {
          if (initial.hostOffer) throw new Error('This room was already connected. Create a new room to reconnect.');
          attachChannel(connection.createDataChannel('chat'));
          const offer = await connection.createOffer();
          if (stopped) return;
          await connection.setLocalDescription(offer);
          await signal('host-offer', offer);
        } else {
          if (initial.guestAnswer) throw new Error('This room was already connected. Ask your partner for a new room.');
          connection.ondatachannel = event => attachChannel(event.channel);
        }
        const poll = async () => {
          if (stopped || connection.connectionState === 'closed') return;
          try {
            const state = await api<RoomState>(`/api/signaling?room=${encodeURIComponent(room)}`, { signal: abort.signal });
            if (stopped) return;
            if (isHost && state.guestAnswer && !connection.remoteDescription && connection.signalingState === 'have-local-offer') {
              await connection.setRemoteDescription(state.guestAnswer);
            } else if (!isHost && state.hostOffer && !connection.remoteDescription) {
              await connection.setRemoteDescription(state.hostOffer);
              const answer = await connection.createAnswer();
              await connection.setLocalDescription(answer);
              await signal('guest-answer', answer);
            }
            const candidates = isHost ? state.guestIceCandidates : state.hostIceCandidates;
            if (connection.remoteDescription) {
              while (processedIce < candidates.length) {
                const candidate = candidates[processedIce];
                await connection.addIceCandidate(candidate);
                processedIce++;
              }
            }
            failures = 0;
          } catch (cause) {
            failures++;
            fail(cause);
            if (failures >= 3) { setStatus('Connection unavailable'); return; }
          }
          // Continue trickle ICE after onopen; candidate gathering may still be active.
          if (!stopped) pollTimer = setTimeout(() => { void poll(); }, connection.connectionState === 'connected' ? 10_000 : 2_000);
        };
        if (!stopped) void poll();
      } catch (cause) { fail(cause); if (!stopped) setStatus('Connection unavailable'); }
    }
    void initialize();
    return () => {
      stopped = true; alive.current = false; abort.abort();
      if (pollTimer) clearTimeout(pollTimer);
      dataChannel.current?.close(); dataChannel.current = null;
      peer?.close();
    };
  }, [room]);

  useEffect(() => {
    const pending = messages.findLast(message => message.sender !== 'AI Tutor' && !processedMessages.current.has(message.id));
    if (role !== 'host' || !pending || generationBusy.current) return;
    processedMessages.current.add(pending.id);
    generationBusy.current = true;
    async function reply() {
      setIsAITyping(true);
      try {
        const data = await api<{ reply: string; score: number }>('/api/chat', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId: room, requestId: crypto.randomUUID(), messages: messages.slice(0, messages.findIndex(message => message.id === pending!.id) + 1).slice(-20).map(message => ({
            role: message.sender === 'AI Tutor' ? 'ai' : 'user',
            content: message.sender === 'AI Tutor' ? message.content : `${message.sender === 'Partner' ? 'Partner' : 'Host'}: ${message.content}`,
          })) }),
        });
        if (!alive.current) return;
        const response: ChatMessage = { id: crypto.randomUUID(), sender: 'AI Tutor', content: data.reply };
        setMessages(previous => [...previous, response].slice(-500));
        if (dataChannel.current?.readyState === 'open') dataChannel.current.send(JSON.stringify(response));
        else setError('The tutor replied, but your partner disconnected before the reply could be shared.');
      } catch (cause) {
        if (alive.current) setError(cause instanceof Error ? cause.message : 'The tutor could not respond. Send your next explanation to try again.');
      } finally {
        generationBusy.current = false;
        if (alive.current) setIsAITyping(false);
      }
    }
    void reply();
  }, [messages, role, room, isAITyping]);

  const handleSend = () => {
    const content = input.trim();
    if (!content || content.length > 5_900 || dataChannel.current?.readyState !== 'open' || isGameOver) return;
    const message: ChatMessage = { id: crypto.randomUUID(), sender: 'You', content };
    try {
      if (dataChannel.current.bufferedAmount > 64_000) throw new Error('Your connection is busy. Wait a moment before sending.');
      dataChannel.current.send(JSON.stringify({ ...message, sender: 'Partner' }));
      setMessages(previous => [...previous, message].slice(-500)); setInput(''); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Your message could not be sent.'); }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.roomInfo}>
          <Link href="/" className={styles.backBtn}><ArrowLeft size={18} /> Exit Multiplayer</Link>
          <div className={styles.roomBadge} style={{ overflowWrap: 'anywhere' }}>Room Code: {room}</div>
        </div>
        <div className={`${styles.statusIndicator} ${status === CONNECTED ? styles.connected : styles.waiting}`}>
          {status === CONNECTED ? <CheckCircle2 size={18} /> : <Activity size={18} />}{status}
        </div>
      </header>
      {error && <p role="alert" style={{ color: '#fca5a5', padding: '12px 24px' }}>{error}</p>}
      {gameMode !== 'classic' && status === CONNECTED && <div style={{ textAlign: 'center', padding: '12px', color: '#facc15' }}>
        {gameMode === 'survival' ? (isGameOver ? 'Game over: all explanations used.' : `${messagesLeft} shared explanations remaining`)
          : `Rush mode: ${Math.floor(timeLeft / 60)}:${(timeLeft % 60).toString().padStart(2, '0')}${isGameOver ? ' — time is up' : ''}`}
      </div>}
      <main className={styles.mainPanel}>
        <div className={styles.chatWindow}>
          {messages.map(message => <div key={message.id} className={`${styles.messageRow} ${message.sender === 'You' ? styles.you : message.sender === 'Partner' ? styles.partner : styles.tutor}`}>
            <div className={styles.label}>{message.sender === 'Partner' && <Users size={12} />} {message.sender}</div>
            <div className={styles.messageBubble}>{message.content}</div>
          </div>)}
          {isAITyping && <div className={`${styles.messageRow} ${styles.tutor}`}><div className={styles.label}>AI Tutor</div><div className={styles.messageBubble}><Loader2 size={14} /> Grading explanations...</div></div>}
          <div ref={messagesEndRef} />
        </div>
        <div className={styles.inputArea}>
          <input type="text" className={styles.inputField} maxLength={5_900}
            placeholder={isGameOver ? 'This game has ended. Start another room to continue.' : status === CONNECTED ? `Explain ${topic} to the tutor...` : 'Waiting for connection...'}
            value={input} onChange={event => setInput(event.target.value)} disabled={status !== CONNECTED || isGameOver}
            onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); handleSend(); } }} />
          <button className={styles.sendBtn} onClick={handleSend} disabled={!input.trim() || status !== CONNECTED || isGameOver} aria-label="Send explanation"><Send size={18} /></button>
        </div>
      </main>
    </div>
  );
}
