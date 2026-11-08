'use strict';

window.AtelierEditor = (() => {
  const codes = ['zh-Hant', 'en', 'ja', 'ko'];
  const names = { 'zh-Hant': '繁體中文', en: 'English', ja: '日本語', ko: '한국어' };
  let api;
  let draft;
  let baseVersion;
  let ownerId;
  let draftKey;
  let editLanguage = 'zh-Hant';
  let section = 'characters';
  let selectedId;
  let status;
  let work;
  let busy = false;
  let generation = 0;
  let stored = true;
  let hasChanges = false;
  const openEntries = new WeakSet();
  const clone = value => structuredClone(value);
  const current = () => draft.locales[editLanguage];
  const uid = prefix => `${prefix}-${crypto.randomUUID()}`;
  const today = () => new Date().toISOString().slice(0, 10);

  function el(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function message(text, error = false) {
    status.textContent = text;
    status.classList.toggle('is-error', error);
    status.setAttribute('role', error ? 'alert' : 'status');
  }

  function errorMessage(error) {
    console.error('Atelier editor:', error);
    message(error.message || String(error), true);
  }

  function button(label, action, className = 'editor-button') {
    const control = el('button', className, label);
    control.type = 'button';
    control.addEventListener('click', () => {
      if (busy) return;
      try {
        const result = action();
        if (result instanceof Promise) result.catch(errorMessage);
      } catch (error) { errorMessage(error); }
    });
    return control;
  }

  async function operation(action) {
    if (busy) return;
    busy = true;
    const root = api.main;
    root.setAttribute('aria-busy', 'true');
    const controls = [...root.querySelectorAll('input,textarea,select,button')].map(control => [control, control.disabled]);
    controls.forEach(([control]) => { control.disabled = true; });
    try { return await action(); }
    finally {
      controls.forEach(([control, disabled]) => { control.disabled = disabled; });
      root.removeAttribute('aria-busy');
      busy = false;
    }
  }

  function download(filename, value, raw = false) {
    const url = URL.createObjectURL(new Blob([raw ? value : JSON.stringify(value, null, 2)], { type: 'application/json' }));
    const anchor = el('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function saveDraft() {
    hasChanges = true;
    stored = false;
    try {
      localStorage.setItem(draftKey, JSON.stringify({ payload: draft, baseVersion }));
      stored = true;
      message('草稿已儲存在此瀏覽器，尚未發布。Draft saved locally; not published.');
    } catch (error) {
      console.error('Unable to save draft:', error);
      message('瀏覽器無法儲存草稿（可能容量已滿）。請立即下載備份；離開頁面將遺失未發布修改。', true);
    }
  }

  function forLocales(change) {
    codes.forEach(code => change(draft.locales[code], code));
  }

  function changed() { saveDraft(); }

  function rejectLocalExchangeMedia(payload) {
    const hasLocal = codes.some(code => payload.locales[code].characters.some(character =>
      character.exchanges.some(exchange => exchange.replies.some(reply =>
        /\[(?:Sticker|Image): local-exchange-media\/[a-f0-9-]{36}\]/.test(reply.text)))));
    if (hasLocal) throw new Error('草稿包含僅存在本機的交流圖片，不能發布。請在雲端管理室重新匯入原始網頁及資源。');
  }

  function field(parent, label, value, update, { multiline = false, type = 'text', required = false, hint = '', track = true } = {}) {
    const wrapper = el('label', 'editor-field');
    wrapper.append(el('span', '', label));
    const input = el(multiline ? 'textarea' : 'input');
    if (!multiline) input.type = type;
    input.value = value;
    input.required = required;
    if (multiline) input.rows = 4;
    input.addEventListener('input', () => {
      input.setCustomValidity('');
      try { update(input.value); if (track) changed(); }
      catch (error) { input.setCustomValidity(error.message); errorMessage(error); }
    });
    wrapper.append(input);
    if (hint) wrapper.append(el('small', '', hint));
    parent.append(wrapper);
    return input;
  }

  function choice(parent, label, value, entries, update, track = true) {
    const wrapper = el('label', 'editor-field');
    wrapper.append(el('span', '', label));
    const select = el('select');
    entries.forEach(([id, title]) => {
      const option = el('option', '', title);
      option.value = id;
      select.append(option);
    });
    select.value = value;
    select.addEventListener('change', () => {
      try { update(select.value); if (track) changed(); }
      catch (error) { select.value = value; errorMessage(error); }
    });
    wrapper.append(select);
    parent.append(wrapper);
    return select;
  }

  async function cropPortrait(file) {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(file.type) ||
        !file.size || file.size > 5 * 1024 * 1024) {
      throw new Error('請選擇 5 MB 以下的 JPG、PNG、WebP、GIF 或 AVIF 圖片。不接受 SVG。');
    }
    const bitmap = await createImageBitmap(file);
    const objectUrl = URL.createObjectURL(file);
    const dialog = el('dialog', 'editor-crop');
    try {
      const heading = el('h2', '', '截取角色肖像 / Crop portrait');
      heading.id = 'editor-crop-title';
      dialog.setAttribute('aria-labelledby', heading.id);
      dialog.append(heading,
        el('p', '', '拖曳方框或使用滑桿選擇範圍；也可以保留原圖。動態圖片裁切後會變成靜態圖片。'));
      const stage = el('div', 'editor-crop-stage');
      const image = el('img');
      image.src = objectUrl;
      image.alt = '待裁切的角色肖像';
      const selection = el('div', 'editor-crop-selection');
      selection.setAttribute('aria-hidden', 'true');
      stage.append(image, selection);
      dialog.append(stage);
      const controls = el('div', 'editor-crop-controls');
      const range = (label, value, min) => {
        const wrapper = el('label');
        wrapper.append(el('span', '', label));
        const input = el('input');
        input.type = 'range';
        input.min = min;
        input.max = 100;
        input.value = value;
        wrapper.append(input);
        controls.append(wrapper);
        return input;
      };
      const size = range('選取大小 / Size', 100, 10);
      const horizontal = range('水平位置 / Horizontal', 50, 0);
      const vertical = range('垂直位置 / Vertical', 50, 0);
      const geometry = () => {
        const side = Math.min(bitmap.width, bitmap.height) * Number(size.value) / 100;
        return { side, x: (bitmap.width - side) * Number(horizontal.value) / 100,
          y: (bitmap.height - side) * Number(vertical.value) / 100 };
      };
      const updateSelection = () => {
        const { side, x, y } = geometry();
        selection.style.left = `${x / bitmap.width * 100}%`;
        selection.style.top = `${y / bitmap.height * 100}%`;
        selection.style.width = `${side / bitmap.width * 100}%`;
        selection.style.height = `${side / bitmap.height * 100}%`;
      };
      [size, horizontal, vertical].forEach(input => input.addEventListener('input', updateSelection));
      selection.addEventListener('pointerdown', event => {
        event.preventDefault();
        const start = geometry();
        const bounds = image.getBoundingClientRect();
        const pointerX = event.clientX;
        const pointerY = event.clientY;
        selection.setPointerCapture(event.pointerId);
        const move = next => {
          const x = start.x + (next.clientX - pointerX) * bitmap.width / bounds.width;
          const y = start.y + (next.clientY - pointerY) * bitmap.height / bounds.height;
          const maxX = bitmap.width - start.side;
          const maxY = bitmap.height - start.side;
          horizontal.value = maxX ? Math.max(0, Math.min(100, x / maxX * 100)) : 50;
          vertical.value = maxY ? Math.max(0, Math.min(100, y / maxY * 100)) : 50;
          updateSelection();
        };
        selection.addEventListener('pointermove', move);
        selection.addEventListener('lostpointercapture', () => selection.removeEventListener('pointermove', move), { once: true });
      });
      dialog.append(controls);
      const actions = el('div', 'editor-actions');
      const action = text => {
        const control = el('button', 'editor-button', text);
        control.type = 'button';
        actions.append(control);
        return control;
      };
      const cancel = action('取消 / Cancel');
      const original = action('使用原圖 / Use original');
      const crop = action('截取並上傳 / Crop and upload');
      crop.classList.add('primary');
      dialog.append(actions);
      updateSelection();
      document.body.append(dialog);
      const result = await new Promise(resolve => {
        cancel.addEventListener('click', () => resolve('cancel'));
        original.addEventListener('click', () => resolve('original'));
        crop.addEventListener('click', () => resolve('crop'));
        dialog.addEventListener('keydown', event => {
          if (event.key === 'Escape') { event.preventDefault(); resolve('cancel'); }
        });
        dialog.addEventListener('cancel', event => { event.preventDefault(); resolve('cancel'); });
        dialog.addEventListener('close', () => resolve('cancel'), { once: true });
        dialog.showModal();
      });
      if (result === 'cancel') return null;
      if (result === 'original') return file;
      const { side, x, y } = geometry();
      const canvas = el('canvas');
      canvas.width = canvas.height = Math.min(1024, Math.max(1, Math.round(side)));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('無法建立圖片裁切畫布。');
      context.drawImage(bitmap, x, y, side, side, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('無法產生裁切後的圖片。');
      return new File([blob], 'portrait.png', { type: 'image/png' });
    } finally {
      if (dialog.open) dialog.close();
      dialog.remove();
      URL.revokeObjectURL(objectUrl);
      bitmap.close();
    }
  }

  function imageField(parent, label, src, update, { crop = false } = {}) {
    const group = el('div', 'editor-image-field');
    const preview = el('img');
    if ((/^assets\//.test(src) && !src.split('/').includes('..')) || api.cloud.imageAllowed(src)) preview.src = src;
    preview.alt = label;
    group.append(preview);
    const input = field(group, `${label}（現有圖片路徑 / Image URL）`, src, value => {
      update(value);
      // Do not request arbitrary third-party URLs while someone is typing.
      if (/^assets\//.test(value) || api.cloud.imageAllowed(value)) preview.src = value;
      else if (!value) preview.removeAttribute('src');
    });
    const labelElement = el('label', 'editor-field');
    labelElement.append(el('span', '', '上傳圖片 / Upload image（最多 5 MB）'));
    const file = el('input');
    file.type = 'file';
    file.accept = 'image/jpeg,image/png,image/webp,image/gif,image/avif';
    file.addEventListener('change', async () => {
      if (!file.files[0]) return;
      try {
        await operation(async () => {
          const selected = crop ? await cropPortrait(file.files[0]) : file.files[0];
          if (!selected) return;
          message('圖片上傳中，請稍候…');
          const url = await api.cloud.upload(selected);
          update(url);
          input.value = url;
          preview.src = url;
          changed();
          if (stored) message('圖片已上傳（檔案公開），請按「發布網站」讓頁面使用此圖片。');
        });
      } catch (error) { errorMessage(error); }
      finally { file.value = ''; }
    });
    labelElement.append(file, el('small', '', '上傳後圖片即為公開網址；不接受 SVG。刪除畫廊項目不會刪除雲端檔案。'));
    group.append(labelElement);
    parent.append(group);
  }

  function linkedCharacterChecks(parent, item, key, index) {
    const group = el('fieldset', 'editor-project-checks');
    group.append(el('legend', '', '關聯角色 / Linked characters'),
      el('p', 'editor-hint', '同一作品只需建立一次；勾選所有出現或參與的角色。'));
    current().characters.forEach(character => {
      const label = el('label');
      const input = el('input');
      input.type = 'checkbox';
      input.checked = item.characterIds.includes(character.id);
      input.addEventListener('change', () => {
        const selected = new Set(item.characterIds);
        if (input.checked) selected.add(character.id);
        else selected.delete(character.id);
        if (!selected.size) {
          input.checked = true;
          errorMessage(new Error('每項作品至少要關聯一位角色。'));
          return;
        }
        forLocales(data => {
          const entry = data.characters.find(value => value.id === selectedId)[key][index];
          entry.characterIds = data.characters.filter(value => selected.has(value.id)).map(value => value.id);
        });
        changed();
      });
      label.append(input, document.createTextNode(character.name || '（未命名角色）'));
      group.append(label);
    });
    parent.append(group);
  }

  async function confirmAction(title, description) {
    const dialog = el('dialog', 'editor-confirm');
    dialog.append(el('h2', '', title), el('p', '', description));
    const actions = el('div', 'editor-actions');
    return new Promise(resolve => {
      let settled = false;
      const finish = accepted => {
        if (settled) return;
        settled = true;
        dialog.close();
        dialog.remove();
        resolve(accepted);
      };
      const cancel = button('取消 / Cancel', () => finish(false));
      const accept = button('確認 / Confirm', () => finish(true), 'editor-button danger');
      actions.append(cancel, accept);
      dialog.append(actions);
      document.body.append(dialog);
      dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
      dialog.addEventListener('close', () => finish(false), { once: true });
      dialog.showModal();
      cancel.focus();
    });
  }

  function collection(parent, title, getItems, renderItem, makeItem, onRemove, include = () => true, draggable = false, duplicate) {
    const group = el('section', 'editor-collection');
    let dragging;
    const header = el('div', 'editor-section-heading');
    header.append(el('h3', '', title), button('＋ 新增 / Add', () => {
      const item = makeItem();
      forLocales(data => {
        const entry = clone(item);
        getItems(data).push(entry);
        if (data === current()) openEntries.add(entry);
      });
      changed();
      drawWork();
    }));
    group.append(header);
    const visible = getItems(current()).map((item, index) => ({ item, index })).filter(({ item }) => include(item));
    visible.forEach(({ item, index }, position) => {
      const card = el('details', 'editor-entry');
      card.open = openEntries.has(item);
      card.addEventListener('toggle', () => {
        if (card.open) openEntries.add(item);
        else openEntries.delete(item);
      });
      const summary = el('summary', 'editor-entry-summary');
      const summaryText = el('span');
      const updateSummary = () => { summaryText.textContent = `${title} ${position + 1}${item.title ? ` · ${item.title}` : ''}`; };
      updateSummary();
      summary.append(summaryText);
      card.append(summary);
      if (draggable) {
        const handle = el('span', 'editor-drag-handle', '☰ 拖曳排序');
        handle.draggable = true;
        handle.addEventListener('dragstart', event => {
          if (busy) { event.preventDefault(); return; }
          dragging = index;
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', String(index));
          event.stopPropagation();
        });
        handle.addEventListener('dragend', () => { dragging = undefined; });
        card.addEventListener('dragover', event => {
          if (dragging === undefined) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = 'move';
        });
        card.addEventListener('drop', event => {
          if (dragging === undefined) return;
          event.preventDefault();
          event.stopPropagation();
          if (dragging !== index) {
            forLocales(data => {
              const items = getItems(data);
              items.splice(index, 0, items.splice(dragging, 1)[0]);
            });
            changed();
            drawWork();
          }
          dragging = undefined;
        });
        summary.append(handle);
      }
      card.addEventListener('input', updateSummary);
      const actions = el('div', 'editor-entry-actions');
      const move = direction => {
        const target = visible[position + direction].index;
        forLocales(data => {
          const items = getItems(data);
          [items[index], items[target]] = [items[target], items[index]];
        });
        changed();
        drawWork();
      };
      const up = button('↑ 上移', () => move(-1));
      up.disabled = position === 0;
      const down = button('↓ 下移', () => move(1));
      down.disabled = position === visible.length - 1;
      actions.append(up, down);
      if (duplicate) actions.append(button('複製 / Duplicate', () => duplicate(index)));
      actions.append(button('刪除 / Delete', async () => {
          if (!await confirmAction('刪除此項目？', onRemove ?
            '四種語言中的企劃、角色參與記錄與作品企劃連結都會移除；角色、故事與圖片不會刪除。發布前，公開網站不會改變。' :
            '四種語言中的此項目都會移除。發布前，公開網站不會改變。')) return;
          forLocales(data => {
            if (onRemove) onRemove(data, getItems(data)[index]);
            getItems(data).splice(index, 1);
          });
          changed();
          drawWork();
        }, 'editor-button danger'));
      card.append(actions);
      renderItem(card, item, index);
      group.append(card);
    });
    parent.append(group);
  }

  function drawSite() {
    const site = current().site;
    work.append(el('h2', '', '首頁內容 / Homepage'));
    [['eyebrow', '小標題'], ['title', '主標題'], ['description', '網站介紹'], ['heroAlt', '主視覺圖片描述'],
      ['noteTitle', '歡迎卡片標題'], ['note', '歡迎卡片內容']].forEach(([key, title]) =>
      field(work, title, site[key], value => { site[key] = value; }, { multiline: ['description', 'note', 'title'].includes(key), required: true }));
    imageField(work, '首頁主視覺', site.heroImage, value => forLocales(data => { data.site.heroImage = value; }));
  }

  function selectedCharacter(data = current()) {
    return data.characters.find(character => character.id === selectedId);
  }

  function projectChecks(parent, item, getItem) {
    [['creative', '相關創作企劃'], ['trpg', '相關 TRPG 劇本']].forEach(([kind, title]) => {
      const group = el('fieldset', 'editor-project-checks');
      group.append(el('legend', '', title));
      const projects = current().projects.filter(project => project.kind === kind);
      if (!projects.length) group.append(el('p', 'editor-hint', '此類別尚無企劃，請先到對應編輯區新增。'));
      projects.forEach(project => {
        const label = el('label');
        const input = el('input');
        input.type = 'checkbox';
        input.checked = item.projectIds.includes(project.id);
        input.addEventListener('change', () => {
          forLocales(data => {
            const entry = getItem(data);
            entry.projectIds = input.checked ? [...new Set([...entry.projectIds, project.id])] : entry.projectIds.filter(id => id !== project.id);
          });
          changed();
        });
        label.append(input, document.createTextNode(project.title || '（未命名企劃）'));
        group.append(label);
      });
      parent.append(group);
    });
  }

  function plurkImportForm() {
    const panel = el('details', 'editor-collection');
    panel.append(el('summary', '', '從 Plurk 儲存網頁建立交流創作'));
    panel.append(el('p', 'editor-hint', '選擇完整儲存的 HTML 和對應的資源資料夾（建議使用 Chrome 或 Edge）。只匯入回覆內容，連結保留文字但不顯示網址；繁體中文內容會複製到所有語言，並非自動翻譯。請先取得公開授權。'));
    const title = field(panel, '交流創作名稱', '', () => {}, { track: false });
    const date = field(panel, '日期', today(), () => {}, { type: 'date', track: false });
    const characters = el('fieldset', 'editor-project-checks');
    characters.append(el('legend', '', '關聯角色'));
    const checks = [];
    draft.locales['zh-Hant'].characters.forEach(character => {
      const label = el('label');
      const input = el('input');
      input.type = 'checkbox';
      input.checked = character.id === selectedId;
      checks.push([character.id, input]);
      label.append(input, document.createTextNode(character.name));
      characters.append(label);
    });
    panel.append(characters);
    const htmlLabel = el('label', 'editor-field');
    htmlLabel.append(el('span', '', 'Plurk HTML 網頁'));
    const htmlFile = el('input');
    htmlFile.type = 'file';
    htmlFile.accept = '.html,.htm,text/html';
    htmlLabel.append(htmlFile);
    const resourceLabel = el('label', 'editor-field');
    resourceLabel.append(el('span', '', '網頁資源資料夾'));
    const resources = el('input');
    resources.type = 'file';
    resources.multiple = true;
    resources.setAttribute('webkitdirectory', '');
    resourceLabel.append(resources);
    panel.append(htmlLabel, resourceLabel);
    const progressSection = el('div', 'editor-import-progress');
    progressSection.hidden = true;
    const progressText = el('p');
    progressText.setAttribute('role', 'status');
    progressText.setAttribute('aria-live', 'polite');
    const progress = el('progress');
    progress.max = 1;
    progressSection.append(progressText, progress);
    panel.append(progressSection);
    function showProgress(text, completed, total) {
      progressSection.hidden = false;
      progress.hidden = false;
      progressText.textContent = text;
      progress.setAttribute('aria-label', text);
      if (total > 0) {
        progress.max = total;
        progress.value = completed;
      } else {
        progress.removeAttribute('value');
      }
    }
    panel.append(button('匯入並更新網站', async () => {
      progressSection.hidden = true;
      if (!title.value.trim() || !date.value || !htmlFile.files.length) throw new Error('請填寫名稱、日期並選擇 HTML 檔案。');
      if (htmlFile.files[0].size > 20 * 1024 * 1024) throw new Error('HTML 檔案超過 20 MB。');
      const ids = checks.filter(([, input]) => input.checked).map(([id]) => id);
      if (!ids.length) throw new Error('請至少選擇一位關聯角色。');
      showProgress('正在讀取並解析 HTML，請稍候…');
      try {
        const parsed = window.AtelierExchangeImport.parse(await htmlFile.files[0].text(), [...resources.files]);
        const exchange = { id: uid('exchange'), characterIds: ids, title: title.value.trim(), date: date.value, replies: parsed.replies.map(text => ({ text })) };
        const next = clone(draft);
        codes.forEach(code => next.locales[code].characters.find(character => character.id === selectedId).exchanges.push(clone(exchange)));
        api.validate(next);
        if (!api.cloud.debugMode) rejectLocalExchangeMedia(next);
        const description = api.cloud.debugMode
          ? `將匯入 ${parsed.replies.length} 則回覆、${parsed.files.length} 個圖片，並套用整份本機草稿預覽。圖片僅存於此瀏覽器；清除瀏覽器資料會遺失圖片。`
          : `將匯入 ${parsed.replies.length} 則回覆、公開上傳 ${parsed.files.length} 個圖片，並發布整份草稿（包含其他未發布修改）。請確認所有內容皆有公開授權。`;
        showProgress('解析完成，請確認是否開始匯入。');
        if (!await confirmAction('確認匯入並更新？', description)) {
          progressSection.hidden = true;
          return;
        }
        await operation(async () => {
          message('檢查及儲存圖片中，請稍候…');
          showProgress(`檢查圖片：0 / ${parsed.files.length}。請勿關閉頁面。`, 0, parsed.files.length);
          for (const [index, file] of parsed.files.entries()) {
            try { await api.cloud.validateImage(file); }
            catch (error) { throw new Error(`圖片檢查失敗：${error.message} 尚未上傳任何圖片或發布作品。`); }
            showProgress(`檢查圖片：${index + 1} / ${parsed.files.length}。請勿關閉頁面。`, index + 1, parsed.files.length);
          }
          let paths;
          if (api.cloud.debugMode) {
            showProgress('正在儲存圖片至本機瀏覽器，請勿關閉頁面…');
            paths = await window.AtelierExchangeImport.saveLocal(parsed.files);
          }
          else {
            paths = new Map();
            showProgress(`上傳圖片：0 / ${parsed.files.length}。請勿關閉頁面。`, 0, parsed.files.length);
            try {
              for (const [index, file] of parsed.files.entries()) {
                paths.set(file.name, await api.cloud.upload(file));
                showProgress(`上傳圖片：${index + 1} / ${parsed.files.length}。請勿關閉頁面。`, index + 1, parsed.files.length);
              }
            } catch (error) {
              throw new Error(`圖片上傳失敗：${error.message}。已上傳的 ${paths.size} 個圖片仍公開存在雲端；作品尚未發布。`);
            }
          }
          codes.forEach(code => {
            const saved = next.locales[code].characters.find(character => character.id === selectedId).exchanges.find(item => item.id === exchange.id);
            saved.replies.forEach(reply => {
              reply.text = reply.text.replace(/\u0000(Sticker|Image):([^\u0000]+)\u0000/g, (_, kind, name) => `[${kind}: ${paths.get(name)}]`);
            });
          });
          showProgress(api.cloud.debugMode ? '正在更新本機預覽，請稍候…' : '圖片已上傳，正在發布網站，請勿關閉頁面…');
          api.validate(next);
          if (api.cloud.debugMode) {
            draft = next;
            saveDraft();
            if (!stored) throw new Error('匯入草稿無法儲存；請下載備份。圖片仍保存在本機瀏覽器。');
            api.apply(clone(draft), baseVersion);
            message('匯入完成，已更新本機預覽；圖片只存在此瀏覽器。');
          } else {
            let version;
            try { version = await api.cloud.publish(next, baseVersion); }
            catch (error) {
              throw new Error(`發布失敗：${error.message}。已上傳的 ${paths.size} 個圖片仍公開存在雲端；作品尚未發布。`);
            }
            draft = next;
            api.apply(clone(draft), version);
            baseVersion = version;
            hasChanges = false;
            try { localStorage.removeItem(draftKey); }
            catch (error) { console.warn('已發布，但無法清除本機草稿：', error); }
            message(`匯入並發布完成！版本 ${version}。`);
          }
          drawWork();
          const completedPanel = work.querySelector('.editor-import-progress');
          completedPanel.hidden = false;
          completedPanel.closest('details').open = true;
          const completedText = completedPanel.querySelector('p');
          const completedBar = completedPanel.querySelector('progress');
          completedText.textContent = status.textContent;
          completedBar.setAttribute('aria-label', status.textContent);
          completedBar.max = 1;
          completedBar.value = 1;
        });
      } catch (error) {
        progressSection.hidden = false;
        progress.hidden = true;
        progressText.textContent = '匯入未完成，請查看上方錯誤訊息後再試。';
        throw error;
      }
    }, 'editor-button primary'));
    work.append(panel);
  }

  function drawProjects() {
    const kind = section === 'trpg' ? 'trpg' : 'creative';
    const label = kind === 'trpg' ? 'TRPG 劇本 / TRPG' : '創作企劃 / Creative Projects';
    work.append(el('h2', '', label),
      el('p', 'editor-hint', '共用企劃只需建立一次。再到各角色勾選參與企劃，並在作品、章節勾選相關企劃；訪客可從企劃頁查看所有參與角色及作品。'));
    collection(work, label, data => data.projects, (card, project, index) => {
      choice(card, '企劃類型', project.kind, [['creative', '創作企劃'], ['trpg', 'TRPG 劇本']], value => {
        forLocales(data => {
          data.projects[index].kind = value;
          data.characters.forEach(character => {
            const oldKey = value === 'creative' ? 'trpgScenarios' : 'artProjects';
            const newKey = value === 'creative' ? 'artProjects' : 'trpgScenarios';
            const entry = character[oldKey].find(entry => entry.id === project.id);
            if (entry) {
              character[oldKey] = character[oldKey].filter(entry => entry.id !== project.id);
              character[newKey].push(entry);
            }
          });
        });
        drawWork();
      });
      field(card, '企劃名稱', project.title, value => { project.title = value; }, { required: true });
      field(card, '企劃介紹', project.description, value => { project.description = value; }, { required: true, multiline: true });
      field(card, '企劃網址（可留白）', project.url || '', value => forLocales(data => {
        if (value) data.projects[index].url = value;
        else delete data.projects[index].url;
      }), { type: 'url' });
      if (project.kind === 'trpg') {
        collection(card, '團錄 / Records', data => data.projects[index].records, (recordCard, record, recordIndex) => {
          field(recordCard, '團錄名稱', record.title, value => { record.title = value; }, { required: true });
          field(recordCard, '團錄網址（HTTPS）', record.url, value => forLocales(data => {
            data.projects[index].records[recordIndex].url = value;
          }), { type: 'url', required: true });
        }, () => ({ title: '', url: '' }));
      }
    }, () => ({ id: uid('project'), kind, title: '', description: '', records: [] }), (data, project) => {
      data.characters.forEach(character => {
        character.artProjects = character.artProjects.filter(entry => entry.id !== project.id);
        character.trpgScenarios = character.trpgScenarios.filter(entry => entry.id !== project.id);
        [...character.gallery, ...character.chapters].forEach(entry => {
          entry.projectIds = entry.projectIds.filter(id => id !== project.id);
        });
      });
    }, project => project.kind === kind, false, index => {
      const id = uid('project');
      const suffix = { 'zh-Hant': '（副本）', en: ' (copy)', ja: '（コピー）', ko: ' (복사본)' };
      forLocales((data, code) => {
        const entry = clone(data.projects[index]);
        entry.id = id;
        if (entry.title.trim()) entry.title += suffix[code];
        data.projects.splice(index + 1, 0, entry);
        if (data === current()) openEntries.add(entry);
      });
      changed();
      drawWork();
    });
  }

  function drawCharacter() {
    const heading = el('div', 'editor-section-heading');
    const labels = { characters: '角色資料 / Characters', gallery: '畫廊作品 / Gallery',
      stories: '故事章節 / Stories', manga: '漫畫 / Manga', commissions: '委託作品 / Commissions',
      exchanges: '交流創作 / Creative exchanges' };
    heading.append(el('h2', '', labels[section]));
    if (section === 'characters') heading.append(button('＋ 新增角色', () => {
      const id = uid('oc');
      const character = {
        id, name: '', world: '', summary: '', portrait: 'assets/mira.svg', portraitAlt: '', youtubeUrl: '',
        tags: [], facts: {}, about: [], gallery: [], chapters: [], commissions: [], exchanges: [], artProjects: [], trpgScenarios: []
      };
      forLocales(data => data.characters.push(clone(character)));
      selectedId = id;
      changed();
      drawWork();
    }));
    work.append(heading);
    if (!current().characters.length) { work.append(el('p', 'editor-hint', '尚無角色。按「新增角色」開始。')); return; }
    if (!selectedCharacter()) selectedId = current().characters[0].id;
    const picker = choice(work, '選擇角色', selectedId, current().characters.map(character => [character.id, character.name || '（未命名角色）']), value => {
      selectedId = value;
      drawWork();
    }, false);
    picker.setAttribute('data-character-picker', '');
    const character = selectedCharacter();
    const shared = key => value => forLocales(data => { selectedCharacter(data)[key] = value; });
    work.append(el('p', 'editor-hint', '文字只修改目前的內容語言；新增、刪除、排序、圖片與日期會同步四語。畫廊、故事／漫畫及委託作品可在各項目的「關聯角色」中勾選多位角色。'));
    if (section === 'characters') {
      [['name', '角色名稱'], ['world', '所屬世界'], ['summary', '簡介'], ['portraitAlt', '肖像圖片描述（無障礙文字）']].forEach(([key, title]) =>
        field(work, title, character[key], value => { character[key] = value; }, { multiline: key === 'summary', required: true }));
      field(work, '標籤（以逗號分隔）', character.tags.join(', '), value => {
        character.tags = value.split(/[,，]/).map(tag => tag.trim()).filter(Boolean);
      });
      imageField(work, '角色肖像', character.portrait, shared('portrait'), { crop: true });
      field(work, 'YouTube 影片網址（可留白）', character.youtubeUrl, shared('youtubeUrl'),
        { type: 'url', hint: '支援 YouTube 影片網址或 youtu.be 短網址。' });
      const facts = el('section', 'editor-collection');
      facts.append(el('h3', '', '基本資料 / Profile facts'));
      Object.entries(character.facts).forEach(([key, value], index) => {
        const row = el('div', 'editor-fact');
        let label = key;
        field(row, `欄位 ${index + 1} 名稱`, key, next => {
          const entries = Object.entries(character.facts);
          entries[index] = [next, character.facts[label]];
          if (entries.some(([entryKey], entryIndex) => entryIndex !== index && entryKey === next)) {
            throw new Error('欄位名稱重複，請使用不同名稱。');
          }
          character.facts = Object.fromEntries(entries);
          label = next;
        }, { required: true });
        field(row, `欄位 ${index + 1} 內容`, value, next => { character.facts[label] = next; }, { required: true });
        row.append(button('移除欄位', () => { delete character.facts[label]; changed(); drawWork(); }, 'editor-button danger'));
        facts.append(row);
      });
      facts.append(button('＋ 新增資料欄位', () => {
        let label = '新欄位';
        while (Object.hasOwn(character.facts, label)) label += '＋';
        character.facts[label] = '';
        changed();
        drawWork();
      }));
      work.append(facts);
      collection(work, '角色介紹段落', data => selectedCharacter(data).about, (card, item) => {
        field(card, '段落標題', item.title, value => { item.title = value; }, { required: true });
        field(card, '介紹內容', item.text, value => { item.text = value; }, { multiline: true, required: true });
      }, () => ({ title: '', text: '' }));
    }
    if (section === 'gallery') collection(work, '畫廊作品', data => selectedCharacter(data).gallery, (card, item, index) => {
      [['title', '作品名稱'], ['alt', '圖片描述'], ['credit', '繪者 / 來源']].forEach(([key, label]) =>
        field(card, label, item[key], value => { item[key] = value; }, { required: true }));
      field(card, '日期', item.date, value => forLocales(data => { selectedCharacter(data).gallery[index].date = value; }), { type: 'date', required: true });
      imageField(card, '作品圖片', item.src, value => forLocales(data => { selectedCharacter(data).gallery[index].src = value; }));
      projectChecks(card, item, data => selectedCharacter(data).gallery[index]);
      linkedCharacterChecks(card, item, 'gallery', index);
    }, () => ({ id: uid('artwork'), characterIds: [selectedId], title: '', alt: '', credit: '', date: today(), src: character.portrait, projectIds: [] }));
    if (section === 'commissions') collection(work, '委託作品 / Commissions', data => selectedCharacter(data).commissions, (card, item, index) => {
      const sharedCommission = key => value => forLocales(data => { selectedCharacter(data).commissions[index][key] = value; });
      card.append(el('p', 'editor-hint', '可存放其他創作者的圖片、文章或圖文作品；至少填圖片或正文。姓名與社群網址可各自留白，並同步四語。請先取得公開展示授權。'));
      field(card, '委託作品名稱', item.title, value => { item.title = value; }, { required: true });
      field(card, '委託作品日期', item.date, sharedCommission('date'), { type: 'date', required: true });
      field(card, '創作者姓名（可留白）', item.artistName, sharedCommission('artistName'));
      field(card, '創作者社群網址（可留白，僅接受 HTTPS）', item.artistUrl, sharedCommission('artistUrl'), { type: 'url' });
      imageField(card, '委託圖片（可留白）', item.src, sharedCommission('src'));
      field(card, '委託圖片描述（有圖片時必填）', item.alt, value => { item.alt = value; });
      field(card, '委託文章／正文（可留白）', item.text, value => { item.text = value; }, { multiline: true });
      linkedCharacterChecks(card, item, 'commissions', index);
    }, () => ({ id: uid('commission'), characterIds: [selectedId], title: '', date: today(), artistName: '', artistUrl: '', src: '', alt: '', text: '' }));
    if (section === 'exchanges') plurkImportForm();
    if (section === 'exchanges') collection(work, '交流創作 / Creative exchanges', data => selectedCharacter(data).exchanges, (card, item, index) => {
      field(card, '交流創作名稱', item.title, value => { item.title = value; }, { required: true });
      field(card, '日期', item.date, value => forLocales(data => {
        selectedCharacter(data).exchanges[index].date = value;
      }), { type: 'date', required: true });
      linkedCharacterChecks(card, item, 'exchanges', index);
      card.append(el('p', 'editor-hint', '只匯入取得公開授權的內容。從 Plurk 複製回覆並貼上，在每則回覆之間另起一行輸入 ---。匯入不會連線 Plurk，也不會儲存回覆 ID。'));
      const pasted = field(card, '貼上回覆 / Paste replies', '', () => {}, {
        multiline: true, track: false, hint: '多行回覆可保留原本換行；只有單獨一行的 --- 會分隔回覆。匯入會附加，不會取代既有回覆。'
      });
      const fileLabel = el('label', 'editor-field');
      fileLabel.append(el('span', '', '載入純文字檔 / Load text file'));
      const file = el('input');
      file.type = 'file';
      file.accept = '.txt,text/plain';
      file.addEventListener('change', async () => {
        if (!file.files[0]) return;
        try {
          if (file.files[0].size > 1000000) throw new Error('文字檔超過 1 MB，請分批匯入。');
          const text = await file.files[0].text();
          if (pasted.value && !await confirmAction('取代尚未匯入的文字？', '這只取代貼上區中的文字，不會刪除已匯入的回覆。')) return;
          pasted.value = text;
        } catch (error) { errorMessage(error); }
        finally { file.value = ''; }
      });
      fileLabel.append(file);
      card.append(fileLabel, button('匯入回覆 / Import replies', () => {
        const parts = pasted.value.split(/^[ \t]*---[ \t]*\r?$/m).map(text => text.trim());
        if (!pasted.value.trim() || parts.some(text => !text)) throw new Error('請貼上回覆，且分隔線前後都必須有內容。');
        const next = clone(draft);
        codes.forEach(code => {
          const target = next.locales[code].characters.find(value => value.id === selectedId).exchanges[index];
          parts.forEach(text => target.replies.push({ text: code === editLanguage ? text : '' }));
        });
        api.validate(next, { allowIncomplete: true });
        draft = next;
        openEntries.add(current().characters.find(value => value.id === selectedId).exchanges[index]);
        changed();
        drawWork();
        if (stored) message(`已匯入 ${parts.length} 則回覆；請檢查內容並補齊其他語言。`);
      }));
      const getReplies = data => selectedCharacter(data).exchanges[index].replies;
      collection(card, '回覆 / Replies', getReplies, (replyCard, reply) => {
        field(replyCard, '回覆內容', reply.text, value => { reply.text = value; }, { multiline: true, required: true });
        replyCard.append(el('p', 'editor-hint', '圖片可使用 [Image: assets/exchange-media/檔名]，貼圖可使用 [Sticker: 檔名]；兩者也可使用已允許的雲端圖片網址。請確認圖片已存在且有展示授權。'));
      }, () => ({ text: '' }));
    }, () => ({ id: uid('exchange'), characterIds: [selectedId], title: '', date: today(), replies: [] }));
    if (section === 'stories' || section === 'manga') collection(work, section === 'manga' ? '漫畫' : '故事章節', data => selectedCharacter(data).chapters, (card, item, index) => {
      field(card, '章節標題', item.title, value => { item.title = value; }, { required: true });
      field(card, '作者 / 來源', item.credit, value => { item.credit = value; }, { required: true });
      field(card, '日期', item.date, value => forLocales(data => { selectedCharacter(data).chapters[index].date = value; }), { type: 'date', required: true });
      projectChecks(card, item, data => selectedCharacter(data).chapters[index]);
      linkedCharacterChecks(card, item, 'chapters', index);
      choice(card, '閱讀格式', item.format, [['prose', '文字故事'], ['illustrated', '圖文故事'], ['manga', '漫畫（依頁序向下閱讀）']], value => {
        if (value === item.format) return;
        const chapters = codes.map(code => selectedCharacter(draft.locales[code]).chapters[index]);
        if (value === 'prose' && chapters.some(chapter => chapter.blocks.some(block => block.type === 'image'))) {
          throw new Error('請先刪除圖片區塊再改為純文字，以免遺失圖片。');
        }
        if (value === 'manga' && chapters.some(chapter => chapter.paragraphs.length || chapter.blocks.some(block => block.type === 'text'))) {
          throw new Error('漫畫僅接受圖片頁。請先移除文字，或選擇圖文故事保留文字與插圖。');
        }
        const hasProse = chapters.some(chapter => chapter.paragraphs.length);
        chapters.forEach(chapter => {
          if (value === 'prose') {
            chapter.paragraphs = chapter.blocks.map(block => block.text);
            chapter.blocks = [];
          } else if (chapter.format === 'prose') {
            chapter.blocks = hasProse ? [{ type: 'text', text: chapter.paragraphs.join('\n\n') }] : [];
            chapter.paragraphs = [];
          }
          chapter.format = value;
        });
        drawWork();
      });
      if (item.format === 'prose') {
        field(card, '故事正文（空白行分段）', item.paragraphs.join('\n\n'), value => {
          item.paragraphs = value.split(/\n\s*\n/).map(paragraph => paragraph.trim()).filter(Boolean);
        }, { multiline: true, required: true });
      } else {
        const getBlocks = data => selectedCharacter(data).chapters[index].blocks;
        if (item.format === 'manga') {
          const uploadLabel = el('label', 'editor-field');
          uploadLabel.append(el('span', '', '批次上傳漫畫頁面 / Upload manga pages'));
          const files = el('input');
          files.type = 'file';
          files.multiple = true;
          files.accept = 'image/jpeg,image/png,image/webp,image/gif,image/avif';
          files.disabled = api.cloud.debugMode;
          files.addEventListener('change', async () => {
            const selected = [...files.files];
            if (!selected.length) return;
            let completed = 0;
            try {
              await operation(async () => {
                for (const file of selected) {
                  message(`圖片上傳中 ${completed + 1}/${selected.length}…`);
                  const src = await api.cloud.upload(file);
                  forLocales(data => getBlocks(data).push({ type: 'image', src, alt: '', caption: '' }));
                  completed++;
                  changed();
                }
              });
              drawWork();
              if (stored) message(`已上傳 ${completed} 頁。請填寫每頁圖片描述，再發布網站。`);
            } catch (error) {
              drawWork();
              errorMessage(new Error(`已上傳 ${completed}/${selected.length} 頁，剩餘檔案未上傳：${error.message}${stored ? '' : ' 草稿無法儲存，請立即下載備份。'}`));
            } finally { files.value = ''; }
          });
          uploadLabel.append(files, el('small', '', api.cloud.debugMode ?
            '本機除錯模式不支援雲端上傳，請連接雲端後使用。' :
            '可一次選取多張；每張最多 5 MiB。上傳後請填寫圖片描述。'));
          card.append(uploadLabel);
        }
        if (item.format === 'illustrated') card.append(button('＋ 新增文字區塊', () => {
          forLocales(data => getBlocks(data).push({ type: 'text', text: '' }));
          changed();
          drawWork();
        }));
        collection(card, item.format === 'manga' ? '漫畫頁面' : '圖文區塊', getBlocks, (blockCard, block, blockIndex) => {
          if (block.type === 'text') field(blockCard, '區塊文字', block.text, value => { block.text = value; }, { multiline: true, required: true });
          else {
            imageField(blockCard, '故事圖片', block.src, value => forLocales(data => { getBlocks(data)[blockIndex].src = value; }));
            field(blockCard, '頁面圖片描述', block.alt, value => { block.alt = value; }, { required: true });
            field(blockCard, '圖片說明（可留白）', block.caption, value => { block.caption = value; }, { multiline: true });
          }
        }, () => ({ type: 'image', src: character.portrait, alt: '', caption: '' }),
        undefined, () => true, item.format === 'manga');
      }
    }, () => ({ id: uid('chapter'), characterIds: [selectedId], title: '', credit: '', date: today(), paragraphs: [], format: section === 'manga' ? 'manga' : 'prose', blocks: [], projectIds: [] }),
    undefined, chapter => section === 'manga' ? chapter.format === 'manga' : chapter.format !== 'manga');
    if (section === 'characters') {
      [['artProjects', '創作企劃'], ['trpgScenarios', 'TRPG 劇本']].forEach(([key, title]) => {
        const group = el('section', 'editor-collection');
        group.append(el('h3', '', title));
        current().projects.filter(project => project.kind === (key === 'artProjects' ? 'creative' : 'trpg')).forEach(project => {
          const label = el('label', 'editor-membership');
          const input = el('input');
          input.type = 'checkbox';
          input.checked = character[key].some(entry => entry.id === project.id);
          input.addEventListener('change', () => {
            forLocales(data => {
              const member = selectedCharacter(data);
              const local = data.projects.find(entry => entry.id === project.id);
              if (input.checked) member[key].push({ id: project.id, title: local.title, description: '' });
              else member[key] = member[key].filter(entry => entry.id !== project.id);
            });
            changed();
            drawWork();
          });
          label.append(input, document.createTextNode(project.title || '（未命名企劃）'));
          group.append(label);
          const entry = character[key].find(entry => entry.id === project.id);
          if (entry) field(group, `${project.title}：參與介紹`, entry.description, value => { entry.description = value; }, { multiline: true, required: true });
        });
        group.append(el('p', 'editor-hint', '沒有參加可不勾選。請在「創作企劃」或「TRPG 劇本」區域新增企劃。'));
        work.append(group);
      });
      const danger = el('div', 'editor-danger-zone');
      danger.append(button('刪除此角色及相關關係', async () => {
        if (!await confirmAction('確定刪除整個角色？', '作品若還關聯其他角色，會保留並移到其他角色名下；只關聯此角色的章節、畫廊、委託及交流創作會一起移除。相關關係也會刪除，雲端圖片不會刪除。請先下載備份。')) return;
        forLocales(data => {
          const removed = data.characters.find(item => item.id === selectedId);
          const remaining = data.characters.filter(item => item.id !== selectedId);
          ['gallery', 'chapters', 'commissions', 'exchanges'].forEach(key => {
            removed[key].forEach(entry => {
              const replacementId = entry.characterIds.find(id => id !== selectedId && remaining.some(item => item.id === id));
              if (replacementId) {
                const replacement = remaining.find(item => item.id === replacementId);
                replacement[key].push({ ...entry, characterIds: entry.characterIds.filter(id => id !== selectedId) });
              }
            });
          });
          remaining.forEach(character => {
            ['gallery', 'chapters', 'commissions', 'exchanges'].forEach(key => {
              character[key].forEach(entry => {
                entry.characterIds = entry.characterIds.filter(id => id !== selectedId);
              });
            });
          });
          data.characters = data.characters.filter(item => item.id !== selectedId);
          data.relationships = data.relationships.filter(item => item.from !== selectedId && item.to !== selectedId);
        });
        selectedId = undefined;
        changed();
        drawWork();
      }, 'editor-button danger'));
      work.append(danger);
    }
  }

  function drawRelationships() {
    work.append(el('h2', '', '角色關係 / Relationships'),
      el('p', 'editor-hint', '選擇兩位角色並填寫關係。發布後，連線與浮動介紹會自動產生，不需要繪圖或寫程式。每對角色只需一筆關係。'));
    if (current().characters.length < 2) {
      work.append(el('p', 'editor-hint', '請先建立至少兩位角色。'));
      return;
    }
    collection(work, '角色關係', data => data.relationships, (card, item, index) => {
      const entries = current().characters.map(character => [character.id, character.name || '（未命名角色）']);
      [['from', '角色 A'], ['to', '角色 B']].forEach(([key, title]) => choice(card, title, item[key], entries, value =>
        forLocales(data => { data.relationships[index][key] = value; })));
      field(card, '關係名稱（例如：摯友、宿敵）', item.label, value => { item.label = value; }, { required: true });
      field(card, '關係簡介（滑鼠移到連線時顯示）', item.description, value => { item.description = value; }, { multiline: true, required: true });
    }, () => ({
      id: uid('bond'), from: current().characters[0].id, to: current().characters[1].id, label: '', description: ''
    }));
  }

  function drawWork() {
    work.replaceChildren();
    if (section === 'site') drawSite();
    else if (section === 'projects' || section === 'trpg') drawProjects();
    else if (section === 'relationships') drawRelationships();
    else drawCharacter();
  }

  function initializeDraft(payload, version) {
    draft = clone(payload);
    baseVersion = version;
    hasChanges = false;
    stored = true;
  }

  function fillMissingTranslations() {
    const source = current();
    const fillText = (target, original, keys) => keys.forEach(key => {
      if (typeof target[key] !== 'string' || !target[key].trim()) target[key] = original[key];
    });
    codes.filter(code => code !== editLanguage).forEach(code => {
      const target = draft.locales[code];
      fillText(target.site, source.site, ['eyebrow', 'title', 'description', 'heroAlt', 'noteTitle', 'note']);
      target.projects.forEach((project, i) => {
        fillText(project, source.projects[i], ['title', 'description']);
        project.records.forEach((record, j) => fillText(record, source.projects[i].records[j], ['title']));
      });
      target.characters.forEach((character, index) => {
        const original = source.characters[index];
        fillText(character, original, ['name', 'world', 'summary', 'portraitAlt']);
        if (!character.tags.length) character.tags = clone(original.tags);
        if (!Object.keys(character.facts).length) character.facts = clone(original.facts);
        character.about.forEach((part, i) => fillText(part, original.about[i], ['title', 'text']));
        character.gallery.forEach((art, i) => fillText(art, original.gallery[i], ['title', 'alt', 'credit']));
        character.commissions.forEach((commission, i) => fillText(commission, original.commissions[i], ['title', 'alt', 'text']));
        character.exchanges.forEach((exchange, i) => {
          fillText(exchange, original.exchanges[i], ['title']);
          exchange.replies.forEach((reply, j) => fillText(reply, original.exchanges[i].replies[j], ['text']));
        });
        character.chapters.forEach((chapter, i) => {
          fillText(chapter, original.chapters[i], ['title', 'credit']);
          if (!chapter.paragraphs.length) chapter.paragraphs = clone(original.chapters[i].paragraphs);
          chapter.blocks.forEach((block, j) => fillText(block, original.chapters[i].blocks[j],
            block.type === 'text' ? ['text'] : ['alt', 'caption']));
        });
        ['artProjects', 'trpgScenarios'].forEach(key => character[key].forEach((entry, i) =>
          fillText(entry, original[key][i], ['title', 'description'])));
      });
      target.relationships.forEach((entry, i) => fillText(entry, source.relationships[i], ['label', 'description']));
    });
  }

  function editorScreen() {
    api.main.replaceChildren();
    const heading = el('header', 'page-heading');
    heading.append(el('span', 'eyebrow', 'OWNER STUDIO'), el('h1', '', '創作管理室'),
      el('p', '', '不用寫程式：修改表單 → 儲存草稿 → 發布網站。介面以繁體中文為主，內容可編輯四種語言。'));
    if (api.cloud.debugMode) {
      heading.append(el('p', 'editor-draft-banner', '本機除錯模式：無須登入。修改只儲存在此瀏覽器；套用預覽不會發布至雲端。'));
    }
    const bar = el('div', 'editor-publish-bar');
    bar.append(button('儲存草稿', () => saveDraft()),
      button(api.cloud.debugMode ? '套用本機預覽' : '發布網站 / Publish', () => publish(), 'editor-button primary'),
      button('下載備份', () => download(`atelier-backup-${today()}.json`, draft)));
    if (!api.cloud.debugMode) bar.append(
      button('載入雲端最新版本', () => reloadPublished()),
      button('登出 / Sign out', async () => {
        if (hasChanges) {
          saveDraft();
          if (!stored) throw new Error('草稿無法儲存。請先下載備份，再離開或登出。');
        }
        try { await api.cloud.logout(); }
        finally {
          draft = undefined;
          hasChanges = false;
          render(api);
        }
      }));
    const returnLink = el('a', 'text-link', '查看公開網站 →');
    returnLink.href = '#/';
    bar.append(returnLink);
    status = el('p', 'editor-status');
    status.setAttribute('role', 'status');
    const tools = el('div', 'editor-tools');
    choice(tools, '編輯內容語言 / Content language', editLanguage, codes.map(code => [code, names[code]]), value => {
      editLanguage = value;
      drawWork();
    }, false);
    choice(tools, '編輯區域 / Section', section, [['characters', '角色 / Characters'], ['gallery', '畫廊 / Gallery'], ['stories', '故事 / Stories'], ['manga', '漫畫 / Manga'], ['commissions', '委託作品 / Commissions'], ['exchanges', '交流創作 / Creative exchanges'], ['projects', '創作企劃 / Creative Projects'], ['trpg', 'TRPG 劇本 / TRPG'], ['relationships', '角色關係 / Relationships'], ['site', '首頁 / Homepage']], value => {
      section = value;
      drawWork();
    }, false);
    const copy = button('以本語言補齊空白翻譯', () => {
      fillMissingTranslations();
      changed();
      drawWork();
      message('空白的翻譯已使用目前語言補齊，既有翻譯不變。這不是自動翻譯，可稍後逐語言修改。');
    });
    tools.append(copy);
    const hint = el('p', 'editor-hint', '新增內容請先以繁體中文填寫；若暫時沒有翻譯，可使用「以本語言補齊空白翻譯」，不會覆寫既有翻譯。系統不會自動翻譯。所有發布資料與圖片均公開；不要上傳私人資料。');
    const importLabel = el('label', 'editor-field');
    importLabel.append(el('span', '', '還原備份（只取代草稿，不會立即發布）'));
    const importer = el('input');
    importer.type = 'file';
    importer.accept = '.json,application/json';
    importer.addEventListener('change', async () => {
      const file = importer.files[0];
      if (!file) return;
      try {
        if (file.size > 4000000) throw new Error('備份超過 4 MB。');
        const decoded = JSON.parse(await file.text());
        const imported = api.validate(decoded?.schemaVersion === 1 ? decoded : decoded?.payload);
        if (!await confirmAction('用備份取代目前草稿？', '請先下載目前草稿，避免遺失未發布修改。還原後仍需按發布網站。')) return;
        draft = imported;
        changed();
        drawWork();
      } catch (error) { errorMessage(error); }
      finally { importer.value = ''; }
    });
    importLabel.append(importer);
    work = el('div', 'editor-work');
    api.main.append(heading, bar, status, tools, hint, importLabel, work);
    drawWork();
    message(api.cloud.debugMode
      ? '本機除錯工作室已開啟。修改會儲存在此瀏覽器，可套用預覽或下載備份。'
      : `已登入。雲端基準版本：${baseVersion}。所有修改先保留在草稿，按發布才會公開。`);
  }

  async function publish() {
    await operation(async () => {
      api.validate(draft);
      if (!api.cloud.debugMode) rejectLocalExchangeMedia(draft);
      const invalid = work.querySelector(':invalid');
      if (invalid) {
        for (let parent = invalid.parentElement; parent && parent !== work; parent = parent.parentElement) {
          if (parent.tagName === 'DETAILS') parent.open = true;
        }
        invalid.reportValidity();
        throw new Error('請完成目前表單中的必填欄位。');
      }
      const snapshot = clone(draft);
      if (api.cloud.debugMode) {
        saveDraft();
        api.apply(snapshot, baseVersion);
        message('本機預覽已更新；內容只存在此瀏覽器，並未發布至雲端。');
        return;
      }
      message('發布中，請勿關閉頁面…');
      const version = await api.cloud.publish(snapshot, baseVersion);
      api.apply(snapshot, version);
      baseVersion = version;
      hasChanges = false;
      try { localStorage.removeItem(draftKey); }
      catch (error) { console.warn('已發布，但無法清除本機草稿：', error); }
      message(`發布成功！目前版本 ${version}。訪客重新載入網站即可看見更新。`);
    });
  }

  async function reloadPublished() {
    if (!await confirmAction('載入最新已發布版本？', '目前未發布草稿會被取代。若有版本衝突，請先下載備份，再載入最新版本並重新套用你的修改。')) return;
    await operation(async () => {
      const record = await api.cloud.read();
      const payload = record.payload || api.getPayload();
      api.validate(payload);
      api.apply(payload, record.version);
      initializeDraft(payload, record.version);
      try { localStorage.removeItem(draftKey); }
      catch (error) { throw new Error(`已載入最新資料，但無法清除舊草稿：${error.message}`); }
      drawWork();
      message(`已載入最新發布版本 ${baseVersion}。`);
    });
  }

  function setupScreen() {
    const guide = el('section', 'editor-setup');
    guide.append(el('h2', '', '先連接免費雲端 / Connect Supabase'),
      el('p', '', '公開網站可免費放在 GitHub Pages。直接在線編輯需要先連接你自己的 Supabase 專案；不用在此輸入任何私人金鑰。'),
      el('p', '', '一次性設定：建立專案 → 執行 setup.sql → 建立擁有者帳號並加入名單 → 下載設定檔並上傳 GitHub。完成後，日常更新只需在網站登入與填表。'));
    const guideLink = el('a', 'text-link', '閱讀完整繁體中文設定指南 →');
    guideLink.href = 'SETUP-zh-Hant.md';
    guide.append(guideLink);
    const form = el('form', 'editor-login');
    const url = field(form, 'Supabase Project URL', '', () => {}, { required: true, type: 'url', hint: '例如 https://your-project.supabase.co，不要加結尾斜線。', track: false });
    const key = field(form, 'Publishable key（公開金鑰，不是 secret/service_role）', '', () => {}, { required: true, track: false });
    const submit = el('button', 'editor-button primary', '下載雲端設定檔');
    submit.type = 'submit';
    form.append(submit);
    form.addEventListener('submit', event => {
      event.preventDefault();
      try {
        const config = api.cloud.parseConfig({ supabaseUrl: url.value.trim(), publishableKey: key.value.trim() });
        if (!config) throw new Error('請填寫專案網址與公開金鑰。');
        download('cloud-config.json', config);
        message('設定檔已下載。將它上傳至 GitHub 網站根目錄，取代原設定檔。部署完成後重新載入並登入。');
      } catch (error) { errorMessage(error); }
    });
    guide.append(form);
    api.main.append(guide);
  }

  function loginScreen() {
    const form = el('form', 'editor-login');
    form.append(el('h2', '', '擁有者登入 / Owner sign in'),
      el('p', '', '僅名單中的擁有者可以修改網站。帳號由 Supabase 專案管理者建立，不開放公開註冊。'));
    const email = field(form, '電子郵件 / Email', '', () => {}, { type: 'email', required: true, track: false });
    email.autocomplete = 'username';
    const password = field(form, '密碼 / Password', '', () => {}, { type: 'password', required: true, track: false });
    password.autocomplete = 'current-password';
    const submit = el('button', 'editor-button primary', '登入 / Sign in');
    submit.type = 'submit';
    form.append(submit, el('p', 'editor-hint', '忘記密碼：請聯絡此 Supabase 專案管理者，從 Authentication 管理帳號。'));
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const turn = generation;
      try {
        await operation(async () => {
          message('登入中…');
          const user = await api.cloud.login(email.value, password.value);
          password.value = '';
          if (turn === generation && location.hash === '#/admin') openDraft(user);
        });
      } catch (error) {
        password.value = '';
        errorMessage(error);
      }
    });
    api.main.append(form);
  }

  function openDraft(user) {
    if (ownerId && ownerId !== user.id) {
      draft = undefined;
    }
    ownerId = user.id;
    draftKey = `atelier-draft:${api.cloud.project}:${ownerId}`;
    if (!draft) initializeDraft(api.getPayload(), api.getVersion());
    editorScreen();
    let saved;
    try { saved = localStorage.getItem(draftKey); }
    catch (error) { message(`無法讀取本機草稿：${error.message}`, true); return; }
    if (saved && !hasChanges) {
      const locked = [...api.main.querySelectorAll('input,textarea,select,button')].map(control => [control, control.disabled]);
      locked.forEach(([control]) => { control.disabled = true; });
      const unlock = () => locked.forEach(([control, disabled]) => { control.disabled = disabled; });
      const banner = el('div', 'editor-draft-banner');
      banner.append(el('strong', '', '找到此帳號先前的未發布草稿。'),
        button('繼續編輯先前草稿', () => {
          const record = JSON.parse(saved);
          if (!Number.isSafeInteger(record.baseVersion) || record.baseVersion < 0 ||
            record.payload?.schemaVersion !== 1 || !record.payload.locales ||
            !codes.every(code => record.payload.locales[code]?.site && Array.isArray(record.payload.locales[code].characters) &&
              Array.isArray(record.payload.locales[code].relationships))) throw new Error('本機草稿格式錯誤。請下載原始草稿後改用雲端最新版本。');
          api.validate(record.payload, { allowIncomplete: true });
          draft = record.payload;
          baseVersion = record.baseVersion;
          hasChanges = true;
          unlock();
          drawWork();
          banner.remove();
          message(`已恢復本機草稿（基準版本 ${baseVersion}）。若版本落後，發布時會顯示衝突，不會覆蓋其他人的修改。`);
        }),
        button('下載原始草稿備份', () => download('atelier-local-draft.json', saved, true)),
        button('捨棄舊草稿', async () => {
          if (!await confirmAction('捨棄本機舊草稿？', '此操作無法復原，建議先下載備份。')) return;
          localStorage.removeItem(draftKey);
          unlock();
          banner.remove();
          message('已捨棄舊草稿，正在編輯目前已發布版本。');
        }, 'editor-button danger'));
      work.before(banner);
    }
  }

  async function render(context) {
    api = context;
    const turn = ++generation;
    api.main.replaceChildren(el('h1', '', '創作管理室 / Owner Studio'));
    status = el('p', 'editor-status');
    api.main.append(status);
    if (api.cloud.debugMode) { openDraft({ id: 'local-debug' }); return; }
    if (!api.cloud.configured) { setupScreen(); return; }
    if (!api.cloud.signedIn) { loginScreen(); return; }
    try {
      message('正在核對編輯權限…');
      const user = await api.cloud.owner();
      if (turn === generation && location.hash === '#/admin') openDraft(user);
    } catch (error) {
      if (turn !== generation || location.hash !== '#/admin') return;
      errorMessage(error);
      loginScreen();
    }
  }

  window.addEventListener('beforeunload', event => {
    if (busy || (hasChanges && !stored)) { event.preventDefault(); event.returnValue = ''; }
  });
  return {
    render,
    get isBusy() { return busy; },
    notifyBusy() { message('正在處理登入、上傳或發布，請完成後再離開管理室。', true); }
  };
})();
