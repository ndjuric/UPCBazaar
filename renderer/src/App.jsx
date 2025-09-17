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
  const [loading, setLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  async function refreshUPCs() {
    const list = await window.api.listUPCs()
    setUpcList(list)
  }

  async function loadProduct(upc) {
    setLoading(true)
    const res = await window.api.lookupUPC(upc)
    if (!res.ok) {
      setError(res.error)
      setLoading(false)
      return
    }
    setSelectedUPC(upc)
    setProduct(res.data.product)
    setImage(res.data.image || null)
    setLocalImages(res.data.localImages || [])
    await refreshUPCs()
    setLoading(false)
  }

  async function onLookup(upc) {
    setLoading(true)
    const res = await window.api.lookupUPC(upc)
    if (!res.ok) {
      setError(res.error)
      setLoading(false)
      return
    }
    setSelectedUPC(upc)
    setProduct(res.data.product)
    setImage(res.data.image || null)
    setLocalImages(res.data.localImages || [])
    await refreshUPCs()
    setLoading(false)
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
    <div className="w-screen h-screen flex overflow-hidden">
      {/* Mobile overlay sidebar with slide animation */}
      <div className={`fixed inset-0 z-40 md:hidden ${sidebarOpen ? 'pointer-events-auto' : 'pointer-events-none'}`} aria-hidden={!sidebarOpen}>
        <div
          className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${sidebarOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setSidebarOpen(false)}
        />
        <div
          className={`relative z-50 w-72 max-w-[85%] h-full bg-white border-r border-gray-200 shadow-xl transform transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
          role="dialog"
          aria-modal="true"
          aria-label="Sidebar"
        >
          <div className="h-full overflow-hidden flex flex-col">
            <div className="p-3 border-b flex items-center justify-between">
              <div className="font-semibold">Products</div>
              <button className="btn btn-outline" onClick={() => setSidebarOpen(false)}>Close</button>
            </div>
            <div className="flex-1 min-h-0">
              <Sidebar
                upcList={upcList}
                onSelect={(u)=>{setSidebarOpen(false); loadProduct(u)}}
                onLookup={async (u)=>{setSidebarOpen(false); await onLookup(u)}}
                onDeleteUPC={async (upc) => { await window.api.deleteUPC(upc) }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Desktop persistent sidebar */}
      <div className="hidden md:block border-r border-gray-200 flex-shrink-0 w-72 lg:w-80 min-w-0 h-full overflow-hidden">
        <Sidebar upcList={upcList} onSelect={loadProduct} onLookup={onLookup} onDeleteUPC={async (upc) => { await window.api.deleteUPC(upc) }} />
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar with menu on mobile */}
        <div className="md:hidden p-3 border-b flex items-center justify-between">
          <button className="btn btn-outline" onClick={() => setSidebarOpen(true)} aria-label="Open menu">Menu</button>
          <div className="text-sm text-gray-600 truncate">{selectedUPC ? `UPC: ${selectedUPC}` : 'No product selected'}</div>
        </div>
        <div className="flex-1 p-4 overflow-auto">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-gray-300 border-t-gray-900" />
            </div>
          ) : (
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
          )}
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
