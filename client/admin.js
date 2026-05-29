(function(){
  const api = (path, opts={}) => {
    const token = localStorage.getItem('bookstaToken');
    const headers = opts.headers || {};
    if (token) headers['Authorization'] = 'Bearer ' + token;
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    const normalizedPath = path.startsWith('/api/') ? path.slice(4) : path;

    const timeout = typeof opts.timeout === 'number' ? opts.timeout : 10000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    return fetch('/api' + normalizedPath, { ...opts, headers, signal: controller.signal })
      .then(async (r) => {
        clearTimeout(timeoutId);
        const txt = await r.text();
        try { return JSON.parse(txt); } catch(e){ return txt; }
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') throw new Error('Request timed out');
        throw err;
      });
  };

  function $id(id){return document.getElementById(id)}
  function escapeHtml(s){ if(!s) return ''; return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function formatRWF(amount){
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'RWF', currencyDisplay: 'code', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount||0);
  }

  function formatNumber(value) {
    return new Intl.NumberFormat('en-US').format(Number(value || 0));
  }

  function stockBadgeClass(stock) {
    if (Number(stock) <= 5) return 'status-low';
    if (Number(stock) <= 15) return 'status-watch';
    return 'status-healthy';
  }

  const adminViewStorageKey = 'bookstaAdminView';

  function showAdminView(view) {
    const nextView = view || 'dashboard';
    document.querySelectorAll('.nav-item').forEach((button) => {
      button.classList.toggle('active', button.dataset.view === nextView);
    });
    document.querySelectorAll('.view').forEach((section) => {
      section.style.display = section.id === `view-${nextView}` ? '' : 'none';
    });
    localStorage.setItem(adminViewStorageKey, nextView);

    if (nextView === 'dashboard') loadDashboard();
    if (nextView === 'books') loadBooks();
    if (nextView === 'featured') loadFeatured();
    if (nextView === 'orders') loadOrders();
    if (nextView === 'users') loadUsers();
    if (nextView === 'promotions') loadPromotions();
    if (nextView === 'reviews') loadReviews();
    if (nextView === 'analytics') loadAnalytics();
    if (nextView === 'settings') loadSettings();
  }

  function toast(msg, type='info') {
    const container = $id('toast-container');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = msg;
    container.appendChild(el);
    
    setTimeout(() => {
      el.classList.add('removing');
      setTimeout(() => el.remove(), 300);
    }, 3000);
  }

  // Theme toggle
  const themeToggleAdmin = $id('theme-toggle-admin');
  const htmlEl = document.documentElement;
  const savedTheme = localStorage.getItem('bookstaTheme') || 'dark';
  htmlEl.setAttribute('data-theme', savedTheme);
  
  themeToggleAdmin.addEventListener('click', () => {
    const newTheme = htmlEl.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    htmlEl.setAttribute('data-theme', newTheme);
    localStorage.setItem('bookstaTheme', newTheme);
    themeToggleAdmin.textContent = newTheme === 'dark' ? '◐' : '◑';
  });

  themeToggleAdmin.textContent = savedTheme === 'dark' ? '◐' : '◑';

  // Check admin role and load user info
  async function checkAdmin(){
    try {
      const res = await api('/auth/me');
      if (!res.user || res.user.role !== 'admin') {
        alert('Admin access required');
        window.location.href = '/';
        return false;
      }
      $id('admin-user').innerHTML = `<div><strong>${escapeHtml(res.user.name)}</strong><div class="small">${escapeHtml(res.user.email)}</div></div>`;
      return true;
    } catch (e) {
      window.location.href = '/';
      return false;
    }
  }

  // Navigation
  document.querySelectorAll('.nav-item[data-view]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      showAdminView(e.currentTarget.dataset.view);
    });
  });

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-admin-action]');
    if (!button) return;

    const action = button.dataset.adminAction;
    const id = button.dataset.id;

    if (action === 'edit-book') return openBookForm(id);
    if (action === 'delete-book') return window.delBook(id);
    if (action === 'restock-book') return window.restockBook(id, button.dataset.title || '');
    if (action === 'toggle-featured-book') return window.toggleFeatured(id, button.dataset.featured !== 'true');
    if (action === 'remove-featured') return window.toggleFeatured(id, false);
    if (action === 'delete-review') return window.deleteReview(id);
    if (action === 'edit-promo') return window.editPromo(id);
    if (action === 'toggle-promo') return window.togglePromo(id, button.dataset.active === 'true');
    if (action === 'delete-promo') return window.deletePromo(id);
    if (action === 'delete-user') return window.deleteUser(id);
  });

  document.addEventListener('change', (event) => {
    const control = event.target.closest('[data-admin-action]');
    if (!control) return;

    const action = control.dataset.adminAction;
    const id = control.dataset.id;

    if (action === 'order-status') return window.updateOrderStatus(id, control.value);
    if (action === 'user-role') return window.updateUserRole(id, control.value);
  });

  // Logout
  $id('logout-admin').addEventListener('click', () => {
    localStorage.removeItem('bookstaToken');
    window.location.href = '/';
  });


  // Dashboard
  async function loadDashboard(){
    try {
      const [statsRes, ordersRes, alertsRes] = await Promise.all([
        api('/admin/stats').catch(e => ({ totalUsers: 0, totalOrders: 0, totalRevenue: 0, pendingRevenue: 0, topBooks: [] })),
        api('/admin/orders').catch(e => ({ orders: [] })),
        api('/admin/inventory-alerts').catch(e => ({ lowStockBooks: [] }))
      ]);

    // Stats grid
    const grid = $id('stats-grid'); grid.innerHTML = '';
    [
      { label: 'Total Users', value: statsRes.totalUsers, icon: '👥' },
      { label: 'Total Orders', value: statsRes.totalOrders, icon: '📦' },
      { label: 'Completed Revenue', value: formatRWF(statsRes.totalRevenue), icon: '💰' },
      { label: 'Pending Revenue', value: formatRWF(statsRes.pendingRevenue || 0), icon: '⏳' }
    ].forEach(it=>{
      const el = document.createElement('div'); el.className='stat-card';
      el.innerHTML = `<div class="stat-label">${it.icon} ${it.label}</div><div class="stat-value">${it.value}</div>`;
      grid.appendChild(el);
    });

    // Recent orders table
    const recents = $id('recent-orders-table');
    if (ordersRes.orders && ordersRes.orders.length) {
      let html = '<table style="width:100%;border-collapse:collapse;margin-top:0.5rem"><thead><tr style="border-bottom:1px solid var(--border);padding:0.75rem 0"><th style="text-align:left;padding:0.75rem;font-weight:600">Customer</th><th style="text-align:left;padding:0.75rem;font-weight:600">Total</th><th style="text-align:left;padding:0.75rem;font-weight:600">Status</th><th style="text-align:left;padding:0.75rem;font-weight:600">Date</th></tr></thead><tbody>';
      ordersRes.orders.slice(0, 5).forEach(o=>{
        const statusClass = 'status-' + (o.status || 'pending');
        html += `<tr style="border-bottom:1px solid var(--border)"><td style="padding:0.75rem">${escapeHtml(o.user_name || 'Unknown')}</td><td style="padding:0.75rem">${formatRWF(o.total)}</td><td style="padding:0.75rem"><span class="order-status-badge ${statusClass}">${o.status || 'pending'}</span></td><td style="padding:0.75rem;color:var(--text-muted);font-size:0.9rem">${new Date(o.created_at).toLocaleDateString()}</td></tr>`;
      });
      html += '</tbody></table>';
      recents.innerHTML = html;
    }

    // Quick actions
    const quick = $id('admin-quick-actions');
      if (quick) {
      quick.innerHTML = `<div class="quick-inner"><button id="qa-new-book" class="btn-primary">➕ New Book</button><button id="qa-new-promo" class="btn-secondary">🎉 New Promotion</button><button id="qa-export" class="btn-primary">⬇ Export Orders</button><button id="qa-ping-sitemap" class="btn-secondary">📣 Ping Search Engines</button><button id="qa-refresh" class="btn-secondary">🔄 Refresh</button></div>`;
      $id('qa-new-book').addEventListener('click', () => openBookForm(null));
      $id('qa-new-promo').addEventListener('click', () => openPromoForm());
      $id('qa-export').addEventListener('click', ()=>{ document.querySelector('#export-csv')?.click(); });
      $id('qa-ping-sitemap').addEventListener('click', async () => {
        try {
          const res = await api('/admin/sitemap/ping', { method: 'POST', body: JSON.stringify({}) });
          if (res && res.results) {
            toast('Sitemap ping sent. See console for details.');
            console.log('Sitemap ping results', res);
          } else {
            toast('Sitemap ping result: ' + JSON.stringify(res));
          }
        } catch (e) {
          console.error('Ping error', e);
          toast('Failed to ping search engines: ' + (e.message || e), 'error');
        }
      });
      $id('qa-refresh').addEventListener('click', ()=> loadDashboard());
    }

      // Activity feed (recent orders)
      const feed = $id('activity-feed');
      if (feed) {
        feed.innerHTML = (ordersRes.orders || []).slice(0,6).map(o => `<div class="activity-item">${new Date(o.created_at).toLocaleString()} • ${escapeHtml(o.user_name||o.user_email||'Customer')} placed order ${String(o.id).slice(0,8)} (${formatRWF(o.total)})</div>`).join('');
      }

      // Low stock alerts
      const alerts = $id('inventory-alerts');
      if (alertsRes.lowStockBooks && alertsRes.lowStockBooks.length) {
        alerts.innerHTML = '';
        alertsRes.lowStockBooks.forEach(b=>{
          const el = document.createElement('div'); el.className='card';
          el.innerHTML = `<h4 style="margin:0 0 0.5rem 0;font-size:0.95rem">${escapeHtml(b.title)}</h4>
            <div class="small" style="margin-bottom:0.5rem">${escapeHtml(b.author)}</div>
            <div style="padding:0.5rem;background:rgba(239,68,68,0.2);border-radius:6px;color:#fca5a5;font-weight:600;font-size:0.9rem">⚠️ Only ${b.stock} in stock</div>`;
          alerts.appendChild(el);
        });
      } else {
        alerts.innerHTML = '<p style="color:var(--text-muted)">All books have good stock levels ✓</p>';
      }
    } catch (error) {
      console.error('Dashboard error:', error);
      toast('Dashboard load error: ' + error.message, 'error');
    }
  }

  // Books Management
  let allBooks = [];
  async function loadBooks(){
    try {
      const res = await api('/admin/books-summary').catch(e => { console.warn('Books summary error:', e); return { books: [] }; });
      allBooks = res.books || [];
      populateFilterOptions();
      applyFilters();
    } catch (error) {
      console.error('Books load error:', error);
      toast('Books load error: ' + error.message, 'error');
      allBooks = [];
      populateFilterOptions();
      renderBooksTable([]);
    }
  }

  function renderBooksTable(books) {
    const list = $id('books-table');
    if (!list) return;

    if (!books.length) {
      list.innerHTML = '<div class="card" style="padding:1rem">No books found.</div>';
      return;
    }

    const totals = books.reduce((acc, book) => {
      acc.totalBooks += 1;
      acc.totalStock += Number(book.stock || 0);
      acc.totalSold += Number(book.sold_count || 0);
      acc.pending += Number(book.pending_count || 0);
      acc.lowStock += Number(book.stock || 0) <= 5 ? 1 : 0;
      acc.inventoryValue += Number(book.inventory_value || (Number(book.stock || 0) * Number(book.price || 0)));
      return acc;
    }, { totalBooks: 0, totalStock: 0, totalSold: 0, pending: 0, lowStock: 0, inventoryValue: 0 });

    let html = `
      <div class="books-summary-grid">
        <div class="stat-card"><div class="stat-label">Books</div><div class="stat-value">${formatNumber(totals.totalBooks)}</div></div>
        <div class="stat-card"><div class="stat-label">Units Sold</div><div class="stat-value">${formatNumber(totals.totalSold)}</div></div>
        <div class="stat-card"><div class="stat-label">Pending</div><div class="stat-value">${formatNumber(totals.pending)}</div></div>
        <div class="stat-card"><div class="stat-label">Low Stock</div><div class="stat-value">${formatNumber(totals.lowStock)}</div></div>
      </div>
      <p class="books-summary-note">Inventory value: <strong>${formatRWF(totals.inventoryValue)}</strong></p>
      <table class="admin-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Genre</th>
            <th>Price</th>
            <th>Stock</th>
            <th>Sold</th>
            <th>Pending</th>
            <th>Featured</th>
            <th>Operations</th>
          </tr>
        </thead>
        <tbody>
    `;

    books.forEach((book) => {
      html += `
        <tr>
          <td>
            <div class="book-title-cell">
              <strong>${escapeHtml(book.title)}</strong>
              <span class="small">${escapeHtml(book.author)}</span>
            </div>
          </td>
          <td>${escapeHtml((book.genres && book.genres.length ? book.genres.join(', ') : book.genre || 'N/A'))}</td>
          <td>${formatRWF(book.price)}</td>
          <td><span class="status-pill ${stockBadgeClass(book.stock)}">${formatNumber(book.stock)}</span></td>
          <td><span class="status-pill status-sold">${formatNumber(book.sold_count)}</span></td>
          <td><span class="status-pill status-pending">${formatNumber(book.pending_count)}</span></td>
          <td>${book.featured ? '<span class="status-pill status-featured">Featured</span>' : '<span class="status-pill status-muted">No</span>'}</td>
          <td>
            <div class="book-ops">
              <button class="btn-secondary" data-admin-action="edit-book" data-id="${book.id}">Edit</button>
              <button class="btn-secondary" data-admin-action="restock-book" data-id="${book.id}" data-title="${escapeHtml(book.title)}">Restock</button>
              <button class="btn-secondary" data-admin-action="toggle-featured-book" data-id="${book.id}" data-featured="${book.featured ? 'true' : 'false'}">${book.featured ? 'Unfeature' : 'Feature'}</button>
              <button class="btn-danger" data-admin-action="delete-book" data-id="${book.id}">Delete</button>
            </div>
          </td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    list.innerHTML = html;
  }

  window.editBook = async (id) => openBookForm(id);
  window.delBook = async (id) => {
    if (confirm('Delete this book?')) {
      await api('/books/'+id, { method:'DELETE' });
      toast('Book deleted');
      await loadBooks();
    }
  };

  window.restockBook = async (id, title) => {
    const book = allBooks.find((entry) => entry.id === id);
    const currentStock = Number(book?.stock || 0);
    const response = prompt(`Restock ${title || 'this book'} by how many units?`, '5');
    const amount = Number(response);
    if (!Number.isFinite(amount) || amount <= 0) return;

    await api('/admin/books/' + id + '/stock', {
      method: 'PATCH',
      body: JSON.stringify({ stock: currentStock + amount })
    });

    toast(`${title || 'Book'} stock updated`);
    await loadBooks();
    await loadDashboard();
  };

  async function openBookForm(bookId){
    let book = { title:'', author:'', price:1000, genre:'', genres: [], description:'', stock:10, pages: null, year: null, isbn: '', featured: false };
    if(bookId){ const res = await api('/books/'+bookId); book = res.book; }
    const modal = $id('modal'); modal.style.display='flex'; modal.classList.add('side');
    modal.innerHTML = `<div class='modal-panel solid'>
      <button id='close-modal-btn' class='modal-close' aria-label='Close'>&times;</button>
      <h3 style="margin-top:0">${bookId?'Edit':'New'} Book</h3>
      <div class='form-group'><label>Title *</label><input id='f_title' placeholder='Book title' value='${escapeHtml(book.title)}'></div>
      <div class='form-group'><label>Author *</label><input id='f_author' placeholder='Author name' value='${escapeHtml(book.author)}'></div>
      <div class='form-group'><label>Thumbnail</label>
        <div style="display:flex;gap:0.75rem;align-items:center">
          <input id='f_thumb' type='file' accept='image/*' />
          <img id='f_thumb_preview' src='${book.cover_url||''}' alt='' style='height:54px;display:${book.cover_url ? 'block' : 'none'};border-radius:6px;border:1px solid var(--border);object-fit:cover' />
        </div>
      </div>
      <div class='form-group'><label>Genres</label><input id='f_genres' placeholder='Fiction, Mystery, Romance' value='${escapeHtml((book.genres && book.genres.length ? book.genres.join(', ') : book.genre || ''))}'></div>
      <div class='form-group'><label>Price (RWF) *</label><input id='f_price' type='number' placeholder='Price' value='${book.price}'></div>
      <div class='form-group'><label>Stock</label><input id='f_stock' type='number' placeholder='Stock quantity' value='${book.stock}'></div>
      <div class='form-group'><label><input id='f_featured' type='checkbox' ${book.featured?'checked':''} style='margin-right:0.5rem'>Featured on hero</label></div>
      <div class='form-group'><label>Description</label><textarea id='f_desc' placeholder='Book description'>${escapeHtml(book.description||'')}</textarea></div>
      <div class='form-group'><label>Pages</label><input id='f_pages' type='number' placeholder='Number of pages' value='${book.pages||''}'></div>
      <div class='form-group'><label>Year</label><input id='f_year' type='number' placeholder='Publication year' value='${book.year||''}'></div>
      <div class='form-group'><label>ISBN</label><input id='f_isbn' placeholder='ISBN' value='${escapeHtml(book.isbn||'')}'></div>
      <div class='form-actions'>
        <button id='cancel-book' class='btn-secondary'>Cancel</button>
        <button id='save-book' class='btn-primary'>Save Book</button>
      </div>
    </div>`;

    // Close handlers for both the top close button and the cancel action
    const closeModal = () => { modal.style.display='none'; modal.innerHTML=''; modal.classList.remove('side'); document.removeEventListener('keydown', escHandler); };
    const topClose = $id('close-modal-btn'); if (topClose) topClose.addEventListener('click', closeModal);
    const cancelBtn = $id('cancel-book'); if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    // Escape key closes modal
    const escHandler = (e) => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', escHandler, { once: false });
    // handle thumbnail preview
    const thumbInput = $id('f_thumb');
    if (thumbInput) {
      thumbInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        const preview = $id('f_thumb_preview');
        if (!file) { if(preview) preview.style.display='none'; return; }
        const reader = new FileReader();
        reader.onload = () => { if(preview){ preview.src = reader.result; preview.style.display='block'; } };
        reader.readAsDataURL(file);
      });
    }

    $id('save-book').addEventListener('click', async ()=>{
      const title = $id('f_title').value.trim();
      const author = $id('f_author').value.trim();
      if (!title || !author) { toast('Title and author required'); return; }
      const payload = {
        title, author,
        genres: $id('f_genres').value || null,
        genre: ($id('f_genres').value || '').split(',').map((item) => item.trim()).filter(Boolean)[0] || null,
        price: parseFloat($id('f_price').value) || 1000,
        stock: parseInt($id('f_stock').value) || 0,
        featured: $id('f_featured').checked || false,
        description: $id('f_desc').value || null,
        pages: $id('f_pages').value ? parseInt($id('f_pages').value) : null,
        year: $id('f_year').value ? parseInt($id('f_year').value) : null,
        isbn: $id('f_isbn').value || null,
        cover_url: book.cover_url || null
      };
      // Save uploaded thumbnail directly into cover_url so storefront uses it as book cover.
      try {
        const file = $id('f_thumb')?.files?.[0];
        if (file) {
          if (file.size > 900 * 1024) {
            toast('Thumbnail too large. Please use an image under 900KB.');
            return;
          }
          const dataUrl = await new Promise((res, rej) => {
            const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file);
          });
          payload.cover_url = dataUrl;
        } else if (book.cover_url) {
          payload.cover_url = book.cover_url;
        }
      } catch(e) { console.warn('thumbnail read failed', e); }
      if(bookId) await api('/books/'+bookId, { method:'PATCH', body: JSON.stringify(payload)});
      else await api('/books', { method:'POST', body: JSON.stringify(payload)});
      modal.style.display='none'; modal.innerHTML=''; modal.classList.remove('side');
      document.removeEventListener('keydown', escHandler);
      toast(bookId ? 'Book updated' : 'Book created');
      await loadBooks();
    });
  }

  $id('new-book').addEventListener('click', () => openBookForm(null));
  // Advanced filtering utilities
  function populateFilterOptions() {
    const genreEl = $id('filter-genre');
    if (!genreEl) return;
    const genres = new Set();
    allBooks.forEach(b => {
      (b.genres || []).forEach(g => { if (g) genres.add(g); });
      if (b.genre) genres.add(b.genre);
    });
    // keep current selection if present
    const current = genreEl.value;
    genreEl.innerHTML = '<option value="">All genres</option>' + Array.from(genres).sort().map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('');
    if (current) genreEl.value = current;
  }

  function applyFilters() {
    const q = ($id('book-search').value || '').toLowerCase().trim();
    const genre = ($id('filter-genre').value || '').trim();
    const minP = Number($id('filter-min-price').value || 0) || 0;
    const maxP = Number($id('filter-max-price').value || 0) || 0;
    const stock = $id('filter-stock').value || '';
    const featuredOnly = $id('filter-featured').checked;
    const sort = $id('filter-sort').value || 'created_desc';

    let filtered = allBooks.filter(book => {
      // text search
      const haystack = [book.title, book.author, (book.genres || []).join(' '), book.genre]
        .filter(Boolean).join(' ').toLowerCase();
      if (q && !haystack.includes(q)) return false;
      // genre
      if (genre) {
        const bookGenres = (book.genres || []).map(g => (g||'').toLowerCase());
        if (book.genre && book.genre.toLowerCase() === genre.toLowerCase()) return true;
        if (!bookGenres.some(g => g === genre.toLowerCase())) return false;
      }
      // price
      const price = Number(book.price || 0);
      if (minP && price < minP) return false;
      if (maxP && maxP > 0 && price > maxP) return false;
      // stock
      if (stock) {
        if (stock === 'low' && Number(book.stock) > 5) return false;
        if (stock === 'watch' && (Number(book.stock) < 6 || Number(book.stock) > 15)) return false;
        if (stock === 'healthy' && Number(book.stock) < 16) return false;
      }
      if (featuredOnly && !book.featured) return false;
      return true;
    });

    // sorting
    switch (sort) {
      case 'price_asc': filtered.sort((a,b) => (Number(a.price)||0) - (Number(b.price)||0)); break;
      case 'price_desc': filtered.sort((a,b) => (Number(b.price)||0) - (Number(a.price)||0)); break;
      case 'sold_desc': filtered.sort((a,b) => (Number(b.sold_count)||0) - (Number(a.sold_count)||0)); break;
      case 'title_asc': filtered.sort((a,b) => String(a.title||'').localeCompare(String(b.title||''))); break;
      case 'created_desc':
      default: filtered.sort((a,b) => new Date(b.created_at) - new Date(a.created_at)); break;
    }

    renderBooksTable(filtered);
  }

  // Wire up filter controls
  const filterIds = ['book-search','filter-genre','filter-min-price','filter-max-price','filter-stock','filter-featured','filter-sort'];
  filterIds.forEach(id => {
    const el = $id(id);
    if (!el) return;
    el.addEventListener(['book-search'].includes(id) ? 'keyup' : 'change', applyFilters);
    // allow enter on price inputs to trigger
    if (id === 'filter-min-price' || id === 'filter-max-price') el.addEventListener('keyup', (e) => { if (e.key === 'Enter') applyFilters(); });
  });
  const resetBtn = $id('filter-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', (event) => {
      event.preventDefault();
      $id('book-search').value = '';
      $id('filter-genre').value = '';
      $id('filter-min-price').value = '';
      $id('filter-max-price').value = '';
      $id('filter-stock').value = '';
      $id('filter-featured').checked = false;
      $id('filter-sort').value = 'created_desc';
      renderBooksTable(allBooks);
      applyFilters();
    });
  }

  // shared filter event delegation so the controls still work after rerenders
  document.addEventListener('click', (event) => {
    const button = event.target.closest('#filter-reset');
    if (!button) return;
    event.preventDefault();
    $id('book-search').value = '';
    $id('filter-genre').value = '';
    $id('filter-min-price').value = '';
    $id('filter-max-price').value = '';
    $id('filter-stock').value = '';
    $id('filter-featured').checked = false;
    $id('filter-sort').value = 'created_desc';
    renderBooksTable(allBooks);
    applyFilters();
  });

  // Featured Books Manager
  async function loadFeatured(){
    try {
      const [booksRes, statsRes] = await Promise.all([
        api('/books?limit=200').catch(e => { console.warn('Featured books error:', e); return { books: [] }; }),
        api('/admin/stats').catch(e => { console.warn('Stats error:', e); return { totalBooks: 0, uniqueAuthors: 0 }; })
      ]);
      
      const grid = $id('featured-books-grid');
      const featuredBooks = (booksRes.books || []).filter(b => b.featured);
      
      // Build HTML: stats header plus a table of featured books for easier management
      let gridHtml = '';

      // Stats header (spans full width)
      gridHtml += `
        <div style="grid-column: 1 / -1; display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; margin-bottom: 1rem;">
          <div class="card" style="padding: 1.5rem; background: linear-gradient(180deg, rgba(124,140,255,0.15), var(--bg-soft)); border-left: 4px solid var(--accent);">
            <div style="display: flex; justify-content: space-between; align-items: start;">
              <div>
                <div class="small" style="opacity: 0.7; text-transform: uppercase; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.5px; margin-bottom: 0.5rem;">Total Books</div>
                <div style="font-size: 2rem; font-weight: 700; color: var(--accent);">${formatNumber(statsRes.totalBooks || 0)}</div>
                <div style="opacity: 0.6; font-size: 0.9rem; margin-top: 0.25rem;">in library</div>
              </div>
              <span style="font-size: 2.5rem; opacity: 0.3;">📚</span>
            </div>
          </div>
          <div class="card" style="padding: 1.5rem; background: linear-gradient(180deg, rgba(34,211,238,0.15), var(--bg-soft)); border-left: 4px solid var(--accent-2);">
            <div style="display: flex; justify-content: space-between; align-items: start;">
              <div>
                <div class="small" style="opacity: 0.7; text-transform: uppercase; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.5px; margin-bottom: 0.5rem;">Famous Authors</div>
                <div style="font-size: 2rem; font-weight: 700; color: var(--accent-2);">${formatNumber(statsRes.uniqueAuthors || 0)}</div>
                <div style="opacity: 0.6; font-size: 0.9rem; margin-top: 0.25rem;">curated collection</div>
              </div>
              <span style="font-size: 2.5rem; opacity: 0.3;">✍️</span>
            </div>
          </div>
        </div>
      `;

      if (!featuredBooks.length) {
        gridHtml += `<div class="card" style="grid-column:1/-1;padding:1.25rem;color:var(--text-muted)">No featured books. Add by clicking Edit on any book.</div>`;
        grid.innerHTML = gridHtml;
        return;
      }

      // Table header
      gridHtml += `
        <table class="admin-table" style="grid-column:1 / -1;width:100%;border-collapse:collapse;margin-top:0.5rem">
          <thead>
            <tr>
              <th style="text-align:left;padding:0.75rem;font-weight:600">Title</th>
              <th style="text-align:left;padding:0.75rem;font-weight:600">Author</th>
              <th style="text-align:left;padding:0.75rem;font-weight:600">Genres</th>
              <th style="text-align:left;padding:0.75rem;font-weight:600">Price</th>
              <th style="text-align:left;padding:0.75rem;font-weight:600">Stock</th>
              <th style="text-align:left;padding:0.75rem;font-weight:600">Sold</th>
              <th style="text-align:left;padding:0.75rem;font-weight:600">Action</th>
            </tr>
          </thead>
          <tbody>
      `;

      featuredBooks.forEach(b => {
        const genres = (b.genres && b.genres.length) ? escapeHtml(b.genres.join(', ')) : escapeHtml(b.genre || 'Uncategorized');
        gridHtml += `
          <tr style="border-bottom:1px solid var(--border)">
            <td style="padding:0.75rem">
              <div style="display:flex;align-items:center;gap:0.75rem">
                <div style="width:56px;height:80px;border-radius:8px;overflow:hidden;flex:0 0 auto;background:linear-gradient(145deg, ${escapeHtml(b.cover_color || '#1f2937')}, rgba(15,23,42,0.9));display:grid;place-items:center">${b.cover_url ? `<img src="${escapeHtml(b.cover_url)}" alt="${escapeHtml(b.title)}" style="width:100%;height:100%;object-fit:cover"/>` : `<span style="font-size:1.4rem">📚</span>`}</div>
                <div>
                  <strong>${escapeHtml(b.title)}</strong>
                  <div class="small" style="opacity:0.7">${escapeHtml(b.author)}</div>
                </div>
              </div>
            </td>
            <td style="padding:0.75rem">${escapeHtml(b.author)}</td>
            <td style="padding:0.75rem">${genres}</td>
            <td style="padding:0.75rem">${formatRWF(b.price)}</td>
            <td style="padding:0.75rem"><span class="status-pill ${stockBadgeClass(b.stock)}">${formatNumber(b.stock)}</span></td>
            <td style="padding:0.75rem">${formatNumber(b.sold_count || 0)}</td>
            <td style="padding:0.75rem"><button class="btn-secondary" data-admin-action="remove-featured" data-id="${b.id}">Remove</button></td>
          </tr>
        `;
      });

      gridHtml += '</tbody></table>';
      grid.innerHTML = gridHtml;
    } catch (error) {
      console.error('Featured load error:', error);
      toast('Featured load error: ' + error.message, 'error');
    }
  }

  window.toggleFeatured = async (id, featured) => {
    await api('/admin/books/'+id+'/featured', { method:'PATCH', body: JSON.stringify({ featured }) });
    toast(featured ? 'Added to featured' : 'Removed from featured');
    await loadFeatured();
    await loadBooks();
  };

  // Orders Management
  let allOrders = [];
  let selectedOrderIds = new Set();

  function buildOrderSummaryCards(orders) {
    const totalOrders = orders.length;
    const completedRevenue = orders
      .filter((order) => String(order.status || 'pending') === 'completed')
      .reduce((sum, order) => sum + Number(order.total || 0), 0);
    const pendingRevenue = orders
      .filter((order) => String(order.status || 'pending') !== 'completed')
      .reduce((sum, order) => sum + Number(order.total || 0), 0);
    const pendingOrders = orders.filter((order) => String(order.status || 'pending') === 'pending').length;
    const fulfilledOrders = orders.filter((order) => ['shipped', 'completed'].includes(String(order.status || 'pending'))).length;

    return [
      { label: 'Orders in view', value: formatNumber(totalOrders), note: `${formatNumber(getSelectedVisibleOrders(orders).length)} selected` },
      { label: 'Completed revenue', value: formatRWF(completedRevenue), note: 'Completed orders only' },
      { label: 'Pending revenue', value: formatRWF(pendingRevenue), note: 'Awaiting completion' },
      { label: 'Pending orders', value: formatNumber(pendingOrders), note: 'Need attention' },
      { label: 'Fulfilled orders', value: formatNumber(fulfilledOrders), note: 'Shipped or completed' }
    ].map((item) => `
      <article class="orders-summary-card">
        <div class="orders-summary-label">${escapeHtml(item.label)}</div>
        <div class="orders-summary-value">${escapeHtml(item.value)}</div>
        <div class="orders-summary-note">${escapeHtml(item.note)}</div>
      </article>
    `).join('');
  }

  function getSelectedVisibleOrders(orders) {
    return orders.filter((order) => selectedOrderIds.has(order.id));
  }

  function renderOrdersDashboard(orders) {
    const summary = $id('orders-summary');
    if (summary) summary.innerHTML = buildOrderSummaryCards(orders);
  }

  function syncOrderSelectionLabel(orders) {
    const label = $id('orders-selection-label');
    if (!label) return;
    const selectedCount = getSelectedVisibleOrders(orders).length;
    label.textContent = selectedCount ? `${formatNumber(selectedCount)} selected` : 'No orders selected';
  }

  function applyOrderFilters() {
    const search = ($id('order-search').value || '').toLowerCase().trim();
    const status = $id('order-filter').value || '';
    const sort = $id('order-sort').value || 'created_desc';
    const minTotal = Number($id('order-min-total').value || 0) || 0;
    const dateWindow = Number($id('order-date-filter').value || 0) || 0;

    let filtered = allOrders.filter((order) => {
      const haystack = [order.user_email, order.user_name, order.id, order.status].filter(Boolean).join(' ').toLowerCase();
      if (search && !haystack.includes(search)) return false;
      if (status && String(order.status || 'pending') !== status) return false;
      if (minTotal && Number(order.total || 0) < minTotal) return false;
      if (dateWindow) {
        const createdAt = new Date(order.created_at).getTime();
        const cutoff = Date.now() - (dateWindow * 24 * 60 * 60 * 1000);
        if (createdAt < cutoff) return false;
      }
      return true;
    });

    switch (sort) {
      case 'created_asc': filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)); break;
      case 'total_desc': filtered.sort((a, b) => Number(b.total || 0) - Number(a.total || 0)); break;
      case 'total_asc': filtered.sort((a, b) => Number(a.total || 0) - Number(b.total || 0)); break;
      case 'items_desc': filtered.sort((a, b) => Number((b.items || []).length) - Number((a.items || []).length)); break;
      case 'created_desc':
      default: filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); break;
    }

    renderOrdersDashboard(filtered);
    renderOrdersTable(filtered);
  }

  async function loadOrders(){
    try {
      const res = await api('/admin/orders').catch(e => { console.warn('Orders error:', e); return { orders: [] }; });
      allOrders = res.orders || [];
      applyOrderFilters();
    } catch (error) {
      console.error('Orders load error:', error);
      toast('Orders load error: ' + error.message, 'error');
      allOrders = [];
      renderOrdersDashboard([]);
      renderOrdersTable([]);
    }
  }

  function renderOrdersTable(orders) {
    const list = $id('orders-table'); 
    if (!list) return;
    const visibleSelectedCount = getSelectedVisibleOrders(orders).length;
    let html = `
      <div class="order-bulk-selection">
        <label class="order-select-all">
          <input id="order-select-all" type="checkbox" ${orders.length && visibleSelectedCount === orders.length ? 'checked' : ''} />
          <span>Select all visible</span>
        </label>
        <div class="hint" id="orders-selection-label">${visibleSelectedCount ? `${formatNumber(visibleSelectedCount)} selected` : 'No orders selected'}</div>
      </div>
      <table class="admin-table">
        <thead>
          <tr>
            <th style="width:44px"></th>
            <th>Order</th>
            <th>Total</th>
            <th>Items</th>
            <th>Status</th>
            <th>Date</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
    `;
    orders.forEach((o) => {
      const statusClass = 'status-' + (o.status || 'pending');
      const isSelected = selectedOrderIds.has(o.id);
      const itemsMarkup = (o.items || []).slice(0, 3).map((item) => `<span>${escapeHtml(item.title || 'Book')} × ${Number(item.quantity || 1)}</span>`).join('') || '<span>No items listed</span>';
      html += `<tr style="border-bottom:1px solid var(--border)" data-order-id="${escapeHtml(o.id)}" class="${isSelected ? 'is-selected' : ''}">
        <td style="padding:0.75rem;vertical-align:middle"><input type="checkbox" class="order-row-select" data-order-select="${escapeHtml(o.id)}" ${isSelected ? 'checked' : ''} /></td>
        <td style="padding:0.75rem">
          <div class="order-row-meta">
            <div class="order-row-title">${escapeHtml(o.user_name || o.user_email || 'Unknown customer')}</div>
            <div class="order-row-sub">Order ${escapeHtml(String(o.id).slice(0, 10))}</div>
            <div class="order-items-list">${itemsMarkup}</div>
          </div>
        </td>
        <td style="padding:0.75rem;font-weight:600">${formatRWF(o.total)}</td>
        <td style="padding:0.75rem;color:var(--text-muted)">${formatNumber((o.items||[]).length)} item(s)</td>
        <td style="padding:0.75rem"><span class="order-status-badge ${statusClass}">${escapeHtml(o.status || 'pending')}</span></td>
        <td style="padding:0.75rem;color:var(--text-muted);font-size:0.9rem">${new Date(o.created_at).toLocaleDateString()}</td>
        <td style="padding:0.75rem">
          <div class="order-actions">
            <select data-admin-action="order-status" data-id="${o.id}" class="filter-select" style="padding:0.4rem;border-radius:4px;border:1px solid var(--border);background:var(--glass);color:inherit">
          <option${o.status==='pending'?' selected':''}>pending</option>
          <option${o.status==='processing'?' selected':''}>processing</option>
          <option${o.status==='shipped'?' selected':''}>shipped</option>
          <option${o.status==='completed'?' selected':''}>completed</option>
          <option${o.status==='cancelled'?' selected':''}>cancelled</option>
            </select>
          </div>
        </td>
      </tr>`;
    });
    html += '</tbody></table>';
    list.innerHTML = html;

    const selectAll = $id('order-select-all');
    if (selectAll) {
      selectAll.checked = orders.length > 0 && visibleSelectedCount === orders.length;
      selectAll.indeterminate = !selectAll.checked && visibleSelectedCount > 0;
      selectAll.addEventListener('change', () => {
        if (selectAll.checked) {
          orders.forEach((order) => selectedOrderIds.add(order.id));
        } else {
          orders.forEach((order) => selectedOrderIds.delete(order.id));
        }
        renderOrdersDashboard(orders);
        renderOrdersTable(orders);
      }, { once: true });
    }

    document.querySelectorAll('[data-order-select]').forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        const orderId = checkbox.dataset.orderSelect;
        if (checkbox.checked) selectedOrderIds.add(orderId); else selectedOrderIds.delete(orderId);
        syncOrderSelectionLabel(orders);
        const master = $id('order-select-all');
        if (master) {
          const selectedVisible = getSelectedVisibleOrders(orders).length;
          master.checked = orders.length > 0 && selectedVisible === orders.length;
          master.indeterminate = !master.checked && selectedVisible > 0;
        }
      });
    });

    syncOrderSelectionLabel(orders);
  }

  window.updateOrderStatus = async (id, status) => {
    await api('/admin/orders/'+id, { method:'PATCH', body: JSON.stringify({ status }) });
    toast('Status updated to ' + status);
    await loadOrders();
  };

  function clearOrderSelection() {
    selectedOrderIds = new Set();
    applyOrderFilters();
  }

  $id('order-filter').addEventListener('change', applyOrderFilters);
  $id('order-search').addEventListener('keyup', applyOrderFilters);
  $id('order-sort').addEventListener('change', applyOrderFilters);
  $id('order-date-filter').addEventListener('change', applyOrderFilters);
  $id('order-min-total').addEventListener('keyup', applyOrderFilters);
  $id('orders-clear-selection').addEventListener('click', clearOrderSelection);
  $id('orders-refresh').addEventListener('click', loadOrders);

  document.querySelectorAll('[data-order-bulk-status]').forEach((button) => {
    button.addEventListener('click', async () => {
      const status = button.dataset.orderBulkStatus;
      const selected = allOrders.filter((order) => selectedOrderIds.has(order.id));
      if (!selected.length) {
        toast('Select at least one order first', 'error');
        return;
      }
      if (!confirm(`Update ${selected.length} selected order(s) to ${status}?`)) return;
      try {
        await Promise.all(selected.map((order) => api('/admin/orders/' + order.id, { method: 'PATCH', body: JSON.stringify({ status }) })));
        toast(`Updated ${selected.length} order(s) to ${status}`);
        selectedOrderIds = new Set();
        await loadOrders();
      } catch (error) {
        toast(error.message || 'Failed to update selected orders', 'error');
      }
    });
  });

  // Users Management
  let allUsers = [];
  async function loadUsers(){
    try {
      const res = await api('/admin/users').catch(e => { console.warn('Users error:', e); return { users: [] }; });
      allUsers = res.users || [];
      populateUserFilterHints();
      applyUserFilters();
    } catch (error) {
      console.error('Users load error:', error);
      toast('Users load error: ' + error.message, 'error');
      allUsers = [];
      populateUserFilterHints();
      renderUsersTable([]);
    }
  }

  function populateUserFilterHints() {
    const domainEl = $id('user-domain-filter');
    if (!domainEl) return;
    const current = domainEl.value;
    const domains = Array.from(new Set(
      allUsers
        .map((user) => String(user.email || '').split('@')[1] || '')
        .filter(Boolean)
    )).sort();
    domainEl.setAttribute('list', 'user-domain-list');
    let datalist = $id('user-domain-list');
    if (!datalist) {
      datalist = document.createElement('datalist');
      datalist.id = 'user-domain-list';
      document.body.appendChild(datalist);
    }
    datalist.innerHTML = domains.map((domain) => `<option value="${escapeHtml(domain)}"></option>`).join('');
    if (current) domainEl.value = current;
  }

  function applyUserFilters() {
    const search = ($id('user-search').value || '').toLowerCase().trim();
    const role = $id('user-role-filter').value || '';
    const tier = $id('user-tier-filter').value || '';
    const minOrders = Number($id('user-min-orders').value || 0) || 0;
    const minSpend = Number($id('user-min-spend').value || 0) || 0;
    const dateWindow = Number($id('user-date-filter').value || 0) || 0;
    const sort = $id('user-sort').value || 'score_desc';
    const domain = ($id('user-domain-filter').value || '').toLowerCase().trim();

    let filtered = allUsers.filter((user) => {
      const haystack = [user.name, user.email, user.role].filter(Boolean).join(' ').toLowerCase();
      if (search && !haystack.includes(search)) return false;
      if (role && user.role !== role) return false;
      if (tier && String(user.customer_tier || '').toLowerCase() !== tier) return false;
      if (minOrders && Number(user.completed_orders || 0) < minOrders) return false;
      if (minSpend && Number(user.total_spent || 0) < minSpend) return false;
      if (domain) {
        const userDomain = String(user.email || '').split('@')[1] || '';
        if (!userDomain.toLowerCase().includes(domain)) return false;
      }
      if (dateWindow) {
        const createdAt = new Date(user.created_at).getTime();
        const cutoff = Date.now() - (dateWindow * 24 * 60 * 60 * 1000);
        if (createdAt < cutoff) return false;
      }
      return true;
    });

    switch (sort) {
      case 'score_desc': filtered.sort((a, b) => Number(b.buyer_score || 0) - Number(a.buyer_score || 0)); break;
      case 'spend_desc': filtered.sort((a, b) => Number(b.total_spent || 0) - Number(a.total_spent || 0)); break;
      case 'orders_desc': filtered.sort((a, b) => Number(b.completed_orders || 0) - Number(a.completed_orders || 0)); break;
      case 'rank_asc': filtered.sort((a, b) => Number(a.buyer_rank || 9999) - Number(b.buyer_rank || 9999)); break;
      case 'joined_asc': filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)); break;
      case 'name_asc': filtered.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))); break;
      case 'email_asc': filtered.sort((a, b) => String(a.email || '').localeCompare(String(b.email || ''))); break;
      case 'joined_desc':
      default: filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); break;
    }

    renderUsersTable(filtered);
  }

  function renderUsersTable(users) {
    const list = $id('users-table');
    let html = '<table style="width:100%;border-collapse:collapse"><thead><tr style="border-bottom:1px solid var(--border)"><th style="text-align:left;padding:0.75rem;font-weight:600">Rank</th><th style="text-align:left;padding:0.75rem;font-weight:600">Name</th><th style="text-align:left;padding:0.75rem;font-weight:600">Email</th><th style="text-align:left;padding:0.75rem;font-weight:600">Role</th><th style="text-align:left;padding:0.75rem;font-weight:600">Orders</th><th style="text-align:left;padding:0.75rem;font-weight:600">Spent</th><th style="text-align:left;padding:0.75rem;font-weight:600">Tier</th><th style="text-align:left;padding:0.75rem;font-weight:600">Joined</th><th style="text-align:left;padding:0.75rem;font-weight:600">Action</th></tr></thead><tbody>';
    users.forEach(u=>{
      const tier = String(u.customer_tier || 'standard');
      const score = Number(u.buyer_score || 0);
      html += `<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:0.75rem;font-family:JetBrains Mono,monospace;font-weight:700;color:var(--accent)">#${Number(u.buyer_rank || 0) || '—'}</td>
        <td style="padding:0.75rem;font-weight:500">${escapeHtml(u.name)}</td>
        <td style="padding:0.75rem">${escapeHtml(u.email)}</td>
        <td style="padding:0.75rem"><span style="background:${u.role==='admin'?'rgba(99,102,241,0.2);color:#c7d2fe':'rgba(107,114,128,0.2);color:#d1d5db'};padding:0.25rem 0.5rem;border-radius:4px;font-size:0.9rem;font-weight:600">${u.role}</span></td>
        <td style="padding:0.75rem;font-weight:600">${formatNumber(u.completed_orders || 0)}</td>
        <td style="padding:0.75rem;font-weight:600">${formatRWF(u.total_spent || 0)}</td>
        <td style="padding:0.75rem"><span class="status-pill status-${tier}">${tier} • ${score}/100</span></td>
        <td style="padding:0.75rem;color:var(--text-muted);font-size:0.9rem">${new Date(u.created_at).toLocaleDateString()}</td>
        <td style="padding:0.75rem;display:flex;gap:0.5rem;align-items:center"><select data-admin-action="user-role" data-id="${u.id}" style="padding:0.4rem;border-radius:4px;border:1px solid var(--border);background:var(--glass);color:inherit">
          <option${u.role==='customer'?' selected':''}>customer</option>
          <option${u.role==='admin'?' selected':''}>admin</option>
        </select><button class="btn-danger" data-admin-action="delete-user" data-id="${u.id}" style="padding:0.4rem 0.6rem">Delete</button></td>
      </tr>`;
    });
    html += '</tbody></table>';
    list.innerHTML = html;
  }

  window.updateUserRole = async (id, role) => {
    await api('/admin/users/'+id+'/role', { method:'PATCH', body: JSON.stringify({ role }) });
    toast('User role updated to ' + role);
    await loadUsers();
  };

  window.deleteUser = async (id) => {
    if (!confirm('Delete this user? This cannot be undone.')) return;
    try {
      await api('/admin/users/'+id, { method:'DELETE' });
      toast('User deleted');
      await loadUsers();
    } catch (e) {
      toast(e.message || 'Failed to delete user', 'error');
    }
  };

  ['user-search', 'user-role-filter', 'user-date-filter', 'user-sort', 'user-domain-filter'].forEach((id) => {
    const el = $id(id);
    if (!el) return;
    el.addEventListener(id === 'user-search' || id === 'user-domain-filter' ? 'keyup' : 'change', applyUserFilters);
  });
  ['user-tier-filter', 'user-min-orders', 'user-min-spend'].forEach((id) => {
    const el = $id(id);
    if (!el) return;
    el.addEventListener(id.includes('min-') ? 'keyup' : 'change', applyUserFilters);
  });

  const userResetBtn = $id('user-filter-reset');
  if (userResetBtn) {
    userResetBtn.addEventListener('click', (event) => {
      event.preventDefault();
      $id('user-search').value = '';
      $id('user-role-filter').value = '';
      $id('user-tier-filter').value = '';
      $id('user-min-orders').value = '';
      $id('user-min-spend').value = '';
      $id('user-date-filter').value = '';
      $id('user-sort').value = 'score_desc';
      $id('user-domain-filter').value = '';
      applyUserFilters();
    });
  }

  // Reviews Moderation
  async function loadReviews(){
    try {
      const res = await api('/admin/reviews').catch(e => { console.warn('Reviews error:', e); return { reviews: [] }; });
      const list = $id('reviews-list');
      if (!res.reviews || !res.reviews.length) {
        list.innerHTML = '<p style="color:var(--text-muted)">No reviews yet</p>';
        return;
      }
      list.innerHTML = '';
      res.reviews.forEach(r=>{
        const el = document.createElement('div'); el.className='card';
        el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:start">
          <div>
            <h4 style="margin:0">${escapeHtml(r.title || 'Book Review')}</h4>
            <div class="small">${escapeHtml(r.name)} • ${'⭐'.repeat(r.rating)}</div>
            <p style="margin:0.5rem 0 0 0;color:var(--text-muted)">"${escapeHtml(r.body)}"</p>
          </div>
          <button class="btn-danger" data-admin-action="delete-review" data-id="${r.id}" style="padding:0.5rem 0.75rem;white-space:nowrap">Delete</button>
        </div>`;
        list.appendChild(el);
      });
    } catch (error) {
      console.error('Reviews load error:', error);
      toast('Reviews load error: ' + error.message, 'error');
    }
  }

  window.deleteReview = async (id) => {
    if (confirm('Delete this review?')) {
      await api('/admin/reviews/'+id, { method:'DELETE' });
      toast('Review deleted');
      await loadReviews();
    }
  };

  // Analytics
  let revenueChart, genreChart, booksChart;
  async function loadAnalytics(){
    try {
      const view = $id('view-analytics');
      const [revRes, genreRes, statsRes] = await Promise.all([
        api('/admin/analytics/revenue').catch(e => { console.warn('Analytics revenue error:', e); return { dailyRevenue: [] }; }),
        api('/admin/analytics/genres').catch(e => { console.warn('Analytics genres error:', e); return { genreSales: [] }; }),
        api('/admin/stats').catch(e => { console.warn('Analytics stats error:', e); return { totalUsers: 0, totalBooks: 0, topBooks: [] }; })
      ]);

    const revenueRows = Array.isArray(revRes?.dailyRevenue) ? revRes.dailyRevenue : [];
    const genreRows = Array.isArray(genreRes?.genreSales) ? genreRes.genreSales : [];
    const topBooks = Array.isArray(statsRes?.topBooks) ? statsRes.topBooks.slice(0, 5) : [];
    const allUsers = statsRes?.totalUsers || 0;
    const totalBooks = statsRes?.totalBooks || 0;

    const totalRevenue = revenueRows.reduce((sum, row) => sum + Number(row.revenue || 0), 0);
    const totalOrders = revenueRows.reduce((sum, row) => sum + Number(row.orders || 0), 0);
    const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
    const topGenre = genreRows[0]?.genre || 'N/A';
    const hasAnyData = revenueRows.length || genreRows.length || topBooks.length;

    if (!hasAnyData) {
      view.innerHTML = '<h2>Analytics</h2><div class="card" style="padding:1.5rem;margin-top:1rem">No analytics data available yet. Create some orders and books first.</div>';
      return;
    }

    // Advanced analytics with better styling
    const topBooksMarkup = topBooks.length
      ? '<ul style="margin:0;padding:0;list-style:none">' + topBooks.map((b, index) => {
          return '<li style="display:flex;align-items:center;gap:0.75rem;padding:0.75rem;margin-bottom:0.5rem;background:rgba(99,102,241,0.05);border-radius:8px">' +
            '<span style="background:var(--accent);color:white;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700">' + (index + 1) + '</span>' +
            '<span style="flex:1"><strong>' + escapeHtml(b.title) + '</strong><br><span style="font-size:0.8rem;opacity:0.6">' + Number(b.qtySold || 0) + ' sold</span></span>' +
          '</li>';
        }).join('') + '</ul>'
      : '<p class="small" style="opacity:.7;margin:0;text-align:center;padding:1rem">No top books data</p>';

    const genreRowsMarkup = genreRows.length
      ? '<ul style="margin:0;padding:0;list-style:none">' + genreRows.slice(0, 6).map((g) => {
          return '<li style="display:flex;align-items:center;justify-content:space-between;padding:0.75rem;margin-bottom:0.5rem;background:rgba(139,92,246,0.05);border-radius:8px">' +
            '<span><strong>' + escapeHtml(g.genre || 'N/A') + '</strong></span>' +
            '<span style="background:rgba(139,92,246,0.3);color:var(--accent-2);padding:0.25rem 0.75rem;border-radius:6px;font-size:0.75rem;font-weight:600">' + Number(g.totalsales || g.totalSales || 0) + ' sales</span>' +
          '</li>';
        }).join('') + '</ul>'
      : '<p class="small" style="opacity:.7;margin:0;text-align:center;padding:1rem">No genre data</p>';

    view.innerHTML = `
      <h2 style="margin-bottom:0.5rem">Analytics Dashboard</h2>
      <p style="opacity:0.6;margin-top:0;margin-bottom:1.5rem">Last 30 days performance metrics</p>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1.2rem;margin-bottom:2rem">
        <div class="card" style="padding:1.5rem;background:linear-gradient(135deg,rgba(99,102,241,0.15) 0%,rgba(139,92,246,0.1) 100%);border-left:4px solid var(--accent)">
          <div style="display:flex;justify-content:space-between;align-items:start">
            <div>
              <div class="small" style="opacity:0.7;text-transform:uppercase;font-size:0.75rem;font-weight:600;letter-spacing:0.5px">Completed Revenue</div>
              <div style="font-size:1.6rem;font-weight:700;margin-top:0.5rem">${formatRWF(totalRevenue)}</div>
            </div>
            <span style="font-size:1.8rem">💰</span>
          </div>
        </div>

        <div class="card" style="padding:1.5rem;background:linear-gradient(135deg,rgba(16,185,129,0.15) 0%,rgba(34,197,94,0.1) 100%);border-left:4px solid var(--success)">
          <div style="display:flex;justify-content:space-between;align-items:start">
            <div>
              <div class="small" style="opacity:0.7;text-transform:uppercase;font-size:0.75rem;font-weight:600;letter-spacing:0.5px">Total Orders</div>
              <div style="font-size:1.6rem;font-weight:700;margin-top:0.5rem">${totalOrders}</div>
            </div>
            <span style="font-size:1.8rem">📦</span>
          </div>
        </div>

        <div class="card" style="padding:1.5rem;background:linear-gradient(135deg,rgba(59,130,246,0.15) 0%,rgba(96,165,250,0.1) 100%);border-left:4px solid #3b82f6">
          <div style="display:flex;justify-content:space-between;align-items:start">
            <div>
              <div class="small" style="opacity:0.7;text-transform:uppercase;font-size:0.75rem;font-weight:600;letter-spacing:0.5px">Avg Order Value</div>
              <div style="font-size:1.6rem;font-weight:700;margin-top:0.5rem">${formatRWF(avgOrderValue)}</div>
            </div>
            <span style="font-size:1.8rem">📊</span>
          </div>
        </div>

        <div class="card" style="padding:1.5rem;background:linear-gradient(135deg,rgba(245,158,11,0.15) 0%,rgba(253,224,71,0.1) 100%);border-left:4px solid var(--warning)">
          <div style="display:flex;justify-content:space-between;align-items:start">
            <div>
              <div class="small" style="opacity:0.7;text-transform:uppercase;font-size:0.75rem;font-weight:600;letter-spacing:0.5px">Books Available</div>
              <div style="font-size:1.6rem;font-weight:700;margin-top:0.5rem">${totalBooks}</div>
            </div>
            <span style="font-size:1.8rem">📚</span>
          </div>
        </div>

        <div class="card" style="padding:1.5rem;background:linear-gradient(135deg,rgba(139,92,246,0.15) 0%,rgba(168,85,247,0.1) 100%);border-left:4px solid var(--accent-2)">
          <div style="display:flex;justify-content:space-between;align-items:start">
            <div>
              <div class="small" style="opacity:0.7;text-transform:uppercase;font-size:0.75rem;font-weight:600;letter-spacing:0.5px">Total Users</div>
              <div style="font-size:1.6rem;font-weight:700;margin-top:0.5rem">${allUsers}</div>
            </div>
            <span style="font-size:1.8rem">👥</span>
          </div>
        </div>

        <div class="card" style="padding:1.5rem;background:linear-gradient(135deg,rgba(236,72,153,0.15) 0%,rgba(244,114,182,0.1) 100%);border-left:4px solid #ec4899">
          <div style="display:flex;justify-content:space-between;align-items:start">
            <div>
              <div class="small" style="opacity:0.7;text-transform:uppercase;font-size:0.75rem;font-weight:600;letter-spacing:0.5px">Top Genre</div>
              <div style="font-size:1.3rem;font-weight:700;margin-top:0.5rem">${escapeHtml(topGenre)}</div>
            </div>
            <span style="font-size:1.8rem">🎯</span>
          </div>
        </div>
      </div>

      <div id="analytics-fallback-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:1.2rem;margin-top:1.5rem">
        <div class="card" style="padding:1.5rem;background:var(--bg-soft)">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem">
            <h3 style="margin:0;font-size:1.1rem">🏆 Top Books</h3>
            <span style="background:var(--accent);color:white;padding:0.25rem 0.75rem;border-radius:12px;font-size:0.75rem;font-weight:600">${topBooks.length}</span>
          </div>
          ${topBooksMarkup}
        </div>

        <div class="card" style="padding:1.5rem;background:var(--bg-soft)">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem">
            <h3 style="margin:0;font-size:1.1rem">📈 Sales by Genre</h3>
            <span style="background:var(--accent-2);color:white;padding:0.25rem 0.75rem;border-radius:12px;font-size:0.75rem;font-weight:600">${genreRows.length}</span>
          </div>
          ${genreRowsMarkup}
        </div>
      </div>
    `;

    if (typeof Chart === 'undefined') {
      return;
    }

    // Append chart canvases when Chart.js is available.
    const chartWrap = document.createElement('div');
    chartWrap.style.display = 'grid';
    chartWrap.style.gridTemplateColumns = 'repeat(auto-fit,minmax(340px,1fr))';
    chartWrap.style.gap = '1.2rem';
    chartWrap.style.marginTop = '2rem';
    chartWrap.innerHTML = `
      <div class="card" style="padding:1.5rem"><canvas id="revenue-chart"></canvas></div>
      <div class="card" style="padding:1.5rem"><canvas id="genre-chart"></canvas></div>
      <div class="card" style="padding:1.5rem"><canvas id="top-books-chart"></canvas></div>
    `;
    view.appendChild(chartWrap);

    const revCtx = $id('revenue-chart').getContext('2d');
    if (revenueChart) revenueChart.destroy();
    const revLabels = revenueRows.slice().reverse().map((r) => new Date(r.date).toLocaleDateString('en-US', {month:'short', day:'numeric'}));
    const revData = revenueRows.slice().reverse().map((r) => Number(r.revenue || 0));
    revenueChart = new Chart(revCtx, {
      type: 'line',
      data: {
        labels: revLabels,
        datasets: [{
          label: 'Daily Revenue (RWF)',
          data: revData,
          borderColor: 'var(--accent)',
          backgroundColor: 'rgba(99,102,241,0.08)',
          tension: 0.4,
          fill: true,
          pointRadius: 4,
          pointBackgroundColor: 'var(--accent)',
          pointBorderColor: '#fff',
          pointBorderWidth: 2
        }]
      },
      options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false }, title: { display: true, text: '💹 Revenue Over Time', font: { size: 14, weight: 'bold' } } }, scales: { y: { beginAtZero: true } } }
    });

    const genreCtx = $id('genre-chart').getContext('2d');
    if (genreChart) genreChart.destroy();
    genreChart = new Chart(genreCtx, {
      type: 'doughnut',
      data: {
        labels: genreRows.map((g) => g.genre || 'N/A'),
        datasets: [{
          data: genreRows.map((g) => Number(g.totalsales || g.totalSales || 0)),
          backgroundColor: ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#f87171'],
          borderColor: 'var(--bg)',
          borderWidth: 2
        }]
      },
      options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom' }, title: { display: true, text: '📊 Sales Distribution by Genre', font: { size: 14, weight: 'bold' } } } }
    });

    const booksCtx = $id('top-books-chart').getContext('2d');
    if (booksChart) booksChart.destroy();
    booksChart = new Chart(booksCtx, {
      type: 'bar',
      data: {
        labels: topBooks.map((b) => b.title.substring(0, 15) + (b.title.length > 15 ? '...' : '')),
        datasets: [{
          label: 'Units Sold',
          data: topBooks.map((b) => Number(b.qtySold || 0)),
          backgroundColor: ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'],
          borderRadius: 8,
          borderSkipped: false
        }]
      },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false }, title: { display: true, text: '🏆 Top Selling Books', font: { size: 14, weight: 'bold' } } }, scales: { x: { beginAtZero: true } } }
    });
    } catch (error) {
      console.error('Analytics load error:', error);
      toast('Analytics load error: ' + error.message, 'error');
    }
  }

  // CSV Export
  $id('export-csv').addEventListener('click', ()=>{
    const a = document.createElement('a');
    a.href = '/api/admin/orders.csv';
    a.download = 'booksta_orders.csv';
    document.body.appendChild(a); a.click(); a.remove();
  });

  // Promotions Management
  async function loadPromotions(){
    try {
      const res = await api('/admin/promotions');
      const promos = res.promotions || [];
      $id('promotions-list').innerHTML = promos.map(p=>`<div class='card' style='padding:1.5rem'>
        <div style='display:flex;justify-content:space-between;align-items:start;margin-bottom:1rem'>
          <div>
            <h3 style='margin:0;font-size:1.1rem'>${escapeHtml(p.code)}</h3>
            <p style='margin:0.25rem 0;opacity:0.7;font-size:0.9rem'>${escapeHtml(p.description)}</p>
          </div>
          <span style='background:${p.is_active ? 'rgba(34,197,94,0.2);color:#86efac' : 'rgba(107,114,128,0.2);color:#d1d5db'};padding:0.25rem 0.75rem;border-radius:4px;font-size:0.85rem;font-weight:600'>${p.is_active ? 'Active' : 'Inactive'}</span>
        </div>
        <div style='display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin:1rem 0;font-size:0.9rem'>
          <div><span style='opacity:0.6'>Discount:</span> <strong style='color:#4ecdc4'>${p.discount_type === 'percentage' ? p.discount_value + '%' : formatRWF(p.discount_value)}</strong></div>
          <div><span style='opacity:0.6'>Min Order:</span> <strong>${formatRWF(p.min_order_amount)}</strong></div>
          <div><span style='opacity:0.6'>Uses:</span> <strong>${p.times_used}/${p.max_uses || '∞'}</strong></div>
          <div><span style='opacity:0.6'>Expires:</span> <strong>${new Date(p.expires_at).toLocaleDateString()}</strong></div>
        </div>
        <div style='margin-bottom:1rem;font-size:0.9rem;opacity:0.85'>
          <span style='opacity:0.6'>Scope:</span> <strong>${p.target_user_id ? 'Targeted customer promotion' : 'App-wide promotion'}</strong>
          ${p.target_user_id ? `<div style='margin-top:0.35rem'><span style='opacity:0.6'>Target customer:</span> <strong>${escapeHtml(p.target_user_name || p.target_user_email || 'Not selected')}</strong></div>` : ''}
        </div>
        <div style='display:flex;gap:0.5rem'>
          <button data-admin-action='edit-promo' data-id='${p.id}' class='btn-secondary' style='flex:1;padding:0.5rem;font-size:0.9rem'>Edit</button>
          <button data-admin-action='toggle-promo' data-id='${p.id}' data-active='${!p.is_active}' class='btn-primary' style='flex:1;padding:0.5rem;font-size:0.9rem'>${p.is_active ? 'Deactivate' : 'Activate'}</button>
          <button data-admin-action='delete-promo' data-id='${p.id}' class='btn-danger' style='flex:1;padding:0.5rem;font-size:0.9rem'>Delete</button>
        </div>
      </div>`).join('');
      if(!promos.length) $id('promotions-list').innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:2rem">No promotions yet</div>';
    } catch(e){
      toast('Error loading promotions: ' + e.message, 'error');
    }
  }

  window.editPromo = (id) => openPromoForm(id);
  window.togglePromo = async (id, active) => {
    try {
      await api(`/admin/promotions/${id}`, { method:'PATCH', body: JSON.stringify({ is_active: active }) });
      toast(active ? 'Promotion activated' : 'Promotion deactivated');
      loadPromotions();
    } catch(e){ toast(e.message, 'error'); }
  };
  window.deletePromo = async (id) => {
    if(!confirm('Delete this promotion?')) return;
    try {
      await api(`/admin/promotions/${id}`, { method:'DELETE' });
      toast('Promotion deleted');
      loadPromotions();
    } catch(e){ toast(e.message, 'error'); }
  };

  async function openPromoForm(promoId){
    let promo = { code:'', description:'', discount_type:'percentage', discount_value:10, min_order_amount:5000, max_uses:null, expires_at: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0], is_active:true, target_user_id:'' };
    const [promoRes, usersRes] = await Promise.all([
      promoId ? api(`/admin/promotions/${promoId}`).catch(() => ({ promotion: promo })) : Promise.resolve({ promotion: promo }),
      api('/admin/users').catch(() => ({ users: [] }))
    ]);
    promo = promoRes.promotion || promo;
    const customers = (usersRes.users || []).filter((user) => String(user.role || 'customer') === 'customer');
    const promoScope = promo.target_user_id ? 'customer' : 'app';
    const targetOptions = ['<option value="">Select a customer</option>']
      .concat(customers.map((user) => {
        const label = `${user.buyer_rank ? `#${user.buyer_rank} ` : ''}${user.name || user.email} • ${formatRWF(user.total_spent || 0)} • ${formatNumber(user.completed_orders || 0)} orders`;
        return `<option value="${escapeHtml(user.id)}" ${String(promo.target_user_id || '') === String(user.id) ? 'selected' : ''}>${escapeHtml(label)}</option>`;
      }))
      .join('');

    const modal = $id('modal'); modal.style.display='flex';
    modal.innerHTML = `<div class='modal-panel solid promo-modal'><h3>${promoId?'Edit':'New'} Promotion</h3>
      <div class='form-group'><label>Code *</label><input id='p_code' placeholder='SUMMER20' value='${escapeHtml(promo.code)}'></div>
      <div class='form-group'><label>Description</label><input id='p_desc' placeholder='Summer sale promotion' value='${escapeHtml(promo.description)}'></div>
      <div style='display:grid;grid-template-columns:1fr 1fr;gap:1rem'>
        <div class='form-group'><label>Discount Type</label><select id='p_type'><option value='percentage' ${promo.discount_type==='percentage'?'selected':''}>% Percentage</option><option value='fixed' ${promo.discount_type==='fixed'?'selected':''}>RWF Fixed</option></select></div>
        <div class='form-group'><label>Discount Value</label><input id='p_value' type='number' placeholder='10' value='${promo.discount_value}'></div>
      </div>
      <div class='form-group'>
        <label>Promotion scope</label>
        <select id='p_scope' class='filter-select'>
          <option value='app' ${promoScope === 'app' ? 'selected' : ''}>App-wide promotion</option>
          <option value='customer' ${promoScope === 'customer' ? 'selected' : ''}>Target a customer</option>
        </select>
        <div class='helper-line'>Choose whether this promotion applies to everyone or a specific customer.</div>
      </div>
      <div class='form-group' id='p_target_wrap' style='display:${promoScope === 'customer' ? 'block' : 'none'}'>
        <label>Target customer</label>
        <select id='p_target' class='filter-select'>${targetOptions}</select>
        <div class='helper-line'>This customer will receive the notification and targeted offer.</div>
      </div>
      <div class='form-group'><label>Min Order Amount (RWF)</label><input id='p_min' type='number' placeholder='5000' value='${promo.min_order_amount}'></div>
      <div class='form-group'><label>Max Uses (leave empty for unlimited)</label><input id='p_max' type='number' placeholder='100' value='${promo.max_uses || ''}'></div>
      <div class='form-group'><label>Expires At</label><input id='p_exp' type='date' value='${promo.expires_at.split('T')[0]}'></div>
      <div class='form-group'><label><input id='p_active' type='checkbox' ${promo.is_active?'checked':''} style='margin-right:0.5rem'>Active</label></div>
      <div class='form-actions'>
        <button id='close-modal' class='btn-secondary'>Cancel</button>
        <button id='save-promo' class='btn-primary'>Save Promotion</button>
      </div>
    </div>`;
    $id('p_scope').addEventListener('change', () => {
      const scope = $id('p_scope').value;
      const targetWrap = $id('p_target_wrap');
      const targetControl = $id('p_target');
      if (targetWrap) targetWrap.style.display = scope === 'customer' ? 'block' : 'none';
      if (scope !== 'customer' && targetControl) targetControl.value = '';
    });
    $id('close-modal').addEventListener('click', ()=>{ modal.style.display='none'; modal.innerHTML=''; });
    $id('save-promo').addEventListener('click', async ()=>{
      const code = $id('p_code').value.trim();
      if(!code){ toast('Code is required', 'error'); return; }
      const scope = $id('p_scope').value;
      const payload = {
        code, 
        description: $id('p_desc').value || null,
        discount_type: $id('p_type').value,
        discount_value: parseFloat($id('p_value').value) || 10,
        min_order_amount: parseFloat($id('p_min').value) || 0,
        max_uses: $id('p_max').value ? parseInt($id('p_max').value) : null,
        expires_at: $id('p_exp').value,
        is_active: $id('p_active').checked,
        target_user_id: scope === 'customer' ? ($id('p_target').value || null) : null
      };
      try {
        if(promoId) await api(`/admin/promotions/${promoId}`, { method:'PATCH', body: JSON.stringify(payload)});
        else await api('/admin/promotions', { method:'POST', body: JSON.stringify(payload)});
        modal.style.display='none'; modal.innerHTML='';
        toast(promoId ? 'Promotion updated' : 'Promotion created');
        await loadPromotions();
      } catch(e){ toast(e.message, 'error'); }
    });
  }

  $id('new-promo').addEventListener('click', () => openPromoForm());

  // Settings
  async function loadSettings() {
    try {
      const res = await api('/admin/settings');
      const s = res.settings || {};
      if ($id('s_whatsapp')) $id('s_whatsapp').value = s.whatsappNumber || '';
      if ($id('s_instagram')) $id('s_instagram').value = s.instagramUrl || '';
      if ($id('s_facebook')) $id('s_facebook').value = s.facebookUrl || '';
      if ($id('s_x')) $id('s_x').value = s.xUrl || '';
      if ($id('s_tiktok')) $id('s_tiktok').value = s.tiktokUrl || '';
      if ($id('s_smtp_host')) $id('s_smtp_host').value = s.smtpHost || '';
      if ($id('s_smtp_port')) $id('s_smtp_port').value = s.smtpPort || '587';
      if ($id('s_smtp_secure')) $id('s_smtp_secure').checked = String(s.smtpSecure || '').toLowerCase() === 'true';
      if ($id('s_smtp_user')) $id('s_smtp_user').value = s.smtpUser || '';
      if ($id('s_smtp_from')) $id('s_smtp_from').value = s.smtpFrom || '';
      if ($id('s_client_url')) $id('s_client_url').value = s.clientUrl || '';
      if ($id('s_smtp_pass')) $id('s_smtp_pass').value = '';
      if ($id('admin-current-password')) $id('admin-current-password').value = '';
      if ($id('admin-new-password')) $id('admin-new-password').value = '';
      if ($id('admin-confirm-password')) $id('admin-confirm-password').value = '';
      if ($id('smtp-pass-status')) {
        $id('smtp-pass-status').textContent = s.smtpPassConfigured
          ? 'SMTP password is configured. Leave password blank to keep it unchanged.'
          : 'SMTP password is not configured yet.';
      }
      if ($id('admin-password-status')) {
        $id('admin-password-status').textContent = 'Use this form to update the admin login password.';
      }
    } catch (e) {
      toast('Failed to load settings', 'error');
    }
  }

  $id('settings-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = {
      whatsappNumber: $id('s_whatsapp')?.value?.trim() || '',
      instagramUrl: $id('s_instagram')?.value?.trim() || '',
      facebookUrl: $id('s_facebook')?.value?.trim() || '',
      xUrl: $id('s_x')?.value?.trim() || '',
      tiktokUrl: $id('s_tiktok')?.value?.trim() || '',
      smtpHost: $id('s_smtp_host')?.value?.trim() || '',
      smtpPort: $id('s_smtp_port')?.value?.trim() || '',
      smtpSecure: String(!!$id('s_smtp_secure')?.checked),
      smtpUser: $id('s_smtp_user')?.value?.trim() || '',
      smtpPass: $id('s_smtp_pass')?.value || '',
      smtpFrom: $id('s_smtp_from')?.value?.trim() || '',
      clientUrl: $id('s_client_url')?.value?.trim() || ''
    };
    try {
      await api('/admin/settings', { method: 'PUT', body: JSON.stringify(payload) });
      toast('Settings saved');
      await loadSettings();
    } catch (e) {
      toast(e.message || 'Failed to save settings', 'error');
    }
  });

  $id('admin-password-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const currentPassword = $id('admin-current-password')?.value || '';
    const newPassword = $id('admin-new-password')?.value || '';
    const confirmPassword = $id('admin-confirm-password')?.value || '';

    if (!currentPassword || !newPassword || !confirmPassword) {
      toast('Please fill in all password fields', 'error');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast('New password and confirmation do not match', 'error');
      return;
    }

    try {
      await api('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword })
      });
      if ($id('admin-password-status')) {
        $id('admin-password-status').textContent = 'Admin password updated successfully.';
      }
      toast('Admin password updated');
      $id('admin-current-password').value = '';
      $id('admin-new-password').value = '';
      $id('admin-confirm-password').value = '';
    } catch (e) {
      toast(e.message || 'Failed to update admin password', 'error');
      if ($id('admin-password-status')) {
        $id('admin-password-status').textContent = e.message || 'Failed to update admin password.';
      }
    }
  });

  // Init
  (async () => {
    if (await checkAdmin()) {
      showAdminView(localStorage.getItem(adminViewStorageKey) || 'dashboard');
    }
  })();


})();
