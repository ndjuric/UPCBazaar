const fsp = require('fs/promises');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

function pad3(n) {
  return String(n).padStart(3, '0');
}

class ResponseRepository extends EventEmitter {
  constructor({ responsesDir }) {
    super();
    this.responsesDir = responsesDir;
  }

  async list({ upc }) {
    const files = (await fsp.readdir(this.responsesDir)).filter((f) =>
      (upc ? f.startsWith(`${upc}_`) : true) && f.endsWith('.txt')
    );
    // map to objects
    const items = [];
    for (const f of files) {
      const filePath = path.join(this.responsesDir, f);
      const content = await fsp.readFile(filePath, 'utf-8');
      items.push({ file: f, filePath, content });
    }
    // newest first by mtime
    const stats = await Promise.all(items.map((i) => fsp.stat(i.filePath)));
    items.forEach((i, idx) => (i.mtime = stats[idx].mtimeMs));
    items.sort((a, b) => b.mtime - a.mtime);
    // Enrich by parsed identifiers
    for (const i of items) {
      const base = path.basename(i.file);
      const [fileUpc, rest] = base.split('_', 2);
      i.upc = fileUpc;
      const nameAndIdx = rest.replace(/\.txt$/i, '');
      const parts = nameAndIdx.split('_');
      i.promptName = parts.slice(0, -1).join('_');
      i.index = parts[parts.length - 1];
    }
    return items;
  }

  async save({ upc, promptName, content }) {
    const safePrompt = promptName.replace(/[^a-zA-Z0-9_-]+/g, '_');
    let idx = 1;
    let file;
    while (true) {
      file = path.join(this.responsesDir, `${upc}_${safePrompt}_${pad3(idx)}.txt`);
      if (!fs.existsSync(file)) break;
      idx += 1;
    }
    await fsp.writeFile(file, content, 'utf-8');
    this.emit('responses-updated', { upc });
    return file;
  }

  async delete({ filePath }) {
    await fsp.unlink(filePath);
    const base = path.basename(filePath);
    const upc = base.split('_')[0];
    this.emit('responses-updated', { upc });
  }
}

module.exports = { ResponseRepository };
