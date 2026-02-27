'use client';

import { useState } from 'react';
import styles from './page.module.css';
import Sidebar from '../components/Sidebar';
import ChatArea, { Message } from '../components/ChatArea';

export default function Home() {
  const [topic, setTopic] = useState('Photosynthesis');
  const [masteryScore, setMasteryScore] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'ai',
      content: "Hello! I'm ready to learn. You mentioned we're studying Photosynthesis today. I don't know much about it. Can you explain the basic idea to me?"
    }
  ]);

  const handleSendMessage = async (text: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          topic,
        }),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const data = await response.json();

      if (data.score !== undefined) {
        setMasteryScore(data.score);
      }

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: data.reply
      };

      setMessages(prev => [...prev, aiMessage]);

    } catch (error) {
      console.error("Failed to send message:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: "Oops, I had trouble processing that. Could you try explaining it again?"
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <Sidebar topic={topic} masteryScore={masteryScore} messages={messages} />
      <ChatArea
        topic={topic}
        messages={messages}
        onSendMessage={handleSendMessage}
        isLoading={isLoading}
      />
    </div>
  );
}
