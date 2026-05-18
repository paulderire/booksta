/**
 * Smooth Scroll Animations
 * - Scroll progress bar
 * - Fade-in animations for elements
 * - Parallax effects for hero sections
 * - Smooth scroll-triggered animations
 */

class ScrollAnimations {
  constructor() {
    this.progressBar = null;
    this.observer = null;
    this.init();
  }

  init() {
    this.createProgressBar();
    this.setupScrollProgress();
    this.setupIntersectionObserver();
    this.addScrollListeners();
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
    window.addEventListener('scroll', () => {
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrolled = (window.scrollY / scrollHeight) * 100;
      if (this.progressBar) {
        this.progressBar.style.width = scrolled + '%';
      }
    }, { passive: true });
  }

  /**
   * Setup Intersection Observer for scroll-triggered animations
   */
  setupIntersectionObserver() {
    const observerOptions = {
      threshold: [0, 0.1, 0.5],
      rootMargin: '0px 0px -50px 0px'
    };

    this.observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          // Add animation classes
          entry.target.classList.add('scroll-fade-in');
          
          // Add stagger animation to children if applicable
          if (entry.target.classList.contains('scroll-stagger-grid')) {
            this.addStaggerAnimation(entry.target);
          }

          // Add parallax effect
          if (entry.target.classList.contains('parallax')) {
            this.setupParallax(entry.target);
          }

          // Stop observing once animated
          this.observer.unobserve(entry.target);
        }
      });
    }, observerOptions);

    // Observe all elements with scroll animation classes
    this.observeElements();
  }

  /**
   * Observe elements that need scroll animations
   */
  observeElements() {
    const selectors = [
      '.scroll-fade-in-trigger',
      '.book-card:not(.hero-feature-grid .book-card)',
      '.glass-card',
      '.section > .glass-card',
      '.contact-card',
      '.product-card',
      '.review-card',
      '.order-item',
      '.hero',
      '.scroll-stagger-grid',
      '.parallax'
    ];

    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => {
        if (!el.classList.contains('scroll-fade-in')) {
          this.observer.observe(el);
        }
      });
    });
  }

  /**
   * Add stagger animation to grid children
   */
  addStaggerAnimation(container) {
    const children = container.querySelectorAll('> *');
    children.forEach((child, index) => {
      child.style.animation = `scroll-stagger 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both`;
      child.style.animationDelay = `${index * 60}ms`;
    });
  }

  /**
   * Setup parallax effect on scroll
   */
  setupParallax(element) {
    const handleParallax = () => {
      const rect = element.getBoundingClientRect();
      const scrollPosition = window.scrollY;
      const elementTop = rect.top + scrollPosition;
      const offset = (scrollPosition - elementTop) * 0.5;
      
      if (Math.abs(offset) < 200) { // Only apply within reasonable range
        element.style.transform = `translateY(${offset}px)`;
      }
    };

    window.addEventListener('scroll', handleParallax, { passive: true });
  }

  /**
   * Smooth scroll to element
   */
  scrollToElement(selector, offset = 100) {
    const element = document.querySelector(selector);
    if (element) {
      const offsetTop = element.offsetTop - offset;
      window.scrollTo({
        top: offsetTop,
        behavior: 'smooth'
      });
    }
  }

  /**
   * Add scroll event listeners for additional effects
   */
  addScrollListeners() {
    let ticking = false;

    window.addEventListener('scroll', () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          this.updateScrollState();
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  /**
   * Update scroll state and trigger effects
   */
  updateScrollState() {
    const scrollTop = window.scrollY;
    
    // Hide header on scroll down, show on scroll up
    const header = document.querySelector('.topbar');
    if (header) {
      if (this.lastScrollTop > scrollTop) {
        header.classList.remove('header-hidden');
      } else if (scrollTop > 100) {
        header.classList.add('header-hidden');
      }
      this.lastScrollTop = scrollTop;
    }

    // Blur background elements as user scrolls
    const bgOrbs = document.querySelectorAll('.bg-orb');
    bgOrbs.forEach((orb) => {
      const distance = Math.abs(scrollTop - window.innerHeight / 2) / 100;
      orb.style.opacity = Math.max(0.1, 0.35 - distance * 0.1);
    });
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

// Reinitialize when app.js updates content
window.addEventListener('hashchange', () => {
  if (window.scrollAnimations) {
    setTimeout(() => {
      window.scrollAnimations.observeElements();
    }, 100);
  }
});
