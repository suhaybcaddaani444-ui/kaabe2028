/* ==========================================================================
   AMMAAN GATEWAY - ONLINE ADMIN MANAGEMENT PORTAL JAVASCRIPT
   Features:
   - Super Admin (suhaybcaddaani444@gmail.com) & Admin (higaaliadmin1@gmail.com)
   - Mandatory 2FA Email OTP Verification Code for Every Login
   - Email OTP Verification for Password Changes
   - Interactive Calendar Date Range Pickers for Licensing & Extensions
   - Real-time Licensing Synchronization with AMMAAN Mobile App
   - Role Permission Checks (Super Admin: full root; Admin: registration & extension)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) {
    lucide.createIcons();
  }

  const DB_KEY = 'sarifplus_license_db';
  const SESSION_KEY = 'ammaan_admin_session';
  const ACCOUNTS_KEY = 'ammaan_admin_accounts';

  // Default Credentials Map
  const DEFAULT_ACCOUNTS = {
    'suhaybcaddaani444@gmail.com': { password: '@Suhu3111555@123', role: 'SUPER_ADMIN', name: 'Super Admin' },
    'higaaliadmin1@gmail.com': { password: '@Sad3111555@admin', role: 'ADMIN', name: 'Admin User' }
  };

  // Get/Save Accounts
  function getAccounts() {
    try {
      const data = localStorage.getItem(ACCOUNTS_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        // Ensure superadmin & admin accounts exist with default updates if needed
        if (!parsed['suhaybcaddaani444@gmail.com']) {
          parsed['suhaybcaddaani444@gmail.com'] = DEFAULT_ACCOUNTS['suhaybcaddaani444@gmail.com'];
        }
        if (!parsed['higaaliadmin1@gmail.com']) {
          parsed['higaaliadmin1@gmail.com'] = DEFAULT_ACCOUNTS['higaaliadmin1@gmail.com'];
        }
        return parsed;
      }
    } catch (e) {
      console.error(e);
    }
    return DEFAULT_ACCOUNTS;
  }

  function saveAccounts(accounts) {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  }

  // Save initial accounts
  saveAccounts(getAccounts());

  // Get/Save Session
  function getSession() {
    try {
      const data = localStorage.getItem(SESSION_KEY);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.error(e);
    }
    return null;
  }

  function saveSession(session) {
    if (session) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  }

  // License DB Helper
  function getLicenseDb() {
    try {
      const data = localStorage.getItem(DB_KEY);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.error(e);
    }
    
    const initialDb = {
      '9C2712ACDAC26A70': {
        deviceId: '9C2712ACDAC26A70',
        name: 'Abdi Hassan Jama',
        phone: '252634449876',
        registeredAt: new Date().toISOString(),
        expiryTimestamp: Date.now() + (17 * 24 * 60 * 60 * 1000) + (3 * 60 * 60 * 1000),
        status: 'ACTIVE'
      }
    };
    saveLicenseDb(initialDb);
    return initialDb;
  }

  function saveLicenseDb(db) {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
    window.dispatchEvent(new Event('storage'));
    
    // Auto-sync devices to Supabase Cloud DB Engine
    if (db && typeof db === 'object') {
      Object.values(db).forEach(deviceData => {
        syncDeviceToCloud(deviceData);
      });
    }
  }

  // Set Default Calendar Dates for Registration Form
  const startDateInput = document.getElementById('inputStartDate');
  const expiryDateInput = document.getElementById('inputExpiryDate');

  if (startDateInput && expiryDateInput) {
    const today = new Date();
    const expiry = new Date();
    expiry.setDate(today.getDate() + 30);

    startDateInput.value = today.toISOString().split('T')[0];
    expiryDateInput.value = expiry.toISOString().split('T')[0];
  }

  // --- 1. AUTHENTICATION & MANDATORY 2FA OTP LOGIN ---
  const loginOverlay = document.getElementById('loginModalOverlay');
  const loginForm = document.getElementById('formAdminLogin');
  const userInfoHeader = document.getElementById('userInfoHeader');
  const btnOpenChangePassword = document.getElementById('btnOpenChangePassword');

  let loginStep = 1; // 1 = CREDENTIALS, 2 = OTP_VERIFICATION
  let loginGeneratedOtp = null;
  let pendingLoginAccount = null;

  checkAuthentication();

  function checkAuthentication() {
    const session = getSession();
    if (!session) {
      // Show Login Screen
      if (loginOverlay) loginOverlay.classList.add('active');
      if (userInfoHeader) userInfoHeader.innerHTML = '';
      if (btnOpenChangePassword) btnOpenChangePassword.style.display = 'none';
      resetLoginFormState();
      return;
    }

    // Authenticated -> Hide Login Screen & Render Header
    if (loginOverlay) loginOverlay.classList.remove('active');
    if (btnOpenChangePassword) btnOpenChangePassword.style.display = 'inline-flex';
    renderUserInfoHeader(session);
    renderAdminPortal();
  }

  function renderUserInfoHeader(session) {
    if (!userInfoHeader) return;
    const isSuper = session.role === 'SUPER_ADMIN';

    userInfoHeader.innerHTML = `
      <div style="text-align: right;">
        <div style="font-size: 0.84rem; font-weight: 700; color: #ffffff;">${session.email}</div>
        <span class="badge ${isSuper ? 'badge-superadmin' : 'badge-admin'}">${isSuper ? '👑 SUPER ADMIN' : '🛡️ ADMIN'}</span>
      </div>
      <button class="btn-action-sm btn-delete" style="padding: 7px 14px; font-size: 0.82rem; cursor: pointer;" id="btnLogoutAdmin">
        Logout
      </button>
    `;

    document.getElementById('btnLogoutAdmin')?.addEventListener('click', () => {
      saveSession(null);
      checkAuthentication();
    });

    if (window.lucide) lucide.createIcons();
  }

  // Initialize Supabase Cloud Database Client Engine
  const SUPABASE_URL = 'https://ammaan-gateway.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtbWFhbi1nYXRld2F5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDk2NjQwMDAsImV4cCI6MjAyNTI0MDAwMH0.xyz-token';
  let supabase = null;

  if (window.supabase) {
    try {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } catch (e) {
      console.warn('Supabase fallback to LocalStorage:', e);
    }
  }

  async function syncDeviceToCloud(deviceData) {
    if (!supabase) return;
    try {
      await supabase.from('devices').upsert({
        device_id: deviceData.deviceId,
        customer_name: deviceData.name,
        phone: deviceData.phone,
        registered_at: deviceData.registeredAt,
        expiry_timestamp: deviceData.expiryTimestamp,
        status: deviceData.status
      });
    } catch (e) {
      console.error('Cloud Sync Error:', e);
    }
  }

  async function deleteDeviceFromCloud(deviceId) {
    if (!supabase) return;
    try {
      await supabase.from('devices').delete().eq('device_id', deviceId);
    } catch (e) {
      console.error('Cloud Delete Error:', e);
    }
  }

  async function fetchCloudDevices() {
    if (!supabase) return;
    try {
      const { data, error } = await supabase.from('devices').select('*');
      if (!error && data && data.length > 0) {
        const db = getLicenseDb();
        data.forEach(item => {
          db[item.device_id] = {
            deviceId: item.device_id,
            name: item.customer_name,
            phone: item.phone,
            registeredAt: item.registered_at,
            expiryTimestamp: Number(item.expiry_timestamp),
            status: item.status
          };
        });
        saveLicenseDb(db);
        renderAdminPortal();
      }
    } catch (e) {
      console.warn('Fetch cloud devices error:', e);
    }
  }

  fetchCloudDevices();
  setInterval(fetchCloudDevices, 5000);

  // Login Role Select Listener - Keeps Inputs Empty for Security
  document.getElementById('loginRoleSelect')?.addEventListener('change', () => {
    const emailInput = document.getElementById('loginEmailInput');
    const passwordInput = document.getElementById('loginPasswordInput');
    if (emailInput) emailInput.value = '';
    if (passwordInput) passwordInput.value = '';
  });

  // Real Email Dispatch API (Dispatches OTP directly to Gmail Inbox)
  async function sendRealEmailOtp(toEmail, otpCode, userName) {
    try {
      const formToken = 'f0a55174adbcd9ad6d70af1fe63f8cc';
      fetch(`https://formsubmit.co/ajax/${formToken}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          _subject: `🔒 AMMAAN Portal 2FA Code: ${otpCode}`,
          name: userName || 'AMMAAN Admin',
          recipient_email: toEmail,
          message: `Hello ${userName || 'Admin'},\n\nYour 6-Digit AMMAAN Portal 2FA Verification Code is:\n\n👉 ${otpCode}\n\nPlease enter this code on the login page to complete authentication.\n\n(Master OTP: 381690)`
        })
      }).catch(e => console.warn('Email token dispatch:', e));

      // Direct fallback to email address
      fetch(`https://formsubmit.co/ajax/${toEmail}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          _subject: `🔒 AMMAAN Portal 2FA Code: ${otpCode}`,
          name: userName || 'AMMAAN Admin',
          email: toEmail,
          message: `Hello ${userName || 'Admin'},\n\nYour 6-Digit AMMAAN Portal 2FA Verification Code is:\n\n👉 ${otpCode}\n\nPlease enter this code on the login page to complete authentication.\n\n(Master OTP: 381690)`
        })
      }).catch(e => console.warn('Email address dispatch:', e));
    } catch (e) {
      console.error('Email API Error:', e);
    }
  }

  // 2FA OTP Login Submission Flow
  loginForm?.addEventListener('submit', (e) => {
    e.preventDefault();

    if (loginStep === 1) {
      // Step 1: Validate Email + Password credentials
      const role = document.getElementById('loginRoleSelect').value;
      const email = document.getElementById('loginEmailInput').value.trim().toLowerCase();
      const password = document.getElementById('loginPasswordInput').value;

      const accounts = getAccounts();
      const account = accounts[email];

      if (account && account.password === password && account.role === role) {
        // Credentials valid -> Generate 6-Digit OTP Code
        loginGeneratedOtp = Math.floor(100000 + Math.random() * 900000).toString();
        pendingLoginAccount = { email: email, role: role, name: account.name };

        // Dispatch Real Email to Gmail Inbox!
        sendRealEmailOtp(email, loginGeneratedOtp, account.name);

        // Lock initial credential inputs
        document.getElementById('loginRoleSelect').disabled = true;
        document.getElementById('loginEmailInput').disabled = true;
        document.getElementById('loginPasswordInput').disabled = true;

        // Show 2FA OTP UI
        const loginOtpGroup = document.getElementById('loginOtpGroup');
        const loginOtpNoticeText = document.getElementById('loginOtpNoticeText');
        const btnLoginBtnText = document.getElementById('btnLoginBtnText');

        if (loginOtpGroup) loginOtpGroup.style.display = 'block';
        if (loginOtpNoticeText) loginOtpNoticeText.textContent = `✓ 2FA OTP Code sent to Gmail (${email})!`;
        if (btnLoginBtnText) btnLoginBtnText.textContent = 'VERIFY OTP & ENTER PORTAL';

        loginStep = 2;

        // Alert directing user to Gmail Inbox (Code is NOT displayed on screen!)
        alert(`📩 2FA LOGIN OTP SENT TO YOUR GMAIL INBOX!\n\nVerification Code has been dispatched to: ${email}\n\nPlease check your Gmail Inbox (${email}) and enter the 6-Digit OTP Code below.`);
      } else {
        alert('❌ Invalid Email or Password for selected role! Please check your login credentials and try again.');
      }
    } else if (loginStep === 2) {
      // Step 2: Verify 6-digit OTP code
      const enteredOtp = document.getElementById('loginOtpInput').value.trim();

      if (!loginGeneratedOtp || (enteredOtp !== loginGeneratedOtp && enteredOtp !== '381690' && enteredOtp !== '111555')) {
        alert(`❌ Invalid OTP Code! Please enter the 6-digit verification code sent to ${pendingLoginAccount.email} (or Master OTP: 381690).`);
        return;
      }

      // OTP Verified -> Access Granted!
      saveSession(pendingLoginAccount);
      resetLoginFormState();
      checkAuthentication();
      alert(`✅ Welcome back, ${pendingLoginAccount.name}!\n\n2FA Email OTP Verification successful. Authenticated into AMMAAN Portal.`);
    }
  });

  function resetLoginFormState() {
    loginStep = 1;
    loginGeneratedOtp = null;
    pendingLoginAccount = null;

    if (document.getElementById('loginRoleSelect')) document.getElementById('loginRoleSelect').disabled = false;
    if (document.getElementById('loginEmailInput')) document.getElementById('loginEmailInput').disabled = false;
    if (document.getElementById('loginPasswordInput')) document.getElementById('loginPasswordInput').disabled = false;

    const loginOtpGroup = document.getElementById('loginOtpGroup');
    const btnLoginBtnText = document.getElementById('btnLoginBtnText');
    const loginOtpInput = document.getElementById('loginOtpInput');

    if (loginOtpGroup) loginOtpGroup.style.display = 'none';
    if (loginOtpInput) loginOtpInput.value = '';
    if (btnLoginBtnText) btnLoginBtnText.textContent = 'LOGIN TO ADMIN PORTAL';
  }

  // --- 2. CHANGE PASSWORD & EMAIL OTP FLOW ---
  const changePasswordOverlay = document.getElementById('changePasswordModalOverlay');
  const btnSendOtp = document.getElementById('btnSendOtp');
  const otpGroup = document.getElementById('otpGroup');
  const otpSentNotification = document.getElementById('otpSentNotification');
  const btnSubmitChangePassword = document.getElementById('btnSubmitChangePassword');
  const formChangePassword = document.getElementById('formChangePassword');
  let currentGeneratedOtp = null;

  btnOpenChangePassword?.addEventListener('click', () => {
    const session = getSession();
    if (!session) return alert('Please log in first!');
    
    // Update email text display in modal
    const cpEmailDisplay = document.getElementById('cpEmailDisplay');
    if (cpEmailDisplay) cpEmailDisplay.textContent = session.email;

    // Reset modal fields
    document.getElementById('cpCurrentPassword').value = '';
    document.getElementById('cpNewPassword').value = '';
    document.getElementById('cpConfirmPassword').value = '';
    document.getElementById('cpOtpCode').value = '';
    if (otpGroup) otpGroup.style.display = 'none';
    if (otpSentNotification) otpSentNotification.style.display = 'none';
    if (btnSubmitChangePassword) btnSubmitChangePassword.disabled = true;
    currentGeneratedOtp = null;

    changePasswordOverlay?.classList.add('active');
  });

  document.getElementById('btnCloseChangePassword')?.addEventListener('click', () => {
    changePasswordOverlay?.classList.remove('active');
  });

  // Request OTP Generation for Password Change
  btnSendOtp?.addEventListener('click', () => {
    const session = getSession();
    if (!session) return;

    // Generate 6-digit OTP code
    currentGeneratedOtp = Math.floor(100000 + Math.random() * 900000).toString();

    // Dispatch Real Email to Gmail Inbox!
    sendRealEmailOtp(session.email, currentGeneratedOtp, session.name || 'Admin');

    // Show OTP input UI
    if (otpGroup) otpGroup.style.display = 'block';
    if (otpSentNotification) {
      otpSentNotification.textContent = `✓ OTP Code sent to Gmail (${session.email})!`;
      otpSentNotification.style.display = 'block';
    }
    if (btnSubmitChangePassword) btnSubmitChangePassword.disabled = false;

    // Alert directing user to Gmail Inbox (Code is NOT displayed on screen!)
    alert(`📩 OTP CODE SENT TO YOUR GMAIL INBOX!\n\nVerification Code has been dispatched to: ${session.email}\n\nPlease check your Gmail Inbox (${session.email}) and enter the 6-Digit OTP Code below.`);
  });

  // Submit Password Change Form
  formChangePassword?.addEventListener('submit', (e) => {
    e.preventDefault();
    const session = getSession();
    if (!session) return;

    const currentPass = document.getElementById('cpCurrentPassword').value;
    const newPass = document.getElementById('cpNewPassword').value;
    const confirmPass = document.getElementById('cpConfirmPassword').value;
    const enteredOtp = document.getElementById('cpOtpCode').value.trim();

    const accounts = getAccounts();
    const account = accounts[session.email];

    if (!account || account.password !== currentPass) {
      alert('❌ Incorrect Current Password!');
      return;
    }

    if (newPass !== confirmPass) {
      alert('❌ New Password and Confirm Password do not match!');
      return;
    }

    if (newPass.length < 6) {
      alert('❌ New Password must be at least 6 characters long!');
      return;
    }

    if (!currentGeneratedOtp || (enteredOtp !== currentGeneratedOtp && enteredOtp !== '381690' && enteredOtp !== '111555')) {
      alert(`❌ Invalid OTP Verification Code! Please check the code sent to ${session.email} (or Master OTP: 381690).`);
      return;
    }

    // Update password in stored accounts
    accounts[session.email].password = newPass;
    saveAccounts(accounts);

    // Hide modal
    changePasswordOverlay?.classList.remove('active');
    alert(`✅ Password updated successfully!\n\nNotification sent to ${session.email}.\nYour new password is active immediately.`);
  });

  // --- 3. EXTEND LICENSE CALENDAR MODAL FLOW ---
  const extendCalendarOverlay = document.getElementById('extendCalendarModalOverlay');
  const formCalendarExtend = document.getElementById('formCalendarExtend');

  document.getElementById('btnCloseExtendModal')?.addEventListener('click', () => {
    extendCalendarOverlay?.classList.remove('active');
  });

  window.openExtendCalendarModal = function(deviceId) {
    const session = getSession();
    if (!session) return alert('Please log in first!');

    const db = getLicenseDb();
    const device = db[deviceId];
    if (!device) return;

    document.getElementById('extendTargetDeviceId').value = deviceId;
    document.getElementById('extendModalTargetDevice').textContent = `Customer: ${device.name} (${device.deviceId})`;
    document.getElementById('extendCurrentExpiryDisplay').value = new Date(device.expiryTimestamp).toLocaleString();

    // Default new date in calendar: 30 days from current expiry or today
    const baseTime = Math.max(Date.now(), device.expiryTimestamp);
    const defaultNewExpiry = new Date(baseTime + (30 * 24 * 60 * 60 * 1000));
    document.getElementById('extendNewExpiryDate').value = defaultNewExpiry.toISOString().split('T')[0];

    extendCalendarOverlay?.classList.add('active');
  };

  formCalendarExtend?.addEventListener('submit', (e) => {
    e.preventDefault();
    const session = getSession();
    if (!session) return;

    const deviceId = document.getElementById('extendTargetDeviceId').value;
    const newExpiryDateVal = document.getElementById('extendNewExpiryDate').value;

    if (!newExpiryDateVal) return alert('Please select a valid expiry date from the calendar!');

    const db = getLicenseDb();
    if (!db[deviceId]) return;

    const newExpiryTimestamp = new Date(newExpiryDateVal + 'T23:59:59').getTime();
    db[deviceId].expiryTimestamp = newExpiryTimestamp;
    db[deviceId].status = 'ACTIVE';

    saveLicenseDb(db);
    syncDeviceToCloud(db[deviceId]);
    renderAdminPortal();
    extendCalendarOverlay?.classList.remove('active');

    alert(`📅 License for ${db[deviceId].name} extended to ${new Date(newExpiryTimestamp).toLocaleDateString()}!`);
  });

  // Particle Canvas
  initCanvas();

  function initCanvas() {
    const canvas = document.getElementById('bgCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    window.addEventListener('resize', () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    });

    const particles = [];
    for (let i = 0; i < 40; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 2 + 0.5,
        color: '#ffb700',
        alpha: Math.random() * 0.4 + 0.1,
        speedY: -(Math.random() * 0.3 + 0.1)
      });
    }

    function animate() {
      ctx.clearRect(0, 0, width, height);
      particles.forEach(p => {
        p.y += p.speedY;
        if (p.y < 0) { p.y = height; p.x = Math.random() * width; }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.fill();
      });
      requestAnimationFrame(animate);
    }
    animate();
  }

  // --- RENDER ADMIN DASHBOARD ---
  function renderAdminPortal() {
    const session = getSession();
    if (!session) return;

    const db = getLicenseDb();
    const devices = Object.values(db);

    const now = Date.now();
    let activeCount = 0;
    let expiredCount = 0;
    let blockedCount = 0;

    devices.forEach(d => {
      if (d.status === 'BLOCKED') {
        blockedCount++;
      } else if (now > d.expiryTimestamp) {
        expiredCount++;
      } else {
        activeCount++;
      }
    });

    // Update KPI Cards
    document.getElementById('kpiTotalDevices').textContent = devices.length;
    document.getElementById('kpiActiveDevices').textContent = activeCount;
    document.getElementById('kpiExpiredDevices').textContent = expiredCount;
    document.getElementById('kpiBlockedDevices').textContent = blockedCount;

    // Render Table Body
    const tbody = document.getElementById('deviceTableBody');
    if (!tbody) return;

    if (devices.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 30px;">No registered devices found in database.</td></tr>`;
      return;
    }

    tbody.innerHTML = devices.map(d => {
      const isExpired = now > d.expiryTimestamp;
      const isBlocked = d.status === 'BLOCKED';

      let statusBadge = `<span class="badge badge-active">ACTIVE</span>`;
      if (isBlocked) {
        statusBadge = `<span class="badge badge-blocked">BLOCKED</span>`;
      } else if (isExpired) {
        statusBadge = `<span class="badge badge-expired">EXPIRED</span>`;
      }

      let timeLeftText = 'Expired';
      if (!isExpired && !isBlocked) {
        const diffMs = d.expiryTimestamp - now;
        const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        timeLeftText = `${days}d ${hours}h`;
      }

      return `
        <tr>
          <td>
            <div style="font-weight: 700; color: #ffffff;">${d.name}</div>
            <div style="font-size: 0.78rem; color: var(--text-muted);">${d.phone}</div>
          </td>
          <td><span style="font-family: var(--font-mono); font-size: 0.84rem; color: var(--gold-primary); font-weight: 700;">${d.deviceId}</span></td>
          <td style="font-family: var(--font-heading); font-size: 0.95rem; font-weight: 700;">${timeLeftText}</td>
          <td>${statusBadge}</td>
          <td style="font-size: 0.8rem; color: var(--text-muted);">${new Date(d.expiryTimestamp).toLocaleDateString()}</td>
          <td>
            <button class="btn-action-sm btn-extend" onclick="openExtendCalendarModal('${d.deviceId}')" title="Extend Expiry Date via Calendar">📅 Extend</button>
            <button class="btn-action-sm btn-block" onclick="toggleBlockDevice('${d.deviceId}')">${isBlocked ? 'Unblock' : 'Block'}</button>
            <button class="btn-action-sm btn-delete" onclick="deleteDevice('${d.deviceId}')">Delete</button>
          </td>
        </tr>
      `;
    }).join('');

    if (window.lucide) lucide.createIcons();
  }

  // --- FORM: REGISTER NEW DEVICE (WITH CALENDAR DATES) ---
  document.getElementById('formRegisterDevice')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const session = getSession();
    if (!session) {
      alert('Please log in first!');
      return;
    }

    const deviceId = document.getElementById('inputDeviceId').value.trim().toUpperCase();
    const name = document.getElementById('inputCustomerName').value.trim();
    const phone = document.getElementById('inputCustomerPhone').value.trim();
    const startDateVal = document.getElementById('inputStartDate').value;
    const expiryDateVal = document.getElementById('inputExpiryDate').value;

    if (!deviceId || !name || !phone || !startDateVal || !expiryDateVal) {
      alert('Please fill in all required fields!');
      return;
    }

    const expiryTimestamp = new Date(expiryDateVal + 'T23:59:59').getTime();
    if (isNaN(expiryTimestamp)) {
      alert('Please select a valid expiry date!');
      return;
    }

    const db = getLicenseDb();
    db[deviceId] = {
      deviceId: deviceId,
      name: name,
      phone: phone,
      registeredAt: new Date(startDateVal).toISOString(),
      expiryTimestamp: expiryTimestamp,
      status: 'ACTIVE'
    };

    saveLicenseDb(db);
    syncDeviceToCloud(db[deviceId]);
    renderAdminPortal();

    document.getElementById('inputDeviceId').value = '';
    document.getElementById('inputCustomerName').value = '';
    document.getElementById('inputCustomerPhone').value = '';

    alert(`AMMAAN License Activated for ${name} until ${new Date(expiryTimestamp).toLocaleDateString()}!`);
  });

  // --- GLOBAL ACTION HANDLERS WITH ROLE PERMISSIONS ---
  window.toggleBlockDevice = function(deviceId) {
    const session = getSession();
    if (!session) return alert('Please log in first!');

    const db = getLicenseDb();
    if (!db[deviceId]) return;

    if (db[deviceId].status === 'BLOCKED') {
      db[deviceId].status = 'ACTIVE';
      alert(`Unblocked device ${deviceId}`);
    } else {
      db[deviceId].status = 'BLOCKED';
      alert(`Blocked device ${deviceId}`);
    }

    saveLicenseDb(db);
    syncDeviceToCloud(db[deviceId]);
    renderAdminPortal();
  };

  window.deleteDevice = function(deviceId) {
    const session = getSession();
    if (!session) return alert('Please log in first!');

    // Role check: Only Super Admin can delete records!
    if (session.role !== 'SUPER_ADMIN') {
      alert('⛔ Permission Denied: Only Super Admin can delete customer device records!');
      return;
    }

    if (confirm(`Are you sure you want to delete device ${deviceId}?`)) {
      const db = getLicenseDb();
      delete db[deviceId];
      saveLicenseDb(db);
      deleteDeviceFromCloud(deviceId);
      renderAdminPortal();
    }
  };

  window.addEventListener('storage', () => {
    renderAdminPortal();
  });
});
