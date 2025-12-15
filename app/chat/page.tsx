'use client';

import { useChat } from 'ai/react';
import { useRef, useEffect, useState } from 'react';
import Link from 'next/link';

export default function ChatPage() {
    const { messages, input, handleInputChange, handleSubmit, isLoading, error, setMessages } = useChat({
        api: '/api/chat',
        onError: (err) => {
            console.error('Chat error:', err);
        }
    });
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [isReady, setIsReady] = useState<boolean | null>(null);

    // Load messages from localStorage on mount
    useEffect(() => {
        const savedMessages = localStorage.getItem('chat_messages');
        if (savedMessages) {
            try {
                setMessages(JSON.parse(savedMessages));
            } catch (e) {
                console.error('Failed to parse chat messages:', e);
            }
        }
    }, [setMessages]);

    // Save messages to localStorage whenever they change
    useEffect(() => {
        if (messages.length > 0) {
            localStorage.setItem('chat_messages', JSON.stringify(messages));
        }
    }, [messages]);

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

    const handleClearChat = () => {
        setMessages([]);
        localStorage.removeItem('chat_messages');
    };

    // Show banner if explicit error OR not ready (after check completes)
    const showBanner = error || (isReady === false);

    return (
        <div className="flex flex-col h-[calc(100vh-64px)] bg-zinc-50 p-4 md:p-6">
            <div className="flex-1 max-w-4xl mx-auto w-full flex flex-col bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-zinc-100 flex justify-between items-center bg-white">
                    <div>
                        <h2 className="text-base font-semibold text-zinc-900">Event Assistant</h2>
                        <p className="text-xs text-zinc-500">Ask about meetings, attendees, and logistics</p>
                    </div>

                    {messages.length > 0 && (
                        <button
                            onClick={handleClearChat}
                            className="group flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-zinc-500 hover:text-red-600 hover:bg-red-50 transition-all border border-transparent hover:border-red-100"
                            title="Clear conversation history"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            Clear Chat
                        </button>
                    )}
                </div>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6 bg-white">
                    {/* Error Banner */}
                    {showBanner && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                            <div className="flex items-start">
                                <div className="flex-shrink-0 mt-0.5">
                                    <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                    </svg>
                                </div>
                                <div className="ml-3 flex-1">
                                    <h3 className="text-sm font-medium text-red-800">Chat Unavailable</h3>
                                    <div className="mt-1 text-sm text-red-700">
                                        <p>
                                            {(isReady === false || error?.message.includes('Gemini API Key'))
                                                ? 'The Gemini API Key is missing. If you are a root user, please configure it in Event Settings.'
                                                : 'An error occurred while connecting to the chat service.'}
                                        </p>
                                    </div>
                                    {!isReady && (
                                        <div className="mt-3">
                                            <Link
                                                href="/settings"
                                                className="text-sm font-medium text-red-800 hover:text-red-900 underline underline-offset-2"
                                            >
                                                Go to Settings &rarr;
                                            </Link>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {messages.length === 0 && !showBanner && (
                        <div className="flex flex-col items-center justify-center h-full text-zinc-400 py-10">
                            <svg className="w-12 h-12 mb-3 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                            <p className="text-sm">Start a conversation to get help with your event.</p>
                        </div>
                    )}

                    {messages.map((m: any) => (
                        <div
                            key={m.id}
                            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            <div
                                className={`max-w-[85%] rounded-2xl px-5 py-3 text-sm shadow-sm leading-relaxed ${m.role === 'user'
                                    ? 'bg-zinc-900 text-white rounded-br-none'
                                    : 'bg-zinc-50 text-zinc-800 border border-zinc-100 rounded-bl-none'
                                    }`}
                            >
                                <div className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 ${m.role === 'user' ? 'text-zinc-400' : 'text-zinc-400'}`}>
                                    {m.role === 'user' ? 'You' : 'Assistant'}
                                </div>
                                <div className="whitespace-pre-wrap">{m.content}</div>
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex justify-start">
                            <div className="bg-zinc-50 text-zinc-500 border border-zinc-100 rounded-2xl rounded-bl-none px-5 py-3 text-sm shadow-sm flex items-center gap-2">
                                <div className="flex space-x-1">
                                    <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                    <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                    <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce"></div>
                                </div>
                                <span className="text-xs font-medium">Thinking...</span>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-4 bg-zinc-50/50 border-t border-zinc-100">
                    <form onSubmit={handleSubmit} className="flex gap-3 relative">
                        <input
                            ref={inputRef}
                            autoFocus
                            className="flex-1 rounded-xl border border-zinc-300 px-4 py-3 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 shadow-sm transition-all"
                            value={input}
                            onChange={handleInputChange}
                            disabled={isReady === false || isLoading}
                            placeholder={isReady === false ? "Chat configuration missing..." : "Ask a question..."}
                        />
                        <button
                            type="submit"
                            disabled={isReady === false || isLoading || !input.trim()}
                            className="bg-zinc-900 text-white px-5 py-3 rounded-xl text-sm font-semibold hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm active:scale-95 flex items-center gap-2"
                        >
                            <span>Send</span>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7" />
                            </svg>
                        </button>
                    </form>
                    <div className="text-center mt-2">
                        <p className="text-[10px] text-zinc-400">AI can make mistakes. Please verify important information.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
