const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { UPCRepository } = require('./repositories/upcRepository');
const { PromptRepository } = require('./repositories/promptRepository');
const { ResponseRepository } = require('./repositories/responseRepository');
const { LMClient } = require('./services/lmClient');

let mainWindow;

const appRoot = app.getAppPath();
const userDataRoot = app.isPackaged ? process.resourcesPath : appRoot;
const dataRoot = appRoot; // Keep paths relative to project root in dev

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

const cacheDir = path.join(dataRoot, 'cache');
const imagesDir = path.join(cacheDir, 'images');
const promptsDir = path.join(dataRoot, 'prompts');
const responsesDir = path.join(dataRoot, 'responses');

ensureDir(cacheDir);
ensureDir(imagesDir);
ensureDir(promptsDir);
ensureDir(responsesDir);

const upcRepo = new UPCRepository({ cacheDir, imagesDir });
const promptRepo = new PromptRepository({ promptsDir });
const responseRepo = new ResponseRepository({ responsesDir });
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
  // Seed example prompt if none exist
  try {
    const files = fs.readdirSync(promptsDir).filter((f) => f.endsWith('.txt'));
    if (files.length === 0) {
      fs.writeFileSync(
        path.join(promptsDir, 'sales_copy.txt'),
        `You are a product copywriter. Write a persuasive marketing description for this product, highlighting its main features and ending with a strong call-to-action.\n\nProduct details:\nTitle: {title}\nBrand: {brand}\nCategory: {category}\nDescription: {description}\n`
      );
    }
  } catch (e) {}

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
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
