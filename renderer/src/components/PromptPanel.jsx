import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardFooter } from './ui/Card'
import { Button } from './ui/Button'

export function PromptPanel({ upc, product }) {
  const [prompts, setPrompts] = useState([])
  const [selected, setSelected] = useState(null)
  const [promptText, setPromptText] = useState('')
  const [reply, setReply] = useState('')
  const [responses, setResponses] = useState([])
  const [busy, setBusy] = useState(false)

  async function refreshPrompts() {
    const list = await window.api.listPrompts()
    setPrompts(list)
    if (list.length && !selected) {
      selectPrompt(list[0].name)
    }
  }

  async function selectPrompt(name) {
    setSelected(name)
    const p = await window.api.getPrompt(name)
    setPromptText(p.content)
  }

  async function sendToLM() {
    if (!upc || !selected) return
    setBusy(true)
    try {
      const res = await window.api.sendToLM({ upc, promptName: selected })
      if (res.ok) setReply(res.data)
      else alert(res.error)
    } finally {
      setBusy(false)
    }
  }

  async function refreshResponses() {
    if (!upc) return setResponses([])
    const list = await window.api.listResponses({ upc })
    setResponses(list)
  }

  async function saveResponse() {
    if (!upc || !selected || !reply) return
    const res = await window.api.saveResponse({ upc, promptName: selected, content: reply })
    if (!res.ok) return alert(res.error)
    await refreshResponses()
  }

  async function deleteResponse(filePath) {
    const res = await window.api.deleteResponse({ filePath })
    if (!res.ok) return alert(res.error)
    await refreshResponses()
  }

  useEffect(() => {
    refreshPrompts()
    const unsub1 = window.api.on('events:prompts-updated', refreshPrompts)
    return () => {
      unsub1 && unsub1()
    }
  }, [])

  useEffect(() => {
    refreshResponses()
    const unsub = window.api.on('events:responses-updated', (payload) => {
      if (payload?.upc === upc) refreshResponses()
    })
    return () => unsub && unsub()
  }, [upc])

  return (
    <div className="grid grid-cols-3 gap-3 h-full">
      <Card className="col-span-1 flex flex-col">
        <CardHeader>
          <div className="font-semibold">Prompts</div>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {prompts.map((p) => (
              <div
                key={p.name}
                onClick={() => selectPrompt(p.name)}
                className={`p-2 border rounded cursor-pointer ${selected === p.name ? 'bg-gray-100 border-gray-300' : ''}`}
              >
                {p.name}
              </div>
            ))}
            {prompts.length === 0 && <div className="text-sm text-gray-500">Drop .txt files into /prompts</div>}
          </div>
        </CardContent>
      </Card>
      <Card className="col-span-2 flex flex-col">
        <CardHeader>
          <div className="font-semibold">Prompt</div>
          <div className="text-xs text-gray-500">Replacements: {'{title} {brand} {category} {description}'}</div>
        </CardHeader>
        <CardContent>
          <pre className="text-sm whitespace-pre-wrap">{promptText || 'Select a prompt to view its content.'}</pre>
          <div className="mt-4 flex gap-2">
            <Button onClick={sendToLM} disabled={!upc || !selected || busy}>
              {busy ? 'Sending…' : 'Send to LM Studio'}
            </Button>
            <Button variant="outline" onClick={saveResponse} disabled={!reply || !upc || !selected}>Save Response</Button>
          </div>
          {reply && (
            <div className="mt-4">
              <div className="font-medium mb-2">Assistant Reply</div>
              <div className="p-3 border rounded bg-gray-50 whitespace-pre-wrap text-sm">{reply}</div>
            </div>
          )}
          <div className="mt-6">
            <div className="font-medium mb-2">Saved Responses</div>
            <div className="space-y-2 max-h-48 overflow-auto">
              {responses.map((r) => (
                <div key={r.filePath} className="p-2 border rounded">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-mono truncate mr-2">{r.file}</div>
                    <Button variant="outline" onClick={() => deleteResponse(r.filePath)}>Delete</Button>
                  </div>
                  <pre className="text-xs whitespace-pre-wrap mt-2">{r.content}</pre>
                </div>
              ))}
              {responses.length === 0 && <div className="text-sm text-gray-500">No responses yet.</div>}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

