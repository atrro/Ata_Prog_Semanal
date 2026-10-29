import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ButtonHTMLAttributes } from "react";

const buttonVariants = cva("button", {
  variants: { variant: { default: "button-primary", outline: "button-outline", ghost: "button-ghost", danger: "button-danger" }, size: { default: "", icon: "button-icon", sm: "button-sm" } },
  defaultVariants: { variant: "default", size: "default" }
});

export function Button({ className, variant, size, asChild = false, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot : "button";
  return <Component className={twMerge(clsx(buttonVariants({ variant, size }), className))} {...props} />;
}