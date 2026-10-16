"use client";

import React, { useState, useRef, useEffect } from "react";
import { HelpCircle } from "lucide-react";

interface HelpTooltipProps {
  text: string;
  title?: string;
}

export function HelpTooltip({ text, title }: HelpTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="relative inline-flex items-center" ref={ref}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="p-0.5 text-content-subtle hover:text-primary transition-colors cursor-pointer"
        aria-label="ヘルプ"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>

      {isOpen && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50 w-56 sm:w-64 p-3 bg-zinc-900 text-zinc-100 text-xs rounded-xl shadow-xl border border-zinc-700 animate-in fade-in zoom-in-95 duration-150">
          {title && <div className="font-bold text-primary mb-1">{title}</div>}
          <p className="text-[11px] leading-relaxed text-zinc-300">{text}</p>
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-zinc-900" />
        </div>
      )}
    </div>
  );
}
