import React from 'react'

export function Dialog({ open, onClose, title, description, children, footer }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md card">
        <div className="card-header">
          <div className="font-semibold">{title}</div>
          {description && <div className="text-sm text-gray-500 mt-1">{description}</div>}
        </div>
        <div className="card-content">{children}</div>
        {footer && <div className="card-footer flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  )
}

