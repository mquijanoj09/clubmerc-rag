import { Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

export function AssistantAvatar({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  return (
    <div
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-sm",
        size === "sm" && "size-7 rounded-lg [&_svg]:size-3.5",
        size === "md" && "size-8 [&_svg]:size-4",
        size === "lg" && "size-14 rounded-2xl [&_svg]:size-6",
        className
      )}
    >
      <Sparkles />
    </div>
  )
}
