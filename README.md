# NarraCom

Electron + React + TailwindCSS + shadcn/ui-style components. Cross‑platform desktop app to look up products by UPC, cache results, browse prompts, send to LM Studio (OpenAI‑compatible API), and manage saved responses.

## Quick Start

Requirements: Node.js 18+.

- Install dependencies: `npm install`
- Start the app: `npm start`

The renderer runs via Vite and Electron launches automatically. All file I/O (cache, prompts, responses) and external requests happen in the Electron main process.

## Project Structure

- `main/` – Electron main process
  - `main.js` – creates window, wires IPC
  - `preload.js` – safe IPC bridge (`window.api`)
  - `repositories/` – repository pattern for data
    - `upcRepository.js` – UPC lookups, caching, image download
    - `promptRepository.js` – prompts loader (Factory pattern)
    - `responseRepository.js` – saved responses store
  - `services/lmClient.js` – LM Studio integration
- `renderer/` – React UI (Vite)
  - `index.html` – Vite entry
  - `src/` – React components
    - `App.jsx` – layout and orchestration
    - `components/Sidebar.jsx` – UPC input + list
    - `components/ProductView.jsx` – product card
    - `components/PromptPanel.jsx` – prompts, send, responses
    - `components/ui/*` – shadcn/ui-style primitives (Card, Button, Dialog, Input, Separator)
- `cache/` – JSON cache for UPCs (auto-created)
- `cache/images/` – downloaded product images (auto-created)
- `prompts/` – prompt `.txt` files (auto-created; seeded with `sales_copy.txt`)
- `responses/` – saved assistant replies (auto-created)

## Features

- Left sidebar:
  - Enter a UPC and press Enter.
  - Loads from `cache/{upc}.json` if present; otherwise calls UPCitemdb, caches JSON, and downloads up to 3 images to `cache/images/{upc}_1.jpg`, `_2.jpg`, `_3.jpg`.
  - Shows a scrollable list of entered UPCs with thumbnails (placeholder if none).
  - Each product shows Brand (bold), Model, and price range with currency.
  - Delete a cached UPC via the trash icon; confirm in the modal to remove both JSON and images.
  - Newest appears at the top. Click to open the Product Page.
- Product Page:
  - Tabs: Overview, Prompts, Responses.
  - Overview: Brand + Model as title; description below; normalized casing; images in a responsive layout; shows all available fields (title, description, brand, model, color, size, dimensions, weight, category, currency, lowest/highest price, images[]). Optional “Normalize Description” button uses LM Studio to clean casing.
  - Prompts: prompt list + AI integration UI.
  - Responses: all saved responses grouped by UPC and prompt; view and delete files.
  - If no UPC yet, shows a welcome card.
  - If API fails, shows a modal error dialog with close option (retry by entering UPC again).
- Prompt Section (bottom third):
  - Lists all prompts from `prompts/*.txt`.
  - Selecting a prompt shows its full text.
  - Uses a Factory pattern to create prompt objects.
  - “Send to LM Studio” posts the prompt with placeholders replaced by product data.
  - Displays assistant reply and lets you save/delete responses.
- Data Management:
  - Repository pattern for UPC cache, prompts, and responses in main process.
  - Observer pattern via IPC events keeps UI in sync when UPCs or responses change.

## Prompts

- Add new prompts by dropping `.txt` files into `prompts/`.
- Placeholders supported: `{title}`, `{brand}`, `{category}`, `{description}`.

Example `prompts/sales_copy.txt`:

```
You are a product copywriter. Write a persuasive marketing description for this product, highlighting its main features and ending with a strong call-to-action.

Product details:
Title: {title}
Brand: {brand}
Category: {category}
Description: {description}
```

## LM Studio

- Assumes a local OpenAI‑compatible API at `http://localhost:1234/v1/chat/completions`.
- The app posts a single chat with the selected prompt (placeholders replaced by product fields) and extracts `choices[0].message.content` as the reply.

## Build for Production

Build the renderer, then package with electron‑builder in one step:

- macOS: `npm run build:mac`
- Windows: `npm run build:win`
- Linux: `npm run build:linux`

Artifacts will include the prebuilt renderer (`renderer/dist`) and runtime resources.

## Behavior and Fallbacks

- Welcome screen on startup until a UPC is entered.
- Placeholder thumbnail shown if a product has no image.
- Error dialog if the UPC lookup fails (invalid code, no results, or network error).

## Managing Prompts and Responses

- Add: place `.txt` prompt files into `prompts/`. The list updates automatically.
- Remove: delete files from `prompts/` and the list updates.
- Responses: view all saved responses in the Responses tab, grouped by UPC and prompt. Click to preview; use Delete to remove a response file. When saving a response, filenames auto-increment like `_001`, `_002`, etc.

## Notes

- Paths used:
  - Cache: `cache/{upc}.json`
  - Images: `cache/images/{upc}.jpg`
  - Prompts: `prompts/*.txt`
  - Responses: `responses/{upc}_{prompt}_{increment}.txt`
