'use client';

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import styles from './StudyDialog.module.css';

interface StudyDialogProps {
    title: string;
    children: ReactNode;
    onDismiss: () => void;
    canDismiss?: boolean;
    className?: string;
}

function wrapDialogFocus(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab') return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
        'a[href], button, input, select, textarea, [tabindex]',
    )).filter(element => element.tabIndex >= 0
        && !element.matches(':disabled, input[type="hidden"]')
        && !element.closest('[hidden], [inert]')
        && element.checkVisibility?.({ visibilityProperty: true }) !== false);
    const stops = controls.filter(element => {
        if (!(element instanceof HTMLInputElement) || element.type !== 'radio' || !element.name) return true;
        const group = controls.filter((candidate): candidate is HTMLInputElement => candidate instanceof HTMLInputElement
            && candidate.type === 'radio' && candidate.name === element.name && candidate.form === element.form);
        return element === (group.find(candidate => candidate.checked) ?? group[0]);
    });

    const active = document.activeElement;
    const current = stops.findIndex(stop => stop === active);
    const edge = event.shiftKey ? 0 : stops.length - 1;
    if (current === -1 || current === edge) {
        event.preventDefault();
        (event.shiftKey ? stops.at(-1) : stops[0])?.focus();
    }
}

export default function StudyDialog({ title, children, onDismiss, canDismiss = true, className = '' }: StudyDialogProps) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const headingId = useId();

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const opener = document.activeElement;
        dialog.showModal();
        dialog.querySelector<HTMLElement>('[data-initial-focus]')?.focus();
        return () => {
            dialog.close();
            if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
        };
    }, []);

    return (
        <dialog
            ref={dialogRef}
            className={`${styles.dialog} ${className}`}
            aria-labelledby={headingId}
            onKeyDown={wrapDialogFocus}
            onCancel={event => {
                event.preventDefault();
                if (canDismiss) onDismiss();
            }}
        >
            <h2 id={headingId} className={styles.title}>{title}</h2>
            {children}
        </dialog>
    );
}
