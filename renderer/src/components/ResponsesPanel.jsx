import React, { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader } from './ui/Card'
import { Button } from './ui/Button'

export function ResponsesPanel({ upc }) {
  const [all, setAll] = useState([])
  const [selected, setSelected] = useState(null)

  async function refresh() {
    const items = await window.api.listAllResponses()
    setAll(items)
  }

  useEffect(() => {
    refresh()
    const unsub = window.api.on('events:responses-updated', () => refresh())
    return () => unsub && unsub()
  }, [])

  const grouped = useMemo(() => {
    const map = new Map()
    for (const r of all) {
      const key = `${r.upc} :: ${r.promptName}`
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(r)
    }
    return Array.from(map.entries()).map(([key, items]) => ({ key, items }))
  }, [all])

  return (
    <div className="grid grid-cols-3 gap-3 h-full">
      <Card className="col-span-1">
        <CardHeader>
          <div className="font-semibold">Saved Responses</div>
          <div className="text-xs text-gray-500">Grouped by UPC and prompt</div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-[60vh] overflow-auto">
            {grouped.map((g) => (
              <div key={g.key} className="border rounded">
                <div className="px-2 py-1 text-sm font-medium bg-gray-50 border-b truncate">{g.key}</div>
                <div className="divide-y">
                  {g.items.map((r) => (
                    <div key={r.filePath} className="px-2 py-1 text-xs flex items-center justify-between">
                      <div className="truncate mr-2 cursor-pointer" onClick={() => setSelected(r)}>{r.file}</div>
                      <Button variant="outline" onClick={async () => { await window.api.deleteResponse({ filePath: r.filePath }); }}>Delete</Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {grouped.length === 0 && <div className="text-sm text-gray-500">No responses found.</div>}
          </div>
        </CardContent>
      </Card>
      <Card className="col-span-2">
        <CardHeader>
          <div className="font-semibold">Response Preview</div>
          <div className="text-xs text-gray-500 truncate">{selected?.file || 'Select a response to view'}</div>
        </CardHeader>
        <CardContent>
          <pre className="text-sm whitespace-pre-wrap">{selected?.content || ''}</pre>
        </CardContent>
      </Card>
    </div>
  )
}

