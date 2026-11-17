'use client';

import { useRef, useState } from 'react';
import { errorMessage, requestJson, successSchema } from '@/lib/client-api';
import StudyDialog from './StudyDialog';
import styles from './StudyDialog.module.css';

interface DeleteSessionDialogProps {
    id: string;
    topic: string;
    onDismiss: () => void;
    onDeleted: () => void;
}

export default function DeleteSessionDialog({ id, topic, onDismiss, onDeleted }: DeleteSessionDialogProps) {
    const pending = useRef(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState('');

    const dismiss = () => {
        if (!pending.current) onDismiss();
    };

    const confirmDelete = async () => {
        if (pending.current) return;
        pending.current = true;
        setIsDeleting(true);
        setError('');
        try {
            const result = await requestJson(`/api/sessions/${id}`, successSchema, { method: 'DELETE' });
            if (!result.success) throw new Error('The server did not confirm deletion.');
        } catch (cause) {
            setError(errorMessage(cause, 'The session could not be deleted. Please try again.'));
            pending.current = false;
            setIsDeleting(false);
            return;
        }
        onDeleted();
    };

    return (
        <StudyDialog title={`Delete ${topic}?`} onDismiss={dismiss} canDismiss={!isDeleting}>
            <p>This permanently deletes the session, its conversation, and any uploaded notes.</p>
            {error && <p className={styles.error} role="alert">{error}</p>}
            {isDeleting && <p role="status">Deleting session…</p>}
            <div className={styles.actions}>
                <button type="button" className="button-secondary" data-initial-focus onClick={dismiss} aria-disabled={isDeleting}>Cancel</button>
                <button type="button" className={styles.danger} onClick={confirmDelete} aria-disabled={isDeleting}>Delete session</button>
            </div>
        </StudyDialog>
    );
}
