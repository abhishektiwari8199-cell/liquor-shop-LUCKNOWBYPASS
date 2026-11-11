/* Abhishek Composite POS — Add-on Madhushala Tools
   This module is intentionally isolated. It does not replace existing POS,
   inventory, sales, daybook, stock-in, or purchase code.
*/
(function () {
  "use strict";

  const MODULE_ID = "madhushalaTools";
  let installed = false;
  let activeTab = "breakage";

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
  const msg = (id, text, isError = false) => {
    const el = $(id);
    if (el) {
      el.textContent = text;
      el.style.color = isError ? "#b42318" : "inherit";
    }
  };
  const bridge = () => window.__ABH_POS_BRIDGE__ || null;
  const currentUser = () => bridge()?.user || null;
  const client = () => bridge()?.db || null;
  const productsList = () => Array.isArray(bridge()?.products) ? bridge().products : [];
  const dateToday = () => {
    if (typeof bridge()?.today === "function") return bridge().today();
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const moneySafeError = (error) => error?.message || String(error || "Unknown error");

  function requireSession() {
    if (!client() || !currentUser()?.id) {
      throw new Error("Session not ready. Please sign in again and reopen this module.");
    }
    return { db: client(), user: currentUser() };
  }

  async function writeAudit(action, module, details) {
    try {
      const { db, user } = requireSession();
      const { error } = await db.from("audit_logs").insert({
        user_id: user.id,
        action,
        module,
        details: details || {}
      });
      if (error) console.warn("[Madhushala Tools] Audit log:", error.message);
    } catch (e) {
      console.warn("[Madhushala Tools] Audit log:", e);
    }
  }

  function productLabel(p) {
    return `${p.brand_name || p.name || "Product"}${p.size ? " · " + p.size : ""}`;
  }

  function fillProductSelects() {
    const options = productsList().map((p) =>
      `<option value="${esc(p.id)}">${esc(productLabel(p))}</option>`
    ).join("");
    ["mdBreakProduct", "mdTransferProduct"].forEach((id) => {
      const el = $(id);
      if (el) el.innerHTML = options || '<option value="">No products loaded</option>';
    });
  }

  function setDefaultDates() {
    ["mdBreakDate", "mdTransferDate"].forEach((id) => {
      const el = $(id);
      if (el && !el.value) el.value = dateToday();
    });
  }

  function ensureStyles() {
    if ($("mdToolsStyles")) return;
    const style = document.createElement("style");
    style.id = "mdToolsStyles";
    style.textContent = `
      #${MODULE_ID} .md-tools-head{display:flex;flex-wrap:wrap;gap:9px;margin:12px 0}
      #${MODULE_ID} .md-tools-tabs{display:flex;flex-wrap:wrap;gap:8px}
      #${MODULE_ID} .md-tools-tabs button{min-height:40px}
      #${MODULE_ID} .md-tools-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}
      #${MODULE_ID} .md-tools-field{display:flex;flex-direction:column;gap:6px;margin:10px 0}
      #${MODULE_ID} .md-tools-field input,#${MODULE_ID} .md-tools-field select,#${MODULE_ID} .md-tools-field textarea{width:100%;min-width:0}
      #${MODULE_ID} .md-tools-actions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
      #${MODULE_ID} .md-tools-note{font-size:12px;opacity:.78;line-height:1.5;margin:10px 0}
      #${MODULE_ID} .md-tools-status{min-height:22px;margin:8px 0;font-size:13px}
      #${MODULE_ID} .md-tools-table{width:100%;border-collapse:collapse}
      #${MODULE_ID} .md-tools-table th,#${MODULE_ID} .md-tools-table td{padding:9px 10px;text-align:left;border-bottom:1px solid rgba(130,150,170,.22);font-size:13px;vertical-align:top}
      #${MODULE_ID} .md-tools-table-wrap{width:100%;overflow:auto}
      #${MODULE_ID} .md-tools-tab[hidden]{display:none!important}
      #${MODULE_ID} .md-tools-danger{border-color:#c33!important;color:#b42318!important}
      @media(max-width:600px){#${MODULE_ID} .md-tools-table th,#${MODULE_ID} .md-tools-table td{white-space:nowrap}}
    `;
    document.head.appendChild(style);
  }

  function makeSection() {
    if ($(MODULE_ID)) return;
    const main = document.querySelector("#appView .main");
    if (!main) throw new Error("Website main workspace not found; add-on stopped safely.");

    const section = document.createElement("section");
    section.id = MODULE_ID;
    section.className = "page";
    section.innerHTML = `
      <div class="panel glass">
        <div class="md-tools-head">
          <div><h3 style="margin:0">Madhushala Management</h3>
            <p class="md-tools-note">Additional registers connected to your existing Supabase login.</p>
          </div>
        </div>
        <div class="md-tools-tabs">
          <button class="btn secondary" type="button" data-md-tab="breakage">Breakage</button>
          <button class="btn secondary" type="button" data-md-tab="transfer">Stock Transfer</button>
          <button class="btn secondary" type="button" data-md-tab="staff">Staff</button>
          <button class="btn secondary" type="button" data-md-tab="invoice">Invoice Review</button>
          <button class="btn secondary" type="button" data-md-tab="audit">Audit Log</button>
        </div>
      </div>

      <div class="panel glass md-tools-tab" data-md-panel="breakage">
        <h3>Breakage / Leakage Register</h3>
        <div class="md-tools-grid">
          <label class="md-tools-field">Product<select id="mdBreakProduct"></select></label>
          <label class="md-tools-field">Quantity (bottles)<input id="mdBreakQty" type="number" min="1" step="1" inputmode="numeric"></label>
          <label class="md-tools-field">Date<input id="mdBreakDate" type="date"></label>
          <label class="md-tools-field">Reason<select id="mdBreakReason"><option value="BROKEN">Broken</option><option value="LEAKAGE">Leakage</option><option value="DAMAGED">Damaged</option><option value="OTHER">Other</option></select></label>
        </div>
        <label class="md-tools-field">Notes<input id="mdBreakNotes" maxlength="500" placeholder="Optional details"></label>
        <div class="md-tools-actions"><button class="btn primary" id="mdBreakSave" type="button">Save Breakage</button><button class="btn secondary" id="mdBreakRefresh" type="button">Refresh</button></div>
        <div class="md-tools-status" id="mdBreakMsg" role="status"></div>
        <div class="md-tools-table-wrap"><table class="md-tools-table"><thead><tr><th>Date</th><th>Product</th><th>Qty</th><th>Reason</th><th>Status</th></tr></thead><tbody id="mdBreakRows"><tr><td colspan="5">Open this tab to load records.</td></tr></tbody></table></div>
        <p class="md-tools-note">Safety: this records damage only. It does not reduce your live inventory yet.</p>
      </div>

      <div class="panel glass md-tools-tab" data-md-panel="transfer" hidden>
        <h3>Stock Transfer — Draft Register</h3>
        <div class="md-tools-grid">
          <label class="md-tools-field">Transfer No.<input id="mdTransferNo" maxlength="60" placeholder="TR-001"></label>
          <label class="md-tools-field">From Location<input id="mdFrom" maxlength="120" placeholder="Main Shop"></label>
          <label class="md-tools-field">To Location<input id="mdTo" maxlength="120" placeholder="Warehouse / Shop 2"></label>
          <label class="md-tools-field">Date<input id="mdTransferDate" type="date"></label>
          <label class="md-tools-field">Product<select id="mdTransferProduct"></select></label>
          <label class="md-tools-field">Quantity<input id="mdTransferQty" type="number" min="1" step="1" inputmode="numeric"></label>
        </div>
        <label class="md-tools-field">Notes<input id="mdTransferNotes" maxlength="500" placeholder="Optional details"></label>
        <div class="md-tools-actions"><button class="btn primary" id="mdTransferSave" type="button">Save Transfer Draft</button><button class="btn secondary" id="mdTransferRefresh" type="button">Refresh</button></div>
        <div class="md-tools-status" id="mdTransferMsg" role="status"></div>
        <div class="md-tools-table-wrap"><table class="md-tools-table"><thead><tr><th>Transfer No.</th><th>From</th><th>To</th><th>Date</th><th>Status</th></tr></thead><tbody id="mdTransferRows"><tr><td colspan="5">Open this tab to load records.</td></tr></tbody></table></div>
        <p class="md-tools-note">Draft-only. Dispatch/receive and location-wise stock posting are deliberately disabled until the stock ledger is mapped.</p>
      </div>

      <div class="panel glass md-tools-tab" data-md-panel="staff" hidden>
        <h3>Staff Register</h3>
        <div class="md-tools-grid">
          <label class="md-tools-field">Full Name<input id="mdStaffName" maxlength="120"></label>
          <label class="md-tools-field">Phone<input id="mdStaffPhone" maxlength="20" inputmode="tel"></label>
          <label class="md-tools-field">Role<select id="mdStaffRole"><option value="CASHIER">Cashier</option><option value="MANAGER">Manager</option><option value="STOCK_MANAGER">Stock Manager</option><option value="VIEWER">Viewer</option></select></label>
        </div>
        <div class="md-tools-actions"><button class="btn primary" id="mdStaffSave" type="button">Add Staff Record</button><button class="btn secondary" id="mdStaffRefresh" type="button">Refresh</button></div>
        <div class="md-tools-status" id="mdStaffMsg" role="status"></div>
        <div class="md-tools-table-wrap"><table class="md-tools-table"><thead><tr><th>Name</th><th>Phone</th><th>Role</th><th>Status</th></tr></thead><tbody id="mdStaffRows"><tr><td colspan="4">Open this tab to load records.</td></tr></tbody></table></div>
        <p class="md-tools-note">This is a staff directory only. It does not create separate staff logins or change existing permissions.</p>
      </div>

      <div class="panel glass md-tools-tab" data-md-panel="invoice" hidden>
        <h3>Invoice Import Review</h3>
        <label class="md-tools-field">Invoice File Name<input id="mdInvoiceName" maxlength="200" placeholder="invoice-001.pdf"></label>
        <label class="md-tools-field">Extracted Invoice JSON<textarea id="mdInvoiceJson" rows="7" spellcheck="false" placeholder='{"invoice_no":"123","date":"2026-11-11","items":[]}'></textarea></label>
        <div class="md-tools-actions"><button class="btn primary" id="mdInvoiceSave" type="button">Save for Review</button><button class="btn secondary" id="mdInvoiceRefresh" type="button">Refresh</button></div>
        <div class="md-tools-status" id="mdInvoiceMsg" role="status"></div>
        <div class="md-tools-table-wrap"><table class="md-tools-table"><thead><tr><th>File</th><th>Status</th><th>Created</th><th>Review</th></tr></thead><tbody id="mdInvoiceRows"><tr><td colspan="4">Open this tab to load records.</td></tr></tbody></table></div>
        <p class="md-tools-note">Approve/reject changes review status only. It does not create a purchase or change inventory. Verify all invoice values before entering them into the existing stock workflow.</p>
      </div>

      <div class="panel glass md-tools-tab" data-md-panel="audit" hidden>
        <h3>Audit Log</h3>
        <div class="md-tools-actions"><button class="btn secondary" id="mdAuditRefresh" type="button">Refresh Audit Log</button></div>
        <div class="md-tools-status" id="mdAuditMsg" role="status"></div>
        <div class="md-tools-table-wrap"><table class="md-tools-table"><thead><tr><th>Time</th><th>Module</th><th>Action</th><th>Details</th></tr></thead><tbody id="mdAuditRows"><tr><td colspan="4">Open this tab to load records.</td></tr></tbody></table></div>
      </div>
    `;
    main.appendChild(section);
  }

  function addNavigation() {
    const nav = document.querySelector("#appView .sidebar .nav");
    if (!nav || nav.querySelector('[data-page="' + MODULE_ID + '"]')) return;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.page = MODULE_ID;
    button.innerHTML = '<span class="ico">✦</span>Madhushala Tools';
    button.addEventListener("click", () => bridge()?.showPage?.(MODULE_ID, button));
    nav.appendChild(button);
  }

  function activatePage() {
    if (typeof window.closeWorkspaceMenu === "function") window.closeWorkspaceMenu();
    document.querySelectorAll("#appView .page").forEach((p) => p.classList.remove("active"));
    $(MODULE_ID).classList.add("active");
    document.querySelectorAll("#appView .sidebar .nav button").forEach((b) => {
      b.classList.toggle("active", b.dataset.page === MODULE_ID);
    });
    const title = $("pageTitle");
    const subtitle = $("pageSubtitle");
    if (title) title.textContent = "Madhushala Management";
    if (subtitle) subtitle.textContent = "Breakage · Transfers · Staff · Invoice Review · Audit Log";
    fillProductSelects();
    setDefaultDates();
    openTab(activeTab);
  }

  function openTab(tab) {
    activeTab = tab;
    document.querySelectorAll("#" + MODULE_ID + " [data-md-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.mdPanel !== tab;
    });
    document.querySelectorAll("#" + MODULE_ID + " [data-md-tab]").forEach((button) => {
      button.classList.toggle("primary", button.dataset.mdTab === tab);
      button.classList.toggle("secondary", button.dataset.mdTab !== tab);
    });
    fillProductSelects();
    setDefaultDates();
    const loaders = {
      breakage: loadBreakages,
      transfer: loadTransfers,
      staff: loadStaff,
      invoice: loadInvoices,
      audit: loadAudit
    };
    if (loaders[tab]) loaders[tab]();
  }

  async function loadBreakages() {
    const body = $("mdBreakRows");
    body.innerHTML = '<tr><td colspan="5">Loading…</td></tr>';
    try {
      const { db } = requireSession();
      const { data, error } = await db.from("stock_breakages")
        .select("id,product_id,quantity,reason,breakage_date,status,created_at")
        .order("breakage_date", { ascending: false }).limit(100);
      if (error) throw error;
      body.innerHTML = (data || []).map((r) => {
        const p = productsList().find((x) => String(x.id) === String(r.product_id));
        return `<tr><td>${esc(r.breakage_date)}</td><td>${esc(p ? productLabel(p) : r.product_id)}</td><td>${esc(r.quantity)}</td><td>${esc(r.reason)}</td><td>${esc(r.status)}</td></tr>`;
      }).join("") || '<tr><td colspan="5">No breakage entries.</td></tr>';
    } catch (e) {
      body.innerHTML = `<tr><td colspan="5">${esc(moneySafeError(e))}</td></tr>`;
    }
  }

  async function saveBreakage() {
    const button = $("mdBreakSave");
    button.disabled = true;
    try {
      const { db, user } = requireSession();
      const productId = $("mdBreakProduct").value;
      const quantity = Number($("mdBreakQty").value);
      const date = $("mdBreakDate").value;
      if (!productId || !Number.isSafeInteger(quantity) || quantity <= 0 || !date) {
        throw new Error("Product, positive whole-number quantity and date are required.");
      }
      const { data, error } = await db.from("stock_breakages").insert({
        user_id: user.id,
        product_id: productId,
        quantity,
        reason: $("mdBreakReason").value,
        notes: $("mdBreakNotes").value.trim(),
        breakage_date: date
      }).select("id").single();
      if (error) throw error;
      await writeAudit("CREATE", "BREAKAGE", { id: data.id, quantity });
      msg("mdBreakMsg", "Breakage entry saved. Existing stock has not been changed.");
      $("mdBreakQty").value = "";
      $("mdBreakNotes").value = "";
      await loadBreakages();
    } catch (e) {
      msg("mdBreakMsg", moneySafeError(e), true);
    } finally {
      button.disabled = false;
    }
  }

  async function loadTransfers() {
    const body = $("mdTransferRows");
    body.innerHTML = '<tr><td colspan="5">Loading…</td></tr>';
    try {
      const { db } = requireSession();
      const { data, error } = await db.from("stock_transfers")
        .select("id,transfer_no,from_location,to_location,transfer_date,status")
        .order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      body.innerHTML = (data || []).map((r) =>
        `<tr><td>${esc(r.transfer_no)}</td><td>${esc(r.from_location)}</td><td>${esc(r.to_location)}</td><td>${esc(r.transfer_date)}</td><td>${esc(r.status)}</td></tr>`
      ).join("") || '<tr><td colspan="5">No transfer drafts found.</td></tr>';
    } catch (e) {
      body.innerHTML = `<tr><td colspan="5">${esc(moneySafeError(e))}</td></tr>`;
    }
  }

  async function saveTransfer() {
    const button = $("mdTransferSave");
    button.disabled = true;
    let headerId = null;
    try {
      const { db, user } = requireSession();
      const transferNo = $("mdTransferNo").value.trim();
      const from = $("mdFrom").value.trim();
      const to = $("mdTo").value.trim();
      const productId = $("mdTransferProduct").value;
      const quantity = Number($("mdTransferQty").value);
      const date = $("mdTransferDate").value;
      if (!transferNo || !from || !to || from.toLowerCase() === to.toLowerCase() ||
          !productId || !Number.isSafeInteger(quantity) || quantity <= 0 || !date) {
        throw new Error("Enter transfer number, two different locations, product, positive whole quantity and date.");
      }
      const { data: header, error: headerError } = await db.from("stock_transfers").insert({
        user_id: user.id,
        transfer_no: transferNo,
        from_location: from,
        to_location: to,
        transfer_date: date,
        status: "DRAFT",
        notes: $("mdTransferNotes").value.trim()
      }).select("id").single();
      if (headerError) throw headerError;
      headerId = header.id;

      const { error: itemError } = await db.from("stock_transfer_items").insert({
        user_id: user.id,
        transfer_id: headerId,
        product_id: productId,
        quantity
      });
      if (itemError) {
        await db.from("stock_transfers").delete().eq("id", headerId);
        headerId = null;
        throw itemError;
      }
      await writeAudit("CREATE", "STOCK_TRANSFER", { id: headerId, quantity });
      msg("mdTransferMsg", "Transfer draft saved. No stock has been moved.");
      $("mdTransferQty").value = "";
      $("mdTransferNotes").value = "";
      await loadTransfers();
    } catch (e) {
      msg("mdTransferMsg", moneySafeError(e), true);
    } finally {
      button.disabled = false;
    }
  }

  async function loadStaff() {
    const body = $("mdStaffRows");
    body.innerHTML = '<tr><td colspan="4">Loading…</td></tr>';
    try {
      const { db } = requireSession();
      const { data, error } = await db.from("staff_members")
        .select("id,full_name,phone,role,active,created_at")
        .order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      body.innerHTML = (data || []).map((r) =>
        `<tr><td>${esc(r.full_name)}</td><td>${esc(r.phone || "")}</td><td>${esc(r.role)}</td><td>${r.active ? "Active" : "Inactive"}</td></tr>`
      ).join("") || '<tr><td colspan="4">No staff records.</td></tr>';
    } catch (e) {
      body.innerHTML = `<tr><td colspan="4">${esc(moneySafeError(e))}</td></tr>`;
    }
  }

  async function saveStaff() {
    const button = $("mdStaffSave");
    button.disabled = true;
    try {
      const { db, user } = requireSession();
      const name = $("mdStaffName").value.trim();
      const phone = $("mdStaffPhone").value.trim();
      if (!name) throw new Error("Staff name is required.");
      const { data, error } = await db.from("staff_members").insert({
        user_id: user.id,
        full_name: name,
        phone: phone || null,
        role: $("mdStaffRole").value,
        permissions: {},
        active: true
      }).select("id,role").single();
      if (error) throw error;
      await writeAudit("CREATE", "STAFF", { id: data.id, role: data.role });
      msg("mdStaffMsg", "Staff record saved. No login or permissions were changed.");
      $("mdStaffName").value = "";
      $("mdStaffPhone").value = "";
      await loadStaff();
    } catch (e) {
      msg("mdStaffMsg", moneySafeError(e), true);
    } finally {
      button.disabled = false;
    }
  }

  async function loadInvoices() {
    const body = $("mdInvoiceRows");
    body.innerHTML = '<tr><td colspan="4">Loading…</td></tr>';
    try {
      const { db } = requireSession();
      const { data, error } = await db.from("invoice_imports")
        .select("id,file_name,review_status,created_at")
        .order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      body.innerHTML = (data || []).map((r) => {
        const actions = r.review_status === "PENDING"
          ? `<button class="btn secondary" type="button" data-md-review="${esc(r.id)}" data-md-status="APPROVED">Approve</button> <button class="btn secondary md-tools-danger" type="button" data-md-review="${esc(r.id)}" data-md-status="REJECTED">Reject</button>`
          : "Reviewed";
        return `<tr><td>${esc(r.file_name)}</td><td>${esc(r.review_status)}</td><td>${esc(String(r.created_at || "").slice(0, 10))}</td><td>${actions}</td></tr>`;
      }).join("") || '<tr><td colspan="4">No invoices in review.</td></tr>';
    } catch (e) {
      body.innerHTML = `<tr><td colspan="4">${esc(moneySafeError(e))}</td></tr>`;
    }
  }

  async function saveInvoice() {
    const button = $("mdInvoiceSave");
    button.disabled = true;
    try {
      const { db, user } = requireSession();
      const fileName = $("mdInvoiceName").value.trim();
      if (!fileName) throw new Error("Invoice file name is required.");
      let extracted;
      try { extracted = JSON.parse($("mdInvoiceJson").value || "{}"); }
      catch (_) { throw new Error("Invoice JSON is invalid. Please correct it and try again."); }
      const { data, error } = await db.from("invoice_imports").insert({
        user_id: user.id,
        file_name: fileName,
        extracted_data: extracted,
        review_status: "PENDING"
      }).select("id").single();
      if (error) throw error;
      await writeAudit("CREATE", "INVOICE_IMPORT", { id: data.id, file_name: fileName });
      msg("mdInvoiceMsg", "Invoice saved for review. Inventory was not changed.");
      $("mdInvoiceName").value = "";
      $("mdInvoiceJson").value = "";
      await loadInvoices();
    } catch (e) {
      msg("mdInvoiceMsg", moneySafeError(e), true);
    } finally {
      button.disabled = false;
    }
  }

  async function reviewInvoice(id, status) {
    if (!["APPROVED", "REJECTED"].includes(status)) return;
    if (!window.confirm(`Mark this invoice ${status.toLowerCase()}? This will not change stock.`)) return;
    try {
      const { db } = requireSession();
      const { error } = await db.from("invoice_imports")
        .update({ review_status: status }).eq("id", id).eq("review_status", "PENDING");
      if (error) throw error;
      await writeAudit(status, "INVOICE_IMPORT", { id });
      msg("mdInvoiceMsg", `Invoice marked ${status}. Inventory was not changed.`);
      await loadInvoices();
    } catch (e) {
      msg("mdInvoiceMsg", moneySafeError(e), true);
    }
  }

  async function loadAudit() {
    const body = $("mdAuditRows");
    body.innerHTML = '<tr><td colspan="4">Loading…</td></tr>';
    try {
      const { db } = requireSession();
      const { data, error } = await db.from("audit_logs")
        .select("created_at,module,action,details")
        .order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      body.innerHTML = (data || []).map((r) =>
        `<tr><td>${esc(String(r.created_at || "").replace("T", " ").slice(0, 19))}</td><td>${esc(r.module)}</td><td>${esc(r.action)}</td><td>${esc(JSON.stringify(r.details || {}))}</td></tr>`
      ).join("") || '<tr><td colspan="4">No audit records.</td></tr>';
    } catch (e) {
      body.innerHTML = `<tr><td colspan="4">${esc(moneySafeError(e))}</td></tr>`;
    }
  }

  function bindEvents() {
    $("mdBreakSave").addEventListener("click", saveBreakage);
    $("mdBreakRefresh").addEventListener("click", loadBreakages);
    $("mdTransferSave").addEventListener("click", saveTransfer);
    $("mdTransferRefresh").addEventListener("click", loadTransfers);
    $("mdStaffSave").addEventListener("click", saveStaff);
    $("mdStaffRefresh").addEventListener("click", loadStaff);
    $("mdInvoiceSave").addEventListener("click", saveInvoice);
    $("mdInvoiceRefresh").addEventListener("click", loadInvoices);
    $("mdAuditRefresh").addEventListener("click", loadAudit);

    document.querySelectorAll("#" + MODULE_ID + " [data-md-tab]").forEach((button) => {
      button.addEventListener("click", () => openTab(button.dataset.mdTab));
    });
    $("mdInvoiceRows").addEventListener("click", (event) => {
      const button = event.target.closest("[data-md-review]");
      if (button) reviewInvoice(button.dataset.mdReview, button.dataset.mdStatus);
    });
  }


  // Manual freeze panes for the existing Liquor / Beer inventory registers.
  let freezeObserver = null;
  function ensureInventoryFreezeControls() {
    const host = document.querySelector('#inventoryWork .toolbar');
    if (!host || $('mdFreezeControls')) return;
    const panel = document.createElement('div');
    panel.id = 'mdFreezeControls';
    panel.className = 'panel glass';
    panel.style.cssText = 'display:flex;align-items:end;flex-wrap:wrap;gap:10px;margin:12px 0;padding:12px';
    panel.innerHTML = `
      <div style="min-width:155px;flex:1"><label style="display:block;font-size:12px;font-weight:800;margin-bottom:5px">Freeze header rows</label>
        <select id="mdFreezeRows" style="width:100%"><option value="0">0 — Unfreeze rows</option><option value="1">1 row</option><option value="2" selected>2 rows</option></select></div>
      <div style="min-width:155px;flex:1"><label style="display:block;font-size:12px;font-weight:800;margin-bottom:5px">Freeze left columns</label>
        <select id="mdFreezeCols" style="width:100%"><option value="0">0 — Unfreeze columns</option><option value="1" selected>1 column</option><option value="2">2 columns</option><option value="3">3 columns</option><option value="4">4 columns</option><option value="5">5 columns</option></select></div>
      <div style="min-width:175px;flex:1"><label style="display:block;font-size:12px;font-weight:800;margin-bottom:5px">Brand name column</label>
        <select id="mdBrandFreeze" style="width:100%"><option value="on" selected>Freeze brand name</option><option value="off">Unfreeze brand name</option></select></div>
      <button type="button" class="btn primary" id="mdFreezeApply">Apply Freeze</button>
      <button type="button" class="btn secondary" id="mdFreezeClear">Unfreeze All</button>
      <span id="mdFreezeStatus" style="font-size:12px;min-width:100%;opacity:.8">Freeze settings apply to the currently visible inventory table.</span>`;
    host.insertAdjacentElement('afterend', panel);
    $('mdFreezeApply').addEventListener('click', applyInventoryFreeze);
    $('mdBrandFreeze').addEventListener('change', applyInventoryFreeze);
    $('mdFreezeClear').addEventListener('click', () => {
      $('mdFreezeRows').value = '0'; $('mdFreezeCols').value = '0'; $('mdBrandFreeze').value = 'off'; applyInventoryFreeze();
    });
  }

  function applyInventoryFreeze() {
    const rowsToFreeze = Number($('mdFreezeRows')?.value || 0);
    const colsToFreeze = Number($('mdFreezeCols')?.value || 0);
    const wrappers = [
      { wrap: $('liquorInventoryWrap'), table: $('liquorInventoryWrap')?.querySelector('table') },
      { wrap: $('beerInventoryWrap'), table: $('beerInventoryWrap')?.querySelector('table') }
    ];
    wrappers.forEach(({wrap, table}) => {
      if (!wrap || !table || getComputedStyle(wrap).display === 'none') return;
      const headRows = Array.from(table.tHead?.rows || []);
      let top = 0;
      headRows.forEach((tr, index) => {
        Array.from(tr.cells).forEach(th => {
          th.style.setProperty('position', rowsToFreeze > index ? 'sticky' : 'static', 'important');
          th.style.setProperty('top', rowsToFreeze > index ? `${top}px` : 'auto', 'important');
          th.style.setProperty('z-index', rowsToFreeze > index ? '12' : 'auto', 'important');
        });
        if (rowsToFreeze > index) top += tr.getBoundingClientRect().height;
      });
      const bodyRows = Array.from(table.tBodies?.[0]?.rows || []);
      const firstRow = bodyRows.find(tr => tr.cells.length > 1);
      const widths = [];
      if (firstRow) {
        for (let i = 0; i < Math.min(colsToFreeze, firstRow.cells.length); i++) {
          widths.push(firstRow.cells[i].getBoundingClientRect().width);
        }
      }
      const applyCells = (tr, isHead = false) => {
        let left = 0;
        Array.from(tr.cells).forEach((cell, index) => {
          const shouldFreeze = index < colsToFreeze && widths[index] !== undefined;
          cell.style.setProperty('left', shouldFreeze ? `${left}px` : 'auto', 'important');
          if (shouldFreeze) {
            cell.style.setProperty('position', 'sticky', 'important');
            cell.style.setProperty('z-index', isHead ? '15' : '6', 'important');
            left += widths[index];
          } else if (!isHead && index > 0) {
            cell.style.removeProperty('left');
          }
        });
      };
      bodyRows.forEach(tr => applyCells(tr, false));
      // The first header row has grouped colspan cells; pin only the brand/first column.
      if (headRows[0]?.cells[0]) {
        const first = headRows[0].cells[0];
        first.style.setProperty('left', '0px', 'important');
        first.style.setProperty('position', 'sticky', 'important');
        first.style.setProperty('z-index', '18', 'important');
      }
      if (headRows[1]) applyCells(headRows[1], true);
      // Brand-name freeze is controlled independently from the generic left-column setting.
      // Liquor: brand name is column 1. Beer: brand name is column 2 (column 1 is S.NO.).
      const brandFrozen = ($('mdBrandFreeze')?.value || 'on') === 'on';
      const isBeer = table.classList.contains('beer-register') || wrap.id === 'beerInventoryWrap';
      const brandIndex = isBeer ? 1 : 0;
      const frozenCount = isBeer ? 2 : 1;
      const firstBodyRow = table.tBodies?.[0]?.rows?.[0];
      const brandLeft = isBeer && firstBodyRow?.cells?.[0]
        ? firstBodyRow.cells[0].getBoundingClientRect().width : 0;
      Array.from(table.tBodies || []).forEach(tbody => Array.from(tbody.rows).forEach(tr => {
        for (let i = 0; i < Math.min(frozenCount, tr.cells.length); i++) {
          const cell = tr.cells[i];
          const shouldStick = brandFrozen;
          cell.style.setProperty('position', shouldStick ? 'sticky' : 'static', 'important');
          cell.style.setProperty('left', shouldStick ? (isBeer && i === 1 ? `${brandLeft}px` : '0px') : 'auto', 'important');
          cell.style.setProperty('z-index', shouldStick ? '7' : 'auto', 'important');
        }
      }));
      Array.from(table.tHead?.rows || []).forEach(tr => {
        // Keep the first two Beer headings (S.NO. + BRAND NAME), or the first Liquor heading.
        for (let i = 0; i < Math.min(frozenCount, tr.cells.length); i++) {
          const cell = tr.cells[i];
          if (cell.colSpan > 1) continue;
          const shouldStick = brandFrozen;
          cell.style.setProperty('position', shouldStick ? 'sticky' : 'static', 'important');
          cell.style.setProperty('left', shouldStick ? (isBeer && i === 1 ? `${brandLeft}px` : '0px') : 'auto', 'important');
          cell.style.setProperty('z-index', shouldStick ? '18' : 'auto', 'important');
        }
      });
      // Ensure frozen header cells remain above frozen body cells.
      table.style.setProperty('border-collapse', 'separate', 'important');
    });
    const status = $('mdFreezeStatus');
    if (status) status.textContent = `Applied: ${rowsToFreeze} header row(s), ${colsToFreeze} left column(s); brand name column ${($('mdBrandFreeze')?.value || 'on') === 'on' ? 'FROZEN' : 'UNFROZEN'}.`;
  }

  function watchInventoryRedraw() {
    const target = $('inventoryWork');
    if (!target || freezeObserver) return;
    freezeObserver = new MutationObserver(() => {
      if ($('mdFreezeControls')) applyInventoryFreeze();
    });
    freezeObserver.observe(target, { childList: true, subtree: true });
  }

  function install() {
    if (installed) return;
    ensureStyles();
    makeSection();
    addNavigation();
    bindEvents();
    ensureInventoryFreezeControls();
    watchInventoryRedraw();

    // Wrap the existing page router without changing its original implementation.
    if (typeof bridge()?.showPage === "function" && !bridge().showPage.__mdToolsWrapped) {
      const originalShowPage = bridge().showPage;
      const wrappedShowPage = function (id, button) {
        if (id === MODULE_ID) {
          activatePage();
          return;
        }
        return originalShowPage.apply(this, arguments);
      };
      wrappedShowPage.__mdToolsWrapped = true;
      window.showPage = wrappedShowPage;
    }

    // Called by the existing lexical openApp() after its cloud data loads.
    window.MadhushalaToolsAfterOpen = function () {
      addNavigation();
      fillProductSelects();
      setDefaultDates();
    };

    installed = true;
    addNavigation();
    fillProductSelects();
    setDefaultDates();
    console.info("[Madhushala Tools] Add-on loaded; existing POS modules untouched.");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      try { install(); } catch (e) { console.error("[Madhushala Tools] Safe install failed:", e); }
    }, { once: true });
  } else {
    try { install(); } catch (e) { console.error("[Madhushala Tools] Safe install failed:", e); }
  }
})();
