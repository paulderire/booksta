(function() {
  var t = 'light';
  try {
    // Check if localStorage is accessible (handles private browsing/incognito)
    t = window.localStorage.getItem('bookstaTheme') || 'light';
  } catch (e) {}
  document.documentElement.setAttribute('data-theme', t);
})();
