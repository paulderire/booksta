// Instrumentation: mark module load early to help diagnose blank-page issues
window.__bookstaInitStart = Date.now();
window.__bookstaErrors = window.__bookstaErrors || [];

const API_BASE_URL = localStorage.getItem('API_BASE_URL') || document.querySelector('meta[name="api-base-url"]')?.content || window.API_BASE_URL || '';
const app = document.getElementById('app');
const authSlot = document.getElementById('auth-slot');
const cartCount = document.getElementById('cart-count');
const notificationCount = document.getElementById('notification-count');
const toasts = document.getElementById('toasts');
const drawer = document.getElementById('cart-drawer');
const themeToggle = document.getElementById('theme-toggle');
const topNav = document.querySelector('.topnav');
const headerSearchInput = document.getElementById('header-search');
const overlay = document.createElement('div');
overlay.className = 'drawer-overlay';
overlay.setAttribute('aria-hidden', 'true');
document.body.appendChild(overlay);
overlay.addEventListener('click', () => setDrawerOpen(false));

const mobileMenu = document.getElementById('mobile-menu');
const mobileMenuBackdrop = document.getElementById('mobile-menu-backdrop');
const mobileMenuAuth = document.getElementById('mobile-menu-auth');
const mobileHamburger = document.getElementById('mobile-hamburger');
const mobileThemeToggle = document.getElementById('mobile-theme-toggle');
const mobileCartButton = document.getElementById('mobile-cart-button');
const mobileCartCount = document.getElementById('mobile-cart-count');

// Helper functions for mobile menu
function openMobileMenu() {
  if (mobileMenu) {
    mobileMenu.classList.add('is-open');
    mobileMenu.setAttribute('aria-hidden', 'false');
    if (mobileMenuBackdrop) {
      mobileMenuBackdrop.classList.add('is-open');
      mobileMenuBackdrop.setAttribute('aria-hidden', 'false'); // because it's now clickable
    }
    mobileHamburger?.setAttribute('aria-expanded', 'true');
  }
}

function closeMobileMenu() {
  if (mobileMenu) {
    mobileMenu.classList.remove('is-open');
    mobileMenu.setAttribute('aria-hidden', 'true');
    if (mobileMenuBackdrop) {
      mobileMenuBackdrop.classList.remove('is-open');
      mobileMenuBackdrop.setAttribute('aria-hidden', 'true');
    }
    mobileHamburger?.setAttribute('aria-expanded', 'false');
  }
}


const genreSeed = ['Fiction', 'Sci-Fi', 'Fantasy', 'Thriller', 'Romance', 'Self-Help', 'History', 'Manga'];
const chatbotFaq = {
  shipping: 'Delivery usually takes 1-3 business days in Kigali and 3-5 days outside Kigali.',
  payment: 'You can place orders in app and confirm payment on WhatsApp with our team.',
  returns: 'You can request a return within 7 days for damaged or incorrect items.',
  promotions: 'Use active promotion codes at checkout. You can find current offers in the Promotions section.',
  support: 'You can contact us via WhatsApp, Instagram, Facebook, X, or TikTok from the contact section.'
};

const state = {
  token: localStorage.getItem('bookstaToken'),
  user: null,
  books: [],
  featured: [],
  promotions: [],
  genres: genreSeed,
  genreCounts: {},
  cart: [],
  wishlist: [],
  orders: [],
  notifications: [],
  recommendations: [],
  featuredAuthors: [],
  recommendationProfile: null,
  unreadNotifications: 0,
  kidsBooks: [],
  currentBook: null,
  currentReviews: [],
  route: null,
  homeLoading: true,
  booksLoading: false,
  bookLoading: true,
  cartLoading: true,
  wishlistLoading: true,
  search: '',
  catalogSearch: '',
  genre: '',
  sort: 'featured',
  page: 1,
  limit: 12,
  drawerOpen: false,
  loadingMore: false,
  typewriterIndex: 0,
  theme: 'light',
  heroTimer: null,
  searchTimer: null,
  chatbotOpen: false,
  chatbotDrag: {
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    originLeft: 0,
    originTop: 0
  },
  chatbotMessages: [
    { role: 'bot', text: 'Hi, I am Booksta Assistant. Pick a question below and I will help instantly.' }
  ],
  total: 0,
  totalPages: 1,
  settings: {
    whatsappNumber: '250782781575',
    instagramUrl: '#/social/instagram',
    facebookUrl: '#/social/facebook',
    xUrl: '#/social/x',
    tiktokUrl: '#/social/tiktok'
  }
};

const routeState = {
  current: ''
};

window.__bookstaErrors = window.__bookstaErrors || [];
window.addEventListener('error', (event) => {
  window.__bookstaErrors.push(String(event.error?.message || event.message || event.type || 'error'));
});
window.addEventListener('unhandledrejection', (event) => {
  window.__bookstaErrors.push(String(event.reason?.message || event.reason || 'rejection'));
});

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatMoney(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'RWF',
    currencyDisplay: 'code',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function initials(name) {
  return String(name || 'User')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function shorten(text, max = 140) {
  const value = String(text || '');
  return value.length > max ? `${value.slice(0, max).trim()}…` : value;
}

function getBookGenres(book) {
  if (!book) return [];
  if (Array.isArray(book.genres)) return book.genres;
  if (typeof book.genres === 'string') {
    return book.genres.split(',').map((g) => g.trim()).filter(Boolean);
  }
  if (book.genre) {
    if (typeof book.genre === 'string') {
      return [book.genre];
    }
    if (Array.isArray(book.genre)) {
      return book.genre;
    }
  }
  return [];
}

function getTopAuthors(books = [], limit = 6) {
  const counts = new Map();

  books.forEach((book) => {
    const author = String(book?.author || '').trim();
    if (!author) return;
    counts.set(author, (counts.get(author) || 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .slice(0, limit);
}

function getTopGenres(limit = 16) {
  return Object.entries(state.genreCounts || {})
    .map(([name, count]) => ({ name, count: Number(count || 0) }))
    .filter((item) => item.name)
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .slice(0, limit);
}

function cartTotal() {
  return state.cart.reduce((sum, item) => {
    const subtotal = Number(item.subtotal);
    if (Number.isFinite(subtotal) && subtotal > 0) {
      return sum + subtotal;
    }
    return sum + (Number(item.book?.price || 0) * Number(item.quantity || 0));
  }, 0);
}

function getPromotionDiscountValue(promotion, subtotal) {
  if (!promotion) return 0;
  const value = Number(promotion.discount_value || 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (promotion.discount_type === 'percentage') {
    return Math.min(subtotal, subtotal * (value / 100));
  }
  return Math.min(subtotal, value);
}

function getBestPromotion(subtotal = cartTotal()) {
  const today = new Date();
  subtotal = Number(subtotal) || 0;
  const eligible = (state.promotions || []).filter((promo) => {
    if (!promo || promo.is_active === false) return false;
    const expiresAt = promo.expires_at ? new Date(promo.expires_at) : null;
    if (expiresAt && expiresAt < today) return false;
    const minAmount = Number(promo.min_order_amount || 0);
    return subtotal >= minAmount;
  });

  if (!eligible.length) return null;

  return eligible
    .map((promo) => ({ promo, discount: getPromotionDiscountValue(promo, subtotal) }))
    .sort((left, right) => right.discount - left.discount)[0]
    .promo;
}

function getResponsivePageLimit() {
  return 8;
}

function syncResponsivePageLimit() {
  const nextLimit = getResponsivePageLimit();
  if (nextLimit === state.limit) {
    return false;
  }

  state.limit = nextLimit;
  state.totalPages = Math.max(Math.ceil(Number(state.total || 0) / state.limit), 1);
  if (state.page > state.totalPages) {
    state.page = state.totalPages;
  }

  return true;
}

function getOrderPricing(subtotal = null) {
  if (subtotal === null) {
    subtotal = cartTotal();
  }
  subtotal = Number(subtotal) || 0;
  const promotion = getBestPromotion(subtotal);
  const discount = getPromotionDiscountValue(promotion, subtotal);
  return {
    subtotal: Math.max(subtotal, 0),
    promotion,
    discount: Math.max(discount, 0),
    total: Math.max(subtotal - discount, 0)
  };
}

function openWhatsAppOrder(targetNumber, message) {
  const encoded = encodeURIComponent(message);
  const link = `https://wa.me/${targetNumber}?text=${encoded}`;
  window.open(link, '_blank');
}

function buildOrderMessage({ orderId, name, email, address, promotionText, orderLines, subtotal, total }) {
  return [
    'Hello Booksta Team, I would love to confirm my order.',
    '',
    `Order ID: ${orderId}`,
    `Name: ${name}`,
    `Email: ${email}`,
    `Address: ${address}`,
    promotionText,
    '',
    'Order details:',
    orderLines,
    '',
    `Subtotal: ${subtotal}`,
    `Total after discount: ${total}`,
    '',
    'Kindly share payment and delivery confirmation details. Thank you.'
  ].join('\n');
}


function isActiveRoute(name) {
  return (state.route?.name || getRoute().name) === name;
}

function buildRouteParams(params = {}, allowedKeys = []) {
  const query = new URLSearchParams();
  allowedKeys.forEach((key) => {
    const value = params[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      query.set(key, String(value));
    }
  });
  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
}

function getCanonicalPath(route) {
  if (!route) return '/';

  if (route.name === 'home') return '/';
  if (route.name === 'book') return route.params?.id ? `/book/${encodeURIComponent(route.params.id)}` : '/books';
  if (route.name === 'books') return `/books${buildRouteParams(route.params, ['page', 'sort'])}`;
  if (route.name === 'search') return `/search${buildRouteParams(route.params, ['q', 'genre', 'author', 'page', 'sort'])}`;
  if (route.name === 'notifications') return '/notifications';
  if (route.name === 'login') return '/login';
  if (route.name === 'register') return '/register';
  if (route.name === 'reset-password') {
    const stage = route.params?.stage === 'confirm' ? '/reset-password/confirm' : '/reset-password';
    return `${stage}${buildRouteParams(route.params, ['email'])}`;
  }

  const publicRoutes = new Set(['cart', 'wishlist', 'orders', 'profile']);
  if (publicRoutes.has(route.name)) {
    return `/${route.name}`;
  }

  return '/';
}

function updateSeo(route) {
  const resolvedRoute = route || state.route || getRoute();
  const origin = window.location.origin;
  const canonicalPath = getCanonicalPath(resolvedRoute);
  const canonicalUrl = `${origin}${canonicalPath}`;

  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.setAttribute('rel', 'canonical');
    document.head.appendChild(canonical);
  }
  canonical.setAttribute('href', canonicalUrl);

  let title = 'Booksta Online BookStore';
  let description = 'Booksta online bookstore in Rwanda: discover curated books, authors, genres, and promotions.';

  if (resolvedRoute?.name === 'books') {
    title = 'All Books | Booksta Online BookStore';
    description = 'Browse all books on Booksta by latest arrivals and best picks.';
  } else if (resolvedRoute?.name === 'search') {
    const q = resolvedRoute?.params?.q || resolvedRoute?.params?.genre || resolvedRoute?.params?.author;
    title = q ? `${q} | Search | Booksta` : 'Search Books | Booksta';
    description = q ? `Search results for ${q} on Booksta online bookstore.` : 'Search books, authors, and genres on Booksta.';
  } else if (resolvedRoute?.name === 'book' && state.currentBook) {
    const book = state.currentBook;
    title = `${book.title} by ${book.author} | Booksta`;
    description = String(book.description || '').trim().slice(0, 155) || `${book.title} by ${book.author} available on Booksta.`;
  }

  document.title = title;

  let robotsMeta = document.querySelector('meta[name="robots"]');
  if (!robotsMeta) {
    robotsMeta = document.createElement('meta');
    robotsMeta.setAttribute('name', 'robots');
    document.head.appendChild(robotsMeta);
  }
  const noIndexRoutes = new Set(['login', 'register', 'cart', 'wishlist', 'orders', 'profile', 'notifications', 'reset-password']);
  robotsMeta.setAttribute('content', noIndexRoutes.has(resolvedRoute?.name) ? 'noindex, nofollow' : 'index, follow');

  let descriptionMeta = document.querySelector('meta[name="description"]');
  if (!descriptionMeta) {
    descriptionMeta = document.createElement('meta');
    descriptionMeta.setAttribute('name', 'description');
    document.head.appendChild(descriptionMeta);
  }
  descriptionMeta.setAttribute('content', description);
}

function getRoute() {
  const hashRoute = String(window.location.hash || '').replace(/^#/, '').trim();
  const raw = hashRoute || `${window.location.pathname || '/'}${window.location.search || ''}`;
  const [path, qs] = raw.split('?');
  const segments = (path || '/').replace(/^\/+/, '').split('/').filter(Boolean);
  const params = {};
  if (qs) {
    try {
      new URLSearchParams(qs).forEach((v, k) => { params[k] = v; });
    } catch (e) { }
  }

  if (!segments.length) {
    return { name: 'home', params };
  }

  if (segments[0] === 'search') {
    return { name: 'search', params };
  }

  if (segments[0] === 'books') {
    return { name: 'books', params };
  }

  if (segments[0] === 'book') {
    return { name: 'book', params: { id: segments[1], ...params } };
  }

  if (segments[0] === 'cart') {
    return { name: 'cart', params: params };
  }

  if (segments[0] === 'wishlist') {
    return { name: 'wishlist', params: params };
  }

  if (segments[0] === 'orders') {
    return { name: 'orders', params: params };
  }

  if (segments[0] === 'profile') {
    return { name: 'profile', params: params };
  }

  if (segments[0] === 'notifications') {
    return { name: 'notifications', params: params };
  }

  if (segments[0] === 'login') {
    return { name: 'login', params: params };
  }

  if (segments[0] === 'register') {
    return { name: 'register', params: params };
  }

  if (segments[0] === 'reset-password') {
    const stage = segments[1] === 'confirm' ? 'confirm' : 'request';
    return { name: 'reset-password', params: { stage, ...params } };
  }

  if (segments[0] === 'track') {
    return { name: 'track', params: params };
  }

  return { name: 'home', params };
}

function getRouteFromHash(hashString) {
  const hashRoute = String(hashString || '').replace(/^#/, '').trim();
  const [path, qs] = hashRoute.split('?');
  const segments = (path || '/').replace(/^\/+/, '').split('/').filter(Boolean);
  const params = {};
  if (qs) {
    try {
      new URLSearchParams(qs).forEach((v, k) => { params[k] = v; });
    } catch (e) { }
  }

  if (!segments.length) {
    return { name: 'home', params };
  }
  if (segments[0] === 'search') return { name: 'search', params };
  if (segments[0] === 'books') return { name: 'books', params };
  if (segments[0] === 'book') return { name: 'book', params: { id: segments[1], ...params } };
  if (segments[0] === 'cart') return { name: 'cart', params };
  if (segments[0] === 'wishlist') return { name: 'wishlist', params };
  if (segments[0] === 'orders') return { name: 'orders', params };
  if (segments[0] === 'profile') return { name: 'profile', params };
  if (segments[0] === 'notifications') return { name: 'notifications', params };
  if (segments[0] === 'login') return { name: 'login', params };
  if (segments[0] === 'register') return { name: 'register', params };
  if (segments[0] === 'reset-password') {
    const stage = segments[1] === 'confirm' ? 'confirm' : 'request';
    return { name: 'reset-password', params: { stage, ...params } };
  }
  return { name: 'home', params };
}

function setTheme(theme) {
  state.theme = 'light';
  document.documentElement.dataset.theme = 'light';
  localStorage.setItem('bookstaTheme', 'light');
  if (themeToggle) {
    themeToggle.textContent = '◑';
  }
}

function showToast(message, type = 'success') {
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.innerHTML = `<strong>${type === 'success' ? 'Success' : 'Notice'}</strong><div>${escapeHtml(message)}</div>`;
  toasts.appendChild(node);
  window.setTimeout(() => {
    node.remove();
  }, 2500);
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const isFormData = options.body instanceof FormData;
  const authlessAuthPaths = new Set([
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/forgot-password',
    '/api/auth/reset-password'
  ]);

  if (!isFormData && options.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (state.token && !authlessAuthPaths.has(path)) {
    headers.set('Authorization', `Bearer ${state.token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include'
  });

  if (response.status === 429) {
    // Friendly handling for rate limits
    const retryAfter = response.headers.get('Retry-After');
    const waitMsg = retryAfter ? ` Please wait ${retryAfter} seconds and try again.` : '';
    const err = new Error('Too many requests, please try again later.' + waitMsg);
    err.status = 429;
    throw err;
  }

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    const error = new Error(payload?.error || 'Request failed.');
    error.status = response.status;
    if (response.status === 401 && state.token && path !== '/api/auth/me') {
      clearSession(false);
    }
    throw error;
  }

  return payload;
}

function clearSession(showNotice = true) {
  state.token = null;
  state.user = null;
  localStorage.removeItem('bookstaToken');
  renderChrome();
  if (showNotice) {
    showToast('Session expired. Please sign in again.', 'error');
  }
}

function saveSession(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem('bookstaToken', token);
  renderChrome();
}

function setDrawerOpen(isOpen) {
  state.drawerOpen = Boolean(isOpen);
  document.body.classList.toggle('has-drawer-open', state.drawerOpen);
  if (drawer) {
    drawer.classList.toggle('is-open', state.drawerOpen);
    drawer.setAttribute('aria-hidden', String(!state.drawerOpen));
  }
  overlay.classList.toggle('is-visible', state.drawerOpen);
  overlay.setAttribute('aria-hidden', String(!state.drawerOpen));
  if (state.drawerOpen) {
    renderDrawer();
  }
}

function renderChrome() {
  const currentRouteName = state.route?.name || getRoute()?.name || 'home';
  document.documentElement.dataset.route = currentRouteName;
  document.body.classList.toggle('is-logged-in', !!state.user);
  const cartQuantity = state.cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

  if (cartCount) {
    cartCount.textContent = String(cartQuantity);
  }

  if (notificationCount) {
    notificationCount.textContent = String(state.unreadNotifications || 0);
    notificationCount.style.display = state.user ? 'inline-flex' : 'none';
  }

  if (mobileCartCount) {
    mobileCartCount.textContent = String(cartQuantity);
  }

  const notificationButton = document.getElementById('notification-button');
  if (notificationButton) {
    notificationButton.style.display = state.user ? 'inline-flex' : 'none';
  }

  // Hide ALL topnav links when not logged in
  const topnav = document.querySelector('.topnav');
  if (topnav) {
    topnav.style.display = state.user ? 'flex' : 'none';
  }

  // Hide ALL mobile menu nav items when not logged in
  const mobileMenuItems = document.querySelectorAll('.mobile-menu-overlay .mobile-menu-section:first-child .mobile-menu-item');
  mobileMenuItems.forEach((item) => {
    item.style.display = state.user ? 'flex' : 'none';
  });

  if (authSlot) {
    authSlot.innerHTML = state.user
      ? `
        <div class="account-menu">
          <button class="account-trigger" type="button" data-action="toggle-account-menu" aria-expanded="false" aria-haspopup="menu">
            <span class="account-avatar">${escapeHtml(initials(state.user.name || state.user.email || 'Reader'))}</span>
            <span class="account-caret">⌄</span>
          </button>
          <div class="account-dropdown" data-account-menu aria-hidden="true">
            <a href="#/profile" data-action="close-account-menu">Profile</a>
            <button class="ghost-button account-logout" type="button" data-action="logout">Logout</button>
          </div>
        </div>
      `
      : `
        <a class="ghost-button" href="#/login">Login</a>
        <a class="primary-button" href="#/register">Register</a>
      `;
  }

  const mobileMenuTitle = document.getElementById('mobile-menu-title');
  if (mobileMenuTitle) {
    mobileMenuTitle.textContent = state.user
      ? (state.user.name || 'Reader')
      : 'Menu';
  }

  if (mobileMenuAuth) {
    mobileMenuAuth.innerHTML = state.user
      ? ''
      : `
        <div class="mobile-account-card">
          <a class="ghost-button" href="#/login" data-action="close-mobile-menu">Login</a>
          <a class="primary-button" href="#/register" data-action="close-mobile-menu">Register</a>
        </div>
      `;
  }

  const mobileMenuFooter = document.getElementById('mobile-menu-footer');
  if (mobileMenuFooter) {
    if (state.user) {
      mobileMenuFooter.style.display = 'block';
      mobileMenuFooter.innerHTML = `
        <button class="mobile-logout-btn" type="button" data-action="logout">Logout</button>
      `;
    } else {
      mobileMenuFooter.style.display = 'none';
      mobileMenuFooter.innerHTML = '';
    }
  }

  if (drawer) {
    drawer.classList.toggle('is-open', state.drawerOpen);
    drawer.setAttribute('aria-hidden', String(!state.drawerOpen));
    if (state.drawerOpen) {
      renderDrawer();
    }
  }

  overlay.classList.toggle('is-visible', state.drawerOpen);
  overlay.setAttribute('aria-hidden', String(!state.drawerOpen));

  syncFooterLinks();
  const yearNode = document.getElementById('footer-year');
  if (yearNode) yearNode.textContent = String(new Date().getFullYear());
}

function syncFooterLinks() {
  const settings = state.settings || {};
  const whatsappNumber = String(settings.whatsappNumber || '250782781575').replace(/[^\d+]/g, '');

  // Update WhatsApp link with text
  const whatsappNode = document.getElementById('footer-whatsapp-link');
  if (whatsappNode) {
    whatsappNode.href = whatsappNumber ? `https://wa.me/${whatsappNumber}` : 'https://wa.me/250782781575';
    whatsappNode.textContent = `+${whatsappNumber || '250782781575'}`;
  }

  // Update social links with only href, preserve emoji icons
  const socialLinks = [
    ['footer-instagram-link', settings.instagramUrl || '#/social/instagram'],
    ['footer-facebook-link', settings.facebookUrl || '#/social/facebook'],
    ['footer-x-link', settings.xUrl || '#/social/x'],
    ['footer-tiktok-link', settings.tiktokUrl || '#/social/tiktok']
  ];

  socialLinks.forEach(([id, href]) => {
    const node = document.getElementById(id);
    if (node) node.href = href;
  });
}

function renderDrawer() {
  const items = state.cart;
  drawer.innerHTML = `
    <div class="drawer-head">
      <div class="order-head">
        <div class="hint">Cart</div>
        <h2 class="section-title">Your basket</h2>
      </div>
      <button class="ghost-button" type="button" data-action="close-drawer">Close</button>
    </div>
    <div class="drawer-body">
      ${items.length ? items.map((item) => `
        <article class="drawer-item">
          <div class="mini-cover" style="background: linear-gradient(145deg, ${escapeHtml(item.book.cover_color || '#1f2937')}, rgba(15, 23, 42, 0.9));">
            ${item.book.cover_url ? `<img src="${escapeHtml(item.book.cover_url)}" alt="${escapeHtml(item.book.title)}" class="review-avatar" style="width: 100%; height: 100%; object-fit: cover; border-radius: 22px;" loading="lazy" />` : `<span class="cover-emoji">${escapeHtml(item.book.emoji || '📚')}</span>`}
          </div>
          <div>
            <h3 class="mini-title">${escapeHtml(item.book.title)}</h3>
            <div class="mini-meta">${escapeHtml(item.book.author)}</div>
            <div class="mini-price"><strong>${formatMoney(item.book.price)}</strong><span class="hint">x ${Number(item.quantity)}</span></div>
          </div>
          <button class="ghost-button" type="button" data-action="remove-from-cart" data-book-id="${escapeHtml(item.book.id)}">Remove</button>
        </article>
      `).join('') : `<div class="empty-state"><p>Your cart is empty.</p><a class="primary-button" href="#/">Browse books</a></div>`}
    </div>
    <div class="drawer-foot">
      <div class="cart-row">
        <strong>Total</strong>
        <strong class="price">${formatMoney(cartTotal())}</strong>
      </div>
      <div class="cart-controls">
        <a class="secondary-button" href="#/cart" data-action="close-drawer">Open cart page</a>
        <button class="primary-button" type="button" data-action="open-checkout" ${items.length ? '' : 'disabled'}>Checkout</button>
      </div>
    </div>
  `;
}

function renderStars(value = 0) {
  const full = Math.round(Number(value) || 0);
  return Array.from({ length: 5 }, (_, index) => `<span class="${index < full ? 'is-active' : ''}">★</span>`).join('');
}

function renderRatingDistribution(reviews = []) {
  if (!reviews.length) {
    return `<div class="rating-summary-stars"><span class="hint">${renderStars(0)}</span><span class="hint">No ratings yet</span></div>`;
  }

  const average = reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length;
  return `
    <div class="rating-summary-stars">
      <span class="hint">${renderStars(average)}</span>
      <span class="hint">${reviews.length} reviews</span>
    </div>
  `;
}

function renderBookCard(book, options = {}) {
  const sale = book.original_price && Number(book.original_price) > Number(book.price);
  const isWishlisted = Array.isArray(state.wishlist) && state.wishlist.some((item) => String(item?.book?.id || item?.book_id || item?.id) === String(book.id));
  return `
    <article class="book-card card">
      <div class="book-cover-container">
        <a href="#/book/${book.id}" class="book-cover" data-action="open-book" data-book-id="${escapeHtml(book.id)}">
          ${sale ? '<span class="sale-badge">SALE</span>' : ''}
          ${book.cover_url ? `<img src="${escapeHtml(book.cover_url)}" alt="${escapeHtml(book.title)}" class="cover-swatch" loading="lazy" />` : `<span class="cover-emoji">${escapeHtml(book.emoji || '📚')}</span>`}
        </a>
        <button class="cover-wishlist-btn ${isWishlisted ? 'is-active' : ''}" type="button" data-action="toggle-wishlist" data-book-id="${escapeHtml(book.id)}" aria-label="Wishlist">${isWishlisted ? '♥' : '♡'}</button>
      </div>
      <div class="book-card-details">
        <h3 class="book-title"><a href="#/book/${book.id}">${escapeHtml(book.title)}</a></h3>
        <div class="book-author">${escapeHtml(book.author)}</div>
        <div class="book-price-row">
          <span class="price">${formatMoney(book.price)}</span>
          ${sale ? `<span class="price-old">${formatMoney(book.original_price)}</span>` : ''}
        </div>
        <button class="quick-add-btn" type="button" data-action="buy-now" data-book-id="${escapeHtml(book.id)}">Buy</button>
      </div>
    </article>
  `;
}

function renderRecommendationTile(book) {
  const coverStyle = `background: linear-gradient(145deg, ${escapeHtml(book.cover_color || '#1f2937')}, rgba(15, 23, 42, 0.9));`;
  return `
    <a class="recommendation-tile" href="#/book/${book.id}" data-action="open-book" data-book-id="${escapeHtml(book.id)}" aria-label="Open ${escapeHtml(book.title)}">
      <span class="recommendation-cover" style="${coverStyle}">
        ${book.cover_url ? `<img src="${escapeHtml(book.cover_url)}" alt="${escapeHtml(book.title)}" loading="lazy" />` : `<span class="cover-emoji">${escapeHtml(book.emoji || '📚')}</span>`}
      </span>
      <strong class="recommendation-name">${escapeHtml(book.title)}</strong>
    </a>
  `;
}

function renderBookRow(book) {
  const genres = (book.genres && book.genres.length ? book.genres.join(' • ') : book.genre) || 'Book';
  const sale = Number(book.original_price || 0) > Number(book.price || 0);
  return `
    <article class="book-row card">
      <a class="book-row-cover" href="#/book/${book.id}" data-action="open-book" data-book-id="${escapeHtml(book.id)}">
        ${sale ? '<span class="sale-badge">SALE</span>' : ''}
        ${book.cover_url ? `<img src="${escapeHtml(book.cover_url)}" alt="${escapeHtml(book.title)}" class="cover-swatch" loading="lazy" />` : `<span class="cover-emoji">${escapeHtml(book.emoji || '📚')}</span>`}
      </a>
      <div class="book-row-content">
        <div class="book-row-head">
          <div>
            <div class="book-row-meta">${escapeHtml(genres)}</div>
            <h3 class="book-row-title"><a href="#/book/${book.id}">${escapeHtml(book.title)}</a></h3>
            <div class="book-row-author">${escapeHtml(book.author)}</div>
          </div>
          <div class="book-row-price">
            <strong>${formatMoney(book.price)}</strong>
            ${sale ? `<span class="price-old">${formatMoney(book.original_price)}</span>` : ''}
          </div>
        </div>
        <p class="book-row-description">${escapeHtml(shorten(book.description || 'Explore this title from the catalog.', 170))}</p>
        <div class="book-row-stats">
          <span class="hint">${renderStars(book.avg_rating)} ${Number(book.review_count || 0)} reviews</span>
          <span class="hint">${book.stock} in stock</span>
          <span class="hint">${book.pages || '—'} pages</span>
        </div>
      </div>
      <div class="book-row-actions">
        <button class="secondary-button" type="button" data-action="add-to-cart" data-book-id="${escapeHtml(book.id)}">Add to cart</button>
        <button class="primary-button" type="button" data-action="order-now" data-book-id="${escapeHtml(book.id)}">Order now</button>
        <button class="ghost-button" type="button" data-action="toggle-wishlist" data-book-id="${escapeHtml(book.id)}">Wishlist</button>
      </div>
    </article>
  `;
}

function renderCompactBookCard(book) {
  const sale = book.original_price && Number(book.original_price) > Number(book.price);
  const isWishlisted = Array.isArray(state.wishlist) && state.wishlist.some((item) => String(item?.book?.id || item?.book_id || item?.id) === String(book.id));
  return `
    <article class="compact-book-card card">
      <div class="book-cover-container">
        <a class="compact-book-cover" href="#/book/${book.id}" data-action="open-book" data-book-id="${escapeHtml(book.id)}">
          ${sale ? '<span class="sale-badge">SALE</span>' : ''}
          ${book.cover_url ? `<img src="${escapeHtml(book.cover_url)}" alt="${escapeHtml(book.title)}" class="cover-swatch" loading="lazy" />` : `<span class="cover-emoji">${escapeHtml(book.emoji || '📚')}</span>`}
        </a>
        <button class="cover-wishlist-btn ${isWishlisted ? 'is-active' : ''}" type="button" data-action="toggle-wishlist" data-book-id="${escapeHtml(book.id)}" aria-label="Wishlist">${isWishlisted ? '♥' : '♡'}</button>
      </div>
      <div class="compact-book-content">
        <h3 class="compact-book-title"><a href="#/book/${book.id}">${escapeHtml(book.title)}</a></h3>
        <div class="book-row-author">${escapeHtml(book.author)}</div>
        <div class="compact-book-price">
          <strong>${formatMoney(book.price)}</strong>
          ${sale ? `<span class="price-old">${formatMoney(book.original_price)}</span>` : ''}
        </div>
        <button class="quick-add-btn" type="button" data-action="buy-now" data-book-id="${escapeHtml(book.id)}">Buy</button>
      </div>
    </article>
  `;
}

function renderAllBooksView() {
  const totalBooks = Number(state.total || state.books.length || 0);
  const booksMarkup = state.booksLoading
    ? `<div class="books-grid books-grid--compact">${Array.from({ length: 5 }, () => `
        <article class="compact-book-card card is-loading">
          <div class="book-cover-container">
            <div class="compact-book-cover skeleton"></div>
          </div>
          <div class="compact-book-content">
            <div class="skeleton" style="width: 80%; height: 1.2rem; border-radius: 0; margin-bottom: 0.5rem;"></div>
            <div class="skeleton" style="width: 50%; height: 0.8rem; border-radius: 0; margin-bottom: 0.8rem;"></div>
            <div class="skeleton" style="width: 40%; height: 1rem; border-radius: 0; margin-bottom: 1rem;"></div>
            <div class="skeleton" style="width: 100%; height: 2.2rem; border-radius: 0; margin-top: auto;"></div>
          </div>
        </article>`).join('')}</div>`
    : state.books.length
      ? `<div class="books-grid books-grid--compact">${state.books.map(renderCompactBookCard).join('')}</div>`
      : `<div class="empty-state"><p>No books were found in the database.</p><a class="primary-button" href="#/">Back to home</a></div>`;
  const isKids = String(state.genre || '').toLowerCase() === 'kids';
  return `
    <section class="page books-page section ${isKids ? 'kids-collection-page' : ''}">
      <div class="catalog-page-header">
        <h2 class="catalog-page-title">
          ${state.genre ? `Explore ${escapeHtml(state.genre)}` : 'Explore Our Library'}
        </h2>
        <p class="catalog-page-subtitle">
          ${state.genre
      ? `Browse our curated selection of prime ${escapeHtml(state.genre)} publications.`
      : 'Discover timeless classics, recent releases, and handpicked recommendations.'}
        </p>
      </div>

      <div class="catalog-toolbar">
        <div class="catalog-search-row">
          <form class="catalog-search-box" data-form="catalog-search" autocomplete="off">
            <span class="catalog-search-icon">🔍</span>
            <input class="catalog-search-input" type="text" placeholder="Search by title or author.." value="${escapeHtml(state.catalogSearch || '')}" data-action="catalog-search-input" />
            ${state.catalogSearch ? '<button class="catalog-search-clear" type="button" data-action="clear-catalog-search">✕</button>' : ''}
            <div class="catalog-suggestions" id="catalog-suggestions"></div>
          </form>
        </div>

        <div class="catalog-genre-chips">
          <button class="genre-chip ${!state.genre ? 'genre-chip--active' : ''}" type="button" data-action="clear-genre">
            All
          </button>
          ${['Fantasy', 'Fiction', 'Mystery', 'Non-Fiction', 'Romance', 'Science Fiction'].map(gName => {
        const active = String(state.genre).toLowerCase() === gName.toLowerCase();
        return `
              <button class="genre-chip ${active ? 'genre-chip--active' : ''}" type="button" data-action="set-genre" data-genre="${escapeHtml(gName)}">
                ${escapeHtml(gName)}
              </button>
            `;
      }).join('')}
        </div>
      </div>

      <section class="section" style="padding-top: 0 !important; width: 100%;">
        ${booksMarkup}
        ${!state.booksLoading && state.page < state.totalPages
      ? `<div class="load-more-container" style="text-align: center; margin-top: 3rem; margin-bottom: 2rem;">
               <button class="primary-button" type="button" data-action="load-more-books" style="padding: 0.8rem 2.5rem; border-radius: 999px; font-weight: 700; cursor: pointer; transition: all 0.2s ease;">
                 ${state.loadingMore ? 'Loading...' : 'See More'}
               </button>
             </div>`
      : ''
    }
      </section>
    </section>
  `;
}

function renderFeaturedAuthorsStrip(authors = []) {
  if (!authors.length) {
    return '';
  }

  const AUTHOR_DETAILS = {
    'Elena Voss': {
      image: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=200&h=200',
      bio: 'Award-winning novelist specializing in modern psychological thrillers and crime fiction.',
      genre: 'Mystery & Thriller'
    },
    'Mason Pike': {
      image: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&q=80&w=200&h=200',
      bio: 'Science fiction theorist and author, crafting expansive space operas and futurescapes.',
      genre: 'Science Fiction'
    },
    'Sera Linden': {
      image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200&h=200',
      bio: 'Historical fiction expert whose works explore the intricate social landscapes of 19th-century Europe.',
      genre: 'Historical Fiction'
    },
    'Noah Vale': {
      image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=200&h=200',
      bio: 'Philosopher and essayist whose thought-provoking pieces address existentialism in the digital age.',
      genre: 'Philosophy'
    },
    'Iris Beaumont': {
      image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=200&h=200',
      bio: 'Celebrated poet and lyrical essayist focusing on themes of nature, solitude, and human connection.',
      genre: 'Poetry'
    },
    'Talia Reed': {
      image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&q=80&w=200&h=200',
      bio: 'Biologist turned author, writing gripping narratives about ecological dynamics and climate shifts.',
      genre: 'Science & Nature'
    },
    'Dr. Julian Mercer': {
      image: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=200&h=200',
      bio: 'Cognitive scientist sharing insights into behavioral patterns and human performance.',
      genre: 'Psychology'
    },
    'Ren Kisaragi': {
      image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200&h=200',
      bio: 'Manga artist and graphic novelist blending traditional folklore with cybernetic themes.',
      genre: 'Graphic Novels'
    }
  };

  const defaultDetails = (name) => ({
    image: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(name)}`,
    bio: 'Distinguished author contributing compelling works and rich narratives to our catalog.',
    genre: 'Featured Author'
  });

  const displayedAuthors = authors.slice(0, 2);
  return `
    <section class="section featured-authors-section header-fitting-container">
      <div class="toolbar featured-authors-toolbar" style="margin-bottom: 2rem;">
        <div>
          <div class="hint">Curated Spotlights</div>
          <h2 class="section-title">Featured Authors</h2>
          <p class="section-copy">Meet the creative minds behind our top-rated reads and curated collections.</p>
        </div>
      </div>
      <div class="featured-authors-grid" role="list" aria-label="Featured authors">
        ${displayedAuthors.map((author) => {
    const details = AUTHOR_DETAILS[author.name] || defaultDetails(author.name);
    return `
            <a class="author-profile-card panel" href="#/search?q=${encodeURIComponent(author.name)}" role="listitem">
              <div class="author-profile-image-wrapper">
                <img class="author-profile-image" src="${escapeHtml(details.image)}" alt="${escapeHtml(author.name)}" loading="lazy" />
              </div>
              <div class="author-profile-info">
                <span class="author-profile-genre">${escapeHtml(details.genre)}</span>
                <h3 class="author-profile-name">${escapeHtml(author.name)}</h3>
                <p class="author-profile-bio">${escapeHtml(details.bio)}</p>
                <div class="author-profile-footer">
                  <span class="author-profile-count">📚 ${Number(author.count || 0)} ${author.count === 1 ? 'book' : 'books'}</span>
                  <span class="author-profile-link">View books →</span>
                </div>
              </div>
            </a>
          `;
  }).join('')}
      </div>
    </section>
  `;
}

function renderMiniBook(item) {
  return `
    <article class="mini-book card">
      <div class="mini-cover" style="background: linear-gradient(145deg, ${escapeHtml(item.book.cover_color || '#1f2937')}, rgba(15, 23, 42, 0.9));">
        ${item.book.cover_url ? `<img src="${escapeHtml(item.book.cover_url)}" alt="${escapeHtml(item.book.title)}" style="width:100%;height:100%;object-fit:cover;border-radius:22px;" loading="lazy" />` : `<span class="cover-emoji">${escapeHtml(item.book.emoji || '📚')}</span>`}
      </div>
      <div>
        <h3 class="mini-title"><a href="#/book/${item.book.id}">${escapeHtml(item.book.title)}</a></h3>
        <div class="mini-meta">${escapeHtml(item.book.author)}</div>
        <div class="mini-price"><strong>${formatMoney(item.book.price)}</strong><span class="hint">Subtotal ${formatMoney(item.subtotal)}</span></div>
      </div>
      <div class="cart-controls">
        <button class="qty-button" type="button" data-action="quantity-change" data-book-id="${escapeHtml(item.book.id)}" data-delta="-1">−</button>
        <span class="hint">${Number(item.quantity)}</span>
        <button class="qty-button" type="button" data-action="quantity-change" data-book-id="${escapeHtml(item.book.id)}" data-delta="1">+</button>
      </div>
    </article>
  `;
}

function renderWishlistCard(item) {
  return `
    <article class="wishlist-card card">
      <div class="wishlist-row">
        <div class="wishlist-thumb" style="background: linear-gradient(145deg, ${escapeHtml(item.book.cover_color || '#1f2937')}, rgba(15, 23, 42, 0.9)); display:grid; place-items:center;">
          ${item.book.cover_url ? `<img src="${escapeHtml(item.book.cover_url)}" alt="${escapeHtml(item.book.title)}" style="width:100%;height:100%;object-fit:cover;border-radius:18px;" loading="lazy" />` : `<span class="cover-emoji">${escapeHtml(item.book.emoji || '📚')}</span>`}
        </div>
        <div>
          <h3 class="wishlist-title"><a href="#/book/${item.book.id}">${escapeHtml(item.book.title)}</a></h3>
          <div class="hint">${escapeHtml(item.book.author)} · ${escapeHtml((item.book.genres && item.book.genres.length ? item.book.genres.join(' • ') : item.book.genre) || 'Book')}</div>
        </div>
        <div class="mini-price"><strong>${formatMoney(item.book.price)}</strong></div>
      </div>
      <div class="card-actions">
        <button class="secondary-button" type="button" data-action="add-to-cart" data-book-id="${escapeHtml(item.book.id)}">Add to cart</button>
        <button class="ghost-button" type="button" data-action="toggle-wishlist" data-book-id="${escapeHtml(item.book.id)}">Remove</button>
      </div>
    </article>
  `;
}

function renderOrderCard(order) {
  return `
    <article class="order-card card">
      <div class="order-head">
        <div class="order-meta">${new Date(order.created_at).toLocaleString()}</div>
        <h3 class="order-title">Order ${escapeHtml(order.id.slice(0, 8))}</h3>
        <div class="order-meta">${escapeHtml(order.status)} · ${order.items.length} item(s)</div>
      </div>
      <div class="table-list">
        ${order.items.map((item) => `
          <div class="order-item">
            <div class="order-thumb" style="background: linear-gradient(145deg, ${escapeHtml(item.cover_color || '#1f2937')}, rgba(15, 23, 42, 0.9)); display:grid; place-items:center;">
              ${item.cover_url ? `<img src="${escapeHtml(item.cover_url)}" alt="${escapeHtml(item.title)}" style="width:100%;height:100%;object-fit:cover;border-radius:14px;" loading="lazy" />` : `<span class="cover-emoji">${escapeHtml(item.emoji || '📚')}</span>`}
            </div>
            <div>
              <strong>${escapeHtml(item.title || 'Book')}</strong>
              <div class="hint">Qty ${Number(item.quantity)} · ${formatMoney(item.unit_price)}</div>
            </div>
            <div class="hint">${formatMoney(Number(item.quantity) * Number(item.unit_price))}</div>
          </div>
        `).join('')}
      </div>
      <div class="page-actions">
        <strong>Total ${formatMoney(order.total)}</strong>
        <button class="ghost-button" type="button" data-action="open-order" data-order-id="${escapeHtml(order.id)}">View</button>
      </div>
    </article>
  `;
}

function renderReviewCard(review) {
  const avatar = review.avatar_url || `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(review.user_name || 'reviewer')}`;
  return `
    <article class="review-card">
      <div class="review-meta">
        <img class="review-avatar" src="${escapeHtml(avatar)}" alt="${escapeHtml(review.user_name || 'Reviewer')}" loading="lazy" />
        <div>
          <strong class="review-author">${escapeHtml(review.user_name || 'Reviewer')}</strong>
          <div class="review-date">${new Date(review.created_at).toLocaleDateString()}</div>
        </div>
        <div class="hint">${renderStars(review.rating)}</div>
      </div>
      <p class="review-body">${escapeHtml(review.body || '')}</p>
    </article>
  `;
}

function renderSkeletonGrid(count = 8) {
  return `<div class="skeleton-grid">${Array.from({ length: count }, () => '<div class="skeleton" style="min-height: 22rem;"></div>').join('')}</div>`;
}

function renderPaginator(page, totalPages) {
  const safeTotalPages = Math.max(Number(totalPages || 1), 1);
  const safePage = Math.min(Math.max(Number(page || 1), 1), safeTotalPages);
  const visibleWindow = 2;
  const visiblePages = new Set([1, safeTotalPages]);

  for (let number = safePage - visibleWindow; number <= safePage + visibleWindow; number += 1) {
    if (number > 1 && number < safeTotalPages) {
      visiblePages.add(number);
    }
  }

  const orderedPages = Array.from(visiblePages).sort((left, right) => left - right);
  const paginationMarkup = orderedPages.map((number, index) => {
    const previous = orderedPages[index - 1];
    const gap = previous && number - previous > 1;
    return `${gap ? '<span class="page-ellipsis" aria-hidden="true">…</span>' : ''}<button class="page-number ${number === safePage ? 'is-active' : ''}" type="button" data-action="set-page" data-page="${number}">${number}</button>`;
  }).join('');

  return `
    <div class="pagination" aria-label="Book pages">
      ${paginationMarkup}
    </div>
  `;
}

function renderHeroTypewriter() {
  const dynamicGenres = Array.isArray(state.genres) && state.genres.length ? state.genres : genreSeed;
  const text = dynamicGenres[state.typewriterIndex % dynamicGenres.length];
  return `<span class="typewriter">${escapeHtml(text)}</span>`;
}

function renderChatbotWidget() {
  const quickKeys = ['shipping', 'payment', 'returns', 'promotions', 'support'];
  const messagesMarkup = state.chatbotMessages.map((message) => `
    <div class="chatbot-msg ${message.role === 'user' ? 'is-user' : 'is-bot'}">${escapeHtml(message.text)}</div>
  `).join('');

  return `
    <div class="chatbot-float ${state.chatbotOpen ? 'is-open' : ''}">
      <button class="chatbot-toggle" type="button" data-action="toggle-chatbot" aria-expanded="${state.chatbotOpen ? 'true' : 'false'}">
        <span class="chatbot-toggle-icon" aria-hidden="true">💬</span>
        <span class="chatbot-toggle-label">Help</span>
      </button>
      <div class="chatbot-panel" aria-hidden="${state.chatbotOpen ? 'false' : 'true'}">
        <div class="chatbot-head">
          <strong>Booksta Assistant</strong>
          <button class="chatbot-close" type="button" data-action="toggle-chatbot">✕</button>
        </div>
        <div class="chatbot-body">${messagesMarkup}</div>
        <div class="chatbot-quick">
          ${quickKeys.map((key) => `<button type="button" class="chatbot-chip" data-action="chatbot-quick" data-chat-key="${key}">${escapeHtml(key.charAt(0).toUpperCase() + key.slice(1))}</button>`).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderFloatingUi() {
  const mount = document.getElementById('floating-ui');
  if (!mount) return;

  // Ensure chatbot float is present
  if (!mount.querySelector('.chatbot-float')) {
    const chatbotWrapper = document.createElement('div');
    chatbotWrapper.innerHTML = renderChatbotWidget();
    mount.appendChild(chatbotWrapper.firstElementChild);
    setTimeout(positionChatbotFromStorage, 0);
  }

  // Ensure auth-modal-container exists
  let authContainer = document.getElementById('auth-modal-container');
  if (!authContainer) {
    authContainer = document.createElement('div');
    authContainer.id = 'auth-modal-container';
    mount.appendChild(authContainer);
  }

  // Render auth modal if in auth route
  const name = state.route?.name;
  if (name === 'login' || name === 'register' || name === 'reset-password') {
    let authHtml = '';
    if (name === 'reset-password') {
      const stage = state.route?.params?.stage === 'confirm' ? 'confirm' : 'request';
      authHtml = stage === 'confirm' ? renderResetPasswordConfirmView() : renderResetPasswordRequestView();
    } else {
      authHtml = renderAuthView(name === 'login' ? 'login' : 'register');
    }
    authContainer.innerHTML = authHtml;
  } else {
    authContainer.innerHTML = '';
  }
}

function syncChatbotMode() {
  document.body.classList.toggle('is-mobile-chatbot', window.innerWidth <= 700);
}

function getChatbotNode() {
  return document.querySelector('.chatbot-float');
}

function positionChatbotFromStorage() {
  const root = getChatbotNode();
  if (!root) return;

  try {
    const stored = JSON.parse(localStorage.getItem('bookstaChatbotPos') || 'null');
    if (!stored || typeof stored.left !== 'number' || typeof stored.top !== 'number') {
      return;
    }

    // Ensure the root has a usable width. Some browsers report 0 when
    // children are absolutely positioned or the element is freshly mounted.
    if (!root.offsetWidth || root.getBoundingClientRect().width === 0) {
      const toggle = root.querySelector('.chatbot-toggle');
      const fallback = (toggle && toggle.getBoundingClientRect && toggle.getBoundingClientRect().width) || 52;
      root.style.minWidth = `${Math.ceil(fallback)}px`;
      // Force a reflow so offsetWidth becomes available for calculations
      // below.
      // eslint-disable-next-line no-unused-expressions
      root.offsetWidth;
    }

    const maxLeft = Math.max(8, window.innerWidth - root.offsetWidth - 8);
    const maxTop = Math.max(8, window.innerHeight - root.offsetHeight - 8);
    const left = Math.max(8, Math.min(maxLeft, stored.left));
    const top = Math.max(8, Math.min(maxTop, stored.top));

    root.style.left = `${left}px`;
    root.style.top = `${top}px`;
    root.style.right = 'auto';
    root.style.bottom = 'auto';
  } catch (error) {
    console.warn('chatbot position restore failed', error);
  }
}

function startChatbotDrag(event) {
  const root = getChatbotNode();
  if (!root || (event.pointerType === 'mouse' && event.button !== 0)) return;

  event.preventDefault();
  state.chatbotDrag.active = true;
  state.chatbotDrag.moved = false;
  state.chatbotDrag.startX = event.clientX;
  state.chatbotDrag.startY = event.clientY;

  const rect = root.getBoundingClientRect();
  state.chatbotDrag.originLeft = rect.left;
  state.chatbotDrag.originTop = rect.top;
  root.style.transition = 'none';
  root.setPointerCapture?.(event.pointerId);
}

function moveChatbotDrag(event) {
  if (!state.chatbotDrag.active) return;

  const root = getChatbotNode();
  if (!root) return;

  const dx = event.clientX - state.chatbotDrag.startX;
  const dy = event.clientY - state.chatbotDrag.startY;
  if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
    state.chatbotDrag.moved = true;
  }

  const maxLeft = Math.max(8, window.innerWidth - root.offsetWidth - 8);
  const maxTop = Math.max(8, window.innerHeight - root.offsetHeight - 8);
  const left = Math.max(8, Math.min(maxLeft, state.chatbotDrag.originLeft + dx));
  const top = Math.max(8, Math.min(maxTop, state.chatbotDrag.originTop + dy));

  root.style.left = `${left}px`;
  root.style.top = `${top}px`;
  root.style.right = 'auto';
  root.style.bottom = 'auto';
}

function endChatbotDrag(event) {
  if (!state.chatbotDrag.active) return;

  const root = getChatbotNode();
  state.chatbotDrag.active = false;

  if (root) {
    root.style.transition = '';
    const rect = root.getBoundingClientRect();
    localStorage.setItem('bookstaChatbotPos', JSON.stringify({ left: rect.left, top: rect.top }));
    root.releasePointerCapture?.(event.pointerId);
  }
}

function getWeeklyFeaturedAuthor() {
  // Use DB-sourced authors if available (from /api/featured-authors)
  const dbAuthors = Array.isArray(state.featuredAuthors) && state.featuredAuthors.length
    ? state.featuredAuthors
    : null;

  const authors = dbAuthors || [
    {
      name: "Elena Voss",
      badge: "Featured Author",
      specialty: "High Fantasy & Sci-Fi",
      description: "Elena Voss is an acclaimed author specializing in epic world-building and complex magical systems. Her novels transport readers to distant realms full of danger, intrigue, and unforgettable heroes.",
      publishedBooks: 8,
      readers: "2M+",
      image: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=600",
      query: "Elena Voss"
    },
    {
      name: "Mason Pike",
      badge: "Featured Author",
      specialty: "Crime Fiction & Mystery",
      description: "Mason Pike is a master of suspense, known for fast-paced thrillers that keep readers guessing until the very last page. Drawing from years of investigative journalism, his stories feel incredibly real and gritty.",
      publishedBooks: 12,
      readers: "4M+",
      image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=600",
      query: "Mason Pike"
    },
    {
      name: "Sera Linden",
      badge: "Featured Author",
      specialty: "Contemporary Romance & Drama",
      description: "Sera Linden writes emotional, heartwarming contemporary fiction exploring relationships, family dynamics, and second chances. Her rich prose and relatable characters have won her a dedicated global following.",
      publishedBooks: 15,
      readers: "3M+",
      image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&q=80&w=600",
      query: "Sera Linden"
    },
    {
      name: "Noah Vale",
      badge: "Featured Author",
      specialty: "Historical Fiction & Biographies",
      description: "Noah Vale is a historian and novelist dedicated to bringing the past to life. Through rigorous research and cinematic narration, his biographies and historical epics reveal the human stories behind major events.",
      publishedBooks: 6,
      readers: "1M+",
      image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=600",
      query: "Noah Vale"
    }
  ];

  // Cycle monthly — uses absolute month index so it advances each calendar month
  const now = new Date();
  const monthIndex = now.getFullYear() * 12 + now.getMonth();
  const authorIndex = monthIndex % authors.length;
  const author = authors[authorIndex];

  // Normalize DB author shape to match the expected UI shape
  if (dbAuthors) {
    return {
      name: author.name || '',
      badge: 'Featured Author',
      specialty: author.specialty || '',
      description: author.description || '',
      publishedBooks: author.published_books || author.publishedBooks || 0,
      readers: author.readers || '0',
      image: author.image_url || author.image || '',
      query: author.name || ''
    };
  }
  return author;
}

function renderHomeView() {
  const weeklyAuthor = getWeeklyFeaturedAuthor();
  const isSearchMode = Boolean(String(state.search || '').trim());
  const whatsappNumber = String(state.settings?.whatsappNumber || '250782781575').replace(/[^\d+]/g, '');
  const featuredCount = state.featured.length;
  const genreCount = state.genres.length;
  const featuredAuthors = state.featuredAuthors || [];
  const topGenres = getTopGenres(16);
  let heroBooks = Array.isArray(state.featured) ? [...state.featured] : [];
  if (heroBooks.length < 5 && Array.isArray(state.books)) {
    for (const book of state.books) {
      if (heroBooks.length >= 5) break;
      if (!heroBooks.some((b) => b.id === book.id)) {
        heroBooks.push(book);
      }
    }
  }
  const staticPlaceholders = [
    { id: 'ph-1', title: 'The Quiet Library', author: 'Various', cover_color: '#334155', price: 1200, avg_rating: 4.5, review_count: 12, emoji: '📘' },
    { id: 'ph-2', title: 'Night Stories', author: 'A. Storyteller', cover_color: '#0f172a', price: 980, avg_rating: 4.2, review_count: 8, emoji: '📗' },
    { id: 'ph-3', title: 'Journeys', author: 'M. Traveler', cover_color: '#7c3aed', price: 1500, avg_rating: 4.7, review_count: 21, emoji: '📙' },
    { id: 'ph-4', title: 'Deep Ocean', author: 'S. Diver', cover_color: '#0369a1', price: 1100, avg_rating: 4.4, review_count: 15, emoji: '📕' },
    { id: 'ph-5', title: 'Lost Woods', author: 'E. Ranger', cover_color: '#15803d', price: 1350, avg_rating: 4.6, review_count: 19, emoji: '📓' }
  ];
  if (heroBooks.length < 5) {
    for (const ph of staticPlaceholders) {
      if (heroBooks.length >= 5) break;
      if (!heroBooks.some((b) => b.id === ph.id)) {
        heroBooks.push(ph);
      }
    }
  }

  // Ensure it has exactly 5 books
  heroBooks = heroBooks.slice(0, 5);


  const featuredMarkup = heroBooks.length
    ? `<div class="books-grid hero-feature-grid">${heroBooks.map((book) => renderBookCard(book, { showShare: false })).join('')}</div>`
    : renderSkeletonGrid(4);

  const booksMarkup = state.homeLoading
    ? renderSkeletonGrid(12)
    : state.books.length
      ? `<div class="books-grid">${state.books.map(renderBookCard).join('')}</div>`
      : `<div class="empty-state"><p>No books match your current filters.</p><button class="primary-button" type="button" data-action="reset-filters">Clear filters</button></div>`;

  const activePromo = Array.isArray(state.promotions) && state.promotions.length
    ? (state.promotions.find((p) => p.code === 'READ20') || state.promotions[0])
    : null;

  const badgeHtml = '';

  return `
    <section class="page home-page full-width">
      <div class="hero">
        <div class="hero-inner">
          <div class="hero-left">
            <span class="hero-badge">NEW SEASON</span>
            <h1 class="hero-title">Booksta.<br>for readers who want the <span class="highlight">shelf to feel alive</span>.</h1>
            <p class="hero-copy">
              Explore curated picks, filter by genre, save favorites, and checkout with confidence. The catalog updates in real time — use the header search, pagination, and reader-powered ratings to find your next great read.
            </p>
            <div class="hero-copy typewriter-container">Featured book genre: <span class="typewriter">${escapeHtml(getBookGenres(heroBooks[0])[0] || 'Fiction')}</span></div>
            <div class="hero-cta">
              <a class="primary-button" href="#/books">Browse books</a>
              <a class="secondary-button" href="#/cart">View cart</a>
            </div>
            <div class="hero-trust-badges">
              <div class="trust-badge">🛡️ Secure Payments</div>
              <div class="trust-badge">📦 Delivery Nationwide</div>
            </div>
          </div>

          <div class="hero-panel">
            ${isSearchMode
      ? `<div class="glass-card">
                   <div class="hint">Search results</div>
                   <h3 class="mini-title" style="margin:0;">\"${escapeHtml(state.search)}\"</h3>
                   <p class="section-copy">Found ${Number(state.total || state.books.length || 0)} matching book(s). Browse the results section below.</p>
                 </div>`
      : `<div class="hero-showcase-container">
                   <button class="hero-arrow prev" aria-label="Previous Slide">←</button>
                   ${heroBooks.map((book, idx) => `
                     <div class="hero-showcase-slide ${idx === 0 ? 'active' : ''}" data-slide-index="${idx}" data-genre="${escapeHtml(getBookGenres(book)[0] || 'Fiction')}">
                       ${book.cover_url
          ? `<img class="hero-showcase-img" src="${escapeHtml(book.cover_url)}" alt="${escapeHtml(book.title)}" />`
          : `<div class="hero-showcase-emoji-placeholder" style="background: linear-gradient(135deg, ${escapeHtml(book.cover_color || '#1f2937')}, rgba(15, 23, 42, 0.9));">
                              <span class="hero-showcase-emoji">${escapeHtml(book.emoji || '📚')}</span>
                            </div>`
        }
                     </div>
                   `).join('')}
                   <button class="hero-arrow next" aria-label="Next Slide">→</button>
                 </div>
                 <div class="hero-showcase-controls">
                   <div class="hero-pagination">
                     ${heroBooks.map((_, idx) => `
                       <span class="dot ${idx === 0 ? 'active' : ''}" data-slide-dot="${idx}"></span>
                     `).join('')}
                   </div>
                 </div>`
    }
          </div>
        </div>
      </div>

      <div class="homepage-stats-row">
        <div class="stat-col">
          <div class="stat-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="1" y="3" width="15" height="13" rx="2" ry="2"></rect>
              <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
              <circle cx="5.5" cy="18.5" r="2.5"></circle>
              <circle cx="18.5" cy="18.5" r="2.5"></circle>
            </svg>
          </div>
          <div class="stat-info">
            <span class="stat-title">Nationwide Shipping</span>
            <span class="stat-desc">Kigali city and Provinces</span>
          </div>
        </div>
        <div class="stat-col">
          <div class="stat-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              <path d="m9 11 2 2 4-4"></path>
            </svg>
          </div>
          <div class="stat-info">
            <span class="stat-title">Secure Payment</span>
            <span class="stat-desc">100% Secure Payment</span>
          </div>
        </div>
        <div class="stat-col">
          <div class="stat-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l4.58-4.58c.94-.94.94-2.48 0-3.42L12 2Z"></path>
              <path d="M7 7h.01"></path>
            </svg>
          </div>
          <div class="stat-info">
            <span class="stat-title">Best Price</span>
            <span class="stat-desc">Guaranteed Price</span>
          </div>
        </div>
      </div>

      <section class="section" style="margin-top: 5rem !important;">
        <div class="toolbar" style="margin-bottom: 2.5rem; position: relative; display: flex; justify-content: center; align-items: center; width: 100%; min-height: 48px;">
          <h2 class="section-title" style="margin: 0; font-size: 2.2rem; text-align: center; width: 100%;">Explore books</h2>
          <span class="view-all-link" data-action="view-all-books" style="position: absolute; right: 0; top: 50%; transform: translateY(-50%); cursor: pointer; font-size: 0.95rem; font-weight: 600; color: var(--accent); transition: all 0.2s ease; display: inline-flex; align-items: center; gap: 0.25rem;">
            View all <span style="font-size: 1.1rem; line-height: 1;">&rarr;</span>
          </span>
        </div>
        ${booksMarkup}
        ${state.homeLoading ? '' : renderPaginator(state.page, state.totalPages || 1)}
      </section>


      <section class="section featured-author-section">
        <h2 class="section-title text-center" style="text-align: center !important;">Featured Author</h2>
        <div class="featured-author-grid">
          <div class="author-image-column">
            <img src="${escapeHtml(weeklyAuthor.image)}" alt="${escapeHtml(weeklyAuthor.name)}" class="featured-author-img" />
          </div>
          <div class="author-details-column">
            <span class="author-badge">${escapeHtml(weeklyAuthor.badge)}</span>
            <h3 class="featured-author-name">${escapeHtml(weeklyAuthor.name)}</h3>
            <p class="author-genre-specialty">Specializes in ${escapeHtml(weeklyAuthor.specialty)}</p>
            <p class="featured-author-description">
              ${escapeHtml(weeklyAuthor.description)}
            </p>
            <div class="author-stats">
              <div class="author-stat-item">
                <span class="stat-value">${weeklyAuthor.publishedBooks}</span>
                <span class="stat-label">Published Books</span>
              </div>
              <div class="author-stat-item">
                <span class="stat-value">${escapeHtml(weeklyAuthor.readers)}</span>
                <span class="stat-label">Readers Globally</span>
              </div>
            </div>
            <a class="secondary-button" href="#/search?search=${encodeURIComponent(weeklyAuthor.query)}" style="margin-top: 1.5rem !important; display: inline-block !important;">Explore books</a>
          </div>
        </div>
      </section>

      <section class="section ready-to-read-section">
        <h2 class="ready-title">Ready to Start Reading?</h2>
        <p class="ready-copy">
          Join thousands of readers discovering their next favorite book. Sign up today to unlock wishlist, reviews, and personalized recommendations.
        </p>
        <div class="ready-actions">
          <a class="primary-button ready-btn-primary" href="#/register">Create Account</a>
          <a class="secondary-button ready-btn-secondary" href="#/books">Browse Now</a>
        </div>
      </section>

      ${state.user && state.recommendations.length ? `
        <section class="section home-recommendations-section">
          <div class="toolbar" style="margin-bottom: 2.5rem; position: relative; display: flex; justify-content: center; align-items: center; width: 100%; min-height: 48px;">
            <h2 class="section-title" style="margin: 0; font-size: 2.2rem; text-align: center; width: 100%;">Recommended for you</h2>
            <a class="view-all-link" href="#/notifications" style="position: absolute; right: 0; top: 50%; transform: translateY(-50%); cursor: pointer; font-size: 0.95rem; font-weight: 600; color: var(--accent); transition: all 0.2s ease; display: inline-flex; align-items: center; gap: 0.25rem; text-decoration: none;">
              See all recommendations <span style="font-size: 1.1rem; line-height: 1;">&rarr;</span>
            </a>
          </div>
          <div class="books-grid">${state.recommendations.slice(0, 4).map(book => renderBookCard(book)).join('')}</div>
        </section>
      ` : ''}

      ${(() => {
      // Dynamic bestseller discount: find highest-discount book from DB
      const allBooks = [...(state.books || []), ...(state.featured || [])];
      // Deduplicate by id
      const seen = new Set();
      const uniqueBooks = allBooks.filter(b => { if (seen.has(b.id)) return false; seen.add(b.id); return true; });

      // Pick book with largest % discount (original_price > price)
      let promoBook = uniqueBooks
        .filter(b => b.original_price && b.price && Number(b.original_price) > Number(b.price))
        .sort((a, b) => {
          const discA = (Number(a.original_price) - Number(a.price)) / Number(a.original_price);
          const discB = (Number(b.original_price) - Number(b.price)) / Number(b.original_price);
          return discB - discA;
        })[0];

      // Fallback: highest rated/featured book
      if (!promoBook) {
        promoBook = uniqueBooks.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0))[0];
      }

      if (!promoBook) {
        // Ultimate fallback if no books loaded yet
        return `<section class="section promotions-section full-width full-bleed">
          <div class="promo-editorial-container">
            <div class="promo-left-image">
              <img src="assets/atomic_habits.png" alt="Featured Bestseller" class="yellow-book-img" style="border-radius: 12px; box-shadow: 0 15px 35px rgba(0,0,0,0.3) !important;" />
            </div>
            <div class="promo-details-content">
              <span class="promo-category-tag">Bestseller Discount</span>
              <h2 class="promo-editorial-title">Special Offers<br><span class="highlight-title">Today's Deals</span></h2>
              <p class="promo-editorial-text">Discover great deals on our bestselling books. Limited time offers on top titles.</p>
              <a class="promo-shop-now-btn" href="#/books">Shop Now</a>
            </div>
          </div>
        </section>`;
      }

      const discountPct = promoBook.original_price && promoBook.price
        ? Math.round((1 - Number(promoBook.price) / Number(promoBook.original_price)) * 100)
        : 0;

      const coverImg = promoBook.cover_url || promoBook.cover_image_url || promoBook.thumbnail || '';
      const coverMarkup = coverImg
        ? `<img src="${escapeHtml(coverImg)}" alt="${escapeHtml(promoBook.title || '')}" class="yellow-book-img" style="border-radius: 12px; box-shadow: 0 15px 35px rgba(0,0,0,0.3) !important; object-fit: cover; width: 220px; height: 300px;" />`
        : `<div class="yellow-book-img" style="width:220px;height:300px;border-radius:12px;background:var(--card-bg);display:flex;align-items:center;justify-content:center;font-size:4rem;">📖</div>`;

      const displayTitle = promoBook.title ? promoBook.title.length > 30 ? promoBook.title.substring(0, 30) + '…' : promoBook.title : 'Featured Pick';
      const authorName = promoBook.author || '';
      const tagline = discountPct > 0
        ? `${discountPct}% Off — ${authorName ? `by ${authorName}` : 'Limited Time Offer'}`
        : `Featured Bestseller${authorName ? ` by ${authorName}` : ''}`;
      const description = promoBook.description
        ? promoBook.description.substring(0, 150) + (promoBook.description.length > 150 ? '…' : '')
        : 'A must-read book available now at Booksta. Grab your copy before the deal ends!';
      const label = discountPct > 0 ? `${discountPct}% Discount` : 'Featured Deal';

      return `<section class="section promotions-section full-width full-bleed">
          <div class="promo-editorial-container">
            <div class="promo-left-image">
              ${coverMarkup}
            </div>
            <div class="promo-details-content">
              <span class="promo-category-tag">${escapeHtml(label)}</span>
              <h2 class="promo-editorial-title">${escapeHtml(tagline)}<br><span class="highlight-title">${escapeHtml(displayTitle)}</span></h2>
              <p class="promo-editorial-text">${escapeHtml(description)}</p>
              <a class="promo-shop-now-btn" href="#/book/${promoBook.id}">Shop Now</a>
            </div>
          </div>
        </section>`;
    })()}

      <!-- Kids Books Advertisement Section -->
      ${(() => {
      const kidsBooks = state.kidsBooks || [];
      const kidsBooksMarkup = kidsBooks.length
        ? kidsBooks.map(book => renderBookCard(book, { showShare: false })).join('')
        : `<p class="kids-no-books">Kids books coming soon!</p>`;

      return `
        <section class="section kids-promo-section full-width full-bleed">
          <div class="kids-promo-layout">
            <!-- Left: Text content -->
            <div class="kids-promo-content">
              <span class="kids-category-tag">Kids Collection</span>
              <h2 class="kids-promo-title">Spark Their Imagination</h2>
              <p class="kids-promo-text">
                Discover our curated selection of colorful storybooks, educational adventures, and bedtime tales designed to inspire young minds and foster a lifelong love for reading.
              </p>
              <a class="kids-promo-btn" href="#/books?genre=Kids">Explore Kids Books</a>
            </div>

            <!-- Right: Featured Kids book cards side by side -->
            <div class="kids-books-row">
              ${kidsBooksMarkup}
            </div>
          </div>
        </section>`;
    })()}

      <!-- Wonderful Gifts Promo Banner Section -->
      <section class="section promo-banner-section" style="background-image: linear-gradient(rgba(15, 27, 33, 0.76), rgba(15, 27, 33, 0.76)), url('https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&q=80&w=1200') !important; background-attachment: scroll !important; background-position: center !important; background-size: cover !important; border: none !important;">
        <div class="promo-banner-content" style="padding: 4.5rem 2rem !important; text-align: center !important; color: #ffffff !important; display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; width: 100% !important; max-width: 650px !important; margin: 0 auto !important; box-sizing: border-box !important;">
          <h2 class="promo-title" style="font-size: 2.6rem !important; font-weight: 700 !important; margin-bottom: 0.5rem !important; color: #ffffff !important; letter-spacing: -0.02em !important; font-family: var(--font-body) !important; text-transform: none !important;">Wonderful Gifts</h2>
          <p class="promo-subtitle" style="font-size: 1.15rem !important; opacity: 0.95 !important; margin-bottom: 1.8rem !important; color: #cbd5e1 !important; line-height: 1.5 !important; font-family: var(--font-body) !important;">Give your family and friends a book</p>
          <a class="primary-button promo-btn" href="#/books" style="padding: 0.75rem 2.2rem !important; font-weight: 600 !important; border-radius: 999px !important; letter-spacing: 0.05em !important; text-transform: uppercase !important; display: inline-block !important; text-decoration: none !important; font-size: 0.9rem !important;">Shop Now</a>
        </div>
      </section>

      <!-- Newsletter Subscription Section -->
      <section class="section newsletter-section full-width full-bleed">
        <div class="newsletter-container">
          <h2 class="newsletter-title">Subscribe to our Newsletter</h2>
          <p class="newsletter-subtitle">
            Enter your email address to receive regular updates, as well as news on upcoming events and specific offers.
          </p>
          <form class="newsletter-form" data-form="newsletter">
            <div class="newsletter-form-group">
              <input type="email" name="email" placeholder="Email Address" required class="newsletter-input" />
              <button type="submit" class="newsletter-submit-btn">Subscribe</button>
            </div>
          </form>
        </div>
      </section>

    </section>
  `;
}
/*
function renderSearchViewFixed() {
  const query = String(state.search || '').trim();
  const genre = String(state.genre || '').trim();
  const resultCount = Number(state.total || state.books.length || 0);
  const booksMarkup = state.homeLoading
    ? renderSkeletonGrid(12)
    : state.books.length
      ? `<div class="books-grid">${state.books.map(renderBookCard).join('')}</div>`
      : `<div class="empty-state"><p>No books match "${escapeHtml(genre || query)}".</p><a class="primary-button" href="#/">Back to home</a></div>`;

  return `
    <section class="page search-page full-width">
      <section class="section">
        <div class="search-header-container" style="text-align: center; margin-bottom: 2.5rem; display: flex; flex-direction: column; align-items: center;">
          <h2 class="section-title" style="font-size: 2.2rem; margin-bottom: 0.6rem; text-align: center;">
            ${genre ? `Explore ${escapeHtml(genre)}` : query ? `Search Results for "${escapeHtml(query)}"` : 'Refine Results'}
          </h2>
          <p class="section-copy" style="max-width: 600px; margin: 0 auto 1.5rem auto; font-size: 1.05rem; opacity: 0.85; text-align: center; line-height: 1.6;">
            ${genre 
              ? `Browse our handpicked collection of prime ${escapeHtml(genre)} masterpieces.` 
              : query 
                ? `Here are the matching matches we found for your query "${escapeHtml(query)}".` 
                : 'Browse our catalog using the controls below to find your next favorite read.'}
          </p>
          <div class="filter-row" style="justify-content: center; display: flex; gap: 0.75rem; align-items: center;">
            <select class="select" data-action="sort-books" style="width: auto !important; min-width: 140px !important;">
              ${[
                ['featured', 'Featured'],
                ['price_asc', 'Price: Low to High'],
                ['price_desc', 'Price: High to Low'],
                ['rating', 'Top Rated'],
                ['title_asc', 'Title A-Z']
              ].map(([value, label]) => `<option value="${value}" ${state.sort === value ? 'selected' : ''}>${label}</option>`).join('')}
      </form>
    `
    : '<div class="panel"><a class="primary-button" href="#/login">Sign in to review</a></div>';

  return `
    <section class="page book-detail">
      <div class="product-breadcrumbs">
        <a href="#/">Home</a>
        <span class="breadcrumb-separator">/</span>
        <a href="#/books">Explore Catalog</a>
        <span class="breadcrumb-separator">/</span>
        <span class="breadcrumb-current">${escapeHtml(book.title)}</span>
      </div>

      <div class="detail-grid">
        <div class="panel detail-cover-panel">
          <div class="detail-cover">
            ${book.cover_url ? `<img src="${escapeHtml(book.cover_url)}" alt="${escapeHtml(book.title)}" />` : `<span class="cover-emoji">${escapeHtml(book.emoji || '📚')}</span>`}
          </div>
        </div>

        <div class="panel detail-book">
          <div class="detail-header">
            <div class="pill">${escapeHtml((book.genres && book.genres.length ? book.genres.join(' • ') : book.genre) || 'Book')}</div>
            <h1 class="detail-title">${escapeHtml(book.title)}</h1>
            <div class="detail-subtitle product-author-by">by <span class="author-name">${escapeHtml(book.author)}</span></div>
            <div class="detail-price">
              <strong class="price-current">${formatMoney(book.price)}</strong>
              ${book.original_price ? `<span class="price-old">${formatMoney(book.original_price)}</span>` : ''}
            </div>
          </div>

          <div class="detail-meta">
            <span class="hint">${renderStars(book.avg_rating)} ${Number(book.review_count)} reviews</span>
            <span class="hint">${book.stock} in stock</span>
            <span class="hint">${book.pages || '—'} pages · ${book.year || '—'}</span>
          </div>

          <div class="detail-actions" style="margin-top: 1.5rem; margin-bottom: 1.5rem;">
            <button class="icon-button compact-action-button cart-icon-button" type="button" data-action="add-to-cart" data-book-id="${escapeHtml(book.id)}" aria-label="Add ${escapeHtml(book.title)} to cart">🛒</button>
            <button class="icon-button compact-action-button share-icon-button" type="button" data-action="share-book" data-book-id="${escapeHtml(book.id)}" aria-label="Share ${escapeHtml(book.title)}">↗</button>
            <button class="icon-button compact-action-button wishlist-icon-button ${isWishlisted ? 'is-active' : ''}" type="button" data-action="toggle-wishlist" data-book-id="${escapeHtml(book.id)}" aria-pressed="${isWishlisted ? 'true' : 'false'}" aria-label="${isWishlisted ? 'Remove' : 'Add'} ${escapeHtml(book.title)} ${isWishlisted ? 'from' : 'to'} wishlist">${isWishlisted ? '♥' : '♡'}</button>
            <button class="secondary-button compact-buy-button" type="button" data-action="buy-now" data-book-id="${escapeHtml(book.id)}">Buy</button>
          </div>

          <!-- CSS Tabs Container -->
          <div class="book-tabs-container">
            <input type="radio" id="book-tab-about" name="book-detail-tabs" checked class="book-tab-radio" />
            <input type="radio" id="book-tab-specs" name="book-detail-tabs" class="book-tab-radio" />
            <input type="radio" id="book-tab-reviews" name="book-detail-tabs" class="book-tab-radio" />

            <div class="book-tab-nav">
              <label for="book-tab-about" class="book-tab-label">About the Book</label>
              <label for="book-tab-specs" class="book-tab-label">Specifications</label>
              <label for="book-tab-reviews" class="book-tab-label">Reviews (${state.currentReviews.length})</label>
            </div>

            <div class="book-tab-content">
              <div class="book-tab-panel panel-about">
                <p class="hero-copy" style="margin-top: 1rem;">
                  ${escapeHtml(displayDesc)}
                  ${toggleButtonMarkup}
                </p>
              </div>

              <div class="book-tab-panel panel-specs">
                <div style="margin-top: 1rem;">
                  <table class="specs-table">
                    <tr>
                      <th>Author</th>
                      <td>${escapeHtml(book.author)}</td>
                    </tr>
                    <tr>
                      <th>Genre</th>
                      <td>${escapeHtml((book.genres && book.genres.length ? book.genres.join(', ') : book.genre) || 'General')}</td>
                    </tr>
                    <tr>
                      <th>Publication Year</th>
                      <td>${escapeHtml(String(book.year || 'N/A'))}</td>
                    </tr>
                    <tr>
                      <th>Pages</th>
                      <td>${escapeHtml(String(book.pages || 'N/A'))}</td>
                    </tr>
                    <tr>
                      <th>ISBN</th>
                      <td>${escapeHtml(book.isbn || 'N/A')}</td>
                    </tr>
                  </table>
                </div>
              </div>

              <div class="book-tab-panel panel-reviews">
                <div class="reviews-tab-layout">
                  <div class="reviews-list-panel">${reviewsMarkup}</div>
                  <div class="reviews-form-panel">${reviewFormMarkup}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      ${state.recommendations.length ? `
        <section class="section">
          <h2 class="section-title">Recommended for you</h2>
          <div class="recommendation-rail">${state.recommendations.map(renderRecommendationTile).join('')}</div>
        </section>
      ` : ''}
    </section>
  `;
}
*/

function renderNotificationItem(notification) {
  const isRead = Boolean(notification.read_at);
  return `
    <article class="notification-card card ${isRead ? 'is-read' : 'is-unread'}">
      <div class="notification-meta">
        <div>
          <div class="hint">${escapeHtml(notification.type.replaceAll('_', ' '))}</div>
          <h3 class="mini-title">${escapeHtml(notification.title)}</h3>
        </div>
        <span class="pill">${new Date(notification.created_at).toLocaleDateString()}</span>
      </div>
      <p class="section-copy" style="margin:0.4rem 0 0.8rem 0;">${escapeHtml(notification.body)}</p>
      <div class="notification-actions">
        ${notification.book ? `<a class="secondary-button" href="#/book/${notification.book.id}">Open book</a>` : ''}
        ${isRead ? '<span class="pill">Read</span>' : `<button class="primary-button" type="button" data-action="mark-notification-read" data-notification-id="${escapeHtml(notification.id)}">Mark read</button>`}
      </div>
    </article>
  `;
}

function renderSearchView() {
  const query = String(state.search || '').trim();
  const genre = String(state.genre || '').trim();
  const resultCount = Number(state.total || state.books.length || 0);
  const booksMarkup = state.booksLoading
    ? renderSkeletonGrid(12)
    : state.books.length
      ? `<div class="books-grid">${state.books.map(renderBookCard).join('')}</div>`
      : `<div class="empty-state"><p>No books match "${escapeHtml(genre || query)}".</p><a class="primary-button" href="#/">Back to home</a></div>`;

  return `
    <section class="page search-page">
      <section class="section" style="padding-top: 0 !important; width: 100%;">
        <div class="catalog-page-header">
          <div class="hint" style="text-transform: uppercase; letter-spacing: 0.15em; font-size: 0.8rem; opacity: 0.7;">
            Search Results &bull; ${resultCount} match${resultCount === 1 ? '' : 'es'} found
          </div>
          <h2 class="catalog-page-title">
            ${genre ? `Explore ${escapeHtml(genre)}` : query ? `Search: "${escapeHtml(query)}"` : 'Refine Results'}
          </h2>
          <p class="catalog-page-subtitle">
            ${genre
      ? `Browse our handpicked collection of prime ${escapeHtml(genre)} masterpieces.`
      : query
        ? `Here are the matching results we found for "${escapeHtml(query)}".`
        : 'Browse our catalog using the controls below to find your next favorite read.'}
          </p>
          
          <div class="filter-row" style="justify-content: flex-start; display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; margin-top: 1.5rem; width: 100%;">
            <select class="select" data-action="sort-books" style="width: auto !important; min-width: 140px !important;">
              ${[
      ['featured', 'Featured'],
      ['price_asc', 'Price: Low to High'],
      ['price_desc', 'Price: High to Low'],
      ['rating', 'Top Rated'],
      ['title_asc', 'Title A-Z']
    ].map(([value, label]) => `<option value="${value}" ${state.sort === value ? 'selected' : ''}>${label}</option>`).join('')}
            </select>
            <a class="secondary-button" href="#/books" style="margin: 0 !important;">Clear filters</a>
          </div>
        </div>

        ${booksMarkup}
        ${state.totalPages > 1 ? renderPaginator(state.page || 1, state.totalPages) : ''}
      </section>
    </section>
  `;
}

function renderBookView() {
  if (state.bookLoading) {
    return `
      <section class="page book-detail">
        <section class="section">
          ${renderSkeletonGrid(2)}
        </section>
      </section>
    `;
  }

  const book = state.currentBook;
  if (!book) {
    return `
      <section class="page">
        <div class="empty-state">
          <p>Book details are unavailable right now.</p>
          <a class="primary-button" href="#/books">Back to catalog</a>
        </div>
      </section>
    `;
  }

  const isWishlisted = Array.isArray(state.wishlist) && state.wishlist.some((entry) => String(entry.id) === String(book.id));
  const fullDescription = String(book.description || '').trim() || 'No description available for this book yet.';
  const descriptionPreview = fullDescription.length > 260 ? `${fullDescription.slice(0, 260).trimEnd()}...` : fullDescription;
  const displayDesc = state.descExpanded ? fullDescription : descriptionPreview;
  const toggleButtonMarkup = fullDescription.length > 260
    ? `<button class="text-button" type="button" data-action="toggle-description">${state.descExpanded ? 'Show less' : 'Read more'}</button>`
    : '';
  const purchasedNotice = state.user
    ? `<div class="panel" style="margin-bottom: 1rem;"><p class="section-copy" style="margin: 0;">Logged in readers can leave reviews once they have purchased the book.</p></div>`
    : `<div class="panel" style="margin-bottom: 1rem;"><a class="primary-button" href="#/login" style="display: block !important; text-align: center !important; width: 100% !important; box-sizing: border-box !important;">Sign in to review</a></div>`;
  const reviewsMarkup = state.currentReviews.length
    ? state.currentReviews.map(renderReviewCard).join('')
    : `<div class="empty-state" style="min-height: 12rem;"><p>No reviews yet. Be the first to share your thoughts.</p></div>`;
  const reviewFormMarkup = state.user
    ? `
      <form class="review-form" data-form="review" data-book-id="${escapeHtml(book.id)}">
        <div class="form-grid" style="gap: 0.9rem;">
          <label class="field-group">
            <span class="field-label">Rating</span>
            <select class="select" name="rating" required>
              <option value="">Choose rating</option>
              <option value="5">5 - Excellent</option>
              <option value="4">4 - Very good</option>
              <option value="3">3 - Good</option>
              <option value="2">2 - Fair</option>
              <option value="1">1 - Poor</option>
            </select>
          </label>
          <label class="field-group">
            <span class="field-label">Review</span>
            <textarea class="text-input" name="body" rows="5" placeholder="Write your review..." required></textarea>
          </label>
          <button class="primary-button" type="submit">Submit review</button>
        </div>
      </form>
    `
    : `<div class="panel"><a class="primary-button" href="#/login" style="display: block !important; text-align: center !important; width: 100% !important; box-sizing: border-box !important;">Sign in to review</a></div>`;

  return `
    <section class="page book-detail">
      <div class="product-breadcrumbs">
        <a href="#/">Home</a>
        <span class="breadcrumb-separator">/</span>
        <a href="#/books">Explore Catalog</a>
        <span class="breadcrumb-separator">/</span>
        <span class="breadcrumb-current">${escapeHtml(book.title)}</span>
      </div>

      <div class="detail-grid">
        <div class="panel detail-cover-panel">
          <div class="detail-cover">
            ${book.cover_url ? `<img src="${escapeHtml(book.cover_url)}" alt="${escapeHtml(book.title)}" />` : `<span class="cover-emoji">${escapeHtml(book.emoji || '📚')}</span>`}
          </div>
        </div>

        <div class="panel detail-book">
          <div class="detail-header">
            <div class="pill">${escapeHtml((book.genres && book.genres.length ? book.genres.join(' • ') : book.genre) || 'Book')}</div>
            <h1 class="detail-title">${escapeHtml(book.title)}</h1>
            <div class="detail-subtitle product-author-by">by <span class="author-name">${escapeHtml(book.author)}</span></div>
            <div class="detail-price">
              <strong class="price-current">${formatMoney(book.price)}</strong>
              ${book.original_price ? `<span class="price-old">${formatMoney(book.original_price)}</span>` : ''}
            </div>
          </div>

          <div class="detail-meta">
            <span class="hint">${renderStars(book.avg_rating)} ${Number(book.review_count)} reviews</span>
            <span class="hint">${book.stock} in stock</span>
            <span class="hint">${book.pages || '—'} pages · ${book.year || '—'}</span>
          </div>

          <div class="detail-actions" style="margin-top: 1.5rem; margin-bottom: 1.5rem;">
            <button class="icon-button compact-action-button cart-icon-button" type="button" data-action="add-to-cart" data-book-id="${escapeHtml(book.id)}" aria-label="Add ${escapeHtml(book.title)} to cart">🛒</button>
            <button class="icon-button compact-action-button share-icon-button" type="button" data-action="share-book" data-book-id="${escapeHtml(book.id)}" aria-label="Share ${escapeHtml(book.title)}">↗</button>
            <button class="icon-button compact-action-button wishlist-icon-button ${isWishlisted ? 'is-active' : ''}" type="button" data-action="toggle-wishlist" data-book-id="${escapeHtml(book.id)}" aria-pressed="${isWishlisted ? 'true' : 'false'}" aria-label="${isWishlisted ? 'Remove' : 'Add'} ${escapeHtml(book.title)} ${isWishlisted ? 'from' : 'to'} wishlist">${isWishlisted ? '♥' : '♡'}</button>
            <button class="secondary-button compact-buy-button" type="button" data-action="buy-now" data-book-id="${escapeHtml(book.id)}">Buy</button>
          </div>

          <div class="book-tabs-container">
            <input type="radio" id="book-tab-about" name="book-detail-tabs" checked class="book-tab-radio" />
            <input type="radio" id="book-tab-specs" name="book-detail-tabs" class="book-tab-radio" />
            <input type="radio" id="book-tab-reviews" name="book-detail-tabs" class="book-tab-radio" />

            <div class="book-tab-nav">
              <label for="book-tab-about" class="book-tab-label">About the Book</label>
              <label for="book-tab-specs" class="book-tab-label">Specifications</label>
              <label for="book-tab-reviews" class="book-tab-label">Reviews (${state.currentReviews.length})</label>
            </div>

            <div class="book-tab-content">
              <div class="book-tab-panel panel-about">
                <p class="hero-copy" style="margin-top: 1rem;">
                  ${escapeHtml(displayDesc)}
                  ${toggleButtonMarkup}
                </p>
              </div>

              <div class="book-tab-panel panel-specs">
                <div style="margin-top: 1rem;">
                  <table class="specs-table">
                    <tr>
                      <th>Author</th>
                      <td>${escapeHtml(book.author)}</td>
                    </tr>
                    <tr>
                      <th>Genre</th>
                      <td>${escapeHtml((book.genres && book.genres.length ? book.genres.join(', ') : book.genre) || 'General')}</td>
                    </tr>
                    <tr>
                      <th>Publication Year</th>
                      <td>${escapeHtml(String(book.year || 'N/A'))}</td>
                    </tr>
                    <tr>
                      <th>Pages</th>
                      <td>${escapeHtml(String(book.pages || 'N/A'))}</td>
                    </tr>
                    <tr>
                      <th>ISBN</th>
                      <td>${escapeHtml(book.isbn || 'N/A')}</td>
                    </tr>
                  </table>
                </div>
              </div>

              <div class="book-tab-panel panel-reviews">
                <div class="reviews-tab-layout">
                  <div class="reviews-list-panel">${reviewsMarkup}</div>
                  <div class="reviews-form-panel">${reviewFormMarkup}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      ${state.recommendations.length ? `
        <section class="section">
          <h2 class="section-title">Recommended for you</h2>
          <div class="books-grid">${state.recommendations.map(book => renderBookCard(book)).join('')}</div>
        </section>
      ` : ''}
    </section>
  `;
}

function renderNotificationsView() {
  if (!state.user) {
    return `
      <section class="page">
        <div class="empty-state">
          <p>Sign in to see notifications and recommendations.</p>
          <a class="primary-button" href="#/login">Login</a>
        </div>
      </section>
    `;
  }

  const notificationsMarkup = state.notifications.length
    ? state.notifications.map(renderNotificationItem).join('')
    : '<div class="empty-state"><p>No notifications yet.</p><span class="pill">We will alert you when liked books return.</span></div>';

  const recommendationsMarkup = state.recommendations.length
    ? `<div class="books-grid">${state.recommendations.map(book => renderBookCard(book)).join('')}</div>`
    : '<div class="empty-state"><p>No recommendations available yet.</p><span class="pill">Read, wish list, and review books to improve suggestions.</span></div>';

  const profile = state.recommendationProfile || {};

  return `
    <section class="page notification-page">
      <div class="section-header">
        <h1 class="section-title">Notifications & Recommendations</h1>
        <button class="secondary-button" type="button" data-action="mark-all-notifications-read">Mark all as read</button>
      </div>

      <section class="notification-summary panel glass-card">
        <div>
          <div class="hint">Your reading profile</div>
          <h2 class="mini-title">Built from views, wishlists, reviews, and purchases</h2>
        </div>
        <div class="profile-chip-row">
          ${(profile.favoriteGenres || []).slice(0, 3).map((item) => `<span class="pill">${escapeHtml(item.name)} · ${Number(item.score || 0)}</span>`).join('')}
          ${(profile.favoriteAuthors || []).slice(0, 3).map((item) => `<span class="pill">${escapeHtml(item.name)} · ${Number(item.score || 0)}</span>`).join('')}
        </div>
      </section>

      <section class="section">
        <h2 class="section-title">Alerts</h2>
        <div class="notification-grid">${notificationsMarkup}</div>
      </section>

      <section class="section">
        <h2 class="section-title">Recommended for you</h2>
        ${recommendationsMarkup}
      </section>
    </section>
  `;
}

function renderCartView() {
  if (!state.user) {
    return `
      <section class="page">
        <div class="empty-state">
          <p>You need to sign in to manage a cart.</p>
          <a class="primary-button" href="#/login">Login</a>
        </div>
      </section>
    `;
  }

  const content = state.cartLoading
    ? renderSkeletonGrid(3)
    : state.cart.length
      ? `<div class="table-list">${state.cart.map(renderMiniBook).join('')}</div>`
      : '<div class="empty-state"><p>Your cart is empty.</p><a class="primary-button" href="#/">Continue browsing</a></div>';

  return `
    <section class="page checkout-grid full-width">
      <div class="panel popup-shell">
        <div class="order-head">
          <div>
            <div class="hint">Cart</div>
            <h1 class="section-title">Review your items</h1>
          </div>
        </div>
        ${content}
      </div>

      <form class="checkout-form panel popup-shell" data-form="checkout">
        <div class="order-head">
          <div>
            <div class="hint">Checkout</div>
            <h2 class="mini-title">Shipping address</h2>
          </div>
        </div>
        <input class="text-input" name="line1" placeholder="Street address" />
        <div class="checkout-row">
          <input class="text-input" name="city" placeholder="City" />
          <input class="text-input" name="country" placeholder="Country" />
        </div>
        ${(() => {
      const pricing = getOrderPricing();
      let html = '<div class="cart-row"><strong>Subtotal</strong><strong class="price">' + formatMoney(pricing.subtotal) + '</strong></div>';
      if (pricing.promotion) {
        html += '<div class="cart-row"><strong>Promotion (' + escapeHtml(pricing.promotion.code) + ')</strong><strong class="price">-' + formatMoney(pricing.discount) + '</strong></div>';
      }
      html += '<div class="cart-row"><strong>Total</strong><strong class="price">' + formatMoney(pricing.total) + '</strong></div>';
      if (pricing.promotion) {
        html += '<div class="hint">Promotion applied automatically before ordering.</div>';
      }
      return html;
    })()}
        <button class="primary-button" type="submit" ${state.cart.length ? '' : 'disabled'}>Order now on WhatsApp</button>
      </form>
    </section>
  `;
}

function renderWishlistView() {
  if (!state.user) {
    return `
      <section class="page">
        <div class="empty-state">
          <p>You need to sign in to use the wishlist.</p>
          <a class="primary-button" href="#/login">Login</a>
        </div>
      </section>
    `;
  }

  const content = state.wishlistLoading
    ? renderSkeletonGrid(3)
    : state.wishlist.length
      ? `<div class="wishlist-grid">${state.wishlist.map(renderWishlistCard).join('')}</div>`
      : '<div class="empty-state"><p>Your wishlist is empty.</p><a class="primary-button" href="#/">Browse books</a></div>';

  return `
    <section class="page">
      <div class="order-head">
        <div>
          <div class="hint">Wishlist</div>
          <h1 class="section-title">Books you want to come back to</h1>
        </div>
      </div>
      ${content}
    </section>
  `;
}

function renderTrackView() {
  const order = state.trackedOrder;
  if (state.trackedOrderLoading) {
    return `
      <section class="page">
        <div class="empty-state">
          <p>Loading order tracking details...</p>
        </div>
      </section>
    `;
  }

  if (!order) {
    return `
      <section class="page">
        <div class="empty-state">
          <p>Order not found or invalid tracking ID.</p>
          <a class="primary-button" href="#/">Return Home</a>
        </div>
      </section>
    `;
  }

  const items = Array.isArray(order.items) ? order.items : [];
  const statusLabel = String(order.status).toUpperCase();
  const dateStr = new Date(order.created_at).toLocaleString();

  return `
    <section class="page">
      <div class="order-head">
        <div>
          <div class="hint">WhatsApp Order Tracking</div>
          <h1 class="section-title">Order Status: <span style="color: var(--accent); font-weight:700;">${escapeHtml(statusLabel)}</span></h1>
          <p class="hint">Placed on ${escapeHtml(dateStr)} · ID: ${escapeHtml(order.anonymous_id)}</p>
        </div>
      </div>

      <div class="glass-card panel" style="margin-top: 2rem; max-width: 650px; padding: 2rem; border-radius: 16px;">
        <h2 style="font-size: 1.4rem; margin-bottom: 1.5rem; font-family: var(--font-body); font-weight:600;">Items Ordered</h2>
        <div class="table-list" style="display:flex; flex-direction:column; gap:1.25rem; border-bottom: 1px solid var(--border); padding-bottom: 1.5rem; margin-bottom: 1.5rem;">
          ${items.map(item => `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:1.2rem;">
              <div style="display:flex; align-items:center; gap:1rem;">
                <div style="width: 50px; height: 70px; border-radius: 8px; background: rgba(255,255,255,0.06); display:grid; place-items:center; overflow:hidden;">
                  ${item.cover_url ? `<img src="${escapeHtml(item.cover_url)}" alt="${escapeHtml(item.title)}" style="width:100%;height:100%;object-fit:cover;" />` : `📖`}
                </div>
                <div>
                  <strong style="display:block; font-size:1rem; color:var(--text);">${escapeHtml(item.title)}</strong>
                  <span class="hint">by ${escapeHtml(item.author || '')}</span>
                </div>
              </div>
              <div style="text-align:right;">
                <div style="font-weight:600; color:var(--text);">${formatMoney(item.unit_price)}</div>
                <span class="hint">Qty ${Number(item.quantity)}</span>
              </div>
            </div>
          `).join('')}
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; font-size:1.15rem; font-weight:700; margin-bottom: 2rem;">
          <span>Total Price</span>
          <span style="color: var(--accent); font-size:1.35rem;">${formatMoney(order.total)}</span>
        </div>

        <div style="background: rgba(15, 43, 53, 0.25); border-left: 4px solid var(--accent); padding: 1.2rem; border-radius: 8px; margin-bottom: 2rem; font-size:0.92rem; line-height:1.5; color:var(--text-muted);">
          ℹ️ <strong>Direct WhatsApp Order:</strong> This is a pending anonymous order. Please message us on WhatsApp to confirm delivery details, shipping address, and payment. No payment is processed inside the app.
        </div>

        <div style="display:flex; gap:1rem; flex-wrap:wrap;">
          <a class="primary-button" href="https://wa.me/${escapeHtml(String(state.settings?.whatsappNumber || '250782781575').replace(/[^\d+]/g, ''))}" target="_blank" rel="noopener noreferrer" style="display:inline-flex; align-items:center; gap:0.5rem;">
            💬 Message Support
          </a>
          <a class="secondary-button" href="#/">
            Browse More Books
          </a>
        </div>
      </div>
    </section>
  `;
}

function renderOrdersView() {
  if (!state.user) {
    return `
      <section class="page">
        <div class="empty-state">
          <p>Sign in to see your order history.</p>
          <a class="primary-button" href="#/login">Login</a>
        </div>
      </section>
    `;
  }

  const content = state.ordersLoading
    ? renderSkeletonGrid(2)
    : state.orders.length
      ? `<div class="orders-grid">${state.orders.map(renderOrderCard).join('')}</div>`
      : '<div class="empty-state"><p>No orders yet.</p><a class="primary-button" href="#/">Start shopping</a></div>';

  return `
    <section class="page">
      <div class="order-head">
        <div>
          <div class="hint">Orders</div>
          <h1 class="section-title">Purchase history</h1>
        </div>
      </div>
      ${content}
    </section>
  `;
}

function renderProfileView() {
  if (!state.user) {
    return `
      <section class="page">
        <div class="empty-state">
          <p>Sign in to manage your profile.</p>
          <a class="primary-button" href="#/login">Login</a>
        </div>
      </section>
    `;
  }

  return `
    <section class="page profile-shell">
      <aside class="profile-summary panel glass-card">
        <div class="profile-avatar">${initials(state.user.name || state.user.email || 'Reader')}</div>
        <div class="profile-head">
          <div class="hint">Profile</div>
          <h1 class="section-title">${escapeHtml(state.user.name || 'Reader')}</h1>
          <p class="section-copy">${escapeHtml(state.user.email || '')}</p>
        </div>
        <div class="profile-badges">
          <span class="pill">${escapeHtml(state.user.role || 'customer')}</span>
          <span class="pill">Wishlist ready</span>
          <span class="pill">Orders synced</span>
        </div>
        <div class="profile-note">
          A clean profile view built around your account details and security controls. No external avatar link is required.
        </div>
      </aside>

      <div class="profile-forms">
        <form class="panel profile-form" data-form="profile">
          <div class="profile-head">
            <div class="hint">Account</div>
            <h2 class="mini-title">Update your details</h2>
          </div>
          <input class="text-input" name="name" value="${escapeHtml(state.user.name || '')}" placeholder="Display name" />
          <button class="primary-button" type="submit">Save profile</button>
        </form>

        <form class="panel profile-form" data-form="password">
          <div class="profile-head">
            <div class="hint">Security</div>
            <h2 class="mini-title">Change password</h2>
          </div>
          <input class="text-input" type="password" name="currentPassword" placeholder="Current password" required />
          <input class="text-input" type="password" name="newPassword" placeholder="New password" required />
          <button class="secondary-button" type="submit">Update password</button>
        </form>
      </div>
    </section>
  `;
}

function renderAccessDenied() {
  return `
    <section class="page">
      <div class="empty-state">
        <p>Access denied. Admin access required.</p>
        <a class="primary-button" href="#/">Return home</a>
      </div>
    </section>
  `;
}

function renderAdminOrdersView() {
  const orders = state.adminOrders || [];
  const statuses = ['pending', 'completed', 'cancelled'];

  if (!orders.length) {
    return `
      <section class="page">
        <div class="order-head">
          <div class="hint">Admin</div>
          <h1 class="section-title">Order Management</h1>
        </div>
        <div class="empty-state"><p>No orders to manage.</p></div>
      </section>
    `;
  }

  const orderRows = orders.map(order => `
    <div class="admin-order-row panel glass-card">
      <div class="admin-order-head">
        <div>
          <strong>Order #${order.id.slice(0, 8)}</strong>
          <p class="hint">${escapeHtml(order.user_name || 'Unknown')} (${escapeHtml(order.user_email || '')})</p>
        </div>
        <div>
          <strong>${formatMoney(order.total)}</strong>
          <select class="status-select" data-action="update-order-status" data-order-id="${escapeHtml(order.id)}">
            ${statuses.map(s => `<option value="${s}" ${s === order.status ? 'selected' : ''}>${s.toUpperCase()}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="admin-order-items">
        ${order.items.map(item => `
          <div class="mini-item">
            <span>${escapeHtml(item.title)} x ${item.quantity}</span>
            <span>${formatMoney(item.unit_price * item.quantity)}</span>
          </div>
        `).join('')}
      </div>
      <div class="admin-order-footer hint">${new Date(order.created_at).toLocaleString()}</div>
    </div>
  `).join('');

  return `
    <section class="page">
      <div class="order-head">
        <div class="hint">Admin</div>
        <h1 class="section-title">Order Management</h1>
        <p class="section-copy">Total orders: ${orders.length}</p>
      </div>
      <div class="admin-orders-grid">${orderRows}</div>
    </section>
  `;
}

function renderAuthView(mode) {
  const isLogin = mode === 'login';
  return `
    <div class="auth-modal" role="dialog" aria-modal="true">
      <div class="auth-modal-backdrop" data-action="close-auth"></div>
      <div class="auth-modal-panel auth-large">
        <button class="icon-button auth-close" type="button" data-action="close-auth" aria-label="Close" style="position: absolute; top: 1rem; right: 1rem; background: transparent; border: none; font-size: 1.25rem; cursor: pointer; color: var(--muted); z-index: 10;">✕</button>
        <div class="auth-fullpage-card">
          <div class="auth-fullpage-brand">
            <div class="auth-fullpage-brand-inner">
              <div class="auth-brand-logo-row">
                <img src="assets/logo.png" alt="Booksta" class="auth-brand-logo" />
                <strong class="auth-brand-wordmark">Booksta</strong>
              </div>
              <h1 class="auth-brand-headline">${isLogin ? 'Welcome back.' : 'Create your shelf.'}</h1>
              <p class="auth-brand-subtext">
                ${isLogin
      ? 'Sign in to continue your cart, wishlist, reviews, and order history.'
      : 'Create an account to save books, track orders, and review your favorite titles.'}
              </p>
              <div class="auth-brand-footer">
                <span>🛡️ Secure checkout</span>
                <span>📦 Rwanda delivery</span>
              </div>
            </div>
          </div>

          <div class="auth-fullpage-form">
            <div class="auth-form-head">
              <div class="auth-form-hint">${isLogin ? 'Sign in' : 'Register'}</div>
              <h2 class="auth-form-title">${isLogin ? 'Use your Booksta account' : 'Join Booksta today'}</h2>
              <p class="auth-form-subtitle">
                ${isLogin
      ? 'Enter your account details to continue.'
      : 'Create your profile and start building a shelf that feels like yours.'}
              </p>
            </div>

            <form class="auth-form auth-form--clean auth-form--grid" data-form="${isLogin ? 'login' : 'register'}">
              ${isLogin ? '' : '<label class="auth-field"><span class="auth-field-label">Full name</span><input class="text-input" name="name" type="text" placeholder="Your full name" required /></label>'}
              <label class="auth-field"><span class="auth-field-label">Email address</span><input class="text-input" name="email" type="email" placeholder="you@example.com" required /></label>
              <label class="auth-field"><span class="auth-field-label">Password</span><input class="text-input" name="password" type="password" placeholder="Minimum 8 characters" required minlength="8" /></label>
              ${isLogin ? `
                <label class="auth-remember-row">
                  <input type="checkbox" name="remember" value="1" />
                  <span>Remember me on this device</span>
                </label>
              ` : ''}
              <div class="auth-submit-row">
                <button class="primary-button auth-submit-btn" type="submit">${isLogin ? 'Sign in' : 'Create account'}</button>
              </div>
            </form>

            <div class="auth-card-foot">
              <p class="auth-helper-text">
                ${isLogin ? 'Need an account?' : 'Already have an account?'} 
                <a href="#/${isLogin ? 'register' : 'login'}">${isLogin ? 'Register' : 'Login'}</a>
              </p>
              ${isLogin ? `<button class="ghost-button forgot-password-btn" type="button" data-action="open-reset-password">Forgot password?</button>` : ''}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderResetPasswordRequestView() {
  const routeEmail = escapeHtml(state.route?.params?.email || '');
  return `
    <div class="auth-modal" role="dialog" aria-modal="true">
      <div class="auth-modal-backdrop" data-action="close-auth"></div>
      <div class="auth-modal-panel auth-large">
        <button class="icon-button auth-close" type="button" data-action="close-auth" aria-label="Close" style="position: absolute; top: 1rem; right: 1rem; background: transparent; border: none; font-size: 1.25rem; cursor: pointer; color: var(--muted); z-index: 10;">✕</button>
        <div class="auth-fullpage-card">
          <div class="auth-fullpage-brand">
            <div class="auth-fullpage-brand-inner">
              <div class="auth-brand-logo-row">
                <img src="assets/logo.png" alt="Booksta" class="auth-brand-logo" />
                <strong class="auth-brand-wordmark">Booksta</strong>
              </div>
              <h1 class="auth-brand-headline">Reset your password</h1>
              <p class="auth-brand-subtext">
                Request a reset code and we'll send it straight to your email inbox.
              </p>
              <div class="auth-brand-footer">
                <span>🛡️ Secure reset</span>
                <span>📧 Email verification</span>
              </div>
            </div>
          </div>

          <div class="auth-fullpage-form">
            <div class="auth-form-head">
              <div class="auth-form-hint">Password recovery</div>
              <h2 class="auth-form-title">Get a reset code</h2>
              <p class="auth-form-subtitle">Enter your email and we'll send a reset code to your inbox.</p>
            </div>

            <form class="auth-form auth-form--clean" data-form="forgot-password">
              <label class="auth-field"><span class="auth-field-label">Email address</span><input class="text-input" name="email" type="email" placeholder="you@example.com" value="${routeEmail}" required /></label>
              <div class="auth-submit-row">
                <button class="primary-button auth-submit-btn" type="submit">Send reset code</button>
              </div>
            </form>
            <p class="helper-text reset-feedback" data-reset-feedback aria-live="polite"></p>

            <div class="auth-card-foot">
              <p class="auth-helper-text">
                Already have your code? <a href="#/reset-password/confirm${routeEmail ? `?email=${encodeURIComponent(state.route?.params?.email || '')}` : ''}">Use reset code</a>
              </p>
              <p class="auth-helper-text">
                <a href="#/login">Back to login</a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderResetPasswordConfirmView() {
  const routeEmailRaw = state.route?.params?.email || '';
  const routeToken = escapeHtml(state.route?.params?.token || '');
  const routeEmail = escapeHtml(routeEmailRaw);
  return `
    <div class="auth-modal" role="dialog" aria-modal="true">
      <div class="auth-modal-backdrop" data-action="close-auth"></div>
      <div class="auth-modal-panel auth-large">
        <button class="icon-button auth-close" type="button" data-action="close-auth" aria-label="Close" style="position: absolute; top: 1rem; right: 1rem; background: transparent; border: none; font-size: 1.25rem; cursor: pointer; color: var(--muted); z-index: 10;">✕</button>
        <div class="auth-fullpage-card">
          <div class="auth-fullpage-brand">
            <div class="auth-fullpage-brand-inner">
              <div class="auth-brand-logo-row">
                <img src="assets/logo.png" alt="Booksta" class="auth-brand-logo" />
                <strong class="auth-brand-wordmark">Booksta</strong>
              </div>
              <h1 class="auth-brand-headline">Use your reset code</h1>
              <p class="auth-brand-subtext">
                Enter the code from your email and choose a new password.
              </p>
              <div class="auth-brand-footer">
                <span>🛡️ Secure reset</span>
                <span>🔑 Code-based verification</span>
              </div>
            </div>
          </div>

          <div class="auth-fullpage-form">
            <div class="auth-form-head">
              <div class="auth-form-hint">Password recovery</div>
              <h2 class="auth-form-title">Set your new password</h2>
              <p class="auth-form-subtitle">Paste your reset code from email, then set your new password.</p>
            </div>

            <form class="auth-form auth-form--clean auth-form--grid" data-form="reset-password">
              <label class="auth-field"><span class="auth-field-label">Email address</span><input class="text-input" name="email" type="email" placeholder="you@example.com" value="${routeEmail}" required /></label>
              <label class="auth-field"><span class="auth-field-label">Reset code</span><input class="text-input" name="token" placeholder="6-digit code" value="${routeToken}" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" minlength="6" required /></label>
              <label class="auth-field"><span class="auth-field-label">New password</span><input class="text-input" name="newPassword" type="password" placeholder="Minimum 8 characters" required minlength="8" /></label>
              <label class="auth-field"><span class="auth-field-label">Confirm password</span><input class="text-input" name="confirmPassword" type="password" placeholder="Re-enter new password" required minlength="8" /></label>
              <div class="auth-submit-row">
                <button class="primary-button auth-submit-btn" type="submit">Reset password</button>
              </div>
            </form>

            <div class="auth-card-foot">
              <p class="auth-helper-text">
                Need a new code? <a href="#/reset-password${routeEmailRaw ? `?email=${encodeURIComponent(routeEmailRaw)}` : ''}">Get reset code</a>
              </p>
              <p class="auth-helper-text">
                <a href="#/login">Back to login</a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderAuthModal(mode) {
  return renderAuthView(mode);
}

function renderEmptyRoute() {
  app.innerHTML = '<section class="page"><div class="empty-state"><p>Loading…</p></div></section>';
}

async function refreshSession() {
  // Attempt to refresh user session from server. This will succeed
  // when either an Authorization token is present or an HttpOnly
  // remember-me cookie was set by the server.
  try {
    const data = await api('/api/auth/me');
    state.user = data.user;
    renderChrome();
    await refreshPersonalization();
    if (state.user) {
      renderApp();
    }
  } catch (error) {
    // If no remote session exists, clear any client-side token
    // but don't show a notification during normal startup.
    clearSession(false);
  }
}

async function refreshCart() {
  if (!state.user) {
    state.cart = [];
    renderChrome();
    return;
  }

  state.cartLoading = true;
  try {
    const data = await api('/api/cart');
    state.cart = data.items || [];
    state.cartLoading = false;
    renderChrome();
  } catch (error) {
    state.cartLoading = false;
    showToast(error.message, 'error');
  }
}

async function refreshWishlist() {
  if (!state.user) {
    state.wishlist = [];
    return;
  }

  state.wishlistLoading = true;
  try {
    const data = await api('/api/wishlist');
    state.wishlist = data.items || [];
    state.wishlistLoading = false;
  } catch (error) {
    state.wishlistLoading = false;
    showToast(error.message, 'error');
  }
}

async function refreshPersonalization() {
  if (!state.user) {
    state.notifications = [];
    state.recommendations = [];
    state.recommendationProfile = null;
    state.unreadNotifications = 0;
    renderChrome();
    return;
  }

  try {
    const [notificationsData, recommendationsData] = await Promise.all([
      api('/api/notifications?limit=20').catch(() => ({ notifications: [], unreadCount: 0 })),
      api('/api/recommendations?limit=8').catch(() => ({ books: [], profile: null }))
    ]);

    state.notifications = notificationsData.notifications || [];
    state.unreadNotifications = Number(notificationsData.unreadCount || 0);
    state.recommendations = recommendationsData.books || [];
    state.recommendationProfile = recommendationsData.profile || null;
    renderChrome();
  } catch (error) {
    state.notifications = [];
    state.recommendations = [];
    state.recommendationProfile = null;
    state.unreadNotifications = 0;
    renderChrome();
  }
}

async function recordReadingEvent(bookId, source = 'book-detail') {
  if (!state.user || !bookId) return;
  const viewKey = `booksta:viewed:${bookId}`;
  const lastSeen = Number(localStorage.getItem(viewKey) || '0');
  if (Date.now() - lastSeen < 60 * 1000) return;
  localStorage.setItem(viewKey, String(Date.now()));
  try {
    await api('/api/reading-events', {
      method: 'POST',
      body: JSON.stringify({ bookId, eventType: 'view', source })
    });
  } catch (error) {
    // Non-blocking tracking.
  }
}

async function refreshOrders() {
  if (!state.user) {
    state.orders = [];
    return;
  }

  state.ordersLoading = true;
  try {
    const data = await api('/api/orders');
    state.orders = data.orders || [];
    state.ordersLoading = false;
  } catch (error) {
    state.ordersLoading = false;
    showToast(error.message, 'error');
  }
}

async function loadSiteSettings() {
  try {
    const data = await api('/api/settings');
    state.settings = { ...state.settings, ...(data.settings || {}) };
    syncFooterLinks();
  } catch (error) {
    // Keep defaults when settings are unavailable.
  }
}

async function loadPromotionsData() {
  try {
    const data = await api('/api/promotions');
    state.promotions = data.promotions || [];
  } catch (error) {
    state.promotions = [];
  }
}

async function loadHomeData() {
  // Prevent concurrent/rapid reloads of home data
  if (state._homeLoadInProgress) return;
  state._homeLoadInProgress = true;
  state.homeLoading = true;
  const routeNameAtStart = state.route?.name || getRoute().name;
  const now = Date.now();
  if (state._lastHomeLoadAt && now - state._lastHomeLoadAt < 800) {
    // too soon since last load
    state.homeLoading = false;
    state._homeLoadInProgress = false;
    return;
  }
  state._lastHomeLoadAt = now;
  syncResponsivePageLimit();

  try {
    const params = new URLSearchParams();
    if (state.search) params.set('search', state.search);
    if (state.genre) params.set('genre', state.genre);
    if (state.sort) params.set('sort', state.sort);
    params.set('page', String(state.page));
    // Use the responsive page limit directly so the grid can fill the visible rows.
    params.set('limit', String(state.limit));

    const [books, featured, genres, kidsBooksRes] = await Promise.all([
      api(`/api/books?${params.toString()}`),
      api('/api/books/featured'),
      api('/api/books/genres'),
      api('/api/books?limit=100').catch(() => ({ books: [] }))
    ]);

    state.books = books.books || [];
    state.total = books.total || state.books.length;
    // Clamp total pages to a maximum of 10 for UX constraints.
    state.totalPages = Math.max(books.totalPages || 1, 1);
    state.featured = featured.books || [];
    state.genreCounts = genres.counts || {};

    // Filter books matching kids/children/juvenile/school stories/etc.
    const childrenKeywords = ['kids', 'children', 'juvenile', 'school story', 'school stories', 'bedtime', 'fairy tale', 'fairy tales', 'fable', 'fables', 'storybook', 'storybooks'];
    state.kidsBooks = (kidsBooksRes?.books || [])
      .filter(b => {
        const genres = Array.isArray(b.genres) && b.genres.length ? b.genres : [b.genre];
        return genres.some(g => {
          const name = String(g || '').toLowerCase();
          return childrenKeywords.some(keyword => name.includes(keyword));
        });
      })
      .slice(0, 3);
    // Load configured featured authors from DB (public endpoint)
    try {
      const authorsRes = await api('/api/public/featured-authors');
      state.featuredAuthors = Array.isArray(authorsRes.authors) && authorsRes.authors.length
        ? authorsRes.authors
        : [];
    } catch (err) {
      state.featuredAuthors = [];
    }
    const discoveredGenres = Array.isArray(genres.genres) && genres.genres.length
      ? genres.genres
      : Object.keys(state.genreCounts || {});
    state.genres = discoveredGenres.length ? discoveredGenres : genreSeed;
    state.homeLoading = false;
    state._homeLoadInProgress = false;
    if (!['home', 'search'].includes(routeNameAtStart) || !['home', 'search'].includes(state.route?.name || getRoute().name)) {
      return;
    }
    renderApp();
  } catch (error) {
    state.homeLoading = false;
    state._homeLoadInProgress = false;
    app.innerHTML = `<section class="page"><div class="empty-state"><p>${escapeHtml(error.message)}</p></div></section>`;
  }
}
async function loadMoreSearchBooks() {
  if (state.loadingMore) return;
  state.loadingMore = true;
  renderApp();

  try {
    const nextPage = state.page + 1;
    const params = new URLSearchParams();
    if (state.search) params.set('search', state.search);
    if (state.genre) params.set('genre', state.genre);
    if (state.sort) params.set('sort', state.sort);
    params.set('page', String(nextPage));
    params.set('limit', String(state.limit));

    const data = await api(`/api/books?${params.toString()}`);
    const newBooks = data.books || [];

    // Append the new books to state.books
    state.books = [...state.books, ...newBooks];
    state.page = nextPage;
    state.totalPages = Math.max(data.totalPages || 1, 1);
    state.loadingMore = false;
    renderApp();
  } catch (error) {
    state.loadingMore = false;
    showToast(error.message, 'error');
    renderApp();
  }
}

async function loadMoreAllBooks() {
  if (state.loadingMore) return;
  state.loadingMore = true;
  renderApp();

  try {
    const nextPage = state.page + 1;
    const params = new URLSearchParams();
    params.set('page', String(nextPage));
    params.set('limit', String(state.limit));
    if (state.sort) params.set('sort', state.sort);
    if (state.genre) params.set('genre', state.genre);

    const data = await api(`/api/books?${params.toString()}`);
    const newBooks = data.books || [];

    // Append the new books to state.books
    state.books = [...state.books, ...newBooks];
    state.page = nextPage;
    state.totalPages = Math.max(data.totalPages || 1, 1);
    state.loadingMore = false;
    renderApp();
  } catch (error) {
    state.loadingMore = false;
    showToast(error.message, 'error');
    renderApp();
  }
}

async function loadBooksData() {
  if (state._booksLoadInProgress) return;
  state._booksLoadInProgress = true;
  state.booksLoading = true;
  const routeNameAtStart = state.route?.name || getRoute().name;
  renderApp();

  try {
    syncResponsivePageLimit();
    const params = new URLSearchParams();
    params.set('page', String(state.page));
    params.set('limit', String(state.limit));
    if (state.sort) params.set('sort', state.sort);
    if (state.genre) {
      let queryGenre = state.genre;
      const lowerG = state.genre.toLowerCase();
      if (lowerG === 'mystery') queryGenre = 'Crime Fiction';
      else if (lowerG === 'non-fiction') queryGenre = 'Juvenile Nonfiction';
      else if (lowerG === 'science fiction') queryGenre = 'Fiction';
      else if (lowerG === 'fantasy') queryGenre = 'Classics';
      else if (lowerG === 'romance') queryGenre = 'Fiction';
      params.set('genre', queryGenre);
    }
    if (state.catalogSearch) params.set('search', state.catalogSearch);

    const genreCountsLoaded = Object.keys(state.genreCounts || {}).length > 0;
    const promises = [
      api(`/api/books?${params.toString()}`)
    ];
    if (!genreCountsLoaded) {
      promises.push(api('/api/books/genres').catch(() => ({ counts: {}, genres: [] })));
    }

    const results = await Promise.all(promises);
    const books = results[0];

    if (!genreCountsLoaded && results[1]) {
      state.genreCounts = results[1].counts || {};
      const discoveredGenres = Array.isArray(results[1].genres) && results[1].genres.length
        ? results[1].genres
        : Object.keys(state.genreCounts || {});
      state.genres = discoveredGenres.length ? discoveredGenres : genreSeed;
    }

    state.books = books.books || [];
    state.total = books.total || state.books.length;
    state.totalPages = Math.max(books.totalPages || 1, 1);
    state.booksLoading = false;
    state._booksLoadInProgress = false;
    if (routeNameAtStart !== 'books' || (state.route?.name || getRoute().name) !== 'books') {
      return;
    }
    renderApp();
  } catch (error) {
    state.booksLoading = false;
    state._booksLoadInProgress = false;
    app.innerHTML = `<section class="page"><div class="empty-state"><p>${escapeHtml(error.message)}</p></div></section>`;
  }
}

async function loadBookData(id) {
  state.bookLoading = true;
  renderApp();

  try {
    const [bookResponse, reviewResponse] = await Promise.all([
      api(`/api/books/${id}`),
      api(`/api/reviews/book/${id}`)
    ]);

    state.currentBook = bookResponse.book;
    state.currentReviews = reviewResponse.reviews || [];
    state.bookLoading = false;
    recordReadingEvent(id, 'book-detail');
    refreshPersonalization();
    renderApp();
  } catch (error) {
    state.bookLoading = false;
    app.innerHTML = `<section class="page"><div class="empty-state"><p>${escapeHtml(error.message)}</p><a class="primary-button" href="#/">Back to catalog</a></div></section>`;
  }
}

async function loadTrackData(trackingId) {
  state.trackedOrderLoading = true;
  state.trackedOrder = null;
  renderApp();

  if (!trackingId) {
    state.trackedOrderLoading = false;
    renderApp();
    return;
  }

  try {
    const res = await fetch(`/api/public/orders/track/${encodeURIComponent(trackingId)}`);
    const data = await res.json();
    if (res.ok && data.ok) {
      state.trackedOrder = data.order;
    } else {
      console.warn('Track order failed:', data.error);
    }
  } catch (error) {
    console.error('Track order error:', error);
  } finally {
    state.trackedOrderLoading = false;
    renderApp();
  }
}

async function loadCartData() {
  state.cartLoading = true;
  renderApp();
  try {
    const data = await api('/api/cart');
    state.cart = data.items || [];
    state.cartLoading = false;
    renderChrome();
    renderApp();
  } catch (error) {
    state.cartLoading = false;
    showToast(error.message, 'error');
    renderApp();
  }
}

function updateMobileViewFlag() {
  const topbar = document.querySelector('.topbar');
  if (!topbar) return;
  const isMobile = window.innerWidth <= 700;
  topbar.classList.toggle('mobile-view', !!isMobile);
}

// Initialize mobile flag on load and update on resize (debounced)
window.addEventListener('load', () => {
  updateMobileViewFlag();
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(updateMobileViewFlag, 120);
  });
});

// Move header-search into topbar when mobile to prevent crowding
const _mobileDomState = { moved: false, placeholder: null };
function ensureHeaderSearchPlacement() {
  const topbar = document.querySelector('.topbar');
  const headerSearch = document.querySelector('.header-search');
  if (!topbar || !headerSearch) return;
  const isMobile = window.innerWidth <= 700;

  if (isMobile && !_mobileDomState.moved) {
    // insert a placeholder where headerSearch was so we can restore later
    const placeholder = document.createElement('div');
    placeholder.className = 'header-search-placeholder';
    headerSearch.parentNode.insertBefore(placeholder, headerSearch);
    _mobileDomState.placeholder = placeholder;
    // move headerSearch into topbar, below the left area
    const left = topbar.querySelector('.topbar-left');
    if (left && left.parentNode) {
      left.parentNode.insertBefore(headerSearch, left.nextSibling);
    } else {
      topbar.appendChild(headerSearch);
    }
    _mobileDomState.moved = true;
  }

  if (!isMobile && _mobileDomState.moved) {
    // restore to original location if placeholder exists
    const ph = _mobileDomState.placeholder;
    if (ph && ph.parentNode) {
      ph.parentNode.insertBefore(headerSearch, ph);
      ph.parentNode.removeChild(ph);
    }
    _mobileDomState.moved = false;
    _mobileDomState.placeholder = null;
  }
}

// Run placement check on load and resize alongside mobile flag
window.addEventListener('load', () => { ensureHeaderSearchPlacement(); });
window.addEventListener('resize', () => { window.clearTimeout(window._headerSearchPlacementTimer); window._headerSearchPlacementTimer = window.setTimeout(ensureHeaderSearchPlacement, 140); });

async function loadWishlistData() {
  state.wishlistLoading = true;
  renderApp();
  try {
    const data = await api('/api/wishlist');
    state.wishlist = data.items || [];
    state.wishlistLoading = false;
    renderApp();
  } catch (error) {
    state.wishlistLoading = false;
    showToast(error.message, 'error');
    renderApp();
  }
}

async function loadOrdersData() {
  state.ordersLoading = true;
  renderApp();
  try {
    const data = await api('/api/orders');
    state.orders = data.orders || [];
    state.ordersLoading = false;
    renderApp();
  } catch (error) {
    state.ordersLoading = false;
    showToast(error.message, 'error');
    renderApp();
  }
}

async function loadAdminOrdersData() {
  state.adminOrdersLoading = true;
  renderApp();
  try {
    const data = await api('/api/admin/orders');
    state.adminOrders = data.orders || [];
    state.adminOrdersLoading = false;
    renderApp();
  } catch (error) {
    state.adminOrdersLoading = false;
    showToast(error.message, 'error');
    renderApp();
  }
}


let sliderInterval = null;
let currentSlideIndex = 0;

function initHeroSlider() {
  if (sliderInterval) {
    clearInterval(sliderInterval);
  }

  const slides = document.querySelectorAll('.hero-showcase-slide');
  const dots = document.querySelectorAll('.hero-pagination .dot');
  if (!slides.length) return;

  currentSlideIndex = 0;

  function showSlide(index) {
    const total = slides.length;
    slides.forEach((slide, idx) => {
      slide.classList.remove('active', 'prev-slide', 'next-slide');

      const isActive = idx === index;
      if (isActive) {
        slide.classList.add('active');
        const genre = slide.dataset.genre || 'Fiction';
        const typewriter = document.querySelector('.typewriter');
        if (typewriter) {
          typewriter.textContent = genre;
        }
      } else if (total >= 3) {
        const prevIdx = (index - 1 + total) % total;
        const nextIdx = (index + 1) % total;
        if (idx === prevIdx) {
          slide.classList.add('prev-slide');
        } else if (idx === nextIdx) {
          slide.classList.add('next-slide');
        }
      }
    });
    dots.forEach((dot, idx) => {
      dot.classList.toggle('active', idx === index);
    });
    currentSlideIndex = index;
  }

  // Trigger initial state
  showSlide(0);

  // Auto slide every 4 seconds
  sliderInterval = setInterval(() => {
    const nextIdx = (currentSlideIndex + 1) % slides.length;
    showSlide(nextIdx);
  }, 4000);

  // Click handlers
  const prevBtn = document.querySelector('.hero-arrow.prev');
  const nextBtn = document.querySelector('.hero-arrow.next');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      clearInterval(sliderInterval);
      const prevIdx = (currentSlideIndex - 1 + slides.length) % slides.length;
      showSlide(prevIdx);
      sliderInterval = setInterval(() => {
        const nextIdx = (currentSlideIndex + 1) % slides.length;
        showSlide(nextIdx);
      }, 4000);
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      clearInterval(sliderInterval);
      const nextIdx = (currentSlideIndex + 1) % slides.length;
      showSlide(nextIdx);
      sliderInterval = setInterval(() => {
        const nextIdx = (currentSlideIndex + 1) % slides.length;
        showSlide(nextIdx);
      }, 4000);
    });
  }

  dots.forEach((dot, idx) => {
    dot.addEventListener('click', () => {
      clearInterval(sliderInterval);
      showSlide(idx);
      sliderInterval = setInterval(() => {
        const nextIdx = (currentSlideIndex + 1) % slides.length;
        showSlide(nextIdx);
      }, 4000);
    });
  });
}

function animateStats() {
  const elements = document.querySelectorAll('.stat-number');
  elements.forEach(el => {
    const targetText = el.textContent || '';
    if (!targetText) return;

    // Parse target number
    let target = 0;
    let suffix = '';

    if (targetText.includes('k')) {
      target = parseFloat(targetText.replace(/[^\d.]/g, '')) * 1000;
      suffix = 'k+';
    } else {
      target = parseInt(targetText.replace(/[^\d]/g, ''), 10) || 0;
      suffix = targetText.includes('+') ? '+' : '';
    }

    const duration = 1500; // 1.5 seconds count-up duration
    const startTime = performance.now();

    function update(currentTime) {
      const elapsedTime = currentTime - startTime;
      const progress = Math.min(elapsedTime / duration, 1);

      // Smooth ease-out cubic progress
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const currentValue = Math.floor(easeProgress * target);

      if (suffix === 'k+') {
        el.textContent = (currentValue / 1000).toFixed(currentValue % 1000 === 0 ? 0 : 1) + 'k+';
      } else {
        el.textContent = currentValue + suffix;
      }

      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        el.textContent = targetText; // Ensure exact final text
      }
    }

    requestAnimationFrame(update);
  });
}

function renderApp() {
  try {
    syncChatbotMode();
    state.route = getRoute();
    updateSeo(state.route);
    // Retrigger smooth page-transition animation
    app.style.animation = 'none';
    void app.offsetHeight; // force reflow
    app.style.animation = '';
    const { name } = state.route;

    if (name === 'home') {
      app.innerHTML = renderHomeView();
      renderFloatingUi();
      initHeroSlider();
      animateStats();
      // Re-observe sections for scroll animations
      setTimeout(() => window.scrollAnimations?.reObserveSections(), 0);
      return;
    }
    if (name === 'notifications') {
      app.innerHTML = renderNotificationsView();
      renderFloatingUi();
      setTimeout(() => window.scrollAnimations?.reObserveSections(), 0);
      return;
    }

    if (name === 'search') {
      app.innerHTML = renderSearchView();
      renderFloatingUi();
      // Re-observe sections for scroll animations
      setTimeout(() => window.scrollAnimations?.reObserveSections(), 0);
      return;
    }

    if (name === 'books') {
      app.innerHTML = renderAllBooksView();
      renderFloatingUi();
      setTimeout(() => window.scrollAnimations?.reObserveSections(), 0);
      return;
    }

    if (name === 'book') {
      app.innerHTML = renderBookView();
      renderFloatingUi();
      // Re-observe sections for scroll animations
      setTimeout(() => window.scrollAnimations?.reObserveSections(), 0);
      return;
    }

    if (name === 'cart') {
      app.innerHTML = renderCartView();
      renderFloatingUi();
      // Re-observe sections for scroll animations
      setTimeout(() => window.scrollAnimations?.reObserveSections(), 0);
      return;
    }

    if (name === 'wishlist') {
      app.innerHTML = renderWishlistView();
      renderFloatingUi();
      // Re-observe sections for scroll animations
      setTimeout(() => window.scrollAnimations?.reObserveSections(), 0);
      return;
    }

    if (name === 'orders') {
      app.innerHTML = renderOrdersView();
      renderFloatingUi();
      // Re-observe sections for scroll animations
      setTimeout(() => window.scrollAnimations?.reObserveSections(), 0);
      return;
    }

    if (name === 'track') {
      app.innerHTML = renderTrackView();
      renderFloatingUi();
      setTimeout(() => window.scrollAnimations?.reObserveSections(), 0);
      return;
    }

    if (name === 'profile') {
      app.innerHTML = renderProfileView();
      renderFloatingUi();
      // Re-observe sections for scroll animations
      setTimeout(() => window.scrollAnimations?.reObserveSections(), 0);
      return;
    }

    if (name === 'notifications') {
      app.innerHTML = renderNotificationsView();
      renderFloatingUi();
      setTimeout(() => window.scrollAnimations?.reObserveSections(), 0);
      return;
    }

    if (name === 'admin-orders') {
      if (!state.user || state.user.role !== 'admin') {
        app.innerHTML = renderAccessDenied();
        renderFloatingUi();
        // Re-observe sections for scroll animations
        setTimeout(() => window.scrollAnimations?.reObserveSections(), 0);
        return;
      }
      app.innerHTML = renderAdminOrdersView();
      renderFloatingUi();
      // Re-observe sections for scroll animations
      setTimeout(() => window.scrollAnimations?.reObserveSections(), 0);
      return;
    }

    if (name === 'login' || name === 'register' || name === 'reset-password') {
      const baseHash = state.lastActiveHash || '#/';
      const baseRoute = getRouteFromHash(baseHash);

      const currentBaseRouteAttr = app.getAttribute('data-base-route');
      if (!app.innerHTML || currentBaseRouteAttr !== baseRoute.name) {
        let baseHtml = '';
        if (baseRoute.name === 'books') {
          baseHtml = renderAllBooksView();
        } else if (baseRoute.name === 'book') {
          baseHtml = renderBookView();
        } else if (baseRoute.name === 'cart') {
          baseHtml = renderCartView();
        } else if (baseRoute.name === 'wishlist') {
          baseHtml = renderWishlistView();
        } else if (baseRoute.name === 'orders') {
          baseHtml = renderOrdersView();
        } else if (baseRoute.name === 'profile') {
          baseHtml = renderProfileView();
        } else if (baseRoute.name === 'notifications') {
          baseHtml = renderNotificationsView();
        } else {
          baseHtml = renderHomeView();
        }
        app.innerHTML = baseHtml;
        app.setAttribute('data-base-route', baseRoute.name);
        if (baseRoute.name === 'home') {
          try { initHeroSlider(); animateStats(); } catch (e) { }
        }
      }

      renderFloatingUi();
      setTimeout(() => window.scrollAnimations?.reObserveSections(), 0);
      return;
    }

    app.innerHTML = '<section class="page"><div class="empty-state"><p>Page not found.</p><a class="primary-button" href="#/">Return home</a></div></section>';
    renderFloatingUi();
    // Re-observe sections for scroll animations
    setTimeout(() => window.scrollAnimations?.reObserveSections(), 0);

    // Restore scroll position if saved
    if (state.scrollPositions && state.route) {
      const canonicalKey = getCanonicalPath(state.route) || '#/';
      const saved = state.scrollPositions[canonicalKey];
      if (saved !== undefined) {
        window.scrollTo(0, saved);
      }
    }
  } catch (error) {
    console.error(error);
    app.innerHTML = `<section class="page"><div class="empty-state"><p>${escapeHtml(error?.message || String(error))}</p></div></section>`;
    renderFloatingUi();
    // Re-observe sections for scroll animations
    setTimeout(() => window.scrollAnimations?.reObserveSections(), 0);
  }
}

async function loadRoute() {
  const prevRouteName = state.route?.name || '';
  // Save previous route's scroll position before changing route
  if (!state.scrollPositions) state.scrollPositions = {};
  if (state.route) {
    const prevKey = getCanonicalPath(state.route) || '#/';
    state.scrollPositions[prevKey] = window.scrollY;
  }

  state.route = getRoute();
  if (state.route.name !== 'login' && state.route.name !== 'register' && state.route.name !== 'reset-password') {
    state.lastActiveHash = window.location.hash || '#/';
  }
  renderChrome();

  const currentKey = getCanonicalPath(state.route) || '#/';
  const savedScroll = state.scrollPositions[currentKey];
  if (savedScroll !== undefined) {
    setTimeout(() => {
      window.scrollTo(0, savedScroll);
    }, 0);
  } else {
    window.scrollTo({ top: 0, behavior: 'auto' });
    document.querySelector('main#app')?.scrollTo({ top: 0, behavior: 'auto' });
  }

  if (state.route.name === 'home') {
    state.search = '';
    state.genre = '';
    state.page = 1;
    await loadHomeData();
    return;
  }

  if (state.route.name === 'search') {
    state.search = state.route.params?.q || state.route.params?.search || '';
    state.genre = state.route.params?.genre || '';
    state.page = 1;
    await loadHomeData();
    return;
  }

  if (state.route.name === 'books') {
    state.search = '';
    state.catalogSearch = '';
    // Preserve genre selection if we were already on the books page,
    // or set it if it was passed explicitly via the route parameters (e.g. from Home page clicks).
    if (state.route.params?.genre !== undefined) {
      state.genre = state.route.params.genre || '';
    } else if (prevRouteName !== 'books') {
      state.genre = '';
    }
    state.page = Math.max(Number(state.route.params?.page || 1), 1);
    state.sort = state.route.params?.sort || state.sort || 'featured';
    await loadBooksData();
    return;
  }

  if (state.route.name === 'reset-password') {
    renderApp();
    return;
  }

  if (state.route.name === 'book') {
    await loadBookData(state.route.params.id);
    return;
  }

  if (state.route.name === 'cart') {
    if (!state.user) {
      renderApp();
      return;
    }
    await loadCartData();
    return;
  }

  if (state.route.name === 'wishlist') {
    if (!state.user) {
      renderApp();
      return;
    }
    await loadWishlistData();
    return;
  }

  if (state.route.name === 'orders') {
    if (!state.user) {
      renderApp();
      return;
    }
    await loadOrdersData();
    return;
  }

  if (state.route.name === 'track') {
    await loadTrackData(state.route.params?.id || '');
    return;
  }

  if (state.route.name === 'notifications') {
    if (!state.user) {
      renderApp();
      return;
    }
    await refreshPersonalization();
    renderApp();
    return;
  }

  if (state.route.name === 'admin-orders') {
    if (!state.user || state.user.role !== 'admin') {
      renderApp();
      return;
    }
    await loadAdminOrdersData();
    return;
  }

  renderApp();
}

function startHeroCycle() {
  if (state.heroTimer) {
    window.clearInterval(state.heroTimer);
  }

  state.heroTimer = window.setInterval(() => {
    const dynamicGenres = Array.isArray(state.genres) && state.genres.length ? state.genres : genreSeed;
    state.typewriterIndex = (state.typewriterIndex + 1) % dynamicGenres.length;
    const typewriter = document.querySelector('.typewriter');
    if (document.querySelector('.hero-showcase-slide')) {
      return; // Skip cycling if hero slider is active
    }
    if (typewriter) {
      typewriter.textContent = dynamicGenres[state.typewriterIndex];
    }
  }, 2200);
}

function handleAction(target) {
  const action = target.dataset.action;

  if (action === 'toggle-description') {
    state.descExpanded = !state.descExpanded;
    renderApp();
    return;
  }

  if (action === 'toggle-mobile-menu') {
    if (mobileMenu && mobileMenu.classList.contains('is-open')) {
      closeMobileMenu();
    } else {
      openMobileMenu();
    }
    closeAccountMenu();
    return;
  }

  if (action === 'close-mobile-menu') {
    closeMobileMenu();
    return;
  }

  if (action === 'open-notifications') {
    closeMobileMenu();
    window.location.hash = '#/notifications';
    return;
  }

  if (action === 'toggle-account-menu') {
    const menu = document.querySelector('[data-account-menu]');
    const trigger = target;
    if (!menu) return;
    const isOpen = menu.classList.toggle('is-open');
    menu.setAttribute('aria-hidden', String(!isOpen));
    trigger.setAttribute('aria-expanded', String(!!isOpen));
    closeMobileMenu();
    return;
  }

  if (action === 'close-account-menu') {
    closeAccountMenu();
    return;
  }

  if (action === 'logout') {
    performLogout();
    return;
  }

  if (action === 'close-auth') {
    window.location.hash = state.lastActiveHash || '#/';
    try { loadRoute(); } catch (e) { renderApp(); }
    return;
  }

  if (action === 'open-reset-password') {
    const currentEmail = document.querySelector('.auth-form[data-form="login"] input[name="email"]')?.value || '';
    window.location.hash = `#/reset-password${currentEmail ? `?email=${encodeURIComponent(currentEmail)}` : ''}`;
    return;
  }

  if (action === 'close-drawer') {
    setDrawerOpen(false);
    return;
  }

  if (action === 'open-checkout') {
    setDrawerOpen(false);
    window.location.hash = '#/cart';
    return;
  }

  if (action === 'open-book') {
    const bookId = target.dataset.bookId;
    window.location.hash = `#/book/${bookId}`;
    return;
  }

  if (action === 'add-to-cart') {
    addToCart(target.dataset.bookId);
    return;
  }

  if (action === 'order-now') {
    orderNow(target.dataset.bookId);
    return;
  }

  if (action === 'buy-now') {
    orderNow(target.dataset.bookId);
    return;
  }

  if (action === 'remove-from-cart') {
    removeFromCart(target.dataset.bookId);
    return;
  }

  if (action === 'toggle-wishlist') {
    toggleWishlist(target.dataset.bookId);
    return;
  }

  if (action === 'share-book') {
    shareBook(target.dataset.bookId);
    return;
  }

  if (action === 'quantity-change') {
    changeQuantity(target.dataset.bookId, Number(target.dataset.delta || 0));
    return;
  }

  if (action === 'set-page') {
    state.page = Number(target.dataset.page || 1);
    const routeName = state.route?.name || getRoute().name;
    if (routeName === 'search') {
      const params = new URLSearchParams();
      params.set('page', String(state.page));
      params.set('sort', String(state.sort || 'featured'));
      if (state.search) params.set('q', state.search);
      if (state.genre) params.set('genre', state.genre);
      window.location.hash = `#/search?${params.toString()}`;
      return;
    }
    if (routeName === 'books') {
      const params = new URLSearchParams();
      params.set('page', String(state.page));
      params.set('sort', String(state.sort || 'featured'));
      window.location.hash = `#/books?${params.toString()}`;
      return;
    }
    renderChrome();
    loadHomeData();
    return;
  }

  if (action === 'load-more-search') {
    loadMoreSearchBooks();
    return;
  }

  if (action === 'load-more-books') {
    loadMoreAllBooks();
    return;
  }

  if (action === 'view-all-books') {
    state.page = 1;
    const params = new URLSearchParams();
    params.set('sort', String(state.sort || 'featured'));
    window.location.hash = `#/books?${params.toString()}`;
    return;
  }
  if (action === 'set-genre') {
    const genre = target.dataset.genre || '';
    const route = state.route?.name || getRoute().name;
    if (route === 'books') {
      // Toggle genre selection inline on the all books page without navigating!
      state.genre = String(state.genre).toLowerCase() === String(genre).toLowerCase() ? '' : genre;
      state.page = 1;
      loadBooksData();
      return;
    }
    window.location.hash = `#/books?genre=${encodeURIComponent(genre)}`;
    return;
  }

  if (action === 'clear-genre') {
    state.genre = '';
    state.page = 1;
    const route = state.route?.name || getRoute().name;
    if (route === 'books') {
      loadBooksData();
    } else {
      window.location.hash = `#/search`;
    }
    return;
  }

  if (action === 'clear-catalog-search') {
    state.catalogSearch = '';
    state.page = 1;
    const suggestionsDiv = document.getElementById('catalog-suggestions');
    if (suggestionsDiv) suggestionsDiv.innerHTML = '';
    loadBooksData();
    return;
  }

  if (action === 'close-suggestions') {
    const item = target.closest('[data-id]');
    const bookId = item?.dataset.id;
    if (bookId) {
      window.location.hash = `#/book/${bookId}`;
    }
    const suggestionsDiv = document.getElementById('catalog-suggestions');
    if (suggestionsDiv) suggestionsDiv.innerHTML = '';
    return;
  }

  if (action === 'catalog-search-submit') {
    event.preventDefault();
    const input = document.querySelector('.catalog-search-input');
    const suggestionsDiv = document.getElementById('catalog-suggestions');
    if (suggestionsDiv) suggestionsDiv.innerHTML = '';
    state.catalogSearch = (input?.value || '').trim();
    state.page = 1;
    loadBooksData();
    return;
  }

  if (action === 'search-author') {
    state.search = target.dataset.author || '';
    state.genre = '';
    state.page = 1;
    renderChrome();
    loadHomeData();
    return;
  }

  if (action === 'toggle-chatbot') {
    if (state.chatbotDrag.moved) {
      state.chatbotDrag.moved = false;
      return;
    }
    state.chatbotOpen = !state.chatbotOpen;
    const root = document.querySelector('.chatbot-float');
    const panel = document.querySelector('.chatbot-panel');
    if (root) root.classList.toggle('is-open', state.chatbotOpen);
    if (panel) panel.setAttribute('aria-hidden', state.chatbotOpen ? 'false' : 'true');
    if (state.chatbotOpen && panel) {
      // Scroll to bottom when opening
      setTimeout(() => {
        const body = panel.querySelector('.chatbot-body');
        if (body) body.scrollTop = body.scrollHeight;
      }, 0);
    }
    return;
  }

  if (action === 'mark-notification-read') {
    const notificationId = target.dataset.notificationId;
    if (!notificationId) return;
    api(`/api/notifications/${notificationId}/read`, { method: 'POST' })
      .then(() => refreshPersonalization())
      .then(() => {
        if (isActiveRoute('notifications')) renderApp();
      })
      .catch((error) => showToast(error.message, 'error'));
    return;
  }

  if (action === 'mark-all-notifications-read') {
    api('/api/notifications/read-all', { method: 'POST' })
      .then(() => refreshPersonalization())
      .then(() => {
        if (isActiveRoute('notifications')) renderApp();
      })
      .catch((error) => showToast(error.message, 'error'));
    return;
  }

  if (action === 'chatbot-quick') {
    const key = target.dataset.chatKey;
    const question = key ? key.charAt(0).toUpperCase() + key.slice(1) : 'Help';
    const answer = chatbotFaq[key] || 'Please contact our support channels in the contact section.';
    state.chatbotMessages.push({ role: 'user', text: question + '?' });
    state.chatbotMessages.push({ role: 'bot', text: answer });
    if (state.chatbotMessages.length > 10) {
      state.chatbotMessages = [state.chatbotMessages[0], ...state.chatbotMessages.slice(-9)];
    }
    state.chatbotOpen = true;
    const root = document.querySelector('.chatbot-float');
    const panel = document.querySelector('.chatbot-panel');
    const body = document.querySelector('.chatbot-body');
    if (root) root.classList.add('is-open');
    if (panel) panel.setAttribute('aria-hidden', 'false');
    if (body) {
      body.insertAdjacentHTML('beforeend', `
        <div class="chatbot-msg is-user">${escapeHtml(question + '?')}</div>
        <div class="chatbot-msg is-bot">${escapeHtml(answer)}</div>
      `);
      body.scrollTop = body.scrollHeight;
    }
    return;
  }

  if (action === 'reset-filters') {
    state.genre = '';
    state.search = '';
    state.sort = 'featured';
    state.page = 1;
    loadRoute();
    return;
  }

  if (action === 'set-star') {
    const form = target.closest('form');
    if (!form) return;
    form.querySelector('input[name="rating"]').value = target.dataset.star;
    form.querySelectorAll('[data-action="set-star"]').forEach((button) => {
      button.classList.toggle('is-active', Number(button.dataset.star) <= Number(target.dataset.star));
    });
    return;
  }

  if (action === 'open-order') {
    const order = state.orders.find((entry) => entry.id === target.dataset.orderId);
    if (order) {
      showToast(`Order ${order.id.slice(0, 8)} contains ${order.items.length} item(s).`, 'success');
    }
  }

  if (action === 'update-order-status') {
    updateOrderStatus(target.dataset.orderId, target.value);
    return;
  }
}

async function updateOrderStatus(orderId, newStatus) {
  try {
    const response = await api(`/api/admin/orders/${orderId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus })
    });
    state.adminOrders = state.adminOrders.map(o => o.id === orderId ? response.order : o);
    showToast(`Order status updated to ${newStatus}`, 'success');
    renderApp();
  } catch (error) {
    showToast(error.message, 'error');
    // Reload to reflect current state
    await loadAdminOrdersData();
  }
}

function closeAccountMenu() {
  const menu = document.querySelector('[data-account-menu]');
  if (!menu) return;
  menu.classList.remove('is-open');
  menu.setAttribute('aria-hidden', 'true');
  const trigger = document.querySelector('[data-action="toggle-account-menu"]');
  if (trigger) trigger.setAttribute('aria-expanded', 'false');
}

async function addToCart(bookId, quantity = 1) {
  try {
    await api('/api/cart', {
      method: 'POST',
      body: JSON.stringify({ bookId, quantity })
    });
    showToast('Added to cart');
    await refreshCart();
    if (isActiveRoute('cart')) {
      await loadCartData();
    }
    return true;
  } catch (error) {
    showToast(error.message, 'error');
    return false;
  }
}

async function removeFromCart(bookId) {
  try {
    await api(`/api/cart/${bookId}`, { method: 'DELETE' });
    showToast('Removed from cart');
    await refreshCart();
    if (isActiveRoute('cart')) {
      await loadCartData();
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function changeQuantity(bookId, delta) {
  const item = state.cart.find((entry) => entry.book.id === bookId);
  const nextQuantity = Math.max(Number(item?.quantity || 0) + delta, 0);
  try {
    await api(`/api/cart/${bookId}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity: nextQuantity })
    });
    await refreshCart();
    if (isActiveRoute('cart')) {
      await loadCartData();
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function toggleWishlist(bookId) {
  if (!state.user) {
    showToast('Sign in to use the wishlist.', 'error');
    window.location.hash = '#/login';
    return;
  }

  try {
    const response = await api(`/api/wishlist/${bookId}`, { method: 'POST' });
    showToast(response.added ? 'Added to wishlist' : 'Removed from wishlist');
    await refreshWishlist();
    await refreshPersonalization();
    if (isActiveRoute('wishlist')) {
      await loadWishlistData();
      return;
    }
    renderApp();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function shareBook(bookId) {
  const book = state.books.find((entry) => String(entry.id) === String(bookId)) || state.featured.find((entry) => String(entry.id) === String(bookId)) || state.currentBook;
  const url = `${window.location.origin}${window.location.pathname}#/book/${bookId}`;
  const title = book?.title ? `Booksta - ${book.title}` : 'Booksta book';
  const text = book?.author ? `${book.title} by ${book.author}` : 'Check out this book on Booksta.';

  try {
    if (navigator.share) {
      await navigator.share({ title, text, url });
      showToast('Shared successfully');
      return;
    }
  } catch (error) {
    if (error?.name !== 'AbortError') {
      console.warn('share failed', error);
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    showToast('Share link copied');
  } catch (error) {
    window.prompt('Copy this share link', url);
  }
}

function showFormAlert(form, message, type = 'error') {
  if (!form) return;
  let alertNode = form.querySelector('.form-alert');
  if (!alertNode) {
    alertNode = document.createElement('div');
    alertNode.className = 'form-alert';
    form.prepend(alertNode);
  }
  alertNode.textContent = message;
  alertNode.className = `form-alert is-${type}`;
  alertNode.style.display = 'block';
  // Scroll form container to top if it's scrollable, or scroll window slightly
  form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function clearFormAlert(form) {
  if (!form) return;
  const alertNode = form.querySelector('.form-alert');
  if (alertNode) {
    alertNode.textContent = '';
    alertNode.className = 'form-alert';
    alertNode.style.display = 'none';
  }
}

async function handleSubmit(form) {
  const formType = form.dataset.form;

  if (formType === 'newsletter') {
    showToast('Thank you for subscribing to our newsletter!', 'success');
    form.reset();
    return;
  }

  if (formType === 'catalog-search') {
    const input = form.querySelector('.catalog-search-input');
    const suggestionsDiv = document.getElementById('catalog-suggestions');
    if (suggestionsDiv) suggestionsDiv.innerHTML = '';
    state.catalogSearch = (input?.value || '').trim();
    state.page = 1;
    input?.blur();
    loadBooksData();
    return;
  }

  if (formType === 'login') {
    clearFormAlert(form);
    const values = Object.fromEntries(new FormData(form).entries());
    try {
      const response = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(values)
      });
      saveSession(response.token, response.user);
      showFormAlert(form, 'Signed in successfully. Redirecting...', 'success');
      await refreshCart();
      await refreshWishlist();
      await refreshOrders();
      await refreshPersonalization();
      // Auto-redirect admin users to admin dashboard
      if (response.user && response.user.role === 'admin') {
        window.location.href = '/admin.html';
      } else {
        setTimeout(async () => {
          window.location.hash = state.lastActiveHash || '#/';
          await loadRoute();
        }, 800);
      }
    } catch (error) {
      showFormAlert(form, error.message, 'error');
    }
    return;
  }

  if (formType === 'register') {
    clearFormAlert(form);
    const values = Object.fromEntries(new FormData(form).entries());
    try {
      const response = await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(values)
      });
      saveSession(response.token, response.user);
      showFormAlert(form, 'Account created successfully. Redirecting...', 'success');
      await refreshCart();
      await refreshWishlist();
      await refreshOrders();
      await refreshPersonalization();
      setTimeout(async () => {
        window.location.hash = state.lastActiveHash || '#/';
        await loadRoute();
      }, 800);
    } catch (error) {
      showFormAlert(form, error.message, 'error');
    }
    return;
  }

  if (formType === 'forgot-password') {
    clearFormAlert(form);
    const values = Object.fromEntries(new FormData(form).entries());
    try {
      const response = await api('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify(values)
      });
      const targetEmail = String(values.email || '').trim();
      const resetMessage = response?.message || 'Reset code sent to your email. Check inbox for the 6-digit PIN.';
      showFormAlert(form, resetMessage, 'success');
      setTimeout(() => {
        window.location.hash = `#/reset-password/confirm?email=${encodeURIComponent(targetEmail)}`;
      }, 1500);
    } catch (error) {
      const userMessage = error?.status === 401
        ? 'Please sign out and try again, or refresh the page and retry.'
        : (error.message || 'Could not send reset code.');
      showFormAlert(form, userMessage, 'error');
    }
    return;
  }

  if (formType === 'reset-password') {
    clearFormAlert(form);
    const values = Object.fromEntries(new FormData(form).entries());
    if (values.newPassword !== values.confirmPassword) {
      showFormAlert(form, 'New password and confirmation must match.', 'error');
      return;
    }

    try {
      await api('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          email: values.email,
          token: values.token,
          newPassword: values.newPassword
        })
      });
      form.reset();
      showFormAlert(form, 'Password reset successfully. Redirecting to login...', 'success');
      setTimeout(() => {
        window.location.hash = '#/login';
      }, 1500);
    } catch (error) {
      showFormAlert(form, error.message, 'error');
    }
    return;
  }

  if (formType === 'profile') {
    clearFormAlert(form);
    const values = Object.fromEntries(new FormData(form).entries());
    try {
      const response = await api('/api/auth/me', {
        method: 'PATCH',
        body: JSON.stringify(values)
      });
      state.user = response.user;
      renderChrome();
      await refreshPersonalization();
      showFormAlert(form, 'Profile updated successfully.', 'success');
    } catch (error) {
      showFormAlert(form, error.message, 'error');
    }
    return;
  }

  if (formType === 'password') {
    clearFormAlert(form);
    const values = Object.fromEntries(new FormData(form).entries());
    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify(values)
      });
      form.reset();
      showFormAlert(form, 'Password updated successfully.', 'success');
    } catch (error) {
      showFormAlert(form, error.message, 'error');
    }
    return;
  }

  if (formType === 'checkout') {
    const values = Object.fromEntries(new FormData(form).entries());
    try {
      // Create the order with the current cart
      const shippingAddress = Object.fromEntries(
        Object.entries({
          line1: values.line1,
          city: values.city,
          country: values.country,
          postalCode: values.postalCode
        }).filter(([, value]) => String(value || '').trim())
      );

      const orderResponse = await api('/api/orders', {
        method: 'POST',
        body: JSON.stringify({ shippingAddress })
      });

      const orderId = orderResponse.order.id;

      // Now send WhatsApp message with order ID
      const whatsappNumber = String(state.settings?.whatsappNumber || '250782781575').replace(/[^\d+]/g, '');
      const pricing = getOrderPricing();
      const orderLines = state.cart.map((item) => `- ${item.book.title} x ${item.quantity} (${formatMoney(item.subtotal)})`).join('\n');
      const addressParts = [values.line1, values.city, values.country].map((part) => String(part || '').trim()).filter(Boolean);
      const promotionText = pricing.promotion ? `Promotion: ${pricing.promotion.code} (-${formatMoney(pricing.discount)})` : 'Promotion: None';
      const message = buildOrderMessage({
        orderId,
        name: state.user?.name || '',
        email: state.user?.email || '',
        address: addressParts.length ? addressParts.join(', ') : 'Not provided',
        promotionText,
        orderLines,
        subtotal: formatMoney(pricing.subtotal),
        total: formatMoney(pricing.total)
      });
      const targetNumber = whatsappNumber || '250782781575';
      openWhatsAppOrder(targetNumber, message);

      // Reload orders data to show new pending order
      await loadRoute();
      await refreshPersonalization();
      showToast(`Order #${orderId.slice(0, 8)} created! Opening WhatsApp for payment confirmation.`);
    } catch (error) {
      showToast(error.message, 'error');
    }
    return;
  }

  if (formType === 'review') {
    const values = Object.fromEntries(new FormData(form).entries());
    try {
      await api(`/api/reviews/book/${form.dataset.bookId}`, {
        method: 'POST',
        body: JSON.stringify(values)
      });
      showToast('Review posted');
      await loadBookData(form.dataset.bookId);
      await refreshPersonalization();
    } catch (error) {
      showToast(error.message, 'error');
    }
  }
}

app.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) {
    return;
  }
  handleAction(target);
});

// Global delegated handler for elements outside #app (header auth-slot, footer)
document.addEventListener('click', (event) => {
  if (!document.body.contains(event.target)) return;
  if (event.target.closest('#app')) return;
  const target = event.target.closest('[data-action]');
  if (!target) return;
  handleAction(target);
});

// Close menus when tapping outside them (ignore chatbot interactions)
document.addEventListener('click', (event) => {
  if (!document.body.contains(event.target)) return;
  const target = event.target;
  // If the click is within mobile menu or account menu controls, or within the chatbot widget, ignore
  if (
    target.closest('.mobile-menu') ||
    target.closest('.account-menu') ||
    target.closest('[data-action="toggle-mobile-menu"]') ||
    target.closest('[data-action="toggle-account-menu"]') ||
    target.closest('.chatbot-float') ||
    target.closest('.chatbot-panel') ||
    target.closest('.chatbot-toggle') ||
    target.closest('[data-action="toggle-chatbot"]') ||
    target.closest('[data-action="chatbot-quick"]')
  ) {
    return;
  }
  closeMobileMenu();
  closeAccountMenu();
  // Close catalog suggestions when clicking outside
  if (!event.target.closest('.catalog-search-box')) {
    const suggestionsDiv = document.getElementById('catalog-suggestions');
    if (suggestionsDiv) suggestionsDiv.innerHTML = '';
  }
});

document.addEventListener('submit', async (event) => {
  const form = event.target.closest('form[data-form]');
  if (!form) {
    return;
  }
  event.preventDefault();
  await handleSubmit(form);
});

app.addEventListener('input', (event) => {
  // Catalog page search — show suggestions dropdown, don't auto-search
  const catalogInput = event.target.closest('[data-action="catalog-search-input"]');
  if (catalogInput) {
    const query = catalogInput.value.trim();
    const suggestionsDiv = document.getElementById('catalog-suggestions');

    window.clearTimeout(state._catalogSuggestTimer);

    if (!query || query.length < 2) {
      if (suggestionsDiv) suggestionsDiv.innerHTML = '';
      return;
    }

    state._catalogSuggestTimer = window.setTimeout(async () => {
      try {
        const res = await api(`/api/books?search=${encodeURIComponent(query)}&limit=5&page=1`);
        const books = res.books || [];
        if (!suggestionsDiv) return;

        if (books.length === 0) {
          suggestionsDiv.innerHTML = `<div class="catalog-suggest-empty">No results for "${escapeHtml(query)}"</div>`;
          return;
        }

        suggestionsDiv.innerHTML = books.map(book => `
          <a class="catalog-suggest-item" href="#/book/${book.id}" data-action="close-suggestions" data-id="${book.id}">
            <img class="catalog-suggest-cover" src="${book.cover_url || ''}" alt="" onerror="this.style.display='none'" />
            <div class="catalog-suggest-info">
              <span class="catalog-suggest-title">${escapeHtml(book.title)}</span>
              <span class="catalog-suggest-author">${escapeHtml(book.author || '')}</span>
            </div>
          </a>
        `).join('') + `<a class="catalog-suggest-viewall" href="#" data-action="catalog-search-submit">See all results for "${escapeHtml(query)}" →</a>`;
      } catch (e) {
        // silently fail suggestions
      }
    }, 300);
    return;
  }

  const input = event.target.closest('[data-action="search-books"]');
  if (!input) {
    return;
  }

  state.search = input.value;
  state.page = 1;
  window.clearTimeout(state.searchTimer);
  state.searchTimer = window.setTimeout(() => {
    loadRoute();
  }, 300);
});

headerSearchInput?.addEventListener('input', async (event) => {
  const query = event.target.value.trim();
  const suggestionsDiv = document.getElementById('search-suggestions');
  const searchCloseBtn = document.getElementById('search-close-btn');

  // Show/hide close button based on search input
  if (searchCloseBtn) {
    searchCloseBtn.style.display = query ? 'block' : 'none';
  }

  if (!query || query.length < 2) {
    suggestionsDiv.style.display = 'none';
    return;
  }

  try {
    // Fetch suggestions from search API
    const res = await api(`/api/books?limit=8&search=${encodeURIComponent(query)}`).catch((err) => {
      console.error('Search suggestion error:', err);
      return null;
    });
    const books = (res?.books) || [];

    if (books.length === 0) {
      suggestionsDiv.innerHTML = '<div style="padding: 0.75rem 1rem; color: var(--muted); font-size: 0.9rem; text-align: center;">Press <kbd>Enter</kbd> to search</div>';
      suggestionsDiv.style.display = 'block';
      return;
    }

    // Group suggestions by type
    const suggestions = books.map(b => ({
      title: b.title,
      author: b.author,
      type: 'book',
      id: b.id,
      cover: b.cover_url
    }));

    // Build suggestions HTML
    let html = '';
    suggestions.forEach((s, idx) => {
      const highlight = query.toLowerCase();
      const titleMatch = s.title.toLowerCase().includes(highlight);
      const authorMatch = s.author.toLowerCase().includes(highlight);

      html += `
        <div class="search-suggestion-item" data-index="${idx}" data-id="${s.id}" style="padding: 0.75rem 1rem; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; gap: 0.75rem; align-items: center; transition: background 0.15s;">
          ${s.cover ? `<img src="${escapeHtml(s.cover)}" alt="" style="width: 32px; height: 48px; object-fit: cover; border-radius: 4px;">` : `<div style="width: 32px; height: 48px; background: var(--bg-soft); border-radius: 4px; display: flex; align-items: center; justify-content: center;">📚</div>`}
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(s.title)}</div>
            <div style="font-size: 0.8rem; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">by ${escapeHtml(s.author)}</div>
          </div>
        </div>
      `;
    });

    suggestionsDiv.innerHTML = html;
    suggestionsDiv.style.display = 'block';

    // Add click listeners to suggestions
    document.querySelectorAll('.search-suggestion-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const bookId = item.dataset.id;
        window.location.hash = `#/book/${bookId}`;
        suggestionsDiv.style.display = 'none';
        headerSearchInput.value = '';
      });
      item.addEventListener('mouseover', () => {
        document.querySelectorAll('.search-suggestion-item').forEach(i => i.style.background = 'transparent');
        item.style.background = 'rgba(124, 140, 255, 0.1)';
      });
      item.addEventListener('mouseout', () => {
        item.style.background = 'transparent';
      });
    });
  } catch (error) {
    console.warn('Search suggestions error:', error);
    suggestionsDiv.style.display = 'none';
  }

  state.search = query;
  state.page = 1;
});

// Hide search suggestions when clicking outside
document.addEventListener('click', (e) => {
  const searchForm = document.getElementById('header-search-form');
  const suggestionsDiv = document.getElementById('search-suggestions');
  if (searchForm && !searchForm.contains(e.target)) {
    suggestionsDiv.style.display = 'none';
  }
});

// Handle search close button - clear search and navigate to home
const searchCloseBtn = document.getElementById('search-close-btn');
if (searchCloseBtn) {
  searchCloseBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Clear search input
    headerSearchInput.value = '';
    // Hide suggestions
    const suggestionsDiv = document.getElementById('search-suggestions');
    if (suggestionsDiv) {
      suggestionsDiv.style.display = 'none';
    }
    // Close mobile search if open
    closeMobileSearch();
    // Hide close button
    searchCloseBtn.style.display = 'none';
    // Navigate to home
    window.location.hash = '#/';
  });
}

document.getElementById('header-search-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  state.search = (headerSearchInput?.value || '').trim();
  state.page = 1;
  window.location.hash = '#/search?q=' + encodeURIComponent(state.search || '');
  loadRoute();
});

// Handle footer newsletter form submission to comply with CSP (no inline scripts/events)
document.addEventListener('submit', (event) => {
  const footerNewsletterForm = event.target.closest('.site-footer .newsletter-form');
  if (footerNewsletterForm) {
    event.preventDefault();
    showToast("Thanks — you'll receive book recommendations and restock updates via email.", 'success');
    footerNewsletterForm.reset();
  }
});

// Mobile search open/close helpers
function openMobileSearch() {
  const isOpen = document.body.classList.contains('mobile-search-open');
  if (isOpen) {
    closeMobileSearch();
  } else {
    document.body.classList.add('mobile-search-open');
    const input = document.getElementById('header-search');
    if (input) {
      input.focus();
    }
  }
}

function closeMobileSearch() {
  document.body.classList.remove('mobile-search-open');
}

// Initialize floating draggable hamburger for mobile
function initFloatingHamburger() {
  const el = document.getElementById('mobile-hamburger');
  if (!el) return;
  el.style.touchAction = 'manipulation';
  el.style.position = 'static';
  el.style.left = '';
  el.style.top = '';
  el.style.right = '';
  el.style.bottom = '';
  localStorage.removeItem('mobileHamburgerPos');
}

// wire mobile menu and search actions via delegated handler
document.addEventListener('click', (event) => {
  if (!document.body.contains(event.target)) return;
  const t = event.target.closest('[data-action="open-mobile-search"]');
  if (t) {
    openMobileSearch();
  }
  const c = event.target.closest('[data-action="close-mobile-search"]');
  if (c) {
    closeMobileSearch();
  }
  const closeMenu = event.target.closest('[data-action="close-mobile-menu"]');
  if (closeMenu) {
    closeMobileMenu();
  }
});

// init floating hamburger after DOM ready
window.addEventListener('load', () => {
  initFloatingHamburger();
});

app.addEventListener('change', (event) => {
  const select = event.target.closest('[data-action="sort-books"]');
  if (!select) {
    return;
  }
  const sort = select.value;
  const route = state.route?.name || getRoute().name;
  const params = new URLSearchParams();

  params.set('sort', sort);
  if (route === 'search' && state.search) {
    params.set('q', state.search);
  }
  if (route === 'search' && state.genre) {
    params.set('genre', state.genre);
  }
  if (route === 'books') {
    params.set('page', '1');
  }

  state.sort = sort;
  state.page = 1;
  if (route === 'home') {
    window.location.hash = `#/search?${params.toString()}`;
    return;
  }
  if (route === 'search') {
    window.location.hash = `#/search?${params.toString()}`;
    return;
  }
  if (route === 'books') {
    window.location.hash = `#/books?${params.toString()}`;
    return;
  }
  loadRoute();
});

themeToggle.addEventListener('click', () => {
  setTheme(state.theme === 'dark' ? 'light' : 'dark');
});

mobileThemeToggle?.addEventListener('click', () => {
  setTheme(state.theme === 'dark' ? 'light' : 'dark');
});

document.getElementById('cart-button').addEventListener('click', () => setDrawerOpen(!state.drawerOpen));
mobileCartButton?.addEventListener('click', () => setDrawerOpen(!state.drawerOpen));

// Notification button click handler
document.getElementById('notification-button')?.addEventListener('click', () => {
  window.location.hash = '#/notifications';
});

// Intercept all hash-based links to prevent page reload due to <base href="/">
document.addEventListener('click', (event) => {
  const link = event.target.closest('a');
  if (!link) return;
  const href = link.getAttribute('href');
  if (href && href.startsWith('#')) {
    event.preventDefault();
    window.location.hash = href;
  }
});

window.addEventListener('hashchange', () => {
  setDrawerOpen(false);
  loadRoute();
});

window.addEventListener('resize', () => {
  if (window.innerWidth > 980) {
    setDrawerOpen(false);
  }
  if (window.innerWidth > 700) {
    closeMobileMenu();
    closeAccountMenu();
  }
  syncChatbotMode();
  window.clearTimeout(state._paginationResizeTimer);
  state._paginationResizeTimer = window.setTimeout(() => {
    const changed = syncResponsivePageLimit();
    if (changed && (isActiveRoute('home') || isActiveRoute('search'))) {
      state.page = 1;
      loadHomeData();
    }
  }, 180);
  // Dragging disabled - skip position restore
  // // Dragging disabled - skip position restore
  // positionChatbotFromStorage();
});

// Dragging disabled - floating button now stays in fixed position
// document.addEventListener('pointerdown', (event) => {
//   const toggle = event.target.closest('.chatbot-toggle');
//   if (toggle) startChatbotDrag(event);
// });
// document.addEventListener('pointermove', (event) => {
//   if (!state.chatbotDrag.active) return;
//   moveChatbotDrag(event);
// });
// document.addEventListener('pointerup', (event) => {
//   if (!state.chatbotDrag.active) return;
//   endChatbotDrag(event);
// });
// document.addEventListener('pointercancel', (event) => {
//   if (!state.chatbotDrag.active) return;
//   endChatbotDrag(event);
// });

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    setDrawerOpen(false);
    closeMobileMenu();
    closeAccountMenu();
  }
});

async function init() {
  window.__bookstaStage = 'init:start';
  setTheme(state.theme);
  syncChatbotMode();
  window.__bookstaStage = 'init:setTheme';
  renderChrome();
  window.__bookstaStage = 'init:renderChrome';

  const currentRoute = getRoute();
  const isPublicRoute = ['home', 'search', 'books', 'book', 'login', 'register', 'forgot-password', 'reset-password'].includes(currentRoute.name);

  // We can load session and cart in sequence since cart needs user session
  const sessionAndCartPromise = refreshSession().then(() => refreshCart());
  const settingsPromise = loadSiteSettings();
  const promotionsPromise = loadPromotionsData();

  // Load featured authors from DB (public endpoint, no auth needed)
  fetch('/api/public/featured-authors')
    .then(r => r.json())
    .then(d => { if (d.authors) state.featuredAuthors = d.authors; })
    .catch(() => { /* silently fall back to hardcoded authors */ });

  // Set up scroll-to-top/bottom FAB
  setupScrollFab();

  if (isPublicRoute) {
    // Parallelize everything to boot as fast as possible
    await Promise.all([
      sessionAndCartPromise,
      settingsPromise,
      promotionsPromise,
      loadRoute()
    ]);
  } else {
    // For protected routes, wait for user session first to avoid flashing/redirection
    await sessionAndCartPromise;
    await Promise.all([
      settingsPromise,
      promotionsPromise,
      loadRoute()
    ]);
  }

  window.__bookstaStage = 'init:bootDataLoaded';
  syncResponsivePageLimit();
  startHeroCycle();
  window.__bookstaStage = 'init:startHeroCycle';
  positionChatbotFromStorage();
}

try {
  init();
  window.__bookstaStage = window.__bookstaStage || 'init:started';
} catch (e) {
  console.error('booksta: init error', e);
  window.__bookstaErrors.push(String(e?.message || e));
  const appEl = document.getElementById('app');
  if (appEl) {
    appEl.innerHTML = `<section class="page"><div class="empty-state"><p>Startup error: ${escapeHtml(e?.message || String(e))}</p></div></section>`;
  }
}

async function performLogout() {
  try {
    // Attempt server-side logout if endpoint exists
    await api('/api/auth/logout', { method: 'POST' });
  } catch (err) {
    // ignore server errors — we'll clear client session anyway
  }
  clearSession(true);
  setDrawerOpen(false);
  window.location.hash = '#/';
  renderApp();
  try { await loadRoute(); } catch (e) { /* ignore */ }
}


function setupScrollFab() {
  // Create FAB if not exists
  let fab = document.getElementById('scroll-fab');
  if (!fab) {
    fab = document.createElement('button');
    fab.id = 'scroll-fab';
    fab.setAttribute('aria-label', 'Scroll');
    fab.innerHTML = '↑';
    document.body.appendChild(fab);
  }

  let ticking = false;
  const updateFab = () => {
    const scrolled = window.scrollY;
    const maxScroll = document.body.scrollHeight - window.innerHeight;
    const atTop = scrolled < 200;
    const atBottom = scrolled >= maxScroll - 200;

    if (atTop) {
      // Hide when at very top
      fab.classList.remove('visible');
    } else {
      fab.classList.add('visible');
      // Near bottom → show up arrow; in middle → show up; approaching top → show down
      const nearBottom = scrolled > maxScroll * 0.8;
      fab.innerHTML = nearBottom ? '↑' : '↑';
      fab.setAttribute('aria-label', nearBottom ? 'Scroll to top' : 'Scroll to top');
    }
    ticking = false;
  };

  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(updateFab);
      ticking = true;
    }
  }, { passive: true });

  fab.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}


async function orderNow(bookId, quantity = 1) {
  // Find book info from state for WhatsApp message
  const allBooks = [...(state.books || []), ...(state.featured || []), ...(state.kidsBooks || [])];
  const book = allBooks.find(b => String(b.id) === String(bookId));

  try {
    // Show loading toast
    showToast('Processing your order…', 'info');

    // Create anonymous order (no login required)
    const res = await fetch('/api/public/orders/anonymous', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookId,
        quantity,
        contactInfo: state.user
          ? { name: state.user.name, email: state.user.email }
          : {}
      })
    });

    const data = await res.json();

    if (!res.ok || !data.ok) {
      showToast(data.error || 'Could not create order. Please try again.', 'error');
      return;
    }

    const order = data.order;
    const trackingUrl = `${window.location.origin}${window.location.pathname}#/track?id=${encodeURIComponent(order.trackingId)}`;

    // Build WhatsApp message
    const settings = state.settings || {};
    const waNumber = String(settings.whatsappNumber || '250782781575').replace(/[^\d+]/g, '');
    const bookTitle = order.bookTitle || (book && book.title) || 'Book';
    const bookAuthor = order.bookAuthor || (book && book.author) || '';
    const price = order.total ? formatMoney(order.total) : '';
    const msg = [
      `📚 *New Order — Booksta*`,
      ``,
      `*Book:* ${bookTitle}${bookAuthor ? ` by ${bookAuthor}` : ''}`,
      `*Quantity:* ${order.quantity || quantity}`,
      `*Total:* ${price}`,
      `*Order ID:* ${order.trackingId}`,
      ``,
      `*Track Order:* ${trackingUrl}`,
      ``,
      `I'd like to confirm this order and arrange delivery.`
    ].join('\n');

    const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}`;

    // Open WhatsApp
    window.open(waUrl, '_blank', 'noopener,noreferrer');

    // Show success toast with tracking link
    showToast(`Order #${order.trackingId} created! Check WhatsApp to confirm.`, 'success');

    // Add track link to app route if user is not signed in
    setTimeout(() => {
      const trackHtml = `<div style="position:fixed;bottom:5rem;left:50%;transform:translateX(-50%);background:var(--card-bg);border:1px solid var(--border);border-radius:12px;padding:0.9rem 1.4rem;z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,0.3);display:flex;gap:0.75rem;align-items:center;font-size:0.9rem;" id="order-track-bar">
        <span>📦 Order: <strong>${escapeHtml(order.trackingId)}</strong></span>
        <a href="#/track?id=${encodeURIComponent(order.trackingId)}" style="color:var(--accent);font-weight:600;text-decoration:none;">Track</a>
        <button onclick="document.getElementById('order-track-bar').remove()" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:1.1rem;padding:0;line-height:1;">✕</button>
      </div>`;
      const el = document.createElement('div');
      el.innerHTML = trackHtml;
      document.body.appendChild(el.firstElementChild);
    }, 1500);

  } catch (err) {
    console.error('orderNow error:', err);
    showToast('Could not connect. Please try again.', 'error');
  }
}
