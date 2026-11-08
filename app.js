'use strict';

const main = document.querySelector('#main');
let content;
let activeDialog;
let language = 'zh-Hant';
let catalogues;
let translationsReady = false;
let cloudVersion = 0;
const collectionFilters = { gallery: new Set(), stories: new Set(), commissions: new Set(), exchanges: new Set() };
const cloud = window.AtelierCloud;
const languageControl = document.querySelector('#language');
const supportedLanguages = ['en', 'zh-Hant', 'ja', 'ko'];
const themeToggle = document.querySelector('#theme-toggle');

function updateThemeControl() {
  const dark = document.documentElement.dataset.theme === 'dark';
  const label = translationsReady ? t('Dark mode') : '深色模式';
  themeToggle.setAttribute('aria-pressed', String(dark));
  themeToggle.setAttribute('aria-label', label);
  themeToggle.querySelector('.theme-label').textContent = label;
}

themeToggle.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#18231f' : '#f7f3ed';
  updateThemeControl();
  try { localStorage.setItem('atelier-theme', theme); }
  catch (error) { console.warn('Theme preference could not be saved:', error); }
});
updateThemeControl();

function t(message, values = {}) {
  const translated = language === 'en' ? message : catalogues[language].ui[message];
  if (translated === undefined) throw new Error(`Missing ${language} interface translation: ${message}`);
  return translated.replace(/\{(\w+)\}/g, (_, key) => String(values[key]));
}

function translateShell() {
  document.documentElement.lang = language;
  languageControl.value = language;
  languageControl.setAttribute('aria-label', t('Language'));
  document.querySelector('.skip-link').textContent = t('Skip to content');
  document.querySelector('.site-header .brand').setAttribute('aria-label', t('Character Atelier home'));
  document.querySelector('.site-header nav').setAttribute('aria-label', t('Main navigation'));
  document.querySelectorAll('[data-nav]').forEach(item => {
    item.textContent = t({ home: 'Discover', characters: 'Characters', relationships: 'Relationships', gallery: 'Gallery', stories: 'Stories', exchanges: 'Creative exchanges', projects: 'Creative Projects', trpg: 'TRPG', commissions: 'Commissions' }[item.dataset.nav]);
  });
  document.querySelector('.header-note').textContent = t('An original character archive');
  document.querySelector('footer p').textContent = t('A home for characters. A place for their stories.');
  document.querySelector('footer > span').textContent = t('Made for the worlds you imagine.');
  document.querySelector('.owner-link').textContent = t('Manage website');
  document.querySelector('meta[name="description"]').content = content.site.description;
  updateThemeControl();
}

languageControl.addEventListener('change', () => {
  if (location.hash === '#/admin') {
    languageControl.value = language;
    return;
  }
  language = languageControl.value;
  content = catalogues[language].content;
  try { localStorage.setItem('atelier-language', language); }
  catch (error) { console.warn('Language preference could not be saved:', error); }
  translateShell();
  route(false);
});

document.querySelector('.skip-link').addEventListener('click', event => {
  event.preventDefault();
  main.focus();
  main.scrollIntoView();
});

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function link(text, href, className) {
  const element = node('a', className, text);
  element.href = href;
  return element;
}

function image(src, alt, className, lazy = true) {
  const element = node('img', className);
  element.src = src;
  element.alt = alt;
  if (lazy) element.loading = 'lazy';
  return element;
}

function characterUrl(character, tab = 'about') {
  return `#/character/${encodeURIComponent(character.id)}/${tab}`;
}

function youtubeVideoId(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    let id;
    if (url.hostname === 'youtu.be') id = url.pathname.slice(1);
    else if (['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(url.hostname)) {
      if (url.pathname === '/watch') id = url.searchParams.get('v');
      else if (/^\/(?:embed|shorts)\/[^/]+$/.test(url.pathname)) id = url.pathname.split('/')[2];
    }
    return typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch (error) {
    if (error instanceof TypeError) return null;
    throw error;
  }
}

function linkedCharacters(item) {
  return content.characters.filter(character => item.characterIds.includes(character.id));
}

function linkedCharacterNames(item) {
  return linkedCharacters(item).map(character => character.name).join(' · ');
}

function linkedCharacterNav(item, tab) {
  const nav = node('nav', 'linked-character-links');
  nav.setAttribute('aria-label', t('Participating characters'));
  linkedCharacters(item).forEach(character => {
    const itemLink = link('', characterUrl(character, tab), 'text-link linked-character');
    itemLink.append(image(character.portrait, '', 'linked-character-avatar'), node('span', '', character.name));
    nav.append(itemLink);
  });
  return nav;
}

function linkedCharacterAvatars(item) {
  const avatars = node('span', 'linked-character-avatars');
  avatars.setAttribute('aria-hidden', 'true');
  linkedCharacters(item).forEach(character => avatars.append(image(character.portrait, '', 'linked-character-avatar')));
  return avatars;
}

function chapterUrl(character, chapter) {
  return `#/story/${encodeURIComponent(character.id)}/${encodeURIComponent(chapter.id)}`;
}

function heading(kicker, title, description) {
  const header = node('header', 'page-heading');
  header.append(node('span', 'eyebrow', kicker), node('h1', '', title));
  if (description) header.append(node('p', '', description));
  return header;
}

function tags(values) {
  const group = node('div', 'tags');
  values.forEach(value => group.append(node('span', 'tag', value)));
  return group;
}

function characterCard(character) {
  const card = link('', characterUrl(character), 'card');
  card.append(image(character.portrait, character.portraitAlt, 'card-art'));
  const body = node('div', 'card-body');
  const title = node('div', 'card-title');
  title.append(node('h3', '', character.name), node('span', 'tiny', character.world));
  body.append(title, node('p', '', character.summary), tags(character.tags));
  card.append(body);
  return card;
}

function section(title, subtitle, destination, children) {
  const element = node('section', 'section');
  const header = node('div', 'section-head');
  const text = node('div');
  text.append(node('h2', '', title), node('p', '', subtitle));
  header.append(text, link(t('View all →'), destination, 'text-link'));
  element.append(header, children);
  return element;
}

function linkedStoryItems(characters, accept = () => true) {
  const characterIds = new Set(characters.map(character => character.id));
  return content.characters.flatMap(character => character.chapters
    .map((chapter, index) => ({ character, chapter, index }))
    .filter(({ chapter }) => chapter.characterIds.some(id => characterIds.has(id)) && accept(chapter)));
}

function storyList(characters, accept = () => true) {
  return storyItems(linkedStoryItems(characters, accept));
}

function storyItems(items, covers = false) {
  const list = node('div', 'story-list');
  items.forEach(({ character, chapter, index }) => {
    const row = link('', chapterUrl(character, chapter), 'story-row');
    if (covers) {
      const cover = chapter.blocks.find(block => block.type === 'image');
      row.append(image(cover?.src || character.portrait, '', 'story-cover'));
    }
    const text = node('div');
    text.append(node('h3', '', chapter.title), node('p', '', `${linkedCharacterNames(chapter)} · ${t('Chapter {number}', { number: index + 1 })} · ${chapter.date}`));
    if (chapter.format !== 'prose') text.append(node('span', 'tag', t(chapter.format === 'manga' ? 'Manga' : 'Illustrated story')));
    text.append(linkedCharacterAvatars(chapter));
    row.append(node('span', 'chapter-number', String(index + 1).padStart(2, '0')), text, node('span', 'arrow', '→'));
    list.append(row);
  });
  if (!list.childElementCount) list.append(node('p', 'empty', t('No chapters yet. The next story is still being dreamed.')));
  return list;
}

function collectionPage(kind, requestedPage) {
  const pageSize = 10;
  const allItems = kind === 'exchanges' ? content.characters.flatMap(character => character.exchanges.map(exchange => ({ character, exchange }))) :
    kind === 'commissions' ? content.characters.flatMap(character => character.commissions.map(commission => ({ character, commission }))) :
    kind === 'gallery' ? allArtwork() :
    content.characters.flatMap(character => character.chapters.map((chapter, index) => ({ character, chapter, index })));
  const selected = collectionFilters[kind];
  const items = selected && selected.size ? allItems.filter(entry =>
    (entry.art || entry.chapter || entry.commission || entry.exchange).characterIds.some(id => selected.has(id))) : allItems;
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(requestedPage, pages);
  const pageUrl = number => `#/${kind}${number === 1 ? '' : `/page/${number}`}`;
  if (requestedPage !== page) history.replaceState(null, '', pageUrl(page));
  const start = (page - 1) * pageSize;
  const visible = items.slice(start, start + pageSize);
  main.classList.add('collection-view', `collection-${kind}`);
  const titles = { stories: 'Stories worth staying for', gallery: 'Collected moments', commissions: 'Commissions', exchanges: 'Creative exchanges' };
  main.append(heading(t(kind === 'gallery' ? 'The art wall' : 'The storybook'), t(titles[kind]),
    t(kind === 'exchanges' ? 'Conversations and collaborative creations between characters.' :
      kind === 'commissions' ? 'Characters through the eyes and words of other artists.' :
      kind === 'gallery' ? 'Portraits, places, and little glimpses into their lives.' : 'Choose a chapter and wander into another world.')));
  if (selected) {
    const filters = node('fieldset', 'collection-character-filters');
    filters.append(node('legend', '', t('Filter by characters (match any; none shows all)')));
    content.characters.forEach(character => {
      const label = node('label');
      const checkbox = node('input');
      checkbox.type = 'checkbox';
      checkbox.value = character.id;
      checkbox.checked = selected.has(character.id);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selected.add(character.id);
        else selected.delete(character.id);
        if (location.hash !== `#/${kind}`) location.hash = `#/${kind}`;
        else {
          main.replaceChildren();
          collectionPage(kind, 1);
          [...main.querySelectorAll('.collection-character-filters input')].find(input => input.value === character.id)?.focus();
        }
      });
      label.append(checkbox, document.createTextNode(character.name));
      filters.append(label);
    });
    main.append(filters);
  }
  const summary = node('p', 'collection-summary', t('Showing {start}–{end} of {total} works', {
    start: items.length ? start + 1 : 0, end: start + visible.length, total: items.length
  }));
  main.append(summary, kind === 'exchanges' ? exchangeList(visible) : kind === 'commissions' ? commissionList(visible) : kind === 'gallery' ? gallery(visible) : storyItems(visible, true));
  main.append(paginationControls(page, pages, pageUrl));
}

function paginationControls(page, pages, pageUrl, label = '') {
  const pagination = node('nav', 'pagination');
  pagination.setAttribute('aria-label', label ? `${label} · ${t('Pagination')}` : t('Pagination'));
  const control = (label, number, enabled) => {
    const element = enabled ? link(t(label), pageUrl(number), 'page-control') : node('span', 'page-control', t(label));
    if (!enabled) element.setAttribute('aria-disabled', 'true');
    else element.rel = number < page ? 'prev' : 'next';
    return element;
  };
  const status = node('span', 'page-status', t('Page {page} of {pages}', { page, pages }));
  status.setAttribute('aria-current', 'page');
  pagination.append(control('← Previous page', page - 1, page > 1), status,
    control('Next page →', page + 1, page < pages));
  return pagination;
}

function commissionCredit(commission) {
  const credit = node('p', 'commission-credit');
  if (commission.artistUrl) {
    const social = link(commission.artistName || t('Artist social media ↗'), commission.artistUrl, 'text-link');
    social.target = '_blank';
    social.rel = 'noopener noreferrer';
    credit.append(social);
  } else if (commission.artistName) credit.append(node('span', '', commission.artistName));
  return credit;
}

function commissionList(items) {
  const grid = node('div', 'commission-grid');
  items.forEach(({ character, commission }) => {
    const card = node('article', 'commission-card');
    const destination = `#/commission/${encodeURIComponent(character.id)}/${encodeURIComponent(commission.id)}`;
    const work = link('', destination, 'commission-work');
    if (commission.src) work.append(image(commission.src, commission.alt));
    else work.append(node('span', 'commission-text-mark', t('Written work')));
    work.append(node('h2', '', commission.title));
    if (commission.text) work.append(node('p', 'commission-excerpt', commission.text.slice(0, 180)));
    card.append(work, commissionCredit(commission), linkedCharacterNav(commission, 'commissions'),
      node('span', 'commission-date', commission.date));
    grid.append(card);
  });
  if (!items.length) grid.append(node('p', 'empty', t('No commissions yet.')));
  return grid;
}

function commissionPage(character, commission) {
  main.append(breadcrumbs([[t('Commissions'), '#/commissions'], [character.name, characterUrl(character, 'commissions')], [commission.title]]));
  const article = node('article', 'reader commission-reader');
  article.append(node('span', 'eyebrow', commission.date), node('h1', '', commission.title),
    linkedCharacterNav(commission, 'commissions'), commissionCredit(commission));
  if (commission.src) {
    const figure = node('figure', 'story-illustration');
    figure.append(image(commission.src, commission.alt));
    article.append(figure);
  }
  if (commission.text) article.append(node('div', 'prose commission-prose', commission.text));
  main.append(article);
}

function exchangeList(items) {
  const list = node('div', 'story-list');
  items.forEach(({ character, exchange }) => {
    const row = link('', `#/exchange/${encodeURIComponent(character.id)}/${encodeURIComponent(exchange.id)}`, 'story-row');
    const details = node('div');
    details.append(node('h3', '', exchange.title),
      node('p', '', `${linkedCharacterNames(exchange)} · ${exchange.date}`),
      linkedCharacterAvatars(exchange));
    row.append(details, node('span', 'arrow', '→'));
    list.append(row);
  });
  if (!items.length) list.append(node('p', 'empty', t('No creative exchanges yet.')));
  return list;
}

function exchangeReplyText(text) {
  const result = node('div', 'exchange-reply-text');
  const tokens = /\[(Sticker|Image): ([^\]\r\n]+)\]/g;
  let position = 0;
  for (const match of text.matchAll(tokens)) {
    result.append(document.createTextNode(text.slice(position, match.index)));
    const [, kind, value] = match;
    let src;
    if (kind === 'Sticker' && /^[A-Za-z0-9_-]+\.(?:png|gif|jpe?g|webp)$/i.test(value)) {
      src = `assets/exchange-media/${value}`;
    } else if (
      (/^assets\/exchange-media\/[A-Za-z0-9_-]+\.(?:png|gif|jpe?g|webp)$/i.test(value) || cloud.imageAllowed(value))) {
      src = value;
    } else if (cloud.debugMode && /^local-exchange-media\/[a-f0-9-]{36}$/.test(value)) {
      const placeholder = node('span', '', match[0]);
      result.append(placeholder);
      window.AtelierExchangeImport.loadLocal(value).then(blob => {
        if (!blob) throw new Error(`Local exchange image missing: ${value}`);
        const url = URL.createObjectURL(blob);
        const picture = image(url, kind === 'Sticker' ? 'Sticker' : 'Image', kind === 'Sticker' ? 'exchange-sticker' : 'exchange-image');
        picture.addEventListener('load', () => URL.revokeObjectURL(url), { once: true });
        picture.addEventListener('error', () => { URL.revokeObjectURL(url); picture.replaceWith(document.createTextNode(match[0])); }, { once: true });
        placeholder.replaceWith(picture);
      }).catch(error => console.error('Cannot load local exchange image:', error));
    }
    if (src) {
      const picture = image(src, kind === 'Sticker' ? 'Sticker' : 'Image', kind === 'Sticker' ? 'exchange-sticker' : 'exchange-image');
      picture.addEventListener('error', () => picture.replaceWith(document.createTextNode(match[0])), { once: true });
      result.append(picture);
    } else if (!cloud.debugMode || !/^local-exchange-media\/[a-f0-9-]{36}$/.test(value)) {
      result.append(document.createTextNode(match[0]));
    }
    position = match.index + match[0].length;
  }
  result.append(document.createTextNode(text.slice(position)));
  return result;
}

function exchangePage(character, exchange) {
  main.append(breadcrumbs([[t('Creative exchanges'), '#/exchanges'], [character.name, characterUrl(character, 'exchanges')], [exchange.title]]));
  const article = node('article', 'reader');
  const header = node('header', 'reader-header');
  header.append(node('span', 'eyebrow', exchange.date), node('h1', '', exchange.title),
    linkedCharacterNav(exchange, 'exchanges'));
  const replies = node('ol', 'exchange-replies');
  exchange.replies.forEach(reply => {
    const item = node('li');
    item.append(exchangeReplyText(reply.text));
    replies.append(item);
  });
  article.append(header, replies);
  main.append(article);
}

function home() {
  const hero = node('section', 'hero');
  const copy = node('div', 'hero-copy');
  copy.append(node('span', 'eyebrow', content.site.eyebrow), node('h1', '', content.site.title),
    node('p', '', content.site.description), link(t('Meet the characters →'), '#/characters', 'button'));
  const heroLinks = node('div', 'hero-links');
  heroLinks.append(link(t('Explore the gallery →'), '#/gallery', 'text-link'), node('span', 'hero-caption', t('A collection of extraordinary lives')));
  copy.append(heroLinks);
  const art = node('div', 'hero-art');
  art.append(image(content.site.heroImage, content.site.heroAlt, '', false), node('span', 'hero-stamp', t('Every character has a story')));
  hero.append(copy, art);
  const stats = node('div', 'stats');
  [[content.characters.length, 'characters'], [allArtwork().length, 'artworks'],
    [content.characters.reduce((sum, character) => sum + character.chapters.length, 0), 'chapters']].forEach(([count, label]) => {
    const stat = node('span');
    stat.append(node('strong', '', String(count)), document.createTextNode(t(label)));
    stats.append(stat);
  });
  const grid = node('div', 'grid');
  content.characters.slice(0, 3).forEach(character => grid.append(characterCard(character)));
  const bottom = node('div', 'home-bottom section');
  const stories = node('section');
  stories.append(node('h2', '', t('From the storybook')), node('p', 'tiny', t('Little chapters from bigger worlds.')), storyList(content.characters.slice(0, 2)));
  const note = node('aside', 'note');
  note.append(node('span', 'eyebrow', t('A little corner of the imagination')), node('h2', '', content.site.noteTitle),
    node('p', '', content.site.note), link(t('Explore the gallery →'), '#/gallery', 'text-link'));
  bottom.append(stories, note);
  main.append(hero, stats, section(t('Meet the residents'), t('Original characters, each with a world of their own.'), '#/characters', grid), bottom);
}

function characters() {
  main.append(heading(t('The character directory'), t('Meet the residents'), t('Find a familiar face, or discover someone new.')));
  const toolbar = node('div', 'toolbar');
  const search = node('input', 'search');
  search.type = 'search';
  search.placeholder = t('Search names, worlds, or details...');
  search.setAttribute('aria-label', t('Search characters'));
  const filters = node('div', 'filters');
  filters.setAttribute('aria-label', t('Filter characters by world'));
  const grid = node('div', 'grid');
  const status = node('p', 'tiny');
  status.setAttribute('role', 'status');
  let world = null;
  const buttons = [];
  function update() {
    const query = search.value.trim().toLocaleLowerCase();
    const matches = content.characters.filter(character => (!world || character.world === world) &&
      [character.name, character.world, character.summary, ...character.tags, ...character.about.map(part => part.text)]
        .join(' ').toLocaleLowerCase().includes(query));
    grid.replaceChildren(...matches.map(characterCard));
    if (!matches.length) grid.append(node('p', 'empty', t('No characters found. Try another name or world.')));
    status.textContent = t(matches.length === 1 ? '{count} character found' : '{count} characters found', { count: matches.length });
    buttons.forEach(([button, value]) => button.setAttribute('aria-pressed', String(world === value)));
  }
  [null, ...new Set(content.characters.map(character => character.world))].forEach(value => {
    const button = node('button', 'filter', value === null ? t('All worlds') : value);
    button.type = 'button';
    button.addEventListener('click', () => { world = value; update(); });
    buttons.push([button, value]);
    filters.append(button);
  });
  search.addEventListener('input', update);
  toolbar.append(search, filters);
  main.append(toolbar, status, grid);
  update();
}

function allArtwork() {
  return content.characters.flatMap(character => character.gallery.map(art => ({ character, art })));
}

function showArtwork(art, character, chapter) {
  const dialog = node('dialog');
  const top = node('div', 'dialog-top');
  const title = node('h2', '', art.title);
  title.id = 'artwork-title';
  dialog.setAttribute('aria-labelledby', title.id);
  const close = node('button', 'close', t('Close'));
  close.type = 'button';
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      dialog.close();
    }
  });
  top.append(title, close);
  dialog.append(top, image(art.src, art.alt, '', false), linkedCharacterNav(art, 'gallery'),
    node('p', '', `${t('Art by {credit}', { credit: art.credit })} · ${art.date}`));
  dialog.append(projectLinks(art));
  if (chapter) dialog.append(link(chapter.title, chapterUrl(character, chapter), 'text-link'));
  dialog.addEventListener('close', () => { dialog.remove(); activeDialog = undefined; }, { once: true });
  document.body.append(dialog);
  activeDialog = dialog;
  dialog.showModal();
}

function gallery(items) {
  const grid = node('div', 'gallery-grid');
  items.forEach(({ character, art, chapter }) => {
    const figure = node('figure', 'gallery-item');
    const button = node('button', 'gallery-open');
    button.type = 'button';
    button.setAttribute('aria-label', t('View {title} by {credit}', { title: art.title, credit: art.credit }));
    const caption = node('span', 'gallery-caption');
    caption.append(node('strong', '', art.title), node('span', '', `${linkedCharacterNames(art)} · ${art.credit}`));
    button.append(image(art.src, art.alt), caption);
    button.addEventListener('click', () => showArtwork(art, character, chapter));
    figure.append(button, linkedCharacterNav(art, 'gallery'), projectLinks(art));
    grid.append(figure);
  });
  if (!items.length) grid.append(node('p', 'empty', t('No artwork yet. This gallery is waiting for its first piece.')));
  return grid;
}

function breadcrumbs(items) {
  const nav = node('nav', 'breadcrumbs');
  nav.setAttribute('aria-label', t('Breadcrumb'));
  items.forEach(([text, url], index) => {
    if (index) nav.append(node('span', '', '/'));
    nav.append(url ? link(text, url) : node('span', '', text));
  });
  return nav;
}

function characterLinks(character) {
  const links = node('nav', 'character-links');
  links.setAttribute('aria-label', t('Explore {name}', { name: character.name }));
  links.append(link(t('Chapters'), characterUrl(character, 'stories'), 'text-link'),
    link(t('Gallery'), characterUrl(character, 'gallery'), 'text-link'));
  return links;
}

let diagramNumber = 0;

function relationshipDiagram(current) {
  const relationships = content.relationships.filter(relationship =>
    !current || relationship.from === current.id || relationship.to === current.id);
  const connected = new Set(relationships.flatMap(relationship => [relationship.from, relationship.to]));
  const characters = content.characters.filter(character => !current || character.id === current.id || connected.has(character.id));
  const wrapper = node('section', 'relationship-atlas');
  wrapper.setAttribute('aria-label', t('Character relationship diagram'));
  wrapper.append(node('p', 'diagram-help', t('Hover or focus a line to read its story. Tap to keep it open. Select a portrait to explore.')));
  wrapper.querySelector('.diagram-help').append(document.createTextNode(` ${t('Use the mouse wheel to zoom. Drag empty space to pan. Ctrl/Command + wheel keeps browser zoom. There is nothing to pan when the map fits.')}`));
  if (!relationships.length) {
    wrapper.append(node('p', 'empty', t('No relationships recorded yet.')));
  }
  if (!characters.length) return wrapper;
  const viewport = node('div', 'diagram-viewport');
  viewport.tabIndex = 0;
  viewport.setAttribute('role', 'region');
  viewport.setAttribute('aria-label', t('Relationship map. Scroll horizontally to explore.'));
  const canvas = node('div', 'diagram-canvas');
  // Keep portrait cards readable as the cast grows; scrolling stays inside the map.
  const radius = Math.max(220, characters.length * 280 / (2 * Math.PI));
  const width = characters.length > 2 ? Math.ceil(radius * 2 + 260) : 720;
  const height = characters.length > 2 ? Math.ceil(radius * 2 + 280) : 400;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const stage = node('div', 'diagram-stage');
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
  const toolbar = node('div', 'diagram-toolbar');
  toolbar.setAttribute('role', 'group');
  toolbar.setAttribute('aria-label', t('Map zoom'));
  const zoomValue = node('output', 'diagram-zoom-value', '100%');
  zoomValue.setAttribute('aria-live', 'polite');
  zoomValue.setAttribute('aria-label', t('Zoom level'));
  let scale = 1;
  const minimumScale = 0.1;
  const maximumScale = 2;
  function setZoom(value, clientX, clientY) {
    const next = Math.max(minimumScale, Math.min(maximumScale, value));
    const viewBounds = viewport.getBoundingClientRect();
    const stageBounds = stage.getBoundingClientRect();
    const anchorX = clientX ?? viewBounds.left + viewport.clientLeft + viewport.clientWidth / 2;
    const anchorY = clientY ?? viewBounds.top + viewport.clientTop + viewport.clientHeight / 2;
    const centerX = (anchorX - stageBounds.left) / scale;
    const centerY = (anchorY - stageBounds.top) / scale;
    scale = next;
    canvas.style.transform = `scale(${scale})`;
    stage.style.width = `${width * scale}px`;
    stage.style.height = `${height * scale}px`;
    zoomValue.value = `${Math.round(scale * 100)}%`;
    zoomOut.disabled = scale <= minimumScale;
    zoomIn.disabled = scale >= maximumScale;
    const nextBounds = stage.getBoundingClientRect();
    viewport.scrollLeft += nextBounds.left + centerX * scale - anchorX;
    viewport.scrollTop += nextBounds.top + centerY * scale - anchorY;
  }
  function zoomButton(label, text, action) {
    const button = node('button', 'diagram-control', text);
    button.type = 'button';
    button.setAttribute('aria-label', t(label));
    button.title = t(label);
    button.addEventListener('click', action);
    return button;
  }
  const zoomOut = zoomButton('Zoom out', '−', () => setZoom(scale / 1.25));
  const zoomIn = zoomButton('Zoom in', '+', () => setZoom(scale * 1.25));
  const reset = zoomButton('Reset zoom', t('Reset zoom'), () => setZoom(1));
  const fit = zoomButton('Fit map', t('Fit map'), () => {
    setZoom(Math.min(1, (viewport.clientWidth - 16) / width, (viewport.clientHeight - 16) / height));
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
  });
  toolbar.append(node('span', 'diagram-toolbar-title', t('Threads of fate')), zoomOut, zoomValue, zoomIn, fit, reset);
  viewport.addEventListener('keydown', event => {
    if (event.target !== viewport || event.ctrlKey || event.metaKey || event.altKey) return;
    if (['+', '=', '-', '0'].includes(event.key)) {
      event.preventDefault();
      if (event.key === '0') setZoom(1);
      else setZoom(event.key === '-' ? scale / 1.25 : scale * 1.25);
    }
  });
  viewport.addEventListener('wheel', event => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.target.closest('.relationship-tooltip')) return;
    if (!event.deltaY) return;
    event.preventDefault();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1);
    setZoom(scale * Math.exp(-Math.max(-120, Math.min(120, delta)) * 0.002), event.clientX, event.clientY);
  }, { passive: false });
  let drag;
  let suppressClick = false;
  function endDrag(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const id = drag.id;
    drag = undefined;
    viewport.classList.remove('is-dragging');
    if (viewport.hasPointerCapture(id)) viewport.releasePointerCapture(id);
  }
  viewport.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || drag) return;
    suppressClick = false;
    if (event.target.closest('a, button, .relationship-edge, .relationship-tooltip')) return;
    const bounds = viewport.getBoundingClientRect();
    if (event.clientX >= bounds.left + viewport.clientLeft + viewport.clientWidth ||
        event.clientY >= bounds.top + viewport.clientTop + viewport.clientHeight) return;
    event.preventDefault();
    viewport.focus({ preventScroll: true });
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY,
      left: viewport.scrollLeft, top: viewport.scrollTop };
    viewport.setPointerCapture(event.pointerId);
  });
  viewport.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    if (!(event.buttons & 1)) { endDrag(event); return; }
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!suppressClick && Math.hypot(dx, dy) < 4) return;
    suppressClick = true;
    viewport.classList.add('is-dragging');
    hide();
    viewport.scrollLeft = drag.left - dx;
    viewport.scrollTop = drag.top - dy;
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => viewport.addEventListener(type, endDrag));
  viewport.addEventListener('click', event => {
    if (!suppressClick || event.detail === 0) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClick = false;
  }, true);
  const positions = new Map(characters.map((character, index) => {
    const angle = -Math.PI / 2 + index * 2 * Math.PI / characters.length;
    const position = characters.length === 1 ? { x: width / 2, y: height / 2 } :
      characters.length === 2 ? { x: index ? width - 150 : 150, y: height / 2 } :
      { x: width / 2 + radius * Math.cos(angle), y: height / 2 + radius * Math.sin(angle) };
    return [character.id, position];
  }));
  const svgNode = (tag, attributes = {}) => {
    const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
    return element;
  };
  const svg = svgNode('svg', { viewBox: `0 0 ${width} ${height}`, width, height, class: 'relationship-lines',
    role: 'group', 'aria-label': t('Relationships') });
  const orbits = svgNode('g', { class: 'diagram-orbits', 'aria-hidden': 'true' });
  [0.46, 0.66, 0.86].forEach(fraction => orbits.append(svgNode('ellipse', {
    cx: width / 2, cy: height / 2, rx: width * fraction / 2, ry: height * fraction / 2
  })));
  svg.append(orbits);
  const tooltip = node('div', 'relationship-tooltip');
  tooltip.id = `relationship-tooltip-${++diagramNumber}`;
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  let pinned;
  let active;
  const edges = [];
  function hide() {
    tooltip.hidden = true;
    edges.forEach(edge => {
      edge.classList.remove('is-active');
      edge.setAttribute('aria-pressed', 'false');
      edge.removeAttribute('aria-describedby');
    });
    active = undefined;
    pinned = undefined;
  }
  function show(edge, relationship, from, to, midpoint) {
    active = edge;
    edges.forEach(item => {
      item.classList.toggle('is-active', item === edge);
      item.setAttribute('aria-pressed', String(item === pinned));
      item.removeAttribute('aria-describedby');
    });
    tooltip.replaceChildren(node('span', 'eyebrow', `${from.name} ↔ ${to.name}`),
      node('strong', '', relationship.label), node('p', '', relationship.description));
    tooltip.style.left = `${Math.max(16, Math.min(width - 296, midpoint.x - 140))}px`;
    tooltip.style.bottom = `${height - midpoint.y + 14}px`;
    tooltip.style.maxHeight = `${Math.max(100, Math.min(230, midpoint.y - 30))}px`;
    tooltip.hidden = false;
    edge.setAttribute('aria-describedby', tooltip.id);
  }
  relationships.forEach((relationship, index) => {
    const from = content.characters.find(character => character.id === relationship.from);
    const to = content.characters.find(character => character.id === relationship.to);
    const start = positions.get(from.id);
    const end = positions.get(to.id);
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    const offset = index % 2 ? -55 : 55;
    const control = { x: (start.x + end.x) / 2 - (end.y - start.y) / length * offset,
      y: (start.y + end.y) / 2 + (end.x - start.x) / length * offset };
    const midpoint = { x: (start.x + 2 * control.x + end.x) / 4, y: (start.y + 2 * control.y + end.y) / 4 };
    const path = `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`;
    const edge = svgNode('g', { class: 'relationship-edge', role: 'button', tabindex: 0,
      'aria-pressed': 'false', 'aria-label': `${from.name} ↔ ${to.name}: ${relationship.label}. ${relationship.description}` });
    edge.append(svgNode('path', { d: path, class: 'edge-glow' }),
      svgNode('path', { d: path, class: 'edge-stroke' }),
      svgNode('path', { d: path, class: 'edge-hit' }),
      svgNode('circle', { cx: midpoint.x, cy: midpoint.y, r: 14, class: 'edge-jewel' }));
    const jewel = svgNode('text', { x: midpoint.x, y: midpoint.y + 5, 'text-anchor': 'middle', class: 'edge-symbol', 'aria-hidden': 'true' });
    jewel.textContent = '✦';
    edge.append(jewel);
    const labelWidth = Math.min(210, Math.max(100, [...relationship.label].length * 9 + 24));
    const caption = svgNode('text', { x: midpoint.x, y: midpoint.y + 43, 'text-anchor': 'middle',
      class: 'edge-label', 'aria-hidden': 'true' });
    caption.textContent = relationship.label;
    edge.append(svgNode('rect', { x: midpoint.x - labelWidth / 2, y: midpoint.y + 25,
      width: labelWidth, height: 27, rx: 12, class: 'edge-label-backdrop', 'aria-hidden': 'true' }), caption);
    const reveal = () => {
      if (pinned && pinned !== edge) pinned = undefined;
      show(edge, relationship, from, to, midpoint);
    };
    edge.addEventListener('pointerenter', reveal);
    edge.addEventListener('focus', reveal);
    edge.addEventListener('pointerleave', event => {
      if (!pinned && document.activeElement !== edge && !tooltip.contains(event.relatedTarget)) hide();
    });
    edge.addEventListener('blur', () => { if (!pinned) hide(); });
    const toggle = () => {
      if (pinned === edge) hide();
      else { pinned = edge; reveal(); }
    };
    edge.addEventListener('click', toggle);
    edge.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); }
    });
    edges.push(edge);
    svg.append(edge);
  });
  tooltip.addEventListener('pointerleave', event => {
    if (!pinned && document.activeElement !== active && !active?.contains(event.relatedTarget)) hide();
  });
  canvas.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); hide(); }
  });
  canvas.addEventListener('click', event => {
    if (event.target === canvas || event.target === svg) hide();
  });
  canvas.append(svg);
  characters.forEach(character => {
    const position = positions.get(character.id);
    const card = node('article', `relationship-character${current?.id === character.id ? ' is-current' : ''}`);
    card.style.left = `${position.x}px`;
    card.style.top = `${position.y}px`;
    const portrait = link('', characterUrl(character), 'relationship-portrait');
    portrait.append(image(character.portrait, character.portraitAlt), node('strong', '', character.name));
    card.append(portrait);
    canvas.append(card);
  });
  canvas.append(tooltip);
  stage.append(canvas);
  viewport.append(stage);
  wrapper.append(toolbar, viewport);
  return wrapper;
}

function participation(character) {
  const section = node('section', 'participation');
  section.append(node('h2', '', t('Creative journeys')));
  const grid = node('div', 'participation-grid');
  [['artProjects', 'Creative Projects'], ['trpgScenarios', 'TRPG Scenarios']].forEach(([key, title]) => {
    const group = node('section', 'participation-group');
    group.append(node('h3', '', t(title)));
    const entries = node('div', 'participation-entries');
    character[key].forEach(entry => {
      const card = node('article', 'participation-entry');
      const project = content.projects.find(project => project.id === entry.id);
      card.append(link(project.title, `#/project/${encodeURIComponent(entry.id)}`, 'text-link'), node('p', '', entry.description));
      if (project.url) {
        const destination = link(t('Project details →'), project.url, 'text-link');
        destination.target = '_blank';
        destination.rel = 'noopener noreferrer';
        card.append(destination);
      }
      entries.append(card);
    });
    group.append(entries);
    grid.append(group);
  });
  section.append(grid);
  return section;
}

function projectLinks(item) {
  if (!item.projectIds?.length) return document.createDocumentFragment();
  const links = node('nav', 'project-links');
  links.setAttribute('aria-label', t('Projects / TRPG'));
  (item.projectIds || []).forEach(id => {
    const project = content.projects.find(project => project.id === id);
    links.append(link(project.title, `#/project/${encodeURIComponent(id)}`, 'tag'));
  });
  return links;
}

function projectDirectory(kind) {
  main.append(heading(t('Creative journeys'), t(kind === 'creative' ? 'Creative Projects' : 'TRPG')));
  const grid = node('div', 'grid');
  const projects = content.projects.filter(project => project.kind === kind);
  projects.forEach(project => {
    const card = link('', `#/project/${encodeURIComponent(project.id)}`, 'participation-entry');
    card.append(node('span', 'eyebrow', t(project.kind === 'creative' ? 'Creative Projects' : 'TRPG Scenarios')),
      node('h2', '', project.title), node('p', '', project.description));
    grid.append(card);
  });
  if (!projects.length) grid.append(node('p', 'empty', t(kind === 'creative' ? 'No projects yet.' : 'No TRPG scenarios yet.')));
  main.append(grid);
}

function projectPage(project, requested = { stories: 1, gallery: 1 }) {
  main.append(breadcrumbs([[t(project.kind === 'creative' ? 'Creative Projects' : 'TRPG'), project.kind === 'creative' ? '#/projects' : '#/trpg'], [project.title]]),
    heading(t(project.kind === 'creative' ? 'Creative Projects' : 'TRPG Scenarios'), project.title, project.description));
  if (project.url) {
    const external = link(t('Project details →'), project.url, 'text-link');
    external.target = '_blank';
    external.rel = 'noopener noreferrer';
    main.append(external);
  }
  const key = project.kind === 'creative' ? 'artProjects' : 'trpgScenarios';
  const participants = content.characters.filter(character => character[key].some(entry => entry.id === project.id));
  const pictures = allArtwork().filter(({ art }) => art.projectIds.includes(project.id));
  content.characters.forEach(character => character.chapters.filter(chapter => chapter.projectIds.includes(project.id)).forEach(chapter => {
    chapter.blocks.forEach((block, index) => {
      if (block.type === 'image') pictures.push({
        character, chapter,
        art: { src: block.src, alt: block.alt, title: `${chapter.title} · ${index + 1}`,
          credit: chapter.credit, date: chapter.date, projectIds: chapter.projectIds, characterIds: chapter.characterIds }
      });
    });
  }));
  const stories = linkedStoryItems(content.characters, chapter => chapter.projectIds.includes(project.id));
  const pageSize = 6;
  const pages = { stories: Math.max(1, Math.ceil(stories.length / pageSize)),
    gallery: Math.max(1, Math.ceil(pictures.length / pageSize)) };
  const currentPage = { stories: project.kind === 'creative' ? Math.min(requested.stories, pages.stories) : 1,
    gallery: Math.min(requested.gallery, pages.gallery) };
  const pageUrl = (section, number) => {
    const values = { ...currentPage, [section]: number };
    const params = new URLSearchParams();
    if (values.stories > 1 && project.kind === 'creative') params.set('stories', values.stories);
    if (values.gallery > 1) params.set('gallery', values.gallery);
    const query = params.toString();
    return `#/project/${encodeURIComponent(project.id)}${query ? `?${query}` : ''}`;
  };
  if (currentPage.stories !== requested.stories || currentPage.gallery !== requested.gallery) {
    history.replaceState(null, '', pageUrl('gallery', currentPage.gallery));
  }
  const paginated = (items, section, render) => {
    const page = currentPage[section];
    const start = (page - 1) * pageSize;
    const visible = items.slice(start, start + pageSize);
    const group = node('section', `project-${section}`);
    const label = t(section === 'stories' ? 'Stories' : 'Gallery');
    group.append(node('h2', '', label), node('p', 'collection-summary',
      t('Showing {start}–{end} of {total} works', {
        start: items.length ? start + 1 : 0, end: start + visible.length, total: items.length
      })), render(visible), paginationControls(page, pages[section], number => pageUrl(section, number), label));
    return group;
  };
  const layout = node('div', 'trpg-overview');
  const people = node('section', 'trpg-participants');
  const icons = node('div', 'trpg-participant-list');
  participants.forEach(character => {
    const item = link('', characterUrl(character), 'trpg-participant');
    item.append(image(character.portrait, '', 'trpg-participant-avatar'), node('span', '', character.name));
    icons.append(item);
  });
  if (!participants.length) icons.append(node('p', 'empty', t('No participants yet.')));
  people.append(node('h2', '', t('Participating characters')), icons);
  layout.append(people);
  if (project.kind === 'trpg') {
    const recordSection = node('section', 'trpg-record-section');
    const records = node('ul', 'trpg-records');
    project.records.forEach(record => {
      const row = node('li');
      const external = link(record.title, record.url, 'text-link');
      external.target = '_blank';
      external.rel = 'noopener noreferrer';
      row.append(external);
      records.append(row);
    });
    if (!project.records.length) records.append(node('li', '', t('No records yet.')));
    recordSection.append(node('h2', '', t('Records')), records);
    layout.append(recordSection);
  } else {
    layout.append(paginated(stories, 'stories', storyItems));
  }
  main.append(layout, paginated(pictures, 'gallery', gallery));
}

function profile(character, tab, requestedPage = 1) {
  main.append(breadcrumbs([[t('Characters'), '#/characters'], [character.name]]));
  const layout = node('div', 'profile');
  const sidebar = node('aside', 'profile-sidebar');
  sidebar.append(image(character.portrait, character.portraitAlt, 'profile-portrait', false),
    node('h1', '', character.name), tags(character.tags), node('p', '', character.summary));
  const facts = node('dl', 'facts');
  Object.entries(character.facts).forEach(([label, value]) => {
    const row = node('div', 'fact');
    row.append(node('dt', '', label), node('dd', '', value));
    facts.append(row);
  });
  sidebar.append(facts, characterLinks(character));
  const body = node('section');
  const tabs = node('nav', 'tabs');
  tabs.setAttribute('aria-label', t('Character sections'));
  [['about', 'About'], ['gallery', 'Gallery'], ['stories', 'Chapters'], ['exchanges', 'Creative exchanges'], ['commissions', 'Commissions']].forEach(([id, label]) => {
    const item = link(t(label), characterUrl(character, id));
    if (tab === id) item.setAttribute('aria-current', 'page');
    tabs.append(item);
  });
  body.append(tabs);
  if (tab === 'about') {
    const prose = node('div', 'prose');
    character.about.forEach(part => prose.append(node('h2', '', part.title), node('p', '', part.text)));
    body.append(prose);
    if (character.youtubeUrl) {
      const frame = node('iframe', 'character-video');
      frame.src = `https://www.youtube-nocookie.com/embed/${youtubeVideoId(character.youtubeUrl)}`;
      frame.title = t('Character video');
      frame.loading = 'lazy';
      frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      frame.allowFullscreen = true;
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      body.append(frame);
    }
    body.append(participation(character));
  } else {
    const items = tab === 'exchanges' ? content.characters.flatMap(owner => owner.exchanges
      .filter(exchange => exchange.characterIds.includes(character.id)).map(exchange => ({ character: owner, exchange }))) :
      tab === 'gallery' ? allArtwork().filter(({ art }) => art.characterIds.includes(character.id)) :
      tab === 'commissions' ? content.characters.flatMap(owner => owner.commissions
      .filter(commission => commission.characterIds.includes(character.id))
      .map(commission => ({ character: owner, commission }))) :
      linkedStoryItems([character]);
    const pageSize = 6;
    const pages = Math.max(1, Math.ceil(items.length / pageSize));
    const page = Math.min(requestedPage, pages);
    const pageUrl = number => `${characterUrl(character, tab)}${number === 1 ? '' : `/page/${number}`}`;
    if (page !== requestedPage) history.replaceState(null, '', pageUrl(page));
    const start = (page - 1) * pageSize;
    const visible = items.slice(start, start + pageSize);
    if (tab !== 'gallery') body.append(node('h2', '', t(tab === 'exchanges' ? 'Creative exchanges' : tab === 'commissions' ? 'Commissions' : 'The story so far')));
    body.append(node('p', 'collection-summary', t('Showing {start}–{end} of {total} works', {
      start: items.length ? start + 1 : 0, end: start + visible.length, total: items.length
    })));
    body.append(tab === 'exchanges' ? exchangeList(visible) : tab === 'gallery' ? gallery(visible) : tab === 'commissions' ? commissionList(visible) : storyItems(visible),
      paginationControls(page, pages, pageUrl));
  }
  layout.append(sidebar, body);
  main.append(layout);
  const relationships = node('section', 'section profile-relationships');
  const header = node('div', 'section-head');
  header.append(node('h2', '', t('Relationships')), link(t('View all →'), '#/relationships', 'text-link'));
  relationships.append(header, relationshipDiagram(character));
  main.append(relationships);
}

function reader(character, chapter) {
  main.append(breadcrumbs([[t('Characters'), '#/characters'], [character.name, characterUrl(character, 'stories')], [chapter.title]]));
  const article = node('article', 'reader');
  const index = character.chapters.indexOf(chapter);
  const header = node('header', 'reader-header');
  header.append(node('span', 'eyebrow', `${linkedCharacterNames(chapter)} · ${t('Chapter {number}', { number: index + 1 })}`),
    node('h1', '', chapter.title), node('span', 'tiny', `${chapter.date} · ${chapter.credit}`));
  header.append(linkedCharacterNav(chapter, 'stories'));
  const prose = node('div', 'prose');
  chapter.paragraphs.forEach(paragraph => prose.append(node('p', '', paragraph)));
  chapter.blocks.forEach(block => {
    if (block.type === 'text') prose.append(node('p', '', block.text));
    else {
      const figure = node('figure', 'story-illustration');
      figure.append(image(block.src, block.alt));
      if (block.caption) figure.append(node('figcaption', '', block.caption));
      prose.append(figure);
    }
  });
  article.classList.toggle('manga-reader', chapter.format === 'manga');
  const nav = node('nav', 'reader-nav');
  nav.setAttribute('aria-label', t('Chapter navigation'));
  if (index > 0) nav.append(link(t('← Previous chapter'), chapterUrl(character, character.chapters[index - 1]), 'text-link'));
  nav.append(link(t('All chapters'), characterUrl(character, 'stories'), 'text-link'));
  if (index < character.chapters.length - 1) nav.append(link(t('Next chapter →'), chapterUrl(character, character.chapters[index + 1]), 'text-link'));
  article.append(header, projectLinks(chapter), prose, nav);
  main.append(article);
}

function notFound() {
  main.append(heading(t('A path not yet drawn'), t('Page not found'), t('This character, chapter, or page does not exist.')), link(t('Back to the atelier'), '#/', 'button'));
  return t('Page not found');
}

function route(focus = true) {
  if (!content) return;
  if (window.AtelierEditor.isBusy) {
    if (location.hash !== '#/admin') {
      location.replace('#/admin');
      window.AtelierEditor.notifyBusy();
    }
    return;
  }
  languageControl.disabled = location.hash === '#/admin';
  if (activeDialog) activeDialog.close();
  main.replaceChildren();
  main.classList.remove('collection-view', 'collection-stories', 'collection-gallery', 'collection-manga', 'collection-commissions', 'collection-exchanges');
  let parts;
  let query;
  try {
    const hash = location.hash.slice(1) || '/';
    const queryIndex = hash.indexOf('?');
    query = queryIndex < 0 ? '' : hash.slice(queryIndex + 1);
    parts = (queryIndex < 0 ? hash : hash.slice(0, queryIndex)).split('/').filter(Boolean).map(decodeURIComponent);
  } catch (error) {
    if (!(error instanceof URIError)) throw error;
    parts = ['invalid-route'];
  }
  let title = t('Discover');
  let nav = parts[0] || 'home';
  if (parts.length === 1 && parts[0] === 'admin') {
    window.AtelierEditor.render({
      main, cloud, getPayload: () => ({ schemaVersion: 1, locales: Object.fromEntries(supportedLanguages.map(code => [code, catalogues[code].content])) }),
      getVersion: () => cloudVersion,
      validate: validateArchive,
      apply: (payload, version) => {
        validateArchive(payload);
        supportedLanguages.forEach(code => { catalogues[code].content = payload.locales[code]; });
        cloudVersion = version;
        content = catalogues[language].content;
        translateShell();
      }
    });
    title = t('Manage website');
  }
  else if (!parts.length) home();
  else if (parts.length === 1 && parts[0] === 'characters') { characters(); title = t('Characters'); }
  else if (parts.length === 1 && parts[0] === 'projects') { projectDirectory('creative'); title = t('Creative Projects'); }
  else if (parts.length === 1 && parts[0] === 'trpg') { projectDirectory('trpg'); title = t('TRPG'); }
  else if (parts.length === 2 && parts[0] === 'project') {
    const project = content.projects.find(project => project.id === parts[1]);
    const params = new URLSearchParams(query);
    const valid = [...params.keys()].every(key => ['stories', 'gallery'].includes(key) && params.getAll(key).length === 1 &&
      /^[1-9]\d*$/.test(params.get(key)) && Number.isSafeInteger(Number(params.get(key))));
    if (project && valid) {
      projectPage(project, { stories: Number(params.get('stories') || 1), gallery: Number(params.get('gallery') || 1) });
      title = project.title; nav = project.kind === 'creative' ? 'projects' : 'trpg';
    }
    else title = notFound();
  }
  else if (['stories', 'gallery', 'manga', 'commissions', 'exchanges'].includes(parts[0]) &&
      (parts.length === 1 || (parts.length === 3 && parts[1] === 'page' && /^[1-9]\d*$/.test(parts[2]) && Number.isSafeInteger(Number(parts[2]))))) {
    const kind = parts[0] === 'manga' ? 'stories' : parts[0];
    if (parts[0] === 'manga') history.replaceState(null, '', '#/stories');
    collectionPage(kind, parts[0] === 'manga' || parts.length === 1 ? 1 : Number(parts[2]));
    title = t({ stories: 'Stories', gallery: 'Gallery', commissions: 'Commissions', exchanges: 'Creative exchanges' }[kind]);
    nav = kind;
  }
  else if (parts.length === 1 && parts[0] === 'relationships') {
    main.append(heading(t('Threads of fate'), t('Relationships'), t('Every meeting leaves a thread. Follow it into their worlds.')), relationshipDiagram());
    title = t('Relationships');
  }
  else if (parts[0] === 'character' && (parts.length === 2 || parts.length === 3 ||
      (parts.length === 5 && parts[3] === 'page' && /^[1-9]\d*$/.test(parts[4]) && Number.isSafeInteger(Number(parts[4]))))) {
    const character = content.characters.find(item => item.id === parts[1]);
    const oldManga = parts[2] === 'manga';
    const tab = oldManga ? 'stories' : parts[2] || 'about';
    if (character && ['about', 'gallery', 'stories', 'commissions', 'exchanges'].includes(tab) &&
        (parts.length !== 5 || tab !== 'about')) {
      if (oldManga) history.replaceState(null, '', characterUrl(character, 'stories'));
      profile(character, tab, !oldManga && parts.length === 5 ? Number(parts[4]) : 1);
      title = character.name; nav = 'characters';
    }
    else title = notFound();
  } else if (parts[0] === 'exchange' && parts.length === 3) {
    const character = content.characters.find(item => item.id === parts[1]);
    const exchange = character?.exchanges.find(item => item.id === parts[2]);
    if (exchange) { exchangePage(character, exchange); title = exchange.title; nav = 'exchanges'; }
    else title = notFound();
  } else if (parts[0] === 'commission' && parts.length === 3) {
    const character = content.characters.find(item => item.id === parts[1]);
    const commission = character?.commissions.find(item => item.id === parts[2]);
    if (commission) { commissionPage(character, commission); title = commission.title; nav = 'commissions'; }
    else title = notFound();
  } else if (parts[0] === 'story' && parts.length === 3) {
    const character = content.characters.find(item => item.id === parts[1]);
    const chapter = character?.chapters.find(item => item.id === parts[2]);
    if (chapter) { reader(character, chapter); title = chapter.title; nav = 'stories'; }
    else title = notFound();
  } else title = notFound();
  document.title = `${title} · Character Atelier`;
  document.querySelectorAll('[data-nav]').forEach(item => {
    if (item.dataset.nav === nav) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
  if (focus) { main.focus(); window.scrollTo(0, 0); }
}

// Never interpret repository or cloud content as HTML.
function upgradeContent(data) {
  if (!data || !Array.isArray(data.characters)) return data;
  if (data.projects === undefined) {
    data.projects = [];
    data.characters.forEach(character => {
      [['artProjects', 'creative'], ['trpgScenarios', 'trpg']].forEach(([key, kind]) => {
        (character[key] || []).forEach(entry => {
          if (!data.projects.some(project => project.id === entry.id)) data.projects.push({
            id: entry.id, kind, title: entry.title, description: entry.description, ...(entry.url ? { url: entry.url } : {})
          });
        });
      });
    });
  }
  data.characters.forEach(character => {
    if (character.youtubeUrl === undefined) character.youtubeUrl = '';
    if (character.commissions === undefined) character.commissions = [];
    if (character.exchanges === undefined) character.exchanges = [];
    (character.gallery || []).forEach((art, index) => {
      if (art.id === undefined) art.id = `art-${character.id}-${index + 1}`;
      if (art.characterIds === undefined) art.characterIds = [character.id];
      if (art.projectIds === undefined) art.projectIds = [];
    });
    character.commissions.forEach(commission => {
      if (commission.characterIds === undefined) commission.characterIds = [character.id];
    });
    (character.chapters || []).forEach(chapter => {
      if (chapter.characterIds === undefined) chapter.characterIds = [character.id];
      if (chapter.projectIds === undefined) chapter.projectIds = [];
      if (chapter.format === undefined) chapter.format = 'prose';
      if (chapter.blocks === undefined) chapter.blocks = [];
    });
  });
  if (Array.isArray(data.projects)) data.projects.forEach(project => {
    if (project && project.records === undefined) project.records = [];
  });
  return data;
}

function validateContent(data, allowIncomplete = false) {
  upgradeContent(data);
  const require = (condition, message) => { if (!condition) throw new Error(`Content error: ${message}`); };
  const text = value => typeof value === 'string' && (allowIncomplete || value.trim().length > 0);
  const texts = values => Array.isArray(values) && values.every(text);
  const asset = value => (allowIncomplete && typeof value === 'string') || (text(value) && /^assets\/[a-zA-Z0-9_./-]+\.(svg|png|jpe?g|webp|gif|avif)$/i.test(value) &&
    !value.split('/').includes('..')) || cloud.imageAllowed(value);
  const id = value => text(value) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
  const validUrl = value => {
    try { const url = new URL(value); return typeof value === 'string' && url.protocol === 'https:' && !url.username && !url.password; }
    catch { return false; }
  };
  require(data && typeof data === 'object', 'expected a JSON object.');
  require(Array.isArray(data.projects), 'projects must be an array.');
  const projectIds = new Set();
  data.projects.forEach(project => {
    require(project && id(project.id) && !projectIds.has(project.id) && ['creative', 'trpg'].includes(project.kind) &&
      text(project.title) && text(project.description) &&
      (project.url === undefined || (allowIncomplete ? typeof project.url === 'string' : validUrl(project.url))), 'invalid or duplicate project.');
    require(Array.isArray(project.records) && project.records.every(record => record && text(record.title) &&
      typeof record.url === 'string' && (allowIncomplete || validUrl(record.url))), 'invalid TRPG record.');
    projectIds.add(project.id);
  });
  const references = values => Array.isArray(values) && values.every(value => projectIds.has(value)) && new Set(values).size === values.length;
  require(data.site && ['eyebrow', 'title', 'description', 'heroAlt', 'noteTitle', 'note'].every(key => text(data.site[key])) &&
    asset(data.site.heroImage), 'site fields must contain text and a local heroImage.');
  require(Array.isArray(data.characters), 'characters must be an array.');
  const ids = new Set();
  data.characters.forEach((character, index) => {
    const label = `character ${index + 1}`;
    require(character && typeof character === 'object', `${label} must be an object.`);
    require(id(character.id) && !ids.has(character.id), `${label} needs a unique lowercase, hyphenated id.`);
    ids.add(character.id);
    require(['name', 'world', 'summary', 'portraitAlt'].every(key => text(character[key])) &&
      asset(character.portrait) && texts(character.tags), `${label} has invalid profile fields.`);
    require(typeof character.youtubeUrl === 'string' && (!character.youtubeUrl || allowIncomplete || youtubeVideoId(character.youtubeUrl)),
      `${label} YouTube URL must link to a valid HTTPS YouTube video.`);
    require(character.facts && typeof character.facts === 'object' && !Array.isArray(character.facts) &&
      Object.entries(character.facts).every(([key, value]) => text(key) && text(value)), `${label} facts must be text key/value pairs.`);
    require(Array.isArray(character.about) && character.about.every(part => part && text(part.title) && text(part.text)),
      `${label} about must contain title/text sections.`);
    ['artProjects', 'trpgScenarios'].forEach(key => {
      require(Array.isArray(character[key]), `${label} ${key} must be an array (use [] if none).`);
      const entryIds = new Set();
      character[key].forEach(entry => {
        require(entry && id(entry.id) && !entryIds.has(entry.id) && text(entry.description) &&
          (entry.title === undefined || typeof entry.title === 'string'),
          `${label} ${key} entries need unique project IDs and participation descriptions.`);
        entryIds.add(entry.id);
        require(data.projects.some(project => project.id === entry.id && project.kind === (key === 'artProjects' ? 'creative' : 'trpg')),
          `${label} participation references an unknown project or wrong category.`);
        if (entry.url !== undefined && !allowIncomplete) {
          let url;
          try { url = new URL(entry.url); }
          catch (error) {
            if (!(error instanceof TypeError)) throw error;
            throw new Error(`Content error: ${label} ${key} contains an invalid URL.`);
          }
          require(typeof entry.url === 'string' && url.protocol === 'https:' && !url.username && !url.password,
            `${label} ${key} URLs must be HTTPS without credentials.`);
        }
        require(entry.url === undefined || typeof entry.url === 'string', `${label} ${key} URL must be text.`);
      });
    });
    const artworkIds = new Set();
    require(Array.isArray(character.gallery) && character.gallery.every(art => {
      const valid = art && id(art.id) && !artworkIds.has(art.id) &&
        ['title', 'alt', 'credit', 'date'].every(key => text(art[key])) && asset(art.src) && references(art.projectIds);
      if (valid) artworkIds.add(art.id);
      return valid;
    }), `${label} gallery contains invalid artwork.`);
    require(Array.isArray(character.commissions), `${label} commissions must be an array.`);
    const commissionIds = new Set();
    character.commissions.forEach(commission => {
      require(commission && id(commission.id) && !commissionIds.has(commission.id) && text(commission.title) &&
        text(commission.date) && ['text', 'src', 'alt', 'artistName', 'artistUrl'].every(key => typeof commission[key] === 'string') &&
        (!commission.src || (asset(commission.src) && text(commission.alt))) &&
        (!commission.artistUrl || allowIncomplete || validUrl(commission.artistUrl)) &&
        (allowIncomplete || Boolean(commission.src || commission.text.trim())),
      `${label} commission needs a unique ID, title, date, image with description or written work, and an optional HTTPS artist URL.`);
      commissionIds.add(commission.id);
    });
    require(Array.isArray(character.exchanges), `${label} exchanges must be an array.`);
    const exchangeIds = new Set();
    character.exchanges.forEach(exchange => {
      require(exchange && id(exchange.id) && !exchangeIds.has(exchange.id) && text(exchange.title) && text(exchange.date) &&
        Array.isArray(exchange.replies) && exchange.replies.every(reply => reply && text(reply.text)) &&
        (allowIncomplete || exchange.replies.length > 0),
      `${label} exchange needs a unique ID, title, date, and one or more replies.`);
      exchangeIds.add(exchange.id);
    });
    require(Array.isArray(character.chapters), `${label} chapters must be an array.`);
    const chapterIds = new Set();
    character.chapters.forEach(chapter => {
      require(chapter && id(chapter.id) && !chapterIds.has(chapter.id) &&
        ['title', 'credit', 'date'].every(key => text(chapter[key])) && texts(chapter.paragraphs) &&
        references(chapter.projectIds) && ['prose', 'illustrated', 'manga'].includes(chapter.format) &&
        Array.isArray(chapter.blocks), `${label} has an invalid or duplicate chapter.`);
      chapter.blocks.forEach(block => require(block && (block.type === 'text' ? text(block.text) :
        block.type === 'image' && asset(block.src) && text(block.alt) && typeof block.caption === 'string'),
      `${label} has an invalid story block.`));
      require(allowIncomplete || (chapter.format === 'prose' ? chapter.paragraphs.length > 0 && chapter.blocks.length === 0 :
        chapter.paragraphs.length === 0 && chapter.blocks.length > 0 && (chapter.format !== 'manga' ||
          chapter.blocks.every(block => block.type === 'image'))), `${label} story format requires text, illustrated blocks, or image-only manga pages.`);
      chapterIds.add(chapter.id);
    });
  });
  const linkedCharactersValid = values => Array.isArray(values) && values.length > 0 &&
    values.every(value => ids.has(value)) && new Set(values).size === values.length;
  data.characters.forEach(character => {
    ['gallery', 'chapters', 'commissions', 'exchanges'].forEach(key => character[key].forEach(entry => {
      require(linkedCharactersValid(entry.characterIds),
        `${character.id} ${key} items must link to one or more distinct existing characters.`);
    }));
  });
  require(Array.isArray(data.relationships), 'relationships must be an array (use [] if none).');
  const relationshipIds = new Set();
  const pairs = new Set();
  data.relationships.forEach(relationship => {
    require(relationship && id(relationship.id) && !relationshipIds.has(relationship.id) &&
      ids.has(relationship.from) && ids.has(relationship.to) && (allowIncomplete || relationship.from !== relationship.to) &&
      text(relationship.label) && text(relationship.description),
    'relationships need unique IDs, two distinct existing character IDs, a label, and a description.');
    const pair = [relationship.from, relationship.to].sort().join('/');
    require(allowIncomplete || !pairs.has(pair), `duplicate relationship between ${relationship.from} and ${relationship.to}; combine its descriptions.`);
    pairs.add(pair);
    relationshipIds.add(relationship.id);
  });
  return data;
}

window.addEventListener('hashchange', () => route());

function localizedContent(base, pack) {
  const require = (condition, message) => { if (!condition) throw new Error(`Translation error: ${message}`); };
  const fields = (source, keys) => {
    require(source && keys.every(key => Object.hasOwn(source, key)), `missing fields: ${keys.join(', ')}`);
    return Object.fromEntries(keys.map(key => [key, source[key]]));
  };
  require(pack && pack.ui && Object.values(pack.ui).every(value => typeof value === 'string' && value.trim()),
    'interface translations must be nonempty strings.');
  require(pack.characters && Object.keys(pack.characters).length === base.characters.length, 'character count differs from English.');
  require(pack.relationships && Object.keys(pack.relationships).length === base.relationships.length,
    'relationship count differs from English.');
  const translated = {
    site: { ...base.site, ...fields(pack.site, ['eyebrow', 'title', 'description', 'heroAlt', 'noteTitle', 'note']) },
    characters: base.characters.map(character => {
      const local = pack.characters[character.id];
      require(local, `missing character ${character.id}.`);
      require(Array.isArray(local.about) && local.about.length === character.about.length &&
        Array.isArray(local.gallery) && local.gallery.length === character.gallery.length &&
        local.chapters && Object.keys(local.chapters).length === character.chapters.length,
      `section, artwork, or chapter count differs for ${character.id}.`);
      return {
        ...character,
        ...fields(local, ['name', 'world', 'summary', 'portraitAlt', 'tags', 'facts', 'about']),
        ...Object.fromEntries(['artProjects', 'trpgScenarios'].map(key => {
          require(local[key] && typeof local[key] === 'object' && !Array.isArray(local[key]) &&
            Object.keys(local[key]).length === character[key].length, `${character.id} ${key} count differs from English.`);
          return [key, character[key].map(entry => ({
            ...entry, ...fields(local[key][entry.id], ['title', 'description'])
          }))];
        })),
        gallery: character.gallery.map((art, index) => ({
          ...art, ...fields(local.gallery[index], ['title', 'alt', 'credit'])
        })),
        commissions: character.commissions.map(commission => ({
          ...commission, ...fields(local.commissions?.[commission.id], ['title', 'alt', 'text'])
        })),
        exchanges: character.exchanges.map(exchange => ({
          ...exchange, ...fields(local.exchanges?.[exchange.id], ['title']),
          replies: exchange.replies.map((reply, index) => ({
            ...reply, ...fields(local.exchanges?.[exchange.id]?.replies?.[index], ['text'])
          }))
        })),
        chapters: character.chapters.map(chapter => ({
          ...chapter, ...fields(local.chapters[chapter.id], ['title', 'credit', 'paragraphs']),
          blocks: chapter.blocks.map((block, index) => ({
            ...block, ...fields(local.chapters[chapter.id].blocks?.[index], block.type === 'text' ? ['text'] : ['alt', 'caption'])
          }))
        }))
      };
    }),
    relationships: base.relationships.map(relationship => ({
      ...relationship, ...fields(pack.relationships[relationship.id], ['label', 'description'])
    }))
  };
  translated.projects = base.projects.map(project => {
    const key = project.kind === 'creative' ? 'artProjects' : 'trpgScenarios';
    const local = pack.projects?.[project.id] || translated.characters.flatMap(character => character[key]).find(entry => entry.id === project.id);
    return { ...project, ...fields(local, ['title', 'description']),
      records: project.records.map((record, index) => ({
        ...record, title: pack.projects?.[project.id]?.records?.[index]?.title || record.title
      })) };
  });
  return validateContent(translated);
}

async function loadJSON(path) {
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Could not load ${path} (HTTP ${response.status}).`);
  return response.json();
}

function validateArchive(payload, { allowIncomplete = false } = {}) {
  if (!payload || payload.schemaVersion !== 1 || !payload.locales) throw new Error('備份格式不正確。Invalid archive.');
  const structure = data => JSON.stringify({
    heroImage: data.site.heroImage,
    projects: data.projects.map(project => [project.id, project.kind, project.url, project.records.map(record => record.url)]),
    characters: data.characters.map(character => ({
      id: character.id, portrait: character.portrait, youtubeUrl: character.youtubeUrl,
      about: character.about.length,
      gallery: character.gallery.map(art => [art.id, art.characterIds, art.src, art.date, art.projectIds]),
      commissions: character.commissions.map(commission => [commission.id, commission.characterIds, commission.src, commission.date, commission.artistName, commission.artistUrl]),
      exchanges: character.exchanges.map(exchange => [exchange.id, exchange.characterIds, exchange.date, exchange.replies.length]),
      chapters: character.chapters.map(chapter => [chapter.id, chapter.characterIds, chapter.date, chapter.projectIds, chapter.format,
        chapter.blocks.map(block => [block.type, block.src])]),
      artProjects: character.artProjects.map(entry => [entry.id, entry.url]),
      trpgScenarios: character.trpgScenarios.map(entry => [entry.id, entry.url])
    })),
    relationships: data.relationships.map(entry => [entry.id, entry.from, entry.to])
  });
  let expected;
  supportedLanguages.forEach(code => {
    const data = validateContent(payload.locales[code], allowIncomplete);
    const actual = structure(data);
    if (expected !== undefined && actual !== expected) throw new Error(`四語資料結構不同。Mismatched structure: ${code}`);
    expected = actual;
  });
  if (new Blob([JSON.stringify(payload)]).size > 4000000) throw new Error('文字資料超過 4 MB。請減少內容。');
  return payload;
}

async function start() {
  languageControl.disabled = true;
  try {
    await cloud.init();
    const [base, ...packs] = await Promise.all([
      loadJSON('data/content.json'),
      ...supportedLanguages.slice(1).map(code => loadJSON(`data/${code}.json`))
    ]);
    validateContent(base);
    catalogues = { en: { content: base } };
    supportedLanguages.slice(1).forEach((code, index) => {
      const pack = packs[index];
      catalogues[code] = { ui: pack.ui, content: localizedContent(base, pack) };
    });
    const englishMessages = new Set(supportedLanguages.slice(1).flatMap(code => Object.keys(catalogues[code].ui)));
    supportedLanguages.slice(1).forEach(code => englishMessages.forEach(message => {
      const translated = catalogues[code].ui[message];
      if (!translated || JSON.stringify((message.match(/\{\w+\}/g) || []).sort()) !==
        JSON.stringify((translated.match(/\{\w+\}/g) || []).sort())) {
        throw new Error(`Missing or invalid ${code} translation for ${message}`);
      }
    }));
    if (cloud.configured) {
      const published = await cloud.read();
      cloudVersion = published.version;
      if (published.payload) {
        validateArchive(published.payload);
        supportedLanguages.forEach(code => { catalogues[code].content = published.payload.locales[code]; });
      }
    }
    translationsReady = true;
    let saved;
    try { saved = localStorage.getItem('atelier-language'); }
    catch (error) { console.warn('Language preference could not be read:', error); }
    language = supportedLanguages.includes(saved) ? saved : 'zh-Hant';
    content = catalogues[language].content;
    translateShell();
    route(false);
    languageControl.disabled = location.hash === '#/admin';
  } catch (error) {
    console.error('Unable to open the character archive:', error);
    const notice = node('section', 'notice');
    notice.setAttribute('role', 'alert');
    notice.append(node('h1', '', 'Unable to open · 無法開啟 · 読み込めません · 열 수 없습니다'),
      node('p', '', 'Check data/*.json and the browser console. Use a web server, not file://.'),
      node('p', '', '請檢查資料檔案，並使用網頁伺服器。 / データとウェブサーバーをご確認ください。 / 데이터 파일과 웹 서버를 확인해 주세요.'));
    const retry = node('button', 'button', 'Retry / 重試 / 再試行 / 다시 시도');
    retry.type = 'button';
    retry.addEventListener('click', () => location.reload());
    notice.append(retry);
    notice.append(node('p', '', error.message || String(error)), link('雲端設定指南 / Setup guide', 'SETUP-zh-Hant.md', 'text-link'));
    main.replaceChildren(notice);
  }
}
start();
