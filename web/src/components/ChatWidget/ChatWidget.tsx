"use client";

import React, { useEffect, useRef, useState } from "react";
import styles from "./ChatWidget.module.css";
import { ChatMessage } from "../../types";

interface ChatWidgetProps {
  chatMessages: ChatMessage[];
  onSend: (message: string) => void;
  isTyping: boolean;
}

export default function ChatWidget({ chatMessages, onSend, isTyping }: ChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open && endRef.current) {
      endRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, isTyping, open]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSend(input.trim());
    setInput("");
  };

  return (
    <div className={styles.wrapper}>
      {open && (
        <div className={`${styles.panel} glass-panel rounded-2xl overflow-hidden`}>
          <div className="bg-surface-light/70 p-3.5 border-b border-border-color flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-accent-mint text-[22px]">smart_toy</span>
              <span className="text-xs font-bold text-on-surface">EcoMatch AI Asistanı</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-on-surface-variant hover:text-on-surface cursor-pointer">
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>

          <div className={styles.messages}>
            {chatMessages.slice(-6).map((msg, index) => (
              <div
                key={index}
                className={`flex gap-2 max-w-[90%] ${msg.role === "assistant" ? "self-start" : "self-end flex-row-reverse"}`}
              >
                <div
                  className={`p-2.5 rounded-xl text-[11px] leading-relaxed ${
                    msg.role === "assistant"
                      ? "bg-surface text-on-surface rounded-tl-none border border-border-color"
                      : "bg-accent-mint text-white rounded-tr-none"
                  }`}
                  dangerouslySetInnerHTML={{ __html: msg.content }}
                />
              </div>
            ))}
            {isTyping && (
              <div className="flex gap-2 max-w-[90%] self-start">
                <div className="p-2.5 rounded-xl text-[11px] bg-surface text-on-surface-variant rounded-tl-none border border-border-color">
                  yazıyor...
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="p-3 border-t border-border-color bg-surface-light/50 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSend();
              }}
              type="text"
              className="flex-grow bg-surface border border-border-color rounded-lg text-xs px-3 py-2.5 text-on-surface focus:outline-none focus:border-accent-mint"
              placeholder="Sorunuzu yazın..."
            />
            <button
              onClick={handleSend}
              className="btn-primary w-9 h-9 rounded-lg flex items-center justify-center shrink-0 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">send</span>
            </button>
          </div>
        </div>
      )}

      <button onClick={() => setOpen((o) => !o)} className={`${styles.fab} btn-primary cursor-pointer`}>
        <span className="material-symbols-outlined text-[24px]">{open ? "close" : "smart_toy"}</span>
      </button>
    </div>
  );
}
