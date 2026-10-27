import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

export function SaveBar({ pending, dirty }: { pending: boolean; dirty: boolean }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background/80 px-4 py-3 backdrop-blur-md sm:mx-0 sm:rounded-2xl sm:border">
      <div className="flex items-center justify-end gap-3">
        <span className="text-sm text-muted-foreground">{dirty ? "Tienes cambios sin guardar" : "Todo guardado"}</span>
        <Button type="submit" disabled={pending || !dirty} className="h-9 px-4">
          {pending && <Loader2 className="animate-spin" />}
          Guardar cambios
        </Button>
      </div>
    </div>
  )
}
