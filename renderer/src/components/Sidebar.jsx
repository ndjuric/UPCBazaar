import React, { useRef, useState } from 'react'
import { Input } from './ui/Input'
import { Dialog } from './ui/Dialog'

function TrashIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...props}>
      <path fill="currentColor" d="M9 3h6a1 1 0 0 1 1 1v1h4v2h-1v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7H3V5h4V4a1 1 0 0 1 1-1Zm1 2v0h4V5h-4ZM7 7v12h10V7H7Zm3 2h2v8h-2V9Zm6 0h-2v8h2V9Z"/>
    </svg>
  )
}

function PlaceholderThumb() {
  return (
    <div className="thumb flex items-center justify-center text-gray-400 text-xs">
      N/A
    </div>
  )
}

export function Sidebar({ upcList, onSelect, onLookup, onDeleteUPC }) {
  const [value, setValue] = useState('')
  const inputRef = useRef(null)
  const [confirmUPC, setConfirmUPC] = useState(null)

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && value.trim()) {
      onLookup(value.trim())
      setValue('')
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b border-gray-200">
        <Input
          ref={inputRef}
          placeholder="Enter UPC and press Enter"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
        />
      </div>
      <div className="flex-1 overflow-auto p-2 space-y-1">
        {upcList.map((item) => {
          const brand = normalizeCase(item.brand || '')
          const model = normalizeCase(item.model || '')
          const price = formatPriceRange(item)
          return (
            <div key={item.upc} className="flex items-center gap-3 p-2 rounded-md hover:bg-gray-100">
              <div onClick={() => onSelect(item.upc)} className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
                {item.image ? (
                  <img src={item.image} alt="thumb" className="thumb object-cover" />
                ) : (
                  <PlaceholderThumb />
                )}
                <div className="min-w-0">
                  <div className="font-semibold truncate">{brand || item.upc}</div>
                  {model && <div className="text-xs text-gray-600 truncate">{model}</div>}
                  {price && <div className="text-xs text-gray-500 truncate">{price}</div>}
                </div>
              </div>
              <button
                aria-label={`Delete ${item.upc}`}
                className="text-gray-500 hover:text-red-600 p-1"
                onClick={() => setConfirmUPC(item.upc)}
              >
                <TrashIcon />
              </button>
            </div>
          )
        })}
      </div>

      <Dialog
        open={!!confirmUPC}
        onClose={() => setConfirmUPC(null)}
        title="Delete cached product?"
        description="This removes the cached JSON and downloaded images."
        footer={
          <>
            <button className="btn btn-outline" onClick={() => setConfirmUPC(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={async () => { await onDeleteUPC(confirmUPC); setConfirmUPC(null); }}>OK</button>
          </>
        }
      >
        <div className="text-sm text-gray-700">UPC: {confirmUPC}</div>
      </Dialog>
    </div>
  )
}

function normalizeCase(s) {
  if (!s) return s
  const isUpper = s.length > 2 && s === s.toUpperCase()
  if (isUpper) return s.charAt(0) + s.slice(1).toLowerCase()
  return s
}

function formatPriceRange(item) {
  const { lowest_price, highest_price, currency } = item
  if (!lowest_price && !highest_price) return ''
  const cur = currency || '$'
  if (lowest_price && highest_price) return `${cur}${lowest_price} – ${cur}${highest_price}`
  if (lowest_price) return `${cur}${lowest_price}`
  return `${cur}${highest_price}`
}
