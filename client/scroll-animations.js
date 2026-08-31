/**
 * Smooth Scroll Animations — v2
 * - Scroll progress bar
 * - Scroll-triggered section/card reveals using IntersectionObserver
 * - Uses .scroll-hidden (initial) → .scroll-visible (on intersect) pattern
 * - Covers ALL dynamic element types across the app
 */

class ScrollAnimations {
  constructor() {
    this.progressBar = null;
    this.observer = null;
    this.observed = new WeakSet();
    this.init();
  }

  /**
   * All selectors that should receive scroll-triggered animations.
   * Covers every dynamic element type rendered across all routes.
   */
  static get ANIMATE_SELECTORS() {
    return [
      '.section',
      '.book-card',
      '.wishlist-card',
      '.order-card',
      '.review-card',
      '.glass-card',
      '.panel',
      '.contact-card',
      '.mini-book',
      '.compact-book-card',
      '.detail-grid',
      '.empty-state',
      '.order-head',
      '.profile-shell',
      '.profile-summary',
      '.profile-forms',
      '.profile-form',
      '.deals-promo-layout',
      '.kids-promo-layout',
      '.newsletter-container',
      '.promo-banner-content',
      '.featured-author-grid',
      '.featured-authors-row',
      '.author-card',
      '.genre-card',
      '.drawer-item',
      '.hero-panel',
      '.homepage-stats-row',
      '.books-grid',
      '.wishlist-grid',
      '.orders-grid',
      '.admin-orders-grid',
      '.notification-page',
      '.cart-items',
      '.cart-summary',
      '.track-timeline',
      '.scroll-fade-in-trigger'
    ];
  }

  init() {
    this.createProgressBar();
    this.setupScrollProgress();
    this.setupIntersectionObserver();
    this.observeAll();

    // Clean up any stale scroll-top-btn or app-scroll-btn elements
    document.querySelectorAll('.scroll-top-btn, #app-scroll-btn').forEach(el => el.remove());
  }

  /**
   * Create and inject the scroll progress bar
   */
  createProgressBar() {
    const bar = document.createElement('div');
    bar.className = 'scroll-progress-bar';
    bar.setAttribute('aria-label', 'Page scroll progress');
    document.body.prepend(bar);
    this.progressBar = bar;
  }

  /**
   * Update progress bar width based on scroll position
   */
  setupScrollProgress() {
    const updateProgress = () => {
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrolled = (window.scrollY / scrollHeight) * 100;
      if (this.progressBar) {
        this.progressBar.style.width = Math.min(scrolled, 100) + '%';
      }
      
      const header = document.querySelector('.topbar');
      if (header) {
        if (window.scrollY > 20) {
          header.classList.add('is-scrolled');
        } else {
          header.classList.remove('is-scrolled');
        }
      }
    };
    
    window.addEventListener('scroll', updateProgress, { passive: true });
    updateProgress(); // Initial call
  }

  /**
   * Setup Intersection Observer for scroll-triggered animations
   */
  setupIntersectionObserver() {
    const observerOptions = {
      threshold: [0, 0.1, 0.15],
      rootMargin: '50px 0px -30px 0px'
    };

    this.observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && entry.target.classList.contains('scroll-hidden')) {
          entry.target.classList.remove('scroll-hidden');
          entry.target.classList.add('scroll-visible');

          // Stagger children inside grid/list containers
          this._staggerChildren(entry.target);

          // Stop observing once revealed
          this.observer.unobserve(entry.target);
        }
      });
    }, observerOptions);
  }

  /**
   * Stagger animation delays for direct children of grid containers
   */
  _staggerChildren(container) {
    const gridSelectors = [
      '.books-grid', '.wishlist-grid', '.orders-grid',
      '.admin-orders-grid', '.featured-authors-row',
      '.recommendation-rail', '.deals-books-row', '.kids-books-row',
      '.hero-feature-grid', '.skeleton-grid', '.promotions-grid'
    ];

    // If this element IS a grid container, stagger its children
    const isGrid = gridSelectors.some(sel => container.matches(sel));
    if (isGrid) {
      const children = container.children;
      for (let i = 0; i < children.length; i++) {
        children[i].style.animationDelay = `${i * 60}ms`;
      }
      return;
    }

    // If it contains a grid, stagger that grid's children
    for (const sel of gridSelectors) {
      const grid = container.querySelector(sel);
      if (grid) {
        const children = grid.children;
        for (let i = 0; i < children.length; i++) {
          children[i].style.animationDelay = `${i * 60}ms`;
        }
      }
    }
  }

  /**
   * Observe all matching elements currently in the DOM.
   * Safe to call multiple times — already-observed elements are skipped.
   */
  observeAll() {
    if (!this.observer) return;

    const selector = ScrollAnimations.ANIMATE_SELECTORS.join(', ');
    document.querySelectorAll(selector).forEach((el) => {
      // Skip if already processed
      if (this.observed.has(el)) return;
      // Skip if already visible (e.g. hero which has opacity:1 !important)
      if (el.classList.contains('scroll-visible')) return;
      // Skip the hero itself — it should always be visible
      if (el.classList.contains('hero')) return;

      // Mark as hidden (initial state)
      if (!el.classList.contains('scroll-hidden') && !el.classList.contains('scroll-visible')) {
        el.classList.add('scroll-hidden');
      }

      this.observed.add(el);
      this.observer.observe(el);
    });

    // Handle elements already in the viewport on first paint
    // (e.g. above-the-fold content). Use a tiny delay so the
    // browser can compute layout first.
    requestAnimationFrame(() => {
      document.querySelectorAll('.scroll-hidden').forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.top < window.innerHeight + 50 && rect.bottom > 0) {
          el.classList.remove('scroll-hidden');
          el.classList.add('scroll-visible');
          this._staggerChildren(el);
          this.observer.unobserve(el);
        }
      });
    });
  }

  /**
   * Re-observe after a route change / dynamic render.
   * Called from app.js renderApp().
   */
  reObserveSections() {
    this.observeAll();
  }

  /**
   * Destroy the scroll animations
   */
  destroy() {
    if (this.observer) {
      this.observer.disconnect();
    }
    if (this.progressBar && this.progressBar.parentNode) {
      this.progressBar.parentNode.removeChild(this.progressBar);
    }
  }
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.scrollAnimations = new ScrollAnimations();
  });
} else {
  window.scrollAnimations = new ScrollAnimations();
}

// Re-initialize on page navigation
window.addEventListener('hashchange', () => {
  if (window.scrollAnimations) {
    // Re-observe elements for new page
    setTimeout(() => {
      window.scrollAnimations.observed = new WeakSet();
      window.scrollAnimations.observeAll();
      // Scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
  }
});
