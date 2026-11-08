'use strict';

window.AtelierCloud = (() => {
  let config;
  let session;
  let sessionKey;
  let debugMode = false;
  const maximumImageSize = 5 * 1024 * 1024;
  const mimeExtensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };

  function parseConfig(value) {
    if (!value || typeof value.supabaseUrl !== 'string' || typeof value.publishableKey !== 'string') {
      throw new Error('雲端設定格式錯誤。Cloud configuration needs supabaseUrl and publishableKey.');
    }
    if (Object.hasOwn(value, 'debugMode') && typeof value.debugMode !== 'boolean') {
      throw new Error('debugMode must be true or false.');
    }
    if (!value.supabaseUrl && !value.publishableKey) return null;
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(value.supabaseUrl)) {
      throw new Error('請使用 Supabase 專案的 https://…supabase.co 網址，不要加入結尾斜線。');
    }
    const key = value.publishableKey;
    if (key.startsWith('sb_secret_')) throw new Error('不可使用 secret key！請使用 publishable key。');
    if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
      let payload;
      try { payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); }
      catch (error) { throw new Error(`無效的公開金鑰。請使用 publishable 或 legacy anon key。${error.message}`); }
      if (payload.role !== 'anon') throw new Error('不可使用 service_role 或私人金鑰！');
    }
    return { supabaseUrl: value.supabaseUrl, publishableKey: key };
  }

  async function init() {
    const response = await fetch('cloud-config.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`雲端設定無法讀取 (HTTP ${response.status})。`);
    const settings = await response.json();
    config = parseConfig(settings);
    debugMode = settings.debugMode === true;
    if (debugMode && config) throw new Error('本機除錯模式不可與雲端設定同時啟用。');
    if (debugMode && !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
      debugMode = false;
      console.warn('本機除錯模式僅能在 localhost 使用；請勿部署啟用此模式的設定檔。');
    }
    if (!config) return;
    sessionKey = `atelier-auth:${config.supabaseUrl}`;
    let raw;
    try { raw = sessionStorage.getItem(sessionKey); }
    catch (error) { console.warn('登入狀態僅保留於此頁，無法使用瀏覽器儲存空間：', error); }
    if (raw) {
      try {
        const saved = JSON.parse(raw);
        if (typeof saved.access_token !== 'string' || typeof saved.refresh_token !== 'string' || !Number.isFinite(saved.expires_at)) {
          throw new Error('Invalid saved session.');
        }
        session = saved;
      } catch (error) {
        console.warn('已移除無效的登入狀態，請重新登入：', error);
        saveSession(undefined);
      }
    }
  }

  function saveSession(value) {
    session = value;
    try {
      if (value) sessionStorage.setItem(sessionKey, JSON.stringify(value));
      else if (sessionKey) sessionStorage.removeItem(sessionKey);
    } catch (error) { console.warn('無法保存登入狀態：', error); }
  }

  async function request(path, { method = 'GET', body, token, headers = {} } = {}) {
    if (!config) throw new Error('尚未連接 Supabase。請先完成雲端設定。');
    const requestHeaders = { apikey: config.publishableKey, ...headers };
    if (token) requestHeaders.Authorization = `Bearer ${token}`;
    else if (!config.publishableKey.startsWith('sb_publishable_')) requestHeaders.Authorization = `Bearer ${config.publishableKey}`;
    if (body !== undefined && !(body instanceof Blob)) requestHeaders['Content-Type'] = 'application/json';
    const response = await fetch(`${config.supabaseUrl}${path}`, {
      method, headers: requestHeaders,
      body: body === undefined ? undefined : body instanceof Blob ? body : JSON.stringify(body),
      cache: 'no-store'
    });
    const text = await response.text();
    let data;
    if (text) {
      try { data = JSON.parse(text); }
      catch (error) {
        if (response.ok) throw new Error(`伺服器回應不是有效資料：${error.message}`);
        data = { message: text.slice(0, 300) };
      }
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${data?.message || data?.error_description || data?.msg || data?.error || 'Request failed'}`);
    }
    return data;
  }

  async function token() {
    if (!session) throw new Error('請先登入。Please sign in.');
    if (session.expires_at * 1000 <= Date.now() + 60000) {
      const refreshed = await request('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST', body: { refresh_token: session.refresh_token }
      });
      saveSession({ ...refreshed, expires_at: Math.floor(Date.now() / 1000) + refreshed.expires_in });
    }
    return session.access_token;
  }

  async function owner() {
    const access = await token();
    const user = await request('/auth/v1/user', { token: access });
    if (!await request('/rest/v1/rpc/is_atelier_owner', { method: 'POST', body: {}, token: access })) {
      throw new Error('此帳號沒有編輯權限。請在 Supabase 將此帳號的 User UID 加入擁有者名單。');
    }
    return user;
  }

  async function login(email, password) {
    const result = await request('/auth/v1/token?grant_type=password', {
      method: 'POST', body: { email, password }
    });
    saveSession({ ...result, expires_at: Math.floor(Date.now() / 1000) + result.expires_in });
    try { return await owner(); }
    catch (error) { saveSession(undefined); throw error; }
  }

  async function logout() {
    try {
      if (session) await request('/auth/v1/logout', { method: 'POST', token: await token() });
    } finally { saveSession(undefined); }
  }

  async function read() {
    const rows = await request('/rest/v1/atelier_document?id=eq.1&select=payload,version');
    if (!Array.isArray(rows) || rows.length > 1 || (rows.length && (!Number.isSafeInteger(rows[0].version) || rows[0].version < 1 || !rows[0].payload))) {
      throw new Error('雲端資料格式不正確。Cloud document is invalid.');
    }
    return rows[0] || { payload: null, version: 0 };
  }

  async function publish(payload, expectedVersion) {
    const result = await request('/rest/v1/rpc/publish_atelier', {
      method: 'POST', token: await token(), body: { document: payload, expected_version: expectedVersion }
    });
    if (!Number.isSafeInteger(result) || result <= expectedVersion) throw new Error('伺服器未確認發布版本，請重新載入核對。');
    return result;
  }

  function imageAllowed(src) {
    if (!config || typeof src !== 'string') return false;
    const prefix = `${config.supabaseUrl}/storage/v1/object/public/atelier-images/`;
    return src.startsWith(prefix) && /^[a-zA-Z0-9/_-]+\.(png|jpe?g|webp|gif|avif)$/i.test(src.slice(prefix.length));
  }

  async function validateImage(file) {
    if (!mimeExtensions[file.type] || !file.size || file.size > maximumImageSize) {
      throw new Error(`圖片「${file.name}」格式不支援、為空或超過 5 MB；請使用 JPG、PNG、WebP、GIF 或 AVIF。`);
    }
    try {
      const bitmap = await createImageBitmap(file);
      bitmap.close();
      return;
    } catch (error) {
      console.warn(`Bitmap decoding failed for "${file.name}"; trying the browser image decoder.`, error);
    }
    const url = URL.createObjectURL(file);
    try {
      const picture = new Image();
      picture.src = url;
      await picture.decode();
      if (!picture.naturalWidth || !picture.naturalHeight) throw new Error('圖片尺寸無效。');
    } catch (error) {
      throw new Error(`無法解碼圖片「${file.name}」。檔案可能損壞，或不是真正的 ${file.type} 圖片；請檢查原始資源或重新下載。原因：${error.message}`);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function upload(file) {
    const extension = mimeExtensions[file.type];
    await validateImage(file);
    const user = await owner();
    const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
    await request(`/storage/v1/object/atelier-images/${path}`, {
      method: 'POST', body: file, token: await token(),
      headers: { 'Content-Type': file.type, 'x-upsert': 'false', 'Cache-Control': '3600' }
    });
    return `${config.supabaseUrl}/storage/v1/object/public/atelier-images/${path}`;
  }

  return {
    init, parseConfig, owner, login, logout, read, publish, upload, imageAllowed, validateImage,
    get configured() { return Boolean(config); },
    get signedIn() { return Boolean(session); },
    get debugMode() { return debugMode; },
    get project() { return config?.supabaseUrl || 'offline'; }
  };
})();
