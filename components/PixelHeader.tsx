'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

interface PixelHeaderProps {
  text: string;
  active: boolean;
  gridSize?: number;
  pixelColor?: string;
  className?: string;
}

export default function PixelHeader({
  text,
  active,
  gridSize = 10,
  pixelColor = '#d85b3f',
  className = '',
}: PixelHeaderProps) {
  const textRef = useRef<HTMLDivElement>(null);
  const pixelGridRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);

  useEffect(() => {
    const grid = pixelGridRef.current;
    if (!grid) return;
    grid.innerHTML = '';
    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const pixel = document.createElement('div');
        pixel.style.position = 'absolute';
        pixel.style.backgroundColor = pixelColor;
        pixel.style.width = `${100 / gridSize}%`;
        pixel.style.height = `${100 / gridSize}%`;
        pixel.style.left = `${col * (100 / gridSize)}%`;
        pixel.style.top = `${row * (100 / gridSize)}%`;
        pixel.style.opacity = '0';
        pixel.className = 'pixel-header__pixel';
        grid.appendChild(pixel);
      }
    }
  }, [gridSize, pixelColor]);

  useEffect(() => {
    const grid = pixelGridRef.current;
    const textEl = textRef.current;
    if (!grid || !textEl) return;

    const pixels = grid.querySelectorAll<HTMLDivElement>('.pixel-header__pixel');
    if (!pixels.length) return;

    if (timelineRef.current) {
      timelineRef.current.kill();
      timelineRef.current = null;
    }

    if (!active) {
      gsap.set(textEl, { opacity: 1 });
      gsap.set(pixels, { opacity: 0 });
      return;
    }

    const stepDuration = 0.5;
    const staggerEach = stepDuration / pixels.length;

    const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.5 });

    tl.to(pixels, {
      opacity: 1,
      duration: 0.05,
      stagger: { each: staggerEach, from: 'random' },
    })
      .to(textEl, { opacity: 0.15, duration: stepDuration * 0.6 }, '<')
      .to({}, { duration: 0.3 })
      .to(pixels, {
        opacity: 0,
        duration: 0.05,
        stagger: { each: staggerEach, from: 'random' },
      })
      .to(textEl, { opacity: 1, duration: stepDuration * 0.6 }, '<');

    timelineRef.current = tl;

    return () => {
      tl.kill();
    };
  }, [active]);

  return (
    <div className={`relative inline-block ${className}`}>
      <div ref={textRef} className="relative z-0">
        {text}
      </div>
      <div ref={pixelGridRef} className="absolute inset-0 z-10 pointer-events-none" />
    </div>
  );
}
