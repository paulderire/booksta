# Smooth Scroll Animations Guide

Your Booksta app now features beautiful, smooth scrolling animations! Here's what's been added:

## ✨ Features

### 1. **Scroll Progress Bar**
- A gradient progress bar at the top of the page that fills as users scroll down
- Provides visual feedback for reading progress
- Automatically generated and styled with your accent colors

### 2. **Scroll-Triggered Fade-In Animations**
- Cards and elements fade in smoothly as they enter the viewport
- Includes a subtle blur effect for a polished look
- Automatically triggered for these elements:
  - `.book-card` - Book cards in search results
  - `.glass-card` - Glass morphism cards
  - `.contact-card` - Contact information cards
  - `.review-card` - User reviews
  - `.order-item` - Order items in orders page
  - `.section` - Content sections
  - `.parallax` - Parallax effect elements

### 3. **Stagger Grid Animations**
Apply to grid containers to stagger child element animations:
```html
<div class="scroll-stagger-grid">
  <div class="book-card">...</div>
  <div class="book-card">...</div>
  <div class="book-card">...</div>
</div>
```

### 4. **Parallax Effects**
Add a subtle parallax effect to hero sections:
```html
<div class="hero parallax">
  <!-- Content here will move slightly on scroll -->
</div>
```

### 5. **Smooth Header Hide on Scroll**
The header automatically hides when scrolling down and reappears when scrolling up (great for mobile!)

### 6. **Respects User Preferences**
- Automatically detects `prefers-reduced-motion` setting
- Disables animations for users who prefer reduced motion
- Ensures accessibility for all users

## 🎯 How to Use

### Automatic (No Changes Needed)
These elements automatically get smooth scroll animations:
- All `.book-card` elements
- All `.glass-card` elements
- All `.contact-card` elements
- All `.review-card` elements
- All `.order-item` elements

### Manual Application
Add the `scroll-fade-in-trigger` class to any element you want animated on scroll:

```html
<div class="my-custom-element scroll-fade-in-trigger">
  This will fade in when scrolled into view!
</div>
```

### Stagger Animation Example
```html
<div class="scroll-stagger-grid">
  <div class="item">Item 1</div>
  <div class="item">Item 2</div>
  <div class="item">Item 3</div>
</div>
```

### Parallax Effect Example
```html
<section class="hero parallax">
  <h1>My Hero Section</h1>
  <p>This background will move slower as you scroll</p>
</section>
```

## 🔧 JavaScript API

The `ScrollAnimations` class is available globally as `window.scrollAnimations`:

```javascript
// Scroll smoothly to an element
window.scrollAnimations.scrollToElement('.my-element');

// Scroll to element with custom offset
window.scrollAnimations.scrollToElement('.my-element', 150);

// Observe new elements for scroll animations (after adding new DOM)
window.scrollAnimations.observeElements();
```

## 🎨 Customization

### Adjust Animation Speed
Edit the animation durations in `style.css`:
```css
.scroll-fade-in {
  animation: scroll-fade-in 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  /* Change 0.7s to make it faster or slower */
}
```

### Change Animation Easing
The animations use a spring-like easing curve. To make them more linear:
```css
animation: scroll-fade-in 0.7s ease-out both;
```

### Adjust Progress Bar Color
The progress bar uses your CSS variables:
```css
.scroll-progress-bar {
  background: linear-gradient(90deg, var(--accent), var(--accent-2));
  /* Already uses your app's accent colors */
}
```

### Adjust Parallax Intensity
Edit the parallax offset in `scroll-animations.js`:
```javascript
const offset = (scrollPosition - elementTop) * 0.5; // Change 0.5 for more/less effect
```

## 📱 Mobile Optimization

All animations are optimized for mobile:
- Uses `passive: true` event listeners for better performance
- Respects reduced motion preferences
- Header auto-hides on mobile scroll
- Smooth scrolling behavior maintained across all devices

## 🚀 Performance

- Uses `requestAnimationFrame` for smooth 60fps animations
- Implements `Intersection Observer` for efficient scroll detection
- Throttles scroll events to prevent jank
- Only observes elements in viewport range

## 🎬 Animation Classes Reference

| Class | Effect |
|-------|--------|
| `.scroll-fade-in-trigger` | Manual fade-in trigger |
| `.scroll-stagger-grid` | Grid with staggered children |
| `.parallax` | Parallax scroll effect |
| `.header-hidden` | (Auto) Header hidden on scroll |

## 📚 Files Modified

1. **client/style.css** - Added 150+ lines of animation CSS
2. **client/scroll-animations.js** - New 200+ line animation controller
3. **client/index.html** - Added script reference

## 💡 Tips

1. **Hero sections** - Add `.parallax` class for subtle depth effect
2. **Product cards** - Already animated! No changes needed
3. **Custom elements** - Add `.scroll-fade-in-trigger` to auto-animate
4. **Performance** - Use intersection observer detection (built-in)
5. **Testing** - Check with DevTools reduced motion preference toggle

Enjoy your smooth, beautiful scrolling experience! 🎉
