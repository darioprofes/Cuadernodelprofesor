import * as PopoverPrimitive from "@radix-ui/react-popover"
import { cn } from "@/lib/tiptap-utils"
import "@/components/tiptap-ui-primitive/popover/popover.scss"

function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root {...props} />
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger {...props} />
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn("tiptap-popover", className)}
        // Ver el comentario largo en dropdown-menu.tsx::DropdownMenuContent
        // -- mismo arreglo, mismo motivo: sin esto, la barra flotante del
        // editor (BubbleMenu) se retira del DOM en cuanto Radix mueve el
        // foco a este panel portado, y el propio popover acaba anclado a un
        // botón que ya no está en el documento.
        onOpenAutoFocus={(e) => e.preventDefault()}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverTrigger, PopoverContent }
