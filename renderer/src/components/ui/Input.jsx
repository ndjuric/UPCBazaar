import React from 'react'

export const Input = React.forwardRef(({ className = '', ...props }, ref) => {
  return <input ref={ref} className={`input ${className}`} {...props} />
})

