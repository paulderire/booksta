/**
 * Smooth Scroll Animations - Simplified Version
 * - Scroll progress bar
 * - Scroll-triggered section reveals
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
    };
    
    window.addEventListener('scroll', updateProgress, { passive: true });
    updateProgress(); // Initial call
  }

  /**
   * Setup Intersection Observer for scroll-triggered animations
   */
  setupIntersectionObserver() {
    const observerOptions = {
      threshold: [0, 0.1, 0.25, 0.5],
      rootMargin: '100px 0px -100px 0px'
    };

    this.observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          // Add animate class to trigger animation
          entry.target.classList.add('animate');
          // Don't unobserve - keep observing for consistency
        }
      });
    }, observerOptions);

    // Observe all section elements for scroll animation
    document.querySelectorAll('.section').forEach((section) => {
      section.classList.add('scroll-fade-in');
      this.observer.observe(section);
    });

    // Also observe other scroll-trigger elements
    document.querySelectorAll('.scroll-fade-in-trigger, .book-card').forEach((el) => {
      el.classList.add('scroll-fade-in');
      this.observer.observe(el);
    });
  }

  /**
   * Re-observe sections (call this after page renders)
   */
  reObserveSections() {
    // Observe all section elements for scroll animation
    document.querySelectorAll('.section').forEach((section) => {
      try {
        if (!section.classList.contains('scroll-fade-in')) {
          section.classList.add('scroll-fade-in');
        }
        this.observer.observe(section);
      } catch (e) {
        // Already observing
      }
    });

    // Also observe other scroll-trigger elements
    document.querySelectorAll('.scroll-fade-in-trigger, .book-card').forEach((el) => {
      try {
        if (!el.classList.contains('scroll-fade-in')) {
          el.classList.add('scroll-fade-in');
        }
        this.observer.observe(el);
      } catch (e) {
        // Already observing
      }
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

// Re-initialize on page navigation
window.addEventListener('hashchange', () => {
  if (window.scrollAnimations) {
    // Re-observe elements for new page
    setTimeout(() => {
      window.scrollAnimations.observer.disconnect();
      window.scrollAnimations.setupIntersectionObserver();
      // Scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
  }
});
