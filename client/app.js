// Instrumentation: mark module load early to help diagnose blank-page issues
window.__bookstaInitStart = Date.now();
window.__bookstaErrors = window.__bookstaErrors || [];
console.log('booksta: app.js module executing', { time: new Date(window.__bookstaInitStart).toISOString() });
const API_BASE_URL = localStorage.getItem('API_BASE_URL') || document.querySelector('meta[name="api-base-url"]')?.content || window.API_BASE_URL || '';
const app = document.getElementById('app');
const authSlot = document.getElementById('auth-slot');
const cartCount = document.getElementById('cart-count');
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
const mobileMenuAuth = document.getElementById('mobile-menu-auth');
const mobileThemeToggle = document.getElementById('mobile-theme-toggle');
const mobileCartButton = document.getElementById('mobile-cart-button');
const mobileCartCount = document.getElementById('mobile-cart-count');

// Direct hamburger click handler - bypasses complex initialization
const mobileHamburger = document.getElementById('mobile-hamburger');
if (mobileHamburger) {
  mobileHamburger.addEventListener('click', () => {
    if (mobileMenu) {
      const isOpen = mobileMenu.classList.toggle('is-open');
      mobileMenu.setAttribute('aria-hidden', String(!isOpen));
      mobileHamburger.setAttribute('aria-expanded', String(!!isOpen));
      // Close account menu if open
      const accountMenu = document.querySelector('[data-account-menu]');
      if (accountMenu) {
        accountMenu.classList.remove('is-open');
        accountMenu.setAttribute('aria-hidden', 'true');
      }
    }
  });
}

const genreSeed = ['Fiction', 'Sci-Fi', 'Fantasy', 'Thriller', 'Romance', 'Self-Help', 'History', 'Manga'];

const state = {
  token: localStorage.getItem('bookstaToken'),
  user: null,
  books: [],
  featured: [],
  promotions: [],
  genres: genreSeed,
  cart: [],
  wishlist: [],
  orders: [],
  currentBook: null,
  currentReviews: [],
  route: null,
  homeLoading: true,
  bookLoading: true,
  cartLoading: true,
  wishlistLoading: true,
  ordersLoading: true,
  search: '',
  genre: '',
  sort: 'featured',
  page: 1,
  limit: 12,
  drawerOpen: false,
  typewriterIndex: 0,
  theme: localStorage.getItem('bookstaTheme') || 'dark',
  heroTimer: null,
  searchTimer: null,
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
  return new Intl.NumberFormat('rw-RW', {
    style: 'currency',
    currency: 'RWF'
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


function isActiveRoute(name) {
  return (state.route?.name || getRoute().name) === name;
}

function getRoute() {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  const segments = (path || '/').replace(/^\/+/, '').split('/').filter(Boolean);
  const params = {};
  if (qs) {
    try {
      new URLSearchParams(qs).forEach((v, k) => { params[k] = v; });
    } catch (e) {}
  }

  if (!segments.length) {
    return { name: 'home', params };
  }

  if (segments[0] === 'search') {
    return { name: 'search', params };
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

  if (segments[0] === 'login') {
    return { name: 'login', params: params };
  }

  if (segments[0] === 'register') {
    return { name: 'register', params: params };
  }

  return { name: 'home', params };
} 

function setTheme(theme) {
  state.theme = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = state.theme;
    localStorage.setItem('bookstaTheme', state.theme);
  themeToggle.textContent = state.theme === 'dark' ? '◐' : '◑';
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

  if (!isFormData && options.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (state.token) {
    headers.set('Authorization', `Bearer ${state.token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers
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
  const cartQuantity = state.cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

  if (cartCount) {
    cartCount.textContent = String(cartQuantity);
  }

  if (mobileCartCount) {
    mobileCartCount.textContent = String(cartQuantity);
  }

  if (authSlot) {
    authSlot.innerHTML = state.user
      ? `
        <div class="account-menu">
          <button class="account-trigger" type="button" data-action="toggle-account-menu" aria-expanded="false" aria-haspopup="menu">
            <span class="account-avatar">${escapeHtml(initials(state.user.name || state.user.email || 'Reader'))}</span>
            <span class="account-trigger-copy">
              <span class="account-trigger-label">${escapeHtml(state.user.name || 'Reader')}</span>
              <span class="account-trigger-sub">${escapeHtml(state.user.role || 'customer')}</span>
            </span>
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

  if (mobileMenuAuth) {
    mobileMenuAuth.innerHTML = state.user
      ? `
        <div class="mobile-account-card">
          <div class="mobile-account-top">
            <span class="account-avatar">${escapeHtml(initials(state.user.name || state.user.email || 'Reader'))}</span>
            <div>
              <div class="mobile-account-name">${escapeHtml(state.user.name || 'Reader')}</div>
              <div class="mobile-account-role">${escapeHtml(state.user.role || 'customer')}</div>
            </div>
          </div>
          <a class="ghost-button" href="#/profile" data-action="close-mobile-menu">Profile</a>
          <button class="ghost-button" type="button" data-action="logout">Logout</button>
        </div>
      `
      : `
        <div class="mobile-account-card">
          <a class="ghost-button" href="#/login" data-action="close-mobile-menu">Login</a>
          <a class="primary-button" href="#/register" data-action="close-mobile-menu">Register</a>
        </div>
      `;
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
            ${item.book.cover_url ? `<img src="${escapeHtml(item.book.cover_url)}" alt="${escapeHtml(item.book.title)}" class="review-avatar" style="width: 100%; height: 100%; object-fit: cover; border-radius: 22px;" />` : `<span class="cover-emoji">${escapeHtml(item.book.emoji || '📚')}</span>`}
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
  const total = reviews.length || 1;
  const counts = [5, 4, 3, 2, 1].map((rating) => reviews.filter((review) => Number(review.rating) === rating).length);

  return counts.map((count, index) => {
    const rating = 5 - index;
    const width = Math.round((count / total) * 100);
    return `
      <div class="chart-row">
        <span class="hint">${rating}★</span>
        <div class="rating-bar"><span style="width:${width}%"></span></div>
        <span class="hint">${count}</span>
      </div>
    `;
  }).join('');
}

function renderBookCard(book) {
  const sale = book.original_price && Number(book.original_price) > Number(book.price);
  return `
    <article class="book-card glass-card">
      <a href="#/book/${book.id}" class="book-cover" data-action="open-book" data-book-id="${escapeHtml(book.id)}" style="background: linear-gradient(145deg, ${escapeHtml(book.cover_color || '#1f2937')}, rgba(15, 23, 42, 0.9));">
        ${sale ? '<span class="sale-badge">SALE</span>' : ''}
        <span class="cover-emoji">${escapeHtml(book.emoji || '📚')}</span>
        ${book.cover_url ? `<img src="${escapeHtml(book.cover_url)}" alt="${escapeHtml(book.title)}" class="cover-swatch" />` : ''}
      </a>
      <div>
        <div class="book-meta">${escapeHtml(book.genre || 'Book')}</div>
        <h3 class="book-title"><a href="#/book/${book.id}">${escapeHtml(book.title)}</a></h3>
        <div class="book-meta">${escapeHtml(book.author)}</div>
      </div>
      <div class="price-row">
        <strong class="price">${formatMoney(book.price)}</strong>
        ${sale ? `<span class="price-old">${formatMoney(book.original_price)}</span>` : ''}
      </div>
      <div class="rating-line">
        <span class="hint">${renderStars(book.avg_rating)}</span>
        <div class="hint">${Number(book.review_count || 0)} reviews</div>
        <span class="hint">${book.stock} in stock</span>
      </div>
      <div class="card-actions">
        <button class="secondary-button" type="button" data-action="add-to-cart" data-book-id="${escapeHtml(book.id)}">Add to cart</button>
        <button class="primary-button" type="button" data-action="order-now" data-book-id="${escapeHtml(book.id)}">Order now</button>
        <button class="ghost-button" type="button" data-action="toggle-wishlist" data-book-id="${escapeHtml(book.id)}">Wishlist</button>
      </div>
    </article>
  `;
}

function renderMiniBook(item) {
  return `
    <article class="mini-book glass-card">
      <div class="mini-cover" style="background: linear-gradient(145deg, ${escapeHtml(item.book.cover_color || '#1f2937')}, rgba(15, 23, 42, 0.9));">
        ${item.book.cover_url ? `<img src="${escapeHtml(item.book.cover_url)}" alt="${escapeHtml(item.book.title)}" style="width:100%;height:100%;object-fit:cover;border-radius:22px;" />` : `<span class="cover-emoji">${escapeHtml(item.book.emoji || '📚')}</span>`}
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
    <article class="wishlist-card glass-card">
      <div class="wishlist-row">
        <div class="wishlist-thumb" style="background: linear-gradient(145deg, ${escapeHtml(item.book.cover_color || '#1f2937')}, rgba(15, 23, 42, 0.9)); display:grid; place-items:center;">
          ${item.book.cover_url ? `<img src="${escapeHtml(item.book.cover_url)}" alt="${escapeHtml(item.book.title)}" style="width:100%;height:100%;object-fit:cover;border-radius:18px;" />` : `<span class="cover-emoji">${escapeHtml(item.book.emoji || '📚')}</span>`}
        </div>
        <div>
          <h3 class="wishlist-title"><a href="#/book/${item.book.id}">${escapeHtml(item.book.title)}</a></h3>
          <div class="hint">${escapeHtml(item.book.author)} · ${escapeHtml(item.book.genre || 'Book')}</div>
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
    <article class="order-card glass-card">
      <div class="order-head">
        <div class="order-meta">${new Date(order.created_at).toLocaleString()}</div>
        <h3 class="order-title">Order ${escapeHtml(order.id.slice(0, 8))}</h3>
        <div class="order-meta">${escapeHtml(order.status)} · ${order.items.length} item(s)</div>
      </div>
      <div class="table-list">
        ${order.items.map((item) => `
          <div class="order-item">
            <div class="order-thumb" style="background: linear-gradient(145deg, ${escapeHtml(item.cover_color || '#1f2937')}, rgba(15, 23, 42, 0.9)); display:grid; place-items:center;">
              ${item.cover_url ? `<img src="${escapeHtml(item.cover_url)}" alt="${escapeHtml(item.title)}" style="width:100%;height:100%;object-fit:cover;border-radius:14px;" />` : `<span class="cover-emoji">${escapeHtml(item.emoji || '📚')}</span>`}
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
        <img class="review-avatar" src="${escapeHtml(avatar)}" alt="${escapeHtml(review.user_name || 'Reviewer')}" />
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
  return `
    <div class="pagination">
      ${Array.from({ length: totalPages }, (_, index) => index + 1).map((number) => `
        <button class="page-number ${number === page ? 'is-active' : ''}" type="button" data-action="set-page" data-page="${number}">${number}</button>
      `).join('')}
    </div>
  `;
}

function renderHeroTypewriter() {
  const text = genreSeed[state.typewriterIndex % genreSeed.length];
  return `<span class="typewriter">${escapeHtml(text)}</span>`;
}

function renderHomeView() {
  const isSearchMode = Boolean(String(state.search || '').trim());
  const heroBooks = state.featured.slice(0, 2);
  const featuredMarkup = heroBooks.length
    ? `<div class="books-grid hero-feature-grid">${heroBooks.map(renderBookCard).join('')}</div>`
    : renderSkeletonGrid(4);

  const booksMarkup = state.homeLoading
    ? renderSkeletonGrid(12)
    : state.books.length
      ? `<div class="books-grid">${state.books.map(renderBookCard).join('')}</div>`
      : `<div class="empty-state"><p>No books match your current filters.</p><button class="primary-button" type="button" data-action="reset-filters">Clear filters</button></div>`;

  const tabsMarkup = ['All', ...state.genres].map((genre) => `
    <button class="tab ${!state.genre && genre === 'All' || state.genre === genre ? 'is-active' : ''}" type="button" data-action="set-genre" data-genre="${escapeHtml(genre === 'All' ? '' : genre)}">${escapeHtml(genre)}</button>
  `).join('');

  return `
    <section class="page home-page full-width section full-bleed">
      <div class="hero glass">
        <div>
          <div class="pill">A modern bookstore with a cinematic reading experience</div>
          <h1 class="hero-title">Booksta Online BookStore for readers who want the shelf to feel alive.</h1>
          <p class="hero-copy">
            Discover featured picks, browse by genre, keep a wishlist, manage your cart, and order books with a smooth checkout flow.
            The catalog below is powered by the live API, with search, pagination, and review-aware rating summaries.
          </p>
          <div class="hero-copy">Currently cycling genres: ${renderHeroTypewriter()}</div>
          <div class="hero-cta">
            <a class="primary-button" href="#/">Browse books</a>
            <a class="secondary-button" href="#/cart">Go to cart</a>
          </div>
          <div class="hero-search-hint">Use the header search to find books by title, author, or genre.</div>
          <div class="hero-stats" style="margin-top: 1rem;">
            <div class="stat"><span class="stat-value">20</span><span class="stat-label">featured books</span></div>
            <div class="stat"><span class="stat-value">8</span><span class="stat-label">genres</span></div>
            <div class="stat"><span class="stat-value">Secure</span><span class="stat-label">checkout flow</span></div>
          </div>
        </div>
        <div class="hero-panel">
          <div class="glass-card">
            ${isSearchMode
              ? `<div class="hint">Search results</div><h3 class="mini-title" style="margin:0;">\"${escapeHtml(state.search)}\"</h3><p class="section-copy">Found ${Number(state.total || state.books.length || 0)} matching book(s). Browse the results section below.</p>`
              : `<div class="hint">Featured titles</div>${featuredMarkup}`}
          </div>
        </div>
      </div>

      <section class="section" ${isSearchMode ? 'style="display:none;"' : ''}>
        <div class="marquee glass-card">
          <div class="marquee-track">${[...state.featured, ...state.books, ...state.featured, ...state.books].map((book) => `<span class="marquee-item">${escapeHtml(book.title || 'Featured book')}</span>`).join('')}</div>
        </div>
      </section>

      <section class="section">
        <div class="toolbar">
          <div>
            <h2 class="section-title">Explore books</h2>
            <p class="section-copy">Use genre tabs and sort controls to narrow the catalog. Search now lives in the header.</p>
          </div>
          <div class="filter-row">
            <select class="select" data-action="sort-books">
              ${[
                ['featured', 'Featured'],
                ['price_asc', 'Price: Low to High'],
                ['price_desc', 'Price: High to Low'],
                ['rating', 'Top Rated'],
                ['newest', 'Newest'],
                ['title_asc', 'Title A-Z']
              ].map(([value, label]) => `<option value="${value}" ${state.sort === value ? 'selected' : ''}>${label}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="filter-pill-row">${tabsMarkup}</div>
        ${booksMarkup}
        ${state.homeLoading ? '' : renderPaginator(state.page, state.totalPages || 1)}
      </section>

      <section class="section" style="padding: 4rem 0;">
        <h2 class="section-title">Why Choose Booksta Online BookStore?</h2>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 2rem; margin-top: 2rem;">
          <div class="panel" style="padding: 2rem; text-align: center;">
            <div style="font-size: 3rem; margin-bottom: 1rem;">📚</div>
            <h3 style="margin: 0 0 0.75rem 0;">Curated Collection</h3>
            <p style="opacity: 0.7;">Hand-picked books across 8 genres, all reviewed by real readers.</p>
          </div>
          <div class="panel" style="padding: 2rem; text-align: center;">
            <div style="font-size: 3rem; margin-bottom: 1rem;">💳</div>
            <h3 style="margin: 0 0 0.75rem 0;">Secure Checkout</h3>
            <p style="opacity: 0.7;">Fast order confirmation, RWF pricing, and a smooth checkout flow.</p>
          </div>
          <div class="panel" style="padding: 2rem; text-align: center;">
            <div style="font-size: 3rem; margin-bottom: 1rem;">⭐</div>
            <h3 style="margin: 0 0 0.75rem 0;">Real Reviews</h3>
            <p style="opacity: 0.7;">Read authentic reviews from verified purchasers to guide your choices.</p>
          </div>
          <div class="panel" style="padding: 2rem; text-align: center;">
            <div style="font-size: 3rem; margin-bottom: 1rem;">❤️</div>
            <h3 style="margin: 0 0 0.75rem 0;">Wishlist Saved</h3>
            <p style="opacity: 0.7;">Keep track of books you love and never forget a great read.</p>
          </div>
          <div class="panel" style="padding: 2rem; text-align: center;">
            <div style="font-size: 3rem; margin-bottom: 1rem;">📦</div>
            <h3 style="margin: 0 0 0.75rem 0;">Fast Shipping</h3>
            <p style="opacity: 0.7;">Real-time inventory tracking ensures your order ships immediately.</p>
          </div>
          <div class="panel" style="padding: 2rem; text-align: center;">
            <div style="font-size: 3rem; margin-bottom: 1rem;">🎉</div>
            <h3 style="margin: 0 0 0.75rem 0;">Current Promotions</h3>
            <p style="opacity: 0.7;">Active discounts and deal codes configured by the store team.</p>
          </div>
        </div>
      </section>

      <section class="section" style="padding: 4rem 0;">
        <h2 class="section-title">Browse by Genre</h2>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 2rem;">
          ${state.genres.map(genre => {
            const genreBooks = state.books.filter(b => b.genre === genre);
            const isActive = state.genre === genre;
            return `<button class="panel genre-card ${isActive ? 'is-active' : ''}" style="padding: 2rem; text-align: center; cursor: pointer; transition: transform 0.25s;" data-action="set-genre" data-genre="${escapeHtml(genre)}">
              <h3>${escapeHtml(genre)}</h3>
              <p class="genre-count">${genreBooks.length} books</p>
            </button>`;
          }).join('')}
        </div>
      </section>

      <section class="section" style="padding: 4rem 0; background: var(--bg-soft); border-radius: var(--radius-lg); padding: 3rem;">
        <h2 class="section-title" style="text-align: center;">Ready to Start Reading?</h2>
        <p class="section-copy" style="text-align: center; max-width: 600px; margin: 1rem auto;">
          Join thousands of readers discovering their next favorite book. Sign up today to unlock wishlist, reviews, and personalized recommendations.
        </p>
        <div style="display: flex; gap: 1rem; justify-content: center; margin-top: 2rem;">
          <a class="primary-button" href="#/register">Create Account</a>
          <a class="secondary-button" href="#/">Browse Now</a>
        </div>
      </section>

      ${state.promotions.length ? `
      <section class="section" style="padding: 4rem 0;">
        <h2 class="section-title">Active Promotions</h2>
        <div class="books-grid" style="margin-top: 1.5rem;">
          ${state.promotions.map((promo) => `
            <article class="panel" style="padding: 1.5rem;">
              <div class="hint">${escapeHtml(promo.code)}</div>
              <h3 class="mini-title" style="margin: 0.35rem 0 0.5rem 0;">${escapeHtml(promo.description || 'Special offer')}</h3>
              <p class="section-copy" style="margin: 0 0 0.75rem 0;">${promo.discount_type === 'percentage' ? `${promo.discount_value}% off` : formatMoney(promo.discount_value)} on orders above ${formatMoney(promo.min_order_amount || 0)}.</p>
              <div class="pill">Valid until ${new Date(promo.expires_at).toLocaleDateString()}</div>
            </article>
          `).join('')}
        </div>
      </section>
      ` : ''}

      <!-- Contact moved to site footer -->
    </section>
  `;
}

function renderSearchView() {
  const query = String(state.search || '').trim();
  const resultCount = Number(state.total || state.books.length || 0);
  const booksMarkup = state.homeLoading
    ? renderSkeletonGrid(12)
    : state.books.length
      ? `<div class="books-grid">${state.books.map(renderBookCard).join('')}</div>`
      : `<div class="empty-state"><p>No books match "${escapeHtml(query)}".</p><a class="primary-button" href="#/">Back to home</a></div>`;

  const tabsMarkup = ['All', ...state.genres].map((genre) => `
    <button class="tab ${(!state.genre && genre === 'All') || state.genre === genre ? 'is-active' : ''}" type="button" data-action="set-genre" data-genre="${escapeHtml(genre === 'All' ? '' : genre)}">${escapeHtml(genre)}</button>
  `).join('');

  return `
    <section class="page search-page full-width">
      <div class="search-hero glass">
        <div>
          <div class="pill">Search library</div>
          <h1 class="hero-title">Results for "${escapeHtml(query || 'all books')}"</h1>
          <p class="hero-copy">Showing ${resultCount} matching book(s). Search runs across titles, authors, genres, descriptions, and ISBNs.</p>
        </div>
        <div class="search-summary panel">
          <div class="hint">Query</div>
          <strong>${escapeHtml(query || 'Empty search')}</strong>
          </div>
      </div>

      <section class="section">
        <div class="toolbar">
          <div>
            <h2 class="section-title">Refine results</h2>
            <p class="section-copy">Use genre and sort controls to narrow the current query.</p>
          </div>
          <div class="filter-row">
            <select class="select" data-action="sort-books">
              ${[
                ['featured', 'Featured'],
                ['price_asc', 'Price: Low to High'],
                ['price_desc', 'Price: High to Low'],
                ['rating', 'Top Rated'],
                ['newest', 'Newest'],
                ['title_asc', 'Title A-Z']
              ].map(([value, label]) => `<option value="${value}" ${state.sort === value ? 'selected' : ''}>${label}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="filter-pill-row">${tabsMarkup}</div>
        ${booksMarkup}
        ${state.homeLoading ? '' : renderPaginator(state.page, state.totalPages || 1)}
      </section>
    </section>
  `;
}

function renderBookView() {
  if (state.bookLoading) {
    return `<section class="page">${renderSkeletonGrid(1)}</section>`;
  }

  const book = state.currentBook;
  if (!book) {
    return `<section class="page"><div class="empty-state"><p>Book not found.</p><a class="primary-button" href="#/">Back to catalog</a></div></section>`;
  }

  const purchasedNotice = state.user ? '<div class="hint">Only customers who purchased a title can post a review. The server enforces this rule.</div>' : '<div class="hint">Sign in to add this title to your cart, wishlist, and review queue.</div>';

  const reviewsMarkup = state.currentReviews.length
    ? state.currentReviews.map(renderReviewCard).join('')
    : '<div class="empty-state"><p>No reviews yet. Be the first to leave one.</p></div>';

  const reviewFormMarkup = state.user
    ? `
      <form class="review-form panel" data-form="review" data-book-id="${escapeHtml(book.id)}">
        <h3 class="mini-title">Write a review</h3>
        <input type="hidden" name="rating" value="5" />
        <div class="star-input" data-star-input>
          ${Array.from({ length: 5 }, (_, index) => `<button type="button" data-action="set-star" data-star="${index + 1}" class="is-active">★</button>`).join('')}
        </div>
        <textarea class="textarea" name="body" rows="5" placeholder="Share what stood out, how it read, and who you would recommend it to."></textarea>
        <button class="primary-button" type="submit">Post review</button>
      </form>
    `
    : '<div class="panel"><a class="primary-button" href="#/login">Sign in to review</a></div>';

  return `
    <section class="page book-detail">
      <div class="detail-grid">
        <div class="panel">
          <div class="detail-cover" style="background: linear-gradient(145deg, ${escapeHtml(book.cover_color || '#1f2937')}, rgba(15, 23, 42, 0.9));">
            ${book.cover_url ? `<img src="${escapeHtml(book.cover_url)}" alt="${escapeHtml(book.title)}" style="width:100%;height:100%;object-fit:cover;border-radius:22px;" />` : `<span class="cover-emoji">${escapeHtml(book.emoji || '📚')}</span>`}
          </div>
        </div>

        <div class="panel detail-book">
          <div class="detail-header">
            <div class="pill">${escapeHtml(book.genre || 'Book')}</div>
            <h1 class="detail-title">${escapeHtml(book.title)}</h1>
            <div class="detail-subtitle">${escapeHtml(book.author)}</div>
            <div class="detail-price">
              <strong>${formatMoney(book.price)}</strong>
              ${book.original_price ? `<span class="price-old">${formatMoney(book.original_price)}</span>` : ''}
            </div>
          </div>

          <div class="detail-meta">
            <span class="hint">${renderStars(book.avg_rating)} ${Number(book.review_count)} reviews</span>
            <span class="hint">${book.stock} in stock</span>
            <span class="hint">${book.pages || '—'} pages · ${book.year || '—'}</span>
          </div>

          <p class="hero-copy">${escapeHtml(book.description || '')}</p>

          <div class="detail-actions">
            <button class="primary-button" type="button" data-action="add-to-cart" data-book-id="${escapeHtml(book.id)}">Add to cart</button>
            <button class="success-button" type="button" data-action="order-now" data-book-id="${escapeHtml(book.id)}">Order now</button>
            <button class="secondary-button" type="button" data-action="toggle-wishlist" data-book-id="${escapeHtml(book.id)}">Wishlist</button>
          </div>

          <div class="rating-summary panel">
            <h3 class="mini-title">Rating breakdown</h3>
            <div class="chart">${renderRatingDistribution(state.currentReviews)}</div>
          </div>

          ${purchasedNotice}
        </div>
      </div>

      <section class="section">
        <h2 class="section-title">Reviews</h2>
        <div class="orders-grid">
          <div class="panel">${reviewsMarkup}</div>
          ${reviewFormMarkup}
        </div>
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
          <div class="hint">Cart</div>
          <h1 class="section-title">Review your items</h1>
        </div>
        ${content}
      </div>

      <form class="checkout-form panel popup-shell" data-form="checkout">
        <div class="order-head">
          <div class="hint">Checkout</div>
          <h2 class="mini-title">Shipping address</h2>
        </div>
        <input class="text-input" name="line1" placeholder="Street address" required />
        <div class="checkout-row">
          <input class="text-input" name="city" placeholder="City" required />
          <input class="text-input" name="country" placeholder="Country" required />
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
        <div class="hint">Wishlist</div>
        <h1 class="section-title">Books you want to come back to</h1>
      </div>
      ${content}
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
        <div class="hint">Orders</div>
        <h1 class="section-title">Purchase history</h1>
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

function renderAuthView(mode) {
  const isLogin = mode === 'login';
  return `
    <div class="auth-modal" role="dialog" aria-modal="true">
      <div class="auth-modal-backdrop" data-action="close-auth"></div>
      <div class="auth-modal-panel popup-shell auth-large">
        <button class="icon-button" type="button" data-action="close-auth" aria-label="Close">✕</button>
        <div class="auth-grid auth-large">
          <div class="auth-branding auth-large">
              <div class="auth-brand-row">
                <img src="assets/WhatsApp%20Image%202026-05-07%20at%2014.35.19.jpeg" alt="Booksta Online BookStore" style="height:56px;width:auto;border-radius:6px;margin-right:0.75rem" />
                <div>
                  <strong class="auth-brand-name">Booksta Online BookStore</strong>
                  <div class="hint">bookstore</div>
                </div>
              </div>
              <h2 class="section-title">${isLogin ? 'Welcome back' : 'Create your account'}</h2>
              <p class="section-copy">A curated bookstore delivering carefully selected titles across genres. Contact us for support, partnerships, and promotions.</p>
              <div class="auth-brand-note">
                <div class="auth-brand-copy">Curated books · Fast checkout · Great selection</div>
              </div>
          </div>

          <div class="auth-form-panel auth-large">
            <div class="auth-header">
              <div class="hint">${isLogin ? 'Welcome back' : 'Join Booksta Online BookStore'}</div>
              <h2 class="section-title">${isLogin ? 'Sign in to pick up where you left off' : 'Create your account and start building a shelf'}</h2>
              <p class="section-copy">${isLogin ? 'Use your email and password to unlock cart, wishlist, reviews, and orders.' : 'Create a profile to save books, place orders, and write reviews after purchase.'}</p>
            </div>

            

            <form class="auth-form" data-form="${isLogin ? 'login' : 'register'}">
              <input class="text-input" name="name" placeholder="Full name" ${isLogin ? 'style="display:none;"' : 'required'} />
              <input class="text-input" name="email" type="email" placeholder="Email address" required />
              <input class="text-input" name="password" type="password" placeholder="Password" required minlength="8" />
              <div style="display:flex;gap:0.5rem;margin-top:1rem;align-items:center;">
                <button class="primary-button" type="submit">${isLogin ? 'Sign in' : 'Create account'}</button>
                <button class="ghost-button" type="button" data-action="close-auth">Cancel</button>
              </div>
              <p class="helper-text" style="margin-top:0.75rem; color:inherit;">${isLogin ? 'Need an account?' : 'Already have an account?'} <a href="#/${isLogin ? 'register' : 'login'}">${isLogin ? 'Register' : 'Login'}</a></p>
              <div style="margin-top:0.75rem; display:flex; gap:0.6rem; align-items:center;">
                <button class="ghost-button" type="button">G</button>
                <button class="ghost-button" type="button">f</button>
                <button class="ghost-button" type="button"></button>
              </div>
            </form>
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
  if (!state.token) {
    renderChrome();
    return;
  }

  try {
    const data = await api('/api/auth/me');
    state.user = data.user;
    renderChrome();
  } catch (error) {
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
  const now = Date.now();
  if (state._lastHomeLoadAt && now - state._lastHomeLoadAt < 800) {
    // too soon since last load
    state.homeLoading = false;
    state._homeLoadInProgress = false;
    return;
  }
  state._lastHomeLoadAt = now;
  try {
    renderApp();
  } catch (error) {
    state.homeLoading = false;
    app.innerHTML = `<section class="page"><div class="empty-state"><p>${escapeHtml(error.message)}</p></div></section>`;
    return;
  }

  try {
    const params = new URLSearchParams();
    if (state.search) params.set('search', state.search);
    if (state.genre) params.set('genre', state.genre);
    if (state.sort) params.set('sort', state.sort);
    params.set('page', String(state.page));
    params.set('limit', String(state.limit));

    const [books, featured, genres] = await Promise.all([
      api(`/api/books?${params.toString()}`),
      api('/api/books/featured'),
      api('/api/books/genres')
    ]);

    state.books = books.books || [];
    state.total = books.total || state.books.length;
    state.totalPages = books.totalPages || 1;
    state.featured = featured.books || [];
    state.genres = genres.genres || genreSeed;
    state.homeLoading = false;
    state._homeLoadInProgress = false;
    renderApp();
  } catch (error) {
    state.homeLoading = false;
    state._homeLoadInProgress = false;
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
    renderApp();
  } catch (error) {
    state.bookLoading = false;
    app.innerHTML = `<section class="page"><div class="empty-state"><p>${escapeHtml(error.message)}</p><a class="primary-button" href="#/">Back to catalog</a></div></section>`;
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
}

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

function renderApp() {
  try {
    state.route = getRoute();
    const { name } = state.route;

    if (name === 'home') {
      app.innerHTML = renderHomeView();
      return;
    }

    if (name === 'search') {
      app.innerHTML = renderSearchView();
      return;
    }

    if (name === 'book') {
      app.innerHTML = renderBookView();
      return;
    }

    if (name === 'cart') {
      app.innerHTML = renderCartView();
      return;
    }

    if (name === 'wishlist') {
      app.innerHTML = renderWishlistView();
      return;
    }

    if (name === 'orders') {
      app.innerHTML = renderOrdersView();
      return;
    }

    if (name === 'profile') {
      app.innerHTML = renderProfileView();
      return;
    }

    if (name === 'login' || name === 'register') {
      // Render the home background and show auth modal on top
      app.innerHTML = renderHomeView();
      app.innerHTML += renderAuthModal(name === 'login' ? 'login' : 'register');
      return;
    }

    app.innerHTML = '<section class="page"><div class="empty-state"><p>Page not found.</p><a class="primary-button" href="#/">Return home</a></div></section>';
  } catch (error) {
    console.error(error);
    app.innerHTML = `<section class="page"><div class="empty-state"><p>${escapeHtml(error?.message || String(error))}</p></div></section>`;
  }
}

async function loadRoute() {
  state.route = getRoute();
  renderChrome();

  if (state.route.name === 'home') {
    state.search = '';
    state.page = 1;
    await loadHomeData();
    return;
  }

  if (state.route.name === 'search') {
    state.search = state.route.params?.q || state.search || '';
    state.page = 1;
    await loadHomeData();
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

  renderApp();
}

function startHeroCycle() {
  if (state.heroTimer) {
    window.clearInterval(state.heroTimer);
  }

  state.heroTimer = window.setInterval(() => {
    state.typewriterIndex = (state.typewriterIndex + 1) % genreSeed.length;
    const typewriter = document.querySelector('.typewriter');
    if (typewriter) {
      typewriter.textContent = genreSeed[state.typewriterIndex];
    }
  }, 2200);
}

function handleAction(target) {
  const action = target.dataset.action;

  if (action === 'toggle-mobile-menu') {
    const panel = document.getElementById('mobile-menu');
    if (!panel) return;
    const isOpen = panel.classList.toggle('is-open');
    panel.setAttribute('aria-hidden', String(!isOpen));
    target.setAttribute('aria-expanded', String(!!isOpen));
    closeAccountMenu();
    return;
  }

  if (action === 'close-mobile-menu') {
    closeMobileMenu();
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
    // Close auth modal by going home
    window.location.hash = '#/';
    // Re-render route
    try { loadRoute(); } catch (e) { renderApp(); }
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

  if (action === 'remove-from-cart') {
    removeFromCart(target.dataset.bookId);
    return;
  }

  if (action === 'toggle-wishlist') {
    toggleWishlist(target.dataset.bookId);
    return;
  }

  if (action === 'quantity-change') {
    changeQuantity(target.dataset.bookId, Number(target.dataset.delta || 0));
    return;
  }

  if (action === 'set-page') {
    state.page = Number(target.dataset.page || 1);
    loadRoute();
    return;
  }

  if (action === 'set-genre') {
    state.genre = target.dataset.genre || '';
    state.page = 1;
    loadRoute();
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
}

function closeMobileMenu() {
  const panel = document.getElementById('mobile-menu');
  if (!panel) return;
  panel.classList.remove('is-open');
  panel.setAttribute('aria-hidden', 'true');
  const toggle = document.querySelector('[data-action="toggle-mobile-menu"]');
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
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
    if (isActiveRoute('wishlist')) {
      await loadWishlistData();
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleSubmit(form) {
  const formType = form.dataset.form;

  if (formType === 'login') {
    const values = Object.fromEntries(new FormData(form).entries());
    try {
      const response = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(values)
      });
      saveSession(response.token, response.user);
      showToast('Signed in successfully');
      await refreshCart();
      await refreshWishlist();
      await refreshOrders();
      // Auto-redirect admin users to admin dashboard
      if (response.user && response.user.role === 'admin') {
        window.location.href = '/admin.html';
      } else {
        window.location.hash = '#/';
        await loadRoute();
      }
    } catch (error) {
      showToast(error.message, 'error');
    }
    return;
  }

  if (formType === 'register') {
    const values = Object.fromEntries(new FormData(form).entries());
    try {
      const response = await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(values)
      });
      saveSession(response.token, response.user);
      showToast('Account created');
      await refreshCart();
      await refreshWishlist();
      await refreshOrders();
      window.location.hash = '#/';
      await loadRoute();
    } catch (error) {
      showToast(error.message, 'error');
    }
    return;
  }

  if (formType === 'profile') {
    const values = Object.fromEntries(new FormData(form).entries());
    try {
      const response = await api('/api/auth/me', {
        method: 'PATCH',
        body: JSON.stringify(values)
      });
      state.user = response.user;
      renderChrome();
      showToast('Profile updated');
    } catch (error) {
      showToast(error.message, 'error');
    }
    return;
  }

  if (formType === 'password') {
    const values = Object.fromEntries(new FormData(form).entries());
    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify(values)
      });
      form.reset();
      showToast('Password updated');
    } catch (error) {
      showToast(error.message, 'error');
    }
    return;
  }

  if (formType === 'checkout') {
    const values = Object.fromEntries(new FormData(form).entries());
    try {
      const whatsappNumber = String(state.settings?.whatsappNumber || '250782781575').replace(/[^\d+]/g, '');
      const pricing = getOrderPricing();
      const orderLines = state.cart.map((item) => `- ${item.book.title} x ${item.quantity} (${formatMoney(item.subtotal)})`).join('\n');
      const message = [
        'Hello, I would like to place an order from Booksta Online BookStore.',
        '',
        `Name: ${state.user?.name || ''}`,
        `Email: ${state.user?.email || ''}`,
        `Address: ${values.line1}, ${values.city}, ${values.country}`,
        `Order WhatsApp: ${whatsappNumber}`,
        pricing.promotion ? `Promotion: ${pricing.promotion.code} (-${formatMoney(pricing.discount)})` : 'Promotion: None',
        '',
        'Order details:',
        orderLines,
        '',
        `Subtotal: ${formatMoney(pricing.subtotal)}`,
        `Total after discount: ${formatMoney(pricing.total)}`,
        '',
        'Please confirm payment instructions.'
      ].join('\n');
      const targetNumber = whatsappNumber || '250782781575';
      openWhatsAppOrder(targetNumber, message);
      showToast('Opening WhatsApp to confirm your order');
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
  const target = event.target.closest('[data-action]');
  if (!target) return;
  handleAction(target);
});

// Close menus when tapping outside them
document.addEventListener('click', (event) => {
  const target = event.target;
  if (target.closest('.mobile-menu') || target.closest('.account-menu') || target.closest('[data-action="toggle-mobile-menu"]') || target.closest('[data-action="toggle-account-menu"]')) {
    return;
  }
  closeMobileMenu();
  closeAccountMenu();
});

app.addEventListener('submit', async (event) => {
  const form = event.target.closest('form[data-form]');
  if (!form) {
    return;
  }
  event.preventDefault();
  await handleSubmit(form);
});

app.addEventListener('input', (event) => {
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

headerSearchInput?.addEventListener('input', (event) => {
  state.search = event.target.value;
  state.page = 1;
  window.clearTimeout(state.searchTimer);
  state.searchTimer = window.setTimeout(() => {
    if (!isActiveRoute('search')) {
      window.location.hash = '#/search?q=' + encodeURIComponent(state.search || '');
      return;
    }
    loadRoute();
  }, 260);
});

document.getElementById('header-search-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  state.search = (headerSearchInput?.value || '').trim();
  state.page = 1;
  window.location.hash = '#/search?q=' + encodeURIComponent(state.search || '');
  loadRoute();
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
  el.style.touchAction = 'none';
  // restore position
  try {
    const pos = JSON.parse(localStorage.getItem('mobileHamburgerPos') || 'null');
    if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
      // clamp to viewport so button stays clickable
      const x = Math.max(8, Math.min(window.innerWidth - el.offsetWidth - 8, pos.x));
      const y = Math.max(8, Math.min(window.innerHeight - el.offsetHeight - 8, pos.y));
      el.style.right = 'auto';
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.style.bottom = 'auto';
      el.style.position = 'fixed';
    }
  } catch (e) {}

  let dragging = false;
  let startX = 0, startY = 0, origLeft = 0, origTop = 0;

  function onPointerDown(ev) {
    dragging = true;
    el.setPointerCapture?.(ev.pointerId);
    startX = ev.clientX;
    startY = ev.clientY;
    origLeft = el.getBoundingClientRect().left;
    origTop = el.getBoundingClientRect().top;
    el.style.transition = 'none';
  }

  function onPointerMove(ev) {
    if (!dragging) return;
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    const x = Math.max(8, Math.min(window.innerWidth - el.offsetWidth - 8, origLeft + dx));
    const y = Math.max(8, Math.min(window.innerHeight - el.offsetHeight - 8, origTop + dy));
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
  }

  function onPointerUp(ev) {
    if (!dragging) return;
    dragging = false;
    el.releasePointerCapture?.(ev.pointerId);
    el.style.transition = '';
    // save
    const rect = el.getBoundingClientRect();
    localStorage.setItem('mobileHamburgerPos', JSON.stringify({ x: rect.left, y: rect.top }));
  }

  el.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);

  // wire the data-action handler too (delegated handler uses data-action)
  // Ensure a simple click toggles the menu reliably (avoid interference from drag)
  el.addEventListener('click', (e) => {
    const panel = document.getElementById('mobile-menu');
    if (!panel) return;
    const isOpen = !panel.classList.contains('is-open');
    panel.classList.toggle('is-open', isOpen);
    panel.setAttribute('aria-hidden', String(!isOpen));
    el.setAttribute('aria-expanded', String(isOpen));
  });
}

// wire mobile search toggle action via delegated handler
document.addEventListener('click', (event) => {
  const t = event.target.closest('[data-action="open-mobile-search"]');
  if (t) {
    openMobileSearch();
  }
  const c = event.target.closest('[data-action="close-mobile-search"]');
  if (c) {
    closeMobileSearch();
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
  state.sort = select.value;
  state.page = 1;
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
});

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
  window.__bookstaStage = 'init:setTheme';
  renderChrome();
  window.__bookstaStage = 'init:renderChrome';
  await refreshSession();
  window.__bookstaStage = 'init:refreshSession';
  await refreshCart();
  window.__bookstaStage = 'init:refreshCart';
  await loadSiteSettings();
  window.__bookstaStage = 'init:loadSiteSettings';
  await loadPromotionsData();
  window.__bookstaStage = 'init:loadPromotionsData';
  startHeroCycle();
  window.__bookstaStage = 'init:startHeroCycle';
  await loadRoute();
  window.__bookstaStage = 'init:loadRoute';
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

async function orderNow(bookId) {
  if (!state.user) {
    showToast('Sign in to place an order.', 'error');
    window.location.hash = '#/login';
    return;
  }

  const added = await addToCart(bookId, 1);
  if (!added) return;
  setDrawerOpen(false);
  window.location.hash = '#/cart';
  await loadRoute();
  showToast('Added to cart. Complete your order below.');
}
