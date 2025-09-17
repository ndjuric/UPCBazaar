import React from 'react'
import clsx from 'classnames'

export function Button({ className, variant = 'primary', ...props }) {
  return (
    <button
      className={clsx('btn', variant === 'primary' ? 'btn-primary' : 'btn-outline', className)}
      {...props}
    />
  )
}

