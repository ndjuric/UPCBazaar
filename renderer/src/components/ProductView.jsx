import React, { useState } from 'react'
import { Card, CardContent, CardHeader } from './ui/Card'
import { Button } from './ui/Button'

function PlaceholderImage() {
  return (
    <div className="w-40 h-40 bg-gray-100 border border-gray-200 rounded flex items-center justify-center text-gray-400">
      No Image
    </div>
  )
}

function normalizeCase(s) {
  if (!s) return s
  const isUpper = s.length > 2 && s === s.toUpperCase()
  if (isUpper) return s.charAt(0) + s.slice(1).toLowerCase()
  return s
}

export function ProductView({ product, image, upc, localImages = [] }) {
  const [desc, setDesc] = useState(product?.description)
  React.useEffect(() => {
    setDesc(product?.description)
  }, [product?.description, upc])

  if (!product) {
    return (
      <Card>
        <CardHeader>
          <div className="text-lg font-semibold">Welcome</div>
          <div className="text-sm text-gray-500">Enter a UPC to get started.</div>
        </CardHeader>
        <CardContent>
          <p className="text-gray-700">Use the input on the left to look up product details. Your recent lookups will appear above for quick access.</p>
        </CardContent>
      </Card>
    )
  }

  const brand = normalizeCase(product.brand || '')
  const model = normalizeCase(product.model || '')
  const title = brand || model ? `${brand}${brand && model ? ' ' : ''}${model}` : (product.title || 'Untitled Product')
  const currency = product.currency || '$'
  const images = []
  // Prefer locally downloaded images: cache/images/{upc}_N.jpg via file:// URLs
  if (upc) {
    for (let i = 1; i <= 3; i++) {
      // Electron cannot read fs from renderer; rely on first image provided via props for primary.
      // Additional images will show from remote URLs if present.
    }
  }
  const remoteImages = (localImages.length ? localImages : (Array.isArray(product.images) ? product.images.slice(0, 3) : []))

  return (
    <Card>
      <CardContent>
        <div className="flex gap-4 items-start">
          <div className="w-40 flex-shrink-0">
            {image ? (
              <img src={image} className="w-40 h-40 object-cover rounded border" />
            ) : (
              <PlaceholderImage />
            )}
            {remoteImages.length > 1 && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                {remoteImages.slice(0, 3).map((src, i) => (
                  <img key={i} src={src} className="w-12 h-12 object-cover rounded border" />
                ))}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xl font-semibold truncate">{normalizeCase(title)}</div>
            <div className="text-sm text-gray-500 mt-1 truncate">{product.category}</div>
            {desc && <p className="mt-3 text-gray-700 whitespace-pre-wrap">{desc}</p>}
            {(product.lowest_price || product.highest_price) && (
              <div className="mt-3 text-sm">
                {product.lowest_price && <span className="mr-3">Lowest: {currency}{product.lowest_price}</span>}
                {product.highest_price && <span>Highest: {currency}{product.highest_price}</span>}
              </div>
            )}
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              {product.title && <Field label="Title" value={normalizeCase(product.title)} />}
              {product.brand && <Field label="Brand" value={normalizeCase(product.brand)} />}
              {product.model && <Field label="Model" value={normalizeCase(product.model)} />}
              {product.color && <Field label="Color" value={normalizeCase(product.color)} />}
              {product.size && <Field label="Size" value={product.size} />}
              {product.dimensions && <Field label="Dimensions" value={product.dimensions} />}
              {product.weight && <Field label="Weight" value={product.weight} />}
              {product.category && <Field label="Category" value={product.category} />}
              {product.currency && <Field label="Currency" value={product.currency} />}
              {product.upc && <Field label="UPC" value={product.upc} />}
            </div>
            {product.description && (
              <div className="mt-4">
                <Button variant="outline" onClick={async () => {
                  try {
                    const res = await window.api.normalizeDescription(product.description)
                    if (res?.ok && res.data) setDesc(res.data)
                  } catch (_) {}
                }}>Normalize Description</Button>
              </div>
            )}
          </div>
        </div>
        {Array.isArray(product.offers) && product.offers.length > 0 && (
          <div className="mt-4">
            <div className="font-medium mb-2">Offers</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {product.offers.slice(0, 6).map((o, idx) => (
                <div key={idx} className="p-2 border rounded text-sm">
                  <div className="font-medium truncate">{o.domain || o.title || 'Offer'}</div>
                  {o.price && <div className="text-gray-600">{currency}{o.price}</div>}
                  {o.ship && <div className="text-gray-500">Ship: {o.ship}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Field({ label, value }) {
  if (!value) return null
  return (
    <div className="flex gap-2">
      <div className="text-gray-500 w-28 shrink-0">{label}</div>
      <div className="flex-1 truncate">{value}</div>
    </div>
  )
}
