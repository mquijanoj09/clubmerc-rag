"use client"

import { useState } from "react"
import { AlertTriangle, Ban, Check, ChevronDown, Copy, FileText, SearchX } from "lucide-react"
import { AssistantAvatar } from "@/components/assistant-avatar"
import { Markdown } from "@/components/chat/markdown"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { ChatMessage, MessageStatus, Source } from "@/lib/types"
import { cn } from "@/lib/utils"

const NOTICES: Partial<Record<MessageStatus, { icon: typeof Ban; label: string }>> = {
  off_topic: { icon: Ban, label: "Fuera del tema · no consumió preguntas" },
  no_info: { icon: SearchX, label: "Sin información en la documentación · no consumió preguntas" },
  error: { icon: AlertTriangle, label: "Error técnico" },
}

export function UserMessage({ content }: { content: string }) {
  return (
    <div className="flex justify-end animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
      <div className="max-w-[85%] rounded-3xl bg-muted px-4 py-2.5 text-[0.95rem] leading-7 break-words whitespace-pre-wrap sm:max-w-[75%]">
        {content}
      </div>
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Copiar respuesta"
            className="text-muted-foreground"
            onClick={async () => {
              await navigator.clipboard.writeText(text)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }}
          />
        }
      >
        {copied ? <Check className="text-emerald-600" /> : <Copy />}
      </TooltipTrigger>
      <TooltipContent>{copied ? "Copiado" : "Copiar"}</TooltipContent>
    </Tooltip>
  )
}

function SourcesToggle({ sources, open, onToggle }: { sources: Source[]; open: boolean; onToggle: () => void }) {
  const documents = new Set(sources.map((s) => s.document_name)).size
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <FileText className="size-3.5" />
      {sources.length} {sources.length === 1 ? "fuente" : "fuentes"}
      {documents > 1 && <span className="font-normal">· {documents} documentos</span>}
      <ChevronDown className={cn("size-3.5 transition-transform duration-200", open && "rotate-180")} />
    </button>
  )
}

function SourcesPanel({ sources, open }: { sources: Source[]; open: boolean }) {
  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      )}
    >
      <ul className="min-h-0 space-y-2 overflow-hidden" inert={!open}>
        {sources.map((s) => (
          <li key={s.index} className="rounded-xl border bg-card px-3 py-2.5 first:mt-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-[0.65rem] font-semibold text-muted-foreground">
                {s.index}
              </span>
              <span className="truncate font-medium">{s.document_name}</span>
              <span className="ml-auto shrink-0 text-muted-foreground tabular-nums">{Math.round(s.similarity * 100)}% relevancia</span>
            </div>
            <p className="mt-1.5 line-clamp-3 text-xs leading-5 text-muted-foreground">{s.excerpt}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function AssistantMessage({ message }: { message: ChatMessage }) {
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const notice = message.status ? NOTICES[message.status] : undefined
  const Icon = notice?.icon

  return (
    <div className="flex gap-3 animate-in fade-in-0 duration-300 sm:gap-4">
      <AssistantAvatar size="sm" className="mt-0.5" />
      <div className="min-w-0 flex-1">
        {notice && Icon ? (
          <div
            className={cn(
              "rounded-2xl border px-4 py-3",
              message.status === "error" ? "border-destructive/30 bg-destructive/5" : "bg-muted/40"
            )}
          >
            <p className="text-[0.95rem] leading-7">{message.content}</p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon className="size-3.5" /> {notice.label}
            </p>
          </div>
        ) : (
          <>
            <Markdown content={message.content} />
            <div className="mt-1.5 -ml-2 flex items-center gap-1">
              <CopyButton text={message.content} />
              {message.sources.length > 0 && (
                <SourcesToggle sources={message.sources} open={sourcesOpen} onToggle={() => setSourcesOpen((o) => !o)} />
              )}
            </div>
            {message.sources.length > 0 && <SourcesPanel sources={message.sources} open={sourcesOpen} />}
          </>
        )}
      </div>
    </div>
  )
}

export function StreamingMessage({ text, phase }: { text: string; phase: "thinking" | "searching" | "streaming" }) {
  return (
    <div className="flex gap-3 sm:gap-4" aria-live="polite">
      <AssistantAvatar size="sm" className="mt-0.5" />
      <div className="min-w-0 flex-1">
        {text ? (
          <Markdown content={text} />
        ) : (
          <div className="flex h-7 items-center gap-2.5 text-sm text-muted-foreground">
            <span className="flex gap-1" aria-hidden>
              {[0, 1, 2].map((i) => (
                <span key={i} className="typing-dot size-1.5 rounded-full bg-current" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </span>
            {phase === "thinking" ? "Analizando tu pregunta…" : "Buscando en la documentación…"}
          </div>
        )}
      </div>
    </div>
  )
}
