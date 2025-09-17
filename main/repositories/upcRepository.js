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
  constructor({ cacheDir, imagesDir }) {
    super();
    this.cacheDir = cacheDir;
    this.imagesDir = imagesDir;
  }

  cachePath(upc) {
    return path.join(this.cacheDir, `${upc}.json`);
  }

  imagePath(upc) {
    return path.join(this.imagesDir, `${upc}.jpg`);
  }

  async list() {
    const files = (await fsp.readdir(this.cacheDir)).filter((f) => f.endsWith('.json'));
    const list = [];
    for (const f of files) {
      try {
        const filePath = path.join(this.cacheDir, f);
        const data = JSON.parse(await fsp.readFile(filePath, 'utf-8'));
        const upc = path.basename(f, '.json');
        // prefer numbered images
        let imgPath = null;
        for (let i = 1; i <= 3; i++) {
          const p = path.join(this.imagesDir, `${upc}_${i}.jpg`);
          if (fs.existsSync(p)) { imgPath = p; break; }
        }
        if (!imgPath && fs.existsSync(this.imagePath(upc))) imgPath = this.imagePath(upc);
        const product = data.product || this.simplify(data.raw);
        list.push({
          upc,
          title: product.title || upc,
          brand: product.brand || '',
          model: product.model || '',
          lowest_price: product.lowest_price || null,
          highest_price: product.highest_price || null,
          currency: product.currency || '',
          image: imgPath ? toFileUrl(imgPath) : null,
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
    return data.product || data.raw?.items?.[0] || data.raw || {};
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

  async lookup(upc) {
    if (!upc || !/^[0-9]{6,14}$/.test(String(upc))) {
      throw new Error('Please enter a valid numeric UPC (6-14 digits).');
    }
    const cache = this.cachePath(upc);
    if (fs.existsSync(cache)) {
      const data = JSON.parse(await fsp.readFile(cache, 'utf-8'));
      const product = data.product || this.simplify(data.raw);
      // find first local image
      let img = null;
      const numbered = [1, 2, 3].map((i) => path.join(this.imagesDir, `${upc}_${i}.jpg`));
      const localImages = [];
      for (const p of numbered) if (fs.existsSync(p)) { localImages.push(toFileUrl(p)); }
      for (const p of numbered) if (fs.existsSync(p)) { img = toFileUrl(p); break; }
      if (!img && fs.existsSync(this.imagePath(upc))) img = toFileUrl(this.imagePath(upc));
      const result = { upc, product, image: img, localImages };
      this.emit('upc-added', { upc, title: product.title || upc, brand: product.brand || '', image: img, model: product.model || '', lowest_price: product.lowest_price, highest_price: product.highest_price, currency: product.currency || '' });
      return result;
    }

    await ensureDir(this.cacheDir);
    await ensureDir(this.imagesDir);
    const raw = await this.fetchFromAPI(upc);
    const product = this.simplify(raw);
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
        }
        idx++;
      }
      // Also save legacy single image path for backward compat
      if (!firstImg) {
        const ok = await this.downloadImage(product.images[0], this.imagePath(upc));
        if (ok) firstImg = toFileUrl(this.imagePath(upc));
      }
    }
    await fsp.writeFile(cache, JSON.stringify({ upc, raw, product }, null, 2), 'utf-8');
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
  }
  }

module.exports = { UPCRepository };
