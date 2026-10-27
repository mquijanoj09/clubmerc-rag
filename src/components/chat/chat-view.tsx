"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { ArrowDown, ArrowUp, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { AssistantAvatar } from "@/components/assistant-avatar"
import { useChat } from "@/components/chat/chat-context"
import { AssistantMessage, StreamingMessage, UserMessage } from "@/components/chat/message"
import { Button } from "@/components/ui/button"
import type { ChatMessage, ChatStreamEvent } from "@/lib/types"
import { cn } from "@/lib/utils"

type Phase = "idle" | "thinking" | "searching" | "streaming"

const MAX_LENGTH = 2000

export function ChatView({
  conversationId: initialConversationId,
  initialMessages,
}: {
  conversationId: string | null
  initialMessages: ChatMessage[]
}) {
  const { info, quota, setQuota, upsertConversation, openRequestDialog } = useChat()
  const [messages, setMessages] = useState(initialMessages)
  const [conversationId, setConversationId] = useState(initialConversationId)
  const [phase, setPhase] = useState<Phase>("idle")
  const [streamText, setStreamText] = useState("")
  const [input, setInput] = useState("")
  const [atBottom, setAtBottom] = useState(true)

  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const stickRef = useRef(true)
  const abortRef = useRef<AbortController | null>(null)

  const busy = phase !== "idle"
  const outOfQuota = quota !== null && quota.remaining <= 0
  const isEmpty = messages.length === 0 && !busy

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior })
  }, [])

  useLayoutEffect(() => {
    if (stickRef.current) scrollToBottom()
  }, [messages, streamText, phase, scrollToBottom])

  useEffect(() => {
    textareaRef.current?.focus()
    return () => abortRef.current?.abort()
  }, [])

  // Altura automática del área de texto.
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [input])

  function onScroll() {
    const el = scrollRef.current
    if (!el) return
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    stickRef.current = near
    setAtBottom(near)
  }

  async function send(raw: string) {
    const text = raw.trim()
    if (!text || busy) return
    if (outOfQuota) {
      openRequestDialog()
      return
    }

    const tempId = `tmp-${Date.now()}`
    const now = new Date().toISOString()
    setMessages((m) => [...m, { id: tempId, role: "user", content: text, status: null, sources: [], created_at: now }])
    setInput("")
    setPhase("thinking")
    stickRef.current = true

    const controller = new AbortController()
    abortRef.current = controller
    let saved = false
    let accumulated = ""

    const handle = (event: ChatStreamEvent) => {
      switch (event.type) {
        case "meta":
          saved = true
          setMessages((m) => m.map((msg) => (msg.id === tempId ? { ...msg, id: event.userMessageId } : msg)))
          if (!conversationId) {
            setConversationId(event.conversationId)
            window.history.replaceState(null, "", `/chat/${event.conversationId}`)
          }
          upsertConversation({ id: event.conversationId, title: text.slice(0, 60), updated_at: now })
          setPhase("searching")
          break
        case "delta":
          accumulated += event.text
          setStreamText(accumulated)
          setPhase("streaming")
          break
        case "done":
          setMessages((m) => [...m, event.message])
          if (event.quota) setQuota(event.quota)
          break
        case "error":
          if (event.quota) setQuota(event.quota)
          if (saved) {
            setMessages((m) => [
              ...m,
              { id: `err-${Date.now()}`, role: "assistant", content: event.message, status: "error", sources: [], created_at: now },
            ])
          } else {
            // La pregunta no se guardó: se devuelve al cuadro de texto.
            setMessages((m) => m.filter((msg) => msg.id !== tempId))
            setInput(text)
            if (event.code === "no_quota") openRequestDialog()
            else toast.error(event.message)
          }
          break
      }
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message: text }),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null)
        handle({ type: "error", code: "http", message: body?.error ?? "No se pudo enviar la pregunta." })
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
        for (const line of lines) if (line.trim()) handle(JSON.parse(line))
      }
      if (buffer.trim()) handle(JSON.parse(buffer))
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        handle({ type: "error", code: "network", message: "Se perdió la conexión. Inténtalo de nuevo." })
      }
    } finally {
      setStreamText("")
      setPhase("idle")
      abortRef.current = null
      textareaRef.current?.focus()
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      send(input)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-y-auto">
        {isEmpty ? (
          <EmptyState onPick={send} disabled={outOfQuota} />
        ) : (
          <div className="mx-auto w-full max-w-3xl space-y-8 px-4 pt-6 pb-10 md:pt-10">
            {messages.map((m) =>
              m.role === "user" ? <UserMessage key={m.id} content={m.content} /> : <AssistantMessage key={m.id} message={m} />
            )}
            {busy && <StreamingMessage text={streamText} phase={phase as Exclude<Phase, "idle">} />}
          </div>
        )}
      </div>

      <div className="relative shrink-0 px-3 pb-3 sm:px-4 sm:pb-4">
        {!atBottom && !isEmpty && (
          <Button
            variant="outline"
            size="icon"
            aria-label="Ir al final"
            className="absolute -top-11 left-1/2 -translate-x-1/2 rounded-full bg-background shadow-sm animate-in fade-in-0 zoom-in-95"
            onClick={() => {
              stickRef.current = true
              scrollToBottom("smooth")
            }}
          >
            <ArrowDown />
          </Button>
        )}

        <div className="mx-auto w-full max-w-3xl">
          {outOfQuota && !busy && (
            <div className="mb-3 flex flex-col gap-3 rounded-2xl border bg-card px-4 py-3 shadow-sm animate-in fade-in-0 slide-in-from-bottom-1 sm:flex-row sm:items-center">
              <p className="flex-1 text-sm">
                <span className="font-medium">Has utilizado todas tus preguntas disponibles este mes.</span>{" "}
                <span className="text-muted-foreground">Se renovarán automáticamente el próximo mes.</span>
              </p>
              <Button onClick={openRequestDialog} className="shrink-0">
                Solicitar más preguntas
              </Button>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault()
              send(input)
            }}
            className={cn(
              "flex items-end gap-2 rounded-3xl border bg-card p-2 pl-4 shadow-sm transition-[border-color,box-shadow] focus-within:border-ring/60 focus-within:shadow-md",
              outOfQuota && "opacity-60"
            )}
          >
            <label htmlFor="chat-input" className="sr-only">
              Escribe tu pregunta
            </label>
            <textarea
              id="chat-input"
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, MAX_LENGTH))}
              onKeyDown={onKeyDown}
              rows={1}
              disabled={outOfQuota}
              placeholder={outOfQuota ? "Sin preguntas disponibles" : `Pregunta a ${info.name}…`}
              className="max-h-[200px] min-h-10 flex-1 resize-none bg-transparent py-2 text-base leading-6 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed md:text-[0.95rem]"
            />
            <Button
              type="submit"
              size="icon-lg"
              aria-label={busy ? "Generando respuesta" : "Enviar"}
              className="rounded-full"
              disabled={busy || !input.trim() || outOfQuota}
            >
              {busy ? <Loader2 className="animate-spin" /> : <ArrowUp />}
            </Button>
          </form>
          <p className="mt-2 px-2 text-center text-xs text-muted-foreground">
            {input.length > MAX_LENGTH * 0.8 ? (
              <span className="tabular-nums">
                {input.length}/{MAX_LENGTH} caracteres
              </span>
            ) : (
              "Las respuestas se basan únicamente en la documentación disponible. Verifica la información importante."
            )}
          </p>
        </div>
      </div>
    </div>
  )
}

function EmptyState({ onPick, disabled }: { onPick: (text: string) => void; disabled: boolean }) {
  const { info } = useChat()
  const suggestions = info.suggested_questions.slice(0, 4)

  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col items-center justify-center px-4 py-10 text-center">
      <div className="flex flex-col items-center animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
        <AssistantAvatar size="lg" />
        <h1 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">{info.name}</h1>
        <p className="mt-2 max-w-md text-balance text-muted-foreground">{info.welcome_message}</p>
      </div>

      {suggestions.length > 0 && (
        <div className="mt-10 grid w-full max-w-2xl gap-2.5 sm:grid-cols-2">
          {suggestions.map((q, i) => (
            <button
              key={q}
              type="button"
              disabled={disabled}
              onClick={() => onPick(q)}
              style={{ animationDelay: `${150 + i * 60}ms` }}
              className="rounded-2xl border bg-card px-4 py-3 text-left text-sm leading-snug transition-[background-color,transform] duration-150 animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both hover:bg-muted active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
