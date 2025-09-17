const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, args) => ipcRenderer.invoke(channel, args);

contextBridge.exposeInMainWorld('api', {
  listUPCs: () => invoke('upc:list'),
  lookupUPC: (upc) => invoke('upc:lookup', upc),
  deleteUPC: (upc) => invoke('upc:delete', upc),
  listPrompts: () => invoke('prompts:list'),
  getPrompt: (name) => invoke('prompts:get', name),
  sendToLM: ({ upc, promptName }) => invoke('lm:send', { upc, promptName }),
  normalizeDescription: (text) => invoke('lm:normalize', { text }),
  listResponses: ({ upc }) => invoke('responses:list', { upc }),
  listAllResponses: () => invoke('responses:listAll'),
  saveResponse: ({ upc, promptName, content }) => invoke('responses:save', { upc, promptName, content }),
  deleteResponse: ({ filePath }) => invoke('responses:delete', { filePath }),
  on: (channel, listener) => {
    const valid = ['events:upc-added', 'events:prompts-updated', 'events:responses-updated', 'events:upc-deleted'];
    if (!valid.includes(channel)) return () => {};
    ipcRenderer.on(channel, (_event, payload) => listener(payload));
    return () => ipcRenderer.removeAllListeners(channel);
  },
});
