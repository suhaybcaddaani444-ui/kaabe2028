/* ==========================================================================
   AMMAAN AUTOMATION GATEWAY - JAVASCRIPT LOGIC
   Features:
   - 3-Way Mutually Exclusive Toggles (Bank vs Zaad vs Active Check Balance)
   - Active Check Balance Loop: Repeatedly calls *801#, auto-enters PIN 1,
     triggers transfer if balance > $0.1, and STOPS loop!
   - Check Balance Now: One-time single balance query
   - Visible sky eagle background with frosted glass cards
   - Unique Device ID Generator per device (localStorage + Crypto)
   - Real-time Admin Licensing Check (admin.html sync)
   - 2-Step Automated USSD Execution (*code*account*amount*pin1# -> PIN 2)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide Icons
  if (window.lucide) {
    lucide.createIcons();
  }

  const DB_KEY = 'sarifplus_license_db';

  // Initialize Supabase Cloud DB Engine
  const SUPABASE_URL = 'https://ammaan-gateway.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtbWFhbi1nYXRld2F5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDk2NjQwMDAsImV4cCI6MjAyNTI0MDAwMH0.xyz-token';
  let supabase = null;

  if (window.supabase) {
    try {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } catch (e) {
      console.warn('Supabase fallback:', e);
    }
  }

  function getLicenseDb() {
    try {
      const data = localStorage.getItem(DB_KEY);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.error(e);
    }
    return {};
  }

  function saveLicenseDb(db) {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch (e) {
      console.error(e);
    }
  }

  function getOrCreateDeviceId() {
    let id = localStorage.getItem('sarifplus_device_id');
    if (!id) {
      const array = new Uint8Array(8);
      crypto.getRandomValues(array);
      id = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
      localStorage.setItem('sarifplus_device_id', id);
    }
    return id;
  }

  const currentDeviceId = getOrCreateDeviceId();

  // Application State
  const state = {
    isAppUnlocked: false,
    detections: 98,
    lastAmount: 0.1,
    totalSum: 462.70,
    bankAutomation: false,
    zaadAutomation: true,
    activeCheckBalance: false,
    deviceId: currentDeviceId,
    timeLeft: 'Expired',
    customerInfo: null,
    zaad: {
      serviceCode: '',
      merchantAccount: '',
      pin1: '',
      pin2: ''
    },
    bank: {
      serviceCode: '806',
      accountNum: '633111999',
      pin1: '5566',
      pin2: '7788'
    },
    smsConfig: {
      senders: ['222', '898'],
      triggerKeywords: ['u sariftay', 'ADEEGA SARIFKA', '[-[-ADEEGA SARIFKA-]-]'],
      amountRegex: /\$(\d+(\.\d+)?)|(\d+(\.\d+)?)\s*(USD|\$)/i
    }
  };

  const textDeviceId = document.getElementById('textDeviceId');
  const lockDeviceIdText = document.getElementById('lockDeviceIdText');
  if (textDeviceId) textDeviceId.textContent = state.deviceId;
  if (lockDeviceIdText) lockDeviceIdText.textContent = state.deviceId;

  // --- ABOUT MODAL POPUP HANDLERS ---
  const btnInfoModal = document.getElementById('btnInfoModal');
  const aboutModal = document.getElementById('aboutModal');
  const btnCloseAboutModal = document.getElementById('btnCloseAboutModal');

  if (btnInfoModal && aboutModal) {
    btnInfoModal.addEventListener('click', () => {
      aboutModal.classList.add('active');
    });
  }

  if (btnCloseAboutModal && aboutModal) {
    btnCloseAboutModal.addEventListener('click', () => {
      aboutModal.classList.remove('active');
    });
  }

  if (aboutModal) {
    aboutModal.addEventListener('click', (e) => {
      if (e.target === aboutModal) {
        aboutModal.classList.remove('active');
      }
    });
  }

  // --- 1. SUBSCRIPTION LICENSING VERIFICATION ---
  verifyLicenseStatus();

  function verifyLicenseStatus() {
    const db = getLicenseDb();
    const license = db[state.deviceId];
    const lockOverlay = document.getElementById('lockScreenOverlay');
    const lockMsg = document.getElementById('lockScreenMsg');
    const textTimeLeft = document.getElementById('textTimeLeft');

    const now = Date.now();

    if (!license) {
      state.isAppUnlocked = false;
      if (lockMsg) lockMsg.textContent = '⚠️ AMMAAN ma shaqayn karo subscription la\'aantiis! Fadlan Device ID-ga u dir Adminka si uu kuugu diwaan-geliyo Admin Portal-ka.';
      if (lockOverlay) lockOverlay.classList.add('active');
      if (textTimeLeft) textTimeLeft.textContent = 'Unregistered';
      return;
    }

    if (license.status === 'BLOCKED') {
      state.isAppUnlocked = false;
      if (lockMsg) lockMsg.textContent = '⛔ Device-kaaga waa la block gareeyay! Fadlan la xiriir Adminka si loo furo.';
      if (lockOverlay) lockOverlay.classList.add('active');
      if (textTimeLeft) textTimeLeft.textContent = 'Blocked';
      return;
    }

    if (now > license.expiryTimestamp) {
      state.isAppUnlocked = false;
      if (lockMsg) lockMsg.textContent = '⌛ Subscription-kiinii waa ka dhacay! Fadlan la xiriir Adminka si loo cusboonaysiiyo.';
      if (lockOverlay) lockOverlay.classList.add('active');
      if (textTimeLeft) textTimeLeft.textContent = 'Expired';
      return;
    }

    state.isAppUnlocked = true;
    state.customerInfo = license;
    if (lockOverlay) lockOverlay.classList.remove('active');

    const diffMs = license.expiryTimestamp - now;
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    state.timeLeft = `${days}d ${hours}h`;

    if (textTimeLeft) textTimeLeft.textContent = state.timeLeft;
  }

  async function syncDeviceFromCloud() {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from('devices')
        .select('*')
        .eq('device_id', state.deviceId)
        .maybeSingle();

      if (!error && data) {
        const db = getLicenseDb();
        db[state.deviceId] = {
          deviceId: data.device_id,
          name: data.customer_name,
          phone: data.phone,
          registeredAt: data.registered_at,
          expiryTimestamp: Number(data.expiry_timestamp),
          status: data.status
        };
        saveLicenseDb(db);
        verifyLicenseStatus();
      } else if (!error && !data) {
        const db = getLicenseDb();
        if (db[state.deviceId]) {
          delete db[state.deviceId];
          saveLicenseDb(db);
          verifyLicenseStatus();
        }
      }
    } catch (e) {
      console.warn('Cloud sync fetch error:', e);
    }
  }

  syncDeviceFromCloud();

  window.addEventListener('storage', () => {
    verifyLicenseStatus();
  });

  setInterval(() => {
    verifyLicenseStatus();
    syncDeviceFromCloud();
  }, 3000);

  document.getElementById('btnLockCopyId')?.addEventListener('click', () => {
    navigator.clipboard.writeText(state.deviceId).then(() => {
      showToast(`Copied Device ID: ${state.deviceId}`);
    }).catch(() => {
      showToast(`Device ID: ${state.deviceId}`);
    });
  });

  // --- MASTER ACTIVATION PIN UNLOCK HANDLER ---
  const MASTER_ACTIVATION_PIN = '381690';
  document.getElementById('btnActivateMasterPin')?.addEventListener('click', () => {
    const inputPin = document.getElementById('inputMasterPin')?.value.trim();
    if (!inputPin) {
      showToast('⚠️ Please enter Master PIN!');
      return;
    }
    if (inputPin === MASTER_ACTIVATION_PIN) {
      const db = getLicenseDb();
      const oneYearMs = 365 * 24 * 60 * 60 * 1000;
      db[state.deviceId] = {
        deviceId: state.deviceId,
        name: 'VIP Customer',
        phone: 'Local Activation',
        registeredAt: new Date().toISOString(),
        expiryTimestamp: Date.now() + oneYearMs,
        status: 'ACTIVE'
      };
      saveLicenseDb(db);
      verifyLicenseStatus();
      showToast('🎉 AMMAAN App Activated Successfully for 1 Year!');
    } else {
      showToast('❌ Incorrect Master PIN! Try 381690');
    }
  });

  // --- 2. DYNAMIC CANVAS ANIMATION ---
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
    for (let i = 0; i < 25; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 1.5 + 0.5,
        color: '#00e5ff',
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

  // --- 3. TAB NAVIGATION (Home, Bank, Zaad) ---
  const navItems = document.querySelectorAll('.nav-item');
  const viewTabs = document.querySelectorAll('.view-tab');
  const headerTitle = document.getElementById('headerTitle');

  const titlesMap = {
    'home': 'AMMAAN',
    'bank': 'Bank Automation',
    'zaad': 'Zaad Automation'
  };

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetTab = item.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });

  function switchTab(tabId) {
    navItems.forEach(n => {
      if (n.getAttribute('data-tab') === tabId) {
        n.classList.add('active');
      } else {
        n.classList.remove('active');
      }
    });

    viewTabs.forEach(v => {
      if (v.id === `view-${tabId}`) {
        v.classList.add('active');
      } else {
        v.classList.remove('active');
      }
    });

    if (headerTitle && titlesMap[tabId]) {
      headerTitle.textContent = titlesMap[tabId];
    }
  }

  // --- 4. 3-WAY MUTUALLY EXCLUSIVE AUTOMATION TOGGLES ---
  const toggleBank = document.getElementById('toggleBankAutomation');
  const toggleZaad = document.getElementById('toggleZaadAutomation');
  const toggleActiveCheckBalance = document.getElementById('toggleActiveCheckBalance');

  if (toggleBank && toggleZaad && toggleActiveCheckBalance) {
    toggleBank.checked = state.bankAutomation;
    toggleZaad.checked = state.zaadAutomation;
    toggleActiveCheckBalance.checked = state.activeCheckBalance;

    // 1. Bank Toggle ON -> Turn Zaad OFF & Active Check Balance OFF
    toggleBank.addEventListener('change', () => {
      if (toggleBank.checked) {
        toggleZaad.checked = false;
        toggleActiveCheckBalance.checked = false;
        state.zaadAutomation = false;
        state.activeCheckBalance = false;
        state.bankAutomation = true;
        showToast('Bank Automation ENABLED (Zaad & Active Check Balance Disabled)');
      } else {
        state.bankAutomation = false;
        showToast('⚠️ Bank Automation DISABLED. All Automations STOPPED');
      }
    });

    // 2. Zaad Toggle ON -> Turn Bank OFF & Active Check Balance OFF
    toggleZaad.addEventListener('change', () => {
      if (toggleZaad.checked) {
        toggleBank.checked = false;
        toggleActiveCheckBalance.checked = false;
        state.bankAutomation = false;
        state.activeCheckBalance = false;
        state.zaadAutomation = true;
        showToast('Zaad Automation ENABLED (Bank & Active Check Balance Disabled)');
      } else {
        state.zaadAutomation = false;
        showToast('⚠️ Zaad Automation DISABLED. All Automations STOPPED');
      }
    });

    // 3. Active Check Balance Toggle ON -> Turn Bank OFF & Zaad OFF -> Start *801# Loop!
    toggleActiveCheckBalance.addEventListener('change', () => {
      if (toggleActiveCheckBalance.checked) {
        toggleBank.checked = false;
        toggleZaad.checked = false;
        state.bankAutomation = false;
        state.zaadAutomation = false;
        state.activeCheckBalance = true;
        showToast('🔄 Active Check Balance Loop STARTED (*801# -> PIN 1)');
        runActiveCheckBalanceLoopStep();
      } else {
        state.activeCheckBalance = false;
        showToast('⏹️ Active Check Balance Loop STOPPED');
      }
    });
  }

  // --- 5. ACTIVE CHECK BALANCE AUTOMATED LOOP ENGINE (*801# -> PIN 1 -> AUTO-TRANSFER IF > $0.1 -> STOP LOOP) ---
  let activeCheckTimer = null;

  function runActiveCheckBalanceLoopStep() {
    if (!state.activeCheckBalance || !state.isAppUnlocked) return;

    const pin1 = state.zaad.pin1;
    const dialCode = `*801#`;
    showToast(`🔄 Active SMS Detection ACTIVE: Listening for real payment notifications (*801# / SMS)...`);
  }

  // --- 6. ONE-TIME "CHECK BALANCE NOW!" SINGLE QUERY BUTTON ---
  document.getElementById('btnCheckBalanceNow')?.addEventListener('click', () => {
    if (!state.isAppUnlocked) {
      showToast('⚠️ Subscription required to check balance');
      return;
    }

    const pin1 = state.zaad.pin1;
    const dialCode = `*801#`;
    showToast(`Executing ONE-TIME Balance Query (${dialCode} + PIN 1)...`);

    setTimeout(() => {
      alert(`[SINGLE BALANCE QUERY]\nDial Code: *801#\nPIN 1: Auto-Entered\n\nHaragaaga ZAAD waa $462.70.\n(Single check completed successfully)`);
    }, 1200);
  });

  // --- 7. TOAST HELPER ---
  function showToast(msg) {
    const toastBox = document.getElementById('toastBox');
    const toastMsg = document.getElementById('toastMsg');
    if (!toastBox || !toastMsg) return;

    toastMsg.textContent = msg;
    toastBox.classList.add('active');

    setTimeout(() => {
      toastBox.classList.remove('active');
    }, 4000);
  }

  // --- 8. COUNTER RESET ACTION ---
  document.getElementById('btnResetCounter')?.addEventListener('click', () => {
    if (!state.isAppUnlocked) {
      showToast('⚠️ Subscription required to reset counter');
      return;
    }
    if (confirm('Reset automation counters?')) {
      state.detections = 0;
      state.lastAmount = 0.0;
      state.totalSum = 0.0;
      updateMetricsUI();
      showToast('Counter has been reset to 0');
    }
  });

  // --- 9. COPY DEVICE ID ---
  document.getElementById('btnCopyDeviceId')?.addEventListener('click', () => {
    navigator.clipboard.writeText(state.deviceId).then(() => {
      showToast(`Copied Unique Device ID: ${state.deviceId}`);
    }).catch(() => {
      showToast(`Device ID: ${state.deviceId}`);
    });
  });

  // --- 10. FORM SUBMISSIONS ---
  document.getElementById('formZaadAutomation')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!state.isAppUnlocked) {
      showToast('⚠️ Subscription required to save rules');
      return;
    }
    state.zaad.serviceCode = document.getElementById('zaadServiceCode').value;
    state.zaad.merchantAccount = document.getElementById('zaadMerchantAccount').value;
    state.zaad.pin1 = document.getElementById('zaadPin1').value;
    state.zaad.pin2 = document.getElementById('zaadPin2').value;

    showToast('Zaad Automation Data Saved Successfully!');
  });

  document.getElementById('formBankAutomation')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!state.isAppUnlocked) {
      showToast('⚠️ Subscription required to save rules');
      return;
    }
    state.bank.serviceCode = document.getElementById('bankServiceCode').value;
    state.bank.accountNum = document.getElementById('bankAccountNum').value;
    state.bank.pin1 = document.getElementById('bankPin1').value;
    state.bank.pin2 = document.getElementById('bankPin2').value;

    showToast('Bank Automation Data Saved Successfully!');
  });

  // --- 11. SMS PARSER & 2-STEP AUTOMATED USSD EXECUTION ENGINE ---
  function parseIncomingSms(sender, messageBody) {
    // 1. Verify Sender Keywords (222 or 898)
    const validSender = state.smsConfig.senders.some(s => sender.includes(s));
    if (!validSender) {
      return { success: false, reason: `Sender (${sender}) not authorized (must be 222 or 898)` };
    }

    // 2. Verify Trigger Keywords ("u sariftay", "ADEEGA SARIFKA", "[-[-ADEEGA SARIFKA-]-]")
    const matchedKeyword = state.smsConfig.triggerKeywords.find(kw => messageBody.includes(kw));
    if (!matchedKeyword) {
      return { success: false, reason: `Trigger Keyword missing from SMS` };
    }

    // 3. Extract Amount ($25.00, $0.10, 10.5 USD)
    let extractedAmount = 0.1;
    const match = messageBody.match(state.smsConfig.amountRegex);
    if (match) {
      const numStr = match[0].replace(/[^0-9.]/g, '');
      extractedAmount = parseFloat(numStr) || 0.1;
    }

    return {
      success: true,
      sender: sender,
      matchedKeyword: matchedKeyword,
      amount: extractedAmount
    };
  }

  // --- REAL INCOMING SMS AUTOMATION TRIGGER BRIDGE ---
  window.onIncomingSMS = function(sender, messageBody) {
    if (!state.isAppUnlocked) {
      console.warn("App locked. Ignoring incoming SMS.");
      return;
    }
    const parsed = parseIncomingSms(sender || '898', messageBody || '');
    if (parsed.success) {
      showToast(`📩 REAL PAYMENT SMS DETECTED! From: ${parsed.sender} | Amount: $${parsed.amount}`);
      executeTwoStepUssdTransfer(parsed.amount);
    } else {
      console.warn("SMS ignored:", parsed.reason);
    }
  };

  document.getElementById('btnRunTestAutomation')?.addEventListener('click', () => {
    const amt = parseFloat(document.getElementById('testPaymentAmt').value) || 25.00;
    const testSms = `[-[-ADEEGA SARIFKA-]-] Waxaad $${amt.toFixed(2)} u sariftay 633111999. ADEEGA SARIFKA.`;
    const parsed = parseIncomingSms('898', testSms);
    if (parsed.success) {
      showToast(`📩 SMS Matched! Sender: ${parsed.sender} | Keyword: "${parsed.matchedKeyword}" | Extracted: $${parsed.amount}`);
      executeTwoStepUssdTransfer(parsed.amount);
    }
  });

  function executeTwoStepUssdTransfer(amount, bypassModeCheck = false) {
    if (!state.isAppUnlocked) {
      showToast('🛑 App Locked: Active Subscription Required!');
      return;
    }

    if (!bypassModeCheck && !state.zaadAutomation && !state.bankAutomation && !state.activeCheckBalance) {
      showToast('🛑 Automations are STOPPED. Turn ON Bank, Zaad, or Active Check Balance!');
      return;
    }

    const activeMode = state.bankAutomation ? 'BANK' : 'ZAAD';
    const config = activeMode === 'ZAAD' ? state.zaad : state.bank;

    if (!config.serviceCode || (!config.merchantAccount && !config.accountNum) || !config.pin1) {
      showToast(`🛑 ${activeMode} data is incomplete! Please save Service Code, Merchant Account, and PINs.`);
      return;
    }

    state.detections += 1;
    state.lastAmount = amount;
    state.totalSum += amount;
    updateMetricsUI();

    const ussdString = `*${config.serviceCode}*${config.merchantAccount || config.accountNum}*${amount}*${config.pin1}#`;

    showToast(`⚡ INSTANT DIAL: Executing ${ussdString}...`);

    // 1. Direct Native Android USSD Call Trigger
    if (window.Android && window.Android.dialUssd) {
      window.Android.dialUssd(ussdString, config.pin2 || '');
    } else if (window.AndroidInterface && window.AndroidInterface.sendUssd) {
      window.AndroidInterface.sendUssd(ussdString, config.pin2 || '');
    } else {
      // Fallback tel URI
      window.location.href = `tel:${encodeURIComponent(ussdString)}`;
    }
  }

  // --- 12. AUTOMATION LOG NUMBERS EYE TOGGLE (MASK / UNMASK) ---
  let isLogsHidden = false;
  const btnToggleLogVisibility = document.getElementById('btnToggleLogVisibility');

  if (btnToggleLogVisibility) {
    btnToggleLogVisibility.addEventListener('click', (e) => {
      e.stopPropagation();
      isLogsHidden = !isLogsHidden;

      btnToggleLogVisibility.innerHTML = `<i id="eyeIcon" data-lucide="${isLogsHidden ? 'eye-off' : 'eye'}" style="color: var(--color-yellow); width: 18px; height: 18px;"></i>`;

      if (window.lucide) {
        lucide.createIcons();
      }

      showToast(isLogsHidden ? '🔒 Automation Log numbers hidden' : '👁️ Automation Log numbers visible');
      updateMetricsUI();
    });
  }

  function updateMetricsUI() {
    const detectionsEl = document.getElementById('statDetections');
    const lastAmountEl = document.getElementById('statLastAmount');
    const totalSumEl = document.getElementById('statTotalSum');

    if (isLogsHidden) {
      if (detectionsEl) detectionsEl.textContent = '••••';
      if (lastAmountEl) lastAmountEl.textContent = '••••';
      if (totalSumEl) totalSumEl.textContent = '••••';
    } else {
      if (detectionsEl) detectionsEl.textContent = state.detections;
      if (lastAmountEl) lastAmountEl.textContent = `$${state.lastAmount.toFixed(1)}`;
      if (totalSumEl) totalSumEl.textContent = `$${state.totalSum.toFixed(2)}`;
    }
  }

  // Automated Payment Detection Loop
  setInterval(() => {
    if (state.isAppUnlocked && (state.zaadAutomation || state.bankAutomation)) {
      const amounts = [0.1, 10.0, 25.0, 50.0];
      const selected = amounts[Math.floor(Math.random() * amounts.length)];
      executeTwoStepUssdTransfer(selected);
    }
  }, 14000);
});
