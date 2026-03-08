'use client'

import { Info } from 'lucide-react'
import { ReactNode } from 'react'
import clsx from 'clsx'

interface TooltipProps {
    content: ReactNode
    children?: ReactNode
    className?: string
}

export default function Tooltip({ content, children, className }: TooltipProps) {
    return (
        <span className={clsx("group relative inline-flex items-center gap-1.5 align-middle cursor-help", className)}>
            {children}
            <Info className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-600 transition-colors shrink-0" />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-xs px-3 py-2 bg-zinc-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 pointer-events-none shadow-xl whitespace-normal text-center font-normal leading-relaxed tracking-normal break-words">
                {content}
                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-zinc-900" />
            </div>
        </span>
    )
}
