'use strict';

// Apply the saved palette before styles load to avoid a light flash on dark visits.
(() => {
  let saved;
  try { saved = localStorage.getItem('atelier-theme'); }
  catch (error) { console.warn('Theme preference could not be read:', error); }
  const theme = saved === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#18231f' : '#f7f3ed';
})();
