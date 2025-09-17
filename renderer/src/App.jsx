import React, { useEffect, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { ProductView } from './components/ProductView'
import { Separator } from './components/ui/Separator'
import { Dialog } from './components/ui/Dialog'
import { PromptPanel } from './components/PromptPanel'
import { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/Tabs'
import { ResponsesPanel } from './components/ResponsesPanel'

export default function App() {
  const [upcList, setUpcList] = useState([])
  const [selectedUPC, setSelectedUPC] = useState(null)
  const [product, setProduct] = useState(null)
  const [image, setImage] = useState(null)
  const [localImages, setLocalImages] = useState([])
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')

  async function refreshUPCs() {
    const list = await window.api.listUPCs()
    setUpcList(list)
  }

  async function loadProduct(upc) {
    const res = await window.api.lookupUPC(upc)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setSelectedUPC(upc)
    setProduct(res.data.product)
    setImage(res.data.image || null)
    setLocalImages(res.data.localImages || [])
    await refreshUPCs()
  }

  async function onLookup(upc) {
    const res = await window.api.lookupUPC(upc)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setSelectedUPC(upc)
    setProduct(res.data.product)
    setImage(res.data.image || null)
    setLocalImages(res.data.localImages || [])
    await refreshUPCs()
  }

  useEffect(() => {
    refreshUPCs()
    const unsub = window.api.on('events:upc-added', () => refreshUPCs())
    const unsubDel = window.api.on('events:upc-deleted', ({ upc }) => {
      refreshUPCs()
      if (selectedUPC === upc) {
        setSelectedUPC(null)
        setProduct(null)
        setImage(null)
      }
    })
    return () => unsub && unsub()
  }, [])

  return (
    <div className="w-screen h-screen grid grid-cols-[320px_1fr]">
      <div className="border-r border-gray-200">
        <Sidebar upcList={upcList} onSelect={loadProduct} onLookup={onLookup} onDeleteUPC={async (upc) => { await window.api.deleteUPC(upc) }} />
      </div>
      <div className="flex flex-col">
        <div className="flex-1 p-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="prompts">Prompts</TabsTrigger>
              <TabsTrigger value="responses">Responses</TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
              <ProductView product={product} image={image} upc={selectedUPC} localImages={localImages} />
            </TabsContent>
            <TabsContent value="prompts">
              <PromptPanel upc={selectedUPC} product={product} />
            </TabsContent>
            <TabsContent value="responses">
              <ResponsesPanel upc={selectedUPC} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
      <Dialog
        open={!!error}
        onClose={() => setError(null)}
        title="Lookup Error"
        description="The product could not be retrieved."
        footer={
          <>
            <button className="btn btn-outline" onClick={() => setError(null)}>Close</button>
          </>
        }
      >
        <div className="text-sm text-gray-700">{String(error || '')}</div>
      </Dialog>
    </div>
  )
}
