'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { z } from 'zod';
import styles from './WikipediaModal.module.css';
import StudyDialog from './StudyDialog';

interface WikipediaModalProps {
    topic: string;
    onClose: () => void;
}

const wikipediaSchema = z.object({
    title: z.string().max(500), extract: z.string().max(20000),
    type: z.string().optional(),
    thumbnail: z.object({ source: z.string().url(), width: z.number(), height: z.number() }).optional(),
});
type WikipediaData = z.infer<typeof wikipediaSchema>;

export default function WikipediaModal({ topic, onClose }: WikipediaModalProps) {
    const [data, setData] = useState<WikipediaData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        const fetchWikipediaData = async () => {
            try {
                // Use the Wikipedia REST API to get the summary
                const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`, { signal: controller.signal });

                if (!response.ok) {
                    if (response.status === 404) {
                        throw new Error(`Could not find a Wikipedia article for "${topic}".`);
                    }
                    throw new Error("Failed to fetch data from Wikipedia.");
                }

                const result = wikipediaSchema.parse(await response.json());

                // If it's a disambiguation page, the API might not give a good extract
                if (result.type === 'disambiguation') {
                    throw new Error(`The topic "${topic}" is too broad (disambiguation page). Try a more specific topic.`);
                }

                setData(result);
            } catch (err: unknown) {
                if (controller.signal.aborted) return;
                if (err instanceof Error) {
                    setError(err.message);
                } else {
                    setError('An unexpected error occurred.');
                }
            } finally {
                if (!controller.signal.aborted) setIsLoading(false);
            }
        };

        if (topic) {
            fetchWikipediaData();
        }
        return () => controller.abort();
    }, [topic]);

    return (
        <StudyDialog title={data?.title || 'Wikipedia'} onDismiss={onClose} className={styles.learnDialog}>
                <button type="button" className={styles.closeBtn} data-initial-focus onClick={onClose} aria-label="Close Wikipedia">
                    &times;
                </button>

                {isLoading ? (
                    <div className={styles.loadingState} role="status">
                        <div className={styles.spinner}></div>
                        <p>Searching Wikipedia for &quot;{topic}&quot;...</p>
                    </div>
                ) : error ? (
                    <div className={styles.errorState} role="alert">
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
                            {data.thumbnail && new URL(data.thumbnail.source).hostname === 'upload.wikimedia.org' && new URL(data.thumbnail.source).protocol === 'https:' && (
                                <div className={styles.thumbnailContainer}>
                                    <Image unoptimized width={data.thumbnail.width} height={data.thumbnail.height}
                                        src={data.thumbnail.source}
                                        alt={data.title}
                                        className={styles.thumbnail}
                                        loading="lazy"
                                    />
                                </div>
                            )}
                            <p>{data.extract}</p>
                        </div>
                        <div className={styles.footer}>
                            <a
                                href={`https://en.wikipedia.org/wiki/${encodeURIComponent(data.title)}`}
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
        </StudyDialog>
    );
}
