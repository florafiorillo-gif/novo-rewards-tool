'use client'

import { useFormStatus } from 'react-dom'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Button } from './Button'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface Props
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'children'> {
  variant?: Variant
  size?: Size
  className?: string
  children: ReactNode
  pendingLabel?: ReactNode
}

export function SubmitButton({
  children,
  pendingLabel,
  disabled,
  ...rest
}: Props) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending || disabled} {...rest}>
      {pending ? (pendingLabel ?? children) : children}
    </Button>
  )
}
