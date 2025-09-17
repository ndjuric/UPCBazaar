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
    // Try LM Studio; fallback to simple heuristics if not available.
    const clean = (s) => (typeof s === 'string' ? s.trim() : '')
    const t = clean(title)
    const d = clean(description)
    let normTitle = t
    let normDesc = d
    try {
      const prompt = [
        'Normalize the following product fields. Fix grammar, spelling, and casing. Return as JSON with keys \'title\' and \'description\'.',
        'If description is essentially the same as title, set description to an empty string.',
        '',
        `title: ${t}`,
        `description: ${d}`,
      ].join('\n')
      const url = `${this.baseUrl}/chat/completions`
      const body = {
        model: 'local-llm',
        messages: [{ role: 'user', content: prompt }],
        stream: false,
      }
      const res = await (global.fetch ? fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        : (await import('node-fetch')).then((m) => m.default(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })))
      if (res.ok) {
        const json = await res.json()
        const content = json?.choices?.[0]?.message?.content
        try {
          const parsed = JSON.parse(content)
          normTitle = clean(parsed.title) || normTitle
          normDesc = clean(parsed.description) || ''
        } catch (_) {
          // fallback: keep content as description if parse fails
          if (typeof content === 'string' && content.trim()) {
            normDesc = content.trim()
          }
        }
      }
    } catch (_) {
      // ignore LM errors, use heuristics
    }
    // Heuristic normalization
    const sentenceCase = (s) => {
      if (!s) return s
      const lower = s.toLowerCase()
      return lower.charAt(0).toUpperCase() + lower.slice(1)
    }
    if (!normTitle && normDesc) normTitle = sentenceCase(normDesc.slice(0, 80))
    normTitle = sentenceCase(normTitle)
    normDesc = normDesc ? normDesc.replace(/\s+/g, ' ').trim() : ''
    // If identical after normalization, drop description
    if (normTitle && normDesc && normTitle.toLowerCase() === normDesc.toLowerCase()) {
      normDesc = ''
    }
    return { title: normTitle, description: normDesc }
  }
}

module.exports = { LMClient };
