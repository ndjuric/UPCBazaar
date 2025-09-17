class LMClient {
  constructor(baseUrl = 'http://localhost:1234/v1') {
    this.baseUrl = baseUrl;
  }

  preparePrompt(promptText, product) {
    const map = {
      '{title}': product.title || '',
      '{brand}': product.brand || '',
      '{category}': product.category || '',
      '{description}': product.description || '',
    };
    let text = promptText;
    for (const [key, val] of Object.entries(map)) {
      text = text.split(key).join(val);
    }
    return text;
  }

  async send(preparedText) {
    const url = `${this.baseUrl}/chat/completions`;
    const body = {
      model: 'local-llm',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: preparedText },
      ],
      stream: false,
    };
    const res = await (global.fetch ? fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) : (await import('node-fetch')).then((m) => m.default(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })));

    if (!res.ok) {
      throw new Error(`LM Studio request failed: ${res.status}`);
    }
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (!content) throw new Error('Invalid response from LM Studio.');
    return content;
  }

  async normalizeFields({ title, description }) {
    // Normalize using LLM, handle markdown/JSON wrappers, and apply priority rules.
    const clean = (s) => (typeof s === 'string' ? s.trim() : '')
    const t0 = clean(title)
    const d0 = clean(description)

    const sentenceCase = (s) => {
      if (!s) return s
      const lower = s.toLowerCase()
      return lower.charAt(0).toUpperCase() + lower.slice(1)
    }

    const stripMarkdownWrappers = (text) => {
      if (typeof text !== 'string') return ''
      let s = text.trim()
      // Remove ```json ... ``` or ``` ... ``` fences
      s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
      // Remove ``` blocks anywhere by taking the largest JSON-looking substring
      const jsonLike = s.match(/\{[\s\S]*\}/)
      if (jsonLike) s = jsonLike[0]
      return s.trim()
    }

    const tryParseJson = (raw) => {
      const s = stripMarkdownWrappers(raw)
      try {
        return JSON.parse(s)
      } catch (_) {
        // Try to extract JSON substring
        try {
          const m = s.match(/\{[\s\S]*\}/)
          if (m) return JSON.parse(m[0])
        } catch (_) { }
      }
      return null
    }

    const regexExtract = (raw) => {
      if (typeof raw !== 'string') return {}
      const text = raw.trim()
      // Try JSON-like key pairs
      const mTitle = text.match(/"?title"?\s*[:=]\s*"([\s\S]*?)"/i)
      const mDesc = text.match(/"?description"?\s*[:=]\s*"([\s\S]*?)"/i)
      let title = mTitle ? mTitle[1].trim() : ''
      let description = mDesc ? mDesc[1].trim() : ''
      if (!title || !description) {
        // Try label form: Title: ..., Description: ...
        const lt = text.match(/\bTitle\s*:\s*([\s\S]*?)(?:\n|$)/i)
        const ld = text.match(/\bDescription\s*:\s*([\s\S]*?)(?:\n|$)/i)
        if (!title && lt) title = lt[1].trim()
        if (!description && ld) description = ld[1].trim()
      }
      return { title, description }
    }

    const normalizeSimilarity = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
    const similar = (a, b) => {
      const aa = normalizeSimilarity(a)
      const bb = normalizeSimilarity(b)
      if (!aa || !bb) return false
      if (aa === bb) return true
      if (aa.includes(bb) || bb.includes(aa)) return true
      const aset = new Set(aa.split(' '))
      const bset = new Set(bb.split(' '))
      const inter = [...aset].filter(x => bset.has(x)).length
      const uni = new Set([...aset, ...bset]).size
      const j = inter / (uni || 1)
      return j >= 0.85
    }

    let normTitle = t0
    let normDesc = d0

    try {
      const prompt = [
        'You are given a product title and description and you are expected to make the text grammatically correct, with correct casing. Respond ONLY with a valid JSON object with two keys: "title" and "description". No Markdown, no code fences, no ```json, no extra text.',
        'Apply grammar, spelling, and casing fixes. If the description is approximately the same as the title, prefer description and remove the title (set it to empty).',
        '',
        `title: ${t0}`,
        `description: ${d0}`,
      ].join('\n')
      const url = `${this.baseUrl}/chat/completions`
      const body = { model: 'local-llm', messages: [{ role: 'user', content: prompt }], stream: false }
      const res = await (global.fetch ? fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        : (await import('node-fetch')).then((m) => m.default(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })))
      if (res.ok) {
        const json = await res.json()
        const content = json?.choices?.[0]?.message?.content
        let parsed = tryParseJson(content)
        if (!parsed) parsed = regexExtract(content)
        const t = clean(parsed?.title)
        const d = clean(parsed?.description)
        // Remove nested JSON if present in field values
        const maybeJsonToText = (v) => {
          if (!v) return ''
          const stripped = stripMarkdownWrappers(v)
          // If it looks like a JSON object, keep as text (we do not embed JSON). Try to pull a string out
          try {
            const obj = JSON.parse(stripped)
            // Prefer description/title fields if present
            if (typeof obj === 'object' && obj) {
              if (obj.description && typeof obj.description === 'string') return obj.description.trim()
              if (obj.title && typeof obj.title === 'string') return obj.title.trim()
            }
          } catch (_) { }
          return stripped
        }
        normTitle = t ? maybeJsonToText(t) : normTitle
        normDesc = d ? maybeJsonToText(d) : normDesc
      }
    } catch (_) {
      // ignore LM errors, use heuristics
    }

    // Heuristic fallback clean-up
    if (!normTitle && normDesc) normTitle = sentenceCase(normDesc.slice(0, 80))
    normTitle = sentenceCase(normTitle)
    normDesc = normDesc ? normDesc.replace(/\s+/g, ' ').trim() : ''

    // Apply field priority rules
    if (normDesc) {
      if (similar(normTitle, normDesc)) {
        // keep only description
        return { description: normDesc }
      }
      // different enough, keep both
      return { title: normTitle || undefined, description: normDesc }
    }
    // description empty; use title if present
    if (normTitle) return { title: normTitle }
    return {}
  }
}

module.exports = { LMClient };
