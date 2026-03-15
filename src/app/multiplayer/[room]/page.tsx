'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Send, Users, Activity, CheckCircle2, ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import styles from './multiplayer.module.css';

interface ChatMessage {
  id: string;
  sender: 'You' | 'Partner' | 'AI Tutor';
  content: string;
}

export default function MultiplayerRoom() {
  const params = useParams();
  const searchParams = useSearchParams();
  
  const room = (params.id || params.room as string); // Handle either dynamic var name
  const mode = searchParams.get('mode'); // 'host' or 'guest'

  const [topic, setTopic] = useState('');
  const [status, setStatus] = useState('Setting things up...');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isAITyping, setIsAITyping] = useState(false);
  
  // Gamification State
  const [gameMode, setGameMode] = useState<'classic'|'survival'|'rush'>('classic');
  const [messagesLeft, setMessagesLeft] = useState(15);
  const [timeLeft, setTimeLeft] = useState(180); // 3 minutes
  const [isGameOver, setIsGameOver] = useState(false);

  const pc = useRef<RTCPeerConnection | null>(null);
  const dataChannel = useRef<RTCDataChannel | null>(null);
  const pollingInterval = useRef<NodeJS.Timeout | null>(null);
  const processedIceCount = useRef(0);
  const isSetupRef = useRef(false);
  const hasNegotiated = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Rush Timer Logic
  useEffect(() => {
    if (gameMode !== 'rush' || status !== 'Connected! Tutor is listening.' || isGameOver) return;
    
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsGameOver(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameMode, status, isGameOver]);

  // WebRTC Setup
  useEffect(() => {
    if (isSetupRef.current) return;
    isSetupRef.current = true;

    if (!room || !mode) {
      setStatus('Invalid Room URL Configuration');
      return;
    }

    const initWebRTC = async () => {
      try {
        setStatus(mode === 'host' ? 'Waiting for partner to join...' : 'Connecting to host...');
        
        const peer = new RTCPeerConnection({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        });
        pc.current = peer;

        peer.onicecandidate = async (e) => {
          if (e.candidate) {
            await fetch('/api/signaling', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ room, action: mode === 'host' ? 'host-ice' : 'guest-ice', data: e.candidate })
            }).catch(console.error);
          }
        };

        const setupDataChannel = (dc: RTCDataChannel) => {
          dc.onopen = () => {
             setStatus('Connected! Tutor is listening.');
             if (pollingInterval.current) clearInterval(pollingInterval.current);
          };
          dc.onclose = () => setStatus('Partner Disconnected');
          dc.onmessage = (e) => {
             const payload = JSON.parse(e.data);
             // When receiving over network, sender maps perfectly ('Partner' or 'AI Tutor')
             setMessages(prev => [...prev, payload]);
          };
        };

        if (mode === 'host') {
          const dc = peer.createDataChannel('chat');
          dataChannel.current = dc;
          setupDataChannel(dc);

          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          
          await fetch('/api/signaling', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ room, action: 'host-offer', data: offer })
          });

          // Polling for Guest Answer
          pollingInterval.current = setInterval(async () => {
            try {
              const res = await fetch(`/api/signaling?room=${room}`);
              const data = await res.json();
              if (data.topic) setTopic(prev => prev || data.topic);
              if (data.gameMode) setGameMode(prev => (prev === 'classic' && data.gameMode !== 'classic') ? data.gameMode : prev);

              if (data.guestAnswer && peer.signalingState === 'have-local-offer' && !hasNegotiated.current) {
                hasNegotiated.current = true;
                await peer.setRemoteDescription(new RTCSessionDescription(data.guestAnswer));
              }

              if (data.guestIceCandidates && data.guestIceCandidates.length > processedIceCount.current) {
                for (let i = processedIceCount.current; i < data.guestIceCandidates.length; i++) {
                  await peer.addIceCandidate(new RTCIceCandidate(data.guestIceCandidates[i]))
                    .catch(e => console.error("Error adding ice candidate", e));
                }
                processedIceCount.current = data.guestIceCandidates.length;
              }
            } catch (err) {
               console.error('Signaling error', err);
            }
          }, 2000);

        } else if (mode === 'guest') {
          peer.ondatachannel = (e) => {
            dataChannel.current = e.channel;
            setupDataChannel(e.channel);
          };

          // Polling for Host Offer
          pollingInterval.current = setInterval(async () => {
            try {
              const res = await fetch(`/api/signaling?room=${room}`);
              const data = await res.json();
              
              if (data.topic) setTopic(prev => prev || data.topic);
              if (data.gameMode) setGameMode(prev => (prev === 'classic' && data.gameMode !== 'classic') ? data.gameMode : prev);

              if (data.hostOffer && peer.signalingState === 'stable' && !hasNegotiated.current) {
                hasNegotiated.current = true;
                await peer.setRemoteDescription(new RTCSessionDescription(data.hostOffer));
                const answer = await peer.createAnswer();
                await peer.setLocalDescription(answer);
                
                await fetch('/api/signaling', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ room, action: 'guest-answer', data: answer })
                });
              }

              if (data.hostIceCandidates && data.hostIceCandidates.length > processedIceCount.current) {
                for (let i = processedIceCount.current; i < data.hostIceCandidates.length; i++) {
                  await peer.addIceCandidate(new RTCIceCandidate(data.hostIceCandidates[i]))
                    .catch(e => console.error("Error adding ice candidate", e));
                }
                processedIceCount.current = data.hostIceCandidates.length;
              }
            } catch (err) {
               console.error('Signaling error', err);
            }
          }, 2000);
        }
      } catch (err) {
        console.error("WebRTC Init Error:", err);
        setStatus('Connection Error');
      }
    };

    initWebRTC();

    return () => {
      if (pollingInterval.current) clearInterval(pollingInterval.current);
      if (dataChannel.current) dataChannel.current.close();
      if (pc.current) pc.current.close();
    };
  }, [room, mode]);

  // Initial Welcome Message
  useEffect(() => {
    if (topic && messages.length === 0) {
      setMessages([{
        id: '0',
        sender: 'AI Tutor',
        content: `Welcome to the multiplayer room. Today you’re both working on **${topic}** — take turns explaining it and I’ll keep an eye on how clear things are.`
      }]);
    }
  }, [topic, messages.length]);

  // Handle AI Trigger (Only Host calls the API to avoid duplicate processing)
  useEffect(() => {
    const triggerAI = async () => {
      if (mode !== 'host' || messages.length === 0 || isAITyping) return;
      
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.sender === 'You' || lastMsg.sender === 'Partner') {
        setIsAITyping(true);
        
        try {
          // Construct the perspective accurately
          const apiMessages = messages.map(m => ({
            role: m.sender === 'AI Tutor' ? 'ai' : 'user',
            content: m.sender === 'Partner' ? `(My Peer says): ${m.content}` : `(Host says): ${m.content}`
          }));

          const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: apiMessages, topic: topic || 'General Science', gameMode })
          });

          const data = await response.json();
          const aiMsg: ChatMessage = { id: Date.now().toString(), sender: 'AI Tutor', content: data.reply };
          
          setMessages(prev => [...prev, aiMsg]);
          
          // Fanout AI response to guest
          if (dataChannel.current?.readyState === 'open') {
            dataChannel.current.send(JSON.stringify(aiMsg));
          }
        } catch (error) {
          console.error("AI Error:", error);
        } finally {
          setIsAITyping(false);
        }
      }
    };

    triggerAI();
  }, [messages, mode, topic, isAITyping]);

  const handleSend = () => {
    if (!input.trim() || status !== 'Connected! Tutor is listening.' || !dataChannel.current || isGameOver) return;
    
    if (gameMode === 'survival') {
      if (messagesLeft <= 0) {
        setIsGameOver(true);
        return;
      }
      setMessagesLeft(prev => prev - 1);
    }
    
    // The message is "from Me" locally
    const myMsg: ChatMessage = { id: Date.now().toString(), sender: 'You', content: input };
    setMessages(prev => [...prev, myMsg]);
    
    // Send to partner over WebRTC data channel as "Partner"
    const networkMsg: ChatMessage = { ...myMsg, sender: 'Partner' };
    dataChannel.current.send(JSON.stringify(networkMsg));
    
    setInput('');
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.roomInfo}>
          <Link href="/" className={styles.backBtn}>
            <ArrowLeft size={18} /> Exit Multiplayer
          </Link>
          <div className={styles.roomBadge}>
            Room Code: {room}
          </div>
        </div>
        <div className={`${styles.statusIndicator} ${status.includes('Connected') ? styles.connected : styles.waiting}`}>
          {status.includes('Waiting') || status.includes('Connecting') ? <Activity size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
          {status}
        </div>
      </header>

      {/* Gamification Banner */}
      {gameMode !== 'classic' && status === 'Connected! Tutor is listening.' && (
        <div style={{ background: gameMode === 'survival' ? 'rgba(220, 38, 38, 0.1)' : 'rgba(234, 179, 8, 0.1)', padding: '12px 24px', display: 'flex', justifyContent: 'center', alignItems: 'center', borderBottom: `1px solid ${gameMode === 'survival' ? 'rgba(220, 38, 38, 0.3)' : 'rgba(234, 179, 8, 0.3)'}` }}>
          {gameMode === 'survival' && (
            <div style={{ color: '#f87171', fontWeight: 700, fontSize: '1.1rem', letterSpacing: '1px' }}>
              {isGameOver ? '💀 GAME OVER: MESSAGES DEPLETED' : `⚔️ SURVIVAL MODE: ${messagesLeft} Messages Remaining`}
            </div>
          )}
          {gameMode === 'rush' && (
            <div style={{ display: 'flex', flexDirection: 'column', width: '100%', maxWidth: '400px', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: timeLeft > 30 ? '#facc15' : '#f87171', fontWeight: 700, fontSize: '1.1rem' }}>
                <span>⚡ RUSH MODE</span>
                <span>{Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</span>
              </div>
              <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(timeLeft / 180) * 100}%`, background: timeLeft > 30 ? '#facc15' : '#ef4444', transition: 'width 1s linear, background 0.3s' }} />
              </div>
            </div>
          )}
        </div>
      )}

      <main className={styles.mainPanel}>
        <div className={styles.chatWindow}>
          {messages.map(m => (
            <div key={m.id} className={`${styles.messageRow} ${m.sender === 'You' ? styles.you : m.sender === 'Partner' ? styles.partner : styles.tutor}`}>
              <div className={styles.label}>
                {m.sender === 'Partner' ? <Users size={12} style={{display:'inline', marginRight:'4px'}}/> : null}
                {m.sender}
              </div>
              <div className={styles.messageBubble}>
                {m.content}
              </div>
            </div>
          ))}
          {isAITyping && (
            <div className={`${styles.messageRow} ${styles.tutor}`}>
              <div className={styles.label}>AI Tutor</div>
              <div className={styles.messageBubble} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Loader2 size={14} className="animate-spin" /> Grading explanations...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className={styles.inputArea}>
          <input
            type="text"
            className={styles.inputField}
            placeholder={
              isGameOver ? (gameMode === 'survival' ? 'Game Over: No messages left.' : 'Game Over: Time is up!') :
              status === 'Connected! Tutor is listening.' ? 'Type your explanation here to the Tutor...' : 
              'Waiting for connection...'
            }
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={status !== 'Connected! Tutor is listening.' || isGameOver}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <button 
            className={styles.sendBtn} 
            onClick={handleSend}
            disabled={!input.trim() || status !== 'Connected! Tutor is listening.' || isGameOver}
          >
            <Send size={18} />
          </button>
        </div>
      </main>
    </div>
  );
}
