// Creator Earnings Hub Controller
import {
  db,
  auth,
  onAuthStateChanged,
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs
} from "./db-config.js";

// State
let currentUser = null;
let creatorProfile = null;
let totalGrossRevenue = 0;
let totalNetRevenue = 0;
let totalWithdrawn = 0;
let currentBalance = 0;

// DOM Elements
const totalSalesVal = document.getElementById("total-historical-sales");
const monthlySalesVal = document.getElementById("current-monthly-sales");
const balanceVal = document.getElementById("available-cashout-balance");
const withdrawnVal = document.getElementById("total-withdrawn-balance");
const performanceTable = document.getElementById("video-performance-table-body");
const historyTable = document.getElementById("revenue-history-table-body");

const sidebarName = document.getElementById("sidebar-username");
const sidebarAvatar = document.getElementById("sidebar-avatar");
const creatorPlanBadge = document.getElementById("creator-plan-badge");

// Form inputs
const withdrawForm = document.getElementById("withdraw-balance-form");
const withdrawSuccessAlert = document.getElementById("withdraw-success-alert");
const withdrawAmountInput = document.getElementById("withdraw-amount");
const withdrawProviderSelect = document.getElementById("withdraw-provider");
const withdrawPhoneInput = document.getElementById("withdraw-phone");


document.addEventListener("DOMContentLoaded", () => {
  setupAuthObserver();
  setupWithdrawalHandler();
});

function setupAuthObserver() {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      
      // Load Firestore user doc
      try {
        const uDoc = await getDoc(doc(db, "users", user.uid));
        if (uDoc.exists()) {
          creatorProfile = uDoc.data();
          if (creatorProfile.role !== "creator" && creatorProfile.role !== "admin") {
            window.location.href = "viewer-dashboard.html";
            return;
          }
        }
      } catch (err) {
        console.warn("Firestore error loading earnings metadata. Falling back to local mocks.");
      }

      // Default mock profile if missing
      if (!creatorProfile) {
        creatorProfile = {
          displayName: user.displayName || "Chevalier Ndole",
          photoURL: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&q=80",
          creatorProfile: {
            plan: "starter",
            paymentDetails: {
              provider: "MTN",
              number: "+237 677 123 456"
            }
          }
        };
      }

      updateSidebarUI();
      loadEarningsData();
    } else {
      window.location.href = "login.html";
    }
  });
}

function updateSidebarUI() {
  sidebarName.innerText = creatorProfile.displayName;
  if (creatorProfile.photoURL) {
    sidebarAvatar.src = creatorProfile.photoURL;
  }
  const plan = creatorProfile.creatorProfile?.plan || "starter";
  creatorPlanBadge.innerText = plan === "premium" ? "Premium Creator" : "Starter Creator";
  creatorPlanBadge.className = plan === "premium" ? "sidebar-user-role badge badge-featured" : "sidebar-user-role";

  // Prefill cashout wallet
  const wallet = creatorProfile.creatorProfile?.paymentDetails || {};
  if (wallet.number) withdrawPhoneInput.value = wallet.number;
  if (wallet.provider) withdrawProviderSelect.value = wallet.provider;
}

// Calculate metrics and populate tables
async function loadEarningsData() {
  // Reset counters
  totalGrossRevenue = 0;
  totalNetRevenue = 0;
  
  let salesLog = [];
  let performanceBreakdown = [];

  // Fetch real videos for this creator
  try {
    const q = query(
      collection(db, "videos"),
      where("creatorId", "==", currentUser.uid),
      where("status", "==", "approved")
    );
    const snapshot = await getDocs(q);
    
    snapshot.forEach(docSnap => {
      const video = docSnap.data();
      const views = video.views || 0;
      const price = video.priceFCFA || 0;
      
      // For now, assuming 1 view = 1 sale to generate real-time metrics based on live views
      const salesCount = views; 
      const gross = salesCount * price;

      performanceBreakdown.push({
        title: video.title,
        price: price,
        views: views,
        salesCount: salesCount,
        earnings: gross
      });

      if (gross > 0) {
        salesLog.push({
          id: "TX_" + docSnap.id.substring(0, 8).toUpperCase(),
          type: `Video Sale: ${video.title}`,
          amount: gross,
          date: video.createdAt || new Date().toISOString(),
          method: "momo"
        });
      }
    });
  } catch (err) {
    console.error("Error loading real earnings from Firestore:", err);
  }

  // Calculate gross, monthly splits
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  
  let monthlyGross = 0;

  salesLog.forEach(tx => {
    totalGrossRevenue += tx.amount;
    
    // Check if within current month
    const txDate = new Date(tx.date);
    if (txDate.getFullYear() === currentYear && txDate.getMonth() === currentMonth) {
      monthlyGross += tx.amount;
    }
  });

  // 20% platform split logic (Creator gets 80%)
  totalNetRevenue = Math.floor(totalGrossRevenue * 0.8);
  const monthlyNet = Math.floor(monthlyGross * 0.8);

  // Calculate withdrawals
  totalWithdrawn = parseInt(localStorage.getItem(`withdrawn_${currentUser.uid}`)) || 0;
  currentBalance = totalNetRevenue - totalWithdrawn;

  // Render metrics to cards
  totalSalesVal.innerText = `${totalNetRevenue.toLocaleString()} FCFA`;
  monthlySalesVal.innerText = `${monthlyNet.toLocaleString()} FCFA`;
  balanceVal.innerText = `${currentBalance.toLocaleString()} FCFA`;
  withdrawnVal.innerText = `${totalWithdrawn.toLocaleString()} FCFA`;
  withdrawAmountInput.placeholder = `Max ${currentBalance} FCFA`;

  // Render Performance breakdown
  performanceTable.innerHTML = performanceBreakdown.map(item => {
    const conv = item.views > 0 ? ((item.salesCount / item.views) * 100).toFixed(1) : "0.0";
    const netShare = Math.floor(item.earnings * 0.8);
    return `
      <tr>
        <td style="font-weight:700;">${item.title}</td>
        <td>${item.price.toLocaleString()} FCFA</td>
        <td>${item.views}</td>
        <td>${item.salesCount}</td>
        <td><span class="badge badge-success">${conv}%</span></td>
        <td style="font-weight:700; color:var(--primary);">${netShare.toLocaleString()} FCFA</td>
      </tr>
    `;
  }).join("");

  // Render detailed transaction history log (merges sales and payouts)
  const payoutLogs = JSON.parse(localStorage.getItem(`payouts_${currentUser.uid}`)) || [];
  
  const allFinTransactions = [
    ...salesLog.map(s => ({
      id: s.id,
      date: s.date,
      type: s.type,
      gross: s.amount,
      fee: Math.floor(s.amount * 0.2),
      net: Math.floor(s.amount * 0.8),
      method: s.method,
      status: "completed"
    })),
    ...payoutLogs.map(p => ({
      id: p.id,
      date: p.date,
      type: "Momo Wallet Payout Withdrawal",
      gross: -p.amount,
      fee: 0,
      net: -p.amount,
      method: p.method,
      status: "completed"
    }))
  ];

  // Sort by date newest first
  allFinTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (allFinTransactions.length > 0) {
    historyTable.innerHTML = allFinTransactions.map(tx => {
      const grossLabel = tx.gross >= 0 ? `+${tx.gross.toLocaleString()} FCFA` : `${tx.gross.toLocaleString()} FCFA`;
      const netLabel = tx.net >= 0 ? `+${tx.net.toLocaleString()} FCFA` : `${tx.net.toLocaleString()} FCFA`;
      const feeLabel = tx.fee > 0 ? `-${tx.fee.toLocaleString()} FCFA` : "---";
      
      const typeStyle = tx.gross < 0 ? "color: var(--error); font-weight:700;" : "color: var(--success); font-weight:700;";
      const statusBadge = tx.status === "completed" 
        ? `<span class="badge badge-success">Completed</span>`
        : `<span class="badge badge-pending">Pending</span>`;

      return `
        <tr>
          <td><code>${tx.id}</code></td>
          <td>${new Date(tx.date).toLocaleDateString()}</td>
          <td style="font-size:13px; font-weight:600;">${tx.type}</td>
          <td>${grossLabel}</td>
          <td style="color:var(--text-muted);">${feeLabel}</td>
          <td style="${typeStyle}">${netLabel}</td>
          <td><span style="text-transform:uppercase;">${tx.method}</span></td>
          <td>${statusBadge}</td>
        </tr>
      `;
    }).join("");
  } else {
    historyTable.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:24px; color:var(--text-muted);">No records available.</td></tr>`;
  }
}

// Handle payout submission
function setupWithdrawalHandler() {
  withdrawForm.addEventListener("submit", (e) => {
    e.preventDefault();
    withdrawSuccessAlert.style.display = "none";

    const amount = parseInt(withdrawAmountInput.value);
    const provider = withdrawProviderSelect.value;
    const phone = withdrawPhoneInput.value;

    if (amount > currentBalance) {
      alert("Withdrawal request exceeds your available balance.");
      return;
    }

    if (amount < 500) {
      alert("Minimum withdrawal amount is 500 FCFA.");
      return;
    }

    const submitBtn = document.getElementById("withdraw-submit-btn");
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Directing Payout...`;

    setTimeout(() => {
      // Mock payout execution and write log to localStorage
      const pLogs = JSON.parse(localStorage.getItem(`payouts_${currentUser.uid}`)) || [];
      const payoutId = "PAYOUT_" + Math.random().toString(36).substring(2, 9).toUpperCase();
      
      pLogs.push({
        id: payoutId,
        amount: amount,
        method: provider.toLowerCase(),
        phone: phone,
        date: new Date().toISOString()
      });
      localStorage.setItem(`payouts_${currentUser.uid}`, JSON.stringify(pLogs));

      // Update cashouts running total
      const prevWithdrawn = parseInt(localStorage.getItem(`withdrawn_${currentUser.uid}`)) || 0;
      localStorage.setItem(`withdrawn_${currentUser.uid}`, prevWithdrawn + amount);

      submitBtn.disabled = false;
      submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Withdraw Now`;
      
      withdrawSuccessAlert.style.display = "flex";
      withdrawForm.reset();

      // Reload
      loadEarningsData();
      updateSidebarUI();
      
      setTimeout(() => {
        withdrawSuccessAlert.style.display = "none";
      }, 3000);
    }, 2000);
  });
}
