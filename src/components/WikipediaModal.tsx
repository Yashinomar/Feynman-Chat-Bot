'use client';

import { useEffect, useState } from 'react';
import styles from './WikipediaModal.module.css';

interface WikipediaModalProps {
    topic: string;
    onClose: () => void;
}

interface WikipediaData {
    title: string;
    extract_html: string;
    thumbnail?: {
        source: string;
        width: number;
        height: number;
    };
    content_urls: {
        desktop: {
            page: string;
        };
    };
}

export default function WikipediaModal({ topic, onClose }: WikipediaModalProps) {
    const [data, setData] = useState<WikipediaData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchWikipediaData = async () => {
            setIsLoading(true);
            setError(null);
            try {
                // Use the Wikipedia REST API to get the summary
                const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`);
                
                if (!response.ok) {
                    if (response.status === 404) {
                        throw new Error(`Could not find a Wikipedia article for "${topic}".`);
                    }
                    throw new Error("Failed to fetch data from Wikipedia.");
                }

                const result: WikipediaData = await response.json();
                
                // If it's a disambiguation page, the API might not give a good extract
                if (result.extract_html && result.extract_html.includes('may refer to:')) {
                    throw new Error(`The topic "${topic}" is too broad (disambiguation page). Try a more specific topic.`);
                }

                setData(result);
            } catch (err: unknown) {
                if (err instanceof Error) {
                    setError(err.message);
                } else {
                    setError('An unexpected error occurred.');
                }
            } finally {
                setIsLoading(false);
            }
        };

        if (topic) {
            fetchWikipediaData();
        }
    }, [topic]);

    // Handle escape key to close
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div className={styles.header}>
                    <h2 className={styles.title}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        {data?.title || 'Wikipedia'}
                    </h2>
                    <button className={styles.closeBtn} onClick={onClose} aria-label="Close modal" title="Close">
                        &times;
                    </button>
                </div>

                {isLoading ? (
                    <div className={styles.loadingState}>
                        <div className={styles.spinner}></div>
                        <p>Searching Wikipedia for &quot;{topic}&quot;...</p>
                    </div>
                ) : error ? (
                    <div className={styles.errorState}>
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="8" x2="12" y2="12"></line>
                            <line x1="12" y1="16" x2="12.01" y2="16"></line>
                        </svg>
                        <p>{error}</p>
                    </div>
                ) : data ? (
                    <>
                        <div className={styles.content}>
                            {data.thumbnail && (
                                <div className={styles.thumbnailContainer}>
                                    <img 
                                        src={data.thumbnail.source} 
                                        alt={data.title} 
                                        className={styles.thumbnail} 
                                        loading="lazy"
                                    />
                                </div>
                            )}
                            <div dangerouslySetInnerHTML={{ __html: data.extract_html }} />
                        </div>
                        <div className={styles.footer}>
                            <a 
                                href={data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(topic)}`} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className={styles.linkBtn}
                            >
                                Read full article
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                    <polyline points="15 3 21 3 21 9"></polyline>
                                    <line x1="10" y1="14" x2="21" y2="3"></line>
                                </svg>
                            </a>
                        </div>
                    </>
                ) : null}
            </div>
        </div>
    );
}
