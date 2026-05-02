import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-normal text-center transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-[#0A4DFF] text-white shadow-glow-blue hover:shadow-[0_0_25px_rgba(10,77,255,0.4)] hover:scale-[1.02] active:scale-[0.98] active:shadow-glow-blue",
        outline:
          "border-border bg-background hover:bg-white/5 hover:text-foreground aria-expanded:bg-white/5 aria-expanded:text-foreground dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10 hover:shadow-glow-blue/20",
        secondary:
          "bg-[#161616] border border-white/10 text-[#A0A0A0] hover:text-white hover:bg-white/5 hover:border-white/20 aria-expanded:bg-[#161616] aria-expanded:text-white hover:shadow-glow-blue/10",
        ghost:
          "text-[#A0A0A0] hover:bg-white/5 hover:text-white aria-expanded:bg-white/5 aria-expanded:text-white dark:hover:bg-white/5 hover:shadow-glow-blue/10",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40 hover:shadow-glow-red",
        link: "text-[#0A4DFF] underline-offset-4 hover:underline",
      },
      size: {
        default:
          "min-h-8 h-auto gap-1.5 px-2.5 py-1.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "min-h-6 h-auto gap-1 rounded-[min(var(--radius-md),10px)] px-2 py-1 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "min-h-7 h-auto gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 py-1 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "min-h-9 h-auto gap-1.5 px-2.5 py-2 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
