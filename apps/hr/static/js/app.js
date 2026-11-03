/* ADK Co., LTD. (ADK N-Protech) Industrial ERP System - Core Application Logic */

let currentEmployeeId = null;
let currentTab = 'tab-info';
let currentUserRole = 'admin';
let allDepartments = [];
let allEmployees = [];
let allUsers = [];
let allSupplierPayments = [];
let currentRosterWorkers = [];
let currentPayrollRunId = null;

const MONTH_NAMES_MAP = {
  1: 'January', 2: 'February', 3: 'March', 4: 'April',
  5: 'May', 6: 'June', 7: 'July', 8: 'August',
  9: 'September', 10: 'October', 11: 'November', 12: 'December'
};

function openModal(modalId) {
  const m = document.getElementById(modalId);
  if (m) {
    m.classList.add('active');
    m.style.visibility = 'visible';
    m.style.opacity = '1';
    m.style.display = 'flex';
  }
}

function closeModal(modalId) {
  const m = document.getElementById(modalId);
  if (m) {
    m.classList.remove('active');
    m.style.visibility = 'hidden';
    m.style.opacity = '0';
    m.style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  checkAuthSession();
  runEosbCalc();
  runGosiCalc();
});

// Toast Notification System
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = '✅';
  if (type === 'error') icon = '❌';
  if (type === 'info') icon = 'ℹ️';

  toast.innerHTML = `<span>${icon}</span><span style="flex: 1;">${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(50px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Authentication & Role Handlers
async function checkAuthSession() {
  const token = localStorage.getItem('jwt_token');
  const userJson = localStorage.getItem('jwt_user');

  if (!token) {
    showLoginModal();
    return;
  }

  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      localStorage.removeItem('jwt_token');
      localStorage.removeItem('jwt_user');
      showLoginModal();
      return;
    }
    const user = await res.json();
    currentUserRole = user.role || 'admin';
    localStorage.setItem('jwt_user', JSON.stringify(user));
  } catch (e) {}

  if (userJson) {
    try {
      const u = JSON.parse(userJson);
      currentUserRole = u.role || 'admin';
      const nameElem = document.getElementById('user-display-name') || document.getElementById('top-user-name');
      if (nameElem) nameElem.innerText = u.full_name || 'ADK Administrator';
      const roleElem = document.getElementById('user-display-role') || document.getElementById('top-user-role');
      if (roleElem) roleElem.innerText = currentUserRole.toUpperCase();
      const avatarElem = document.getElementById('top-user-avatar');
      if (avatarElem) avatarElem.innerText = (u.full_name || 'AD').substring(0, 2).toUpperCase();
    } catch (e) {}
  }

  applyRoleUIRestrictions();
  hideLoginModal();
  loadDashboardData();
  loadDepartments();
  loadEmployees();
  loadMonthlyPayrollRoster();
  loadLeaves();
  loadSuppliersDirectory();
  loadSupplierPayments();
  loadFinanceAnalytics();
  loadSettings();
  loadUsersList();
}

function applyRoleUIRestrictions() {
  const isViewer = currentUserRole === 'viewer';
  
  const addEmpBtn = document.getElementById('add-emp-btn');
  if (addEmpBtn) addEmpBtn.style.display = isViewer ? 'none' : 'inline-flex';

  const payrollNav = document.getElementById('nav-payroll-item');
  if (payrollNav) payrollNav.style.display = isViewer ? 'none' : 'block';

  const backupBtn = document.getElementById('gdrive-backup-btn');
  if (backupBtn) backupBtn.style.display = isViewer ? 'none' : 'inline-flex';

  const financeNav = document.getElementById('nav-finance-item');
  if (financeNav) financeNav.style.display = isViewer ? 'none' : 'block';

  const settingsNav = document.getElementById('nav-settings-item');
  if (settingsNav) settingsNav.style.display = isViewer ? 'none' : 'block';
}

function showLoginModal() {
  const m = document.getElementById('modal-login');
  if (m) m.classList.add('active');
}

function hideLoginModal() {
  const m = document.getElementById('modal-login');
  if (m) m.classList.remove('active');
}

function fillDefaultAdminCredentials() {
  const emailEl = document.getElementById('login-email');
  if (emailEl) emailEl.value = 'admin@adknprotech.com';
  const passEl = document.getElementById('login-password');
  if (passEl) passEl.value = 'AdminSecret123!';
  showToast('Admin credentials filled. Click "Sign In" to proceed.', 'info');
}

async function submitLogin() {
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const errBox = document.getElementById('login-error-alert');

  if (errBox) errBox.style.display = 'none';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    if (!res.ok) {
      const err = await res.json();
      if (errBox) {
        errBox.innerText = err.detail || 'Login failed. Please check credentials.';
        errBox.style.display = 'block';
      }
      return;
    }

    const data = await res.json();
    localStorage.setItem('jwt_token', data.access_token);
    localStorage.setItem('jwt_user', JSON.stringify(data.user));

    checkAuthSession();
    showToast(`Welcome back, ${data.user.full_name}! Signed in successfully.`);

  } catch (err) {
    if (errBox) {
      errBox.innerText = `Network error: ${err}`;
      errBox.style.display = 'block';
    }
  }
}

function logoutUser() {
  localStorage.removeItem('jwt_token');
  localStorage.removeItem('jwt_user');
  showLoginModal();
  showToast('You have been logged out.', 'info');
}

function getAuthHeaders() {
  const token = localStorage.getItem('jwt_token') || '';
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

// Section Switching with robust element selection
function switchSection(sectionId) {
  document.querySelectorAll('.content-section').forEach(sec => sec.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));

  const targetSec = document.getElementById(`section-${sectionId}`);
  if (targetSec) targetSec.classList.add('active');

  const activeLink = document.querySelector(`.nav-link[data-section="${sectionId}"]`);
  if (activeLink) activeLink.classList.add('active');

  const titleMap = {
    'dashboard': ['Dashboard Overview', 'Comprehensive operational overview of workforce, compliance, and accounts payable'],
    'employees': ['Employee Directory', 'Manage employee profiles, Iqama details, GOSI numbers, and document vaults'],
    'departments': ['Department Management', 'Manage organizational departments, manager assignments, and annual budgets'],
    'payroll': ['Monthly Worker Payroll Tracking', 'Manage worker monthly salaries, automated payslips, GOSI contributions, and WPS exports'],
    'salary-tracking': ['Salary & Allowances Hub', 'Track employee compensation, manage allowance categories, record salary adjustments, and view audit logs'],
    'leaves': ['Leave Management', 'Track annual leave balances, sick leave requests, and approval workflows'],
    'compliance': ['Saudi Compliance Hub', 'Interactive EOSB (Articles 84/85/87), GOSI contributions, and Nitaqat tools'],
    'suppliers': ['Vendor Payables (AP)', 'Track pending vendor invoices, accounts payable liabilities, disbursements, and PDF exports'],
    'collections': ['Client Collections & Accounts Receivable', 'Track client billing invoices, inbound customer collections, and monthly revenue collection lists'],
    'finance': ['Finance & Aging Analytics', 'Accounts Payable aging schedules, vendor liabilities, and cash outflow forecasting'],
    'settings': ['System & Users Settings', 'Configure company legal details, CR number, user accounts, and backups']
  };

  const titleElem = document.getElementById('page-heading') || document.getElementById('current-section-title');
  const subElem = document.getElementById('page-subheading') || document.getElementById('current-breadcrumb');
  if (titleMap[sectionId]) {
    if (titleElem) titleElem.innerText = titleMap[sectionId][0];
    if (subElem) subElem.innerText = titleMap[sectionId][1];
  }

  if (sectionId === 'dashboard') loadDashboardData();
  if (sectionId === 'employees') loadEmployees();
  if (sectionId === 'departments') loadDepartments();
  if (sectionId === 'payroll') loadMonthlyPayrollRoster();
  if (sectionId === 'salary-tracking') loadSalaryTrackingHub();
  if (sectionId === 'leaves') loadLeaves();
  if (sectionId === 'suppliers') loadSupplierPayments();
  if (sectionId === 'collections') {
    loadClientCollectionsHub();
    loadClientsDirectory();
  }
  if (sectionId === 'finance') loadFinanceAnalytics();
  if (sectionId === 'settings') {
    loadSettings();
    loadUsersList();
  }
}

// Modal Helpers
function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('active');
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('active');
}

// 1. DASHBOARD LOAD
async function loadDashboardData() {
  try {
    const res = await fetch('/api/dashboard/stats', { headers: getAuthHeaders() });
    if (!res.ok) return;
    const data = await res.json();

    document.getElementById('stat-total-emp').innerText = data.total_employees;
    document.getElementById('stat-saudization-pct').innerText = `${data.saudization.saudization_percentage}%`;
    document.getElementById('stat-monthly-payroll').innerText = `SAR ${data.total_monthly_payroll.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
    document.getElementById('stat-pending-payables').innerText = `SAR ${data.pending_supplier_payables.toLocaleString('en-US', {minimumFractionDigits: 2})}`;

    // Nitaqat Banner
    const nb = document.getElementById('nitaqat-banner');
    if (nb) {
      nb.style.backgroundColor = data.saudization.nitaqat_color;
      document.getElementById('nitaqat-band-name').innerText = `Nitaqat Band: ${data.saudization.nitaqat_band}`;
      document.getElementById('nitaqat-status-desc').innerText = data.saudization.status_description;
      document.getElementById('nitaqat-ratio-display').innerText = `${data.saudization.saudization_percentage}%`;
    }

    // Alerts Table
    const alertsBody = document.getElementById('alerts-table-body');
    const badge = document.getElementById('alert-count-badge');
    if (badge) badge.innerText = `${data.expiring_alerts_count} Alerts`;

    if (alertsBody) {
      if (data.alerts_summary.length === 0) {
        alertsBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--success); font-weight: 600;">All Iqama and passport documents are fully up to date!</td></tr>`;
      } else {
        alertsBody.innerHTML = data.alerts_summary.map(a => `
          <tr>
            <td><strong>${a.employee_name}</strong></td>
            <td><span class="badge badge-pending">${a.doc_type}</span></td>
            <td>${a.expiry_date}</td>
            <td><span class="badge ${a.severity === 'CRITICAL' ? 'badge-critical' : 'badge-pending'}">${a.days_remaining} Days</span></td>
          </tr>
        `).join('');
      }
    }

    // Dept Distribution Table
    const deptBody = document.getElementById('dept-dist-body');
    if (deptBody) {
      deptBody.innerHTML = data.department_distribution.map(d => `
        <tr>
          <td><strong>${d.name}</strong></td>
          <td><span class="badge badge-saudi">${d.emp_count} Staff</span></td>
        </tr>
      `).join('');
    }

  } catch (err) {
    console.error('Error loading dashboard stats:', err);
  }
}

// 2. DEPARTMENTS CRUD
async function loadDepartments() {
  try {
    const res = await fetch('/api/departments', { headers: getAuthHeaders() });
    if (!res.ok) return;
    allDepartments = await res.json();

    const tbody = document.getElementById('departments-table-body');
    if (tbody) {
      if (allDepartments.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center;">No departments registered yet.</td></tr>`;
      } else {
        tbody.innerHTML = allDepartments.map(d => `
          <tr>
            <td><code>${d.code}</code></td>
            <td><strong>${d.name}</strong></td>
            <td>${d.manager_name || 'Unassigned'}</td>
            <td>SAR ${(d.budget || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
            <td><span class="badge badge-saudi">${d.employee_count} Employees</span></td>
            <td>
              <div style="display: flex; gap: 6px;">
                ${currentUserRole !== 'viewer' ? `
                  <button class="btn btn-outline" style="padding: 2px 8px; font-size: 0.75rem;" onclick="openEditDepartmentModal(${d.id})">
                    ✏️ Edit
                  </button>
                ` : ''}
                ${currentUserRole === 'admin' ? `
                  <button class="btn btn-danger" style="padding: 2px 8px; font-size: 0.75rem;" onclick="deleteDepartment(${d.id}, '${d.name.replace(/'/g, "\\'")}')">
                    🗑️ Delete
                  </button>
                ` : ''}
              </div>
            </td>
          </tr>
        `).join('');
      }
    }

    // Populate dropdowns
    const addSelect = document.getElementById('add-emp-dept-select');
    const editSelect = document.getElementById('edit-emp-dept-select');
    const filterSelect = document.getElementById('emp-filter-dept');

    const optionsHtml = allDepartments.map(d => `<option value="${d.id}">${d.name} (${d.code})</option>`).join('');
    
    if (addSelect) addSelect.innerHTML = optionsHtml;
    if (editSelect) editSelect.innerHTML = optionsHtml;
    if (filterSelect) filterSelect.innerHTML = `<option value="">All Departments</option>` + optionsHtml;

  } catch (err) {
    console.error('Error loading departments:', err);
  }
}

function openAddDepartmentModal() {
  document.getElementById('department-form').reset();
  document.getElementById('dept-id').value = '';
  document.getElementById('dept-modal-title').innerText = '+ Create New Department';
  openModal('modal-department');
}

function openEditDepartmentModal(deptId) {
  const d = allDepartments.find(x => x.id === deptId);
  if (!d) return;

  document.getElementById('dept-id').value = d.id;
  document.getElementById('dept-name').value = d.name;
  document.getElementById('dept-code').value = d.code;
  document.getElementById('dept-manager').value = d.manager_name || '';
  document.getElementById('dept-budget').value = d.budget || 0;
  document.getElementById('dept-modal-title').innerText = '✏️ Edit Department';
  openModal('modal-department');
}

async function submitDepartment() {
  const deptId = document.getElementById('dept-id').value;
  const payload = {
    name: document.getElementById('dept-name').value,
    code: document.getElementById('dept-code').value,
    manager_name: document.getElementById('dept-manager').value,
    budget: parseFloat(document.getElementById('dept-budget').value || 0)
  };

  try {
    const method = deptId ? 'PUT' : 'POST';
    const url = deptId ? `/api/departments/${deptId}` : '/api/departments';

    const res = await fetch(url, {
      method: method,
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(err.detail || 'Department operation failed', 'error');
      return;
    }

    closeModal('modal-department');
    showToast(deptId ? 'Department updated successfully!' : 'Department created successfully!');
    await Promise.all([
      loadDepartments(),
      loadEmployees(),
      loadSalaryTrackingHub(),
      loadDashboardData()
    ]);
  } catch (err) {
    showToast(`Error saving department: ${err}`, 'error');
  }
}

async function deleteDepartment(deptId, name) {
  if (!confirm(`Are you sure you want to delete department '${name}'? Staff will be unassigned.`)) return;

  try {
    const res = await fetch(`/api/departments/${deptId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(err.detail || 'Failed to delete department', 'error');
      return;
    }

    showToast(`Department '${name}' deleted successfully.`);
    await Promise.all([
      loadDepartments(),
      loadEmployees(),
      loadSalaryTrackingHub(),
      loadDashboardData()
    ]);
  } catch (err) {
    showToast(`Delete error: ${err}`, 'error');
  }
}

// 3. EMPLOYEES DIRECTORY, SORTING & MASTERLIST IMPORT
let currentEmpSort = { field: 'hire_date', order: 'asc' };
let selectedImportFile = null;

async function loadEmployees() {
  try {
    const searchElem = document.getElementById('emp-search');
    const search = searchElem ? searchElem.value.trim() : '';
    const saudiElem = document.getElementById('emp-filter-saudi');
    const isSaudi = saudiElem ? saudiElem.value : '';
    const deptElem = document.getElementById('emp-filter-dept');
    const deptId = deptElem ? deptElem.value : '';

    const sortSelect = document.getElementById('emp-sort-select');
    if (sortSelect && sortSelect.value) {
      const parts = sortSelect.value.split(':');
      currentEmpSort.field = parts[0];
      currentEmpSort.order = parts[1] || 'asc';
    }

    updateEmployeeSortHeaderIcons();

    let url = `/api/employees?sort_by=${currentEmpSort.field}&sort_order=${currentEmpSort.order}&`;
    if (search) url += `search=${encodeURIComponent(search)}&`;
    if (isSaudi !== '') url += `is_saudi=${isSaudi}&`;
    if (deptId) url += `department_id=${deptId}&`;

    const res = await fetch(url, { headers: getAuthHeaders() });
    if (!res.ok) return;
    allEmployees = await res.json();

    const tbody = document.getElementById('employees-table-body');
    const leaveEmpSelect = document.getElementById('leave-emp-select');
    if (leaveEmpSelect) {
      leaveEmpSelect.innerHTML = allEmployees.map(e => {
        const fullN = [e.first_name, e.middle_name, e.last_name].filter(Boolean).join(' ');
        return `<option value="${e.id}">${e.emp_code} - ${fullN}</option>`;
      }).join('');
    }

    if (!tbody) return;

    if (allEmployees.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 24px; color: var(--text-muted);">No matching employee records found.</td></tr>`;
      return;
    }

    tbody.innerHTML = allEmployees.map(e => {
      const fullN = [e.first_name, e.middle_name, e.last_name].filter(Boolean).join(' ');
      return `
      <tr>
        <td><strong>${e.emp_code}</strong></td>
        <td>
          <div style="font-weight: 700; color: #0A1128;">${fullN}</div>
          <div style="font-size: 0.78rem; color: var(--text-muted);">${e.arabic_name || ''}</div>
        </td>
        <td>
          <div style="font-weight: 600; color: #1E293B;">${e.hire_date || 'N/A'}</div>
          <div style="font-size: 0.72rem; color: var(--text-muted);">Joining Date</div>
        </td>
        <td><code>${e.national_id_iqama}</code></td>
        <td>${e.nationality}</td>
        <td>${e.department_name || 'Unassigned'}</td>
        <td>${e.designation}</td>
        <td>SAR ${e.basic_salary ? e.basic_salary.toLocaleString('en-US', {minimumFractionDigits: 2}) : '***'}</td>
        <td>
          <span class="badge ${e.is_saudi ? 'badge-saudi' : 'badge-expat'}">
            ${e.is_saudi ? 'Saudi Citizen' : 'Expat'}
          </span>
        </td>
        <td>
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            <button class="btn btn-outline" style="padding: 2px 8px; font-size: 0.75rem;" onclick="viewEmployeeDetail(${e.id})">
              👁️ View
            </button>
            ${currentUserRole !== 'viewer' ? `
              <button class="btn btn-outline" style="padding: 2px 8px; font-size: 0.75rem;" onclick="openEditEmployeeModal(${e.id})">
                ✏️ Edit
              </button>
            ` : ''}
            ${currentUserRole === 'admin' ? `
              <button class="btn btn-danger" style="padding: 2px 8px; font-size: 0.75rem;" onclick="deleteEmployee(${e.id}, '${fullN.replace(/'/g, "\\'")}')">
                🗑️ Delete
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `}).join('');

  } catch (err) {
    console.error('Error loading employees:', err);
  }
}

function handleEmpHeaderSort(field) {
  if (currentEmpSort.field === field) {
    currentEmpSort.order = currentEmpSort.order === 'asc' ? 'desc' : 'asc';
  } else {
    currentEmpSort.field = field;
    currentEmpSort.order = 'asc';
  }
  const sortSelect = document.getElementById('emp-sort-select');
  if (sortSelect) {
    const val = `${currentEmpSort.field}:${currentEmpSort.order}`;
    // Find matching option or set value
    sortSelect.value = val;
  }
  loadEmployees();
}

function updateEmployeeSortHeaderIcons() {
  const fields = ['emp_code', 'first_name', 'hire_date', 'department_name', 'basic_salary'];
  fields.forEach(f => {
    const el = document.getElementById(`sort-icon-${f}`);
    if (el) {
      if (currentEmpSort.field === f) {
        el.innerText = currentEmpSort.order === 'asc' ? '▲' : '▼';
        el.style.color = '#0047AB';
        el.style.fontWeight = 'bold';
      } else {
        el.innerText = '↕';
        el.style.color = '#94A3B8';
        el.style.fontWeight = 'normal';
      }
    }
  });
}

function resetEmployeeFilters() {
  if (document.getElementById('emp-search')) document.getElementById('emp-search').value = '';
  if (document.getElementById('emp-filter-saudi')) document.getElementById('emp-filter-saudi').value = '';
  if (document.getElementById('emp-filter-dept')) document.getElementById('emp-filter-dept').value = '';
  if (document.getElementById('emp-sort-select')) document.getElementById('emp-sort-select').value = 'hire_date:asc';
  currentEmpSort = { field: 'hire_date', order: 'asc' };
  loadEmployees();
}

// Masterlist Import Controls
function openImportEmployeesModal() {
  selectedImportFile = null;
  const fInput = document.getElementById('import-file-input');
  if (fInput) fInput.value = '';
  const selName = document.getElementById('selected-file-name');
  if (selName) {
    selName.innerText = '';
    selName.style.display = 'none';
  }
  const pText = document.getElementById('import-paste-text');
  if (pText) pText.value = '';
  const sMsg = document.getElementById('import-status-msg');
  if (sMsg) sMsg.style.display = 'none';

  switchImportTab('file');
  openModal('modal-import-employees');
}

function switchImportTab(tab) {
  const fileBtn = document.getElementById('import-tab-file-btn');
  const pasteBtn = document.getElementById('import-tab-paste-btn');
  const filePane = document.getElementById('import-pane-file');
  const pastePane = document.getElementById('import-pane-paste');

  if (tab === 'file') {
    if (fileBtn) {
      fileBtn.style.borderBottom = '2px solid var(--primary-color)';
      fileBtn.style.color = 'var(--primary-color)';
    }
    if (pasteBtn) {
      pasteBtn.style.borderBottom = 'none';
      pasteBtn.style.color = 'var(--text-muted)';
    }
    if (filePane) filePane.style.display = 'block';
    if (pastePane) pastePane.style.display = 'none';
  } else {
    if (fileBtn) {
      fileBtn.style.borderBottom = 'none';
      fileBtn.style.color = 'var(--text-muted)';
    }
    if (pasteBtn) {
      pasteBtn.style.borderBottom = '2px solid var(--primary-color)';
      pasteBtn.style.color = 'var(--primary-color)';
    }
    if (filePane) filePane.style.display = 'none';
    if (pastePane) pastePane.style.display = 'block';
  }
}

function handleImportFileSelected(e) {
  const file = e.target.files[0];
  if (!file) return;
  selectedImportFile = file;
  const selName = document.getElementById('selected-file-name');
  if (selName) {
    selName.innerHTML = `📄 Selected File: <strong>${file.name}</strong> (${(file.size / 1024).toFixed(1)} KB)`;
    selName.style.display = 'block';
  }
}

async function submitEmployeeMasterlistImport() {
  const btn = document.getElementById('btn-do-import');
  const statusMsg = document.getElementById('import-status-msg');
  const pasteText = document.getElementById('import-paste-text') ? document.getElementById('import-paste-text').value.trim() : '';

  const formData = new FormData();
  if (selectedImportFile) {
    formData.append('file', selectedImportFile);
  } else if (pasteText) {
    formData.append('raw_text', pasteText);
  } else {
    showToast('Please select an Excel/CSV file or paste table rows.', 'error');
    return;
  }

  try {
    if (btn) {
      btn.disabled = true;
      btn.innerText = '⏳ Processing Masterlist...';
    }

    const res = await fetch('/api/employees/import-masterlist', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: formData
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.detail || 'Import failed', 'error');
      if (statusMsg) {
        statusMsg.className = 'alert alert-danger';
        statusMsg.style.display = 'block';
        statusMsg.innerText = data.detail || 'Import failed';
      }
      return;
    }

    showToast(data.message || 'Masterlist imported successfully!');
    if (statusMsg) {
      statusMsg.className = 'alert alert-success';
      statusMsg.style.display = 'block';
      statusMsg.innerHTML = `
        <strong>✅ Success!</strong> ${data.message}
        <br><span style="font-size: 0.82rem;">Total Processed: <strong>${data.total_processed}</strong> | Created: <strong>${data.created_count}</strong> | Updated: <strong>${data.updated_count}</strong></span>
      `;
    }

    // Refresh directory & dashboard
    loadEmployees();
    loadDepartments();
    loadDashboardData();

    setTimeout(() => {
      closeModal('modal-import-employees');
    }, 1800);

  } catch (err) {
    showToast(`Masterlist import failed: ${err}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerText = '⚡ Import & Populate Directory';
    }
  }
}

function openAddEmployeeModal() {
  document.getElementById('add-employee-form').reset();
  openModal('modal-add-employee');
}

async function submitAddEmployee() {
  const form = document.getElementById('add-employee-form');
  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());

  data.is_saudi = parseInt(data.is_saudi);
  data.department_id = data.department_id ? parseInt(data.department_id) : null;
  data.basic_salary = parseFloat(data.basic_salary || 0);
  data.housing_allowance = 0.0;
  data.transport_allowance = 0.0;
  const meal = parseFloat(data.meal_allowance || 0);
  const site = parseFloat(data.site_allowance || 0);
  const other = parseFloat(data.other_allowances || 0);
  data.other_allowances = other + meal + site;

  // Clean empty strings to null for optional date/text fields
  const optionalFields = [
    'middle_name', 'arabic_name', 'phone', 'dob', 'marital_status', 'religion', 'blood_group',
    'contract_end_date', 'probation_end_date', 'border_number', 'iqama_expiry_date',
    'passport_number', 'passport_expiry_date', 'work_permit_number', 'work_permit_expiry_date',
    'insurance_policy_number', 'medical_insurance_category', 'medical_insurance_expiry_date',
    'driving_license_number', 'driving_license_expiry_date',
    'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relation',
    'bank_name', 'iban', 'gosi_number'
  ];
  for (const f of optionalFields) {
    if (data[f] !== undefined && (data[f] === '' || data[f] === null)) {
      data[f] = null;
    }
  }

  try {
    const res = await fetch('/api/employees', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(err.detail || 'Failed to create employee', 'error');
      return;
    }

    closeModal('modal-add-employee');
    showToast('Employee profile created successfully!');
    await Promise.all([
      loadEmployees(),
      loadSalaryTrackingHub(),
      loadDashboardData()
    ]);
  } catch (err) {
    showToast(`Failed to add employee: ${err}`, 'error');
  }
}

function openEditEmployeeModal(empId) {
  const emp = allEmployees.find(x => x.id === empId);
  if (!emp) return;

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val !== null && val !== undefined ? val : '';
  };

  setVal('edit-emp-id', emp.id);
  setVal('edit-emp-code', emp.emp_code);
  setVal('edit-emp-first-name', emp.first_name);
  setVal('edit-emp-middle-name', emp.middle_name || '');
  setVal('edit-emp-last-name', emp.last_name);
  setVal('edit-emp-arabic-name', emp.arabic_name || '');
  setVal('edit-emp-email', emp.email);
  setVal('edit-emp-phone', emp.phone || '');
  setVal('edit-emp-iqama', emp.national_id_iqama);
  setVal('edit-emp-nationality', emp.nationality);
  setVal('edit-emp-is-saudi', emp.is_saudi);
  setVal('edit-emp-gender', emp.gender || 'Male');
  setVal('edit-emp-dob', emp.dob || '');
  setVal('edit-emp-blood-group', emp.blood_group || '');
  setVal('edit-emp-marital-status', emp.marital_status || 'Single');
  setVal('edit-emp-religion', emp.religion || '');

  if (document.getElementById('edit-emp-dept-select')) document.getElementById('edit-emp-dept-select').value = emp.department_id || '';
  setVal('edit-emp-designation', emp.designation);
  setVal('edit-emp-worker-type', emp.worker_type || 'Direct');
  setVal('edit-emp-hire-date', emp.hire_date);
  setVal('edit-emp-contract-type', emp.contract_type || 'Fixed');
  setVal('edit-emp-contract-end', emp.contract_end_date || '');
  setVal('edit-emp-probation-end', emp.probation_end_date || '');
  setVal('edit-emp-status', emp.status || 'Active');

  setVal('edit-emp-iqama-exp', emp.iqama_expiry_date || '');
  setVal('edit-emp-passport-number', emp.passport_number || '');
  setVal('edit-emp-passport-exp', emp.passport_expiry_date || '');
  setVal('edit-emp-work-permit-number', emp.work_permit_number || '');
  setVal('edit-emp-work-permit-exp', emp.work_permit_expiry_date || '');
  setVal('edit-emp-border-number', emp.border_number || '');
  setVal('edit-emp-insurance-policy', emp.insurance_policy_number || '');
  setVal('edit-emp-insurance-category', emp.medical_insurance_category || '');
  setVal('edit-emp-insurance-exp', emp.medical_insurance_expiry_date || '');
  setVal('edit-emp-driving-license', emp.driving_license_number || '');
  setVal('edit-emp-driving-license-exp', emp.driving_license_expiry_date || '');

  setVal('edit-emp-basic-salary', emp.basic_salary);
  setVal('edit-emp-meal-allow', emp.meal_allowance || 0);
  setVal('edit-emp-site-allow', emp.site_allowance || 0);
  setVal('edit-emp-other-allow', emp.other_allowances || 0);
  setVal('edit-emp-bank-name', emp.bank_name || '');
  setVal('edit-emp-iban', emp.iban || '');
  setVal('edit-emp-gosi-number', emp.gosi_number || '');

  setVal('edit-emp-emergency-name', emp.emergency_contact_name || '');
  setVal('edit-emp-emergency-relation', emp.emergency_contact_relation || '');
  setVal('edit-emp-emergency-phone', emp.emergency_contact_phone || '');

  openModal('modal-edit-employee');
}

async function submitEditEmployee() {
  const empId = document.getElementById('edit-emp-id').value;
  const getVal = (id) => {
    const el = document.getElementById(id);
    return el ? el.value : '';
  };

  const meal = parseFloat(getVal('edit-emp-meal-allow') || 0);
  const site = parseFloat(getVal('edit-emp-site-allow') || 0);
  const other = parseFloat(getVal('edit-emp-other-allow') || 0);

  const payload = {
    emp_code: getVal('edit-emp-code'),
    first_name: getVal('edit-emp-first-name'),
    middle_name: getVal('edit-emp-middle-name') || null,
    last_name: getVal('edit-emp-last-name'),
    arabic_name: getVal('edit-emp-arabic-name') || null,
    email: getVal('edit-emp-email'),
    phone: getVal('edit-emp-phone') || null,
    national_id_iqama: getVal('edit-emp-iqama'),
    nationality: getVal('edit-emp-nationality'),
    gender: getVal('edit-emp-gender') || 'Male',
    is_saudi: parseInt(getVal('edit-emp-is-saudi')),
    dob: getVal('edit-emp-dob') || null,
    marital_status: getVal('edit-emp-marital-status') || null,
    religion: getVal('edit-emp-religion') || null,
    blood_group: getVal('edit-emp-blood-group') || null,
    department_id: document.getElementById('edit-emp-dept-select').value ? parseInt(document.getElementById('edit-emp-dept-select').value) : null,
    designation: getVal('edit-emp-designation'),
    worker_type: getVal('edit-emp-worker-type') || 'Direct',
    hire_date: getVal('edit-emp-hire-date'),
    contract_type: getVal('edit-emp-contract-type') || 'Fixed',
    contract_end_date: getVal('edit-emp-contract-end') || null,
    probation_end_date: getVal('edit-emp-probation-end') || null,
    border_number: getVal('edit-emp-border-number') || null,
    iqama_expiry_date: getVal('edit-emp-iqama-exp') || null,
    passport_number: getVal('edit-emp-passport-number') || null,
    passport_expiry_date: getVal('edit-emp-passport-exp') || null,
    work_permit_number: getVal('edit-emp-work-permit-number') || null,
    work_permit_expiry_date: getVal('edit-emp-work-permit-exp') || null,
    insurance_policy_number: getVal('edit-emp-insurance-policy') || null,
    medical_insurance_category: getVal('edit-emp-insurance-category') || null,
    medical_insurance_expiry_date: getVal('edit-emp-insurance-exp') || null,
    driving_license_number: getVal('edit-emp-driving-license') || null,
    driving_license_expiry_date: getVal('edit-emp-driving-license-exp') || null,
    emergency_contact_name: getVal('edit-emp-emergency-name') || null,
    emergency_contact_phone: getVal('edit-emp-emergency-phone') || null,
    emergency_contact_relation: getVal('edit-emp-emergency-relation') || null,
    bank_name: getVal('edit-emp-bank-name') || null,
    iban: getVal('edit-emp-iban') || null,
    basic_salary: parseFloat(getVal('edit-emp-basic-salary') || 0),
    housing_allowance: 0.0,
    transport_allowance: 0.0,
    other_allowances: other,
    gosi_number: getVal('edit-emp-gosi-number') || null,
    status: getVal('edit-emp-status') || 'Active'
  };

  try {
    const res = await fetch(`/api/employees/${empId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(err.detail || 'Update failed', 'error');
      return;
    }

    closeModal('modal-edit-employee');
    showToast('Employee profile updated successfully!');
    await Promise.all([
      loadEmployees(),
      loadSalaryTrackingHub(),
      loadDashboardData()
    ]);
    if (currentEmployeeId && String(currentEmployeeId) === String(empId)) {
      await viewEmployeeDetail(currentEmployeeId, true);
    }
  } catch (err) {
    showToast(`Failed to update employee: ${err}`, 'error');
  }
}

async function deleteEmployee(empId, name) {
  if (!confirm(`Are you sure you want to remove employee ${name}? All linked records will be deleted.`)) return;

  try {
    const res = await fetch(`/api/employees/${empId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(err.detail || 'Delete failed', 'error');
      return;
    }

    showToast(`Employee ${name} removed.`);
    await Promise.all([
      loadEmployees(),
      loadSalaryTrackingHub(),
      loadDashboardData()
    ]);
  } catch (err) {
    showToast(`Delete error: ${err}`, 'error');
  }
}

// 4. EMPLOYEE PROFILE & FILE VAULT
async function viewEmployeeDetail(empId, keepTab = false) {
  currentEmployeeId = empId;
  openModal('modal-emp-detail');
  if (!keepTab) {
    switchTab('tab-info');
  }

  try {
    const res = await fetch(`/api/employees/${empId}`, { headers: getAuthHeaders() });
    if (!res.ok) return;
    const data = await res.json();

    const emp = data.employee;
    const fullN = [emp.first_name, emp.middle_name, emp.last_name].filter(Boolean).join(' ');
    
    document.getElementById('emp-detail-title').innerText = `Employee Profile: ${fullN}`;
    document.getElementById('detail-emp-name').innerText = `${fullN} ${emp.arabic_name ? '(' + emp.arabic_name + ')' : ''}`;
    document.getElementById('detail-emp-sub').innerText = `${emp.designation} • ${emp.department_name || 'General'} • Code: ${emp.emp_code} • Worker Type: ${emp.worker_type || 'Direct'}`;
    
    document.getElementById('detail-emp-nat-badge').className = `badge ${emp.is_saudi ? 'badge-saudi' : 'badge-expat'}`;
    document.getElementById('detail-emp-nat-badge').innerText = emp.is_saudi ? 'Saudi Citizen' : `Expat (${emp.nationality})`;

    document.getElementById('detail-emp-status-badge').className = `badge badge-active`;
    document.getElementById('detail-emp-status-badge').innerText = emp.status;

    // Avatar
    const avatarImg = document.getElementById('detail-avatar');
    if (emp.photo_filename) {
      avatarImg.src = `/uploads/${emp.photo_filename}`;
    } else {
      avatarImg.src = '/static/css/default-avatar.svg';
    }

    // Helper for Expiry Status Badges
    const today = new Date();
    const getExpiryBadge = (expStr) => {
      if (!expStr || expStr === 'N/A') return `<span style="color: var(--text-muted);">Not Provided</span>`;
      try {
        const expD = new Date(expStr);
        const diffDays = Math.ceil((expD - today) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) {
          return `<span class="badge badge-critical" style="font-size: 0.72rem;">EXPIRED (${Math.abs(diffDays)}d ago)</span>`;
        } else if (diffDays <= 30) {
          return `<span class="badge badge-critical" style="font-size: 0.72rem;">EXPIRING SOON (${diffDays}d)</span>`;
        } else if (diffDays <= 60) {
          return `<span class="badge badge-pending" style="font-size: 0.72rem;">Expiring (${diffDays}d)</span>`;
        } else {
          return `<span class="badge badge-active" style="font-size: 0.72rem;">Valid (${diffDays}d)</span>`;
        }
      } catch (e) {
        return `<span class="badge badge-saudi">${expStr}</span>`;
      }
    };

    // Grid Info
    const grid = document.getElementById('detail-info-grid');
    grid.innerHTML = `
      <!-- Card 1: Identity & Personal -->
      <div style="background: #FFFFFF; border: 1px solid var(--border-color); border-radius: 8px; padding: 14px; grid-column: span 2;">
        <h4 style="font-size: 0.88rem; font-weight: 800; color: #0A1128; margin-bottom: 10px;">👤 Personal & Identity Details</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; font-size: 0.82rem;">
          <div><span style="color: var(--text-muted);">Full Name:</span> <strong>${fullN}</strong></div>
          <div><span style="color: var(--text-muted);">Arabic Name:</span> <strong>${emp.arabic_name || '-'}</strong></div>
          <div><span style="color: var(--text-muted);">Gender / DOB:</span> <strong>${emp.gender || 'Male'} • ${emp.dob || '-'}</strong></div>
          <div><span style="color: var(--text-muted);">Marital Status:</span> <strong>${emp.marital_status || '-'}</strong></div>
          <div><span style="color: var(--text-muted);">Religion:</span> <strong>${emp.religion || '-'}</strong></div>
          <div><span style="color: var(--text-muted);">Blood Group:</span> <strong>${emp.blood_group || '-'}</strong></div>
          <div><span style="color: var(--text-muted);">Email:</span> <strong>${emp.email}</strong></div>
          <div><span style="color: var(--text-muted);">Phone:</span> <strong>${emp.phone || '-'}</strong></div>
          <div><span style="color: var(--text-muted);">Nationality:</span> <strong>${emp.nationality}</strong></div>
        </div>
      </div>

      <!-- Card 2: Saudi Legal Documents & Expiries -->
      <div style="background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 8px; padding: 14px; grid-column: span 2;">
        <h4 style="font-size: 0.88rem; font-weight: 800; color: #92400E; margin-bottom: 10px;">🪪 Saudi Legal Documents & Expiry Status</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; font-size: 0.82rem;">
          <div style="background: #FFF; padding: 8px 10px; border-radius: 6px; border: 1px solid #FEF3C7;">
            <div style="font-size: 0.72rem; color: #78350F; font-weight: 700;">NATIONAL ID / IQAMA</div>
            <div style="font-weight: 800; font-size: 0.9rem; margin: 2px 0;">${emp.national_id_iqama}</div>
            <div>Expiry: <strong>${emp.iqama_expiry_date || 'N/A'}</strong> ${getExpiryBadge(emp.iqama_expiry_date)}</div>
          </div>

          <div style="background: #FFF; padding: 8px 10px; border-radius: 6px; border: 1px solid #FEF3C7;">
            <div style="font-size: 0.72rem; color: #78350F; font-weight: 700;">PASSPORT</div>
            <div style="font-weight: 800; font-size: 0.9rem; margin: 2px 0;">${emp.passport_number || 'N/A'}</div>
            <div>Expiry: <strong>${emp.passport_expiry_date || 'N/A'}</strong> ${getExpiryBadge(emp.passport_expiry_date)}</div>
          </div>

          <div style="background: #FFF; padding: 8px 10px; border-radius: 6px; border: 1px solid #FEF3C7;">
            <div style="font-size: 0.72rem; color: #78350F; font-weight: 700;">QIWA WORK PERMIT</div>
            <div style="font-weight: 800; font-size: 0.9rem; margin: 2px 0;">${emp.work_permit_number || 'N/A'}</div>
            <div>Expiry: <strong>${emp.work_permit_expiry_date || 'N/A'}</strong> ${getExpiryBadge(emp.work_permit_expiry_date)}</div>
          </div>

          <div style="background: #FFF; padding: 8px 10px; border-radius: 6px; border: 1px solid #FEF3C7;">
            <div style="font-size: 0.72rem; color: #78350F; font-weight: 700;">MEDICAL INSURANCE (${emp.medical_insurance_category || 'General'})</div>
            <div style="font-weight: 800; font-size: 0.9rem; margin: 2px 0;">${emp.insurance_policy_number || 'N/A'}</div>
            <div>Expiry: <strong>${emp.medical_insurance_expiry_date || 'N/A'}</strong> ${getExpiryBadge(emp.medical_insurance_expiry_date)}</div>
          </div>

          <div style="background: #FFF; padding: 8px 10px; border-radius: 6px; border: 1px solid #FEF3C7;">
            <div style="font-size: 0.72rem; color: #78350F; font-weight: 700;">DRIVING LICENSE</div>
            <div style="font-weight: 800; font-size: 0.9rem; margin: 2px 0;">${emp.driving_license_number || 'N/A'}</div>
            <div>Expiry: <strong>${emp.driving_license_expiry_date || 'N/A'}</strong> ${getExpiryBadge(emp.driving_license_expiry_date)}</div>
          </div>

          <div style="background: #FFF; padding: 8px 10px; border-radius: 6px; border: 1px solid #FEF3C7;">
            <div style="font-size: 0.72rem; color: #78350F; font-weight: 700;">BORDER / ENTRY NUMBER</div>
            <div style="font-weight: 800; font-size: 0.9rem; margin: 2px 0;">${emp.border_number || 'N/A'}</div>
            <div style="color: var(--text-muted); font-size: 0.75rem;">Saudi Ministry of Interior Entry Tag</div>
          </div>
        </div>
      </div>

      <!-- Card 3: Employment & Contract -->
      <div style="background: #FFFFFF; border: 1px solid var(--border-color); border-radius: 8px; padding: 14px;">
        <h4 style="font-size: 0.88rem; font-weight: 800; color: #0A1128; margin-bottom: 10px;">🏢 Employment & Contract</h4>
        <div style="font-size: 0.82rem; display: flex; flex-direction: column; gap: 6px;">
          <div><span style="color: var(--text-muted);">Department:</span> <strong>${emp.department_name || 'General'}</strong></div>
          <div><span style="color: var(--text-muted);">Designation:</span> <strong>${emp.designation}</strong></div>
          <div><span style="color: var(--text-muted);">Worker Classification:</span> <strong>${emp.worker_type === 'Direct' ? '🔨 Direct (Monthly/30 Rate)' : '🏢 Indirect (Hourly)'}</strong></div>
          <div><span style="color: var(--text-muted);">Hire Date:</span> <strong>${emp.hire_date}</strong></div>
          <div><span style="color: var(--text-muted);">Contract Type:</span> <strong>${emp.contract_type || 'Fixed'}</strong></div>
          <div><span style="color: var(--text-muted);">Contract End Date:</span> <strong>${emp.contract_end_date || 'Indefinite'}</strong></div>
          <div><span style="color: var(--text-muted);">Probation End Date:</span> <strong>${emp.probation_end_date || 'N/A'}</strong></div>
        </div>
      </div>

      <!-- Card 4: Compensation, Banking & Emergency -->
      <div style="background: #FFFFFF; border: 1px solid var(--border-color); border-radius: 8px; padding: 14px;">
        <h4 style="font-size: 0.88rem; font-weight: 800; color: #0A1128; margin-bottom: 10px;">💰 Compensation & Emergency</h4>
        <div style="font-size: 0.82rem; display: flex; flex-direction: column; gap: 6px;">
          <div><span style="color: var(--text-muted);">Basic Salary:</span> <strong>${emp.basic_salary ? 'SAR ' + emp.basic_salary.toLocaleString('en-US', {minimumFractionDigits: 2}) : 'Restricted'}</strong></div>
          <div><span style="color: var(--text-muted);">Meal Allowance:</span> <strong>SAR ${(emp.meal_allowance || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</strong></div>
          <div><span style="color: var(--text-muted);">Project / Site Allow.:</span> <strong>SAR ${(emp.site_allowance || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</strong></div>
          <div><span style="color: var(--text-muted);">Other Allowances:</span> <strong>SAR ${(emp.other_allowances || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</strong></div>
          <div><span style="color: var(--text-muted);">Total Gross Salary:</span> <strong style="color: #059669;">SAR ${(emp.gross_salary || (emp.basic_salary + (emp.meal_allowance||0) + (emp.site_allowance||0) + (emp.other_allowances||0))).toLocaleString('en-US', {minimumFractionDigits: 2})}</strong></div>
          <div><span style="color: var(--text-muted);">Bank & IBAN:</span> <strong>${emp.bank_name || 'N/A'} • ${emp.iban || 'N/A'}</strong></div>
          <hr style="border: none; border-top: 1px solid var(--border-color); margin: 4px 0;">
          <div style="color: #991B1B; font-weight: 700;">🚨 Emergency Contact:</div>
          <div><strong>${emp.emergency_contact_name || 'N/A'}</strong> (${emp.emergency_contact_relation || 'Relation N/A'}) • <strong>${emp.emergency_contact_phone || 'N/A'}</strong></div>
        </div>
      </div>
    `;

    // GOSI Box
    const gosi = data.gosi_breakdown;
    document.getElementById('detail-gosi-box').innerHTML = `
      <div class="card" style="background: #F0FDF4; border-color: #A7F3D0; margin-bottom: 0;">
        <h4 style="color: #065F46; margin-bottom: 10px;">GOSI Contribution Profile</h4>
        <p style="font-size: 0.88rem;">GOSI Number: <strong>${emp.gosi_number || 'N/A'}</strong></p>
        <p style="font-size: 0.88rem;">Eligible Monthly Base Wage: <strong>SAR ${gosi.gosi_base.toLocaleString()}</strong></p>
        <hr style="margin: 10px 0; border: none; border-top: 1px solid #A7F3D0;">
        <div style="display: flex; justify-content: space-between; font-size: 0.88rem;">
          <span>Employee Deduction: <strong>SAR ${gosi.employee_deduction.toLocaleString()}</strong></span>
          <span>Employer Contribution: <strong>SAR ${gosi.employer_contribution.toLocaleString()}</strong></span>
        </div>
      </div>
    `;

    // Docs Table
    const docsBody = document.getElementById('detail-docs-body');
    if (data.documents.length === 0) {
      docsBody.innerHTML = `<tr><td colspan="5" style="text-align: center;">No documents uploaded to vault yet.</td></tr>`;
    } else {
      docsBody.innerHTML = data.documents.map(d => `
        <tr>
          <td><span class="badge badge-saudi">${d.doc_type}</span></td>
          <td><strong>${d.file_name}</strong></td>
          <td>${d.upload_date}</td>
          <td>${d.expiry_date || 'N/A'}</td>
          <td>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-outline" style="padding: 2px 8px; font-size: 0.75rem;" onclick="downloadDocumentFile(${d.id})">
                ⬇️ Download
              </button>
              ${currentUserRole !== 'viewer' ? `
                <button class="btn btn-danger" style="padding: 2px 8px; font-size: 0.75rem;" onclick="deleteDocument(${d.id})">
                  🗑️
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `).join('');
    }

    // Leaves Table
    const leavesBody = document.getElementById('detail-leaves-body');
    if (data.leaves && data.leaves.length === 0) {
      leavesBody.innerHTML = `<tr><td colspan="5" style="text-align: center;">No leave applications found for this employee.</td></tr>`;
    } else if (data.leaves) {
      leavesBody.innerHTML = data.leaves.map(l => `
        <tr>
          <td>${l.leave_type}</td>
          <td>${l.start_date}</td>
          <td>${l.end_date}</td>
          <td>${l.days} Days</td>
          <td><span class="badge ${l.status === 'Approved' ? 'badge-active' : 'badge-pending'}">${l.status}</span></td>
        </tr>
      `).join('');
    }

    // Financial Cards & Allowances
    const fin = data.financial_summary || {};
    const bSalary = fin.basic_salary || emp.basic_salary || 0;
    const tAllow = fin.total_allowances || (parseFloat(emp.housing_allowance || 0) + parseFloat(emp.transport_allowance || 0) + parseFloat(emp.other_allowances || 0));
    const gosiW = bSalary + (parseFloat(emp.housing_allowance || 0));
    const gSalary = bSalary + tAllow;

    if (document.getElementById('card-basic-salary')) document.getElementById('card-basic-salary').innerText = `SAR ${bSalary.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
    if (document.getElementById('card-total-allowances')) document.getElementById('card-total-allowances').innerText = `SAR ${tAllow.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
    if (document.getElementById('card-gosi-wage')) document.getElementById('card-gosi-wage').innerText = `SAR ${gosiW.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
    if (document.getElementById('card-gross-salary')) document.getElementById('card-gross-salary').innerText = `SAR ${gSalary.toLocaleString('en-US', {minimumFractionDigits: 2})}`;

    // Allowances Table
    const allowBody = document.getElementById('detail-allowances-body');
    if (allowBody) {
      const allows = data.allowances || [];
      if (allows.length === 0) {
        allowBody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 18px; color: var(--text-muted);">No separate allowance benefits assigned yet. Click '+ Assign Allowance' above.</td></tr>`;
      } else {
        allowBody.innerHTML = allows.map(a => `
          <tr>
            <td>
              <strong>${a.category_name}</strong>
              ${a.category_name_ar ? `<div style="font-size: 0.72rem; color: var(--text-muted);">${a.category_name_ar}</div>` : ''}
            </td>
            <td><strong style="color: #059669; font-size: 0.92rem;">SAR ${parseFloat(a.amount).toLocaleString('en-US', {minimumFractionDigits: 2})}</strong></td>
            <td><span class="badge badge-saudi">${a.frequency || 'Monthly'}</span></td>
            <td>${a.is_gosi_eligible ? '<span class="badge badge-active">✅ GOSI Subject</span>' : '<span style="color: var(--text-muted); font-size: 0.75rem;">Non-GOSI</span>'}</td>
            <td>${a.effective_from || 'N/A'}${a.effective_to ? ' → ' + a.effective_to : ''}</td>
            <td>${a.is_active ? '<span class="badge badge-active">Active</span>' : '<span class="badge badge-pending">Inactive</span>'}</td>
            <td><small style="color: var(--text-muted);">${a.notes || '-'}</small></td>
            <td>
              ${currentUserRole !== 'viewer' ? `
                <button class="btn btn-danger" style="padding: 2px 8px; font-size: 0.72rem;" onclick="deleteEmployeeAllowance(${emp.id}, ${a.id})">
                  🗑️
                </button>
              ` : '-'}
            </td>
          </tr>
        `).join('');
      }
    }

    // Salary Increments History Table
    const histBody = document.getElementById('detail-history-body');
    if (histBody) {
      const hist = data.salary_history || [];
      if (hist.length === 0) {
        histBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 18px; color: var(--text-muted);">No salary adjustments or increments recorded yet.</td></tr>`;
      } else {
        histBody.innerHTML = hist.map(h => {
          const diff = h.new_basic - h.previous_basic;
          const pct = h.previous_basic > 0 ? (diff / h.previous_basic * 100).toFixed(1) : 0;
          return `
            <tr>
              <td><strong>${h.effective_date}</strong></td>
              <td>SAR ${parseFloat(h.previous_basic).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
              <td><strong style="color: #0047AB;">SAR ${parseFloat(h.new_basic).toLocaleString('en-US', {minimumFractionDigits: 2})}</strong></td>
              <td>
                <span class="badge ${diff >= 0 ? 'badge-active' : 'badge-critical'}">
                  ${diff >= 0 ? '+' : ''}${diff.toLocaleString('en-US', {minimumFractionDigits: 2})} SAR (${pct}%)
                </span>
              </td>
              <td><strong>${h.change_reason}</strong></td>
              <td><small>${h.approved_by || 'HR Admin'}</small></td>
              <td><small style="color: var(--text-muted);">${h.notes || '-'}</small></td>
            </tr>
          `;
        }).join('');
      }
    }

    // Audit Logs Table
    const logsBody = document.getElementById('detail-logs-body');
    if (logsBody) {
      const logs = data.salary_logs || [];
      if (logs.length === 0) {
        logsBody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 18px; color: var(--text-muted);">No recent salary audit logs.</td></tr>`;
      } else {
        logsBody.innerHTML = logs.map(l => `
          <tr>
            <td><small style="color: var(--text-muted);">${l.timestamp}</small></td>
            <td><span class="badge badge-pending">${l.action_type}</span></td>
            <td><strong>${l.description}</strong></td>
            <td><small>${l.changed_by}</small></td>
          </tr>
        `).join('');
      }
    }

  } catch (err) {
    console.error('Error fetching employee details:', err);
  }
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  const activeBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  if (activeBtn) activeBtn.classList.add('active');
  const activeContent = document.getElementById(tabId);
  if (activeContent) activeContent.classList.add('active');
}

// Upload Photo Handler
async function uploadEmployeePhoto() {
  const input = document.getElementById('photo-upload-input');
  if (!input.files || !input.files[0]) return;

  const file = input.files[0];
  const formData = new FormData();
  formData.append('file', file);

  const token = localStorage.getItem('jwt_token') || '';

  try {
    const res = await fetch(`/api/employees/${currentEmployeeId}/photo`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(err.detail || 'Photo upload failed', 'error');
      return;
    }

    const data = await res.json();
    document.getElementById('detail-avatar').src = `${data.photo_url}?t=${Date.now()}`;
    showToast('Employee photo updated successfully!');
    loadEmployees();

  } catch (err) {
    showToast(`Photo upload error: ${err}`, 'error');
  }
}

// Upload Document Handler
async function submitUploadDocument() {
  const docType = document.getElementById('upload-doc-type').value;
  const expiryDate = document.getElementById('upload-doc-expiry').value;
  const fileInput = document.getElementById('upload-doc-file');

  if (!fileInput.files || !fileInput.files[0]) {
    showToast('Please select a file to upload.', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('doc_type', docType);
  if (expiryDate) formData.append('expiry_date', expiryDate);
  formData.append('file', fileInput.files[0]);

  const token = localStorage.getItem('jwt_token') || '';

  try {
    const res = await fetch(`/api/employees/${currentEmployeeId}/documents`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(err.detail || 'Document upload failed', 'error');
      return;
    }

    showToast('Document uploaded to vault!');
    fileInput.value = '';
    await Promise.all([
      viewEmployeeDetail(currentEmployeeId, true),
      loadDashboardData()
    ]);

  } catch (err) {
    showToast(`Document upload error: ${err}`, 'error');
  }
}

async function deleteDocument(docId) {
  if (!confirm('Are you sure you want to delete this document from the vault?')) return;

  try {
    const res = await fetch(`/api/documents/${docId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (!res.ok) {
      showToast('Failed to delete document', 'error');
      return;
    }

    showToast('Document removed from vault.');
    await Promise.all([
      viewEmployeeDetail(currentEmployeeId, true),
      loadDashboardData()
    ]);
  } catch (err) {
    showToast(`Delete error: ${err}`, 'error');
  }
}

// 5. MONTHLY WORKER PAYROLL TRACKING & WPS ENGINE
async function loadMonthlyPayrollRoster() {
  if (currentUserRole === 'viewer') return;
  const monthSelect = document.getElementById('roster-select-month');
  const yearInput = document.getElementById('roster-select-year');
  if (!monthSelect || !yearInput) return;

  const month = parseInt(monthSelect.value);
  const year = parseInt(yearInput.value);

  const titleElem = document.getElementById('payroll-active-period-title');
  if (titleElem) {
    titleElem.innerText = `Payroll Roster — ${MONTH_NAMES_MAP[month]} ${year}`;
  }

  const tbody = document.getElementById('payroll-roster-body');
  const tfoot = document.getElementById('payroll-roster-foot');
  const statusBanner = document.getElementById('roster-status-banner');

  if (tbody) tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; padding: 20px;">Loading payroll data for ${MONTH_NAMES_MAP[month]} ${year}...</td></tr>`;

  try {
    const res = await fetch(`/api/payroll/monthly-roster?month=${month}&year=${year}`, { headers: getAuthHeaders() });
    if (!res.ok) {
      showToast('Failed to fetch monthly payroll roster', 'error');
      return;
    }
    const data = await res.json();
    currentRosterWorkers = data.workers || [];
    currentPayrollRunId = data.run ? data.run.id : null;

    // Update KPI Cards
    const sum = data.summary;
    document.getElementById('roster-kpi-workers').innerText = `${sum.total_workers} Staff`;
    document.getElementById('roster-kpi-gross').innerText = `SAR ${sum.total_gross.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
    document.getElementById('roster-kpi-gosi').innerText = `SAR ${sum.total_gosi.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
    document.getElementById('roster-kpi-net').innerText = `SAR ${sum.total_net.toLocaleString('en-US', {minimumFractionDigits: 2})}`;

    if (statusBanner) {
      if (data.has_run && currentRosterWorkers.length > 0) {
        statusBanner.innerHTML = `<span style="color: #059669; font-weight: 700;">● Active Payroll Run #${data.run.id} (${currentRosterWorkers.length} Workers Verified)</span>`;
      } else {
        statusBanner.innerHTML = `<span style="color: #D97706; font-weight: 700;">⚠️ No workers registered for ${MONTH_NAMES_MAP[month]} ${year}. Click "Auto-Populate Roster" or "Add Worker".</span>`;
      }
    }

    renderPayrollRosterTable(currentRosterWorkers, sum);
    loadPayrollRuns(); // refresh historical runs list below

  } catch (err) {
    console.error('Error loading monthly payroll roster:', err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; color: var(--danger); padding: 20px;">Error loading roster: ${err}</td></tr>`;
  }
}

function renderPayrollRosterTable(workers, sum) {
  const tbody = document.getElementById('payroll-roster-body');
  const tfoot = document.getElementById('payroll-roster-foot');
  if (!tbody) return;

  if (!workers || workers.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" style="text-align: center; padding: 30px;">
          <div style="font-size: 2rem; margin-bottom: 6px;">👥</div>
          <div style="font-size: 0.95rem; font-weight: 700; color: #0F172A;">No workers on payroll for this month yet.</div>
          <div style="font-size: 0.8rem; color: #64748B; margin-top: 4px;">Click the <strong>"⚡ 1-Click Auto-Populate Roster"</strong> button above to load all active staff.</div>
        </td>
      </tr>
    `;
    if (tfoot) tfoot.innerHTML = '';
    return;
  }

  tbody.innerHTML = workers.map((w, idx) => {
    const isSaudi = w.is_saudi === 1;
    const natBadge = isSaudi ? '<span class="badge badge-saudi">SAUDI</span>' : '<span class="badge badge-expat">EXPAT</span>';
    const meal = parseFloat(w.meal_allowance_pay || w.meal_allowance || 0);
    const site = parseFloat(w.adjustment_add || w.site_allowance || 0);
    const wps = parseFloat(w.wps_deduction || 0);
    const water = parseFloat(w.water_bill || 0);
    const adv = parseFloat(w.cash_advance || 0);
    const otherD = parseFloat(w.other_deductions || 0) + parseFloat(w.gosi_employee || 0);
    const totDed = wps + water + adv + otherD;

    return `
      <tr>
        <td><strong>${w.emp_code}</strong></td>
        <td>
          <div style="font-weight: 700; color: #0F172A;">${w.first_name} ${w.last_name} ${natBadge}</div>
          <small style="color: #64748B;">${w.designation || 'Staff'} • ${w.national_id_iqama || ''}</small>
        </td>
        <td>${w.department_name || 'Operations'}</td>
        <td style="text-align: right; font-weight: 600;">SAR ${parseFloat(w.basic_salary || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
        <td style="text-align: right;">SAR ${meal.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
        <td style="text-align: right;">SAR ${site.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
        <td style="text-align: right; font-weight: 700; color: #0047AB;">SAR ${parseFloat(w.gross_salary || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
        <td style="text-align: right; font-weight: 600; color: #DC2626;" title="WPS: ${wps} | Water: ${water} | Advance: ${adv} | GOSI/Other: ${otherD}">
          SAR ${totDed.toLocaleString('en-US', {minimumFractionDigits: 2})}
        </td>
        <td style="text-align: right; font-weight: 800; color: #059669; font-size: 0.95rem;">SAR ${parseFloat(w.net_salary || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
        <td style="text-align: center;">
          <div style="display: flex; gap: 6px; justify-content: center; flex-wrap: wrap;">
            <button class="btn btn-outline" style="padding: 3px 10px; font-size: 0.78rem; border-color: #0047AB; color: #0047AB; font-weight: 700;" title="Set Monthly Compensation Values" onclick="openAdjustWorkerPayModal(${w.id})">
              ✏️ Adjust Pay
            </button>
            <button class="btn btn-outline" style="padding: 3px 8px; font-size: 0.78rem; background: #EFF6FF;" title="Print Official Payslip Voucher" onclick="downloadWorkerPayslipPdf(${w.id})">
              📄 Payslip
            </button>
            ${currentUserRole === 'admin' ? `
              <button class="btn btn-danger" style="padding: 3px 8px; font-size: 0.75rem;" title="Remove from this month" onclick="removeWorkerFromMonthlyPayroll(${w.id}, '${w.first_name} ${w.last_name}')">
                🗑️
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  if (tfoot && sum) {
    const totMealSum = workers.reduce((acc, w) => acc + (parseFloat(w.meal_allowance_pay || w.meal_allowance || 0)), 0);
    const totSiteSum = workers.reduce((acc, w) => acc + (parseFloat(w.adjustment_add || w.site_allowance || 0)), 0);
    tfoot.innerHTML = `
      <tr>
        <td colspan="3" style="font-weight: 800; color: #0F172A;">MONTHLY ROSTER TOTALS (${workers.length} WORKERS):</td>
        <td style="text-align: right; font-weight: 800;">SAR ${sum.total_basic.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
        <td style="text-align: right; font-weight: 800;">SAR ${totMealSum.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
        <td style="text-align: right; font-weight: 800;">SAR ${totSiteSum.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
        <td style="text-align: right; font-weight: 900; color: #0047AB;">SAR ${sum.total_gross.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
        <td style="text-align: right; font-weight: 800; color: #DC2626;">SAR ${(sum.total_deductions || (sum.total_gosi + sum.total_other_ded)).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
        <td style="text-align: right; font-weight: 900; color: #059669; font-size: 1rem;">SAR ${sum.total_net.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
        <td></td>
      </tr>
    `;
  }
}

function filterPayrollRosterTable() {
  const query = (document.getElementById('roster-worker-search').value || '').toLowerCase();
  if (!query) {
    renderPayrollRosterTable(currentRosterWorkers);
    return;
  }

  const filtered = currentRosterWorkers.filter(w => 
    (w.first_name + ' ' + w.last_name).toLowerCase().includes(query) ||
    (w.emp_code || '').toLowerCase().includes(query) ||
    (w.national_id_iqama || '').toLowerCase().includes(query) ||
    (w.department_name || '').toLowerCase().includes(query)
  );

  renderPayrollRosterTable(filtered);
}

async function populateMonthlyRoster() {
  const month = parseInt(document.getElementById('roster-select-month').value);
  const year = parseInt(document.getElementById('roster-select-year').value);

  try {
    showToast(`Populating roster for ${MONTH_NAMES_MAP[month]} ${year}...`, 'info');
    const res = await fetch('/api/payroll/monthly-roster/populate', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ month, year })
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(err.detail || 'Failed to populate roster', 'error');
      return;
    }

    await loadMonthlyPayrollRoster();
    showToast(`✅ Roster populated with active workforce for ${MONTH_NAMES_MAP[month]} ${year}!`);

  } catch (err) {
    showToast(`Population error: ${err}`, 'error');
  }
}

function openAdjustWorkerPayModal(detailId) {
  const worker = currentRosterWorkers.find(x => x.id === detailId);
  if (!worker) return;

  const month = parseInt(document.getElementById('roster-select-month').value);
  const year = parseInt(document.getElementById('roster-select-year').value);

  document.getElementById('adjust-detail-id').value = worker.id;
  document.getElementById('adjust-employee-id').value = worker.employee_id;
  document.getElementById('adjust-is-saudi').value = worker.is_saudi || 0;

  document.getElementById('adjust-worker-title').innerText = `💰 Set Compensation: ${worker.first_name} ${worker.last_name}`;
  document.getElementById('adjust-worker-period-subtitle').innerText = `Month of ${MONTH_NAMES_MAP[month]} ${year} • Code: ${worker.emp_code}`;
  document.getElementById('adjust-worker-name-banner').innerText = `${worker.first_name} ${worker.last_name}`;
  document.getElementById('adjust-worker-dept-banner').innerText = `${worker.department_name || 'Operations'} • ${worker.designation || 'Staff'}`;
  
  const natBadge = document.getElementById('adjust-worker-nat-badge');
  if (natBadge) {
    natBadge.className = `badge ${worker.is_saudi === 1 ? 'badge-saudi' : 'badge-expat'}`;
    natBadge.innerText = worker.is_saudi === 1 ? 'SAUDI NATIONAL' : 'EXPATRIATE';
  }

  const basic = parseFloat(worker.basic_salary || 0);
  const meal = parseFloat(worker.meal_allowance_pay || worker.meal_allowance || 0);
  const site = parseFloat(worker.site_allowance || (worker.adjustment_add && !worker.other_allowances ? worker.adjustment_add : 0) || 0);
  const otherAllow = parseFloat(worker.other_allowances || 0);
  const wps = parseFloat(worker.wps_deduction || 0);
  const water = parseFloat(worker.water_bill || 0);
  const adv = parseFloat(worker.cash_advance || 0);
  const otherDed = parseFloat(worker.other_deductions || 0);

  document.getElementById('adjust-cutoff-period').value = worker.cutoff_period || `${MONTH_NAMES_MAP[month]} 01-31, ${year}`;
  document.getElementById('adjust-monthly-rate').value = basic.toFixed(2);
  document.getElementById('adjust-meal-pay').value = meal.toFixed(2);
  document.getElementById('adjust-site-allowance').value = site.toFixed(2);
  document.getElementById('adjust-other-allowance').value = otherAllow.toFixed(2);

  document.getElementById('adjust-wps-deduction').value = wps.toFixed(2);
  document.getElementById('adjust-water-bill').value = water.toFixed(2);
  document.getElementById('adjust-cash-advance').value = adv.toFixed(2);
  document.getElementById('adjust-other-deductions').value = otherDed.toFixed(2);

  document.getElementById('adjust-remarks').value = worker.remarks || '';

  recalcAdjustWorkerPayLive();
  openModal('modal-adjust-worker-pay');
}

function recalcAdjustWorkerPayLive() {
  const basic = parseFloat(document.getElementById('adjust-monthly-rate').value || 0);
  const meal = parseFloat(document.getElementById('adjust-meal-pay').value || 0);
  const site = parseFloat(document.getElementById('adjust-site-allowance').value || 0);
  const otherAllow = parseFloat(document.getElementById('adjust-other-allowance').value || 0);

  const totalPay = Math.round((basic + meal + site + otherAllow) * 100) / 100;

  const wps = parseFloat(document.getElementById('adjust-wps-deduction').value || 0);
  const water = parseFloat(document.getElementById('adjust-water-bill').value || 0);
  const advance = parseFloat(document.getElementById('adjust-cash-advance').value || 0);
  const otherDed = parseFloat(document.getElementById('adjust-other-deductions').value || 0);

  const totalDeductions = Math.round((wps + water + advance + otherDed) * 100) / 100;
  const netPay = Math.max(0, Math.round((totalPay - totalDeductions) * 100) / 100);

  const liveGross = document.getElementById('adjust-live-gross');
  if (liveGross) liveGross.innerText = `SAR ${totalPay.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
  const liveDed = document.getElementById('adjust-live-ded');
  if (liveDed) liveDed.innerText = `SAR ${totalDeductions.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
  const liveNet = document.getElementById('adjust-live-net');
  if (liveNet) liveNet.innerText = `SAR ${netPay.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
  const liveActual = document.getElementById('adjust-live-actual');
  if (liveActual) liveActual.innerText = `SAR ${netPay.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
}

async function submitSaveWorkerMonthlyPay() {
  const month = parseInt(document.getElementById('roster-select-month').value);
  const year = parseInt(document.getElementById('roster-select-year').value);
  const employee_id = parseInt(document.getElementById('adjust-employee-id').value);

  const basic = parseFloat(document.getElementById('adjust-monthly-rate').value || 0);
  const meal = parseFloat(document.getElementById('adjust-meal-pay').value || 0);
  const site = parseFloat(document.getElementById('adjust-site-allowance').value || 0);
  const otherAllow = parseFloat(document.getElementById('adjust-other-allowance').value || 0);

  const wps = parseFloat(document.getElementById('adjust-wps-deduction').value || 0);
  const water = parseFloat(document.getElementById('adjust-water-bill').value || 0);
  const advance = parseFloat(document.getElementById('adjust-cash-advance').value || 0);
  const otherDed = parseFloat(document.getElementById('adjust-other-deductions').value || 0);

  const payload = {
    month: month,
    year: year,
    employee_id: employee_id,
    basic_salary: basic,
    cutoff_period: document.getElementById('adjust-cutoff-period').value || null,
    days_worked: 30.0,
    daily_rate: basic / 30.0,
    hourly_rate: (basic / 30.0) / 8.0,
    working_hours: 240.0,
    regular_pay: basic,
    meal_allowance_qty: meal > 0 ? (meal / 10.0) : 0,
    meal_allowance_rate: 10.0,
    meal_allowance_pay: meal,
    adjustment_add: site + otherAllow,
    other_allowances: otherAllow,
    wps_deduction: wps,
    water_bill: water,
    other_deductions: otherDed,
    cash_advance: advance,
    adjustment_sub: 0.0,
    remarks: document.getElementById('adjust-remarks').value || null
  };

  try {
    const res = await fetch('/api/payroll/monthly-roster/worker', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(err.detail || 'Failed to save worker pay', 'error');
      return;
    }

    closeModal('modal-adjust-worker-pay');
    await loadMonthlyPayrollRoster();
    showToast('✅ Monthly compensation & deductions saved successfully!');

  } catch (err) {
    showToast(`Error saving pay: ${err}`, 'error');
  }
}

// =========================================================================
// INTERACTIVE WORKER TIMESHEET ATTENDANCE CALENDAR
// =========================================================================
let currentTimesheetDays = [];
let currentTimesheetEmp = null;

async function openWorkerTimesheetModal(employeeId) {
  const monthEl = document.getElementById('roster-select-month');
  const yearEl = document.getElementById('roster-select-year');
  const month = monthEl ? (parseInt(monthEl.value) || (new Date().getMonth() + 1)) : (new Date().getMonth() + 1);
  const year = yearEl ? (parseInt(yearEl.value) || (new Date().getFullYear())) : (new Date().getFullYear());
  const monthName = MONTH_NAMES_MAP[month] || `Month ${month}`;

  showToast(`Loading timesheet calendar for ${monthName} ${year}...`, 'info');

  try {
    const res = await fetch(`/api/payroll/timesheet?employee_id=${employeeId}&month=${month}&year=${year}`, {
      headers: getAuthHeaders()
    });

    if (!res.ok) {
      if (res.status === 401) {
        showToast('Session expired. Please sign in to view timesheet calendar.', 'error');
        showLoginModal();
        return;
      }
      const err = await res.json();
      let errMsg = 'Failed to load timesheet';
      if (typeof err.detail === 'string') errMsg = err.detail;
      else if (Array.isArray(err.detail)) errMsg = err.detail.map(e => e.msg || e.message).join(', ');
      showToast(errMsg, 'error');
      return;
    }

    const data = await res.json();
    currentTimesheetEmp = data.employee;
    currentTimesheetDays = data.days || [];
    const detail = data.detail || {};

    const empIdEl = document.getElementById('ts-employee-id');
    if (empIdEl) empIdEl.value = currentTimesheetEmp.id;
    const mEl = document.getElementById('ts-month');
    if (mEl) mEl.value = month;
    const yEl = document.getElementById('ts-year');
    if (yEl) yEl.value = year;
    const sEl = document.getElementById('ts-is-saudi');
    if (sEl) sEl.value = currentTimesheetEmp.is_saudi;

    const titleEl = document.getElementById('ts-worker-name-title');
    if (titleEl) titleEl.innerText = `${currentTimesheetEmp.first_name} ${currentTimesheetEmp.last_name} — Monthly Timesheet Calendar`;
    const subEl = document.getElementById('ts-worker-meta-subtitle');
    if (subEl) subEl.innerText = `Designation: ${currentTimesheetEmp.designation} • ${currentTimesheetEmp.department_name} • Code: ${currentTimesheetEmp.emp_code} • ${monthName} ${year}`;
    const calMonthEl = document.getElementById('ts-calendar-month-name');
    if (calMonthEl) calMonthEl.innerText = `${monthName} ${year}`;

    const cutoff = detail.cutoff_period || `${monthName} 01-31, ${year}`;
    const cutEl = document.getElementById('ts-cutoff-period');
    if (cutEl) cutEl.value = cutoff;
    
    const wt = currentTimesheetEmp.worker_type || 'Direct';
    const wtEl = document.getElementById('ts-worker-type');
    if (wtEl) wtEl.value = wt;
    updateWorkerTypeHint(wt);

    const mRate = parseFloat(currentTimesheetEmp.basic_salary || 0);
    const mRateEl = document.getElementById('ts-monthly-rate');
    if (mRateEl) mRateEl.value = mRate.toFixed(2);

    const drEl = document.getElementById('ts-daily-rate');
    if (drEl) drEl.value = parseFloat(currentTimesheetEmp.daily_rate || 0).toFixed(8);
    const hrEl = document.getElementById('ts-hourly-rate');
    if (hrEl) hrEl.value = parseFloat(currentTimesheetEmp.hourly_rate || 0).toFixed(2);
    const otEl = document.getElementById('ts-ot-rate');
    if (otEl) otEl.value = parseFloat(currentTimesheetEmp.ot_rate || 0).toFixed(2);

    const setVal = (id, val, def) => {
      const el = document.getElementById(id);
      if (el) el.value = (val !== undefined && val !== null) ? val : def;
    };

    setVal('ts-wps-deduction', detail.wps_deduction, 0.00);
    setVal('ts-water-bill', detail.water_bill, 0.00);
    setVal('ts-other-deductions', detail.other_deductions, 0.00);
    setVal('ts-cash-advance', detail.cash_advance, 0.00);
    setVal('ts-adjustment-add', detail.adjustment_add, 0.00);
    setVal('ts-adjustment-sub', detail.adjustment_sub, 0.00);

    renderTimesheetCalendarGrid();
    recalcTimesheetSummaryLive();
    openModal('modal-worker-timesheet-calendar');

  } catch (err) {
    console.error('Error opening timesheet:', err);
    showToast(`Error opening timesheet: ${err.message || err}`, 'error');
  }
}

function updateWorkerTypeHint(type) {
  const hintEl = document.getElementById('ts-worker-type-hint');
  if (!hintEl) return;
  if (type === 'Direct') {
    hintEl.innerHTML = '🔨 <strong>Direct Worker:</strong> Rate based on Monthly Rate ÷ 30 Daily • Daily ÷ 8 Hourly • Overtime Eligible';
    hintEl.style.color = '#2563EB';
  } else {
    hintEl.innerHTML = '🏢 <strong>Indirect Worker:</strong> Regular Only & Hourly Rate • Overtime Not Applicable';
    hintEl.style.color = '#7C3AED';
  }
}

function onMonthlyRateInput() {
  const mRate = parseFloat(document.getElementById('ts-monthly-rate').value || 0);
  const wt = document.getElementById('ts-worker-type').value;

  if (wt === 'Direct') {
    const dailyRate = mRate > 0 ? (mRate / 30.0) : 0.0;
    const hourlyRate = Math.round((dailyRate / 8.0) * 100) / 100;
    const otRate = Math.round(hourlyRate * 1.5 * 100) / 100;
    document.getElementById('ts-daily-rate').value = dailyRate.toFixed(8);
    document.getElementById('ts-hourly-rate').value = hourlyRate.toFixed(2);
    document.getElementById('ts-ot-rate').value = otRate.toFixed(2);
  } else {
    const hourlyRate = mRate > 0 ? Math.round((mRate / 240.0) * 100) / 100 : 25.00;
    document.getElementById('ts-daily-rate').value = '0.00000000';
    document.getElementById('ts-hourly-rate').value = hourlyRate.toFixed(2);
    document.getElementById('ts-ot-rate').value = '0.00';
  }
  recalcTimesheetSummaryLive();
}

function onTimesheetWorkerTypeChanged() {
  const wt = document.getElementById('ts-worker-type').value;
  updateWorkerTypeHint(wt);
  
  const mRate = parseFloat(document.getElementById('ts-monthly-rate')?.value || (currentTimesheetEmp ? currentTimesheetEmp.basic_salary : 0) || 0);
  if (wt === 'Direct') {
    const dailyRate = mRate > 0 ? (mRate / 30.0) : 83.33333333;
    const hourlyRate = Math.round((dailyRate / 8.0) * 100) / 100;
    const otRate = Math.round(hourlyRate * 1.5 * 100) / 100;
    document.getElementById('ts-daily-rate').value = dailyRate.toFixed(8);
    document.getElementById('ts-hourly-rate').value = hourlyRate.toFixed(2);
    document.getElementById('ts-ot-rate').value = otRate.toFixed(2);
  } else {
    // Indirect: Regular only and hourly
    const hourlyRate = mRate > 0 ? Math.round((mRate / 240.0) * 100) / 100 : 25.00;
    document.getElementById('ts-daily-rate').value = '0.00000000';
    document.getElementById('ts-hourly-rate').value = hourlyRate.toFixed(2);
    document.getElementById('ts-ot-rate').value = '0.00';
  }
  recalcTimesheetSummaryLive();
}

function onDailyRateInput() {
  const dailyRate = parseFloat(document.getElementById('ts-daily-rate').value || 0);
  if (dailyRate > 0) {
    const monthlyRate = dailyRate * 30.0;
    const hourlyRate = Math.round((dailyRate / 8.0) * 100) / 100;
    const otRate = Math.round(hourlyRate * 1.5 * 100) / 100;
    const mRateEl = document.getElementById('ts-monthly-rate');
    if (mRateEl) mRateEl.value = monthlyRate.toFixed(2);
    document.getElementById('ts-hourly-rate').value = hourlyRate.toFixed(2);
    if (document.getElementById('ts-worker-type').value === 'Direct') {
      document.getElementById('ts-ot-rate').value = otRate.toFixed(2);
    }
  }
  recalcTimesheetSummaryLive();
}

function renderTimesheetCalendarGrid() {
  const container = document.getElementById('timesheet-calendar-grid');
  if (!container) return;

  // Header row for Sunday - Saturday
  const weekdaysHdr = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri (Rest)', 'Sat'];
  const hdrHtml = `
    <div style="grid-column: 1 / -1; display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; margin-bottom: 2px; text-align: center;">
      ${weekdaysHdr.map((w, idx) => `
        <div style="font-size: 0.72rem; font-weight: 800; padding: 4px; border-radius: 4px; background: ${idx === 5 ? '#DBEAFE' : '#F1F5F9'}; color: ${idx === 5 ? '#1E40AF' : '#475569'};">
          ${w}
        </div>
      `).join('')}
    </div>
  `;

  // Calculate leading blanks if Day 1 does not start on Sunday (weekday 0)
  let leadingBlanks = '';
  if (currentTimesheetDays.length > 0) {
    const firstDayDate = new Date(currentTimesheetDays[0].date);
    const firstDayOfWeek = firstDayDate.getDay(); // 0 is Sunday
    for (let b = 0; b < firstDayOfWeek; b++) {
      leadingBlanks += `<div class="ts-day-card" style="opacity: 0.25; background: #F8FAFC; border: 1px dashed #CBD5E1; min-height: 90px;"></div>`;
    }
  }

  const daysHtml = currentTimesheetDays.map((d, idx) => {
    let cardClass = 'ts-day-card';
    if (d.day_type === 'RestDay') cardClass += ' rest-day';
    else if (d.day_type === 'Holiday') cardClass += ' holiday';
    else if (d.day_type === 'Leave') cardClass += ' leave';
    else if (d.day_type === 'Absent') cardClass += ' absent';

    const isChecked = d.meal_allowance === 1 ? 'checked' : '';
    const isFriday = d.weekday === 'Fri';
    let fridayNote = '';
    if (isFriday) {
      const daysMap = {};
      currentTimesheetDays.forEach(x => { daysMap[x.day] = x; });
      const thu = daysMap[d.day - 1];
      const sat = daysMap[d.day + 1];
      const thuAbsent = thu && (thu.day_type === 'Absent' || ((parseFloat(thu.regular_hours) || 0) === 0 && !['Holiday', 'Leave', 'RestDay'].includes(thu.day_type)));
      const satAbsent = sat && (sat.day_type === 'Absent' || ((parseFloat(sat.regular_hours) || 0) === 0 && !['Holiday', 'Leave', 'RestDay'].includes(sat.day_type)));
      
      if (!thuAbsent && !satAbsent) {
        fridayNote = '<span style="font-size: 0.58rem; color: #059669; font-weight: 800;" title="Paid Rest Day (Thu & Sat present)">● Paid (8h)</span>';
      } else {
        fridayNote = '<span style="font-size: 0.58rem; color: #DC2626; font-weight: 800;" title="Unpaid: Absent on Thu or Sat">● Unpaid</span>';
      }
    }

    return `
      <div class="${cardClass}" id="ts-card-day-${d.day}">
        <div class="ts-day-hdr">
          <div class="ts-day-num">${d.day} ${fridayNote}</div>
          <!-- 1-Click Fast Day Presets -->
          <div style="display: flex; gap: 2px;">
            <button type="button" style="padding: 1px 4px; font-size: 0.6rem; font-weight: 800; background: #ECFDF5; border: 1px solid #A7F3D0; color: #059669; border-radius: 3px; cursor: pointer;"
              onclick="quickSetDay8h(${d.day})" title="Click to instantly set 8 Hours">
              8h
            </button>
            <button type="button" style="padding: 1px 4px; font-size: 0.6rem; font-weight: 800; background: #FEF2F2; border: 1px solid #FECACA; color: #DC2626; border-radius: 3px; cursor: pointer;"
              onclick="quickSetDayAbsent(${d.day})" title="Click to mark Absent (0h)">
              Abs
            </button>
          </div>
        </div>

        <div class="ts-day-inputs">
          <div class="ts-input-wrap">
            <span class="ts-input-lbl">Reg (h)</span>
            <input type="number" step="0.5" min="0" max="24" class="ts-input-control" value="${d.regular_hours}"
              onchange="onTimesheetDayFieldChange(${d.day}, 'regular_hours', this.value)">
          </div>
          <div class="ts-input-wrap">
            <span class="ts-input-lbl">O.T (h)</span>
            <input type="number" step="0.5" min="0" max="24" class="ts-input-control" value="${d.ot_hours}"
              onchange="onTimesheetDayFieldChange(${d.day}, 'ot_hours', this.value)">
          </div>
        </div>

        <div class="ts-day-footer">
          <select class="ts-type-select" onchange="onTimesheetDayFieldChange(${d.day}, 'day_type', this.value)">
            <option value="Regular" ${d.day_type === 'Regular' ? 'selected' : ''}>🟢 Work</option>
            <option value="RestDay" ${d.day_type === 'RestDay' ? 'selected' : ''}>🔵 Rest</option>
            <option value="Holiday" ${d.day_type === 'Holiday' ? 'selected' : ''}>🟠 Holiday</option>
            <option value="Leave" ${d.day_type === 'Leave' ? 'selected' : ''}>🟡 Leave</option>
            <option value="Absent" ${d.day_type === 'Absent' ? 'selected' : ''}>🔴 Absent</option>
          </select>

          <label class="ts-meal-toggle" title="Meal Allowance (10 SAR)">
            <input type="checkbox" ${isChecked} onchange="onTimesheetDayFieldChange(${d.day}, 'meal_allowance', this.checked ? 1 : 0)">
            <span>🍱</span>
          </label>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = hdrHtml + leadingBlanks + daysHtml;
}

function quickSetDay8h(dayNum) {
  const day = currentTimesheetDays.find(d => d.day === dayNum);
  if (!day) return;
  day.regular_hours = 8.0;
  day.day_type = 'Regular';
  day.meal_allowance = 1;
  renderTimesheetCalendarGrid();
  recalcTimesheetSummaryLive();
  showToast(`Day ${dayNum} set to 8.0 Hours.`, 'info');
}

function quickSetDayAbsent(dayNum) {
  const day = currentTimesheetDays.find(d => d.day === dayNum);
  if (!day) return;
  day.regular_hours = 0.0;
  day.ot_hours = 0.0;
  day.day_type = 'Absent';
  day.meal_allowance = 0;
  renderTimesheetCalendarGrid();
  recalcTimesheetSummaryLive();
  showToast(`Day ${dayNum} marked Absent.`, 'info');
}

function onTimesheetDayFieldChange(dayNum, field, val) {
  const day = currentTimesheetDays.find(d => d.day === dayNum);
  if (!day) return;

  if (field === 'regular_hours' || field === 'ot_hours') {
    day[field] = parseFloat(val) || 0.0;
  } else if (field === 'meal_allowance') {
    day[field] = parseInt(val) || 0;
  } else if (field === 'day_type') {
    day[field] = val;
    if (val === 'Absent') {
      day.regular_hours = 0.0;
      day.ot_hours = 0.0;
      day.meal_allowance = 0;
    }
  }

  renderTimesheetCalendarGrid();
  recalcTimesheetSummaryLive();
}

function fillTimesheetAll8HoursNoAbsent() {
  let count = 0;
  currentTimesheetDays.forEach(d => {
    const isFriday = d.weekday === 'Fri';
    if (d.day_type !== 'Absent') {
      if (isFriday) {
        d.day_type = 'RestDay';
        d.regular_hours = 0.0; // Paid rest day if Thu and Sat are not absent
        d.ot_hours = 0.0;
        d.meal_allowance = 0;
      } else {
        d.day_type = 'Regular';
        d.regular_hours = 8.0;
        d.meal_allowance = 1;
        count++;
      }
    }
  });
  renderTimesheetCalendarGrid();
  recalcTimesheetSummaryLive();
  showToast(`⚡ Filled 8 hours for all workdays (${count} days). Fridays credited as Paid Rest Days.`);
}

function fillTimesheetStandard() {
  currentTimesheetDays.forEach(d => {
    const isFriday = d.weekday === 'Fri';
    if (isFriday) {
      d.day_type = 'RestDay';
      d.regular_hours = 0.0;
      d.ot_hours = 0.0;
      d.meal_allowance = 0;
    } else {
      d.day_type = 'Regular';
      d.regular_hours = 8.0;
      d.ot_hours = 0.0;
      d.meal_allowance = 1;
    }
  });
  renderTimesheetCalendarGrid();
  recalcTimesheetSummaryLive();
  showToast('Calendar filled with standard 8h workdays & Friday rest days.');
}

function fillTimesheetAddOT(addHours) {
  currentTimesheetDays.forEach(d => {
    if (d.day_type === 'Regular' && d.regular_hours > 0) {
      d.ot_hours = parseFloat(addHours);
    }
  });
  renderTimesheetCalendarGrid();
  recalcTimesheetSummaryLive();
  showToast(`Added +${addHours}h overtime to all regular workdays.`);
}

function fillTimesheetAllMeals() {
  currentTimesheetDays.forEach(d => {
    if (d.regular_hours > 0 || d.day_type === 'Regular') {
      d.meal_allowance = 1;
    }
  });
  renderTimesheetCalendarGrid();
  recalcTimesheetSummaryLive();
  showToast('Meal allowance enabled for all active workdays.');
}

function clearTimesheetMonth() {
  currentTimesheetDays.forEach(d => {
    d.regular_hours = 0.0;
    d.ot_hours = 0.0;
    d.day_type = 'Regular';
    d.meal_allowance = 0;
  });
  renderTimesheetCalendarGrid();
  recalcTimesheetSummaryLive();
  showToast('Timesheet hours reset.');
}

function recalcTimesheetSummaryLive() {
  let dailyRate = parseFloat(document.getElementById('ts-daily-rate').value || 0);
  let hourlyRate = parseFloat(document.getElementById('ts-hourly-rate').value || 0);
  if (hourlyRate <= 0 && dailyRate > 0) {
    hourlyRate = Math.round((dailyRate / 8.0) * 100) / 100;
    document.getElementById('ts-hourly-rate').value = hourlyRate.toFixed(2);
  }

  const otRate = parseFloat(document.getElementById('ts-ot-rate').value || (hourlyRate * 1.5));
  const isSaudi = parseInt(document.getElementById('ts-is-saudi').value) === 1;

  // Friday Paid Rest Day Policy: Paid (8h) if NOT absent on Thu & Sat
  const daysMap = {};
  currentTimesheetDays.forEach(d => { daysMap[d.day] = d; });

  let totRegHours = 0.0;
  let restDayHours = 0.0;
  let holidayHours = 0.0;

  currentTimesheetDays.forEach(d => {
    const regH = parseFloat(d.regular_hours) || 0.0;
    const isFriday = d.weekday === 'Fri';

    if (d.day_type === 'Holiday') {
      holidayHours += (regH > 0 ? regH : 8.0);
    } else if (d.day_type === 'RestDay' || isFriday) {
      if (regH > 0) {
        restDayHours += regH;
      } else {
        const thu = daysMap[d.day - 1];
        const sat = daysMap[d.day + 1];

        const thuAbsent = thu && (thu.day_type === 'Absent' || ((parseFloat(thu.regular_hours) || 0) === 0 && !['Holiday', 'Leave', 'RestDay'].includes(thu.day_type)));
        const satAbsent = sat && (sat.day_type === 'Absent' || ((parseFloat(sat.regular_hours) || 0) === 0 && !['Holiday', 'Leave', 'RestDay'].includes(sat.day_type)));

        if (!thuAbsent && !satAbsent) {
          restDayHours += 8.0; // Paid Friday
        } else {
          restDayHours += 0.0; // Unpaid Friday
        }
      }
    } else {
      totRegHours += regH;
    }
  });

  const wt = document.getElementById('ts-worker-type') ? document.getElementById('ts-worker-type').value : 'Direct';
  
  let totOtHours = 0.0;
  let otPay = 0.0;
  let restDayPay = 0.0;
  let holidayPay = 0.0;
  
  if (wt === 'Direct') {
    totOtHours = currentTimesheetDays.reduce((acc, d) => acc + (parseFloat(d.ot_hours) || 0), 0);
    otPay = Math.round(totOtHours * otRate * 100) / 100;
    restDayPay = Math.round(restDayHours * hourlyRate * 100) / 100;
    holidayPay = Math.round(holidayHours * hourlyRate * 100) / 100;
  }

  const daysWorked = currentTimesheetDays.filter(d => (parseFloat(d.regular_hours) || 0) > 0 || d.day_type === 'Regular').length;
  const mealQty = currentTimesheetDays.filter(d => parseInt(d.meal_allowance) === 1).length;

  const regularPay = Math.round(totRegHours * hourlyRate * 100) / 100;
  const subtotalPay = Math.round((regularPay + otPay) * 100) / 100;
  const mealPay = Math.round(mealQty * 10.0 * 100) / 100;

  const additionAdj = parseFloat(document.getElementById('ts-adjustment-add').value || 0);
  const totalPay = Math.round((subtotalPay + restDayPay + holidayPay + mealPay + additionAdj) * 100) / 100;

  // Deductions: strictly sum explicit deduction inputs (no unexpected auto-deductions)
  const wpsDed = parseFloat(document.getElementById('ts-wps-deduction').value || 0);
  const waterBill = parseFloat(document.getElementById('ts-water-bill').value || 0);
  const otherDed = parseFloat(document.getElementById('ts-other-deductions').value || 0);

  const totalDeductions = Math.round((wpsDed + waterBill + otherDed) * 100) / 100;
  const netPay = Math.max(0, Math.round((totalPay - totalDeductions) * 100) / 100);

  const cashAdvance = parseFloat(document.getElementById('ts-cash-advance').value || 0);
  const subAdj = parseFloat(document.getElementById('ts-adjustment-sub').value || 0);
  const actualPay = Math.max(0, Math.round((netPay - cashAdvance - subAdj) * 100) / 100);

  // Update Summary Strip
  document.getElementById('ts-sum-reg-hours').innerText = `${totRegHours.toFixed(2)} hrs`;
  document.getElementById('ts-sum-ot-hours').innerText = `${totOtHours.toFixed(2)} hrs`;
  document.getElementById('ts-sum-days-worked').innerText = `${daysWorked.toFixed(2)} days`;

  document.getElementById('ts-sum-total-pay').innerText = `SAR ${totalPay.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
  document.getElementById('ts-sum-total-ded').innerText = `SAR ${totalDeductions.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
  document.getElementById('ts-sum-net-pay').innerText = `SAR ${netPay.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
  document.getElementById('ts-sum-actual-pay').innerText = `SAR ${actualPay.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
}

async function submitSaveWorkerTimesheetAndPayroll() {
  const employeeId = parseInt(document.getElementById('ts-employee-id').value);
  const month = parseInt(document.getElementById('ts-month').value);
  const year = parseInt(document.getElementById('ts-year').value);
  const wt = document.getElementById('ts-worker-type') ? document.getElementById('ts-worker-type').value : 'Direct';

  const payload = {
    employee_id: employeeId,
    month: month,
    year: year,
    worker_type: wt,
    cutoff_period: document.getElementById('ts-cutoff-period').value || null,
    days: currentTimesheetDays,
    daily_rate: parseFloat(document.getElementById('ts-daily-rate').value || 0),
    hourly_rate: parseFloat(document.getElementById('ts-hourly-rate').value || 0),
    ot_rate: parseFloat(document.getElementById('ts-ot-rate').value || 0),
    wps_deduction: parseFloat(document.getElementById('ts-wps-deduction').value || 0),
    water_bill: parseFloat(document.getElementById('ts-water-bill').value || 0),
    other_deductions: parseFloat(document.getElementById('ts-other-deductions').value || 0),
    cash_advance: parseFloat(document.getElementById('ts-cash-advance').value || 0),
    adjustment_add: parseFloat(document.getElementById('ts-adjustment-add').value || 0),
    adjustment_sub: parseFloat(document.getElementById('ts-adjustment-sub').value || 0),
    meal_rate: 10.0
  };

  try {
    showToast('Saving timesheet calendar & syncing payslip...', 'info');
    const res = await fetch('/api/payroll/timesheet/bulk-save', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(err.detail || 'Failed to save timesheet', 'error');
      return;
    }

    const data = await res.json();
    closeModal('modal-worker-timesheet-calendar');
    await loadMonthlyPayrollRoster();
    showToast(`✅ Timesheet calendar saved! Actual Pay: SAR ${data.actual_pay.toLocaleString('en-US', {minimumFractionDigits: 2})}`);

  } catch (err) {
    showToast(`Error saving timesheet: ${err}`, 'error');
  }
}

function openAddWorkerToPayrollModal() {
  const select = document.getElementById('add-payroll-emp-select');
  if (!select) return;

  select.innerHTML = '<option value="">-- Select an Active Worker --</option>' + 
    allEmployees.map(e => `<option value="${e.id}">${e.first_name} ${e.last_name} (${e.emp_code})</option>`).join('');

  document.getElementById('add-payroll-basic').value = '';
  document.getElementById('add-payroll-meal').value = '0';
  document.getElementById('add-payroll-site').value = '0';
  document.getElementById('add-payroll-other').value = '0';

  openModal('modal-add-worker-payroll');
}

function populateNewWorkerSalaryDefaults() {
  const empId = parseInt(document.getElementById('add-payroll-emp-select').value);
  if (!empId) return;

  const emp = allEmployees.find(x => x.id === empId);
  if (!emp) return;

  document.getElementById('add-payroll-basic').value = emp.basic_salary || 0;
  document.getElementById('add-payroll-meal').value = emp.meal_allowance || 0;
  document.getElementById('add-payroll-site').value = emp.site_allowance || 0;
  document.getElementById('add-payroll-other').value = emp.other_allowances || 0;
}

async function submitAddWorkerToPayroll() {
  const empId = parseInt(document.getElementById('add-payroll-emp-select').value);
  if (!empId) {
    showToast('Please select a worker', 'error');
    return;
  }

  const month = parseInt(document.getElementById('roster-select-month').value);
  const year = parseInt(document.getElementById('roster-select-year').value);
  const basic = parseFloat(document.getElementById('add-payroll-basic').value || 0);
  const meal = parseFloat(document.getElementById('add-payroll-meal').value || 0);
  const site = parseFloat(document.getElementById('add-payroll-site').value || 0);
  const other = parseFloat(document.getElementById('add-payroll-other').value || 0);

  const payload = {
    month: month,
    year: year,
    employee_id: empId,
    basic_salary: basic,
    meal_allowance_qty: meal > 0 ? (meal / 10.0) : 0,
    meal_allowance_rate: 10.0,
    meal_allowance_pay: meal,
    adjustment_add: site + other,
    other_allowances: other,
    wps_deduction: 0.0,
    water_bill: 0.0,
    cash_advance: 0.0,
    other_deductions: 0.0
  };

  try {
    const res = await fetch('/api/payroll/monthly-roster/worker', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(err.detail || 'Failed to add worker', 'error');
      return;
    }

    closeModal('modal-add-worker-payroll');
    await loadMonthlyPayrollRoster();
    showToast('Worker added to monthly roster!');

  } catch (err) {
    showToast(`Error adding worker: ${err}`, 'error');
  }
}


async function removeWorkerFromMonthlyPayroll(detailId, workerName) {
  if (!confirm(`Are you sure you want to remove ${workerName} from this month's payroll?`)) return;

  try {
    const res = await fetch(`/api/payroll/monthly-roster/worker/${detailId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(err.detail || 'Failed to remove worker', 'error');
      return;
    }

    await loadMonthlyPayrollRoster();
    showToast(`${workerName} removed from this month's roster.`);

  } catch (err) {
    showToast(`Error: ${err}`, 'error');
  }
}

function downloadWorkerPayslipPdf(detailId) {
  const token = localStorage.getItem('jwt_token') || '';
  window.open(`/api/payroll/details/${detailId}/payslip.pdf?token=${encodeURIComponent(token)}`, '_blank');
}

function exportMonthlyPayrollPdf() {
  const month = parseInt(document.getElementById('roster-select-month').value);
  const year = parseInt(document.getElementById('roster-select-year').value);
  const token = localStorage.getItem('jwt_token') || '';

  window.open(`/api/payroll/monthly-roster/export/pdf?month=${month}&year=${year}&token=${encodeURIComponent(token)}`, '_blank');
}

function downloadCurrentMonthWps() {
  if (!currentPayrollRunId) {
    showToast('Please execute or populate this month’s roster first to generate the SAMA WPS file.', 'info');
    return;
  }
  downloadWpsFile(currentPayrollRunId);
}

function toggleHistoricalPayrollRuns() {
  const container = document.getElementById('historical-payroll-runs-container');
  const icon = document.getElementById('hist-runs-toggle-icon');
  if (!container) return;

  if (container.style.display === 'none') {
    container.style.display = 'block';
    if (icon) icon.innerText = '▲';
    loadPayrollRuns();
  } else {
    container.style.display = 'none';
    if (icon) icon.innerText = '▼';
  }
}

async function loadPayrollRuns() {
  if (currentUserRole === 'viewer') return;
  try {
    const res = await fetch('/api/payroll/runs', { headers: getAuthHeaders() });
    if (!res.ok) return;
    const runs = await res.json();

    const tbody = document.getElementById('payroll-runs-body');
    if (!tbody) return;

    if (runs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center;">No historical payroll runs archived yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = runs.map(r => `
      <tr>
        <td><strong>#PR-${r.id}</strong></td>
        <td>${MONTH_NAMES_MAP[r.payroll_month] || r.payroll_month} ${r.payroll_year}</td>
        <td>SAR ${r.total_basic.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
        <td>SAR ${r.total_allowances.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
        <td>SAR ${r.total_deductions.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
        <td><strong style="color: var(--primary); font-size: 0.95rem;">SAR ${r.total_net_pay.toLocaleString('en-US', {minimumFractionDigits: 2})}</strong></td>
        <td><span class="badge badge-active">${r.status}</span></td>
        <td>
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            <button class="btn btn-success" style="padding: 2px 8px; font-size: 0.75rem;" onclick="downloadWpsFile(${r.id})">
              🇸🇦 SAMA WPS CSV
            </button>
            <button class="btn btn-outline" style="padding: 2px 8px; font-size: 0.75rem;" onclick="viewPayrollDetails(${r.id})">
              Payslips
            </button>
            ${currentUserRole === 'admin' ? `
              <button class="btn btn-danger" style="padding: 2px 8px; font-size: 0.75rem;" onclick="deletePayrollRun(${r.id})">
                🗑️
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `).join('');

  } catch (err) {
    console.error('Error loading payroll runs:', err);
  }
}

async function deletePayrollRun(runId) {
  if (!confirm(`Are you sure you want to delete Payroll Run #${runId}?`)) return;

  try {
    const res = await fetch(`/api/payroll/runs/${runId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (!res.ok) {
      showToast('Failed to delete payroll run', 'error');
      return;
    }

    loadPayrollRuns();
    loadMonthlyPayrollRoster();
    loadDashboardData();
    showToast('Payroll run deleted successfully.');
  } catch (err) {
    showToast(`Delete error: ${err}`, 'error');
  }
}

function openPayslipPdf(detailId) {
  downloadWorkerPayslipPdf(detailId);
}

function downloadWpsFile(runId) {
  const token = localStorage.getItem('jwt_token') || '';
  window.open(`/api/payroll/runs/${runId}/wps.csv?token=${encodeURIComponent(token)}`, '_blank');
}

async function viewPayrollDetails(runId) {
  try {
    const res = await fetch(`/api/payroll/runs/${runId}/details`, { headers: getAuthHeaders() });
    if (!res.ok) return;
    const data = await res.json();

    let popupContent = `
      <div style="max-height: 420px; overflow-y: auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Worker</th>
              <th>Basic</th>
              <th>Allowances</th>
              <th>GOSI Deduction</th>
              <th>Net Salary</th>
              <th>Payslip PDF</th>
            </tr>
          </thead>
          <tbody>
            ${data.details.map(d => `
              <tr>
                <td><strong>${d.first_name} ${d.last_name}</strong><br/><small>${d.emp_code}</small></td>
                <td>SAR ${d.basic_salary.toLocaleString()}</td>
                <td>SAR ${(d.housing_allowance + d.transport_allowance + d.other_allowances).toLocaleString()}</td>
                <td>SAR ${d.gosi_employee.toLocaleString()}</td>
                <td><strong style="color: var(--primary);">SAR ${d.net_salary.toLocaleString()}</strong></td>
                <td>
                  <button class="btn btn-outline" style="padding: 2px 8px; font-size: 0.75rem;" onclick="downloadWorkerPayslipPdf(${d.id})">
                    📄 Payslip PDF
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    const m = document.createElement('div');
    m.className = 'modal-overlay active';
    m.innerHTML = `
      <div class="modal-box" style="max-width: 800px;">
        <div class="modal-header">
          <h3 class="modal-title">Payroll Period: ${MONTH_NAMES_MAP[data.run.payroll_month] || data.run.payroll_month} ${data.run.payroll_year}</h3>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
        </div>
        <div class="modal-body">${popupContent}</div>
      </div>
    `;
    document.body.appendChild(m);

  } catch (err) {
    showToast(`Failed to load payroll details: ${err}`, 'error');
  }
}

// 6. LEAVES
async function loadLeaves() {
  try {
    const res = await fetch('/api/leaves', { headers: getAuthHeaders() });
    if (!res.ok) return;
    const leaves = await res.json();

    const tbody = document.getElementById('leaves-table-body');
    if (!tbody) return;

    if (leaves.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center;">No leave applications found.</td></tr>`;
      return;
    }

    tbody.innerHTML = leaves.map(l => `
      <tr>
        <td>#LV-${l.id}</td>
        <td><strong>${l.first_name} ${l.last_name}</strong> (${l.emp_code})</td>
        <td><span class="badge badge-saudi">${l.leave_type}</span></td>
        <td>${l.start_date}</td>
        <td>${l.end_date}</td>
        <td><strong>${l.days} Days</strong></td>
        <td>${l.reason || 'N/A'}</td>
        <td><span class="badge ${l.status === 'Approved' ? 'badge-active' : (l.status === 'Pending' ? 'badge-pending' : 'badge-critical')}">${l.status}</span></td>
        <td>
          <div style="display: flex; gap: 4px; flex-wrap: wrap;">
            ${(l.status === 'Pending' && currentUserRole !== 'viewer') ? `
              <button class="btn btn-success" style="padding: 2px 6px; font-size: 0.75rem;" onclick="updateLeaveStatus(${l.id}, 'Approved')">Approve</button>
              <button class="btn btn-danger" style="padding: 2px 6px; font-size: 0.75rem;" onclick="updateLeaveStatus(${l.id}, 'Rejected')">Reject</button>
            ` : ''}
            ${currentUserRole === 'admin' ? `
              <button class="btn btn-outline" style="padding: 2px 6px; font-size: 0.75rem;" onclick="deleteLeave(${l.id})">🗑️</button>
            ` : ''}
          </div>
        </td>
      </tr>
    `).join('');

  } catch (err) {
    console.error('Error loading leaves:', err);
  }
}

function openApplyLeaveModal() {
  document.getElementById('apply-leave-form').reset();
  openModal('modal-apply-leave');
}

function calculateLeaveDays() {
  const start = document.getElementById('leave-start-date').value;
  const end = document.getElementById('leave-end-date').value;
  if (!start || !end) return;

  const d1 = new Date(start);
  const d2 = new Date(end);
  const diffTime = d2 - d1;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  if (diffDays > 0) {
    document.getElementById('leave-days-count').value = diffDays;
  }
}

async function submitApplyLeave() {
  const form = document.getElementById('apply-leave-form');
  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());

  data.employee_id = parseInt(data.employee_id);
  data.days = parseInt(data.days);

  try {
    const res = await fetch('/api/leaves', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(err.detail || 'Leave application failed', 'error');
      return;
    }

    closeModal('modal-apply-leave');
    showToast('Leave application submitted successfully!');
    await Promise.all([
      loadLeaves(),
      loadDashboardData()
    ]);
    if (currentEmployeeId) {
      await viewEmployeeDetail(currentEmployeeId, true);
    }

  } catch (err) {
    showToast(`Error submitting leave: ${err}`, 'error');
  }
}

async function updateLeaveStatus(leaveId, status) {
  try {
    const res = await fetch(`/api/leaves/${leaveId}/status`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ status })
    });

    if (!res.ok) {
      showToast('Failed to update leave status', 'error');
      return;
    }

    showToast(`Leave status updated to ${status}.`);
    await Promise.all([
      loadLeaves(),
      loadDashboardData()
    ]);
    if (currentEmployeeId) {
      await viewEmployeeDetail(currentEmployeeId, true);
    }
  } catch (err) {
    showToast(`Error updating leave status: ${err}`, 'error');
  }
}

async function deleteLeave(leaveId) {
  if (!confirm('Are you sure you want to delete this leave record?')) return;

  try {
    const res = await fetch(`/api/leaves/${leaveId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (!res.ok) {
      showToast('Failed to delete leave record', 'error');
      return;
    }

    showToast('Leave record removed.');
    await Promise.all([
      loadLeaves(),
      loadDashboardData()
    ]);
    if (currentEmployeeId) {
      await viewEmployeeDetail(currentEmployeeId, true);
    }
  } catch (err) {
    showToast(`Delete error: ${err}`, 'error');
  }
}

// 7. SUPPLIER DIRECTORY & INVOICES MANAGEMENT
let allSuppliers = [];

function switchSupplierSubTab(tabId) {
  document.querySelectorAll('#section-suppliers .tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('#section-suppliers .tab-content').forEach(c => c.classList.remove('active'));

  const activeBtn = document.querySelector(`#section-suppliers .tab-btn[data-tab="${tabId}"]`);
  if (activeBtn) activeBtn.classList.add('active');
  const activeContent = document.getElementById(tabId);
  if (activeContent) activeContent.classList.add('active');

  if (tabId === 'sup-view-vendors') {
    loadSuppliersDirectory();
  } else if (tabId === 'sup-view-invoices') {
    loadSupplierPayments();
  }
}

async function loadSuppliersDirectory() {
  try {
    const res = await fetch('/api/suppliers', { headers: getAuthHeaders() });
    if (!res.ok) return;
    allSuppliers = await res.json();

    renderSuppliersDirectoryTable(allSuppliers);
  } catch (err) {
    console.error('Error loading suppliers directory:', err);
  }
}

function renderSuppliersDirectoryTable(suppliersList) {
  const tbody = document.getElementById('suppliers-directory-body');
  if (!tbody) return;

  if (suppliersList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 25px;">No suppliers registered yet. Click <strong>+ Add Supplier / Vendor</strong> to get started.</td></tr>`;
    return;
  }

  tbody.innerHTML = suppliersList.map(sup => `
    <tr>
      <td>
        <strong style="color: var(--text-main); font-size: 0.95rem;">${sup.name}</strong>
        ${sup.bank_name ? `<br/><small style="color: var(--text-muted);">🏦 ${sup.bank_name}</small>` : ''}
      </td>
      <td>${sup.contact_person || '<span style="color:var(--text-muted);">-</span>'}</td>
      <td>
        ${sup.phone ? `<div>📞 ${sup.phone}</div>` : ''}
        ${sup.email ? `<div>✉️ ${sup.email}</div>` : ''}
        ${!sup.phone && !sup.email ? '<span style="color:var(--text-muted);">-</span>' : ''}
      </td>
      <td>
        ${sup.cr_number ? `<div><small>CR:</small> <code>${sup.cr_number}</code></div>` : ''}
        ${sup.vat_number ? `<div><small>VAT:</small> <code>${sup.vat_number}</code></div>` : ''}
        ${!sup.cr_number && !sup.vat_number ? '<span style="color:var(--text-muted);">-</span>' : ''}
      </td>
      <td><span class="badge badge-saudi">${sup.payment_terms || 'Net 30'}</span></td>
      <td><strong>${sup.invoices_count || 0}</strong></td>
      <td>SAR ${(sup.total_billed || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
      <td>
        <strong style="color: ${(sup.total_balance || 0) > 0 ? 'var(--danger)' : 'var(--success)'};">
          SAR ${(sup.total_balance || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}
        </strong>
      </td>
      <td>
        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
          ${(sup.total_balance || 0) > 0 && currentUserRole !== 'viewer' ? `
            <button class="btn btn-success" style="padding: 2px 8px; font-size: 0.75rem;" onclick="openDisburseVendorLumpSumModal('${sup.name.replace(/'/g, "\\'")}', ${sup.total_balance})">
              💳 Pay
            </button>
          ` : ''}
          ${currentUserRole !== 'viewer' ? `
            <button class="btn btn-primary" style="padding: 2px 8px; font-size: 0.75rem;" onclick="openRecordInvoiceForSupplier('${sup.name.replace(/'/g, "\\'")}')">
              + Invoice
            </button>
          ` : ''}
          <button class="btn btn-outline" style="padding: 2px 8px; font-size: 0.75rem;" onclick="openVendorLedgerModal('${sup.name.replace(/'/g, "\\'")}')">
            📊 Ledger
          </button>
          ${currentUserRole !== 'viewer' ? `
            <button class="btn btn-outline" style="padding: 2px 8px; font-size: 0.75rem;" onclick="openAddSupplierModal(${sup.id})">
              ✏️
            </button>
          ` : ''}
          ${currentUserRole === 'admin' ? `
            <button class="btn btn-danger" style="padding: 2px 8px; font-size: 0.75rem;" onclick="deleteSupplier(${sup.id}, '${sup.name.replace(/'/g, "\\'")}')">
              🗑️
            </button>
          ` : ''}
        </div>
      </td>
    </tr>
  `).join('');
}

function filterSuppliersDirectory() {
  const query = (document.getElementById('vendor-directory-search')?.value || '').toLowerCase().trim();
  if (!query) {
    renderSuppliersDirectoryTable(allSuppliers);
    return;
  }

  const filtered = allSuppliers.filter(s => 
    (s.name && s.name.toLowerCase().includes(query)) ||
    (s.contact_person && s.contact_person.toLowerCase().includes(query)) ||
    (s.phone && s.phone.includes(query)) ||
    (s.cr_number && s.cr_number.includes(query)) ||
    (s.email && s.email.toLowerCase().includes(query))
  );

  renderSuppliersDirectoryTable(filtered);
}

function openAddSupplierModal(supId = null) {
  const form = document.getElementById('add-supplier-form');
  if (form) form.reset();

  document.getElementById('supplier-form-id').value = '';
  document.getElementById('modal-supplier-title').innerText = '🏢 Add New Supplier / Vendor';
  document.getElementById('btn-save-supplier').innerText = 'Save Supplier Profile';

  if (supId) {
    const sup = allSuppliers.find(x => x.id === supId);
    if (sup) {
      document.getElementById('supplier-form-id').value = sup.id;
      document.getElementById('modal-supplier-title').innerText = `✏️ Edit Supplier: ${sup.name}`;
      document.getElementById('btn-save-supplier').innerText = 'Update Supplier Profile';
      document.getElementById('sup-name').value = sup.name || '';
      document.getElementById('sup-contact').value = sup.contact_person || '';
      document.getElementById('sup-phone').value = sup.phone || '';
      document.getElementById('sup-email').value = sup.email || '';
      document.getElementById('sup-cr').value = sup.cr_number || '';
      document.getElementById('sup-vat').value = sup.vat_number || '';
      document.getElementById('sup-bank').value = sup.bank_name || '';
      document.getElementById('sup-terms').value = sup.payment_terms || 'Net 30';
      document.getElementById('sup-iban').value = sup.iban || '';
      document.getElementById('sup-address').value = sup.address || '';
    }
  }

  openModal('modal-add-supplier');
}

async function submitAddSupplier() {
  const supId = document.getElementById('supplier-form-id').value;
  const isEdit = Boolean(supId);

  const payload = {
    name: document.getElementById('sup-name').value.trim(),
    contact_person: document.getElementById('sup-contact').value.trim() || null,
    phone: document.getElementById('sup-phone').value.trim() || null,
    email: document.getElementById('sup-email').value.trim() || null,
    cr_number: document.getElementById('sup-cr').value.trim() || null,
    vat_number: document.getElementById('sup-vat').value.trim() || null,
    bank_name: document.getElementById('sup-bank').value.trim() || null,
    payment_terms: document.getElementById('sup-terms').value || 'Net 30',
    iban: document.getElementById('sup-iban').value.trim() || null,
    address: document.getElementById('sup-address').value.trim() || null
  };

  if (!payload.name) {
    showToast('Please enter a Supplier Company Name.', 'error');
    return;
  }

  try {
    const url = isEdit ? `/api/suppliers/${supId}` : '/api/suppliers';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(err.detail || 'Failed to save supplier profile', 'error');
      return;
    }

    closeModal('modal-add-supplier');
    loadSuppliersDirectory();
    loadSupplierPayments();
    showToast(isEdit ? 'Supplier updated successfully!' : 'Supplier created successfully!');
  } catch (err) {
    showToast(`Supplier save error: ${err}`, 'error');
  }
}

async function deleteSupplier(supId, name) {
  if (!confirm(`Are you sure you want to delete supplier "${name}"?`)) return;

  try {
    const res = await fetch(`/api/suppliers/${supId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(err.detail || 'Failed to delete supplier', 'error');
      return;
    }

    loadSuppliersDirectory();
    showToast(`Supplier "${name}" deleted.`);
  } catch (err) {
    showToast(`Delete error: ${err}`, 'error');
  }
}

function populateSupplierDropdown(selectedName = '') {
  const select = document.getElementById('record-supplier-select');
  const customInput = document.getElementById('record-supplier-custom-name');
  if (!select) return;

  select.innerHTML = '<option value="">-- Choose Registered Supplier --</option>' +
    allSuppliers.map(s => `<option value="${s.name}" ${s.name === selectedName ? 'selected' : ''}>${s.name}</option>`).join('') +
    '<option value="__NEW__">➕ Enter New Supplier / Vendor Name...</option>';

  if (selectedName && allSuppliers.some(s => s.name === selectedName)) {
    select.value = selectedName;
    if (customInput) {
      customInput.style.display = 'none';
      customInput.value = selectedName;
    }
  } else if (selectedName) {
    select.value = '__NEW__';
    if (customInput) {
      customInput.style.display = 'block';
      customInput.value = selectedName;
    }
  } else {
    if (customInput) {
      customInput.style.display = 'none';
      customInput.value = '';
    }
  }
}

function handleSupplierSelectChange(val) {
  const customInput = document.getElementById('record-supplier-custom-name');
  if (!customInput) return;

  if (val === '__NEW__') {
    customInput.style.display = 'block';
    customInput.value = '';
    customInput.focus();
  } else if (val) {
    customInput.style.display = 'none';
    customInput.value = val;
  } else {
    customInput.style.display = 'none';
    customInput.value = '';
  }
}

function openRecordInvoiceForSupplier(supplierName) {
  openRecordSupplierPaymentModal(supplierName);
}

function exportAccountsPayablePdf() {
  openExportApReportModal();
}

function openExportApReportModal() {
  populateReportSuppliersCheckboxes();
  
  const allRadio = document.querySelector('input[name="ap-report-scope"][value="all"]');
  if (allRadio) allRadio.checked = true;
  toggleSupplierSelectionScope('all');

  const statusEl = document.getElementById('ap-report-status');
  if (statusEl) statusEl.value = '';
  const startEl = document.getElementById('ap-report-start-date');
  if (startEl) startEl.value = '';
  const endEl = document.getElementById('ap-report-end-date');
  if (endEl) endEl.value = '';

  openModal('modal-export-ap-report');
}

function toggleSupplierSelectionScope(scope) {
  const container = document.getElementById('ap-report-suppliers-container');
  if (!container) return;
  container.style.display = scope === 'custom' ? 'block' : 'none';
}

function populateReportSuppliersCheckboxes() {
  const list = document.getElementById('ap-report-suppliers-list');
  if (!list) return;

  if (allSuppliers.length === 0) {
    list.innerHTML = `<div style="color: var(--text-muted); font-size: 0.8rem;">No suppliers registered yet.</div>`;
    return;
  }

  list.innerHTML = allSuppliers.map(s => {
    const bal = s.total_balance || 0;
    return `
      <label style="display: flex; align-items: center; justify-content: space-between; padding: 5px 8px; border-radius: 4px; background: white; border: 1px solid #E2E8F0; cursor: pointer; margin-bottom: 2px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <input type="checkbox" class="report-sup-checkbox" value="${s.name}" checked>
          <span style="font-weight: 600; font-size: 0.82rem; color: var(--text-main);">${s.name}</span>
        </div>
        <span style="font-size: 0.75rem; color: ${bal > 0 ? 'var(--danger)' : 'var(--success)'}; font-weight: 700;">
          SAR ${bal.toLocaleString('en-US', {minimumFractionDigits: 2})}
        </span>
      </label>
    `;
  }).join('');
}

function selectAllReportSuppliers(selectAll) {
  document.querySelectorAll('.report-sup-checkbox').forEach(cb => {
    cb.checked = selectAll;
  });
}

function submitGenerateApReportPdf() {
  const scope = document.querySelector('input[name="ap-report-scope"]:checked')?.value || 'all';
  let selectedVendors = [];

  if (scope === 'custom') {
    const checked = Array.from(document.querySelectorAll('.report-sup-checkbox:checked')).map(cb => cb.value);
    if (checked.length === 0) {
      showToast('Please select at least one supplier to include in the report.', 'error');
      return;
    }
    selectedVendors = checked;
  }

  const status = document.getElementById('ap-report-status')?.value || '';
  const startDate = document.getElementById('ap-report-start-date')?.value || '';
  const endDate = document.getElementById('ap-report-end-date')?.value || '';

  const token = localStorage.getItem('jwt_token') || '';

  let url = `/api/suppliers/export/pdf?token=${encodeURIComponent(token)}&`;
  if (selectedVendors.length > 0) {
    url += `suppliers=${encodeURIComponent(selectedVendors.join(','))}&`;
  }
  if (status) url += `status=${encodeURIComponent(status)}&`;
  if (startDate) url += `start_date=${encodeURIComponent(startDate)}&`;
  if (endDate) url += `end_date=${encodeURIComponent(endDate)}&`;

  closeModal('modal-export-ap-report');
  window.open(url, '_blank');
  showToast('Accounts Payable PDF Report generated!');
}

// 7. SUPPLIER PAYMENTS & AP
async function loadSupplierPayments() {
  try {
    // Also refresh suppliers cache
    loadSuppliersDirectory();

    const search = document.getElementById('supplier-search') ? document.getElementById('supplier-search').value : '';
    const status = document.getElementById('supplier-filter-status') ? document.getElementById('supplier-filter-status').value : '';

    let url = '/api/suppliers/payments?';
    if (search) url += `search=${encodeURIComponent(search)}&`;
    if (status) url += `status=${encodeURIComponent(status)}&`;

    const res = await fetch(url, { headers: getAuthHeaders() });
    if (!res.ok) return;
    const payload = await res.json();

    const sum = payload.summary;
    allSupplierPayments = payload.payments;

    // Update KPI Cards
    if (document.getElementById('sp-kpi-total-billed')) {
      let totBilled = allSupplierPayments.reduce((a, b) => a + (b.amount || 0), 0);
      let totPaid = allSupplierPayments.reduce((a, b) => a + (b.paid_amount || 0), 0);
      let totRem = sum.total_outstanding_payable || 0;
      let totOver = sum.total_overdue_payable || 0;

      document.getElementById('sp-kpi-total-billed').innerText = `SAR ${totBilled.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
      document.getElementById('sp-kpi-total-paid').innerText = `SAR ${totPaid.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
      document.getElementById('sp-kpi-total-remaining').innerText = `SAR ${totRem.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
      document.getElementById('sp-kpi-total-overdue').innerText = `SAR ${totOver.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
    }

    const tbody = document.getElementById('supplier-payments-body');
    if (!tbody) return;

    if (allSupplierPayments.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 25px;">No supplier payment records found.</td></tr>`;
      return;
    }

    tbody.innerHTML = allSupplierPayments.map(sp => {
      const tot = sp.amount || 0.0;
      const pd = sp.paid_amount || 0.0;
      const rem = sp.remaining_amount !== undefined ? sp.remaining_amount : Math.max(0, tot - pd);

      const startD = sp.supply_start_date || sp.supply_date || '';
      const endD = sp.supply_end_date || sp.supply_date || '';
      const formattedStart = formatCalendarDate(startD);
      const formattedEnd = formatCalendarDate(endD);
      const supplyPeriod = (startD && endD && startD !== endD) ? `${formattedStart} <span style="color:var(--text-muted);">to</span> ${formattedEnd}` : (formattedStart || 'N/A');
      const formattedDue = formatCalendarDate(sp.due_date);

      return `
        <tr>
          <td>#INV-${sp.id}</td>
          <td>
            <a href="javascript:void(0)" style="font-weight: 700; color: var(--primary); text-decoration: underline;" onclick="openVendorLedgerModal('${sp.company_name.replace(/'/g, "\\'")}')">
              ${sp.company_name}
            </a>
          </td>
          <td>
            <code>${sp.invoice_number || 'N/A'}</code>
            ${sp.attachment_filename ? `
              <br/><button class="btn btn-outline" style="margin-top: 3px; padding: 1px 6px; font-size: 0.7rem; border-color: #2563EB; color: #2563EB;" onclick="openSupplierAttachment(${sp.id})" title="View attached document: ${sp.attachment_filename}">
                📎 ${sp.attachment_filename.length > 15 ? sp.attachment_filename.slice(0, 12) + '...' : sp.attachment_filename}
              </button>
            ` : ''}
          </td>
          <td style="font-size: 0.82rem;">${supplyPeriod}</td>
          <td>${formattedDue}</td>
          <td>SAR ${tot.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
          <td><span style="color: var(--primary); font-weight: 600;">SAR ${pd.toLocaleString('en-US', {minimumFractionDigits: 2})}</span></td>
          <td><strong style="color: ${rem > 0 ? 'var(--danger)' : 'var(--success)'};">SAR ${rem.toLocaleString('en-US', {minimumFractionDigits: 2})}</strong></td>
          <td>
            <span class="badge ${sp.status === 'Paid' ? 'badge-active' : (sp.status === 'Partially Paid' ? 'badge-pending' : 'badge-critical')}">
              ${sp.status}
            </span>
          </td>
          <td>
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              ${rem > 0 && currentUserRole !== 'viewer' ? `
                <button class="btn btn-success" style="padding: 2px 8px; font-size: 0.75rem;" onclick="openDisburseSupplierPaymentModal(${sp.id}, '${sp.company_name.replace(/'/g, "\\'")}', ${rem})">
                  💳 Disburse
                </button>
              ` : ''}
              ${currentUserRole !== 'viewer' ? `
                <button class="btn btn-outline" style="padding: 2px 8px; font-size: 0.75rem;" onclick="repeatInvoiceNextMonth(${sp.id})" title="Create recurring invoice for next month with same amount">
                  🔁 Next Month
                </button>
                <button class="btn btn-outline" style="padding: 2px 8px; font-size: 0.75rem;" onclick="openEditSupplierModal(${sp.id})">
                  ✏️ Edit
                </button>
              ` : ''}
              <button class="btn btn-outline" style="padding: 2px 8px; font-size: 0.75rem;" onclick="openSupplierStatementPdf(${sp.id})">
                📜 Statement
              </button>
              ${currentUserRole === 'admin' ? `
                <button class="btn btn-danger" style="padding: 2px 8px; font-size: 0.75rem;" onclick="deleteSupplierPayment(${sp.id})">🗑️</button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error('Error loading supplier payments:', err);
  }
}

function openRecordSupplierPaymentModal(prefillSupplierName = '') {
  const form = document.getElementById('record-supplier-form');
  if (form) form.reset();
  
  populateSupplierDropdown(prefillSupplierName);

  const today = new Date().toISOString().split('T')[0];
  const d30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const invDate = document.querySelector('#record-supplier-form input[name="invoice_date"]');
  const supStartDate = document.querySelector('#record-supplier-form input[name="supply_start_date"]');
  const supEndDate = document.querySelector('#record-supplier-form input[name="supply_end_date"]');
  const dueDate = document.querySelector('#record-supplier-form input[name="due_date"]');
  const invNum = document.querySelector('#record-supplier-form input[name="invoice_number"]');
  
  if (invDate) invDate.value = today;
  if (supStartDate) supStartDate.value = today;
  if (supEndDate) supEndDate.value = today;
  if (dueDate) dueDate.value = d30;
  if (invNum && !invNum.value) invNum.value = `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  openModal('modal-record-supplier');
}

async function submitRecordSupplierPayment() {
  const form = document.getElementById('record-supplier-form');
  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());

  data.amount = parseFloat(data.amount || 0);

  if (!data.company_name || !data.company_name.trim()) {
    showToast('Please enter a Company / Vendor name.', 'error');
    return;
  }

  if (isNaN(data.amount) || data.amount <= 0) {
    showToast('Please enter a valid positive invoice amount.', 'error');
    return;
  }

  try {
    const res = await fetch('/api/suppliers/payments', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });

    if (!res.ok) {
      const err = await res.json();
      let errMsg = 'Failed to record invoice';
      if (typeof err.detail === 'string') {
        errMsg = err.detail;
      } else if (Array.isArray(err.detail)) {
        errMsg = err.detail.map(e => e.msg || e.message).join(', ');
      }
      showToast(errMsg, 'error');
      return;
    }

    const resData = await res.json();
    const createdSpId = resData.id;

    // Upload optional attachment if selected
    const fileInput = document.getElementById('record-supplier-attachment');
    if (fileInput && fileInput.files && fileInput.files[0] && createdSpId) {
      await uploadSupplierAttachmentFile(createdSpId, fileInput.files[0]);
    }

    closeModal('modal-record-supplier');
    loadSupplierPayments();
    loadFinanceAnalytics();
    loadDashboardData();
    showToast('Supplier payment invoice recorded successfully!');

  } catch (err) {
    showToast(`Error saving invoice: ${err}`, 'error');
  }
}

function openEditSupplierModal(spId) {
  const sp = allSupplierPayments.find(x => x.id === spId);
  if (!sp) return;

  document.getElementById('edit-supplier-id').value = sp.id;
  document.getElementById('edit-supplier-company').value = sp.company_name;
  document.getElementById('edit-supplier-invoice-num').value = sp.invoice_number || '';
  document.getElementById('edit-supplier-invoice-date').value = sp.invoice_date;
  document.getElementById('edit-supplier-due-date').value = sp.due_date;
  document.getElementById('edit-supplier-supply-start').value = sp.supply_start_date || sp.supply_date || '';
  document.getElementById('edit-supplier-supply-end').value = sp.supply_end_date || sp.supply_date || '';
  document.getElementById('edit-supplier-details').value = sp.invoice_details || '';
  document.getElementById('edit-supplier-amount').value = sp.amount;
  document.getElementById('edit-supplier-status').value = sp.status;
  document.getElementById('edit-supplier-remarks').value = sp.remarks || '';

  const attachContainer = document.getElementById('edit-supplier-attachment-container');
  if (attachContainer) {
    if (sp.attachment_filename) {
      attachContainer.innerHTML = `
        <div style="background: #EFF6FF; border: 1px solid #BFDBFE; padding: 6px 10px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.82rem; color: #1E40AF;">📎 <strong>${sp.attachment_filename}</strong></span>
          <div style="display: flex; gap: 6px;">
            <button type="button" class="btn btn-outline" style="padding: 1px 6px; font-size: 0.72rem; border-color: #2563EB; color: #2563EB;" onclick="openSupplierAttachment(${sp.id})">⬇️ View</button>
            <button type="button" class="btn btn-danger" style="padding: 1px 6px; font-size: 0.72rem;" onclick="deleteSupplierAttachment(${sp.id})">🗑️ Remove</button>
          </div>
        </div>
      `;
    } else {
      attachContainer.innerHTML = `<span style="color: var(--text-muted); font-size: 0.8rem;">No document currently attached.</span>`;
    }
  }

  const fileInput = document.getElementById('edit-supplier-attachment-file');
  if (fileInput) fileInput.value = '';

  openModal('modal-edit-supplier');
}

async function submitEditSupplierPayment() {
  const spId = document.getElementById('edit-supplier-id').value;
  const payload = {
    company_name: document.getElementById('edit-supplier-company').value,
    invoice_number: document.getElementById('edit-supplier-invoice-num').value,
    invoice_date: document.getElementById('edit-supplier-invoice-date').value,
    due_date: document.getElementById('edit-supplier-due-date').value,
    supply_start_date: document.getElementById('edit-supplier-supply-start').value,
    supply_end_date: document.getElementById('edit-supplier-supply-end').value,
    invoice_details: document.getElementById('edit-supplier-details').value,
    amount: parseFloat(document.getElementById('edit-supplier-amount').value || 0),
    status: document.getElementById('edit-supplier-status').value,
    remarks: document.getElementById('edit-supplier-remarks').value
  };

  try {
    const res = await fetch(`/api/suppliers/payments/${spId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(err.detail || 'Update failed', 'error');
      return;
    }

    // Check if new attachment was selected
    const fileInput = document.getElementById('edit-supplier-attachment-file');
    if (fileInput && fileInput.files && fileInput.files[0]) {
      await uploadSupplierAttachmentFile(spId, fileInput.files[0]);
    }

    showToast('Supplier invoice updated successfully!');
    closeModal('modal-edit-supplier');
    loadSupplierPayments();
    loadFinanceAnalytics();
    loadDashboardData();

  } catch (err) {
    showToast(`Update error: ${err}`, 'error');
  }
}

async function uploadSupplierAttachmentFile(spId, file) {
  const formData = new FormData();
  formData.append('file', file);
  const token = localStorage.getItem('jwt_token') || '';
  try {
    const res = await fetch(`/api/suppliers/payments/${spId}/attachment`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    if (!res.ok) {
      const err = await res.json();
      showToast(err.detail || 'Attachment upload failed', 'error');
    }
  } catch (e) {
    console.error('Failed to upload invoice attachment:', e);
  }
}

function openSupplierAttachment(spId) {
  const token = localStorage.getItem('jwt_token') || '';
  window.open(`/api/suppliers/payments/${spId}/attachment?token=${encodeURIComponent(token)}`, '_blank');
}

async function deleteSupplierAttachment(spId) {
  if (!confirm('Remove the attached invoice document from this invoice?')) return;
  try {
    const res = await fetch(`/api/suppliers/payments/${spId}/attachment`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (res.ok) {
      showToast('Attachment removed successfully.');
      loadSupplierPayments();
      // Update modal view
      const attachContainer = document.getElementById('edit-supplier-attachment-container');
      if (attachContainer) {
        attachContainer.innerHTML = `<span style="color: var(--text-muted); font-size: 0.8rem;">No document currently attached.</span>`;
      }
    }
  } catch (e) {
    showToast(`Error deleting attachment: ${e}`, 'error');
  }
}

function formatCalendarDate(dateStr) {
  if (!dateStr || dateStr === 'N/A' || dateStr === '-') return '-';
  const clean = String(dateStr).trim();
  if (clean.includes('-') && clean.length >= 10) {
    const parts = clean.slice(0, 10).split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (!isNaN(year) && !isNaN(month) && !isNaN(day) && month >= 0 && month < 12) {
      return `${String(day).padStart(2, '0')} ${months[month]} ${year}`;
    }
  }
  return clean;
}

function addOneMonthToDate(dateStr) {
  if (!dateStr || !dateStr.includes('-')) return new Date().toISOString().split('T')[0];
  const parts = dateStr.split('-');
  let year = parseInt(parts[0], 10);
  let month = parseInt(parts[1], 10);
  let day = parseInt(parts[2], 10);

  month += 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }
  const maxDay = new Date(year, month, 0).getDate();
  const validDay = Math.min(day, maxDay);

  const mm = String(month).padStart(2, '0');
  const dd = String(validDay).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

async function repeatInvoiceNextMonth(spId) {
  const sp = allSupplierPayments.find(x => x.id === spId);
  const vendor = sp ? sp.company_name : 'supplier';
  const amt = sp ? `SAR ${Number(sp.amount).toLocaleString('en-US', {minimumFractionDigits: 2})}` : '';
  
  if (!confirm(`Create a recurring next-month invoice for "${vendor}" (${amt}) with dates automatically shifted to next month?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/suppliers/payments/${spId}/repeat-next-month`, {
      method: 'POST',
      headers: getAuthHeaders()
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(err.detail || 'Failed to create recurring invoice', 'error');
      return;
    }

    const data = await res.json();
    loadSupplierPayments();
    loadFinanceAnalytics();
    loadDashboardData();
    showToast(`✅ Recurring invoice created! Due: ${data.due_date} (SAR ${Number(data.amount).toLocaleString('en-US', {minimumFractionDigits: 2})})`);
  } catch (err) {
    showToast(`Recurring invoice error: ${err}`, 'error');
  }
}

function duplicateInvoiceToNextMonth() {
  const spId = parseInt(document.getElementById('edit-supplier-id')?.value, 10);
  const sp = allSupplierPayments.find(x => x.id === spId);
  if (!sp) return;

  closeModal('modal-edit-supplier');
  openRecordSupplierPaymentModal(sp.company_name);

  const nextInvDate = addOneMonthToDate(sp.invoice_date);
  const nextDueDate = addOneMonthToDate(sp.due_date);
  const nextSupStart = addOneMonthToDate(sp.supply_start_date || sp.supply_date);
  const nextSupEnd = addOneMonthToDate(sp.supply_end_date || sp.supply_date);

  const invDateEl = document.querySelector('#record-supplier-form input[name="invoice_date"]');
  const dueDateEl = document.querySelector('#record-supplier-form input[name="due_date"]');
  const supStartEl = document.querySelector('#record-supplier-form input[name="supply_start_date"]');
  const supEndEl = document.querySelector('#record-supplier-form input[name="supply_end_date"]');
  const detailsEl = document.querySelector('#record-supplier-form input[name="invoice_details"]');
  const amtEl = document.querySelector('#record-supplier-form input[name="amount"]');
  const remarksEl = document.querySelector('#record-supplier-form textarea[name="remarks"]');

  if (invDateEl) invDateEl.value = nextInvDate;
  if (dueDateEl) dueDateEl.value = nextDueDate;
  if (supStartEl) supStartEl.value = nextSupStart;
  if (supEndEl) supEndEl.value = nextSupEnd;
  if (detailsEl) detailsEl.value = sp.invoice_details || '';
  if (amtEl) amtEl.value = sp.amount;
  if (remarksEl) remarksEl.value = `Recurring monthly invoice (cloned from #${sp.id})`;
}

function openDisburseSupplierPaymentModal(spId, companyName, remainingAmount) {
  document.getElementById('disburse-sp-id').value = spId;
  if (document.getElementById('disburse-company-name')) document.getElementById('disburse-company-name').value = companyName;
  document.getElementById('disburse-modal-title').innerText = `Disburse Payment: ${companyName}`;
  document.getElementById('disburse-current-remaining').innerText = `SAR ${remainingAmount.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
  document.getElementById('disburse-amount').value = remainingAmount;
  document.getElementById('disburse-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('disburse-reference').value = `TXN-${Math.floor(100000 + Math.random() * 900000)}`;
  document.getElementById('disburse-notes').value = 'Payment settlement';
  openModal('modal-disburse-supplier');
}

function openDisburseVendorLumpSumModal(companyName, totalBalance) {
  document.getElementById('disburse-sp-id').value = '';
  if (document.getElementById('disburse-company-name')) document.getElementById('disburse-company-name').value = companyName;
  document.getElementById('disburse-modal-title').innerText = `Settle Vendor Account: ${companyName}`;
  document.getElementById('disburse-current-remaining').innerText = `SAR ${totalBalance.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
  document.getElementById('disburse-amount').value = totalBalance;
  document.getElementById('disburse-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('disburse-reference').value = `TXN-${Math.floor(100000 + Math.random() * 900000)}`;
  document.getElementById('disburse-notes').value = `Lump-sum vendor settlement for ${companyName}`;
  openModal('modal-disburse-supplier');
}

async function submitDisburseSupplierPayment() {
  const spId = document.getElementById('disburse-sp-id').value;
  const companyName = document.getElementById('disburse-company-name')?.value || '';
  const amount = parseFloat(document.getElementById('disburse-amount').value || 0);
  const payDate = document.getElementById('disburse-date').value;
  const method = document.getElementById('disburse-method').value;
  const ref = document.getElementById('disburse-reference').value;
  const notes = document.getElementById('disburse-notes').value;

  if (amount <= 0) {
    showToast('Please enter a valid disbursal amount.', 'error');
    return;
  }

  const url = spId ? `/api/suppliers/payments/${spId}/disburse` : `/api/suppliers/vendors/${encodeURIComponent(companyName)}/disburse`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        payment_amount: amount,
        payment_date: payDate,
        payment_method: method,
        reference_number: ref,
        notes: notes
      })
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(err.detail || 'Disbursal failed', 'error');
      return;
    }

    const data = await res.json();
    showToast(data.message || `Payment of SAR ${amount.toLocaleString()} disbursed successfully!`);
    closeModal('modal-disburse-supplier');

    loadSupplierPayments();
    loadSuppliersDirectory();
    loadFinanceAnalytics();
    loadDashboardData();

  } catch (err) {
    showToast(`Disbursal error: ${err}`, 'error');
  }
}

async function openVendorLedgerModal(companyName) {
  openModal('modal-vendor-ledger');
  document.getElementById('vendor-ledger-title').innerText = `Vendor Account Statement: ${companyName}`;

  try {
    const res = await fetch(`/api/suppliers/vendors/${encodeURIComponent(companyName)}/ledger`, { headers: getAuthHeaders() });
    if (!res.ok) return;
    const data = await res.json();

    const sum = data.summary;
    document.getElementById('vendor-ledger-summary-grid').innerHTML = `
      <div style="background: #EFF6FF; padding: 12px; border-radius: 8px; border: 1px solid #BFDBFE;">
        <div style="font-size: 0.75rem; color: #1E40AF; font-weight: 700;">TOTAL INVOICES</div>
        <div style="font-size: 1.3rem; font-weight: 800; color: #1E3A8A;">${sum.total_invoices_count} Invoices</div>
      </div>
      <div style="background: #F8FAFC; padding: 12px; border-radius: 8px; border: 1px solid #CBD5E1;">
        <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700;">TOTAL BILLED</div>
        <div style="font-size: 1.3rem; font-weight: 800; color: var(--text-main);">SAR ${sum.total_billed.toLocaleString('en-US', {minimumFractionDigits: 2})}</div>
      </div>
      <div style="background: #ECFDF5; padding: 12px; border-radius: 8px; border: 1px solid #A7F3D0;">
        <div style="font-size: 0.75rem; color: #065F46; font-weight: 700;">TOTAL DISBURSED</div>
        <div style="font-size: 1.3rem; font-weight: 800; color: var(--primary);">SAR ${sum.total_paid.toLocaleString('en-US', {minimumFractionDigits: 2})}</div>
      </div>
      <div style="background: #FEF2F2; padding: 12px; border-radius: 8px; border: 1px solid #FCA5A5;">
        <div style="font-size: 0.75rem; color: #991B1B; font-weight: 700;">BALANCE DUE</div>
        <div style="font-size: 1.3rem; font-weight: 800; color: var(--danger);">SAR ${sum.total_balance.toLocaleString('en-US', {minimumFractionDigits: 2})}</div>
      </div>
    `;

    // Render Invoices
    const invBody = document.getElementById('vendor-ledger-invoices-body');
    invBody.innerHTML = data.invoices.map(i => `
      <tr>
        <td>
          <code>${i.invoice_number || 'N/A'}</code>
          ${i.attachment_filename ? `
            <br/><button class="btn btn-outline" style="margin-top: 3px; padding: 1px 6px; font-size: 0.7rem; border-color: #2563EB; color: #2563EB;" onclick="openSupplierAttachment(${i.id})" title="View attached document">📎 PDF</button>
          ` : ''}
        </td>
        <td>${formatCalendarDate(i.invoice_date)}</td>
        <td>${formatCalendarDate(i.due_date)}</td>
        <td>${i.invoice_details || 'N/A'}</td>
        <td>SAR ${i.amount.toLocaleString()}</td>
        <td>SAR ${i.paid_amount.toLocaleString()}</td>
        <td><strong>SAR ${i.remaining_amount.toLocaleString()}</strong></td>
        <td><span class="badge ${i.status === 'Paid' ? 'badge-active' : 'badge-pending'}">${i.status}</span></td>
      </tr>
    `).join('');

    // Render Disbursal Logs
    const logsBody = document.getElementById('vendor-ledger-logs-body');
    if (data.payment_logs.length === 0) {
      logsBody.innerHTML = `<tr><td colspan="5" style="text-align: center;">No disbursal transactions logged yet.</td></tr>`;
    } else {
      logsBody.innerHTML = data.payment_logs.map(l => `
        <tr>
          <td>${formatCalendarDate(l.payment_date)}</td>
          <td>${l.payment_method}</td>
          <td><code>${l.reference_number || 'N/A'}</code></td>
          <td><strong style="color: var(--primary);">SAR ${l.payment_amount.toLocaleString('en-US', {minimumFractionDigits: 2})}</strong></td>
          <td>${l.notes || 'N/A'}</td>
        </tr>
      `).join('');
    }

  } catch (err) {
    showToast(`Failed to load vendor ledger: ${err}`, 'error');
  }
}

async function deleteSupplierPayment(id) {
  if (!confirm('Are you sure you want to delete this supplier payment record?')) return;

  try {
    const res = await fetch(`/api/suppliers/payments/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (!res.ok) {
      showToast('Failed to delete invoice record', 'error');
      return;
    }

    showToast('Supplier payment record deleted.');
    await Promise.all([
      loadSupplierPayments(),
      loadSuppliersDirectory(),
      loadFinanceAnalytics(),
      loadDashboardData()
    ]);

  } catch (err) {
    showToast(`Delete error: ${err}`, 'error');
  }
}

// 8. FINANCE & AGING ANALYTICS
async function loadFinanceAnalytics() {
  if (currentUserRole === 'viewer') return;

  try {
    const res = await fetch('/api/finance/analytics', { headers: getAuthHeaders() });
    if (!res.ok) return;
    const data = await res.json();

    const sum = data.summary;
    document.getElementById('fin-stat-total-payables').innerText = `SAR ${sum.total_outstanding_payable.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
    document.getElementById('fin-stat-overdue-payables').innerText = `SAR ${sum.total_overdue_payable.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
    document.getElementById('fin-stat-overdue-ratio').innerText = `${sum.overdue_ratio_percentage}%`;
    document.getElementById('fin-stat-30d-outflow').innerText = `SAR ${data.projected_30_day_outflow.toLocaleString('en-US', {minimumFractionDigits: 2})}`;

    const agingBody = document.getElementById('finance-aging-table-body');
    if (agingBody) {
      const buckets = data.aging_buckets;
      const keys = ['current', 'days_1_30', 'days_31_60', 'days_61_90', 'days_90_plus'];

      agingBody.innerHTML = keys.map(k => {
        const b = buckets[k];
        const share = sum.total_outstanding_payable > 0 ? ((b.amount / sum.total_outstanding_payable) * 100).toFixed(1) : '0.0';
        return `
          <tr>
            <td>
              <span class="badge" style="background: ${b.color}; color: #FFF;">${b.label}</span>
            </td>
            <td><strong>${b.count} Invoices</strong></td>
            <td><strong style="color: ${b.color}; font-size: 0.95rem;">SAR ${b.amount.toLocaleString('en-US', {minimumFractionDigits: 2})}</strong></td>
            <td>${share}%</td>
            <td>
              <div style="background: #E2E8F0; border-radius: 10px; height: 8px; width: 100%; overflow: hidden;">
                <div style="background: ${b.color}; height: 100%; width: ${Math.min(100, parseFloat(share))}%;"></div>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    const projGrid = document.getElementById('finance-projection-grid');
    if (projGrid) {
      projGrid.innerHTML = `
        <div style="background: #FFFFFF; padding: 18px; border-radius: 10px; border: 1px solid var(--border-color);">
          <div style="font-size: 0.78rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Monthly Payroll Outflow</div>
          <div style="font-size: 1.45rem; font-weight: 800; color: #1E3A8A; margin-top: 4px;">SAR ${data.monthly_payroll_commitment.toLocaleString('en-US', {minimumFractionDigits: 2})}</div>
        </div>
        <div style="background: #FFFFFF; padding: 18px; border-radius: 10px; border: 1px solid var(--border-color);">
          <div style="font-size: 0.78rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Outstanding Vendor Liabilities</div>
          <div style="font-size: 1.45rem; font-weight: 800; color: var(--danger); margin-top: 4px;">SAR ${sum.total_outstanding_payable.toLocaleString('en-US', {minimumFractionDigits: 2})}</div>
        </div>
        <div style="background: #ECFDF5; padding: 18px; border-radius: 10px; border: 1px solid #A7F3D0;">
          <div style="font-size: 0.78rem; color: #065F46; font-weight: 700; text-transform: uppercase;">Year-to-Date Settled Outflows</div>
          <div style="font-size: 1.45rem; font-weight: 800; color: var(--primary); margin-top: 4px;">SAR ${sum.total_settled_paid.toLocaleString('en-US', {minimumFractionDigits: 2})}</div>
        </div>
      `;
    }

  } catch (err) {
    console.error('Error loading finance analytics:', err);
  }
}

// 9. CALCULATORS
async function runEosbCalc() {
  const basic = parseFloat(document.getElementById('eosb-basic').value || 0);
  const start = document.getElementById('eosb-start').value;
  const end = document.getElementById('eosb-end').value;
  const reason = document.getElementById('eosb-reason').value;

  if (!basic || !start || !end) return;

  try {
    const res = await fetch('/api/calculators/eosb', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        basic_salary: basic,
        gross_salary: basic * 1.25,
        start_date: start,
        end_date: end,
        reason: reason
      })
    });

    if (!res.ok) return;
    const data = await res.json();

    document.getElementById('eosb-net-val').innerText = `SAR ${data.net_eosb.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
    document.getElementById('eosb-notes-desc').innerHTML = `
      Duration: <strong>${data.years_of_service} Years</strong> (${data.days_worked} days)<br/>
      Entitlement Multiplier: <strong>${data.multiplier_percentage}%</strong> (${data.article})<br/>
      <em>${data.notes}</em>
    `;

  } catch (err) {
    console.error('EOSB Calculation Error:', err);
  }
}

async function runGosiCalc() {
  const isSaudi = parseInt(document.getElementById('gosi-is-saudi').value) === 1;
  const basic = parseFloat(document.getElementById('gosi-basic').value || 0);
  const housing = parseFloat(document.getElementById('gosi-housing').value || 0);

  try {
    const res = await fetch('/api/calculators/gosi', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        is_saudi: isSaudi,
        basic_salary: basic,
        housing_allowance: housing
      })
    });

    if (!res.ok) return;
    const data = await res.json();

    document.getElementById('gosi-emp-share').innerText = `SAR ${data.employee_deduction.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
    document.getElementById('gosi-empr-share').innerText = `SAR ${data.employer_contribution.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
    document.getElementById('gosi-total-share').innerText = `SAR ${data.total_gosi.toLocaleString('en-US', {minimumFractionDigits: 2})}`;

  } catch (err) {
    console.error('GOSI Calculation Error:', err);
  }
}

// 10. SETTINGS & USERS
async function loadUsersList() {
  if (currentUserRole === 'viewer') return;
  try {
    const res = await fetch('/api/users', { headers: getAuthHeaders() });
    if (!res.ok) return;
    allUsers = await res.json();

    const tbody = document.getElementById('users-list-body');
    if (!tbody) return;

    tbody.innerHTML = allUsers.map(u => `
      <tr>
        <td>#USR-${u.id}</td>
        <td><strong>${u.full_name}</strong></td>
        <td><code>${u.email}</code></td>
        <td><span class="badge ${u.role === 'admin' ? 'badge-saudi' : (u.role === 'hr_manager' ? 'badge-active' : 'badge-expat')}">${u.role.toUpperCase()}</span></td>
        <td>${u.created_at || 'N/A'}</td>
        <td>
          ${currentUserRole === 'admin' ? `
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-outline" style="padding: 2px 8px; font-size: 0.75rem;" onclick="openEditUserModal(${u.id}, '${u.full_name}', '${u.email}', '${u.role}')">
                ✏️ Edit
              </button>
              <button class="btn btn-danger" style="padding: 2px 8px; font-size: 0.75rem;" onclick="deleteUserAccount(${u.id}, '${u.full_name}')">
                🗑️
              </button>
            </div>
          ` : 'Restricted'}
        </td>
      </tr>
    `).join('');

  } catch (err) {
    console.error('Error loading users:', err);
  }
}

async function submitCreateUser() {
  const fullName = document.getElementById('new-user-fullname').value;
  const email = document.getElementById('new-user-email').value;
  const password = document.getElementById('new-user-password').value;
  const role = document.getElementById('new-user-role').value;

  try {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ email, password, full_name: fullName, role })
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(err.detail || 'User creation failed', 'error');
      return;
    }

    showToast(`User account created for ${fullName}!`);
    document.getElementById('create-user-form').reset();
    loadUsersList();

  } catch (err) {
    showToast(`Failed to create user: ${err}`, 'error');
  }
}

function openEditUserModal(userId, fullName, email, role) {
  document.getElementById('edit-user-id').value = userId;
  document.getElementById('edit-user-fullname').value = fullName;
  document.getElementById('edit-user-email').value = email;
  document.getElementById('edit-user-role').value = role;
  document.getElementById('edit-user-password').value = '';
  openModal('modal-edit-user');
}

async function submitEditUser() {
  const userId = document.getElementById('edit-user-id').value;
  const fullName = document.getElementById('edit-user-fullname').value;
  const email = document.getElementById('edit-user-email').value;
  const role = document.getElementById('edit-user-role').value;
  const password = document.getElementById('edit-user-password').value;

  const payload = {
    full_name: fullName,
    email: email,
    role: role
  };
  if (password && password.trim() !== '') {
    payload.password = password.trim();
  }

  try {
    const res = await fetch(`/api/users/${userId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(err.detail || 'Update failed', 'error');
      return;
    }

    showToast(`Credentials updated for ${fullName}!`);
    closeModal('modal-edit-user');
    loadUsersList();

  } catch (err) {
    showToast(`Failed to update user: ${err}`, 'error');
  }
}

async function deleteUserAccount(userId, fullName) {
  if (!confirm(`Are you sure you want to delete the user account for ${fullName}?`)) return;

  try {
    const res = await fetch(`/api/users/${userId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(err.detail || 'Delete failed', 'error');
      return;
    }

    showToast(`User account for ${fullName} removed.`);
    loadUsersList();

  } catch (err) {
    showToast(`Failed to delete user: ${err}`, 'error');
  }
}

async function loadSettings() {
  if (currentUserRole === 'viewer') return;
  try {
    const res = await fetch('/api/settings', { headers: getAuthHeaders() });
    if (!res.ok) return;
    const settings = await res.json();

    if (settings.company_name) document.getElementById('set-company-name').value = settings.company_name;
    if (settings.company_arabic_name) document.getElementById('set-company-arabic-name').value = settings.company_arabic_name;
    if (settings.cr_number) document.getElementById('set-cr-number').value = settings.cr_number;
    if (settings.mol_establishment_id) document.getElementById('set-mol-id').value = settings.mol_establishment_id;
    if (settings.gosi_reg_number) document.getElementById('set-gosi-number').value = settings.gosi_reg_number;
    if (settings.wps_bank_code) document.getElementById('set-wps-bank-code').value = settings.wps_bank_code;

  } catch (err) {
    console.error('Error loading settings:', err);
  }
}

async function saveSettings() {
  const payload = {
    company_name: document.getElementById('set-company-name').value,
    company_arabic_name: document.getElementById('set-company-arabic-name').value,
    cr_number: document.getElementById('set-cr-number').value,
    mol_establishment_id: document.getElementById('set-mol-id').value,
    gosi_reg_number: document.getElementById('set-gosi-number').value,
    wps_bank_code: document.getElementById('set-wps-bank-code').value
  };

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });

    if (res.ok) showToast('Company settings saved successfully!');
  } catch (err) {
    showToast(`Failed to save settings: ${err}`, 'error');
  }
}

// 11. BACKUP & RESTORE
async function triggerGoogleDriveBackup() {
  const banner = document.getElementById('backup-status-banner');
  if (banner) {
    banner.style.display = 'block';
    banner.innerHTML = '⏳ <strong>Generating full system backup archive...</strong> Please wait...';
  }

  try {
    const res = await fetch('/api/backup/google-drive', {
      method: 'POST',
      headers: getAuthHeaders()
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(err.detail || 'Backup generation failed', 'error');
      if (banner) banner.style.display = 'none';
      return;
    }

    const data = await res.json();
    if (banner) {
      banner.style.display = 'block';
      banner.innerHTML = `
        ✅ <strong>Backup Completed Successfully!</strong> File: <code>${data.backup_filename}</code><br/>
        <button onclick="downloadBackupArchive('${data.backup_download_url}')" class="btn btn-outline" style="margin-top: 6px; padding: 4px 10px; font-size: 0.8rem;">
          ⬇️ Download Backup Archive (.ZIP)
        </button>
      `;
    }
    showToast(`Backup archive created: ${data.backup_filename}`);

  } catch (err) {
    showToast(`Backup error: ${err}`, 'error');
    if (banner) banner.style.display = 'none';
  }
}

async function submitRestoreBackup() {
  const fileInput = document.getElementById('restore-backup-file');
  if (!fileInput.files || !fileInput.files[0]) {
    showToast('Please select a backup file (.ZIP or .JSON)', 'error');
    return;
  }

  if (!confirm('WARNING: Restoring from a backup will overwrite existing database records with the backup state. Do you wish to proceed?')) {
    return;
  }

  const formData = new FormData();
  formData.append('file', fileInput.files[0]);

  const token = localStorage.getItem('jwt_token') || '';

  try {
    const res = await fetch('/api/backup/restore', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(err.detail || 'Restore failed', 'error');
      return;
    }

    const data = await res.json();
    showToast('Database successfully restored from backup archive!');
    fileInput.value = '';
    
    // Refresh all data
    loadDashboardData();
    loadDepartments();
    loadEmployees();
    loadPayrollRuns();
    loadLeaves();
    loadSupplierPayments();
    loadFinanceAnalytics();
    loadSettings();
    loadUsersList();

  } catch (err) {
    showToast(`Restore error: ${err}`, 'error');
  }
}

// Authenticated Browser File & PDF Opening Handlers
function openSupplierStatementPdf(spId) {
  const token = localStorage.getItem('jwt_token') || '';
  window.open(`/api/suppliers/payments/${spId}/statement.pdf?token=${encodeURIComponent(token)}`, '_blank');
}

function openPayslipPdf(detailId) {
  const token = localStorage.getItem('jwt_token') || '';
  window.open(`/api/payroll/details/${detailId}/payslip.pdf?token=${encodeURIComponent(token)}`, '_blank');
}

function downloadWpsFile(runId) {
  const token = localStorage.getItem('jwt_token') || '';
  window.open(`/api/payroll/runs/${runId}/wps.csv?token=${encodeURIComponent(token)}`, '_blank');
}

function downloadDocumentFile(docId) {
  const token = localStorage.getItem('jwt_token') || '';
  window.open(`/api/documents/${docId}/download?token=${encodeURIComponent(token)}`, '_blank');
}

function downloadBackupArchive(url) {
  const token = localStorage.getItem('jwt_token') || '';
  const sep = url.includes('?') ? '&' : '?';
  window.open(`${url}${sep}token=${encodeURIComponent(token)}`, '_blank');
}

// =========================================================================
// SALARY TRACKING, ALLOWANCE CATEGORIES & AUDIT LOGS MODULE
// =========================================================================

let allAllowanceCategories = [];
let allDeductionCategories = [];
let allSalaryRoster = [];
let allSalaryAuditLogs = [];

/**
 * Deep Module: CompensationClient
 * Encapsulates category CRUD, allowance/deduction assignments, error handling,
 * and unified multi-tab UI synchronizations behind a single interface.
 */
const CompensationClient = {
  async saveCategory(type, payload, catId = null) {
    const endpoint = type === 'allowance' ? '/api/allowance-categories' : '/api/deduction-categories';
    const url = catId ? `${endpoint}/${catId}` : endpoint;
    const method = catId ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || `Failed to save ${type} category`);
    }
    return res.json();
  },

  async deleteCategory(type, catId) {
    const endpoint = type === 'allowance' ? '/api/allowance-categories' : '/api/deduction-categories';
    const res = await fetch(`${endpoint}/${catId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || `Failed to delete ${type} category`);
    }
    return res.json();
  },

  async assignAdjustment(empId, type, payload) {
    const endpoint = type === 'allowance' ? `/api/employees/${empId}/allowances` : `/api/employees/${empId}/deductions`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || `Failed to assign ${type}`);
    }
    return res.json();
  },

  async removeAdjustment(empId, type, adjustmentId) {
    const endpoint = type === 'allowance' ? `/api/employees/${empId}/allowances/${adjustmentId}` : `/api/employees/${empId}/deductions/${adjustmentId}`;
    const res = await fetch(endpoint, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || `Failed to remove ${type}`);
    }
    return res.json();
  },

  async syncAllViews() {
    await Promise.all([
      loadSalaryTrackingHub(),
      loadEmployees(),
      loadDashboardData()
    ]);
    if (typeof currentEmployeeId !== 'undefined' && currentEmployeeId) {
      await viewEmployeeDetail(currentEmployeeId, true);
    }
  }
};

async function loadSalaryTrackingHub() {
  await Promise.all([
    loadSalaryTrackingSummary(),
    loadSalaryTrackingRoster(),
    loadAllowanceCategories(),
    loadDeductionCategories(),
    loadSalaryHistoryTimeline(),
    loadSalaryAuditLogs()
  ]);
}

async function loadSalaryTrackingSummary() {
  try {
    const res = await fetch('/api/salary-tracking/summary', { headers: getAuthHeaders() });
    if (!res.ok) return;
    const data = await res.json();

    const setT = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.innerText = val;
    };

    setT('st-stat-base', `SAR ${parseFloat(data.total_monthly_basic || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}`);
    const totAllow = parseFloat(data.total_monthly_allowances || 0);
    const totMeal = parseFloat(data.total_monthly_meal || 0);
    const totSite = parseFloat(data.total_monthly_site || 0);
    setT('st-stat-allowances', `SAR ${totAllow.toLocaleString('en-US', {minimumFractionDigits: 2})}`);
    setT('st-stat-allowances-sub', `Meal: ${totMeal.toLocaleString()} | Project/Site: ${totSite.toLocaleString()}`);
    
    const totDed = parseFloat(data.total_monthly_deductions || 0);
    setT('st-stat-deductions', `SAR ${totDed.toLocaleString('en-US', {minimumFractionDigits: 2})}`);

    setT('st-stat-gross', `SAR ${parseFloat(data.total_monthly_gross_payroll || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}`);
    const catCount = (data.category_breakdown || []).length;
    const dedCount = (data.deduction_category_breakdown || []).length;
    setT('st-stat-categories', `${catCount} Allow. | ${dedCount} Ded. Categories`);

  } catch (err) {
    console.error('Error loading salary tracking summary:', err);
  }
}

async function loadSalaryTrackingRoster() {
  try {
    const res = await fetch('/api/employees?sort_by=hire_date&sort_order=asc', { headers: getAuthHeaders() });
    if (!res.ok) return;
    allSalaryRoster = await res.json();

    // Populate department filter while preserving selected value
    const deptSelect = document.getElementById('st-roster-dept-filter');
    if (deptSelect && allDepartments && allDepartments.length > 0) {
      const curVal = deptSelect.value;
      deptSelect.innerHTML = `<option value="">All Departments</option>` + allDepartments.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
      if (curVal) deptSelect.value = curVal;
    }

    filterSalaryRosterTable();
  } catch (err) {
    console.error('Error loading salary roster:', err);
  }
}

function renderSalaryRosterTable(employees) {
  const tbody = document.getElementById('st-roster-table-body');
  if (!tbody) return;

  if (!employees || employees.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 20px; color: var(--text-muted);">No matching employee compensation records found.</td></tr>`;
    return;
  }

  tbody.innerHTML = employees.map(e => {
    const fullN = [e.first_name, e.middle_name, e.last_name].filter(Boolean).join(' ');
    const basic = parseFloat(e.basic_salary || 0);
    const meal = parseFloat(e.meal_allowance || 0);
    const site = parseFloat(e.site_allowance || 0);
    const other = parseFloat(e.other_allowances || 0);
    const gross = basic + meal + site + other;
    const actDed = parseFloat(e.active_deductions || 0);

    return `
      <tr>
        <td><strong>${e.emp_code}</strong></td>
        <td>
          <a href="javascript:void(0)" onclick="viewEmployeeDetail(${e.id})" style="font-weight: 700; color: var(--primary-color); text-decoration: none;">
            ${fullN}
          </a>
          ${e.arabic_name ? `<div style="font-size: 0.72rem; color: var(--text-muted);">${e.arabic_name}</div>` : ''}
        </td>
        <td>
          <div>${e.department_name || 'General'}</div>
          <small style="color: var(--text-muted);">${e.designation}</small>
        </td>
        <td><strong style="color: #0A1128;">SAR ${basic.toLocaleString('en-US', {minimumFractionDigits: 2})}</strong></td>
        <td>SAR ${meal.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
        <td>SAR ${site.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
        <td>SAR ${other.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
        <td style="color: #DC2626; font-weight: 600;">SAR ${actDed.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
        <td><strong style="color: #059669; font-size: 0.95rem;">SAR ${gross.toLocaleString('en-US', {minimumFractionDigits: 2})}</strong></td>
        <td>
          <div style="display: flex; gap: 4px; align-items: center; flex-wrap: wrap;">
            <button class="btn btn-primary" style="padding: 3px 8px; font-size: 0.75rem; font-weight: 700;" onclick="openQuickSalaryAdjustmentModal(${e.id})">
              💰 Set Salary
            </button>
            <button class="btn btn-outline" style="padding: 3px 6px; font-size: 0.72rem; color: #059669; border-color: #059669;" onclick="openQuickAddAllowanceModal(${e.id})" title="Add Custom Allowance">
              + Allow.
            </button>
            <button class="btn btn-outline" style="padding: 3px 6px; font-size: 0.72rem; color: #DC2626; border-color: #DC2626;" onclick="openQuickAddDeductionModal(${e.id})" title="Add Custom Deduction">
              - Ded.
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function filterSalaryRosterTable() {
  const search = (document.getElementById('st-roster-search')?.value || '').toLowerCase().trim();
  const deptId = document.getElementById('st-roster-dept-filter')?.value;

  const filtered = allSalaryRoster.filter(e => {
    const fullN = [e.first_name, e.middle_name, e.last_name, e.arabic_name, e.emp_code, e.designation].filter(Boolean).join(' ').toLowerCase();
    const matchesSearch = !search || fullN.includes(search);
    const matchesDept = !deptId || String(e.department_id) === String(deptId);
    return matchesSearch && matchesDept;
  });

  renderSalaryRosterTable(filtered);
}

function switchSalaryTrackingTab(tabKey) {
  const tabs = ['roster', 'categories', 'deductions', 'history', 'audit'];
  tabs.forEach(t => {
    const btn = document.getElementById(`st-tab-${t}-btn`);
    const pane = document.getElementById(`st-tab-${t}`);
    if (btn) btn.classList.remove('active');
    if (pane) {
      pane.style.display = 'none';
      pane.classList.remove('active');
    }
  });

  const activeBtn = document.getElementById(`st-tab-${tabKey}-btn`);
  const activePane = document.getElementById(`st-tab-${tabKey}`);
  if (activeBtn) activeBtn.classList.add('active');
  if (activePane) {
    activePane.style.display = 'block';
    activePane.classList.add('active');
  }
}

// --- Allowance Categories Management ---

async function loadAllowanceCategories() {
  try {
    const res = await fetch('/api/allowance-categories', { headers: getAuthHeaders() });
    if (!res.ok) return;
    allAllowanceCategories = await res.json();

    const tbody = document.getElementById('st-categories-table-body');
    const allowSelect = document.getElementById('allowance-category-select');

    if (allowSelect) {
      allowSelect.innerHTML = `<option value="">Select Category...</option>` + allAllowanceCategories.map(c => {
        return `<option value="${c.id}" data-default="${c.default_amount || 0}" data-gosi="${c.is_gosi_eligible}" data-rec="${c.is_recurring}">
          ${c.name} (${c.code})
        </option>`;
      }).join('');
    }

    if (!tbody) return;

    if (allAllowanceCategories.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px; color: var(--text-muted);">No allowance categories created. Click '+ Create New Allowance Category'.</td></tr>`;
      return;
    }

    const summaryRes = await fetch('/api/salary-tracking/summary', { headers: getAuthHeaders() });
    const summaryData = summaryRes.ok ? await summaryRes.json() : {};
    const countMap = {};
    const sumMap = {};
    (summaryData.category_breakdown || []).forEach(b => {
      countMap[b.code] = b.assigned_count;
      sumMap[b.code] = b.total_amount;
    });

    tbody.innerHTML = allAllowanceCategories.map(c => {
      const assigned = countMap[c.code] || 0;
      const totAmt = sumMap[c.code] || 0;

      return `
        <tr>
          <td><span class="badge badge-saudi" style="font-weight: 800;">${c.code}</span></td>
          <td>
            <strong>${c.name}</strong>
            ${c.description ? `<div style="font-size: 0.72rem; color: var(--text-muted);">${c.description}</div>` : ''}
          </td>
          <td>${c.name_ar || '-'}</td>
          <td>${c.is_recurring ? '<span class="badge badge-pending">Monthly Recurring</span>' : '<span class="badge badge-outline">One-Time / As Needed</span>'}</td>
          <td><strong>${assigned} Employees</strong></td>
          <td><strong style="color: #059669;">SAR ${parseFloat(totAmt).toLocaleString('en-US', {minimumFractionDigits: 2})}</strong></td>
          <td>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-outline" style="padding: 2px 8px; font-size: 0.72rem;" onclick="openAllowanceCategoryModal(${c.id})">
                ✏️ Edit
              </button>
              ${currentUserRole === 'admin' ? `
                <button class="btn btn-danger" style="padding: 2px 8px; font-size: 0.72rem;" onclick="deleteAllowanceCategory(${c.id}, '${c.name.replace(/'/g, "\\'")}')">
                  🗑️
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error('Error loading allowance categories:', err);
  }
}

function openAllowanceCategoryModal(catId = null) {
  document.getElementById('allowance-cat-form').reset();
  const idInput = document.getElementById('allowance-cat-id');
  const title = document.getElementById('allowance-cat-modal-title');

  if (catId) {
    const c = allAllowanceCategories.find(x => x.id === catId);
    if (!c) return;
    idInput.value = c.id;
    document.getElementById('cat-name').value = c.name;
    document.getElementById('cat-name-ar').value = c.name_ar || '';
    document.getElementById('cat-code').value = c.code;
    document.getElementById('cat-default-amount').value = c.default_amount || 0;
    document.getElementById('cat-is-recurring').value = c.is_recurring !== undefined ? c.is_recurring : 1;
    document.getElementById('cat-desc').value = c.description || '';
    if (title) title.innerText = '✏️ Edit Allowance Category';
  } else {
    idInput.value = '';
    document.getElementById('cat-is-recurring').value = '1';
    if (title) title.innerText = '🏷️ Create Allowance Category';
  }

  openModal('modal-allowance-category');
}

async function submitAllowanceCategory() {
  const catId = document.getElementById('allowance-cat-id').value;
  const payload = {
    name: document.getElementById('cat-name').value.trim(),
    name_ar: document.getElementById('cat-name-ar').value.trim() || null,
    code: document.getElementById('cat-code').value.trim().toUpperCase(),
    default_amount: parseFloat(document.getElementById('cat-default-amount').value || 0),
    is_recurring: parseInt(document.getElementById('cat-is-recurring').value || 1),
    is_gosi_eligible: 0,
    description: document.getElementById('cat-desc').value.trim() || null
  };

  try {
    await CompensationClient.saveCategory('allowance', payload, catId);
    closeModal('modal-allowance-category');
    showToast(catId ? 'Category updated successfully!' : 'Allowance category created successfully!');
    await CompensationClient.syncAllViews();
  } catch (err) {
    showToast(`Error saving category: ${err.message}`, 'error');
  }
}

async function deleteAllowanceCategory(catId, catName) {
  if (!confirm(`Are you sure you want to delete allowance category '${catName}'?`)) return;

  try {
    await CompensationClient.deleteCategory('allowance', catId);
    showToast(`Category '${catName}' deleted.`);
    await CompensationClient.syncAllViews();
  } catch (err) {
    showToast(`Delete error: ${err.message}`, 'error');
  }
}

// --- Deduction Categories Management ---

async function loadDeductionCategories() {
  try {
    const res = await fetch('/api/deduction-categories', { headers: getAuthHeaders() });
    if (!res.ok) return;
    allDeductionCategories = await res.json();

    const tbody = document.getElementById('st-deductions-table-body');
    const dedSelect = document.getElementById('deduction-category-select');

    if (dedSelect) {
      dedSelect.innerHTML = `<option value="">Select Deduction Category...</option>` + allDeductionCategories.map(d => {
        return `<option value="${d.id}" data-default="${d.default_amount || 0}" data-rec="${d.is_recurring}">
          ${d.name} (${d.code})
        </option>`;
      }).join('');
    }

    if (!tbody) return;

    if (allDeductionCategories.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px; color: var(--text-muted);">No deduction categories configured. Click '+ Create New Deduction Category'.</td></tr>`;
      return;
    }

    const summaryRes = await fetch('/api/salary-tracking/summary', { headers: getAuthHeaders() });
    const summaryData = summaryRes.ok ? await summaryRes.json() : {};
    const countMap = {};
    const sumMap = {};
    (summaryData.deduction_category_breakdown || []).forEach(b => {
      countMap[b.code] = b.assigned_count;
      sumMap[b.code] = b.total_amount;
    });

    tbody.innerHTML = allDeductionCategories.map(d => {
      const assigned = countMap[d.code] || 0;
      const totAmt = sumMap[d.code] || 0;

      return `
        <tr>
          <td><span class="badge badge-critical" style="font-weight: 800;">${d.code}</span></td>
          <td>
            <strong>${d.name}</strong>
            ${d.description ? `<div style="font-size: 0.72rem; color: var(--text-muted);">${d.description}</div>` : ''}
          </td>
          <td>${d.name_ar || '-'}</td>
          <td>${d.is_recurring ? '<span class="badge badge-pending">Monthly Recurring</span>' : '<span class="badge badge-outline">One-Time / As Incurred</span>'}</td>
          <td><strong>${assigned} Employees</strong></td>
          <td><strong style="color: #DC2626;">SAR ${parseFloat(totAmt).toLocaleString('en-US', {minimumFractionDigits: 2})}</strong></td>
          <td>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-outline" style="padding: 2px 8px; font-size: 0.72rem;" onclick="openDeductionCategoryModal(${d.id})">
                ✏️ Edit
              </button>
              ${currentUserRole === 'admin' ? `
                <button class="btn btn-danger" style="padding: 2px 8px; font-size: 0.72rem;" onclick="deleteDeductionCategory(${d.id}, '${d.name.replace(/'/g, "\\'")}')">
                  🗑️
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error('Error loading deduction categories:', err);
  }
}

function openDeductionCategoryModal(catId = null) {
  document.getElementById('deduction-cat-form').reset();
  const idInput = document.getElementById('deduction-cat-id');
  const title = document.getElementById('deduction-cat-modal-title');

  if (catId) {
    const d = allDeductionCategories.find(x => x.id === catId);
    if (!d) return;
    idInput.value = d.id;
    document.getElementById('ded-cat-name').value = d.name;
    document.getElementById('ded-cat-name-ar').value = d.name_ar || '';
    document.getElementById('ded-cat-code').value = d.code;
    document.getElementById('ded-cat-default-amount').value = d.default_amount || 0;
    document.getElementById('ded-cat-is-recurring').value = d.is_recurring !== undefined ? d.is_recurring : 1;
    document.getElementById('ded-cat-desc').value = d.description || '';
    if (title) title.innerText = '✏️ Edit Deduction Category';
  } else {
    idInput.value = '';
    document.getElementById('ded-cat-is-recurring').value = '1';
    if (title) title.innerText = '📉 Create Deduction Category';
  }

  openModal('modal-deduction-category');
}

async function submitDeductionCategory() {
  const catId = document.getElementById('deduction-cat-id').value;
  const payload = {
    name: document.getElementById('ded-cat-name').value.trim(),
    name_ar: document.getElementById('ded-cat-name-ar').value.trim() || null,
    code: document.getElementById('ded-cat-code').value.trim().toUpperCase(),
    default_amount: parseFloat(document.getElementById('ded-cat-default-amount').value || 0),
    is_recurring: parseInt(document.getElementById('ded-cat-is-recurring').value || 1),
    description: document.getElementById('ded-cat-desc').value.trim() || null
  };

  try {
    await CompensationClient.saveCategory('deduction', payload, catId);
    closeModal('modal-deduction-category');
    showToast(catId ? 'Deduction category updated!' : 'Deduction category created successfully!');
    await CompensationClient.syncAllViews();
  } catch (err) {
    showToast(`Error saving deduction category: ${err.message}`, 'error');
  }
}

async function deleteDeductionCategory(catId, catName) {
  if (!confirm(`Are you sure you want to delete deduction category '${catName}'?`)) return;

  try {
    await CompensationClient.deleteCategory('deduction', catId);
    showToast(`Deduction category '${catName}' deleted.`);
    await CompensationClient.syncAllViews();
  } catch (err) {
    showToast(`Delete error: ${err.message}`, 'error');
  }
}

// --- Quick Assign Custom Deduction ---

function openQuickAddDeductionModal(empId = null) {
  document.getElementById('add-deduction-form').reset();
  const selectorGroup = document.getElementById('deduction-emp-selector-group');
  const empSelect = document.getElementById('deduction-emp-select');
  const idInput = document.getElementById('deduction-emp-id');

  const todayStr = new Date().toISOString().split('T')[0];
  document.getElementById('deduction-effective-from').value = todayStr;

  if (empId) {
    idInput.value = empId;
    if (selectorGroup) selectorGroup.style.display = 'none';
  } else {
    idInput.value = '';
    if (selectorGroup) {
      selectorGroup.style.display = 'block';
      empSelect.innerHTML = `<option value="">Select Employee...</option>` + allSalaryRoster.map(e => {
        const fullN = [e.first_name, e.middle_name, e.last_name].filter(Boolean).join(' ');
        return `<option value="${e.id}">${e.emp_code} - ${fullN}</option>`;
      }).join('');
    }
  }

  loadDeductionCategories();
  openModal('modal-add-deduction');
}

function handleDeductionCategoryChange() {
  const select = document.getElementById('deduction-category-select');
  if (!select) return;
  const opt = select.options[select.selectedIndex];
  if (opt && opt.dataset.default) {
    const def = parseFloat(opt.dataset.default);
    if (def > 0) {
      document.getElementById('deduction-amount').value = def;
    }
  }
}

async function submitAddEmployeeDeduction() {
  let empId = document.getElementById('deduction-emp-id').value;
  if (!empId) {
    empId = document.getElementById('deduction-emp-select').value;
  }
  if (!empId) {
    showToast('Please select an employee.', 'error');
    return;
  }

  const catId = parseInt(document.getElementById('deduction-category-select').value);
  if (!catId) {
    showToast('Please select a deduction category.', 'error');
    return;
  }

  const payload = {
    category_id: catId,
    amount: parseFloat(document.getElementById('deduction-amount').value || 0),
    frequency: document.getElementById('deduction-frequency').value || 'Monthly',
    effective_from: document.getElementById('deduction-effective-from').value,
    effective_to: document.getElementById('deduction-effective-to').value || null,
    is_active: 1,
    notes: document.getElementById('deduction-notes').value.trim() || null
  };

  try {
    await CompensationClient.assignAdjustment(empId, 'deduction', payload);
    closeModal('modal-add-deduction');
    showToast('Deduction assigned successfully!');
    await CompensationClient.syncAllViews();
  } catch (err) {
    showToast(`Error assigning deduction: ${err.message}`, 'error');
  }
}

async function deleteEmployeeDeduction(empId, deductionId) {
  if (!confirm('Are you sure you want to remove this deduction?')) return;

  try {
    await CompensationClient.removeAdjustment(empId, 'deduction', deductionId);
    showToast('Deduction removed successfully.');
    await CompensationClient.syncAllViews();
  } catch (err) {
    showToast(`Delete error: ${err.message}`, 'error');
  }
}

// --- History & Audit Logs ---

async function loadSalaryHistoryTimeline() {
  const tbody = document.getElementById('st-history-table-body');
  if (!tbody) return;

  try {
    const res = await fetch('/api/salary-tracking/summary', { headers: getAuthHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    const history = data.recent_increments || [];

    if (history.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px; color: var(--text-muted);">No salary increments or adjustments recorded yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = history.map(h => {
      const fullN = [h.first_name, h.last_name].filter(Boolean).join(' ');
      const diff = h.new_basic - h.previous_basic;
      const pct = h.previous_basic > 0 ? (diff / h.previous_basic * 100).toFixed(1) : 0;

      return `
        <tr>
          <td><strong>${h.effective_date}</strong></td>
          <td>
            <strong>${h.emp_code}</strong> - ${fullN}
            <div style="font-size: 0.72rem; color: var(--text-muted);">${h.department_name || ''}</div>
          </td>
          <td>SAR ${parseFloat(h.previous_basic).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
          <td><strong style="color: #0047AB;">SAR ${parseFloat(h.new_basic).toLocaleString('en-US', {minimumFractionDigits: 2})}</strong></td>
          <td>
            <span class="badge ${diff >= 0 ? 'badge-active' : 'badge-critical'}">
              ${diff >= 0 ? '+' : ''}${diff.toLocaleString('en-US', {minimumFractionDigits: 2})} SAR (${pct}%)
            </span>
          </td>
          <td><strong>${h.change_reason}</strong></td>
          <td><small>${h.approved_by || 'HR Admin'}</small></td>
          <td><small style="color: var(--text-muted);">${h.notes || '-'}</small></td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading salary history timeline:', err);
  }
}

async function loadSalaryAuditLogs() {
  const tbody = document.getElementById('st-audit-table-body');
  if (!tbody) return;

  const actionFilter = document.getElementById('st-audit-action-filter')?.value || '';
  const url = actionFilter ? `/api/salary-tracking/audit-logs?action_type=${encodeURIComponent(actionFilter)}&limit=100` : `/api/salary-tracking/audit-logs?limit=100`;

  try {
    const res = await fetch(url, { headers: getAuthHeaders() });
    if (!res.ok) return;
    allSalaryAuditLogs = await res.json();
    renderSalaryAuditLogsTable(allSalaryAuditLogs);
  } catch (err) {
    console.error('Error loading audit logs:', err);
  }
}

function renderSalaryAuditLogsTable(logs) {
  const tbody = document.getElementById('st-audit-table-body');
  if (!tbody) return;

  if (!logs || logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px; color: var(--text-muted);">No audit logs found matching criteria.</td></tr>`;
    return;
  }

  const getBadge = (type) => {
    switch (type) {
      case 'SALARY_INCREMENT': return '<span class="badge badge-active">📈 Increment</span>';
      case 'DIRECT_SALARY_UPDATE': return '<span class="badge badge-saudi">💰 Salary Set</span>';
      case 'ALLOWANCE_ADDED': return '<span class="badge badge-pending">➕ Allowance</span>';
      case 'ALLOWANCE_UPDATED': return '<span class="badge badge-outline">✏️ Allow. Edit</span>';
      case 'ALLOWANCE_REMOVED': return '<span class="badge badge-critical">🗑️ Allow. Del</span>';
      case 'DEDUCTION_ADDED': return '<span class="badge badge-critical">➖ Deduction</span>';
      case 'DEDUCTION_UPDATED': return '<span class="badge badge-outline">✏️ Ded. Edit</span>';
      case 'DEDUCTION_REMOVED': return '<span class="badge badge-active">🗑️ Ded. Removed</span>';
      default: return `<span class="badge badge-outline">${type}</span>`;
    }
  };

  tbody.innerHTML = logs.map(l => {
    const fullN = [l.first_name, l.last_name].filter(Boolean).join(' ');
    return `
      <tr>
        <td><small style="color: var(--text-muted); font-weight: 600;">${l.timestamp}</small></td>
        <td><strong>${l.emp_code || ''}</strong> ${fullN}</td>
        <td>${getBadge(l.action_type)}</td>
        <td><strong>${l.description}</strong></td>
        <td><small>${l.changed_by}</small></td>
      </tr>
    `;
  }).join('');
}

function filterSalaryAuditLogsTable() {
  const search = (document.getElementById('st-audit-search')?.value || '').toLowerCase().trim();
  if (!search) {
    renderSalaryAuditLogsTable(allSalaryAuditLogs);
    return;
  }
  const filtered = allSalaryAuditLogs.filter(l => {
    const text = [l.first_name, l.last_name, l.emp_code, l.action_type, l.description, l.changed_by].filter(Boolean).join(' ').toLowerCase();
    return text.includes(search);
  });
  renderSalaryAuditLogsTable(filtered);
}

function openQuickAddAllowanceModal(empId = null) {
  document.getElementById('add-allowance-form').reset();
  const selectorGroup = document.getElementById('allowance-emp-selector-group');
  const empSelect = document.getElementById('allowance-emp-select');
  const idInput = document.getElementById('allowance-emp-id');

  const todayStr = new Date().toISOString().split('T')[0];
  document.getElementById('allowance-effective-from').value = todayStr;

  if (empId) {
    idInput.value = empId;
    if (selectorGroup) selectorGroup.style.display = 'none';
  } else {
    idInput.value = '';
    if (selectorGroup) {
      selectorGroup.style.display = 'block';
      empSelect.innerHTML = `<option value="">Select Employee...</option>` + allSalaryRoster.map(e => {
        const fullN = [e.first_name, e.middle_name, e.last_name].filter(Boolean).join(' ');
        return `<option value="${e.id}">${e.emp_code} - ${fullN}</option>`;
      }).join('');
    }
  }

  loadAllowanceCategories();
  openModal('modal-add-allowance');
}

function openAddAllowanceForCurrentEmp() {
  if (currentEmployeeId) {
    openQuickAddAllowanceModal(currentEmployeeId);
  }
}

function handleAllowanceCategoryChange() {
  const select = document.getElementById('allowance-category-select');
  if (!select) return;
  const opt = select.options[select.selectedIndex];
  if (opt && opt.dataset.default) {
    const def = parseFloat(opt.dataset.default);
    if (def > 0) {
      document.getElementById('allowance-amount').value = def;
    }
  }
}

async function submitAddEmployeeAllowance() {
  let empId = document.getElementById('allowance-emp-id').value;
  if (!empId) {
    empId = document.getElementById('allowance-emp-select').value;
  }
  if (!empId) {
    showToast('Please select an employee.', 'error');
    return;
  }

  const catId = parseInt(document.getElementById('allowance-category-select').value);
  if (!catId) {
    showToast('Please select an allowance category.', 'error');
    return;
  }

  const payload = {
    category_id: catId,
    amount: parseFloat(document.getElementById('allowance-amount').value || 0),
    frequency: document.getElementById('allowance-frequency').value || 'Monthly',
    effective_from: document.getElementById('allowance-effective-from').value,
    effective_to: document.getElementById('allowance-effective-to').value || null,
    is_active: 1,
    notes: document.getElementById('allowance-notes').value.trim() || null
  };

  try {
    await CompensationClient.assignAdjustment(empId, 'allowance', payload);
    closeModal('modal-add-allowance');
    showToast('Allowance assigned successfully!');
    await CompensationClient.syncAllViews();
  } catch (err) {
    showToast(`Error assigning allowance: ${err.message}`, 'error');
  }
}

async function deleteEmployeeAllowance(empId, allowanceId) {
  if (!confirm('Are you sure you want to remove this allowance benefit?')) return;

  try {
    await CompensationClient.removeAdjustment(empId, 'allowance', allowanceId);
    showToast('Allowance removed successfully.');
    await CompensationClient.syncAllViews();
  } catch (err) {
    showToast(`Delete error: ${err.message}`, 'error');
  }
}

function openQuickSalaryAdjustmentModal(empId, currentBasic) {
  const form = document.getElementById('salary-adjustment-form');
  if (form) form.reset();

  const emp = (allSalaryRoster && allSalaryRoster.find(x => x.id === empId)) || 
              (allEmployees && allEmployees.find(x => x.id === empId)) || {};

  const b = parseFloat(emp.basic_salary !== undefined ? emp.basic_salary : (currentBasic || 0));
  const m = parseFloat(emp.meal_allowance || 0);
  const s = parseFloat(emp.site_allowance || 0);
  const o = parseFloat(emp.other_allowances || 0);
  const curGross = b + m + s + o;

  document.getElementById('adj-emp-id').value = empId;
  
  const nameEl = document.getElementById('adj-emp-name-banner');
  if (nameEl) nameEl.innerText = `${emp.first_name || ''} ${emp.last_name || ''} (${emp.emp_code || 'ID: ' + empId})`.trim();
  
  const deptEl = document.getElementById('adj-emp-dept-banner');
  if (deptEl) deptEl.innerText = `${emp.department_name || 'General'} • ${emp.designation || 'Staff'}`;

  const grossBadge = document.getElementById('adj-current-gross-badge');
  if (grossBadge) grossBadge.innerText = `SAR ${curGross.toLocaleString('en-US', {minimumFractionDigits: 2})}`;

  document.getElementById('adj-new-basic').value = b;
  document.getElementById('adj-new-meal').value = m;
  document.getElementById('adj-new-site').value = s;
  document.getElementById('adj-new-other').value = o;

  document.getElementById('adj-effective-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('adj-reason').value = 'Direct Salary Input';
  document.getElementById('adj-notes').value = '';

  calculateAdjustmentDiff();
  openModal('modal-salary-adjustment');
}

function openSalaryAdjustmentForCurrentEmp() {
  if (!currentEmployeeId) return;
  openQuickSalaryAdjustmentModal(currentEmployeeId);
}

function calculateAdjustmentDiff() {
  const grossBadge = document.getElementById('adj-current-gross-badge');
  const curGrossStr = grossBadge ? grossBadge.innerText.replace('SAR', '').replace(/,/g, '').trim() : '0';
  const curGross = parseFloat(curGrossStr) || 0;

  const basic = parseFloat(document.getElementById('adj-new-basic')?.value || 0);
  const meal = parseFloat(document.getElementById('adj-new-meal')?.value || 0);
  const site = parseFloat(document.getElementById('adj-new-site')?.value || 0);
  const other = parseFloat(document.getElementById('adj-new-other')?.value || 0);

  const newGross = basic + meal + site + other;
  
  const grossPreview = document.getElementById('adj-new-gross-preview');
  if (grossPreview) {
    grossPreview.innerText = `SAR ${newGross.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
  }

  const preview = document.getElementById('adj-diff-preview');
  if (!preview) return;

  const diff = newGross - curGross;
  const pct = curGross > 0 ? (diff / curGross * 100).toFixed(1) : 0;

  if (diff > 0.005) {
    preview.style.color = '#059669';
    preview.innerText = `▲ Net Raise: +SAR ${diff.toLocaleString('en-US', {minimumFractionDigits: 2})} (+${pct}%)`;
  } else if (diff < -0.005) {
    preview.style.color = '#DC2626';
    preview.innerText = `▼ Reduction: -SAR ${Math.abs(diff).toLocaleString('en-US', {minimumFractionDigits: 2})} (${pct}%)`;
  } else {
    preview.innerText = '• No net gross change';
    preview.style.color = 'var(--text-muted)';
  }
}

async function submitSalaryAdjustment() {
  const empId = document.getElementById('adj-emp-id').value;
  if (!empId) {
    showToast('Employee ID missing.', 'error');
    return;
  }

  const basic = parseFloat(document.getElementById('adj-new-basic').value || 0);
  const meal = parseFloat(document.getElementById('adj-new-meal').value || 0);
  const site = parseFloat(document.getElementById('adj-new-site').value || 0);
  const other = parseFloat(document.getElementById('adj-new-other').value || 0);

  const payload = {
    basic_salary: basic,
    meal_allowance: meal,
    site_allowance: site,
    other_allowances: other,
    housing_allowance: 0.0,
    transport_allowance: 0.0,
    change_reason: document.getElementById('adj-reason').value,
    effective_date: document.getElementById('adj-effective-date').value,
    notes: document.getElementById('adj-notes').value.trim() || null
  };

  try {
    const res = await fetch(`/api/employees/${empId}/direct-salary`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(err.detail || 'Failed to update salary', 'error');
      return;
    }

    const data = await res.json();
    closeModal('modal-salary-adjustment');
    showToast(data.message || 'Salary values updated successfully!');

    // Real-time instantaneous refresh across all tabs and parent roster
    await Promise.all([
      loadSalaryTrackingHub(),
      loadEmployees(),
      loadDashboardData()
    ]);
    if (currentEmployeeId) {
      await viewEmployeeDetail(currentEmployeeId, true);
    }
  } catch (err) {
    showToast(`Error updating salary: ${err}`, 'error');
  }
}

// =========================================================================
// ACCOUNTS RECEIVABLE: CLIENT COLLECTIONS & INVOICING HUB
// =========================================================================

let allRegisteredClients = [];
let allClientInvoices = [];
let currentCollectionSummaryData = null;
let currentViewingClientId = null;

function switchClientSubTab(tabId) {
  document.querySelectorAll('#section-collections .tab-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('data-tab') === tabId) btn.classList.add('active');
  });

  document.querySelectorAll('#section-collections .tab-content').forEach(content => {
    content.classList.remove('active');
  });

  const activeContent = document.getElementById(tabId);
  if (activeContent) activeContent.classList.add('active');
}

async function loadClientCollectionsHub() {
  const monthEl = document.getElementById('col-select-month');
  const yearEl = document.getElementById('col-select-year');
  const statusEl = document.getElementById('col-filter-status');

  const month = monthEl ? parseInt(monthEl.value) : (new Date().getMonth() + 1);
  const year = yearEl ? parseInt(yearEl.value) : new Date().getFullYear();
  const status = statusEl ? statusEl.value : '';

  try {
    const res = await fetch(`/api/client-collections/monthly-summary?month=${month}&year=${year}`, {
      headers: getAuthHeaders()
    });

    if (!res.ok) {
      if (res.status === 401) {
        showToast('Session expired. Please sign in.', 'error');
        showLoginModal();
        return;
      }
      showToast('Failed to load client collection summary', 'error');
      return;
    }

    const data = await res.json();
    currentCollectionSummaryData = data;

    // Update KPI Cards
    const kpiBilled = document.getElementById('col-kpi-total-billed');
    if (kpiBilled) kpiBilled.innerText = `SAR ${(data.month_invoiced_total || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}`;

    const kpiCol = document.getElementById('col-kpi-total-collected');
    if (kpiCol) kpiCol.innerText = `SAR ${(data.month_collected_total || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}`;

    const kpiRem = document.getElementById('col-kpi-total-remaining');
    if (kpiRem) kpiRem.innerText = `SAR ${(data.month_remaining_total || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}`;

    const kpiRate = document.getElementById('col-kpi-collection-rate');
    if (kpiRate) kpiRate.innerText = `${data.collection_rate || 0.0}%`;

    // Render Invoices Table
    allClientInvoices = data.month_invoices || [];
    renderClientInvoicesTable(allClientInvoices, status);

    // Render Client Summary Breakdown Table
    renderClientSummaryBreakdownTable(data.client_breakdown || []);

    // Render Aging Schedule
    renderClientAgingSchedule(data.aging_schedule || {});

  } catch (err) {
    console.error('Error loading collections hub:', err);
    showToast(`Error loading collections: ${err}`, 'error');
  }
}

function renderClientInvoicesTable(invoices, statusFilter = '') {
  const tbody = document.getElementById('client-invoices-table-body');
  const tfoot = document.getElementById('client-invoices-table-foot');
  if (!tbody) return;

  let filtered = invoices;
  if (statusFilter) {
    filtered = filtered.filter(x => x.status === statusFilter);
  }

  if (!filtered || filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 24px; color: var(--text-muted);">
          No client invoices found for this period. Click "+ Issue Client Invoice" to add one.
        </td>
      </tr>
    `;
    if (tfoot) tfoot.innerHTML = '';
    return;
  }

  let sumBilled = 0;
  let sumCol = 0;
  let sumRem = 0;

  tbody.innerHTML = filtered.map(inv => {
    const tot = parseFloat(inv.total_amount || 0);
    const col = parseFloat(inv.collected_amount || 0);
    const rem = parseFloat(inv.remaining_amount || 0);
    sumBilled += tot;
    sumCol += col;
    sumRem += rem;

    let badgeClass = 'badge-warning';
    if (inv.status === 'Collected') badgeClass = 'badge-success';
    else if (inv.status === 'Partially Collected') badgeClass = 'badge-primary';

    const sPeriod = (inv.service_period_start && inv.service_period_end) 
      ? `${inv.service_period_start} to ${inv.service_period_end}`
      : (inv.invoice_date || '-');

    return `
      <tr>
        <td style="font-weight: 700; color: #0047AB;">${inv.invoice_number || 'INV'}</td>
        <td style="font-weight: 600;">${inv.client_name || 'Client'}</td>
        <td style="font-size: 0.8rem; color: #64748B;">${sPeriod}</td>
        <td>${inv.due_date || '-'}</td>
        <td style="text-align: right; font-weight: 700;">SAR ${tot.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
        <td style="text-align: right; font-weight: 700; color: #059669;">SAR ${col.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
        <td style="text-align: right; font-weight: 800; color: ${rem > 0 ? '#DC2626' : '#059669'};">
          SAR ${rem.toLocaleString('en-US', {minimumFractionDigits: 2})}
        </td>
        <td style="text-align: center;">
          <span class="badge ${badgeClass}">${inv.status || 'Pending'}</span>
        </td>
        <td style="text-align: center;">
          <div style="display: flex; gap: 4px; justify-content: center; flex-wrap: wrap;">
            ${inv.status !== 'Collected' ? `
              <button class="btn btn-outline" style="padding: 2px 8px; font-size: 0.75rem; border-color: #059669; color: #059669; background: #ECFDF5; font-weight: 700;" title="Record Collection Receipt" onclick="openRecordCollectionModal(${inv.id})">
                💰 Collect
              </button>
            ` : ''}
            <button class="btn btn-outline" style="padding: 2px 8px; font-size: 0.75rem;" title="View Statement & History" onclick="openClientLedgerModal(${inv.client_id || inv.id})">
              📜 History
            </button>
            ${currentUserRole === 'admin' ? `
              <button class="btn btn-danger" style="padding: 2px 6px; font-size: 0.75rem;" title="Delete Invoice" onclick="deleteClientInvoice(${inv.id}, '${inv.invoice_number}')">
                🗑️
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  if (tfoot) {
    tfoot.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: right; font-weight: 800; color: #0F172A;">PERIOD TOTALS (${filtered.length} INVOICES):</td>
        <td style="text-align: right; font-weight: 800; color: #0047AB;">SAR ${sumBilled.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
        <td style="text-align: right; font-weight: 800; color: #059669;">SAR ${sumCol.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
        <td style="text-align: right; font-weight: 900; color: #DC2626;">SAR ${sumRem.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
        <td colspan="2"></td>
      </tr>
    `;
  }
}

function filterClientInvoicesTable() {
  const query = (document.getElementById('col-search-input').value || '').toLowerCase();
  const statusFilter = document.getElementById('col-filter-status').value;

  let filtered = allClientInvoices;
  if (query) {
    filtered = filtered.filter(x => 
      (x.client_name || '').toLowerCase().includes(query) ||
      (x.invoice_number || '').toLowerCase().includes(query) ||
      (x.invoice_details || '').toLowerCase().includes(query)
    );
  }
  renderClientInvoicesTable(filtered, statusFilter);
}

function renderClientSummaryBreakdownTable(breakdown) {
  const tbody = document.getElementById('client-summary-list-body');
  if (!tbody) return;

  if (!breakdown || breakdown.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 18px; color: var(--text-muted);">No client summary data available.</td></tr>`;
    return;
  }

  tbody.innerHTML = breakdown.map((c, idx) => {
    const inv = parseFloat(c.total_invoiced || 0);
    const col = parseFloat(c.total_collected || 0);
    const bal = parseFloat(c.total_balance || 0);
    const rate = inv > 0 ? ((col / inv) * 100) : 0.0;

    return `
      <tr>
        <td style="font-weight: bold; text-align: center;">${idx + 1}</td>
        <td style="font-weight: 700; color: #0047AB;">${c.client_name || 'Client'}</td>
        <td style="text-align: center;">${c.total_invoices || 0}</td>
        <td style="text-align: right; font-weight: 600;">SAR ${inv.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
        <td style="text-align: right; font-weight: 700; color: #059669;">SAR ${col.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
        <td style="text-align: right; font-weight: 800; color: ${bal > 0 ? '#DC2626' : '#059669'};">
          SAR ${bal.toLocaleString('en-US', {minimumFractionDigits: 2})}
        </td>
        <td style="text-align: center; font-weight: 700;">${rate.toFixed(1)}%</td>
        <td style="text-align: center;">
          <button class="btn btn-outline" style="padding: 2px 8px; font-size: 0.75rem;" onclick="openClientLedgerModal(${c.client_id})">
            📜 Statement
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderClientAgingSchedule(aging) {
  const grid = document.getElementById('col-aging-grid');
  if (!grid) return;

  const buckets = [
    { key: 'current', title: '0 - 30 Days (Current)', color: '#059669', bg: '#F0FDF4', border: '#A7F3D0' },
    { key: 'days_31_60', title: '31 - 60 Days (Standard)', color: '#0047AB', bg: '#EFF6FF', border: '#BFDBFE' },
    { key: 'days_61_90', title: '61 - 90 Days (Attention)', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
    { key: 'over_90', title: '90+ Days (Critical Overdue)', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' }
  ];

  grid.innerHTML = buckets.map(b => {
    const item = aging[b.key] || { count: 0, amount: 0.0 };
    return `
      <div style="background: ${b.bg}; border: 1px solid ${b.border}; border-radius: 8px; padding: 14px;">
        <div style="font-size: 0.75rem; font-weight: 700; color: ${b.color}; text-transform: uppercase;">${b.title}</div>
        <div style="font-size: 1.35rem; font-weight: 900; color: ${b.color}; margin-top: 4px;">
          SAR ${(item.amount || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}
        </div>
        <div style="font-size: 0.78rem; color: #475569; margin-top: 2px;">
          ${item.count || 0} Outstanding Invoice(s)
        </div>
      </div>
    `;
  }).join('');
}

async function loadClientsDirectory() {
  try {
    const res = await fetch('/api/clients', { headers: getAuthHeaders() });
    if (!res.ok) return;

    const data = await res.json();
    allRegisteredClients = data.clients || [];
    renderClientsDirectoryTable(allRegisteredClients);
    populateClientSelectOptions();

  } catch (err) {
    console.error('Error loading clients:', err);
  }
}

function renderClientsDirectoryTable(clients) {
  const tbody = document.getElementById('clients-directory-body');
  if (!tbody) return;

  if (!clients || clients.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 20px;">No registered clients found. Click "+ New Client Profile" to register one.</td></tr>`;
    return;
  }

  tbody.innerHTML = clients.map(c => {
    const billed = parseFloat(c.total_billed || 0);
    const bal = parseFloat(c.balance_due || 0);

    return `
      <tr>
        <td style="font-weight: 700; color: #0047AB;">
          <div>${c.name}</div>
          ${c.name_ar ? `<small style="color: #64748B;">${c.name_ar}</small>` : ''}
        </td>
        <td>${c.contact_person || '-'}</td>
        <td style="font-size: 0.8rem;">
          ${c.phone ? `<div>📞 ${c.phone}</div>` : ''}
          ${c.email ? `<div>✉️ ${c.email}</div>` : ''}
        </td>
        <td style="font-size: 0.8rem;">
          ${c.cr_number ? `<div>CR: ${c.cr_number}</div>` : ''}
          ${c.vat_number ? `<div>VAT: ${c.vat_number}</div>` : ''}
        </td>
        <td><span class="badge badge-primary">${c.payment_terms || 'Net 30'}</span></td>
        <td style="text-align: center; font-weight: 700;">${c.total_invoices || 0}</td>
        <td style="text-align: right; font-weight: 700;">SAR ${billed.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
        <td style="text-align: right; font-weight: 800; color: ${bal > 0 ? '#DC2626' : '#059669'};">
          SAR ${bal.toLocaleString('en-US', {minimumFractionDigits: 2})}
        </td>
        <td style="text-align: center;">
          <div style="display: flex; gap: 4px; justify-content: center;">
            <button class="btn btn-outline" style="padding: 2px 8px; font-size: 0.75rem;" title="View Statement" onclick="openClientLedgerModal(${c.id})">
              📜 Statement
            </button>
            <button class="btn btn-outline" style="padding: 2px 8px; font-size: 0.75rem;" title="Edit Client" onclick="openEditClientModal(${c.id})">
              ✏️
            </button>
            ${currentUserRole === 'admin' ? `
              <button class="btn btn-danger" style="padding: 2px 6px; font-size: 0.75rem;" title="Delete Client" onclick="deleteClient(${c.id}, '${c.name}')">
                🗑️
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function filterClientsDirectory() {
  const query = (document.getElementById('clients-directory-search').value || '').toLowerCase();
  const filtered = allRegisteredClients.filter(c => 
    (c.name || '').toLowerCase().includes(query) ||
    (c.contact_person || '').toLowerCase().includes(query) ||
    (c.cr_number || '').toLowerCase().includes(query) ||
    (c.email || '').toLowerCase().includes(query)
  );
  renderClientsDirectoryTable(filtered);
}

function populateClientSelectOptions() {
  const select = document.getElementById('record-client-select');
  if (!select) return;

  select.innerHTML = '<option value="">-- Choose Registered Client --</option>' +
    allRegisteredClients.map(c => `<option value="${c.id}">${c.name}</option>`).join('') +
    '<option value="custom">➕ Other / New Client Name...</option>';
}

function handleClientSelectChange(val) {
  const customInput = document.getElementById('record-client-custom-name');
  if (!customInput) return;

  if (val === 'custom') {
    customInput.style.display = 'block';
    customInput.required = true;
    customInput.value = '';
  } else {
    customInput.style.display = 'none';
    customInput.required = false;
    const client = allRegisteredClients.find(x => x.id === parseInt(val));
    if (client) {
      customInput.value = client.name;
    }
  }
}

function openAddClientModal() {
  document.getElementById('client-form-id').value = '';
  document.getElementById('modal-client-title').innerText = '🏢 Register New Client / Customer';
  document.getElementById('client-name').value = '';
  document.getElementById('client-name-ar').value = '';
  document.getElementById('client-contact').value = '';
  document.getElementById('client-phone').value = '';
  document.getElementById('client-email').value = '';
  document.getElementById('client-cr').value = '';
  document.getElementById('client-vat').value = '';
  document.getElementById('client-terms').value = 'Net 30';
  document.getElementById('client-address').value = '';
  openModal('modal-add-client');
}

function openEditClientModal(clientId) {
  const c = allRegisteredClients.find(x => x.id === clientId);
  if (!c) return;

  document.getElementById('client-form-id').value = c.id;
  document.getElementById('modal-client-title').innerText = `✏️ Edit Client Profile: ${c.name}`;
  document.getElementById('client-name').value = c.name || '';
  document.getElementById('client-name-ar').value = c.name_ar || '';
  document.getElementById('client-contact').value = c.contact_person || '';
  document.getElementById('client-phone').value = c.phone || '';
  document.getElementById('client-email').value = c.email || '';
  document.getElementById('client-cr').value = c.cr_number || '';
  document.getElementById('client-vat').value = c.vat_number || '';
  document.getElementById('client-terms').value = c.payment_terms || 'Net 30';
  document.getElementById('client-address').value = c.address || '';
  openModal('modal-add-client');
}

async function submitAddClient() {
  const formId = document.getElementById('client-form-id').value;
  const payload = {
    name: document.getElementById('client-name').value.trim(),
    name_ar: document.getElementById('client-name-ar').value.trim() || null,
    contact_person: document.getElementById('client-contact').value.trim() || null,
    phone: document.getElementById('client-phone').value.trim() || null,
    email: document.getElementById('client-email').value.trim() || null,
    cr_number: document.getElementById('client-cr').value.trim() || null,
    vat_number: document.getElementById('client-vat').value.trim() || null,
    payment_terms: document.getElementById('client-terms').value || 'Net 30',
    address: document.getElementById('client-address').value.trim() || null
  };

  try {
    const url = formId ? `/api/clients/${formId}` : '/api/clients';
    const method = formId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method: method,
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(err.detail || 'Failed to save client', 'error');
      return;
    }

    closeModal('modal-add-client');
    showToast(formId ? '✅ Client profile updated!' : '✅ Client registered successfully!');
    await Promise.all([loadClientsDirectory(), loadClientCollectionsHub()]);

  } catch (err) {
    showToast(`Error saving client: ${err}`, 'error');
  }
}

async function deleteClient(clientId, clientName) {
  if (!confirm(`Are you sure you want to delete client '${clientName}'?`)) return;

  try {
    const res = await fetch(`/api/clients/${clientId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(err.detail || 'Failed to delete client', 'error');
      return;
    }

    showToast('Client deleted successfully');
    await Promise.all([loadClientsDirectory(), loadClientCollectionsHub()]);

  } catch (err) {
    showToast(`Error deleting client: ${err}`, 'error');
  }
}

function openRecordClientInvoiceModal(clientId = null) {
  populateClientSelectOptions();
  const select = document.getElementById('record-client-select');
  if (select && clientId) {
    select.value = clientId;
    handleClientSelectChange(clientId);
  }

  const today = new Date().toISOString().split('T')[0];
  const next30 = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

  document.getElementById('record-client-inv-date').value = today;
  document.getElementById('record-client-due-date').value = next30;
  document.getElementById('record-client-subtotal').value = '';
  document.getElementById('record-client-vat').value = '';
  document.getElementById('record-client-total').value = '';
  
  // Random invoice number generator suggestion
  const randNum = Math.floor(1000 + Math.random() * 9000);
  document.getElementById('record-client-inv-num').value = `ADK-INV-${new Date().getFullYear()}-${randNum}`;

  openModal('modal-record-client-invoice');
}

function calcClientInvoiceVatLive() {
  const sub = parseFloat(document.getElementById('record-client-subtotal').value || 0);
  if (sub > 0) {
    const vat = Math.round(sub * 0.15 * 100) / 100;
    const tot = Math.round((sub + vat) * 100) / 100;
    document.getElementById('record-client-vat').value = vat.toFixed(2);
    document.getElementById('record-client-total').value = tot.toFixed(2);
  }
}

function calcClientInvoiceTotalLive() {
  const sub = parseFloat(document.getElementById('record-client-subtotal').value || 0);
  const vat = parseFloat(document.getElementById('record-client-vat').value || 0);
  document.getElementById('record-client-total').value = (sub + vat).toFixed(2);
}

async function submitRecordClientInvoice() {
  const select = document.getElementById('record-client-select');
  let client_id = select && select.value !== 'custom' ? parseInt(select.value) : null;
  let client_name = '';

  if (client_id) {
    const c = allRegisteredClients.find(x => x.id === client_id);
    client_name = c ? c.name : 'Client';
  } else {
    client_name = document.getElementById('record-client-custom-name').value.trim();
  }

  if (!client_name) {
    showToast('Please select or specify a client company name', 'error');
    return;
  }

  const form = document.getElementById('record-client-invoice-form');
  const formData = new FormData(form);

  const sub = parseFloat(formData.get('subtotal') || 0);
  const vat = parseFloat(formData.get('vat_amount') || 0);
  const tot = parseFloat(formData.get('total_amount') || 0);

  if (tot <= 0) {
    showToast('Total amount must be greater than zero', 'error');
    return;
  }

  const payload = {
    client_id: client_id,
    client_name: client_name,
    invoice_number: document.getElementById('record-client-inv-num').value.trim(),
    invoice_date: document.getElementById('record-client-inv-date').value,
    due_date: document.getElementById('record-client-due-date').value,
    service_period_start: formData.get('service_period_start') || null,
    service_period_end: formData.get('service_period_end') || null,
    invoice_details: formData.get('invoice_details') || null,
    subtotal: sub,
    vat_rate: 15.0,
    vat_amount: vat,
    total_amount: tot,
    remarks: formData.get('remarks') || null
  };

  try {
    const res = await fetch('/api/client-invoices', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(err.detail || 'Failed to issue client invoice', 'error');
      return;
    }

    closeModal('modal-record-client-invoice');
    showToast('✅ Client invoice issued successfully!');
    await loadClientCollectionsHub();

  } catch (err) {
    showToast(`Error issuing invoice: ${err}`, 'error');
  }
}

async function deleteClientInvoice(invoiceId, invoiceNum) {
  if (!confirm(`Are you sure you want to delete client invoice #${invoiceNum}?`)) return;

  try {
    const res = await fetch(`/api/client-invoices/${invoiceId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(err.detail || 'Failed to delete invoice', 'error');
      return;
    }

    showToast('Client invoice deleted successfully');
    await loadClientCollectionsHub();

  } catch (err) {
    showToast(`Error deleting invoice: ${err}`, 'error');
  }
}

function openRecordCollectionModal(invoiceId) {
  const inv = allClientInvoices.find(x => x.id === invoiceId);
  if (!inv) return;

  document.getElementById('col-receipt-invoice-id').value = inv.id;
  document.getElementById('col-receipt-client-name').innerText = inv.client_name || 'Client';
  document.getElementById('col-receipt-inv-meta').innerText = `Invoice: ${inv.invoice_number} • Total Billed: SAR ${parseFloat(inv.total_amount || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}`;
  
  const rem = parseFloat(inv.remaining_amount || 0);
  document.getElementById('col-receipt-balance-due').innerText = `Remaining Balance: SAR ${rem.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
  document.getElementById('col-receipt-amount').value = rem.toFixed(2);
  document.getElementById('col-receipt-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('col-receipt-ref').value = '';
  document.getElementById('col-receipt-notes').value = '';

  openModal('modal-record-client-collection');
}

function fillFullCollectionBalance() {
  const invId = parseInt(document.getElementById('col-receipt-invoice-id').value);
  const inv = allClientInvoices.find(x => x.id === invId);
  if (inv) {
    document.getElementById('col-receipt-amount').value = parseFloat(inv.remaining_amount || 0).toFixed(2);
  }
}

async function submitRecordClientCollection() {
  const invoiceId = parseInt(document.getElementById('col-receipt-invoice-id').value);
  const amt = parseFloat(document.getElementById('col-receipt-amount').value || 0);

  if (amt <= 0) {
    showToast('Collection amount must be greater than zero', 'error');
    return;
  }

  const payload = {
    payment_amount: amt,
    payment_date: document.getElementById('col-receipt-date').value,
    payment_method: document.getElementById('col-receipt-method').value,
    reference_number: document.getElementById('col-receipt-ref').value.trim() || null,
    notes: document.getElementById('col-receipt-notes').value.trim() || null
  };

  try {
    const res = await fetch(`/api/client-invoices/${invoiceId}/record-collection`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(err.detail || 'Failed to record collection', 'error');
      return;
    }

    const data = await res.json();
    closeModal('modal-record-client-collection');
    showToast(`✅ ${data.message || 'Payment received and recorded successfully!'}`);
    await Promise.all([loadClientCollectionsHub(), loadClientsDirectory()]);

  } catch (err) {
    showToast(`Error recording collection: ${err}`, 'error');
  }
}

async function openClientLedgerModal(clientId) {
  currentViewingClientId = clientId;

  try {
    showToast('Loading client ledger and account statement...', 'info');
    const res = await fetch(`/api/client-invoices?client_id=${clientId}`, { headers: getAuthHeaders() });
    const invoices = res.ok ? (await res.json()).invoices : [];

    const client = allRegisteredClients.find(x => x.id === clientId) || { name: 'Client Account' };

    document.getElementById('client-ledger-name').innerText = client.name || 'Client Account';
    document.getElementById('client-ledger-meta').innerText = `Contact: ${client.contact_person || 'N/A'} • Phone: ${client.phone || 'N/A'} • Terms: ${client.payment_terms || 'Net 30'}`;

    const totalBal = invoices.reduce((acc, x) => acc + parseFloat(x.remaining_amount || 0), 0);
    document.getElementById('client-ledger-balance').innerText = `SAR ${totalBal.toLocaleString('en-US', {minimumFractionDigits: 2})}`;

    // Render Invoices
    const invBody = document.getElementById('client-ledger-invoices-body');
    if (invBody) {
      if (invoices.length === 0) {
        invBody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 14px;">No invoices issued for this client.</td></tr>`;
      } else {
        invBody.innerHTML = invoices.map(inv => `
          <tr>
            <td style="font-weight: bold; color: #0047AB;">${inv.invoice_number}</td>
            <td>${inv.invoice_date}</td>
            <td>${inv.due_date}</td>
            <td>${inv.invoice_details || 'Services'}</td>
            <td style="text-align: right;">SAR ${parseFloat(inv.total_amount || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
            <td style="text-align: right; color: #059669; font-weight: 700;">SAR ${parseFloat(inv.collected_amount || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
            <td style="text-align: right; color: #DC2626; font-weight: 700;">SAR ${parseFloat(inv.remaining_amount || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
            <td style="text-align: center;"><span class="badge ${inv.status === 'Collected' ? 'badge-success' : 'badge-warning'}">${inv.status}</span></td>
          </tr>
        `).join('');
      }
    }

    // Render Receipts
    const logsBody = document.getElementById('client-ledger-logs-body');
    if (logsBody) {
      logsBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 14px;">Loading receipt transactions...</td></tr>`;
      
      // Aggregate logs from each invoice
      const allLogs = [];
      for (const inv of invoices) {
        try {
          const lRes = await fetch(`/api/client-invoices/${inv.id}/logs`, { headers: getAuthHeaders() });
          if (lRes.ok) {
            const lData = await lRes.json();
            (lData.logs || []).forEach(l => {
              allLogs.push({ ...l, invoice_number: inv.invoice_number });
            });
          }
        } catch (e) {}
      }

      if (allLogs.length === 0) {
        logsBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 14px;">No collection receipts recorded yet.</td></tr>`;
      } else {
        allLogs.sort((a, b) => (b.payment_date || '').localeCompare(a.payment_date || ''));
        logsBody.innerHTML = allLogs.map(l => `
          <tr>
            <td>${l.payment_date}</td>
            <td>${l.payment_method || 'Bank Transfer'}</td>
            <td>${l.reference_number || '-'}</td>
            <td style="font-weight: 700;">${l.invoice_number || '-'}</td>
            <td style="text-align: right; color: #059669; font-weight: 800;">SAR ${parseFloat(l.payment_amount || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
            <td>${l.notes || '-'}</td>
          </tr>
        `).join('');
      }
    }

    openModal('modal-client-ledger');

  } catch (err) {
    showToast(`Error opening client ledger: ${err}`, 'error');
  }
}

function downloadCurrentClientStatementPdf() {
  if (!currentViewingClientId) return;
  const token = localStorage.getItem('jwt_token') || '';
  window.open(`/api/clients/${currentViewingClientId}/statement/pdf?token=${token}`, '_blank');
}

function exportClientMonthlySummaryPdf() {
  const month = document.getElementById('col-select-month')?.value || (new Date().getMonth() + 1);
  const year = document.getElementById('col-select-year')?.value || new Date().getFullYear();
  const token = localStorage.getItem('jwt_token') || '';
  window.open(`/api/client-collections/monthly-summary/pdf?month=${month}&year=${year}&token=${token}`, '_blank');
}


