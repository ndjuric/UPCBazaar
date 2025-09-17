const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { UPCRepository } = require('./repositories/upcRepository');
const { PromptRepository } = require('./repositories/promptRepository');
const { ResponseRepository } = require('./repositories/responseRepository');
const { LMClient } = require('./services/lmClient');
const { fsConfig } = require('./fsConfig');

let mainWindow;
let upcRepo, promptRepo, responseRepo;

const appRoot = app.getAppPath();
const lmClient = new LMClient();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    const indexFile = path.join(appRoot, 'renderer', 'dist', 'index.html');
    mainWindow.loadFile(indexFile);
  }

  upcRepo.on('upc-added', (item) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('events:upc-added', item);
    }
  });

  promptRepo.on('prompts-updated', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('events:prompts-updated');
    }
  });

  responseRepo.on('responses-updated', (payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('events:responses-updated', payload);
    }
  });
  
  upcRepo.on('upc-deleted', (payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('events:upc-deleted', payload);
    }
  });
}

app.whenReady().then(async () => {
  const fsCfg = fsConfig.init();
  // initialize repositories with unified storage
  upcRepo = new UPCRepository({
    upcsDir: fsCfg.upcsDir,
    imagesDir: fsCfg.imagesDir,
    responsesDir: fsCfg.responsesDir,
    lmClient,
    fsCfg,
  });
  promptRepo = new PromptRepository({ promptsDir: fsCfg.promptsDir, fsCfg });
  responseRepo = new ResponseRepository({ responsesDir: fsCfg.responsesDir, fsCfg });
  // Seed example prompt if none exist (in storage/prompts)
  try {
    const files = fs.readdirSync(fsCfg.promptsDir).filter((f) => f.endsWith('.txt'));
    if (files.length === 0) {
      fs.writeFileSync(
        path.join(fsCfg.promptsDir, 'sales_copy.txt'),
        `You are a product copywriter. Write a persuasive marketing description for this product, highlighting its main features and ending with a strong call-to-action.\n\nProduct details:\nTitle: {title}\nBrand: {brand}\nCategory: {category}\nDescription: {description}\n`
      );
    }
  } catch (e) {}

  // Migrate prompts from old root folder if present
  try {
    const oldPrompts = path.join(appRoot, 'prompts')
    if (fs.existsSync(oldPrompts)) {
      const olds = fs.readdirSync(oldPrompts).filter(f => f.endsWith('.txt'))
      for (const f of olds) {
        const src = path.join(oldPrompts, f)
        const dst = path.join(fsCfg.promptsDir, f)
        if (!fs.existsSync(dst)) fs.copyFileSync(src, dst)
      }
      if (olds.length) fsCfg.log && fsCfg.log(`Migrated ${olds.length} prompt(s) to storage/prompts`)
    }
  } catch (_) {}

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // Log resolved thumbnail paths for all UPCs at startup
  try {
    const files = fs.readdirSync(fsCfg.upcsDir).filter(f => f.endsWith('.json'))
    for (const f of files) {
      const upc = path.basename(f, '.json')
      const candidates = [1,2,3].map(i => `${upc}_${i}.jpg`)
      let resolved = fsCfg.placeholder
      for (const c of candidates) {
        // eslint-disable-next-line no-await-in-loop
        const full = await fsCfg.resolveImage(c)
        if (full !== fsCfg.placeholder) { resolved = full; break }
      }
      fsCfg.log(`Thumbnail for ${upc}: ${resolved}`)
    }
  } catch (_) {}
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers
ipcMain.handle('upc:list', async () => {
  return await upcRepo.list();
});

ipcMain.handle('upc:lookup', async (_e, upc) => {
  try {
    const result = await upcRepo.lookup(upc);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('upc:delete', async (_e, upc) => {
  try {
    await upcRepo.delete(upc);
    upcRepo.emit('upc-deleted', { upc });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('prompts:list', async () => {
  return await promptRepo.list();
});

ipcMain.handle('prompts:get', async (_e, name) => {
  return await promptRepo.get(name);
});

ipcMain.handle('lm:send', async (_e, { upc, promptName }) => {
  try {
    const product = await upcRepo.getProduct(upc);
    const prompt = await promptRepo.get(promptName);
    const prepared = lmClient.preparePrompt(prompt.content, product);
    const reply = await lmClient.send(prepared);
    return { ok: true, data: reply };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('lm:normalize', async (_e, { text }) => {
  try {
    const prompt = `Rewrite the following product description in sentence case, fixing casing and punctuation without changing meaning.\n\nText:\n${text}`;
    const reply = await lmClient.send(prompt);
    return { ok: true, data: reply };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('responses:list', async (_e, { upc }) => {
  return await responseRepo.list({ upc });
});

ipcMain.handle('responses:listAll', async () => {
  return await responseRepo.list({ upc: null });
});

ipcMain.handle('responses:save', async (_e, { upc, promptName, content }) => {
  try {
    const file = await responseRepo.save({ upc, promptName, content });
    return { ok: true, data: file };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('responses:delete', async (_e, { filePath }) => {
  try {
    await responseRepo.delete({ filePath });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});
