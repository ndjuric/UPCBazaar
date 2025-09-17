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

  async fixGrammar(sentence) {
    const text = typeof sentence === 'string' ? sentence.trim() : ''
    if (!text) return ''
    const prompt = [
      'Correct grammar, spelling, casing - convert uppercase to mixed case, uppercase the first letter of each sentence, and fix punctuation spacing for the following sentence.',
      'Return only the corrected text as plain text, with no JSON, no Markdown, and no extra formatting.',
      '',
      text,
    ].join('\n')
    const url = `${this.baseUrl}/chat/completions`
    const body = {
      model: 'local-llm',
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    }
    const res = await (global.fetch ? fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      : (await import('node-fetch')).then((m) => m.default(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })))
    if (!res.ok) return text
    const json = await res.json()
    const content = json?.choices?.[0]?.message?.content
    if (!content || typeof content !== 'string') return text
    return content.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim()
  }
}

module.exports = { LMClient };

