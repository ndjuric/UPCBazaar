import { Card, CardContent, CardHeader } from './ui/Card'

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
  const title = product.title ? normalizeCase(product.title) : (brand || model ? `${brand}${brand && model ? ' ' : ''}${model}` : 'Untitled Product')
  const currency = product.currency || '$'
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
            <div className="text-xl font-semibold truncate">{brand} {model}</div>
            <div className="text-sm text-gray-500 mt-1 truncate">{product.category}</div>
            <DynamicFields product={product} />
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

function DynamicFields({ product }) {
  if (!product) return null
  const entries = Object.entries(product).filter(([k, v]) => v !== null && v !== undefined && v !== '' && k !== 'images')
  if (!entries.length) return null
  const formatKey = (k) => k.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
  const formatVal = (v) => Array.isArray(v) ? v.join(', ') : v
  return (
    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
      {entries.map(([k, v]) => (
        <Field key={k} label={formatKey(k)} value={formatVal(v)} />
      ))}
    </div>
  )
}
