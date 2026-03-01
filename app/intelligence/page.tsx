"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Send, Terminal, Loader2, AlertCircle } from "lucide-react";
import clsx from "clsx";

/* ── Typing indicator (three bouncing dots + optional status text) ── */
function TypingIndicator({ statusMessage }: { statusMessage?: string | null }) {
    return (
        <div className="flex flex-col max-w-[85%] self-start items-start">
            <div className="text-xs text-zinc-500 mb-1 px-1 font-mono uppercase">Kenji</div>
            <div className="rounded-lg px-4 py-3 shadow-sm bg-zinc-50 text-zinc-800 rounded-bl-none border border-zinc-100">
                {statusMessage ? (
                    <div className="flex items-center gap-2 text-sm">
                        <span className="typing-dot w-2 h-2 rounded-full bg-zinc-500" style={{ animationDelay: "0ms" }} />
                        <span className="text-zinc-600 font-mono text-xs">{statusMessage}</span>
                    </div>
                ) : (
                    <div className="flex items-center gap-1.5 h-5">
                        <span className="typing-dot w-2 h-2 rounded-full bg-zinc-400" style={{ animationDelay: "0ms" }} />
                        <span className="typing-dot w-2 h-2 rounded-full bg-zinc-400" style={{ animationDelay: "150ms" }} />
                        <span className="typing-dot w-2 h-2 rounded-full bg-zinc-400" style={{ animationDelay: "300ms" }} />
                    </div>
                )}
            </div>
        </div>
    );
}

type Message = {
    role: "user" | "assistant" | "system";
    content: string;
    id: string;
};

function IntelligenceContent() {
    const { getToken } = useAuth();
    const { user } = useUser();
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isConnected, setIsConnected] = useState(false);
    const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const getTokenRef = useRef(getToken);
    getTokenRef.current = getToken;
    const autoQuerySentRef = useRef(false);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isWaitingForResponse]);

    // Connect to WebSocket
    useEffect(() => {
        let ws: WebSocket | null = null;
        let reconnectTimer: NodeJS.Timeout;
        let cancelled = false;

        const connect = async () => {
            if (cancelled) return;

            try {
                const token = await getTokenRef.current();
                if (!token || cancelled) {
                    if (!cancelled) setError("Failed to get authentication token");
                    return;
                }

                // Use env var if set, otherwise fall back to deriving from current page URL
                const envWsUrl = process.env.NEXT_PUBLIC_WS_URL;
                let wsUrl: string;
                if (envWsUrl) {
                    wsUrl = `${envWsUrl}${envWsUrl.includes("?") ? "&" : "?"}token=${token}`;
                } else {
                    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
                    const host = window.location.hostname === "localhost"
                        ? "localhost:8080"
                        : window.location.host;
                    wsUrl = `${protocol}://${host}/?token=${token}`;
                }

                if (cancelled) return;

                console.log("Connecting to:", wsUrl);
                ws = new WebSocket(wsUrl);

                ws.onopen = () => {
                    if (cancelled) { ws?.close(); return; }
                    console.log("Connected to Chat Gateway");
                    setIsConnected(true);
                    setError(null);

                    // Auto-send query from URL params (e.g. from attendee intelligence button)
                    const autoQuery = new URLSearchParams(window.location.search).get("autoQuery");
                    if (autoQuery && !autoQuerySentRef.current) {
                        autoQuerySentRef.current = true;
                        // Small delay to let history load first
                        setTimeout(() => {
                            if (cancelled || !ws || ws.readyState !== WebSocket.OPEN) return;
                            const userMsg: Message = { role: "user", content: autoQuery, id: Date.now().toString() };
                            setMessages((prev) => [...prev, userMsg]);
                            setIsWaitingForResponse(true);
                            ws.send(JSON.stringify({ type: "message", content: autoQuery }));
                            // Clear the param from URL so refresh won't re-send
                            const params = new URLSearchParams(window.location.search);
                            params.delete("autoQuery");
                            const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
                            router.replace(newUrl, { scroll: false });
                        }, 500);
                    }
                };

                ws.onmessage = (event) => {
                    if (cancelled) return;
                    try {
                        const data = JSON.parse(event.data);

                        // Load chat history from server on connect
                        if (data.type === "history") {
                            setMessages(data.messages.map((m: { role: string; content: string; timestamp?: number }) => ({
                                role: m.role as "user" | "assistant",
                                content: m.content,
                                id: String(m.timestamp || Date.now()),
                            })));
                        }

                        if (data.type === "chunk") {
                            setIsWaitingForResponse(false);
                            setStatusMessage(null);
                            setMessages((prev) => {
                                const lastMsg = prev[prev.length - 1];
                                if (lastMsg && lastMsg.role === "assistant") {
                                    return [
                                        ...prev.slice(0, -1),
                                        { ...lastMsg, content: lastMsg.content + data.content }
                                    ];
                                } else {
                                    return [...prev, { role: "assistant", content: data.content, id: Date.now().toString() }];
                                }
                            });
                        } else if (data.type === "status") {
                            setStatusMessage(data.content);
                        } else if (data.type === "thinking") {
                            // Show thinking as a dimmed inline message
                            setStatusMessage(null);
                            setMessages((prev) => {
                                const lastMsg = prev[prev.length - 1];
                                if (lastMsg && lastMsg.role === "system") {
                                    return [
                                        ...prev.slice(0, -1),
                                        { ...lastMsg, content: lastMsg.content + data.content }
                                    ];
                                } else {
                                    return [...prev, { role: "system", content: data.content, id: `thinking-${Date.now()}` }];
                                }
                            });
                        } else if (data.type === "tool") {
                            // Show tool invocation as a status message
                            const toolName = data.data?.name || data.data?.tool || "tool";
                            setStatusMessage(`Using ${toolName}…`);
                        } else if (data.type === "final") {
                            setIsWaitingForResponse(false);
                            setStatusMessage(null);
                        } else if (data.type === "user-message") {
                            setMessages((prev) => [
                                ...prev,
                                { role: "user", content: data.content, id: `broadcast-${Date.now()}` }
                            ]);
                            setIsWaitingForResponse(true);
                            setStatusMessage("Thinking…");
                        } else if (data.type === "error") {
                            setError(data.message);
                            setIsWaitingForResponse(false);
                            setStatusMessage(null);
                        }
                    } catch (err) {
                        console.error("Failed to parse message:", err);
                    }
                };

                ws.onclose = () => {
                    console.log("Disconnected");
                    setIsConnected(false);
                    wsRef.current = null;
                    // Only reconnect if the effect hasn't been cleaned up
                    if (!cancelled) {
                        reconnectTimer = setTimeout(connect, 3000);
                    }
                };

                ws.onerror = (err) => {
                    console.error("WebSocket Error:", err);
                    if (!cancelled) setError("Connection error");
                    ws?.close();
                };

                wsRef.current = ws;
            } catch (err) {
                console.error("Auth error:", err);
                if (!cancelled) setError("Authentication failed");
            }
        };

        connect();

        return () => {
            cancelled = true;
            clearTimeout(reconnectTimer);
            ws?.close();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSend = () => {
        if (!input.trim() || !wsRef.current || !isConnected) return;

        const userMsg: Message = { role: "user", content: input, id: Date.now().toString() };
        setMessages((prev) => [...prev, userMsg]);
        setIsWaitingForResponse(true);

        // Send to backend
        wsRef.current.send(JSON.stringify({
            type: "message",
            content: input
        }));

        setInput("");
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-64px)] bg-zinc-50 p-4 md:p-6">
            <div className="flex-1 max-w-4xl mx-auto w-full flex flex-col bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 bg-white sticky top-0 z-10">
                    <div className="flex items-center gap-3">
                        <div className={clsx("w-3 h-3 rounded-full transition-colors", isConnected ? "bg-emerald-500" : "bg-red-400 animate-pulse")} />
                        <div>
                            <h2 className="text-base font-semibold text-zinc-900">OpenClaw Insights</h2>
                            <p className="text-xs text-zinc-500 font-mono">
                                {isConnected ? "CONNECTED" : "CONNECTING..."}
                            </p>
                        </div>
                    </div>
                    <span className="text-sm text-zinc-400">
                        {user?.primaryEmailAddress?.emailAddress}
                    </span>
                </div>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6 bg-white">
                    {messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-zinc-400 space-y-4 py-10">
                            <Terminal size={48} className="text-zinc-300" />
                            <p className="text-sm">Start a conversation to get insights...</p>
                        </div>
                    )}

                    {messages.map((msg) => (
                        <div
                            key={msg.id}
                            className={clsx(
                                "flex flex-col max-w-[85%]",
                                msg.role === "user" ? "self-end items-end" : "self-start items-start"
                            )}
                        >
                            <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5 text-zinc-400 px-1">
                                {msg.role === "user" ? "You" : msg.role === "system" ? "Thinking" : "Kenji"}
                            </div>
                            <div
                                className={clsx(
                                    "rounded-2xl px-5 py-3 shadow-sm text-sm leading-relaxed",
                                    msg.role === "user"
                                        ? "bg-zinc-900 text-white rounded-br-none"
                                        : msg.role === "system"
                                            ? "bg-zinc-100/50 text-zinc-400 rounded-bl-none border border-zinc-200 italic text-xs"
                                            : "bg-zinc-50 text-zinc-800 rounded-bl-none border border-zinc-100"
                                )}
                            >
                                <div className="prose prose-sm max-w-none break-words
                                    prose-headings:text-zinc-900 prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1
                                    prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5
                                    prose-blockquote:border-zinc-300 prose-blockquote:text-zinc-600
                                    prose-a:text-blue-600 prose-a:underline prose-a:underline-offset-2
                                    prose-strong:text-zinc-900 prose-em:text-zinc-700
                                    prose-table:border-collapse prose-th:border prose-th:border-zinc-200 prose-th:px-3 prose-th:py-1 prose-th:bg-zinc-50
                                    prose-td:border prose-td:border-zinc-200 prose-td:px-3 prose-td:py-1
                                    prose-hr:border-zinc-200"
                                >
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        components={{
                                            pre: ({ node, ...props }) => (
                                                <div className="bg-zinc-900 rounded-lg p-3 my-2 overflow-x-auto border border-zinc-200 text-[13px]" {...props as React.HTMLAttributes<HTMLDivElement>} />
                                            ),
                                            code: ({ node, className, children, ...props }) => {
                                                const isBlock = className?.startsWith("language-");
                                                if (isBlock) {
                                                    return <code className={`${className ?? ""} font-mono text-[13px] text-zinc-100`} {...props}>{children}</code>;
                                                }
                                                return <code className="bg-zinc-100 text-zinc-800 px-1.5 py-0.5 rounded text-xs font-mono border border-zinc-200" {...props}>{children}</code>;
                                            },
                                            a: ({ node, ...props }) => <a className="text-blue-600 hover:text-blue-700 underline underline-offset-2 transition-colors font-medium" target="_blank" rel="noopener noreferrer" {...props} />,
                                        }}
                                    >
                                        {msg.content}
                                    </ReactMarkdown>
                                </div>
                            </div>
                        </div>
                    ))}

                    {isWaitingForResponse && <TypingIndicator statusMessage={statusMessage} />}

                    {error && (
                        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm self-center">
                            <AlertCircle size={16} />
                            <span>{error}</span>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-4 bg-zinc-50/50 border-t border-zinc-100">
                    <div className="relative flex items-end gap-2 bg-white border border-zinc-300 rounded-xl p-2 focus-within:border-zinc-900 focus-within:ring-1 focus-within:ring-zinc-900 transition-all shadow-sm">
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Ask a question..."
                            className="w-full bg-transparent text-zinc-900 placeholder-zinc-400 text-sm px-3 py-2 focus:outline-none resize-none max-h-32 min-h-[44px]"
                            rows={1}
                            style={{ height: 'auto' }}
                            onInput={(e) => {
                                const target = e.target as HTMLTextAreaElement;
                                target.style.height = 'auto';
                                target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
                            }}
                        />
                        <button
                            onClick={handleSend}
                            disabled={!isConnected || !input.trim()}
                            className={clsx(
                                "p-2 rounded-lg transition-all mb-0.5",
                                !isConnected || !input.trim()
                                    ? "bg-zinc-100 text-zinc-400 cursor-not-allowed"
                                    : "bg-zinc-900 text-white hover:bg-zinc-800 active:scale-95 shadow-sm"
                            )}
                        >
                            {isConnected ? <Send size={18} /> : <Loader2 size={18} className="animate-spin" />}
                        </button>
                    </div>
                    <div className="text-center mt-2">
                        <p className="text-[10px] text-zinc-400">
                            AI can make mistakes. Please verify important information.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function IntelligencePage() {
    return (
        <Suspense fallback={<div className="p-10 text-center text-zinc-500">Loading OpenClaw Insights...</div>}>
            <IntelligenceContent />
        </Suspense>
    );
}
