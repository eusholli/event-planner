'use client';

import { useChat } from 'ai/react';
import { useRef, useEffect, useState } from 'react';
import Link from 'next/link';

export default function ChatPage() {
    const { messages, input, handleInputChange, handleSubmit, isLoading, error } = useChat({
        api: '/api/chat',
        onError: (err) => {
            console.error('Chat error:', err);
        }
    });
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [isReady, setIsReady] = useState<boolean | null>(null);

    useEffect(() => {
        // Check if Chat is ready (configured)
        fetch('/api/chat/status')
            .then(res => res.json())
            .then(data => setIsReady(data.ready))
            .catch(() => setIsReady(false));
    }, []);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        if (!isLoading && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isLoading]);

    // Show banner if explicit error OR not ready (after check completes)
    const showBanner = error || (isReady === false);

    return (
        <div className="flex flex-col h-[calc(100vh-64px)] bg-zinc-50">
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-4">
                {/* Error Banner */}
                {showBanner && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                        <div className="flex items-center">
                            <div className="flex-shrink-0">
                                {/* Warning Icon */}
                                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <div className="ml-3">
                                <h3 className="text-sm font-medium text-red-800">
                                    Chat Unavailable
                                </h3>
                                <div className="mt-2 text-sm text-red-700">
                                    <p>
                                        {(isReady === false || error?.message.includes('Gemini API Key'))
                                            ? 'The Gemini API Key is missing. If you are a root user, please configure it in Event Settings. Otherwise, ask your event admin for assistance.'
                                            : 'An error occurred while connecting to the chat service.'}
                                    </p>
                                </div>
                                <div className="mt-4">
                                    <div className="-mx-2 -my-1.5 flex">
                                        <Link
                                            href="/settings"
                                            className="bg-red-50 px-2 py-1.5 rounded-md text-sm font-medium text-red-800 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-red-50 focus:ring-red-600"
                                        >
                                            Go to Settings &rarr;
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {messages.map((m: any) => (
                    <div
                        key={m.id}
                        className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                        <div
                            className={`max-w-[80%] rounded-lg px-4 py-2 text-sm shadow-sm ${m.role === 'user'
                                ? 'bg-zinc-900 text-white'
                                : 'bg-white text-zinc-900 border border-zinc-200'
                                }`}
                        >
                            <div className="font-semibold text-xs mb-1 opacity-70">
                                {m.role === 'user' ? 'You' : 'AI Assistant'}
                            </div>
                            <div className="whitespace-pre-wrap">{m.content}</div>
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div className="flex justify-start">
                        <div className="bg-white text-zinc-500 border border-zinc-200 rounded-lg px-4 py-2 text-sm shadow-sm animate-pulse">
                            Thinking...
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="bg-white border-t border-zinc-200 p-4">
                <div className="max-w-4xl mx-auto">
                    <form onSubmit={handleSubmit} className="flex gap-2">
                        <input
                            ref={inputRef}
                            autoFocus
                            className="flex-1 rounded-md border border-zinc-300 px-4 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                            value={input}
                            onChange={handleInputChange}
                            disabled={isReady === false || isLoading}
                            placeholder={isReady === false ? "Chat configuration missing..." : "Ask about meetings, creating events, or checking room availability..."}
                        />
                        <button
                            type="submit"
                            disabled={isReady === false || isLoading}
                            className="bg-zinc-900 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            Send
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
