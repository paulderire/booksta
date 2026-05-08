(function(){
  const api = (path, opts={}) => {
    const token = localStorage.getItem('bookstaToken');
    const headers = opts.headers || {};
    if (token) headers['Authorization'] = 'Bearer ' + token;
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    const normalizedPath = path.startsWith('/api/') ? path.slice(4) : path;
    return fetch('/api' + normalizedPath, { ...opts, headers }).then(async (r) => {
      const txt = await r.text();
      try { return JSON.parse(txt); } catch(e){ return txt; }
    });
  };

  function $id(id){return document.getElementById(id)}
  function escapeHtml(s){ if(!s) return ''; return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function formatRWF(amount){
    return new Intl.NumberFormat('rw-RW', { style: 'currency', currency: 'RWF' }).format(amount||0);
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
      document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
      e.target.classList.add('active');
      const view = e.target.dataset.view;
      document.querySelectorAll('.view').forEach(v=>v.style.display = v.id === 'view-'+view ? '' : 'none');
      if(view === 'dashboard') loadDashboard();
      if(view === 'books') loadBooks();
      if(view === 'featured') loadFeatured();
      if(view === 'orders') loadOrders();
      if(view === 'users') loadUsers();
      if(view === 'promotions') loadPromotions();
      if(view === 'reviews') loadReviews();
      if(view === 'analytics') loadAnalytics();
      if(view === 'settings') loadSettings();
    });
  });

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-admin-action]');
    if (!button) return;

    const action = button.dataset.adminAction;
    const id = button.dataset.id;

    if (action === 'edit-book') return openBookForm(id);
    if (action === 'delete-book') return window.delBook(id);
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
    const [statsRes, ordersRes, alertsRes] = await Promise.all([
      api('/admin/stats'),
      api('/admin/orders'),
      api('/admin/inventory-alerts')
    ]);

    // Stats grid
    const grid = $id('stats-grid'); grid.innerHTML = '';
    [
      { label: 'Total Users', value: statsRes.totalUsers, icon: '👥' },
      { label: 'Total Orders', value: statsRes.totalOrders, icon: '📦' },
      { label: 'Total Revenue', value: formatRWF(statsRes.totalRevenue), icon: '💰' }
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
      quick.innerHTML = `<div class="quick-inner"><button id="qa-new-book" class="btn-primary">➕ New Book</button><button id="qa-new-promo" class="btn-secondary">🎉 New Promotion</button><button id="qa-export" class="btn-primary">⬇ Export Orders</button><button id="qa-refresh" class="btn-secondary">🔄 Refresh</button></div>`;
      $id('qa-new-book').addEventListener('click', () => openBookForm(null));
      $id('qa-new-promo').addEventListener('click', () => openPromoForm());
      $id('qa-export').addEventListener('click', ()=>{ document.querySelector('#export-csv')?.click(); });
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
  }

  // Books Management
  async function loadBooks(){
    const res = await api('/books?limit=200');
    const list = $id('books-table'); 
    let html = '<table style="width:100%;border-collapse:collapse"><thead><tr style="border-bottom:1px solid var(--border)"><th style="text-align:left;padding:0.75rem;font-weight:600">Title</th><th style="text-align:left;padding:0.75rem;font-weight:600">Author</th><th style="text-align:left;padding:0.75rem;font-weight:600">Genre</th><th style="text-align:left;padding:0.75rem;font-weight:600">Price</th><th style="text-align:left;padding:0.75rem;font-weight:600">Stock</th><th style="text-align:left;padding:0.75rem;font-weight:600">Featured</th><th style="text-align:left;padding:0.75rem;font-weight:600">Actions</th></tr></thead><tbody>';
    (res.books || []).forEach(b=>{
      html += `<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:0.75rem;font-weight:500">${escapeHtml(b.title)}</td>
        <td style="padding:0.75rem">${escapeHtml(b.author)}</td>
        <td style="padding:0.75rem">${b.genre || 'N/A'}</td>
        <td style="padding:0.75rem">${formatRWF(b.price)}</td>
        <td style="padding:0.75rem"><span style="background:${b.stock < 5 ? 'rgba(239,68,68,0.2);color:#fca5a5' : 'rgba(34,197,94,0.2);color:#86efac'};padding:0.25rem 0.5rem;border-radius:4px;font-size:0.9rem;font-weight:600">${b.stock}</span></td>
        <td style="padding:0.75rem">${b.featured ? '<span style="background:rgba(255,107,107,0.2);color:#fca5a5;padding:0.25rem 0.5rem;border-radius:4px;font-size:0.9rem;font-weight:600">⭐ Yes</span>' : '—'}</td>
        <td style="padding:0.75rem"><button class="btn-secondary" data-admin-action="edit-book" data-id="${b.id}" style="padding:0.5rem 0.75rem;font-size:0.9rem;cursor:pointer">Edit</button> <button class="btn-danger" data-admin-action="delete-book" data-id="${b.id}" style="padding:0.5rem 0.75rem;font-size:0.9rem;cursor:pointer">Delete</button></td>
      </tr>`;
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

  async function openBookForm(bookId){
    let book = { title:'', author:'', price:1000, genre:'', description:'', stock:10, pages: null, year: null, isbn: '', featured: false };
    if(bookId){ const res = await api('/books/'+bookId); book = res.book; }
    const modal = $id('modal'); modal.style.display='flex';
    modal.innerHTML = `<div class='modal-panel solid'><h3>${bookId?'Edit':'New'} Book</h3>
      <div class='form-group'><label>Title *</label><input id='f_title' placeholder='Book title' value='${escapeHtml(book.title)}'></div>
      <div class='form-group'><label>Author *</label><input id='f_author' placeholder='Author name' value='${escapeHtml(book.author)}'></div>
      <div class='form-group'><label>Thumbnail</label>
        <div style="display:flex;gap:0.75rem;align-items:center">
          <input id='f_thumb' type='file' accept='image/*' />
          <img id='f_thumb_preview' src='${book.cover_url||''}' alt='' style='height:54px;display:${book.cover_url ? 'block' : 'none'};border-radius:6px;border:1px solid var(--border);object-fit:cover' />
        </div>
      </div>
      <div class='form-group'><label>Genre</label><input id='f_genre' placeholder='Genre' value='${escapeHtml(book.genre||'')}'></div>
      <div class='form-group'><label>Price (RWF) *</label><input id='f_price' type='number' placeholder='Price' value='${book.price}'></div>
      <div class='form-group'><label>Stock</label><input id='f_stock' type='number' placeholder='Stock quantity' value='${book.stock}'></div>
      <div class='form-group'><label><input id='f_featured' type='checkbox' ${book.featured?'checked':''} style='margin-right:0.5rem'>Featured on hero</label></div>
      <div class='form-group'><label>Description</label><textarea id='f_desc' placeholder='Book description'>${escapeHtml(book.description||'')}</textarea></div>
      <div class='form-group'><label>Pages</label><input id='f_pages' type='number' placeholder='Number of pages' value='${book.pages||''}'></div>
      <div class='form-group'><label>Year</label><input id='f_year' type='number' placeholder='Publication year' value='${book.year||''}'></div>
      <div class='form-group'><label>ISBN</label><input id='f_isbn' placeholder='ISBN' value='${escapeHtml(book.isbn||'')}'></div>
      <div class='form-actions'>
        <button id='close-modal' class='btn-secondary'>Cancel</button>
        <button id='save-book' class='btn-primary'>Save Book</button>
      </div>
    </div>`;

    $id('close-modal').addEventListener('click', ()=>{ modal.style.display='none'; modal.innerHTML=''; });
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
        genre: $id('f_genre').value || null,
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
      modal.style.display='none'; modal.innerHTML='';
      toast(bookId ? 'Book updated' : 'Book created');
      await loadBooks();
    });
  }

  $id('new-book').addEventListener('click', () => openBookForm(null));
  $id('book-search').addEventListener('keyup', (e) => {
    const search = e.target.value.toLowerCase();
    document.querySelectorAll('#books-table tbody tr').forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(search) ? '' : 'none';
    });
  });

  // Featured Books Manager
  async function loadFeatured(){
    const res = await api('/books?limit=200');
    const grid = $id('featured-books-grid'); grid.innerHTML = '';
    (res.books || []).filter(b => b.featured).forEach(b=>{
      const el = document.createElement('div'); el.className='card';
      el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:1rem">
        <div>
          <h3 style="margin:0 0 0.25rem 0">${escapeHtml(b.title)}</h3>
          <div class="small">${escapeHtml(b.author)}</div>
        </div>
        <button class="btn-secondary" data-admin-action="remove-featured" data-id="${b.id}" style="padding:0.5rem;font-size:0.9rem">Remove</button>
      </div>`;
      grid.appendChild(el);
    });
    if (!res.books.some(b => b.featured)) {
      grid.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1">No featured books. Add by clicking Edit on any book.</p>';
    }
  }

  window.toggleFeatured = async (id, featured) => {
    await api('/admin/books/'+id+'/featured', { method:'PATCH', body: JSON.stringify({ featured }) });
    toast(featured ? 'Added to featured' : 'Removed from featured');
    await loadFeatured();
  };

  // Orders Management
  let allOrders = [];
  async function loadOrders(){
    const res = await api('/admin/orders');
    allOrders = res.orders || [];
    renderOrdersTable(allOrders);
  }

  function renderOrdersTable(orders) {
    const list = $id('orders-table'); 
    let html = '<table style="width:100%;border-collapse:collapse"><thead><tr style="border-bottom:1px solid var(--border)"><th style="text-align:left;padding:0.75rem;font-weight:600">Customer</th><th style="text-align:left;padding:0.75rem;font-weight:600">Total</th><th style="text-align:left;padding:0.75rem;font-weight:600">Items</th><th style="text-align:left;padding:0.75rem;font-weight:600">Status</th><th style="text-align:left;padding:0.75rem;font-weight:600">Date</th><th style="text-align:left;padding:0.75rem;font-weight:600">Action</th></tr></thead><tbody>';
    orders.forEach(o=>{
      const statusClass = 'status-' + (o.status || 'pending');
      html += `<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:0.75rem">${escapeHtml(o.user_email)}</td>
        <td style="padding:0.75rem;font-weight:600">${formatRWF(o.total)}</td>
        <td style="padding:0.75rem;color:var(--text-muted)">${(o.items||[]).length} items</td>
        <td style="padding:0.75rem"><span class="order-status-badge ${statusClass}">${o.status || 'pending'}</span></td>
        <td style="padding:0.75rem;color:var(--text-muted);font-size:0.9rem">${new Date(o.created_at).toLocaleDateString()}</td>
        <td style="padding:0.75rem"><select data-admin-action="order-status" data-id="${o.id}" style="padding:0.4rem;border-radius:4px;border:1px solid var(--border);background:var(--glass);color:inherit">
          <option${o.status==='pending'?' selected':''}>pending</option>
          <option${o.status==='processing'?' selected':''}>processing</option>
          <option${o.status==='shipped'?' selected':''}>shipped</option>
          <option${o.status==='completed'?' selected':''}>completed</option>
          <option${o.status==='cancelled'?' selected':''}>cancelled</option>
        </select></td>
      </tr>`;
    });
    html += '</tbody></table>';
    list.innerHTML = html;
  }

  window.updateOrderStatus = async (id, status) => {
    await api('/admin/orders/'+id, { method:'PATCH', body: JSON.stringify({ status }) });
    toast('Status updated to ' + status);
    await loadOrders();
  };

  $id('order-filter').addEventListener('change', (e) => {
    const status = e.target.value;
    renderOrdersTable(status ? allOrders.filter(o => o.status === status) : allOrders);
  });

  $id('order-search').addEventListener('keyup', (e) => {
    const search = e.target.value.toLowerCase();
    renderOrdersTable(allOrders.filter(o => o.user_email.toLowerCase().includes(search)));
  });

  // Users Management
  let allUsers = [];
  async function loadUsers(){
    const res = await api('/admin/users');
    allUsers = res.users || [];
    renderUsersTable(allUsers);
  }

  function renderUsersTable(users) {
    const list = $id('users-table');
    let html = '<table style="width:100%;border-collapse:collapse"><thead><tr style="border-bottom:1px solid var(--border)"><th style="text-align:left;padding:0.75rem;font-weight:600">Name</th><th style="text-align:left;padding:0.75rem;font-weight:600">Email</th><th style="text-align:left;padding:0.75rem;font-weight:600">Role</th><th style="text-align:left;padding:0.75rem;font-weight:600">Joined</th><th style="text-align:left;padding:0.75rem;font-weight:600">Action</th></tr></thead><tbody>';
    users.forEach(u=>{
      html += `<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:0.75rem;font-weight:500">${escapeHtml(u.name)}</td>
        <td style="padding:0.75rem">${escapeHtml(u.email)}</td>
        <td style="padding:0.75rem"><span style="background:${u.role==='admin'?'rgba(99,102,241,0.2);color:#c7d2fe':'rgba(107,114,128,0.2);color:#d1d5db'};padding:0.25rem 0.5rem;border-radius:4px;font-size:0.9rem;font-weight:600">${u.role}</span></td>
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

  $id('user-search').addEventListener('keyup', (e) => {
    const search = e.target.value.toLowerCase();
    renderUsersTable(allUsers.filter(u => u.name.toLowerCase().includes(search) || u.email.toLowerCase().includes(search)));
  });

  // Reviews Moderation
  async function loadReviews(){
    const res = await api('/admin/reviews');
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
    const view = $id('view-analytics');
    const [revRes, genreRes, statsRes] = await Promise.all([
      api('/admin/analytics/revenue'),
      api('/admin/analytics/genres'),
      api('/admin/stats')
    ]);

    const revenueRows = Array.isArray(revRes?.dailyRevenue) ? revRes.dailyRevenue : [];
    const genreRows = Array.isArray(genreRes?.genreSales) ? genreRes.genreSales : [];
    const topBooks = Array.isArray(statsRes?.topBooks) ? statsRes.topBooks.slice(0, 5) : [];

    const totalRevenue = revenueRows.reduce((sum, row) => sum + Number(row.revenue || 0), 0);
    const totalOrders = revenueRows.reduce((sum, row) => sum + Number(row.orders || 0), 0);
    const topGenre = genreRows[0]?.genre || 'N/A';
    const hasAnyData = revenueRows.length || genreRows.length || topBooks.length;

    if (!hasAnyData) {
      view.innerHTML = '<h2>Analytics</h2><div class="card" style="padding:1.5rem;margin-top:1rem">No analytics data available yet. Create some orders and books first.</div>';
      return;
    }

    // Always render useful analytics blocks, even if charts are blocked by CSP.
    view.innerHTML = `
      <h2>Analytics</h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem;margin-top:1rem">
        <div class="card" style="padding:1rem"><div class="small" style="opacity:.7">30-Day Revenue</div><div style="font-size:1.4rem;font-weight:700">${formatRWF(totalRevenue)}</div></div>
        <div class="card" style="padding:1rem"><div class="small" style="opacity:.7">Orders (30 Days)</div><div style="font-size:1.4rem;font-weight:700">${totalOrders}</div></div>
        <div class="card" style="padding:1rem"><div class="small" style="opacity:.7">Top Genre</div><div style="font-size:1.4rem;font-weight:700">${escapeHtml(topGenre || 'N/A')}</div></div>
      </div>

      <div id="analytics-fallback-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:1rem;margin-top:1rem">
        <div class="card" style="padding:1rem">
          <h3 style="margin:0 0 .6rem 0">Top Books</h3>
          ${(topBooks.length ? `<ul style="margin:0;padding-left:1rem">${topBooks.map((b)=>`<li style="margin:.25rem 0">${escapeHtml(b.title)} <strong>(${Number(b.qtySold || 0)})</strong></li>`).join('')}</ul>` : '<p class="small" style="opacity:.7;margin:0">No top books data.</p>')}
        </div>
        <div class="card" style="padding:1rem">
          <h3 style="margin:0 0 .6rem 0">Sales by Genre</h3>
          ${(genreRows.length ? `<ul style="margin:0;padding-left:1rem">${genreRows.slice(0, 6).map((g)=>`<li style="margin:.25rem 0">${escapeHtml(g.genre || 'N/A')} <strong>(${Number(g.totalsales || g.totalSales || 0)})</strong></li>`).join('')}</ul>` : '<p class="small" style="opacity:.7;margin:0">No genre sales data.</p>')}
        </div>
      </div>
    `;

    if (typeof Chart === 'undefined') {
      const fallbackGrid = $id('analytics-fallback-grid');
      if (fallbackGrid) {
        fallbackGrid.insertAdjacentHTML('beforebegin', '<div class="card" style="padding:1rem;margin-top:1rem">Charts are disabled by current security policy, but analytics summaries are available below.</div>');
      }
      return;
    }

    // Append chart canvases when Chart.js is available.
    const chartWrap = document.createElement('div');
    chartWrap.style.display = 'grid';
    chartWrap.style.gridTemplateColumns = 'repeat(auto-fit,minmax(320px,1fr))';
    chartWrap.style.gap = '1rem';
    chartWrap.style.marginTop = '1rem';
    chartWrap.innerHTML = `
      <div class="card" style="padding:1rem"><canvas id="revenue-chart"></canvas></div>
      <div class="card" style="padding:1rem"><canvas id="genre-chart"></canvas></div>
      <div class="card" style="padding:1rem"><canvas id="top-books-chart"></canvas></div>
    `;
    view.appendChild(chartWrap);

    const revCtx = $id('revenue-chart').getContext('2d');
    if (revenueChart) revenueChart.destroy();
    const revLabels = revenueRows.slice().reverse().map((r) => new Date(r.date).toLocaleDateString());
    const revData = revenueRows.slice().reverse().map((r) => Number(r.revenue || 0));
    revenueChart = new Chart(revCtx, {
      type: 'line',
      data: {
        labels: revLabels,
        datasets: [{
          label: 'Daily Revenue (RWF)',
          data: revData,
          borderColor: 'var(--accent)',
          backgroundColor: 'rgba(99,102,241,0.1)',
          tension: 0.4,
          fill: true
        }]
      },
      options: { responsive: true, plugins: { title: { display: true, text: 'Revenue Over Time' } } }
    });

    const genreCtx = $id('genre-chart').getContext('2d');
    if (genreChart) genreChart.destroy();
    genreChart = new Chart(genreCtx, {
      type: 'pie',
      data: {
        labels: genreRows.map((g) => g.genre || 'N/A'),
        datasets: [{
          data: genreRows.map((g) => Number(g.totalsales || g.totalSales || 0)),
          backgroundColor: ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#6c5ce7', '#a29bfe', '#74b9ff', '#fdcb6e']
        }]
      },
      options: { responsive: true, plugins: { title: { display: true, text: 'Sales by Genre' } } }
    });

    const booksCtx = $id('top-books-chart').getContext('2d');
    if (booksChart) booksChart.destroy();
    booksChart = new Chart(booksCtx, {
      type: 'bar',
      data: {
        labels: topBooks.map((b) => b.title),
        datasets: [{
          label: 'Units Sold',
          data: topBooks.map((b) => Number(b.qtySold || 0)),
          backgroundColor: 'var(--accent)'
        }]
      },
      options: { responsive: true, indexAxis: 'y', plugins: { title: { display: true, text: 'Top Selling Books' } } }
    });
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
    let promo = { code:'', description:'', discount_type:'percentage', discount_value:10, min_order_amount:5000, max_uses:null, expires_at: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0], is_active:true };
    if(promoId){
      const res = await api(`/admin/promotions/${promoId}`);
      promo = res.promotion;
    }
    const modal = $id('modal'); modal.style.display='flex';
    modal.innerHTML = `<div class='modal-panel'><h3>${promoId?'Edit':'New'} Promotion</h3>
      <div class='form-group'><label>Code *</label><input id='p_code' placeholder='SUMMER20' value='${escapeHtml(promo.code)}'></div>
      <div class='form-group'><label>Description</label><input id='p_desc' placeholder='Summer sale promotion' value='${escapeHtml(promo.description)}'></div>
      <div style='display:grid;grid-template-columns:1fr 1fr;gap:1rem'>
        <div class='form-group'><label>Discount Type</label><select id='p_type'><option value='percentage' ${promo.discount_type==='percentage'?'selected':''}>% Percentage</option><option value='fixed' ${promo.discount_type==='fixed'?'selected':''}>RWF Fixed</option></select></div>
        <div class='form-group'><label>Discount Value</label><input id='p_value' type='number' placeholder='10' value='${promo.discount_value}'></div>
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
    $id('close-modal').addEventListener('click', ()=>{ modal.style.display='none'; modal.innerHTML=''; });
    $id('save-promo').addEventListener('click', async ()=>{
      const code = $id('p_code').value.trim();
      if(!code){ toast('Code is required', 'error'); return; }
      const payload = {
        code, 
        description: $id('p_desc').value || null,
        discount_type: $id('p_type').value,
        discount_value: parseFloat($id('p_value').value) || 10,
        min_order_amount: parseFloat($id('p_min').value) || 0,
        max_uses: $id('p_max').value ? parseInt($id('p_max').value) : null,
        expires_at: $id('p_exp').value,
        is_active: $id('p_active').checked
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
      tiktokUrl: $id('s_tiktok')?.value?.trim() || ''
    };
    try {
      await api('/admin/settings', { method: 'PUT', body: JSON.stringify(payload) });
      toast('Settings saved');
    } catch (e) {
      toast(e.message || 'Failed to save settings', 'error');
    }
  });

  // Init
  (async () => {
    if (await checkAdmin()) {
      loadDashboard();
    }
  })();


})();
