'use strict';

window.AtelierExchangeImport = (() => {
  const extensions = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

  function filename(path) {
    try { return decodeURIComponent(path.split(/[?#]/)[0].split(/[\\/]/).pop()); }
    catch (error) { throw new Error(`圖片路徑無法解碼：${path}`); }
  }

  function parse(html, files) {
    const template = document.createElement('template');
    template.innerHTML = html;
    const holders = [...template.content.querySelectorAll('.divresponse .content .text_holder')];
    if (!holders.length) throw new Error('找不到 Plurk 回覆。請選擇完整儲存的 Plurk HTML 網頁。');
    const byName = new Map();
    for (const file of files) {
      if (byName.has(file.name)) throw new Error(`資源資料夾中有重複檔名：${file.name}`);
      byName.set(file.name, file);
    }
    const used = new Map();
    const missing = new Set();
    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) return node.nodeValue;
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      if (node.matches('script,style,iframe,object,embed,svg')) return '';
      if (node.tagName === 'BR') return '\n';
      if (node.tagName === 'IMG') {
        const sticker = node.classList.contains('emoticon_my');
        const name = filename(node.getAttribute('src') || '');
        if (!name) throw new Error('回覆包含沒有檔名的圖片。');
        let file = byName.get(name);
        if (!file && name.endsWith('_lg.png')) file = byName.get(name.slice(0, -7) + '_tn.jpg');
        if (!file) { missing.add(name); return ''; }
        const extension = file.name.split('.').pop().toLowerCase();
        if (!extensions[extension]) throw new Error(`不支援圖片格式：${file.name}`);
        if (!file.size || file.size > 5 * 1024 * 1024) throw new Error(`圖片為空或超過 5 MB：${file.name}`);
        used.set(file.name, file.type === extensions[extension] ? file : new File([file], file.name, { type: extensions[extension] }));
        return `\u0000${sticker ? 'Sticker' : 'Image'}:${file.name}\u0000`;
      }
      return [...node.childNodes].map(walk).join('');
    }
    const replies = holders.map(holder => walk(holder).replace(/\u00a0/g, ' ').trim());
    if (missing.size) throw new Error(`找不到 ${missing.size} 個圖片檔案：${[...missing].slice(0, 8).join('、')}。請選擇完整資源資料夾。`);
    if (replies.some(reply => !reply)) throw new Error('有回覆沒有可匯入的文字或圖片，請檢查原始網頁。');
    return { replies, files: [...used.values()] };
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('atelier-local-exchange-media', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('images');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('本機圖片資料庫被其他頁面阻擋。'));
    });
  }

  async function saveLocal(files) {
    const db = await openDatabase();
    const paths = new Map(files.map(file => [file.name, `local-exchange-media/${crypto.randomUUID()}`]));
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('images', 'readwrite');
        const store = tx.objectStore('images');
        files.forEach(file => store.put(file, paths.get(file.name)));
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('本機圖片儲存已中止。'));
      });
    } finally { db.close(); }
    return paths;
  }

  async function loadLocal(path) {
    const db = await openDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('images', 'readonly');
        const request = tx.objectStore('images').get(path);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  }

  return { parse, saveLocal, loadLocal };
})();
