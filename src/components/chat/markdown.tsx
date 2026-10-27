"use client"

import { memo } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

/** Convierte las citas [n] en enlaces internos para mostrarlas como etiquetas. */
function linkCitations(text: string) {
  return text.replace(/\[(\d{1,2})\](?!\()/g, "[$1](#fuente-$1)")
}

export const Markdown = memo(function Markdown({ content }: { content: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children }) {
            if (href?.startsWith("#fuente-")) {
              return (
                <sup className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 align-[0.35em] text-[0.65rem] font-semibold text-muted-foreground no-underline">
                  {children}
                </sup>
              )
            }
            return (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            )
          },
        }}
      >
        {linkCitations(content)}
      </ReactMarkdown>
    </div>
  )
})
