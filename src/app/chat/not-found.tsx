import Link from "next/link"
import { MessageSquareOff } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
      <MessageSquareOff className="size-8 text-muted-foreground" />
      <h2 className="font-medium">Conversación no encontrada</h2>
      <p className="text-sm text-muted-foreground">Puede que haya sido eliminada o que no te pertenezca.</p>
      <Button variant="outline" render={<Link href="/chat" />} nativeButton={false}>
        Nueva conversación
      </Button>
    </div>
  )
}
