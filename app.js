// ============================================================
// app.js — جواهر | منطق التطبيق الرئيسي
// ============================================================

import {
    db, ordersRef, logsRef, warehouseRef, returnsRef,
    purchasesRef, defPagesRef, defUsersRef,
    ref, push, onValue, update, remove
} from "./firebase-config.js";

import {
    USERS, STATUS_AR, STATUS_COLORS,
    COLORS_AR, DEFAULT_SIZES, STOCK_ALERT_THRESHOLD
} from "./constants.js";

// ── Expose app globally so inline onclick handlers work ────
window.app = {

    // ── State ────────────────────────────────────────────────
    user: null, role: null, userName: null,
    orders: {}, warehouse: {}, returns: {}, purchases: {},
    pages: [], entryUsers: [],
    charts: {},
    selectedR: new Set(), selectedKb: new Set(),
    modalOrderId: null,
    lastOrderId: null,
    isDark: localStorage.getItem('jwDark') === 'true',
    pSizeRows: [],
    pSizeColors: [],
    pSizeColorHex: [],
    retSelectedOrderId: null,
    itemRows: [],
    logsData: {},
    nimSizeRows: [],

    // ============ LOGIN ============
    login() {
        const u = document.getElementById('loginUser').value.trim().toLowerCase();
        const p = document.getElementById('loginPass').value;
        const ud = USERS[u];
        if (!ud || ud.pass !== p) { this.toast('بيانات الدخول غير صحيحة', 'error'); return; }

        this.user = u; this.role = ud.role; this.userName = ud.name;
        document.getElementById('authScreen').classList.remove('visible');
        document.getElementById('appContainer').style.display = 'block';
        document.getElementById('userName').textContent = ud.name;
        document.getElementById('userRole').textContent = ud.role;
        document.getElementById('userAvatar').textContent = ud.name[0];
        document.getElementById('eDate').value = new Date().toLocaleDateString('en-GB');
        document.getElementById('dashDate').textContent = new Date().toLocaleDateString('ar-JO', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });

        this.applyDark();
        this.applyPermissions();
        this.startListeners();
        this.updateCountry();
        this.toast('مرحباً ' + ud.name, 'success');
    },

    logout() {
        this.user = null;
        document.getElementById('appContainer').style.display = 'none';
        document.getElementById('authScreen').classList.add('visible');
        document.getElementById('loginPass').value = '';
    },

    applyPermissions() {
        const isAdmin = this.role === 'Admin';
        document.querySelectorAll('.admin-only').forEach(el => {
            if (isAdmin) {
                if (el.classList.contains('nav-btn')) el.style.display = 'flex';
                else if (el.classList.contains('dropdown-j')) el.style.display = 'inline-block';
                else el.style.display = '';
            } else {
                el.style.display = 'none';
            }
        });
        if (this.role === 'Delivery') { document.getElementById('rStatus').value = 'done'; this.gotoPage('reports'); }
        else if (this.role === 'User') { this.gotoPage('entry'); }
        else { this.gotoPage('dashboard'); }
    },

    // ============ DARK MODE ============
    toggleDark() {
        this.isDark = !this.isDark;
        localStorage.setItem('jwDark', this.isDark);
        this.applyDark();
        if (document.getElementById('page-dashboard').classList.contains('active')) this.renderDashboard();
    },
    applyDark() {
        document.documentElement.setAttribute('data-theme', this.isDark ? 'dark' : 'light');
        const icon = document.querySelector('#darkBtn i');
        if (icon) icon.className = this.isDark ? 'fas fa-sun' : 'fas fa-moon';
    },

    // ============ NAVIGATION ============
    gotoPage(id) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById('page-' + id)?.classList.add('active');
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === id));

        if (id === 'dashboard') this.renderDashboard();
        if (id === 'entry') this.initItemRows();
        if (id === 'orders') this.renderBoard();
        if (id === 'reports') { this.renderTable(); this.renderStageCards(); }
        if (id === 'warehouse') this.renderWarehouse();
        if (id === 'purchase') this.renderPurchasePage();
        if (id === 'returns') this.renderReturnsList();
        if (id === 'definitions') this.renderDefinitions();
        if (id === 'logs') this.renderLogs();
        this.closeAllDropdowns();
    },

    // ============ FIREBASE LISTENERS ============
    startListeners() {
        onValue(ordersRef, snap => { this.orders = snap.val() || {}; this.updateCurrentPage(); this.updateRItemFilter(); });
        onValue(warehouseRef, snap => { this.warehouse = snap.val() || {}; this.updateItemSelects(); this.updateCurrentPage(); });
        onValue(returnsRef, snap => { this.returns = snap.val() || {}; });
        onValue(purchasesRef, snap => { this.purchases = snap.val() || {}; });
        onValue(defPagesRef, snap => {
            this.pages = snap.val() ? Object.entries(snap.val()).map(([id, v]) => ({ id, name: v.name })) : [];
            this.updatePageSelect(); this.renderDefinitions();
        });
        onValue(defUsersRef, snap => {
            this.entryUsers = snap.val() ? Object.entries(snap.val()).map(([id, v]) => ({ id, name: v.name })) : [];
            this.updateEntryUserSelect(); this.renderDefinitions();
        });
        if (this.role === 'Admin') {
            onValue(logsRef, snap => { this.logsData = snap.val() || {}; });
        }
    },

    updateCurrentPage() {
        const active = document.querySelector('.page.active');
        if (!active) return;
        const id = active.id.replace('page-', '');
        if (id === 'dashboard') this.renderDashboard();
        if (id === 'orders') this.renderBoard();
        if (id === 'reports') { this.renderTable(); this.renderStageCards(); }
        if (id === 'warehouse') this.renderWarehouse();
    },

    // ============ DEFINITIONS ============
    updatePageSelect() {
        const opts = '<option value="">اختر الصفحة</option>' +
            this.pages.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
        ['ePageName', 'pPageName', 'nimPage'].forEach(id => {
            const sel = document.getElementById(id);
            if (sel) sel.innerHTML = opts;
        });
        const rPage = document.getElementById('rPage');
        if (rPage) rPage.innerHTML = '<option value="">كل الصفحات</option>' +
            this.pages.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
    },

    updateEntryUserSelect() {
        const sel = document.getElementById('eEntryUser');
        if (!sel) return;
        sel.innerHTML = this.entryUsers.map(u => `<option value="${u.name}">${u.name}</option>`).join('');
        const me = this.entryUsers.find(u => u.name === this.userName);
        if (me) sel.value = me.name;
    },

    updateItemSelects() {
        const items = Object.entries(this.warehouse);
        const opts = '<option value="">اختر المنتج...</option>' +
            items.map(([id, w]) => `<option value="${id}">${w.name}${w.color ? ' — ' + w.color : ''}</option>`).join('');
        const datalist = document.getElementById('productsList');
        if (datalist) datalist.innerHTML = [...new Set(items.map(([, w]) => w.name))]
            .map(name => `<option value="${name}"></option>`).join('');
        const pSel = document.getElementById('pItem');
        if (pSel) { const cur = pSel.value; pSel.innerHTML = '<option value="">اختر منتجاً موجوداً</option>' + items.map(([id, w]) => `<option value="${id}">${w.name}</option>`).join(''); pSel.value = cur; }
        //document.querySelectorAll('.ir-item').forEach(sel => { const cur = sel.value; sel.innerHTML = opts; if (cur) sel.value = cur; });
    },

    updateRItemFilter() {
        const sel = document.getElementById('rItem');
        if (!sel) return;
        const items = [...new Set(Object.values(this.orders).map(o => o.itemName).filter(Boolean))];
        sel.innerHTML = '<option value="">كل المنتجات</option>' + items.map(n => `<option value="${n}">${n}</option>`).join('');
    },

    async addDef(type, inputId) {
        const name = document.getElementById(inputId).value.trim();
        if (!name) return this.toast('يرجى إدخال الاسم', 'error');
        await push(type === 'pages' ? defPagesRef : defUsersRef, { name });
        document.getElementById(inputId).value = '';
        this.toast('تم الإضافة', 'success');
    },

    async delDef(type, id) {
        if (!confirm('حذف هذا العنصر؟')) return;
        await remove(ref(db, `jawaher_def/${type}/${id}`));
    },

    renderDefinitions() {
        if (this.role !== 'Admin') return;
        const mkItem = (name, type, id) => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:.6rem 0;border-bottom:1px solid var(--border)">
                <span style="font-weight:700;font-size:.9rem">${name}</span>
                <button class="btn-j btn-ruby btn-xs-j" onclick="app.delDef('${type}','${id}')"><i class="fas fa-trash"></i></button>
            </div>`;
        const pg = document.getElementById('pagesList');
        const us = document.getElementById('usersList');
        if (pg) pg.innerHTML = this.pages.map(p => mkItem(p.name, 'pages', p.id)).join('');
        if (us) us.innerHTML = this.entryUsers.map(u => mkItem(u.name, 'entryUsers', u.id)).join('');
    },

    // ============ COUNTRY ============
    updateCountry() { this.checkDuplicate(); },

    checkDuplicate() {
        const mob = document.getElementById('eCustMob')?.value.replace(/\s/g, '') || '';
        const full = '07' + mob;
        const dups = Object.values(this.orders).filter(o => o.custMob === full);
        const warn = document.getElementById('eDupWarn');
        const msg = document.getElementById('eDupMsg');
        if (warn && msg) {
            if (mob.length >= 7 && dups.length > 0) {
                warn.style.display = 'block';
                msg.textContent = `هذا الرقم لديه ${dups.length} طلبات سابقة`;
            } else { warn.style.display = 'none'; }
        }
    },

    // ============ COLOR PICKER ============
    _colorPickerOpen: null,

    openColorPicker(idx, inputId) {
        document.querySelectorAll('.color-picker-popup').forEach(p => p.remove());
        this._colorPickerOpen = null;

        const isMain = idx === 'main';
        let targetId, btnId;
        if (isMain) {
            const idMap = { 'p_color': 'pColor', 'nim_color': 'nimColor', 'asColor': 'asColor' };
            targetId = idMap[inputId] || inputId;
            btnId = `${inputId}_btn_main`;
        } else {
            targetId = `${inputId}_${idx}`;
            btnId = `${inputId}_btn_${idx}`;
        }
        const btn = document.getElementById(btnId) || document.getElementById(targetId);
        if (!btn) return;
        this._colorPickerOpen = targetId;

        const popup = document.createElement('div');
        popup.className = 'color-picker-popup';

        COLORS_AR.forEach(c => {
            const el = document.createElement('div');
            el.title = c.name;
            el.style.cssText = `width:28px;height:28px;border-radius:8px;background:${c.hex};border:2px solid ${c.border};cursor:pointer;transition:transform .15s`;
            el.onclick = () => {
                const target = document.getElementById(targetId);
                if (target) {
                    target.value = c.name;
                    target.dataset.hex = c.hex;
                    target.style.borderRight = `4px solid ${c.hex}`;

                    // تحديثات إضافية بناءً على الحقل
                    if (targetId.startsWith('ir_color_')) {
                        app.filterSizesByColor(target.dataset.idx, c.name);
                    }
                    // سطر جديد: لتحديث رصيد المستودع فور اختيار اللون
                    if (targetId === 'asColor') {
                        const itemId = document.querySelector('[onclick*="confirmAddStock"]')?.getAttribute('onclick').match(/'([^']+)'/)[1];
                        app.updateLiveBalance(itemId);
                    }
                }
                popup.remove();
                this._colorPickerOpen = null;
            };
            popup.appendChild(el);
        });
        // ... بقية كود عرض الـ popup كما هو
        document.body.appendChild(popup);
        const r = btn.getBoundingClientRect();
        popup.style.top = (r.bottom + 6) + 'px';
        popup.style.left = r.left + 'px';
    },

    _colorHex(name) {
        if (!name) return null;
        if (name.startsWith('#')) return name;
        return COLORS_AR.find(c => c.name === name)?.hex || null;
    },

    filterSizesByColor(idx, colorName) {
        const sel = document.querySelector(`.ir-item[data-idx="${idx}"]`);
        const sizeSel = document.querySelector(`.ir-size[data-idx="${idx}"]`);
        const stockInfo = document.querySelector(`.ir-stock[data-idx="${idx}"]`);
        if (!sel || !sizeSel) return;
        const itemId = sel.value;
        const item = this.warehouse[itemId];
        if (!item) return;

        let colorHasStock = false;
        let availableSizesHtml = '<option value="">المقاس</option>';

        Object.entries(item.sizes || {}).forEach(([s, q]) => {
            let vColor = '';
            if (item.variations && item.variations[s]) vColor = item.variations[s].color;
            else if (s.includes(' - ')) vColor = s.split(' - ')[1];
            else vColor = item.color || '';

            if (vColor === colorName) {
                availableSizesHtml += `<option value="${s}" data-qty="${q}">${s} (${q})</option>`;
                if (q > 0) colorHasStock = true;
            }
        });

        if (!colorHasStock) {
            this.toast(`اللون "${colorName}" غير متوفر (ليس له رصيد)`, 'error');
            const cInp = document.getElementById(`ir_color_${idx}`);
            if (cInp) { cInp.value = ''; cInp.style.borderRight = '4px solid var(--border)'; cInp.dataset.hex = ''; }
            this.loadRowSizes(idx);
            return;
        }
        sizeSel.innerHTML = availableSizesHtml;
        if (stockInfo) stockInfo.textContent = '';
        if (sizeSel.options.length === 2) { sizeSel.selectedIndex = 1; sizeSel.onchange(); }
    },

    // ============ ITEM ROWS (multi-product entry) ============
    initItemRows() {
        if (!document.getElementById('eItemsList')) return;
        this.itemRows = [{ id: Date.now() }];
        this.renderItemRows();
    },

    addItemRow() {
        this._saveItemRowsState();
        this.itemRows.push({ id: Date.now() });
        this.renderItemRows();
    },

    removeItemRow(idx) {
        if (this.itemRows.length <= 1) return;
        this._saveItemRowsState();
        this.itemRows.splice(idx, 1);
        this.renderItemRows();
    },

    _saveItemRowsState() {
        this.itemRows.forEach((row, idx) => {
            const itemSel = document.querySelector(`.ir-item[data-idx="${idx}"]`);
            const sizeSel = document.querySelector(`.ir-size[data-idx="${idx}"]`);
            const colorInp = document.getElementById(`ir_color_${idx}`);
            const qtyInp = document.querySelector(`.ir-qty[data-idx="${idx}"]`);
            if (itemSel) row.savedItem = itemSel.value;
            if (sizeSel) row.savedSize = sizeSel.value;
            if (colorInp) { row.savedColor = colorInp.value; row.savedColorHex = colorInp.dataset.hex || ''; }
            if (qtyInp) row.savedQty = qtyInp.value;
        });
    },

    renderItemRows() {
        const container = document.getElementById('eItemsList');
        if (!container) return;
        container.innerHTML = this.itemRows.map((row, idx) => `
            <div class="card-j p-3 mb-2" style="border-right:3px solid var(--gold)" id="itemrow_${idx}">
                <div class="row g-2 align-items-end">
                <div class="col-md-4">
    <label class="form-label-j">المنتج <span style="color:var(--ruby-light)">*</span></label>
    <input type="text" 
           class="form-control-j ir-item" 
           data-idx="${idx}" 
           list="productsList" 
           placeholder="ابحث عن منتج..." 
           oninput="app.loadRowSizes(${idx})" 
           value="${row.savedItem || ''}">
</div>
                  
                    <div class="col-md-2">
                        <label class="form-label-j">اللون</label>
                        <div style="display:flex;gap:4px;align-items:center">
                            <input type="text" id="ir_color_${idx}" class="form-control-j ir-color" data-idx="${idx}"
                                placeholder="اختر..." readonly value="${row.savedColor || ''}"
                                data-hex="${row.savedColorHex || ''}"
                                style="border-right:4px solid ${row.savedColorHex || 'var(--border)'};cursor:pointer;font-size:.82rem"
                                onclick="app.openColorPicker(${idx},'ir_color')">
                            <button id="ir_color_btn_${idx}" class="btn-j btn-ghost btn-xs-j" onclick="app.openColorPicker(${idx},'ir_color')" style="flex-shrink:0;padding:.3rem .5rem">
                                <i class="fas fa-palette" style="color:var(--gold)"></i>
                            </button>
                        </div>
                    </div>
                    <div class="col-md-2">
                        <label class="form-label-j">المقاس <span style="color:var(--ruby-light)">*</span></label>
                        <div class="select-wrapper">
                            <select class="form-control-j select-j ir-size" data-idx="${idx}">
                                <option value="">المقاس</option>
                            </select>
                        </div>
                        <div class="ir-stock" data-idx="${idx}" style="font-size:.72rem;margin-top:2px;color:var(--emerald)"></div>
                    </div>
                    <div class="col-md-2">
                        <label class="form-label-j">الكمية</label>
                        <div class="qty-control">
                            <button class="qty-btn" onclick="app.adjustRowQty(${idx},-1)">−</button>
                            <input type="number" class="form-control-j qty-input ir-qty" data-idx="${idx}" value="${row.savedQty || 1}" min="1">
                            <button class="qty-btn" onclick="app.adjustRowQty(${idx},1)">+</button>
                        </div>
                    </div>
                    <div class="col-md-2 d-flex align-items-end">
                        ${idx > 0 ? `<button class="btn-j btn-ruby btn-sm-j w-100" onclick="app.removeItemRow(${idx})"><i class="fas fa-times"></i> حذف</button>` : '<div></div>'}
                    </div>
                </div>
            </div>
        `).join('');
        this.itemRows.forEach((row, idx) => { if (row.savedItem) this.loadRowSizes(idx, row.savedSize); });
    },

    loadRowSizes(idx, preselectSize) {
        const sel = document.querySelector(`.ir-item[data-idx="${idx}"]`);
        const sizeSel = document.querySelector(`.ir-size[data-idx="${idx}"]`);
        const stockInfo = document.querySelector(`.ir-stock[data-idx="${idx}"]`);
        if (!sel || !sizeSel) return;
        const itemName = sel.value.trim();
        // البحث عن المعرّف (ID) باستخدام الاسم المكتوب في حقل الإدخال
        const foundEntry = Object.entries(this.warehouse).find(([id, w]) => w.name === itemName);
        const itemId = foundEntry ? foundEntry[0] : null;
        const item = foundEntry ? foundEntry[1] : null;
        const pageSel = document.getElementById('ePageName');
        if (item && item.pageName && pageSel) {
            pageSel.value = item.pageName; // يختار الصفحة إذا كانت موجودة في القائمة الأصلية
        }
        sizeSel.innerHTML = '<option value="">المقاس</option>';
        if (!item) return;
        Object.entries(item.sizes || {}).forEach(([s, q]) => {
            sizeSel.innerHTML += `<option value="${s}" data-qty="${q}" ${preselectSize === s ? 'selected' : ''}>${s} (${q})</option>`;
        });
        const showStock = () => {
            const opt = sizeSel.selectedOptions[0];
            const qty = opt?.dataset?.qty || 0;
            if (stockInfo) { stockInfo.textContent = qty > 0 ? `✓ متوفر: ${qty}` : '✗ نفد'; stockInfo.style.color = qty > 0 ? 'var(--emerald)' : 'var(--ruby-light)'; }
            const val = sizeSel.value;
            if (val && item) {
                let vColor = '', vHex = '';
                if (item.variations && item.variations[val]) { vColor = item.variations[val].color; vHex = item.variations[val].hex; }
                else if (val.includes(' - ')) { vColor = val.split(' - ')[1]; vHex = this._colorHex(vColor); }
                const cInp = document.getElementById(`ir_color_${idx}`);
                if (cInp && vColor) { cInp.value = vColor; cInp.dataset.hex = vHex || ''; cInp.style.borderRight = `4px solid ${vHex || 'var(--border)'}`; }
            }
        };
        sizeSel.onchange = showStock;
        if (preselectSize) showStock();
    },

    adjustRowQty(idx, delta) {
        const el = document.querySelector(`.ir-qty[data-idx="${idx}"]`);
        if (el) el.value = Math.max(1, (parseInt(el.value) || 1) + delta);
    },

    // ============ SAVE ORDER ============
    async saveOrder() {
        const custName = document.getElementById('eCustName').value.trim();
        const mob = document.getElementById('eCustMob').value.replace(/\s/g, '');
        const gov = document.getElementById('eGovernorate').value;
        const addr = document.getElementById('eAddr').value.trim();
        const price = parseFloat(document.getElementById('ePrice').value);
        const pageName = document.getElementById('ePageName').value;
        const entryUser = document.getElementById('eEntryUser').value;
        const tags = document.getElementById('eTags').value.trim();
        const weight = document.getElementById('eWeight').value.trim();
        const height = document.getElementById('eHeight').value.trim();

        if (!custName) { this.toast('يرجى إدخال اسم الزبون', 'error'); return; }
        if (mob.length < 7) { this.toast('رقم الموبايل غير صحيح', 'error'); return; }
        if (!addr) { this.toast('يرجى إدخال العنوان', 'error'); return; }
        if (!pageName) { this.toast('اسم الصفحة إجباري', 'error'); return; }
        if (!entryUser) { this.toast('اسم المدخل إجباري', 'error'); return; }
        if (!price || price <= 0) { this.toast('يرجى إدخال السعر', 'error'); return; }

        const items = [];
        const itemSelectors = document.querySelectorAll('.ir-item');
        for (let i = 0; i < itemSelectors.length; i++) {
            const itemNameInput = itemSelectors[i].value;
            const foundEntry = Object.entries(this.warehouse).find(([id, w]) => w.name === itemNameInput);
            const itemId = foundEntry ? foundEntry[0] : null;
            const item = foundEntry ? foundEntry[1] : null;

            // تعريف المتغيرات مرة واحدة فقط
            const sizeCombo = document.querySelector(`.ir-size[data-idx="${i}"]`)?.value;
            const color = document.getElementById(`ir_color_${i}`)?.value || '';
            const qty = parseInt(document.querySelector(`.ir-qty[data-idx="${i}"]`)?.value) || 1;

            // التحقق الصارم من وجود الثلاثي المرح
            if (!itemId || !sizeCombo || !color) {
                this.toast(`يرجى اختيار (المنتج + اللون + المقاس) للصف ${i + 1}`, 'error');
                return;
            }

            // التحقق من الكمية المتوفرة
            const avail = item.sizes?.[sizeCombo] || 0;
            if (qty > avail) {
                this.toast(`الكمية المطلوبة (${qty}) غير متوفرة لـ ${item.name}! المتوفر (${avail})`, 'error');
                return;
            }

            // بناء بيانات الصنف
            let finalSize = sizeCombo;
            let finalColor = color;
            if (sizeCombo.includes(' - ')) {
                finalSize = sizeCombo.split(' - ')[0];
                finalColor = sizeCombo.split(' - ')[1];
            }

            items.push({ itemId, itemName: item.name, itemColor: finalColor, size: finalSize, exactKey: sizeCombo, qty });
        }

        const payload = {
            timestamp: Date.now(), date: document.getElementById('eDate').value,
            custName, custMob: '07' + mob, country: 'الأردن', governorate: gov, custAddr: addr,
            itemId: items[0].itemId, itemName: items[0].itemName, itemColor: items[0].itemColor,
            size: items[0].size, exactKey: items[0].exactKey, qty: items[0].qty,
            items, price, currency: 'JOD', weight, height, pageName, entryUser, tags, status: 'new'
        };

        const newRef = await push(ordersRef, payload);
        this.lastOrderId = newRef.key;
        this.log('create', newRef.key, `إنشاء طلب للزبون: ${custName} | صفحة: ${pageName}`);
        this.toast('تم حفظ الطلب بنجاح ✓', 'success');
        this.resetOrderForm();
        document.getElementById('lastOrderPrintBtn').style.display = 'block';
    },

    resetOrderForm() {
        ['eCustName', 'eCustMob', 'eAddr', 'eTags', 'ePrice', 'eWeight', 'eHeight', 'ePageNameCustom'].forEach(id => {
            const el = document.getElementById(id); if (el) el.value = '';
        });
        const pageSel = document.getElementById('ePageName'); if (pageSel) pageSel.value = '';
        document.getElementById('eDupWarn').style.display = 'none';
        this.initItemRows();
    },

    printLastOrder() {
        if (this.lastOrderId && this.orders[this.lastOrderId])
            this.printOrder(this.orders[this.lastOrderId], this.lastOrderId);
    },

    // ============ DASHBOARD ============
    renderDashboard() {
        const orders = Object.values(this.orders);
        const counts = { new: 0, process: 0, done: 0, delivered: 0, postponed: 0, canceled: 0 };
        let totalRev = 0, totalCost = 0;
        const itemSales = {};
        orders.forEach(o => {
            counts[o.status]++;
            if (o.status === 'delivered') {
                totalRev += parseFloat(o.price || 0);
                const item = this.warehouse[o.itemId];
                if (item) totalCost += parseFloat(item.buyPrice || 0) * (o.qty || 1);
            }
            if (o.status !== 'canceled') itemSales[o.itemName] = (itemSales[o.itemName] || 0) + (o.qty || 1);
        });
        const totalStock = Object.values(this.warehouse).reduce((s, w) => s + Object.values(w.sizes || {}).reduce((a, b) => a + b, 0), 0);

        const kpis = [
            { label: 'إجمالي الطلبات', value: orders.length, icon: 'fa-boxes', cls: 'kpi-gold' },
            { label: 'جديدة', value: counts.new, icon: 'fa-star', cls: 'kpi-sapphire' },
            { label: 'جاهزة للتسليم', value: counts.done, icon: 'fa-box', cls: 'kpi-emerald' },
            { label: 'تم التسليم', value: counts.delivered, icon: 'fa-check-double', cls: 'kpi-amethyst' },
            { label: 'إجمالي الإيرادات', value: totalRev.toFixed(2) + ' JOD', icon: 'fa-money-bill-wave', cls: 'kpi-emerald', small: true },
            { label: 'إجمالي المستودع', value: totalStock + ' قطعة', icon: 'fa-warehouse', cls: 'kpi-onyx' },
        ];
        document.getElementById('kpiGrid').innerHTML = kpis.map(k => `
            <div class="kpi-card ${k.cls}">
                <i class="fas ${k.icon} kpi-icon"></i>
                <div class="kpi-label">${k.label}</div>
                <div class="kpi-value" style="${k.small ? 'font-size:1.3rem' : ''}">${k.value}</div>
            </div>`).join('');

        if (this.charts.status) this.charts.status.destroy();
        const isDark = this.isDark;
        Chart.defaults.color = isDark ? '#aaa' : '#666';
        this.charts.status = new Chart(document.getElementById('statusChart'), {
            type: 'doughnut',
            data: { labels: Object.values(STATUS_AR), datasets: [{ data: Object.values(counts), backgroundColor: Object.values(STATUS_COLORS), borderWidth: 0 }] },
            options: { cutout: '72%', plugins: { legend: { position: 'bottom', labels: { font: { family: 'Almarai' } } } } }
        });

        if (this.charts.items) this.charts.items.destroy();
        const topItems = Object.entries(itemSales).sort((a, b) => b[1] - a[1]).slice(0, 6);
        this.charts.items = new Chart(document.getElementById('itemChart'), {
            type: 'bar',
            data: { labels: topItems.map(i => i[0]), datasets: [{ label: 'المبيعات', data: topItems.map(i => i[1]), backgroundColor: '#C9A84C', borderRadius: 8 }] },
            options: { scales: { x: { grid: { display: false } }, y: { grid: { color: isDark ? '#333' : '#eee' } } }, plugins: { legend: { display: false } } }
        });

        const alerts = [];
        Object.values(this.warehouse).forEach(w => {
            const total = Object.values(w.sizes || {}).reduce((a, b) => a + b, 0);
            if (total < STOCK_ALERT_THRESHOLD) alerts.push({ name: w.name, qty: total, color: w.color });
        });
        const alertsEl = document.getElementById('stockAlerts');
        if (alertsEl) {
            alertsEl.innerHTML = alerts.length === 0
                ? `<div style="color:var(--emerald);font-weight:700;text-align:center;padding:2rem;"><i class="fas fa-check-circle fa-2x mb-2 d-block"></i>المستودع بحالة جيدة</div>`
                : alerts.map(a => `
                    <div class="stock-alert">
                        <i class="fas fa-exclamation-triangle" style="color:var(--ruby-light);font-size:1.3rem;flex-shrink:0"></i>
                        <div><div style="font-weight:800;font-size:.9rem">${a.name}</div>
                        <div style="font-size:.78rem;color:var(--ruby-light)">المتبقي: ${a.qty} قطعة</div></div>
                    </div>`).join('');
        }

        const userRanking = document.getElementById('entryUserRanking');
        if (userRanking) {
            const userCounts = {};
            orders.forEach(o => { if (o.entryUser) userCounts[o.entryUser] = (userCounts[o.entryUser] || 0) + 1; });
            const sorted = Object.entries(userCounts).sort((a, b) => b[1] - a[1]);
            const max = sorted[0]?.[1] || 1;
            const medals = ['🥇', '🥈', '🥉'];
            userRanking.innerHTML = sorted.length === 0
                ? `<div style="color:var(--ink-mid);text-align:center;padding:1rem">لا توجد بيانات بعد</div>`
                : sorted.map(([name, count], i) => `
                    <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.75rem">
                        <span style="font-size:1.3rem;flex-shrink:0;width:28px">${medals[i] || ''}</span>
                        <div style="flex:1">
                            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                                <span style="font-weight:700;font-size:.9rem">${name}</span>
                                <span style="font-weight:800;color:var(--gold)">${count} طلب</span>
                            </div>
                            <div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden">
                                <div style="height:100%;width:${Math.round(count / max * 100)}%;background:linear-gradient(90deg,var(--gold),var(--gold-dark));border-radius:4px"></div>
                            </div>
                        </div>
                    </div>`).join('');
        }
    },

    // ============ ORDERS BOARD ============
    renderBoard() {
        const q = (document.getElementById('ordersSearch')?.value || '').toLowerCase();
        const cols = { new: [], process: [], done: [], delivered: [], postponed: [], canceled: [] };
        const sums = {}; Object.keys(cols).forEach(s => sums[s] = 0);
        Object.entries(this.orders).forEach(([id, o]) => {
            if (q && !JSON.stringify(o).toLowerCase().includes(q)) return;
            if (cols[o.status] !== undefined) { cols[o.status].push({ id, ...o }); sums[o.status] += parseFloat(o.price || 0); }
        });
        document.getElementById('boardContainer').innerHTML = Object.entries(cols).map(([status, orders]) => {
            const allSelected = orders.length > 0 && orders.every(o => this.selectedKb.has(o.id));
            return `
            <div class="kanban-section${status === 'new' ? ' open' : ''}" id="kb-${status}">
                <div class="kanban-header" onclick="app.toggleKb('${status}')">
                    <input type="checkbox" class="check-j me-2" 
                        onclick="event.stopPropagation(); app.toggleKbGroup('${status}', this.checked)" 
                        ${allSelected ? 'checked' : ''} title="تحديد الكل في هذه الحالة">
                    <div class="kanban-dot" style="background:${STATUS_COLORS[status]}"></div>
                    <div class="kanban-title">${STATUS_AR[status]}</div>
                    <div class="kanban-count" style="background:${STATUS_COLORS[status]}15;color:${STATUS_COLORS[status]}">${orders.length}</div>
                    <div class="kanban-sum">${sums[status].toFixed(2)} JOD</div>
                    <i class="fas fa-chevron-left kanban-chevron"></i>
                </div>
                <div class="kanban-body${status === 'new' ? ' open' : ''}">
                    ${orders.length === 0
                    ? `<div style="color:var(--ink-mid);font-size:.85rem;padding:1rem;text-align:center;grid-column:1/-1"><i class="fas fa-inbox" style="font-size:2rem;opacity:.3;display:block;margin-bottom:.5rem"></i>لا توجد طلبات</div>`
                    : orders.map(o => this.mkOrderCard(o)).join('')}
                </div>
            </div>`;
        }).join('');
    },

    toggleKb(status) {
        const sec = document.getElementById('kb-' + status);
        sec.classList.toggle('open');
        sec.querySelector('.kanban-body').classList.toggle('open');
    },
    toggleKbGroup(status, isChecked) {
        Object.entries(this.orders).forEach(([id, o]) => {
            if (o.status === status) {
                if (isChecked) this.selectedKb.add(id);
                else this.selectedKb.delete(id);
            }
        });
        this.renderBoard();
        this.updateKbBulkPanel();
    },
    mkOrderCard(o) {
        const isChecked = this.selectedKb.has(o.id) ? 'checked' : '';
        // إنشاء قائمة الأصناف الصغيرة داخل الكرت
        // جلب الأصناف سواء كانت قائمة جديدة أو صنف واحد قديم لضمان العرض دائماً
        const displayItems = o.items || [{ itemName: o.itemName, size: o.size, itemColor: o.itemColor, qty: o.qty }];
        const itemsSummary = displayItems.map(it => `
        <div style="font-size:.7rem; color:var(--ink-mid); border-bottom:1px dashed var(--border); padding:2px 0;">
            • ${it.itemName || 'صنف'} <span style="color:var(--gold-dark)">(${it.size || '-'})</span> ${it.qty > 1 ? `x${it.qty}` : ''}
        </div>
    `).join('');

        return `<div class="order-card-j status-${o.status}" onclick="app.openOrderModal('${o.id}')">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:.6rem">
            <input type="checkbox" class="check-j" onclick="event.stopPropagation();app.toggleKbSelect('${o.id}')" ${isChecked}>
            <span style="font-size:.72rem;color:var(--ink-mid)">${o.pageName || ''}</span>
        </div>
        <div class="order-card-customer">${o.custName}</div>
        <div class="order-card-meta"><i class="fas fa-phone-alt" style="color:var(--gold);margin-left:4px"></i>${o.custMob}</div>
        
        <!-- عرض قائمة الأصناف الموحد -->
        <div style="margin: 8px 0; max-height: 80px; overflow-y: auto; background: rgba(0,0,0,0.02); padding: 6px; border-radius: 8px; border: 1px solid var(--border);">
            ${itemsSummary}
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:.7rem;padding-top:.7rem;border-top:1px solid var(--border)">
            <span style="font-weight:800; color:var(--emerald)">${o.price || 0} JOD</span>
            <span style="font-size:.72rem;color:var(--ink-mid)">${o.date || ''}</span>
        </div>
    </div>`;
    },

    toggleKbSelect(id) {
        if (this.selectedKb.has(id)) this.selectedKb.delete(id); else this.selectedKb.add(id);
        this.updateKbBulkPanel();
    },
    updateKbBulkPanel() {
        document.getElementById('kbBulkPanel').classList.toggle('show', this.selectedKb.size > 0);
        document.getElementById('kbBulkCount').textContent = this.selectedKb.size;
    },
    async kbBulkStatus(s) {
        const upd = {};
        this.selectedKb.forEach(id => { upd[`jawaher_orders/${id}/status`] = s; if (s === 'delivered') this.deductStock(id); });
        await update(ref(db), upd);
        this.selectedKb.clear(); this.updateKbBulkPanel();
        this.toast('تم تحديث الحالة', 'success');
    },
    kbBulkPrint() { this.executePrint([...this.selectedKb]); this.selectedKb.clear(); this.updateKbBulkPanel(); },

    // ============ ORDER MODAL ============
    openOrderModal(id) {
        this.modalOrderId = id;
        const o = this.orders[id];
        if (!o) return;
        const isRO = this.role !== 'Admin';
        const dis = isRO ? 'disabled' : '';
        const wLink = `https://wa.me/${o.custMob.replace('+', '')}`;

        document.getElementById('orderModalTitle').textContent = `طلب #${id.slice(-6)}`;
        document.getElementById('orderModalContent').innerHTML = `
            <div class="row g-3">
                <div class="col-6"><label class="form-label-j">الزبون</label><input id="mo_name" class="form-control-j" value="${o.custName}" ${dis}></div>
                <div class="col-6"><label class="form-label-j">الموبايل</label>
                    <div style="display:flex;gap:4px">
                        <input id="mo_mob" class="form-control-j" value="${o.custMob}" dir="ltr" style="text-align:left" ${dis}>
                        <a href="${wLink}" target="_blank" class="btn-j btn-emerald btn-sm-j"><i class="fab fa-whatsapp"></i></a>
                    </div>
                </div>
                <div class="col-12"><label class="form-label-j">العنوان</label><input id="mo_addr" class="form-control-j" value="${o.custAddr || ''}" ${dis}></div>
              <!-- قسم عرض الأصناف المتعددة -->
<div class="col-12">
    <label class="form-label-j"><i class="fas fa-shopping-basket"></i> الأصناف المطلوبة</label>
  <div class="items-display-list" style="background: var(--paper-warm); border-radius: 10px; padding: 10px; border: 1px solid var(--border);">
        ${(o.items || [{ itemName: o.itemName, size: o.size, itemColor: o.itemColor, qty: o.qty }]).map(item => `
            <div class="item-row-view" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border);">
                <div style="display: flex; flex-direction: column;">
                    <span style="font-weight: 800; font-size: 0.9rem;">${item.itemName || 'صنف غير معروف'}</span>
                    <span style="font-size: 0.75rem; color: var(--gold-dark);">مقاس: ${item.size || '-'}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 0.8rem; border-right: 4px solid ${this._colorHex(item.itemColor)}; padding-right: 6px;">${item.itemColor || 'بدون لون'}</span>
                    <span style="font-weight: 700; color: var(--emerald); background: rgba(26,107,74,0.1); padding: 2px 8px; border-radius: 5px;">x${item.qty || 1}</span>
                </div>
            </div>
        `).join('')}
    </div>
<!-- السعر الإجمالي يبقى كما هو -->
<div class="col-12 mt-2">
    <label class="form-label-j">إجمالي السعر</label>
    <input type="number" id="mo_price" class="form-control-j" value="${o.price || ''}" ${dis}>
</div>
                <div class="col-6"><label class="form-label-j">الكمية</label><input type="number" id="mo_qty" class="form-control-j" value="${o.qty || 1}" ${dis}></div>
                <div class="col-6"><label class="form-label-j">الملاحظات</label><input id="mo_tags" class="form-control-j" value="${o.tags || ''}" ${dis}></div>
                <div class="col-12">
                    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem;margin-top:.5rem">
                        <div style="text-align:center;background:var(--paper-warm);border-radius:10px;padding:.6rem"><div style="font-size:.7rem;color:var(--ink-mid)">الحالة</div><div style="font-weight:800;font-size:.9rem">${STATUS_AR[o.status] || ''}</div></div>
                        <div style="text-align:center;background:var(--paper-warm);border-radius:10px;padding:.6rem"><div style="font-size:.7rem;color:var(--ink-mid)">المدخل</div><div style="font-weight:800;font-size:.9rem">${o.entryUser || ''}</div></div>
                        <div style="text-align:center;background:var(--paper-warm);border-radius:10px;padding:.6rem"><div style="font-size:.7rem;color:var(--ink-mid)">التاريخ</div><div style="font-weight:800;font-size:.9rem">${o.date || ''}</div></div>
                    </div>
                </div>
                ${this.role === 'Admin' ? `
                <div class="col-12">
                    <label class="form-label-j">نقل إلى مرحلة</label>
                    <div style="display:flex;flex-wrap:wrap;gap:.5rem">
                        ${Object.entries(STATUS_AR).map(([k, v]) => `<button class="btn-j btn-ghost btn-xs-j" onclick="app.moveOrder('${id}','${k}')">${v}</button>`).join('')}
                    </div>
                </div>` : ''}
            </div>`;

        document.getElementById('modalUpdateBtn').style.display = isRO ? 'none' : '';
        document.getElementById('modalDeleteBtn').onclick = () => this.deleteOrder(id);
        document.getElementById('modalPrintBtn').onclick = () => { this.printOrder(o, id); this.closeModal('orderModal'); };
        this.openModal('orderModal');
    },

    async updateOrder() {
        const id = this.modalOrderId;
        if (!id) return;

        try {
            // تحديث البيانات الأساسية فقط لتجنب الأخطاء مع قائمة الأصناف المتعددة
            await update(ref(db, `jawaher_orders/${id}`), {
                custName: document.getElementById('mo_name').value.trim(),
                custMob: document.getElementById('mo_mob').value.trim(),
                custAddr: document.getElementById('mo_addr').value.trim(),
                price: parseFloat(document.getElementById('mo_price').value) || 0,
                qty: parseInt(document.getElementById('mo_qty').value) || 1,
                tags: document.getElementById('mo_tags').value.trim(),
            });

            this.log('edit', id, 'تعديل بيانات الطلب الأساسية');
            this.toast('تم حفظ التعديلات بنجاح ✓', 'success');
            this.closeModal('orderModal');
        } catch (error) {
            console.error("Update Error:", error);
            this.toast('حدث خطأ أثناء التحديث', 'error');
        }
    },
    async moveOrder(id, status) {
        await update(ref(db, `jawaher_orders/${id}`), { status });
        if (status === 'delivered') await this.deductStock(id);
        this.log('status', id, `تغيير الحالة إلى ${STATUS_AR[status]}`);
        this.toast('تم تغيير المرحلة', 'success'); this.closeModal('orderModal');
    },

    async deleteOrder(id) {
        if (!confirm('حذف الطلب نهائياً؟')) return;
        await remove(ref(db, `jawaher_orders/${id}`));
        this.log('delete', id, 'حذف الطلب');
        this.toast('تم الحذف', 'success'); this.closeModal('orderModal');
    },

    // ============ STOCK DEDUCTION ============
    async deductStock(orderId) {
        const o = this.orders[orderId]; if (!o) return;
        const itemsToDeduct = o.items || [{ itemId: o.itemId, size: o.exactKey || o.size, exactKey: o.exactKey, itemColor: o.itemColor, qty: o.qty }];
        const updates = {};
        for (const it of itemsToDeduct) {
            if (!it.itemId) continue;
            const item = this.warehouse[it.itemId]; if (!item) continue;
            let keyToDeduct = it.exactKey || it.size;
            if (item.sizes && item.sizes[keyToDeduct] === undefined && it.itemColor) {
                if (item.sizes[`${it.size} - ${it.itemColor}`] !== undefined) keyToDeduct = `${it.size} - ${it.itemColor}`;
            }
            const current = item.sizes?.[keyToDeduct] || 0;
            const qty = parseInt(it.qty) || 1;
            updates[`jawaher_warehouse/${it.itemId}/sizes/${keyToDeduct}`] = Math.max(0, current - qty);
            this.log('stock', orderId, `خصم ${qty} قطعة من ${item.name} مقاس/لون ${keyToDeduct}`);
        }
        if (Object.keys(updates).length > 0) await update(ref(db), updates);
    },

    // ============ PRINT ============
    printOrder(o, id) {
        const win = window.open('', '_blank');
        const pageLogo = o.pageName || 'جواهر';
        const items = o.items ? o.items : [{ itemName: o.itemName, itemColor: o.itemColor, size: o.size, qty: o.qty, price: o.price }];
        win.document.write(this._buildLabelHTML([{ id, o }]));
        win.document.close();
        setTimeout(() => { win.print(); }, 800);
        update(ref(db, `jawaher_orders/${id}`), { status: 'done' });
        this.deductStock(id);
    },

    executePrint(ids) {
        const win = window.open('', '_blank');
        const updates = {};
        const labels = ids.map(id => ({ id, o: this.orders[id] })).filter(x => x.o);
        win.document.write(this._buildLabelHTML(labels, true));
        win.document.close();
        setTimeout(() => {
            win.print();
            labels.forEach(({ id }) => { updates[`jawaher_orders/${id}/status`] = 'done'; });
            update(ref(db), updates).then(() => { labels.forEach(({ id }) => this.deductStock(id)); });
        }, 800);
        this.toast('تمت الطباعة وتحويل الحالة إلى جاهزة', 'success');
    },

    _buildLabelHTML(labels, multi = false) {
        const pageStyle = `@page { size: 10cm 10cm; margin: 0; }`;
        let barcodeScripts = '';

        let labelsHtml = labels.map(({ id, o }) => {
            let pageNamesSet = new Set();
            if (o.pageName) pageNamesSet.add(o.pageName);

            const orderItems = o.items || [{ itemId: o.itemId }];
            orderItems.forEach(it => {
                const warehouseItem = this.warehouse[it.itemId];
                if (warehouseItem && warehouseItem.pageName) pageNamesSet.add(warehouseItem.pageName);
            });

            const finalPageHeader = pageNamesSet.size > 0 ? Array.from(pageNamesSet).join(' & ') : 'جواهر';
            const items = o.items || [{ itemName: o.itemName, itemColor: o.itemColor, size: o.size, qty: o.qty }];
            const bcId = `bc_${id.slice(-8)}`;
            barcodeScripts += `JsBarcode("#${bcId}", "${id.slice(-12)}", { format:"CODE128", width:1.2, height:18, displayValue:false });`;

            return `
            <div style="width:10cm;height:10cm;padding:4mm;display:block;page-break-after:always;overflow:hidden">
                <div style="width:100%;height:100%;display:flex;flex-direction:column;border:1.5px solid #222;border-radius:4px">
                    <div style="text-align:center;padding:3px 6px;border-bottom:1.5px solid #222;background:#111;color:#C9A84C">
                        <div style="font-size:0.9rem;font-weight:800;letter-spacing:1px;font-family:Almarai,Arial">◆ ${finalPageHeader} ◆</div>
                        <div style="font-size:.6rem;color:#aaa">#${id.slice(-8)} | ${o.date || ''}</div>
                    </div>
                    <div style="flex:1;display:flex;flex-direction:column;padding:3px">
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px;flex:1">
                            <div style="display:flex;flex-direction:column;gap:2px">
                                <div style="background:#f9f9f9;border-radius:3px;padding:2px 5px;border:1px solid #eee"><div style="font-size:.52rem;color:#888">اسم الزبون</div><div style="font-size:1rem;font-weight:800">${o.custName || ''}</div></div>
                                <div style="background:#f9f9f9;border-radius:3px;padding:2px 5px;border:1px solid #eee"><div style="font-size:.52rem;color:#888">المقاسات</div><div style="font-size:.72rem;font-weight:700">${items.map(it => it.size).join('، ') || '-'}</div></div>
                            </div>
                            <div style="display:flex;flex-direction:column;gap:2px">
                                <div style="background:#f9f9f9;border-radius:3px;padding:2px 5px;border:1px solid #eee"><div style="font-size:.52rem;color:#888">رقم الهاتف</div><div style="font-size:.95rem;font-weight:800;direction:ltr;text-align:right">${o.custMob || ''}</div></div>
                                <div style="background:#eef7f2;border-radius:3px;padding:2px 5px;border:1.5px solid #1A6B4A"><div style="font-size:.52rem;color:#1A6B4A">السعر</div><div style="font-size:1.1rem;font-weight:800;color:#1A6B4A">${o.price || 0} JOD</div></div>
                            </div>
                        </div>
                        <div style="background:#fff8e6;border:1px solid #f0d080;border-radius:3px;padding:2px 5px;margin-top:2px">
                            <div style="font-size:.52rem;color:#888">المنتجات</div>
                            <div style="font-size:.7rem;font-weight:700">${items.map(it => `${it.itemName || ''} (${it.itemColor || ''}) ×${it.qty || 1}`).join(' | ')}</div>
                        </div>
                    </div>
                    <div style="text-align:center;padding:2px;border-top:1px solid #eee"><svg id="${bcId}" style="max-width:100%;height:20px !important"></svg></div>
                </div>
            </div>`;
        }).join('');

        return `<!DOCTYPE html><html dir="rtl"><head>
            <meta charset="UTF-8"><title>بوليصة طباعة</title>
            <link href="https://fonts.googleapis.com/css2?family=Almarai:wght@400;700;800&display=swap" rel="stylesheet">
            <script src="https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js"><\/script>
            <style>
                ${pageStyle}
                * { box-sizing: border-box; }
                body { font-family: 'Almarai',Arial; margin:0; padding:0; background:#fff; }
                @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
            </style>
        </head><body>${labelsHtml}<script>${barcodeScripts}<\/script></body></html>`;
    },
    // ============ REPORTS ============
    getFiltered() {
        const q = document.getElementById('rSearch')?.value.toLowerCase() || '';
        const st = document.getElementById('rStatus')?.value || '';
        const it = document.getElementById('rItem')?.value || '';
        const pg = document.getElementById('rPage')?.value || '';
        const fr = document.getElementById('rFrom')?.value || '';
        const to = document.getElementById('rTo')?.value || '';
        return Object.entries(this.orders).filter(([, o]) => {
            if (q && !(o.custName.toLowerCase().includes(q) || o.custMob.includes(q) || id.includes(q))) return false;
            if (st && o.status !== st) return false;
            if (it && o.itemName !== it) return false;
            if (pg && o.pageName !== pg) return false;
            if ((fr || to) && o.date) {
                const [d, m, y] = o.date.split('/');
                const od = new Date(`${y}-${m}-${d}`);
                if (fr && od < new Date(fr)) return false;
                if (to && od > new Date(to)) return false;
            }
            return true;
        }).sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));
    },

    renderStageCards() {
        const filtered = this.getFiltered();
        const counts = { new: 0, process: 0, done: 0, delivered: 0, postponed: 0, canceled: 0 };
        const sums = { new: 0, process: 0, done: 0, delivered: 0, postponed: 0, canceled: 0 };
        filtered.forEach(([, o]) => { counts[o.status]++; sums[o.status] += parseFloat(o.price || 0); });
        document.getElementById('stageCards').innerHTML = Object.entries(STATUS_AR).map(([k, v]) => `
            <div class="col-4 col-md-2">
                <div style="background:var(--glass);border:1px solid ${STATUS_COLORS[k]}25;border-radius:var(--radius-sm);padding:.75rem;text-align:center;border-top:3px solid ${STATUS_COLORS[k]}">
                    <div style="font-size:.75rem;font-weight:700;color:var(--ink-mid)">${v}</div>
                    <div style="font-size:1.5rem;font-weight:800;color:${STATUS_COLORS[k]}">${counts[k]}</div>
                    <div style="font-size:.7rem;color:var(--ink-mid)">${sums[k].toFixed(0)} JOD</div>
                </div>
            </div>`).join('');
    },

    renderTable() {
        this.renderStageCards();
        const filtered = this.getFiltered();
        const isAdmin = this.role === 'Admin';
        const sBadge = k => `<span class="badge-j badge-${k}">${STATUS_AR[k] || k}</span>`;
        const tbody = document.getElementById('reportsTableBody');
        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="13" style="text-align:center;padding:3rem;color:var(--ink-mid)"><i class="fas fa-inbox" style="font-size:2rem;opacity:.3;display:block;margin-bottom:.5rem"></i>لا توجد بيانات</td></tr>`;
            return;
        }
        tbody.innerHTML = filtered.map(([id, o]) => {
            const colorHex = this._colorHex(o.itemColor);
            const colorDot = colorHex ? `<span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${colorHex};border:1px solid rgba(0,0,0,.15);vertical-align:middle;margin-left:4px"></span>` : '';
            const colorText = o.itemColor ? `<span style="font-size:.78rem;color:var(--ink-mid)">${o.itemColor}</span>` : '-';
            return `<tr>
                <td><input type="checkbox" class="check-j r-check" value="${id}" onchange="app.updateRSel()" ${this.selectedR.has(id) ? 'checked' : ''}></td>
                <td style="font-size:.8rem;font-weight:700;color:var(--gold)">${id.slice(-6)}</td>
                <td style="font-weight:700">${o.custName}</td>
                <td dir="ltr" style="text-align:right;font-size:.85rem">${o.custMob}</td>
               <!-- عمود المنتجات -->
<td style="font-size:.75rem; line-height:1.4; min-width:120px">
    ${(o.items || [{ itemName: o.itemName }]).map(it => `<div>• ${it.itemName || '-'}</div>`).join('')}
</td>

<!-- عمود الألوان مع النقطة الملونة لكل صنف -->
<td style="font-size:.75rem; line-height:1.4">
    ${(o.items || [{ itemColor: o.itemColor }]).map(it => {
                const hex = this._colorHex(it.itemColor);
                return `<div>${hex ? `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${hex};border:1px solid rgba(0,0,0,0.1);vertical-align:middle;margin-left:4px"></span>` : ''}${it.itemColor || '-'}</div>`;
            }).join('')}
</td>

<!-- عمود المقاسات -->
<td style="font-size:.75rem; line-height:1.4">
    ${(o.items || [{ size: o.size }]).map(it => `<div>${it.size || '-'}</div>`).join('')}
</td>

<!-- عمود إجمالي الكمية -->
<td style="text-align:center; font-weight:700">
    ${(o.items || [{ qty: o.qty }]).reduce((sum, it) => sum + (parseInt(it.qty) || 1), 0)}
</td>
                <td style="font-weight:700;color:var(--emerald)">${o.price || 0} ${o.currency || 'JOD'}</td>
                <td style="font-size:.8rem;color:var(--ink-mid)">${o.pageName || '-'}</td>
                <td>${sBadge(o.status)}</td>
                <td style="font-size:.8rem" dir="ltr">${o.date || ''}</td>
                <td>
                    <div style="display:flex;gap:4px">
                        <button class="btn-j btn-gold btn-xs-j" onclick="app.openOrderModal('${id}')"><i class="fas fa-eye"></i></button>
                        ${isAdmin ? `<button class="btn-j btn-ruby btn-xs-j" onclick="app.deleteOrder('${id}')"><i class="fas fa-trash"></i></button>` : ''}
                    </div>
                </td>
            </tr>`;
        }).join('');
        document.getElementById('selectAllR').checked = filtered.length > 0 && this.selectedR.size === filtered.length;
    },

    toggleSelectAll() {
        const checked = document.getElementById('selectAllR').checked;
        this.getFiltered().forEach(([id]) => { checked ? this.selectedR.add(id) : this.selectedR.delete(id); });
        document.querySelectorAll('.r-check').forEach(cb => cb.checked = checked);
        this.updateRBulkPanel();
    },
    updateRSel() {
        document.querySelectorAll('.r-check').forEach(cb => { cb.checked ? this.selectedR.add(cb.value) : this.selectedR.delete(cb.value); });
        this.updateRBulkPanel();
    },
    updateRBulkPanel() {
        document.getElementById('rBulkPanel').classList.toggle('show', this.selectedR.size > 0);
        document.getElementById('rBulkCount').textContent = this.selectedR.size;
    },
    async rBulkStatus(s) {
        const upd = {};
        this.selectedR.forEach(id => { upd[`jawaher_orders/${id}/status`] = s; if (s === 'delivered') this.deductStock(id); });
        await update(ref(db), upd);
        this.selectedR.clear(); this.updateRBulkPanel(); this.renderTable();
        this.toast('تم التحديث', 'success');
    },
    rBulkPrint() { this.executePrint([...this.selectedR]); this.selectedR.clear(); this.updateRBulkPanel(); },
    async rBulkDelete() {
        if (!confirm(`حذف ${this.selectedR.size} طلبات؟`)) return;
        const upd = {};
        this.selectedR.forEach(id => { upd[`jawaher_orders/${id}`] = null; this.log('delete', id, 'حذف جماعي'); });
        await update(ref(db), upd);
        this.selectedR.clear(); this.updateRBulkPanel(); this.renderTable();
        this.toast('تم الحذف', 'success');
    },
    resetReportFilters() {
        ['rSearch', 'rStatus', 'rItem', 'rPage', 'rFrom', 'rTo'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        this.renderTable();
    },
    exportExcel() {
        const rows = this.getFiltered().map(([id, o]) => ({
            'رقم الطلب': id, 'الزبون': o.custName, 'الموبايل': o.custMob,
            'الدولة': o.country || '', 'المحافظة': o.governorate || '', 'العنوان': o.custAddr || '',
            'المنتج': o.itemName || '', 'المقاس': o.size || '', 'الكمية': o.qty || 1,
            'السعر': o.price, 'العملة': o.currency || 'JOD', 'الحالة': STATUS_AR[o.status] || o.status,
            'الصفحة': o.pageName || '', 'ملاحظات': o.tags || '', 'المدخل': o.entryUser || '', 'التاريخ': o.date || ''
        }));
        if (!rows.length) { this.toast('لا يوجد بيانات', 'warning'); return; }
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Orders');
        XLSX.writeFile(wb, `Jawaher_${Date.now()}.xlsx`);
        this.toast('تم التصدير', 'success');
    },

    // ============ WAREHOUSE ============
    scanWarehouseBarcode() {
        const code = document.getElementById('wBarcodeScanner').value.trim().toUpperCase();
        if (!code) { this.renderWarehouse(); return; }
        const items = Object.entries(this.warehouse).filter(([, w]) => {
            if (w.name.toLowerCase().includes(code.toLowerCase())) return true;
            if (w.barcode && w.barcode.toUpperCase().includes(code)) return true;
            if (w.variations) return Object.values(w.variations).some(v => v.barcode && v.barcode.toUpperCase().includes(code));
            return false;
        });
        if (items.length === 0) {
            document.getElementById('warehouseGrid').innerHTML = `<div class="col-12" style="text-align:center;padding:2rem;color:var(--ink-mid)">
                <i class="fas fa-search fa-2x" style="opacity:.2;display:block;margin-bottom:1rem"></i>لم يتم العثور على منتج
                <br><button class="btn-j btn-gold btn-sm-j mt-3" onclick="app.openNewItemModal()"><i class="fas fa-plus"></i> إضافة كمنتج جديد</button></div>`;
            return;
        }
        this._renderItemCards(items);
    },

    openNewItemModal() {
        this.nimSizeRows = DEFAULT_SIZES.map(s => ({ size: s }));
        this.renderNimSizesGrid();
        ['nimName', 'nimPage', 'nimBuyPrice', 'nimSellPrice'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        this.openModal('newItemModal');
    },

    _saveNimSizeRows() {
        if (!this.nimSizeRows) return;
        this.nimSizeRows.forEach((row, i) => {
            const sInp = document.querySelector(`#nimsr_${i} .nim-s-val`);
            const cInp = document.getElementById(`nim_color_${i}`);
            const bInp = document.querySelector(`#nimsr_${i} .nim-b-val`);
            if (sInp) row.size = sInp.value;
            if (cInp) { row.color = cInp.value; row.hex = cInp.dataset.hex; }
            if (bInp) row.barcode = bInp.value;
        });
    },

    renderNimSizesGrid() {
        const grid = document.getElementById('nimSizesGrid'); if (!grid) return;
        grid.innerHTML = (this.nimSizeRows || []).map((row, i) => {
            const s = row.size || ''; const c = row.color || ''; const hex = row.hex || ''; const b = row.barcode || '';
            return `<div class="col-12 nim-size-row" id="nimsr_${i}">
                <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;background:var(--paper);padding:8px;border-radius:8px;border:1px solid var(--border);margin-bottom:4px">
                    <input type="text"   class="form-control-j nim-s-val" style="width:60px;text-align:center;font-weight:700" placeholder="مقاس" value="${s}">
                    <input type="text"   id="nim_color_${i}" class="form-control-j nim-c-val" placeholder="اللون" readonly
                        style="width:80px;cursor:pointer;font-size:.8rem;border-right:4px solid ${hex || 'var(--border)'}"
                        value="${c}" data-hex="${hex}" onclick="app.openColorPicker(${i},'nim_color')">
                    <input type="text"   class="form-control-j nim-b-val" placeholder="باركود (اختياري)" value="${b}" style="flex:1;min-width:100px;font-size:.85rem;font-family:monospace" dir="ltr">
                    <input type="number" class="form-control-j nim-q-val" placeholder="كمية" min="0" value="0" style="width:65px">
                    <button class="btn-j btn-ruby btn-xs-j" onclick="app.removeNimSizeRow(${i})" style="flex-shrink:0;padding:.3rem .5rem"><i class="fas fa-times"></i></button>
                </div>
            </div>`;
        }).join('');
    },

    addNimSizeRow() {
        if (!this.nimSizeRows) this.nimSizeRows = [];
        this._saveNimSizeRows();
        this.nimSizeRows.push({ size: '' });
        this.renderNimSizesGrid();
    },
    removeNimSizeRow(i) {
        this._saveNimSizeRows(); this.nimSizeRows.splice(i, 1); this.renderNimSizesGrid();
    },

    async saveNewItem() {
        const name = document.getElementById('nimName').value.trim();
        if (!name) { this.toast('يرجى إدخال اسم المنتج', 'error'); return; }
        const buyPrice = parseFloat(document.getElementById('nimBuyPrice').value) || 0;
        const sellPrice = parseFloat(document.getElementById('nimSellPrice').value) || 0;
        const pageName = document.getElementById('nimPage').value.trim();
        const sizes = {}; const variations = {};

        for (const row of document.querySelectorAll('.nim-size-row')) {
            const sz = row.querySelector('.nim-s-val')?.value.trim() || '';
            const c = row.querySelector('.nim-c-val')?.value.trim() || '';
            const hex = row.querySelector('.nim-c-val')?.dataset?.hex || '';
            let b = row.querySelector('.nim-b-val')?.value.trim().toUpperCase() || '';
            const qty = parseInt(row.querySelector('.nim-q-val')?.value) || 0;
            if (sz && !c) {
                this.toast(`المقاس ${sz} يحتاج لتحديد لون!`, 'error');
                return;
            }
            if (!sz) continue;
            if (!b) b = 'JW' + Math.random().toString(36).substr(2, 6).toUpperCase();
            const existing = Object.values(this.warehouse).find(w => w.barcode === b || (w.variations && Object.values(w.variations).some(v => v.barcode === b)));
            if (existing) { this.toast(`الباركود ${b} مستخدم مسبقاً`, 'error'); return; }
            const key = c ? `${sz} - ${c}` : sz;
            sizes[key] = (sizes[key] || 0) + qty;
            variations[key] = { size: sz, color: c, hex, barcode: b };
        }
        if (Object.keys(sizes).length === 0) { this.toast('يرجى إدخال مقاس واحد على الأقل', 'error'); return; }

        const newRef = await push(warehouseRef, { name, buyPrice, sellPrice, pageName, sizes, variations, createdAt: Date.now() });
        const totalQty = Object.values(sizes).reduce((a, b) => a + b, 0);
        if (totalQty > 0) await push(purchasesRef, { timestamp: Date.now(), date: new Date().toLocaleDateString('en-GB'), itemId: newRef.key, itemName: name, sizes, buyPrice, pageName, notes: 'إدخال أولي', user: this.userName });
        this.log('create_item', newRef.key, `إضافة منتج: ${name}`);
        this.toast(`تم إضافة "${name}" للمستودع ✓`, 'success');
        this.closeModal('newItemModal');
    },

    resetWarehouseFilters() {
        ['wSearch', 'wColorFilter', 'wPageFilter', 'wStockFilter'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        this.renderWarehouse();
    },

    renderWarehouse() {
        const q = document.getElementById('wSearch')?.value.toLowerCase() || '';
        const colorF = document.getElementById('wColorFilter')?.value || '';
        const pageF = document.getElementById('wPageFilter')?.value || '';
        const stockF = document.getElementById('wStockFilter')?.value || '';
        let items = Object.entries(this.warehouse);

        const wColorSel = document.getElementById('wColorFilter');
        if (wColorSel) { const cur = wColorSel.value; const colors = [...new Set(items.map(([, w]) => w.color).filter(Boolean))].sort(); wColorSel.innerHTML = '<option value="">كل الألوان</option>' + colors.map(c => `<option value="${c}" ${cur === c ? 'selected' : ''}>${c}</option>`).join(''); }
        const wPageSel = document.getElementById('wPageFilter');
        if (wPageSel) { const cur = wPageSel.value; const pages = [...new Set(items.map(([, w]) => w.pageName).filter(Boolean))].sort(); wPageSel.innerHTML = '<option value="">كل الصفحات</option>' + pages.map(p => `<option value="${p}" ${cur === p ? 'selected' : ''}>${p}</option>`).join(''); }

        items = items.filter(([, w]) => {
            if (q && !w.name.toLowerCase().includes(q) && !(w.barcode || '').toLowerCase().includes(q)) return false;
            if (colorF && w.color !== colorF) return false;
            if (pageF && w.pageName !== pageF) return false;
            const total = Object.values(w.sizes || {}).reduce((a, b) => a + b, 0);
            if (stockF === 'low' && total >= 5) return false;
            if (stockF === 'zero' && total > 0) return false;
            if (stockF === 'ok' && total < 5) return false;
            return true;
        });
        this._renderItemCards(items);
    },

    _renderItemCards(items) {
        const grid = document.getElementById('warehouseGrid'); if (!grid) return;
        if (items.length === 0) {
            grid.innerHTML = `<div class="col-12" style="text-align:center;padding:3rem;color:var(--ink-mid)">
                <i class="fas fa-warehouse fa-3x" style="opacity:.2;display:block;margin-bottom:1rem"></i>المستودع فارغ
                <br><button class="btn-j btn-gold btn-sm-j mt-3" onclick="app.openNewItemModal()"><i class="fas fa-plus"></i> إضافة منتج جديد</button></div>`;
            return;
        }
        grid.innerHTML = items.map(([id, w]) => {
            const sizes = Object.entries(w.sizes || {});
            const total = sizes.reduce((s, [, q]) => s + q, 0);
            const fillCls = total > 10 ? 'qty-high' : total > 3 ? 'qty-med' : 'qty-low';
            const mainColorHex = this._colorHex(w.color);
            const colorBorder = mainColorHex || 'var(--gold)';
            return `<div class="col-12 col-sm-6 col-lg-4 col-xl-3">
                <div class="item-card" style="border-top:4px solid ${colorBorder}">
                    <div class="item-card-header">
                        <div style="display:flex;justify-content:space-between;align-items:flex-start">
                            <div>
                                <div class="item-card-name">${w.name}</div>
                                <div class="item-card-code" style="opacity:.7;font-size:.7rem">المعرف: ${id.slice(-8).toUpperCase()}</div>
                            </div>
                            ${total <= 3 ? `<span style="background:rgba(192,37,86,.25);color:#ffaaaa;font-size:.7rem;font-weight:800;padding:2px 8px;border-radius:20px">⚠ منخفض</span>` : ''}
                        </div>
                        ${w.pageName ? `<div style="font-size:.72rem;color:rgba(255,255,255,.5);margin-top:4px"><i class="fas fa-file-alt me-1"></i>${w.pageName}</div>` : ''}
                    </div>
                    <div class="item-card-body">
                        <div class="item-qty-row">
                            <span class="item-qty-label">إجمالي المخزون</span>
                            <span class="item-qty-value">${total} <small style="font-size:.8rem;font-weight:400;color:var(--ink-mid)">قطعة</small></span>
                        </div>
                        <div class="item-qty-bar"><div class="item-qty-fill ${fillCls}" style="width:${Math.min(total > 0 ? Math.round(total / Math.max(total, 20) * 100) : 0, 100)}%"></div></div>
                        ${w.buyPrice ? `<div style="font-size:.75rem;color:var(--ink-mid);margin-bottom:.5rem">شراء: <strong>${w.buyPrice} JOD</strong>${w.sellPrice ? ' | بيع: <strong>' + w.sellPrice + ' JOD</strong>' : ''}</div>` : ''}
                        <div class="item-sizes mb-3">
                            ${sizes.length === 0 ? `<span style="color:var(--ink-mid);font-size:.8rem">لا توجد مقاسات</span>` : sizes.map(([s, q]) => {
                const v = w.variations ? w.variations[s] : null;
                const vCode = v && v.barcode ? v.barcode : (w.barcode || id.slice(-8)).toUpperCase();
                const vHex = v && v.hex ? v.hex : null;
                // جلب اللون سواء من التنويعات أو من لون المنتج الأساسي
                const vColor = (v && v.color) ? v.color : (w.color || '');
                return `<div style="background:rgba(0,0,0,.02);border:1px solid var(--border);padding:6px;border-radius:8px;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center;width:100%">
    <div>
        <span style="font-weight:700;font-size:.85rem">${s} ${vColor ? ' - ' + vColor : ''}</span>: 
        <strong style="${q === 0 ? 'color:var(--ruby)' : ''}">${q}</strong> قطعة
    </div>
                                    <div style="font-size:.7rem;font-family:monospace;background:var(--paper);padding:4px 6px;border-radius:4px;border:1px solid var(--border);cursor:pointer" onclick="app.showBarcode('${vCode}','${w.name} - ${s}')" title="طباعة الباركود">
                                        <i class="fas fa-barcode" style="color:var(--gold)"></i> ${vCode}
                                    </div>
                                </div>`;
            }).join('')}
                        </div>
                        <div style="display:flex;gap:.4rem;flex-wrap:wrap">
                            <button class="btn-j btn-gold btn-xs-j" style="flex:1" onclick="app.openAddStockModal('${id}')"><i class="fas fa-plus"></i> إضافة كمية</button>
                            <button class="btn-j btn-ruby btn-xs-j" onclick="app.deleteItem('${id}')" title="حذف"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                </div>
            </div>`;
        }).join('');
    },

    openAddStockModal(itemId) {
        const item = this.warehouse[itemId]; if (!item) return;
        const sizes = Object.keys(item.sizes || {});
        const modal = document.createElement('div');
        modal.className = 'modal-j open'; modal.id = 'addStockModal';
        modal.innerHTML = `<div class="modal-overlay" onclick="this.parentElement.remove()"></div>
            <div class="modal-sheet" style="max-width:400px">
                <div class="modal-handle"></div>
                <div class="modal-title"><i class="fas fa-plus-circle" style="color:var(--gold)"></i> تعديل كمية — ${item.name}</div>
                <div class="row g-3">
                    <div class="col-12">
                        <label class="form-label-j">اللون <span style="color:var(--ruby-light)">*</span></label>
                        <div style="display:flex;gap:4px;align-items:center">
                            <input type="text" id="asColor" class="form-control-j" placeholder="اختر اللون..." readonly
                                style="cursor:pointer;font-size:.82rem;border-right:4px solid var(--border)"
                                onclick="app.openColorPicker('main','asColor')">
                            <button class="btn-j btn-ghost btn-xs-j" onclick="app.openColorPicker('main','asColor')">
                                <i class="fas fa-palette" style="color:var(--gold)"></i>
                            </button>
                        </div>
                    </div>
                    <div class="col-12">
                        <label class="form-label-j">المقاس <span style="color:var(--ruby-light)">*</span></label>
                        <div style="display:flex;gap:6px">
                            <div class="select-wrapper" style="flex:1">
                                <select id="asSize" class="form-control-j select-j" onchange="app.updateLiveBalance('${itemId}')">
                                    <option value="">اختر المقاس...</option>
                                    ${sizes.map(s => `<option value="${s}">${s}</option>`).join('')}
                                </select>
                            </div>
                            <input type="text" id="asNewSize" class="form-control-j" placeholder="أو جديد" style="width:80px">
                        </div>
                    </div>
                    <div id="asLiveBalance" style="font-size: .8rem; font-weight: 700; color: var(--gold); text-align: center; padding: 8px; background: var(--paper-warm); border-radius: 8px; display: none; border: 1px dashed var(--gold)"></div>
                    <div class="col-12">
                        <label class="form-label-j">الكمية (موجب للاضافة / سالب للخصم)</label>
                        <div class="qty-control">
                            <button class="qty-btn" onclick="app.adjustQty('asQty',-1)">−</button>
                            <input type="number" id="asQty" class="form-control-j qty-input" value="1">
                            <button class="qty-btn" onclick="app.adjustQty('asQty',1)">+</button>
                        </div>
                    </div>
                    <div class="col-12">
                        <label class="form-label-j">سبب التعديل</label>
                        <select id="asReason" class="form-control-j select-j">
                            <option value="مشتريات جديدة">مشتريات جديدة</option>
                            <option value="تصحيح جرد">تصحيح جرد</option>
                            <option value="مرتجع من زبون">مرتجع من زبون</option>
                        </select>
                    </div>
                </div>
                <div class="d-flex gap-3 mt-4">
                    <button class="btn-j btn-gold flex-fill" onclick="app.confirmAddStock('${itemId}')"><i class="fas fa-save"></i> حفظ التعديل</button>
                    <button class="btn-j btn-ghost" onclick="document.getElementById('addStockModal').remove()">إلغاء</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
    },
    updateLiveBalance(itemId) {
        const item = this.warehouse[itemId];
        const color = document.getElementById('asColor').value;
        const size = document.getElementById('asSize').value;
        const liveEl = document.getElementById('asLiveBalance');

        if (item && color && size) {
            const key = `${size} - ${color}`;
            const current = item.sizes?.[key] || item.sizes?.[size] || 0;
            liveEl.textContent = `الرصيد الحالي لهذا اللون والمقاس: ${current}`;
            liveEl.style.display = 'block';
        } else {
            liveEl.style.display = 'none';
        }
    },
    async confirmAddStock(itemId) {
        const item = this.warehouse[itemId]; if (!item) return;
        const color = document.getElementById('asColor').value.trim();
        const newSize = document.getElementById('asNewSize').value.trim();
        const exSize = document.getElementById('asSize').value;
        const size = newSize || exSize;
        const qty = parseInt(document.getElementById('asQty').value) || 0;
        const reason = document.getElementById('asReason')?.value || 'تصحيح جرد';

        // التحقق من الحقول الإجبارية
        if (!color || !size) {
            this.toast('خطأ: يجب تحديد اللون والمقاس معاً لتحديث المخزون', 'error');
            return;
        }
        if (!color) { this.toast('يرجى تحديد اللون أولاً', 'error'); return; }
        if (!size) { this.toast('يرجى تحديد المقاس', 'error'); return; }
        if (qty === 0) { this.toast('يرجى إدخال كمية صحيحة', 'error'); return; }

        // بناء المفتاح الموحد (المقاس - اللون)
        const key = `${size} - ${color}`;
        const current = item.sizes?.[key] || 0;
        const finalQty = current + qty;

        if (finalQty < 0) {
            if (!confirm('الكمية الناتجة ستكون بالسالب، هل أنت متأكد من صحة الجرد؟')) return;
        }

        const updates = {};
        updates[`jawaher_warehouse/${itemId}/sizes/${key}`] = finalQty;

        // تحديث معلومات الـ variations لضمان ظهور اللون والباركود مستقبلاً لهذا الصنف الجديد
        if (!item.sizes?.[key]) {
            const vHex = document.getElementById('asColor').dataset.hex || '';
            const vBarcode = 'JW' + Math.random().toString(36).substr(2, 6).toUpperCase();
            updates[`jawaher_warehouse/${itemId}/variations/${key}`] = { size, color, hex: vHex, barcode: vBarcode };
        }

        await update(ref(db), updates);

        this.log('stock_adjust', itemId, `تعديل مخزون: ${qty} قطعة (اللون: ${color} | المقاس: ${size}) - السبب: ${reason}`);
        this.toast(`تم تحديث المخزون بنجاح ✓`, 'success');
        document.getElementById('addStockModal')?.remove();
    },

    async deleteItem(itemId) {
        const item = this.warehouse[itemId];
        if (!confirm(`حذف المنتج "${item?.name}" نهائياً؟`)) return;
        await remove(ref(db, `jawaher_warehouse/${itemId}`));
        this.log('delete_item', itemId, `حذف المنتج: ${item?.name}`);
        this.toast('تم حذف المنتج', 'success');
    },

    showBarcode(code, name) {
        const modal = document.createElement('div');
        modal.className = 'modal-j open';
        modal.innerHTML = `<div class="modal-overlay" onclick="this.parentElement.remove()"></div>
            <div class="modal-sheet" style="max-width:400px;text-align:center">
                <div class="modal-handle"></div>
                <div class="modal-title">${name}</div>
                <div class="barcode-label mb-3"><svg id="barcodeModal"></svg></div>
                <p style="font-size:.85rem;color:var(--ink-mid)">${code}</p>
                <button class="btn-j btn-gold w-100" onclick="window.print()"><i class="fas fa-print"></i> طباعة الباركود</button>
            </div>`;
        document.body.appendChild(modal);
        JsBarcode('#barcodeModal', code, { format: 'CODE128', width: 2, height: 70, displayValue: true, font: 'Almarai' });
    },

    // ============ PURCHASE BARCODE ============
    scanPurchaseBarcode() {
        const code = document.getElementById('pBarcodeScanner').value.trim().toUpperCase();
        if (!code) return;
        const found = Object.entries(this.warehouse).find(([, w]) => {
            if (w.barcode && w.barcode.toUpperCase() === code) return true;
            if (w.variations && Object.values(w.variations).some(v => v.barcode && v.barcode.toUpperCase() === code)) return true;
            return false;
        });
        const resultEl = document.getElementById('pBarcodeResult');
        if (found) {
            const [id, w] = found;
            resultEl.style.display = 'block';
            resultEl.innerHTML = `<div style="background:rgba(26,107,74,.08);border:1px solid rgba(26,107,74,.2);border-radius:10px;padding:.75rem;display:flex;align-items:center;gap:.75rem">
                <i class="fas fa-check-circle" style="color:var(--emerald);font-size:1.3rem"></i>
                <div><div style="font-weight:800">${w.name}</div><div style="font-size:.78rem;color:var(--ink-mid)">مخزون: ${Object.values(w.sizes || {}).reduce((a, b) => a + b, 0)} قطعة</div></div>
                <button class="btn-j btn-gold btn-sm-j" style="margin-right:auto" onclick="app.selectPurchaseItem('${id}')">اختيار</button>
            </div>`;
        } else {
            resultEl.style.display = 'block';
            resultEl.innerHTML = `<div style="background:rgba(201,168,76,.08);border:1px solid rgba(201,168,76,.2);border-radius:10px;padding:.75rem;font-size:.85rem;color:var(--gold-dark)">
                <i class="fas fa-info-circle me-2"></i>الباركود غير موجود — سيتم إنشاء منتج جديد</div>`;
            document.getElementById('pBarcode').value = code;
        }
    },
    clearPurchaseBarcode() {
        document.getElementById('pBarcodeScanner').value = '';
        document.getElementById('pBarcodeResult').style.display = 'none';
    },
    selectPurchaseItem(id) {
        document.getElementById('pItem').value = id; this.loadPurchaseItem();
        document.getElementById('pBarcodeResult').style.display = 'none';
        document.getElementById('pBarcodeScanner').value = '';
        this.toast('تم تحديد المنتج', 'success');
    },

    // ============ PURCHASE ============
    renderPurchasePage() { this.renderPurchaseHistory(); this.pSizeRows = [...DEFAULT_SIZES]; this.pSizeColors = DEFAULT_SIZES.map(() => ''); this.pSizeColorHex = DEFAULT_SIZES.map(() => ''); this.renderSizesGrid(); },

    renderSizesGrid() {
        const grid = document.getElementById('pSizesGrid'); if (!grid) return;
        grid.innerHTML = this.pSizeRows.map((s, i) => {
            const colorVal = this.pSizeColors?.[i] || '';
            const colorHex = this.pSizeColorHex?.[i] || '';
            return `<div class="col-12 size-row-item" id="psr_${i}">
                <div style="display:flex;gap:6px;align-items:center;background:rgba(201,168,76,.03);border:1px solid var(--border);border-radius:10px;padding:.5rem .65rem">
                    <input type="text"   class="form-control-j" style="width:58px;text-align:center;font-weight:700;flex-shrink:0" placeholder="مقاس" value="${s}">
                    <input type="number" class="form-control-j" placeholder="كمية" min="0" value="0" style="width:65px;flex-shrink:0">
                    <input type="text"   id="psc_${i}" class="form-control-j" placeholder="اللون..." readonly
                        style="flex:1;cursor:pointer;font-size:.82rem;border-right:4px solid ${colorHex || 'var(--border)'}"
                        value="${colorVal}" data-hex="${colorHex}" onclick="app.openColorPicker(${i},'psc')">
                    <button id="psc_btn_${i}" class="btn-j btn-ghost btn-xs-j" onclick="app.openColorPicker(${i},'psc')" style="flex-shrink:0;padding:.3rem .5rem">
                        <i class="fas fa-palette" style="color:var(--gold)"></i>
                    </button>
                    <button class="btn-j btn-ruby btn-xs-j" onclick="app.removeSizeRow(${i})" style="flex-shrink:0"><i class="fas fa-times" style="font-size:.7rem"></i></button>
                </div>
            </div>`;
        }).join('');
    },

    addSizeRow() { this._saveSizeColors(); this.pSizeRows.push(''); this.pSizeColors.push(''); this.pSizeColorHex.push(''); this.renderSizesGrid(); },
    removeSizeRow(i) { this._saveSizeColors(); this.pSizeRows.splice(i, 1); this.pSizeColors.splice(i, 1); this.pSizeColorHex.splice(i, 1); this.renderSizesGrid(); },
    _saveSizeColors() {
        this.pSizeRows.forEach((s, i) => {
            const el = document.getElementById(`psc_${i}`);
            if (el) { this.pSizeColors[i] = el.value; this.pSizeColorHex[i] = el.dataset.hex || ''; }
        });
    },

    loadPurchaseItem() {
        const id = document.getElementById('pItem').value; if (!id || !this.warehouse[id]) return;
        const item = this.warehouse[id];
        document.getElementById('pBuyPrice').value = item.buyPrice || '';
        document.getElementById('pSellPrice').value = item.sellPrice || '';
        const pColorEl = document.getElementById('pColor');
        if (pColorEl) { pColorEl.value = item.color || ''; pColorEl.style.borderRight = item.color ? `4px solid ${this._colorHex(item.color) || 'var(--gold)'}` : '4px solid var(--border)'; }
        document.getElementById('pPageName').value = item.pageName || '';
        this.pSizeRows = Object.keys(item.sizes || {});
        if (!this.pSizeRows.length) this.pSizeRows = [...DEFAULT_SIZES];
        this.pSizeColors = this.pSizeRows.map(() => '');
        this.pSizeColorHex = this.pSizeRows.map(() => '');
        this.renderSizesGrid();
    },

    async savePurchase() {
        const existingId = document.getElementById('pItem').value;
        const newName = document.getElementById('pNewItem').value.trim();
        const manualBarcode = document.getElementById('pBarcode').value.trim().toUpperCase();
        const buyPrice = parseFloat(document.getElementById('pBuyPrice').value) || 0;
        const sellPrice = parseFloat(document.getElementById('pSellPrice').value) || 0;
        const color = document.getElementById('pColor').value.trim();
        const pageName = document.getElementById('pPageName').value.trim();
        const invoiceDate = document.getElementById('pInvoiceDate').value || new Date().toLocaleDateString('en-GB');
        const notes = document.getElementById('pNotes').value.trim();
        if (!pageName) { this.toast('اسم الصفحة إجباري', 'error'); return; }
        if (!existingId && !newName) { this.toast('يرجى اختيار أو إدخال اسم المنتج', 'error'); return; }

        const sizeRows = document.getElementById('pSizesGrid').querySelectorAll('.size-row-item');
        const sizes = {}; const sizeColors = {};
        sizeRows.forEach(row => {
            const inputs = row.querySelectorAll('input[type="text"], input[type="number"]');
            const sz = inputs[0]?.value.trim(); const qty = parseInt(inputs[1]?.value) || 0; const sc = inputs[2]?.value.trim() || '';
            if (sz && qty > 0) { sizes[sz] = qty; if (sc) sizeColors[sz] = sc; }
        });
        if (Object.keys(sizes).length === 0) { this.toast('يرجى إدخال مقاس وكمية', 'error'); return; }

        let targetId = existingId;
        if (!targetId) {
            const barcode = manualBarcode || ('JW' + Date.now().toString().slice(-8));
            const newRef = await push(warehouseRef, { name: newName, buyPrice, sellPrice, pageName, color, barcode, sizes: {}, createdAt: Date.now() });
            targetId = newRef.key;
        }
        const item = this.warehouse[targetId];
        const existingSizes = item?.sizes || {};
        const mergedSizes = { ...existingSizes };
        Object.entries(sizes).forEach(([s, q]) => { mergedSizes[s] = (mergedSizes[s] || 0) + q; });
        const updateData = { buyPrice, sellPrice, pageName, color, sizes: mergedSizes, sizeColors };
        if (manualBarcode && !existingId) updateData.barcode = manualBarcode;
        await update(ref(db, `jawaher_warehouse/${targetId}`), updateData);
        await push(purchasesRef, { timestamp: Date.now(), date: invoiceDate, itemId: targetId, itemName: item?.name || newName, sizes, sizeColors, buyPrice, sellPrice, pageName, color, notes, user: this.userName });
        this.log('purchase', targetId, `شراء: ${JSON.stringify(sizes)} - صفحة: ${pageName} - سعر: ${buyPrice} JOD`);
        this.toast('تم تسجيل الشراء وتحديث المستودع ✓', 'success');
        this.resetPurchase(); this.renderPurchaseHistory();
    },

    resetPurchase() {
        ['pItem', 'pBuyPrice', 'pSellPrice', 'pNotes', 'pBarcode', 'pInvoiceDate'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        const pColorEl = document.getElementById('pColor');
        if (pColorEl) { pColorEl.value = ''; pColorEl.style.borderRight = '4px solid var(--border)'; }
        document.getElementById('pNewItem').value = '';
        const scanner = document.getElementById('pBarcodeScanner'); const result = document.getElementById('pBarcodeResult');
        if (scanner) scanner.value = ''; if (result) result.style.display = 'none';
        this.pSizeRows = [...DEFAULT_SIZES]; this.pSizeColors = DEFAULT_SIZES.map(() => ''); this.pSizeColorHex = DEFAULT_SIZES.map(() => '');
        this.renderSizesGrid();
    },

    renderPurchaseHistory() {
        const hist = document.getElementById('purchaseHistory'); if (!hist) return;
        const entries = Object.values(this.purchases).sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
        if (!entries.length) { hist.innerHTML = `<div style="text-align:center;color:var(--ink-mid);padding:2rem">لا توجد عمليات شراء</div>`; return; }
        hist.innerHTML = entries.map(p => `
            <div style="background:rgba(201,168,76,.05);border:1px solid rgba(201,168,76,.15);border-radius:10px;padding:.85rem;margin-bottom:.6rem">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.4rem">
                    <span style="font-weight:800;font-size:.9rem">${p.itemName || 'غير محدد'}</span>
                    <span style="font-size:.75rem;color:var(--ink-mid)" dir="ltr">${p.date || ''}</span>
                </div>
                <div style="font-size:.8rem;color:var(--ink-mid)">
                    ${Object.entries(p.sizes || {}).map(([s, q]) => `<span class="size-tag">مقاس ${s}: ${q}</span>`).join(' ')}
                    ${p.buyPrice ? `<span style="color:var(--emerald);font-weight:700;margin-right:6px">${p.buyPrice} JOD</span>` : ''}
                </div>
            </div>`).join('');
    },

    // ============ RETURNS ============
    scanReturnBarcode() {
        const code = document.getElementById('retBarcodeScanner').value.trim().toUpperCase();
        if (!code) return;
        const found = Object.entries(this.orders).find(([id]) => id.slice(-12).toUpperCase().includes(code) || id.slice(-8).toUpperCase() === code);
        if (found) { this.selectReturnOrder(found[0], found[1]); document.getElementById('retBarcodeScanner').value = ''; this.toast('تم العثور على الطلب', 'success'); return; }
        const itemFound = Object.entries(this.warehouse).find(([, w]) => w.barcode?.toUpperCase() === code || (w.variations && Object.values(w.variations).some(v => v.barcode?.toUpperCase() === code)));
        if (itemFound) {
            const ordersByItem = Object.entries(this.orders).filter(([, o]) => o.itemId === itemFound[0] && o.status !== 'canceled');
            if (ordersByItem.length === 1) this.selectReturnOrder(ordersByItem[0][0], ordersByItem[0][1]);
            else if (ordersByItem.length > 1) this.showReturnResults(ordersByItem);
            else this.toast('لا توجد طلبات لهذا المنتج', 'error');
        } else { this.toast('لم يتم العثور على طلب', 'error'); }
    },

    searchForReturn() {
        const q = document.getElementById('retSearch').value.trim().toLowerCase();
        const resultsEl = document.getElementById('retSearchResults');
        const preview = document.getElementById('retOrderPreview');
        const form = document.getElementById('retForm');
        this.retSelectedOrderId = null; form.style.display = 'none'; preview.style.display = 'none'; resultsEl.style.display = 'none';
        if (q.length < 2) return;
        const matches = Object.entries(this.orders).filter(([id, o]) =>
            id.slice(-8).toLowerCase().includes(q) || (o.custName || '').toLowerCase().includes(q) || (o.custMob || '').includes(q) || (o.itemName || '').toLowerCase().includes(q)
        ).slice(0, 8);
        if (matches.length === 0) { resultsEl.style.display = 'block'; resultsEl.innerHTML = `<div style="padding:.75rem;font-size:.85rem;color:var(--ink-mid);text-align:center"><i class="fas fa-search-minus"></i> لم يتم العثور على نتائج</div>`; return; }
        if (matches.length === 1) { this.selectReturnOrder(matches[0][0], matches[0][1]); return; }
        this.showReturnResults(matches);
    },

    showReturnResults(matches) {
        const resultsEl = document.getElementById('retSearchResults');
        resultsEl.style.display = 'block';
        resultsEl.innerHTML = matches.map(([id, o]) => `
            <div onclick="app.selectReturnOrder('${id}', null)" style="padding:.7rem .85rem;cursor:pointer;border-bottom:1px solid var(--border);transition:background .2s;display:flex;align-items:center;gap:.75rem"
                onmouseover="this.style.background='rgba(201,168,76,.06)'" onmouseout="this.style.background=''">
                <i class="fas fa-box" style="color:var(--gold);flex-shrink:0"></i>
                <div style="flex:1;min-width:0">
                    <div style="font-weight:800;font-size:.88rem">${o.custName}</div>
                    <div style="font-size:.75rem;color:var(--ink-mid)">${o.itemName || ''} | ${o.size || ''} | ${o.custMob || ''}</div>
                </div>
                <span class="badge-j badge-${o.status}" style="flex-shrink:0;font-size:.7rem">${STATUS_AR[o.status] || ''}</span>
            </div>`).join('');
    },

    selectReturnOrder(id, order) {
        const o = order || this.orders[id]; if (!o) return;
        this.retSelectedOrderId = id;
        document.getElementById('retSearchResults').style.display = 'none';
        document.getElementById('retSearch').value = o.custName;
        const preview = document.getElementById('retOrderPreview');
        preview.style.display = 'block';
        preview.innerHTML = `<div class="return-item-preview">
            <div class="return-item-icon"><i class="fas fa-box"></i></div>
            <div style="flex:1">
                <div style="font-weight:800;font-size:1rem">${o.custName}</div>
                <div style="font-size:.82rem;color:var(--ink-mid);margin:2px 0">${o.itemName || '-'} | مقاس ${o.size || '-'} | كمية: ${o.qty || 1}</div>
                <div style="font-size:.82rem;color:var(--gold)">${o.price || 0} ${o.currency || 'JOD'}</div>
                <div style="font-size:.75rem;color:var(--ink-mid)">${o.custMob || ''} | ${STATUS_AR[o.status] || ''}</div>
            </div>
            <button class="btn-j btn-ghost btn-xs-j" onclick="app.clearReturnSelection()"><i class="fas fa-times"></i></button>
        </div>`;
        const sizeSel = document.getElementById('retSize');
        const item = o.itemId ? this.warehouse[o.itemId] : null;
        const sizesW = item ? Object.keys(item.sizes || {}) : [];
        const allSizes = [o.size || '', ...sizesW.filter(s => s !== o.size)].filter(Boolean);
        sizeSel.innerHTML = allSizes.map(s => `<option value="${s}">${s}</option>`).join('');
        sizeSel.value = o.size || '';
        document.getElementById('retForm').style.display = 'block';
    },

    clearReturnSelection() {
        this.retSelectedOrderId = null;
        ['retOrderPreview', 'retForm', 'retSearchResults'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
        document.getElementById('retSearch').value = '';
    },

    async saveReturn() {
        const orderId = this.retSelectedOrderId; if (!orderId) { this.toast('يرجى تحديد طلب', 'error'); return; }
        const o = this.orders[orderId]; if (!o) return;
        const size = document.getElementById('retSize').value;
        const qty = parseInt(document.getElementById('retQty').value) || 1;
        const reason = document.getElementById('retReason').value;
        const notes = document.getElementById('retNotes').value;
        if (o.itemId) { const current = this.warehouse[o.itemId]?.sizes?.[size] || 0; await update(ref(db, `jawaher_warehouse/${o.itemId}/sizes`), { [size]: current + qty }); }
        await push(returnsRef, { timestamp: Date.now(), date: new Date().toLocaleDateString('en-GB'), orderId, custName: o.custName, custMob: o.custMob, itemName: o.itemName || '', itemId: o.itemId || '', size, qty, reason, notes, user: this.userName });
        await update(ref(db, `jawaher_orders/${orderId}`), { status: 'postponed' });
        this.log('return', orderId, `مرتجع ${qty} قطعة مقاس ${size} - السبب: ${reason}`);
        this.toast('تم تسجيل المرتجع ✓', 'success');
        ['retSearch', 'retNotes'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        document.getElementById('retQty').value = '1';
        const scanEl = document.getElementById('retBarcodeScanner'); if (scanEl) scanEl.value = '';
        ['retOrderPreview', 'retForm', 'retSearchResults'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
        this.retSelectedOrderId = null;
        this.renderReturnsList();
    },

    renderReturnsList() {
        const el = document.getElementById('returnsList'); if (!el) return;
        const entries = Object.values(this.returns).sort((a, b) => b.timestamp - a.timestamp);
        if (!entries.length) { el.innerHTML = `<div style="text-align:center;color:var(--ink-mid);padding:2rem"><i class="fas fa-box-open fa-2x" style="opacity:.2;display:block;margin-bottom:1rem"></i>لا توجد مرتجعات</div>`; return; }
        el.innerHTML = entries.map(r => `
            <div class="return-history-item">
                <div style="width:40px;height:40px;background:rgba(139,26,58,.1);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas fa-undo-alt" style="color:var(--ruby-light)"></i></div>
                <div style="flex:1">
                    <div style="font-weight:800;font-size:.9rem">${r.custName || ''}</div>
                    <div style="font-size:.78rem;color:var(--ink-mid)">${r.itemName || ''} مقاس ${r.size || ''} × ${r.qty || 1} | ${r.reason || ''}</div>
                    <div style="font-size:.72rem;color:var(--ink-mid)" dir="ltr">${r.date || ''} - ${r.user || ''}</div>
                </div>
            </div>`).join('');
    },

    // ============ LOGS ============
    log(action, id, details) {
        if (this.role !== 'Admin') return;
        push(logsRef, { timestamp: Date.now(), date: new Date().toLocaleString('en-GB'), user: this.userName, action, id, details });
    },
    renderLogs() {
        const el = document.getElementById('logsBody'); if (!el) return;
        const entries = Object.values(this.logsData || {}).sort((a, b) => b.timestamp - a.timestamp);
        el.innerHTML = entries.map(l => `<tr>
            <td dir="ltr" style="font-size:.8rem">${new Date(l.timestamp).toLocaleString('en-GB')}</td>
            <td style="font-weight:700">${l.user || ''}</td>
            <td><span class="badge-j badge-new">${l.action || ''}</span></td>
            <td style="font-size:.78rem;color:var(--gold)">${(l.id || '').slice(-8)}</td>
            <td style="font-size:.85rem">${l.details || ''}</td>
        </tr>`).join('');
    },

    // ============ HELPERS ============
    adjustQty(id, delta) {
        const el = document.getElementById(id); if (!el) return;
        el.value = Math.max(1, (parseInt(el.value) || 1) + delta);
    },
    openModal(id) { document.getElementById(id)?.classList.add('open'); },
    closeModal(id) { document.getElementById(id)?.classList.remove('open'); },
    toggleDrop(id) { document.getElementById(id)?.classList.toggle('open'); },
    closeAllDropdowns() { document.querySelectorAll('.dropdown-j.open').forEach(d => d.classList.remove('open')); },

    toast(msg, type = 'info') {
        const container = document.getElementById('toastContainer');
        const icons = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
        const t = document.createElement('div');
        t.className = `toast-j ${type}`;
        t.innerHTML = `<i class="fas ${icons[type] || 'fa-info-circle'}"></i> ${msg}`;
        container.appendChild(t);
        if (type === 'success' && navigator.vibrate) navigator.vibrate(30);
        setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(-20px)'; setTimeout(() => t.remove(), 300); }, 3000);
    },

    initKeys() {
        document.addEventListener('keydown', e => {
            if (!this.user) return;
            if (e.altKey && e.key.toLowerCase() === 'n') { e.preventDefault(); this.gotoPage('entry'); }
            if (e.altKey && e.key.toLowerCase() === 'w') { e.preventDefault(); this.gotoPage('warehouse'); }
            if (e.key === 'Escape') { this.closeModal('orderModal'); this.closeAllDropdowns(); }
        });
        document.addEventListener('click', e => { if (!e.target.closest('.dropdown-j')) this.closeAllDropdowns(); });
    }
};

// ── DOM Ready ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    app.applyDark();
    app.initKeys();

    document.getElementById('loginPass')?.addEventListener('keydown', e => { if (e.key === 'Enter') app.login(); });

    document.getElementById('eCustMob')?.addEventListener('input', e => {
        let v = e.target.value.replace(/\D/g, '');
        if (v.startsWith('07')) v = v.slice(2);
        if (v.length > 1) v = v.slice(0, 1) + ' ' + v.slice(1);
        if (v.length > 5) v = v.slice(0, 5) + ' ' + v.slice(5);
        e.target.value = v;
        app.checkDuplicate();
    });

    // ── Intro screen ─────────────────────────────────────────
    const intro = document.getElementById('introScreen');
    const auth = document.getElementById('authScreen');
    const colors = ['rgba(201,168,76,.6)', 'rgba(232,201,122,.5)', 'rgba(154,122,46,.5)', 'rgba(255,255,255,.15)'];

    for (let i = 0; i < 22; i++) {
        const p = document.createElement('div');
        p.className = 'intro-particle';
        const size = 3 + Math.random() * 7;
        p.style.cssText = `width:${size}px;height:${size}px;left:${Math.random() * 100}%;background:${colors[Math.floor(Math.random() * colors.length)]};animation-duration:${4 + Math.random() * 6}s;animation-delay:${Math.random() * 3}s`;
        intro.appendChild(p);
    }

    setTimeout(() => {
        intro.classList.add('fade-out');
        setTimeout(() => { intro.style.display = 'none'; auth.classList.add('visible'); }, 680);
    }, 2400);
});
