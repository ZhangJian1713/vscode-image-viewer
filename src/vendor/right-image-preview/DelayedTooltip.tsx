import React, { cloneElement, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const TOOLTIP_Z = 50_000;

export interface DelayedTooltipProps {
  /** Shown after delay; if empty, children render unchanged. */
  content: string;
  /** Hover delay before showing (ms). */
  delayMs?: number;
  /** When true, skip tooltip behavior. */
  disabled?: boolean;
  children: React.ReactElement;
}

/**
 * Hover tooltip with a configurable delay (native `title` shows immediately).
 * Merges mouse handlers / ref with the child element (typically a button).
 */
export function DelayedTooltip({
  content,
  delayMs = 900,
  disabled = false,
  children,
}: DelayedTooltipProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchorRef = useRef<HTMLElement | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    clearTimer();
    setOpen(false);
  }, [clearTimer]);

  const show = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPos({ top: r.top, left: r.left + r.width / 2 });
      setOpen(true);
    }, delayMs);
  }, [clearTimer, delayMs]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPos({ top: r.top, left: r.left + r.width / 2 });
    };
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  if (disabled || !content.trim()) {
    return children;
  }

  const mergeRef = (node: HTMLElement | null) => {
    anchorRef.current = node;
    const r = (children as React.ReactElement & { ref?: React.Ref<HTMLElement> }).ref;
    if (typeof r === 'function') r(node);
    else if (r && typeof r === 'object') (r as React.MutableRefObject<HTMLElement | null>).current = node;
  };

  const baseProps = children.props as Record<string, unknown>;
  const merged = cloneElement(
    children,
    {
      ...baseProps,
      ref: mergeRef,
      onMouseEnter: (e: React.MouseEvent) => {
        (children.props as { onMouseEnter?: (ev: React.MouseEvent) => void }).onMouseEnter?.(e);
        show();
      },
      onMouseLeave: (e: React.MouseEvent) => {
        (children.props as { onMouseLeave?: (ev: React.MouseEvent) => void }).onMouseLeave?.(e);
        hide();
      },
    } as React.HTMLAttributes<HTMLElement> & { ref: typeof mergeRef },
  );

  const flipUp = pos.top < 72;
  const bubble = (
    <div
      role="tooltip"
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        transform: flipUp ? 'translate(-50%, 10px)' : 'translate(-50%, calc(-100% - 10px))',
        maxWidth: Math.min(320, typeof window !== 'undefined' ? window.innerWidth - 24 : 320),
        padding: '8px 11px',
        borderRadius: 8,
        fontSize: 13,
        lineHeight: 1.45,
        color: 'rgba(235,242,255,0.95)',
        background: 'rgba(12,18,32,0.96)',
        border: '1px solid rgba(140,162,188,0.28)',
        boxShadow: '0 8px 28px rgba(0,0,0,0.55)',
        pointerEvents: 'none',
        zIndex: TOOLTIP_Z,
        boxSizing: 'border-box',
      }}
    >
      {content}
    </div>
  );

  return (
    <>
      {merged}
      {open && typeof document !== 'undefined' ? createPortal(bubble, document.body) : null}
    </>
  );
}
