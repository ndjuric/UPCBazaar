import React from 'react'

export function Tabs({ value, onValueChange, children }) {
  return <div data-value={value} data-onchange={!!onValueChange}>{React.Children.map(children, (child) => {
    if (!React.isValidElement(child)) return child
    if (child.type === TabsContent) {
      return React.cloneElement(child, { hidden: child.props.value !== value })
    }
    if (child.type === TabsList) {
      return React.cloneElement(child, { value, onValueChange })
    }
    return child
  })}</div>
}

export function TabsList({ children, value, onValueChange }) {
  return (
    <div className="mb-3 border-b border-gray-200 flex gap-2">
      {React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child
        return React.cloneElement(child, { active: child.props.value === value, onSelect: () => onValueChange(child.props.value) })
      })}
    </div>
  )
}

export function TabsTrigger({ value, children, active, onSelect }) {
  return (
    <button
      className={`px-3 py-2 text-sm border-b-2 -mb-px ${active ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
      onClick={onSelect}
    >
      {children}
    </button>
  )
}

export function TabsContent({ value, children, hidden }) {
  if (hidden) return null
  return <div className="mt-2">{children}</div>
}

