const fsp = require('fs/promises');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

class PromptFactory {
  create(name, content) {
    return { name, content };
  }
}

class PromptRepository extends EventEmitter {
  constructor({ promptsDir }) {
    super();
    this.promptsDir = promptsDir;
    this.factory = new PromptFactory();
    this._watch();
  }

  _watch() {
    try {
      fs.watch(this.promptsDir, { persistent: false }, () => {
        this.emit('prompts-updated');
      });
    } catch (_) {}
  }

  async list() {
    const files = (await fsp.readdir(this.promptsDir)).filter((f) => f.endsWith('.txt'));
    return files.map((f) => ({ name: path.basename(f, '.txt'), file: f }));
  }

  async get(name) {
    const filePath = path.join(this.promptsDir, `${name}.txt`);
    const content = await fsp.readFile(filePath, 'utf-8');
    return this.factory.create(name, content);
  }
}

module.exports = { PromptRepository };

