const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const EventEmitter = require('events');

async function ensureDir(p) {
  await fsp.mkdir(p, { recursive: true });
}

function toFileUrl(p) {
  const pre = process.platform === 'win32' ? '/' : '';
  return 'file://' + pre + p.replace(/\\/g, '/');
}

class UPCRepository extends EventEmitter {
  constructor({ upcsDir, imagesDir, responsesDir, lmClient, fsCfg }) {
    super();
    this.upcsDir = upcsDir;
    this.imagesDir = imagesDir;
    this.responsesDir = responsesDir;
    this.lmClient = lmClient;
    this.fsCfg = fsCfg;
  }

  cachePath(upc) {
    return path.join(this.upcsDir, `${upc}.json`);
  }

  imagePath(upc) {
    return path.join(this.imagesDir, `${upc}.jpg`);
  }

  async list() {
    const files = (await fsp.readdir(this.upcsDir)).filter((f) => f.endsWith('.json'));
    const list = [];
    for (const f of files) {
      try {
        const filePath = path.join(this.upcsDir, f);
        const data = JSON.parse(await fsp.readFile(filePath, 'utf-8'));
        const upc = (data.upc && String(data.upc)) || path.basename(f, '.json');
        // prefer numbered images
        let imgPath = null;
        for (let i = 1; i <= 3; i++) {
          const p = await this.fsCfg.resolveImage(`${upc}_${i}.jpg`);
          if (p !== this.fsCfg.placeholder) { imgPath = p; break; }
        }
        if (!imgPath) {
          const legacy = await this.fsCfg.resolveImage(`${upc}.jpg`)
          if (legacy !== this.fsCfg.placeholder) imgPath = legacy
        }
        const product = data.product || data.raw ? (await this.flattenAndNormalize(data.raw || { items: [data.product] }, upc)) : data;
        if (data.product || data.raw) await fsp.writeFile(filePath, JSON.stringify(product, null, 2), 'utf-8');
        list.push({
          upc,
          title: product.title || upc,
          brand: product.brand || '',
          model: product.model || '',
          lowest_price: product.lowest_price || null,
          highest_price: product.highest_price || null,
          currency: product.currency || '',
          image: imgPath ? toFileUrl(imgPath) : toFileUrl(this.fsCfg.placeholder),
        });
      } catch (_) {}
    }
    list.sort((a, b) => (a.mtime && b.mtime ? b.mtime - a.mtime : 0));
    // Latest files by mtime
    for (const item of list) {
      const stat = await fsp.stat(this.cachePath(item.upc));
      item.mtime = stat.mtimeMs;
    }
    return list.sort((a, b) => b.mtime - a.mtime);
  }

  async getProduct(upc) {
    const cache = this.cachePath(upc);
    const exists = fs.existsSync(cache);
    if (!exists) throw new Error('Product not found in cache.');
    const data = JSON.parse(await fsp.readFile(cache, 'utf-8'));
    if (data.product || data.raw) {
      // migrate old structure on read too
      const product = await this.flattenAndNormalize(data.raw || { items: [data.product] }, upc);
      await fsp.writeFile(cache, JSON.stringify(product, null, 2), 'utf-8');
      return product;
    }
    return data;
  }

  simplify(raw) {
    const item = raw?.items?.[0] || raw;
    if (!item) return {};
    return {
      title: item.title || '',
      brand: item.brand || '',
      model: item.model || item.mpn || '',
      description: item.description || item.description_full || '',
      color: item.color || '',
      size: item.size || '',
      dimensions: item.dimension || item.dimensions || '',
      weight: item.weight || '',
      category: item.category || (Array.isArray(item.category_path) ? item.category_path.join(' > ') : ''),
      images: Array.isArray(item.images) ? item.images : [],
      offers: item.offers || [],
      currency: item.currency || item.currency_symbol || '',
      lowest_price: item.lowest_recorded_price || null,
      highest_price: item.highest_recorded_price || null,
      upc: item.upc || item.ean || '',
    };
  }

  async fetchFromAPI(upc) {
    const url = `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(upc)}`;
    const res = await (global.fetch ? fetch(url) : (await import('node-fetch')).then((m) => m.default(url)));
    if (!res.ok) throw new Error(`API request failed: ${res.status}`);
    const json = await res.json();
    if (!json || !json.items || json.items.length === 0) {
      this.fsCfg.log && this.fsCfg.log(`No results for UPC ${upc}`)
      throw new Error('No results found for this UPC.');
    }
    return json;
  }

  async downloadImage(url, destPath) {
    try {
      const res = await (global.fetch ? fetch(url) : (await import('node-fetch')).then((m) => m.default(url)));
      if (!res.ok) return false;
      const buf = Buffer.from(await res.arrayBuffer());
      await fsp.writeFile(destPath, buf);
      return true;
    } catch (_) {
      return false;
    }
  }

  // Build normalized, flat JSON from the raw API response
  async flattenAndNormalize(raw, upc) {
    const flat = { upc };
    const items = Array.isArray(raw?.items) && raw.items.length ? raw.items : (raw ? [raw] : []);
    const merged = new Set();
    const setIfEmpty = (key, val) => {
      if (val === undefined || val === null) return;
      if (typeof val === 'string') {
        const v = val.trim();
        if (!v) return;
        if (flat[key] === undefined) { flat[key] = v; merged.add(key) }
        return;
      }
      if (typeof val === 'number' || typeof val === 'boolean') {
        if (flat[key] === undefined) { flat[key] = val; merged.add(key) }
        return;
      }
      if (Array.isArray(val)) {
        if (key === 'images') {
          const cur = Array.isArray(flat.images) ? flat.images : [];
          for (const u of val) {
            if (typeof u === 'string' && u.trim() && !cur.includes(u)) { cur.push(u); }
          }
          if (cur.length) flat.images = cur;
        } else if (key === 'category_path') {
          if (!flat.category) setIfEmpty('category', val.filter(Boolean).join(' > '));
        } else {
          // Keep arrays of strings if not empty
          const arr = val.filter((x) => typeof x === 'string' && x.trim());
          if (arr.length && flat[key] === undefined) { flat[key] = arr; merged.add(key) }
        }
        return;
      }
      // skip nested objects to keep it flat
    };

    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      // Standardized key mapping
      setIfEmpty('title', item.title);
      setIfEmpty('brand', item.brand);
      setIfEmpty('model', item.model || item.mpn);
      setIfEmpty('description', item.description || item.description_full);
      setIfEmpty('color', item.color);
      setIfEmpty('size', item.size);
      setIfEmpty('dimensions', item.dimension || item.dimensions);
      setIfEmpty('weight', item.weight);
      setIfEmpty('category', item.category);
      setIfEmpty('images', Array.isArray(item.images) ? item.images : []);
      setIfEmpty('currency', item.currency || item.currency_symbol);
      setIfEmpty('lowest_price', item.lowest_recorded_price);
      setIfEmpty('highest_price', item.highest_recorded_price);
      setIfEmpty('ean', item.ean);
      setIfEmpty('asin', item.asin);
      // Ignore offers entirely per requirements
      // Merge additional non-empty primitive fields not present
      for (const [k, v] of Object.entries(item)) {
        if (k === 'offers' || k === 'images' || k === 'category_path') continue;
        if (['title','brand','model','description','color','size','dimension','dimensions','weight','category','currency','lowest_recorded_price','highest_recorded_price','lowest_price','highest_price','upc','ean','mpn','asin'].includes(k)) continue;
        if (flat[k] !== undefined) continue;
        if (v === null || v === undefined) continue;
        if (typeof v === 'string' && v.trim()) { flat[k] = v.trim(); continue; }
        if (typeof v === 'number' || typeof v === 'boolean') { flat[k] = v; continue; }
        if (Array.isArray(v)) {
          const arr = v.filter((x) => typeof x === 'string' && x.trim());
          if (arr.length) flat[k] = arr;
        }
      }
    }

    // Log merged fields
    try { this.fsCfg.log && this.fsCfg.log(`UPC ${upc}: merged fields -> ${Array.from(merged).join(', ')}`) } catch (_) {}

    // Grammar fixes via LLM for specific fields
    try {
      if (flat.title) {
        const fixed = await this.lmClient.fixGrammar(flat.title)
        if (fixed && fixed !== flat.title) {
          this.fsCfg.log && this.fsCfg.log(`UPC ${upc}: grammar fixed title`)
          flat.title = fixed
        }
      }
      if (flat.description) {
        const fixedD = await this.lmClient.fixGrammar(flat.description)
        if (fixedD && fixedD !== flat.description) {
          this.fsCfg.log && this.fsCfg.log(`UPC ${upc}: grammar fixed description`)
          flat.description = fixedD
        }
      }
    } catch (_) { }
    // Remove empty strings and nulls
    for (const k of Object.keys(flat)) {
      const v = flat[k];
      if (v === '' || v === null || v === undefined) delete flat[k];
      if (Array.isArray(v) && v.every((x) => !x)) delete flat[k];
    }
    return flat;
  }

  async lookup(upc) {
    if (!upc || !/^[0-9]{6,14}$/.test(String(upc))) {
      throw new Error('Please enter a valid numeric UPC (6-14 digits).');
    }
    const cache = this.cachePath(upc);
    if (fs.existsSync(cache)) {
      const data = JSON.parse(await fsp.readFile(cache, 'utf-8'));
      // Back-compat: migrate old structure if needed
      let product;
      if (data.product || data.raw) {
        product = await this.flattenAndNormalize(data.raw || { items: [data.product] }, upc);
        await fsp.writeFile(cache, JSON.stringify(product, null, 2), 'utf-8');
      } else {
        product = data; // already flat
      }
      // No LLM calls on cached reads; grammar was applied during initial save or migration.
      // find first local image
      let img = null;
      const numbered = [1, 2, 3].map((i) => `${upc}_${i}.jpg`);
      const localImages = [];
      for (const name of numbered) {
        const p = await this.fsCfg.resolveImage(name)
        if (p !== this.fsCfg.placeholder) localImages.push(toFileUrl(p))
      }
      for (const name of numbered) {
        const p = await this.fsCfg.resolveImage(name)
        if (p !== this.fsCfg.placeholder) { img = toFileUrl(p); break }
      }
      if (!img) {
        const legacy = await this.fsCfg.resolveImage(`${upc}.jpg`)
        if (legacy !== this.fsCfg.placeholder) img = toFileUrl(legacy)
      }
      const result = { upc, product, image: img, localImages };
      this.emit('upc-added', { upc, title: product.title || upc, brand: product.brand || '', image: img, model: product.model || '', lowest_price: product.lowest_price, highest_price: product.highest_price, currency: product.currency || '' });
      return result;
    }

    await ensureDir(this.upcsDir);
    await ensureDir(this.imagesDir);
    const raw = await this.fetchFromAPI(upc);
    const product = await this.flattenAndNormalize(raw, upc);
    // download up to 3 images
    let firstImg = null;
    let localImages = [];
    if (product.images && product.images.length > 0) {
      const targets = product.images.slice(0, 3);
      let idx = 1;
      for (const url of targets) {
        const dest = path.join(this.imagesDir, `${upc}_${idx}.jpg`);
        const ok = await this.downloadImage(url, dest);
        if (ok) {
          const u = toFileUrl(dest);
          localImages.push(u);
          if (!firstImg) firstImg = u;
          this.fsCfg.log && this.fsCfg.log(`Saved image: ${dest}`)
        }
        idx++;
      }
      // Also save legacy single image path for backward compat
      if (!firstImg) {
        const ok = await this.downloadImage(product.images[0], this.imagePath(upc));
        if (ok) firstImg = toFileUrl(this.imagePath(upc));
      }
    }
    await fsp.writeFile(cache, JSON.stringify(product, null, 2), 'utf-8');
    this.fsCfg.log && this.fsCfg.log(`Saved product JSON: ${cache}`)
    const result = { upc, product, image: firstImg, localImages };
    this.emit('upc-added', { upc, title: product.title || upc, brand: product.brand || '', image: firstImg, model: product.model || '', lowest_price: product.lowest_price, highest_price: product.highest_price, currency: product.currency || '' });
    return result;
  }

  async delete(upc) {
    const cache = this.cachePath(upc);
    if (fs.existsSync(cache)) await fsp.unlink(cache);
    // remove numbered images and legacy
    const numbered = [1, 2, 3, 4, 5];
    for (const i of numbered) {
      const p = path.join(this.imagesDir, `${upc}_${i}.jpg`);
      if (fs.existsSync(p)) await fsp.unlink(p);
    }
    const legacy = this.imagePath(upc);
    if (fs.existsSync(legacy)) await fsp.unlink(legacy);
    // also delete responses
    try {
      const files = fs.readdirSync(this.responsesDir).filter(f => f.startsWith(`${upc}_`) && f.endsWith('.txt'))
      for (const f of files) {
        await fsp.unlink(path.join(this.responsesDir, f))
      }
    } catch (_) {}
    this.fsCfg.log && this.fsCfg.log(`Deleted UPC: ${upc} (json, images, responses)`)
  }
}

module.exports = { UPCRepository };
