(function() {
  var t = 'dark';
  try {
    t = window.localStorage.getItem('bookstaTheme') || 'dark';
  } catch (e) {}
  document.documentElement.setAttribute('data-theme', t);
  var bg = (t === 'light') ? '#faf9ff' : '#0b1120';
  document.documentElement.style.backgroundColor = bg;
})();
