'use client';

import { useEffect, useState } from 'react';

export default function ReactiveBackground() {
    const [position, setPosition] = useState({ x: 0, y: 0 });

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            setPosition({ x: e.clientX, y: e.clientY });
        };

        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);

    return (
        <div className="pointer-events-none fixed inset-0 z-behind overflow-hidden">
            {/* Base dark ambient gradient */}
            <div className="absolute inset-0 bg-[#0d0f12]" />

            {/* Subtle Grid overlay */}
            <div
                className="absolute inset-0 opacity-[0.15]"
                style={{
                    backgroundImage: `linear-gradient(to right, #4f4f4f 1px, transparent 1px), linear-gradient(to bottom, #4f4f4f 1px, transparent 1px)`,
                    backgroundSize: '40px 40px'
                }}
            />

            {/* Mouse following glow effect */}
            <div
                className="absolute inset-0 transition-opacity duration-300"
                style={{
                    background: `
                        radial-gradient(
                            800px circle at ${position.x}px ${position.y}px, 
                            rgba(59, 130, 246, 0.15),
                            transparent 80%
                        ),
                        radial-gradient(
                            400px circle at ${position.x}px ${position.y}px, 
                            rgba(139, 92, 246, 0.15),
                            transparent 80%
                        )
                    `,
                }}
            />
        </div>
    );
}
