import { db, firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    createUserWithEmailAndPassword,
    getAuth,
    sendPasswordResetEmail,
    signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    addDoc,
    deleteDoc,
    collection,
    doc,
    getDocs,
    increment,
    onSnapshot,
    query,
    runTransaction,
    serverTimestamp,
    updateDoc,
    where
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let stopProducts = null;
let stopUsers = null;
let stopAnalyticsTransactions = null;
let stopAnalyticsScans = null;
let stopCardTemplates = null;
let initialized = false;
let memberScanner = null;
let memberLookupTimer = null;
let currentMemberDetails = null;
let analyticsTransactions = [];
let analyticsScans = [];
let analyticsCharts = {};
let lastScanKey = "";
let lastScanAt = 0;
let memberDirectory = [];
let cardEditorResizeBound = false;
let cardTemplateDraft = {
    id: "",
    name: "Template Utama",
    backgroundUrl: "",
    backgroundColor: "#0f172a",
    textColor: "#ffffff",
    textSize: 14,
    idPosition: { x: 8, y: 55 },
    namePosition: { x: 8, y: 68 },
    qrPosition: { x: 75, y: 28 },
    qrSize: 100,
    active: true
};
const productCache = new Map();
const memberCache = new Map();
const memberProvisioningAuth = getAuth(initializeApp(firebaseConfig, "member-provisioning"));

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
}[char]));

const formatCurrency = (value) => `Rp ${(Number(value) || 0).toLocaleString("id-ID")}`;

function setActiveTab(activeId) {
    ["POS", "Analytics", "Card", "Products", "Users"].forEach((tab) => {
        const button = document.getElementById(`btnAdminTab${tab}`);
        const content = document.getElementById(`adminTab${tab}`);
        const active = tab === activeId;
        button.className = active
            ? "py-2.5 px-4 font-bold text-emerald-400 border-b-2 border-emerald-400"
            : "py-2.5 px-4 font-bold text-slate-400 hover:text-white";
        content.classList.toggle("hidden", !active);
    });
    if (activeId === "POS") closePOSMode();
}

function setCardTemplateMessage(message, type = "info") {
    const element = document.getElementById("cardTemplateMessage");
    element.textContent = message;
    element.className = `min-h-5 text-center text-sm ${type === "error" ? "text-rose-300" : "text-emerald-300"}`;
}

function showCardTemplateNotification(message, type = "success") {
    const modal = document.getElementById("posNotificationModal");
    const icon = document.getElementById("posNotificationIcon");
    document.getElementById("posNotificationTitle").textContent = type === "error" ? "Template Gagal Disimpan" : "Template Berhasil Disimpan";
    document.getElementById("posNotificationMessage").textContent = message;
    icon.className = `mx-auto flex h-14 w-14 items-center justify-center rounded-full text-2xl ${type === "error" ? "bg-rose-500/15 text-rose-300" : "bg-emerald-500/15 text-emerald-300"}`;
    icon.innerHTML = type === "error" ? '<i class="fa-solid fa-circle-exclamation"></i>' : '<i class="fa-solid fa-circle-check"></i>';
    modal.classList.remove("hidden");
}

function renderCardEditor() {
    const stage = document.getElementById("cardEditorStage");
    const id = document.getElementById("editorCardId");
    const name = document.getElementById("editorCardName");
    const qr = document.getElementById("editorCardQr");
    stage.style.backgroundColor = cardTemplateDraft.backgroundColor || "#0f172a";
    stage.style.backgroundImage = cardTemplateDraft.backgroundUrl ? `url("${cardTemplateDraft.backgroundUrl}")` : "none";
    stage.style.backgroundSize = "cover";
    const stageWidth = stage.clientWidth || 620;
    const qrSize = Math.min(cardTemplateDraft.qrSize, stageWidth * 0.22);
    const qrPercent = (qrSize / stageWidth) * 100;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    id.style.left = `${clamp(cardTemplateDraft.idPosition.x, 5, 72)}%`;
    id.style.top = `${cardTemplateDraft.idPosition.y}%`;
    name.style.left = `${clamp(cardTemplateDraft.namePosition.x, 5, 72)}%`;
    name.style.top = `${cardTemplateDraft.namePosition.y}%`;
    id.style.color = cardTemplateDraft.textColor;
    name.style.color = cardTemplateDraft.textColor;
    id.style.fontSize = `${Math.min(cardTemplateDraft.textSize, stageWidth * 0.045)}px`;
    name.style.fontSize = `${Math.min(Math.max(10, cardTemplateDraft.textSize + 4), stageWidth * 0.055)}px`;
    qr.style.left = `${clamp(cardTemplateDraft.qrPosition.x, 65, 94 - qrPercent)}%`;
    qr.style.top = `${cardTemplateDraft.qrPosition.y}%`;
    qr.style.right = "auto";
    qr.style.width = `${qrSize}px`;
    qr.style.height = `${qrSize}px`;
    qr.replaceChildren();
    if (window.QRCode) new window.QRCode(qr, { text: "MB-000000", width: Math.max(20, qrSize - 8), height: Math.max(20, qrSize - 8), correctLevel: window.QRCode.CorrectLevel.H, colorDark: "#07111f", colorLight: "#ffffff" });
}

function readCardDraftForm() {
    cardTemplateDraft.name = document.getElementById("cardTemplateName").value.trim() || "Template Kartu";
    cardTemplateDraft.backgroundUrl = document.getElementById("cardBackgroundUrl").value.trim();
    cardTemplateDraft.backgroundColor = document.getElementById("cardBackgroundColor").value;
    cardTemplateDraft.textColor = document.getElementById("cardTextColor").value;
    cardTemplateDraft.textSize = Number(document.getElementById("cardTextSize").value) || 14;
    cardTemplateDraft.qrSize = Number(document.getElementById("cardQrSize").value) || 100;
    cardTemplateDraft.active = document.getElementById("cardTemplateActive").checked;
    renderCardEditor();
}

function loadCardDraft(template) {
    cardTemplateDraft = { ...cardTemplateDraft, ...template, id: template.id || "" };
    document.getElementById("cardTemplateName").value = cardTemplateDraft.name || "Template Kartu";
    document.getElementById("cardBackgroundUrl").value = cardTemplateDraft.backgroundUrl || "";
    document.getElementById("cardBackgroundColor").value = cardTemplateDraft.backgroundColor || "#0f172a";
    document.getElementById("cardBackgroundFile").value = "";
    document.getElementById("cardTextColor").value = cardTemplateDraft.textColor || "#ffffff";
    document.getElementById("cardTextSize").value = cardTemplateDraft.textSize || 14;
    document.getElementById("cardQrSize").value = cardTemplateDraft.qrSize || 100;
    document.getElementById("cardTemplateActive").checked = Boolean(cardTemplateDraft.active);
    document.getElementById("cardStudioMode").classList.remove("hidden");
    document.getElementById("cardStudioTitle").textContent = "Edit Template Kartu";
    document.getElementById("cardStudioTemplateId").textContent = `ID Template: ${cardTemplateDraft.id || "template baru"}`;
    renderCardEditor();
}

function resetCardStudioMode() {
    document.getElementById("cardStudioMode").classList.add("hidden");
    document.getElementById("cardStudioTitle").textContent = "Buat Template Kartu";
    document.getElementById("cardStudioTemplateId").textContent = "ID Template: template baru";
    document.getElementById("cardBackgroundFile").value = "";
}

function clearCardBackground() {
    cardTemplateDraft.backgroundUrl = "";
    document.getElementById("cardBackgroundUrl").value = "";
    document.getElementById("cardBackgroundFile").value = "";
    renderCardEditor();
    setCardTemplateMessage("Background gambar dihapus. Warna background digunakan.");
}

function readCardBackgroundFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!/^image\/(jpeg|png)$/.test(file.type)) {
        setCardTemplateMessage("Background harus JPG atau PNG.", "error");
        event.target.value = "";
        return;
    }
    const reader = new FileReader();
    reader.onload = () => {
        document.getElementById("cardBackgroundUrl").value = reader.result;
        readCardDraftForm();
    };
    reader.readAsDataURL(file);
}

function makeDraggable(element, positionKey) {
    let dragging = false;
    element.addEventListener("pointerdown", (event) => { dragging = true; element.setPointerCapture(event.pointerId); });
    element.addEventListener("pointermove", (event) => {
        if (!dragging) return;
        const rect = document.getElementById("cardEditorStage").getBoundingClientRect();
        cardTemplateDraft[positionKey] = { x: Math.max(0, Math.min(90, ((event.clientX - rect.left) / rect.width) * 100)), y: Math.max(0, Math.min(85, ((event.clientY - rect.top) / rect.height) * 100)) };
        renderCardEditor();
    });
    element.addEventListener("pointerup", () => { dragging = false; });
}

function subscribeToCardTemplates() {
    stopCardTemplates = onSnapshot(collection(db, "cardTemplates"), (snapshot) => {
        const list = document.getElementById("cardTemplateList");
        list.replaceChildren();
        const templates = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        if (!templates.length) list.textContent = "Belum ada template.";
        templates.forEach((template) => {
            const row = document.createElement("div");
            row.className = "flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/50 p-3";
            const thumbnail = document.createElement("div");
            thumbnail.className = "h-12 w-20 shrink-0 rounded-md border border-slate-700 bg-cover bg-center";
            thumbnail.style.backgroundColor = template.backgroundColor || "#0f172a";
            thumbnail.style.backgroundImage = template.backgroundUrl ? `url("${template.backgroundUrl}")` : "none";
            const details = document.createElement("div");
            details.className = "min-w-0 flex-1";
            details.innerHTML = `<p class="truncate text-slate-200">${escapeHtml(template.name || "Template")}</p><p class="text-[10px] text-slate-500">ID: ${escapeHtml(template.id)}</p><p class="text-[10px] ${template.active ? "text-emerald-300" : "text-slate-500"}">${template.active ? "Aktif" : "Tidak aktif"}</p>`;
            const button = document.createElement("button");
            button.type = "button";
            button.className = "text-xs text-sky-300 hover:text-white";
            button.textContent = "Edit";
            button.onclick = () => loadCardDraft(template);
            const deleteBtn = document.createElement("button");
            deleteBtn.type = "button";
            deleteBtn.className = "text-xs text-rose-400 hover:text-white";
            deleteBtn.textContent = "Hapus";
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                document.getElementById("deleteConfirmMessage").textContent = `Yakin ingin menghapus template "${template.name || "Template"}"?`;
                document.getElementById("deleteConfirmModal").classList.remove("hidden");
                document.getElementById("deleteConfirmModal").onclick = (event) => {
                    if (event.target.id === "deleteConfirmModal") {
                        document.getElementById("deleteConfirmModal").classList.add("hidden");
                    }
                };
                document.getElementById("btnConfirmDelete").onclick = () => confirmDeleteTemplate(template.id);
            };
            row.replaceChildren(thumbnail, details, button, deleteBtn);
            list.append(row);
        });
    }, (error) => setCardTemplateMessage(`Template gagal dimuat: ${error.message}`, "error"));
}

function openDeleteTemplateModal(templateId) {
    document.getElementById("deleteConfirmMessage").textContent = "Yakin ingin menghapus template ini?";
    document.getElementById("deleteConfirmModal").classList.remove("hidden");
    document.getElementById("deleteConfirmModal").onclick = (event) => {
        if (event.target.id === "deleteConfirmModal") {
            document.getElementById("deleteConfirmModal").classList.add("hidden");
        }
    };
    document.getElementById("btnConfirmDelete").onclick = () => confirmDeleteTemplate(templateId);
}

async function confirmDeleteTemplate(templateId) {
    try {
        await deleteDoc(doc(db, "cardTemplates", templateId));
        setCardTemplateMessage("Template berhasil dihapus.");
        showCardTemplateNotification("Template berhasil dihapus.");
        document.getElementById("deleteConfirmModal").classList.add("hidden");
    } catch (error) {
        setCardTemplateMessage(`Template gagal dihapus: ${error.message}`, "error");
        showCardTemplateNotification(`Template gagal dihapus: ${error.message}`, "error");
        document.getElementById("deleteConfirmModal").classList.add("hidden");
    }
}

function openDeleteUserModal(userId) {
    document.getElementById("deleteConfirmMessage").textContent = "Yakin ingin menghapus user ini?";
    document.getElementById("deleteConfirmModal").classList.remove("hidden");
    document.getElementById("deleteConfirmModal").onclick = (event) => {
        if (event.target.id === "deleteConfirmModal") {
            document.getElementById("deleteConfirmModal").classList.add("hidden");
        }
    };
    document.getElementById("btnConfirmDelete").onclick = () => confirmDeleteUser(userId);
}

async function confirmDeleteUser(userId) {
    try {
        await deleteDoc(doc(db, "users", userId));
        showAdminMessage("User berhasil dihapus.");
        document.getElementById("deleteConfirmModal").classList.add("hidden");
        location.reload();
    } catch (error) {
        showAdminMessage(`User gagal dihapus: ${error.message}`, "error");
        showCardTemplateNotification(`User gagal dihapus: ${error.message}`, "error");
        document.getElementById("deleteConfirmModal").classList.add("hidden");
    }
}

async function saveCardTemplate() {
    readCardDraftForm();
    try {
        if (cardTemplateDraft.active) {
            const snapshot = await getDocs(collection(db, "cardTemplates"));
            await Promise.all(snapshot.docs.filter((item) => item.id !== cardTemplateDraft.id).map((item) => updateDoc(item.ref, { active: false })));
        }
        const { id, ...templateData } = cardTemplateDraft;
        if (id) await updateDoc(doc(db, "cardTemplates", id), { ...templateData, updatedAt: serverTimestamp() });
        else {
            const templateRef = await addDoc(collection(db, "cardTemplates"), { ...templateData, createdAt: serverTimestamp() });
            cardTemplateDraft.id = templateRef.id;
        }
        setCardTemplateMessage("Template berhasil disimpan.");
        showCardTemplateNotification("Template kartu berhasil disimpan dan siap digunakan.");
    } catch (error) {
        setCardTemplateMessage(`Template gagal disimpan: ${error.message}`, "error");
        showCardTemplateNotification(`Template gagal disimpan: ${error.message}`, "error");
    }
}

function timestampDate(value) {
    return value?.toDate ? value.toDate() : value instanceof Date ? value : null;
}

function formatAnalyticsCurrency(value) {
    return `Rp ${(Number(value) || 0).toLocaleString("id-ID")}`;
}

function getAnalyticsRange() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const period = document.getElementById("analyticsPeriod")?.value || "today";
    let start = new Date(today);
    if (period === "7d") start.setDate(start.getDate() - 6);
    if (period === "30d") start.setDate(start.getDate() - 29);
    if (period === "custom") {
        const value = document.getElementById("analyticsStart")?.value;
        if (value) start = new Date(`${value}T00:00:00`);
    }
    let end = now;
    if (period === "custom") {
        const value = document.getElementById("analyticsEnd")?.value;
        if (value) end = new Date(`${value}T23:59:59`);
    }
    return { start, end, period };
}

function analyticsMemberFilter() {
    const rawValue = document.getElementById("analyticsMember")?.value.trim() || "";
    if (!rawValue) return "";
    const normalizedValue = rawValue.toUpperCase();
    if (memberDirectory.some((member) => member.memberId === normalizedValue)) return normalizedValue;
    const matchingMembers = memberDirectory.filter((member) => member.fullName.toLowerCase().includes(rawValue.toLowerCase()));
    return matchingMembers.length === 1 ? matchingMembers[0].memberId : "__NO_MEMBER_MATCH__";
}

function filteredAnalyticsData() {
    const { start, end } = getAnalyticsRange();
    const memberFilter = analyticsMemberFilter();
    const inRange = (item) => {
        const date = timestampDate(item.createdAt || item.scannedAt);
        return date && date >= start && date <= end && (!memberFilter || item.memberId === memberFilter);
    };
    return {
        purchases: analyticsTransactions.filter((item) => inRange(item) && item.transactionType !== "redeem" && Number(item.totalPrice) > 0),
        scans: analyticsScans.filter(inRange)
    };
}

function chartBaseOptions() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { labels: { color: "#cbd5e1", usePointStyle: true } } },
        scales: {
            x: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(148,163,184,.08)" } },
            y: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(148,163,184,.08)" } }
        }
    };
}

function destroyAnalyticsCharts() {
    Object.values(analyticsCharts).forEach((chart) => chart?.destroy());
    analyticsCharts = {};
}

function renderAnalytics() {
    if (!window.Chart || !document.getElementById("analyticsTrendChart")) return;
    const { start, end, period } = getAnalyticsRange();
    const { purchases, scans } = filteredAnalyticsData();
    const revenue = purchases.reduce((sum, item) => sum + Number(item.totalPrice || 0), 0);
    const memberPurchases = purchases.filter((item) => Boolean(item.memberId));
    const guestPurchases = purchases.filter((item) => !item.memberId);
    const memberRevenue = memberPurchases.reduce((sum, item) => sum + Number(item.totalPrice || 0), 0);
    const guestRevenue = guestPurchases.reduce((sum, item) => sum + Number(item.totalPrice || 0), 0);
    const totalPurchaseCount = purchases.length || 1;
    const memberTransactionShare = (memberPurchases.length / totalPurchaseCount) * 100;
    const guestTransactionShare = (guestPurchases.length / totalPurchaseCount) * 100;
    const totalRevenue = memberRevenue + guestRevenue || 1;
    const memberRevenueShare = (memberRevenue / totalRevenue) * 100;
    const guestRevenueShare = (guestRevenue / totalRevenue) * 100;
    const buyerIds = new Set(purchases.map((item) => item.memberId).filter(Boolean));
    const visitorIds = new Set(scans.map((item) => item.memberId).filter(Boolean));
    document.getElementById("analyticsRevenue").textContent = formatAnalyticsCurrency(revenue);
    document.getElementById("analyticsScans").textContent = String(scans.length);
    document.getElementById("analyticsUnique").textContent = String(visitorIds.size);
    document.getElementById("analyticsAverage").textContent = formatAnalyticsCurrency(buyerIds.size ? revenue / buyerIds.size : 0);
    document.getElementById("analyticsMemberShare").textContent = `${memberTransactionShare.toFixed(1)}% · ${memberPurchases.length} transaksi`;
    document.getElementById("analyticsMemberRevenueShare").textContent = `${memberRevenueShare.toFixed(1)}% pendapatan · ${formatAnalyticsCurrency(memberRevenue)}`;
    document.getElementById("analyticsGuestShare").textContent = `${guestTransactionShare.toFixed(1)}% · ${guestPurchases.length} transaksi`;
    document.getElementById("analyticsGuestRevenueShare").textContent = `${guestRevenueShare.toFixed(1)}% pendapatan · ${formatAnalyticsCurrency(guestRevenue)}`;

    const isToday = period === "today";
    const bucketCount = isToday ? 24 : Math.max(1, Math.ceil((end - start) / 86400000) + 1);
    const labels = Array.from({ length: bucketCount }, (_, index) => {
        const date = new Date(start);
        if (isToday) date.setHours(index, 0, 0, 0);
        else date.setDate(start.getDate() + index);
        return isToday ? `${String(index).padStart(2, "0")}:00` : date.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
    });
    const revenueBuckets = Array(bucketCount).fill(0);
    const scanBuckets = Array(bucketCount).fill(0);
    const getBucket = (date) => isToday ? date.getHours() : Math.floor((new Date(date.getFullYear(), date.getMonth(), date.getDate()) - start) / 86400000);
    purchases.forEach((item) => { const index = getBucket(timestampDate(item.createdAt)); if (index >= 0 && index < bucketCount) revenueBuckets[index] += Number(item.totalPrice || 0); });
    scans.forEach((item) => { const index = getBucket(timestampDate(item.scannedAt)); if (index >= 0 && index < bucketCount) scanBuckets[index] += 1; });
    document.getElementById("analyticsTrendHint").textContent = isToday ? "Per jam" : "Per hari";

    const visitsByMember = new Map();
    scans.forEach((item) => visitsByMember.set(item.memberId, (visitsByMember.get(item.memberId) || 0) + 1));
    const memberNames = new Map(memberDirectory.map((member) => [member.memberId, member.fullName]));
    const frequencyEntries = [...visitsByMember.entries()]
        .sort((first, second) => second[1] - first[1])
        .map(([memberId, count]) => ({ memberId, name: memberNames.get(memberId) || memberId, count }));
    const contribution = new Map();
    purchases.forEach((item) => {
        const current = contribution.get(item.memberId) || { scans: 0, revenue: 0 };
        current.revenue += Number(item.totalPrice || 0);
        contribution.set(item.memberId, current);
    });
    scans.forEach((item) => {
        const current = contribution.get(item.memberId) || { scans: 0, revenue: 0 };
        current.scans += 1;
        contribution.set(item.memberId, current);
    });
    const points = [...contribution.entries()].map(([memberId, data]) => ({ x: data.scans, y: data.revenue, memberId }));
    destroyAnalyticsCharts();
    analyticsCharts.trend = new Chart(document.getElementById("analyticsTrendChart"), { type: "line", data: { labels, datasets: [{ label: "Pendapatan", data: revenueBuckets, borderColor: "#34d399", backgroundColor: "rgba(52,211,153,.15)", fill: true, tension: .35, yAxisID: "revenue" }, { label: "Scan", data: scanBuckets, borderColor: "#38bdf8", backgroundColor: "transparent", tension: .35, yAxisID: "scans" }] }, options: { ...chartBaseOptions(), scales: { ...chartBaseOptions().scales, revenue: { position: "left", ticks: { color: "#94a3b8", callback: (value) => formatAnalyticsCurrency(value) }, grid: { color: "rgba(148,163,184,.08)" } }, scans: { position: "right", ticks: { color: "#94a3b8" }, grid: { drawOnChartArea: false } } } } });
    analyticsCharts.frequency = new Chart(document.getElementById("analyticsFrequencyChart"), { type: "bar", data: { labels: frequencyEntries.map((entry) => entry.name), datasets: [{ label: "Jumlah kunjungan", data: frequencyEntries.map((entry) => entry.count), backgroundColor: "#38bdf8", borderRadius: 6 }] }, options: { ...chartBaseOptions(), indexAxis: "y", plugins: { ...chartBaseOptions().plugins, tooltip: { callbacks: { label: (context) => `${context.raw} kali scan` } } }, scales: { ...chartBaseOptions().scales, x: { ...chartBaseOptions().scales.x, beginAtZero: true, ticks: { color: "#94a3b8", precision: 0 } }, y: { ...chartBaseOptions().scales.y, ticks: { color: "#cbd5e1" } } } } });
    analyticsCharts.loyalty = new Chart(document.getElementById("analyticsLoyaltyChart"), { type: "scatter", data: { datasets: [{ label: "Member", data: points, backgroundColor: "#fbbf24", borderColor: "#fef3c7", pointRadius: 6, pointHoverRadius: 9 }] }, options: { ...chartBaseOptions(), plugins: { ...chartBaseOptions().plugins, tooltip: { callbacks: { label: (context) => `${context.raw.memberId}: ${context.raw.x} scan · ${formatAnalyticsCurrency(context.raw.y)}` } } }, scales: { ...chartBaseOptions().scales, x: { ...chartBaseOptions().scales.x, title: { display: true, text: "Jumlah scan", color: "#94a3b8" }, beginAtZero: true }, y: { ...chartBaseOptions().scales.y, title: { display: true, text: "Pendapatan", color: "#94a3b8" }, beginAtZero: true } } } });
    updateRevenueDelta(revenue, start, end, memberFilter);
}

function updateRevenueDelta(revenue, start, end, memberFilter) {
    const duration = end - start;
    const previousStart = new Date(start.getTime() - duration - 86400000);
    const previousEnd = new Date(start.getTime() - 86400000);
    const previousRevenue = analyticsTransactions.filter((item) => {
        const date = timestampDate(item.createdAt);
        return date && date >= previousStart && date <= previousEnd && item.transactionType !== "redeem" && Number(item.totalPrice) > 0 && (!memberFilter || item.memberId === memberFilter);
    }).reduce((sum, item) => sum + Number(item.totalPrice || 0), 0);
    const element = document.getElementById("analyticsRevenueDelta");
    if (!previousRevenue) { element.textContent = "Belum ada pembanding"; return; }
    const change = ((revenue - previousRevenue) / previousRevenue) * 100;
    element.textContent = `${change >= 0 ? "Naik" : "Turun"} ${Math.abs(change).toFixed(1)}% dibanding periode sebelumnya`;
    element.className = `mt-2 text-xs ${change >= 0 ? "text-emerald-300" : "text-rose-300"}`;
}

function subscribeToAnalytics() {
    stopAnalyticsTransactions = onSnapshot(collection(db, "transactions"), (snapshot) => {
        analyticsTransactions = snapshot.docs.map((item) => item.data());
        renderGuestHistory();
        renderAnalytics();
    }, (error) => showAdminMessage(`Analitik transaksi gagal dimuat: ${error.message}`, "error"));
    stopAnalyticsScans = onSnapshot(collection(db, "scanEvents"), (snapshot) => {
        analyticsScans = snapshot.docs.map((item) => item.data());
        renderAnalytics();
    }, (error) => showAdminMessage(`Analitik scan gagal dimuat: ${error.message}`, "error"));
}

function showAdminMessage(message, type = "info") {
    const element = document.getElementById("adminMessage");
    if (!element) return;
    element.textContent = message;
    element.className = `text-sm ${type === "error" ? "text-rose-300" : "text-emerald-300"}`;
}

function showPOSActionStatus(message, type = "success") {
    const element = document.getElementById("posActionStatus");
    element.className = "hidden";
    element.textContent = message;
    const modal = document.getElementById("posNotificationModal");
    const icon = document.getElementById("posNotificationIcon");
    document.getElementById("posNotificationTitle").textContent = type === "error" ? "Transaksi Gagal" : "Transaksi Berhasil";
    document.getElementById("posNotificationMessage").textContent = message;
    icon.className = `mx-auto flex h-14 w-14 items-center justify-center rounded-full text-2xl ${type === "error" ? "bg-rose-500/15 text-rose-300" : "bg-emerald-500/15 text-emerald-300"}`;
    icon.innerHTML = type === "error" ? '<i class="fa-solid fa-circle-exclamation"></i>' : '<i class="fa-solid fa-circle-check"></i>';
    modal.classList.remove("hidden");
}

function updateSaleSummary(selectId, qtyId, paidId, totalId, changeId) {
    const option = document.getElementById(selectId).selectedOptions[0];
    const quantity = Number(document.getElementById(qtyId).value) || 0;
    const total = Number(option?.dataset.price || 0) * quantity;
    const paid = Number(document.getElementById(paidId).value) || 0;
    const change = paid - total;
    document.getElementById(totalId).textContent = formatCurrency(total);
    document.getElementById(changeId).textContent = change < 0 ? `- ${formatCurrency(Math.abs(change))}` : formatCurrency(change);
    document.getElementById(changeId).className = change < 0 ? "text-rose-300" : "text-emerald-300";
    return { total, paid };
}

function renderGuestHistory() {
    const container = document.getElementById("posGuestHistory");
    if (!container) return;
    const purchases = analyticsTransactions
        .filter((item) => item.customerType === "guest")
        .sort((first, second) => (timestampDate(second.createdAt)?.getTime() || 0) - (timestampDate(first.createdAt)?.getTime() || 0))
        .slice(0, 20);
    container.replaceChildren();
    if (!purchases.length) {
        container.textContent = "Belum ada pembelian.";
        return;
    }
    purchases.forEach((purchase) => {
        const row = document.createElement("div");
        row.className = "rounded-lg border border-slate-800 bg-slate-950/50 p-3";
        const date = timestampDate(purchase.createdAt);
        row.textContent = `${date ? date.toLocaleString("id-ID") : "Baru saja"} · ${purchase.productName} · Total ${formatCurrency(purchase.totalPrice)}`;
        container.append(row);
    });
}

function openPOSMode(mode) {
    document.getElementById("posModeChooser").classList.add("hidden");
    document.getElementById("posPurchaseViews").classList.remove("hidden");
    document.getElementById("posPurchaseViews").dataset.mode = mode;
    const guest = mode === "guest";
    document.getElementById("posGuestView").classList.toggle("hidden", !guest);
    document.getElementById("posGuestHistoryView").classList.toggle("hidden", !guest);
    document.getElementById("posMemberView").classList.toggle("hidden", guest);
    document.getElementById("posMemberDetailsView").classList.toggle("hidden", guest);
}

function closePOSMode() {
    void stopMemberScanner();
    document.getElementById("posNotificationModal").classList.add("hidden");
    document.getElementById("posModeChooser").classList.remove("hidden");
    document.getElementById("posPurchaseViews").classList.add("hidden");
    document.getElementById("posGuestView").classList.add("hidden");
    document.getElementById("posGuestHistoryView").classList.add("hidden");
    document.getElementById("posMemberView").classList.add("hidden");
    document.getElementById("posMemberDetailsView").classList.add("hidden");
}

function updateRedeemStatus() {
    const status = document.getElementById("posRedeemStatus");
    const select = document.getElementById("posRedeemProduct");
    const option = select.options[select.selectedIndex];
    const cost = Number(option?.dataset.redeemPoints);
    const points = Number(currentMemberDetails?.points || 0);
    status.className = "rounded-lg border px-3 py-2 text-center text-sm";
    if (!currentMemberDetails) {
        status.classList.add("border-slate-700", "bg-slate-800/50", "text-slate-400");
        status.textContent = "Pilih member dan hadiah redeem untuk melihat status.";
    } else if (!cost) {
        status.classList.add("border-slate-700", "bg-slate-800/50", "text-slate-400");
        status.textContent = "Pilih hadiah redeem untuk melihat kecukupan poin.";
    } else if (points < cost) {
        status.classList.add("border-rose-500/30", "bg-rose-500/10", "text-rose-300");
        status.textContent = `Poin tidak cukup. Butuh ${cost} poin, saldo hanya ${points} poin.`;
    } else {
        status.classList.add("border-emerald-500/30", "bg-emerald-500/10", "text-emerald-300");
        status.textContent = `Poin cukup. Saldo setelah redeem: ${points - cost} poin.`;
    }
}

function clearMemberDetails(message = "Belum ada member") {
    currentMemberDetails = null;
    document.getElementById("posMemberName").textContent = message;
    document.getElementById("posMemberCode").textContent = "-";
    document.getElementById("posMemberPoints").textContent = "-";
    document.getElementById("posMemberScansToday").textContent = "0 kali";
    updateRedeemStatus();
}

async function loadMemberDetails(memberId) {
    const normalizedId = memberId.trim().toUpperCase();
    if (!/^MB-\d{6}$/.test(normalizedId)) {
        clearMemberDetails(normalizedId ? "ID tidak valid" : "Belum ada member");
        return;
    }
    const [snapshot, scanSnapshot] = await Promise.all([
        getDocs(query(collection(db, "users"), where("memberId", "==", normalizedId))),
        getDocs(query(collection(db, "scanEvents"), where("memberId", "==", normalizedId)))
    ]);
    if (snapshot.empty) {
        clearMemberDetails("Member tidak ditemukan");
        return;
    }
    const profile = snapshot.docs[0].data();
    currentMemberDetails = { ...profile, ref: snapshot.docs[0].ref };
    document.getElementById("posMemberName").textContent = profile.fullName || "Member";
    document.getElementById("posMemberCode").textContent = profile.memberId || normalizedId;
    document.getElementById("posMemberPoints").textContent = `${Number(profile.points || 0)} poin`;
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const scansToday = scanSnapshot.docs.filter((scanDoc) => {
        const date = timestampDate(scanDoc.data().scannedAt);
        return date && date >= startOfDay;
    }).length;
    document.getElementById("posMemberScansToday").textContent = `${scansToday} kali`;
    updateRedeemStatus();
}

async function stopMemberScanner() {
    if (!memberScanner) return;
    const scanner = memberScanner;
    memberScanner = null;
    try {
        await scanner.stop();
        await scanner.clear();
    } catch (error) {
        console.debug("Scanner dihentikan:", error.message);
    }
    document.getElementById("memberScannerPanel").classList.add("hidden");
}

async function startMemberScanner() {
    if (!window.Html5Qrcode) {
        showAdminMessage("Scanner QR belum tersedia. Periksa koneksi internet.", "error");
        return;
    }
    if (memberScanner) return;

    const panel = document.getElementById("memberScannerPanel");
    panel.classList.remove("hidden");
    memberScanner = new window.Html5Qrcode("memberScanner");
    try {
        await memberScanner.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.777778 },
            async (decodedText) => {
                const memberId = decodedText.trim().toUpperCase();
                if (!/^MB-\d{6}$/.test(memberId)) {
                    showAdminMessage("QR bukan QR member yang valid.", "error");
                    return;
                }
                const now = Date.now();
                if (lastScanKey === memberId && now - lastScanAt < 3000) return;
                lastScanKey = memberId;
                lastScanAt = now;
                document.getElementById("posMemberId").value = memberId;
                void loadMemberDetails(memberId);
                try {
                    await addDoc(collection(db, "scanEvents"), {
                        memberId,
                        scannedAt: serverTimestamp(),
                        source: "admin-qr"
                    });
                } catch (error) {
                    showAdminMessage(`Scan berhasil, tetapi log scan gagal: ${error.message}`, "error");
                }
                showAdminMessage(`Member ${memberId} berhasil dipindai.`);
                void stopMemberScanner();
            },
            () => {}
        );
    } catch (error) {
        await stopMemberScanner();
        showAdminMessage(`Kamera tidak dapat dibuka: ${error.message}`, "error");
    }
}

function subscribeToProducts() {
    return onSnapshot(collection(db, "products"), (snapshot) => {
        const tbody = document.getElementById("tblProducts");
        const guestSelect = document.getElementById("posGuestProduct");
        const select = document.getElementById("posSelectProduct");
        const redeemSelect = document.getElementById("posRedeemProduct");
        tbody.replaceChildren();
        guestSelect.innerHTML = '<option value="">-- Pilih Barang --</option>';
        select.innerHTML = '<option value="">-- Pilih Barang --</option>';
        redeemSelect.innerHTML = '<option value="">-- Pilih Hadiah Redeem --</option>';
        snapshot.docs.forEach((productDoc) => {
            const product = productDoc.data();
            productCache.set(productDoc.id, product);
            const row = document.createElement("tr");
            row.className = "hover:bg-slate-800/30";
            row.innerHTML = `<td class="p-3 font-semibold text-white">${escapeHtml(product.name)}</td>
                <td class="p-3 text-slate-300">${formatCurrency(product.price)}</td>
                <td class="p-3 text-emerald-400 font-bold">+${product.points || 0} Poin</td>
                <td class="p-3 text-sky-300 font-bold">${product.redeemPoints ? `${product.redeemPoints} Poin` : "-"}</td>
                <td class="p-3 text-center"><button type="button" data-edit-product="${productDoc.id}" class="rounded-md border border-slate-700 px-2.5 py-1 text-xs text-emerald-300 hover:bg-emerald-500/20">Edit</button></td>`;
            tbody.append(row);
            const option = document.createElement("option");
            option.value = productDoc.id;
            option.textContent = `${product.name} - ${formatCurrency(product.price)} (+${product.points || 0} Poin)`;
            option.dataset.name = product.name;
            option.dataset.price = String(product.price || 0);
            option.dataset.points = String(product.points || 0);
            select.append(option);
            const guestOption = option.cloneNode(true);
            guestSelect.append(guestOption);
            if (Number(product.redeemPoints) > 0) {
                const redeemOption = document.createElement("option");
                redeemOption.value = productDoc.id;
                redeemOption.textContent = `${product.name} - ${product.redeemPoints} Poin`;
                redeemOption.dataset.name = product.name;
                redeemOption.dataset.redeemPoints = String(product.redeemPoints);
                redeemSelect.append(redeemOption);
            }
        });
    }, (error) => showAdminMessage(`Produk gagal dimuat: ${error.message}`, "error"));
}

function subscribeToUsers() {
    return onSnapshot(collection(db, "users"), (snapshot) => {
        const tbody = document.getElementById("tblUsers");
        const memberOptions = document.getElementById("analyticsMemberOptions");
        memberDirectory = snapshot.docs
            .map((userDoc) => userDoc.data())
            .filter((user) => user.role === "member" && user.memberId && user.fullName)
            .map((user) => ({ memberId: user.memberId.toUpperCase(), fullName: user.fullName }));
        memberCache.clear();
        snapshot.docs.forEach((userDoc) => memberCache.set(userDoc.id, userDoc.data()));
        memberOptions.replaceChildren();
        memberDirectory
            .sort((first, second) => first.fullName.localeCompare(second.fullName, "id"))
            .forEach((member) => {
                const option = document.createElement("option");
                option.value = member.memberId;
                option.label = `${member.fullName} - ${member.memberId}`;
                memberOptions.append(option);
            });
        tbody.replaceChildren();
        snapshot.docs.forEach((userDoc) => {
            const user = userDoc.data();
            const row = document.createElement("tr");
            row.className = "hover:bg-slate-800/30";
            row.innerHTML = `<td class="p-3 font-mono font-bold text-emerald-400">${escapeHtml(user.memberId || "-")}</td>
                <td class="p-3 text-white font-medium">${escapeHtml(user.fullName || "-")}</td>
                <td class="p-3 text-slate-400">${escapeHtml(user.email || "-")}</td>
                <td class="p-3 uppercase text-xs font-bold text-slate-300">${escapeHtml(user.role || "member")}</td>
                <td class="p-3 text-emerald-400 font-bold">${user.points || 0} Poin</td>
                <td class="p-3 text-center"><button type="button" data-edit-member="${userDoc.id}" class="rounded-md border border-slate-700 px-2.5 py-1 text-xs text-emerald-300 hover:bg-emerald-500/20">Edit</button></td><td class="p-3 text-center"><button type="button" data-delete-member="${userDoc.id}" class="rounded-md border border-rose-700 px-2.5 py-1 text-xs text-rose-300 hover:bg-rose-500/20">Hapus</button></td>`;
            tbody.append(row);
        });
    }, (error) => showAdminMessage(`User gagal dimuat: ${error.message}`, "error"));
}

function setEditProductMessage(message, type = "info") {
    const element = document.getElementById("editProductMessage");
    element.textContent = message;
    element.className = `min-h-5 text-center text-sm ${type === "error" ? "text-rose-300" : "text-emerald-300"}`;
}

function closeEditProductModal() {
    document.getElementById("editProductModal").classList.add("hidden");
    document.getElementById("formEditProduct").reset();
    setEditProductMessage("");
}

function openEditProductModal(productId) {
    const product = productCache.get(productId);
    if (!product) return;
    document.getElementById("editProductId").value = productId;
    document.getElementById("editProdName").value = product.name || "";
    document.getElementById("editProdPrice").value = product.price || 0;
    document.getElementById("editProdPoints").value = product.points || 0;
    document.getElementById("editProdRedeemPoints").value = product.redeemPoints || 0;
    document.getElementById("editProductModal").classList.remove("hidden");
}

function closeMemberModal() {
    document.getElementById("memberModal").classList.add("hidden");
    document.getElementById("formMember").reset();
    document.getElementById("memberDocId").value = "";
    document.getElementById("memberModalTitle").textContent = "Tambah Member";
    document.getElementById("memberFormMessage").textContent = "";
}

function openMemberModal(memberDocId = "") {
    const member = memberCache.get(memberDocId);
    document.getElementById("memberDocId").value = memberDocId;
    document.getElementById("memberModalTitle").textContent = member ? "Edit Member" : "Tambah Member";
    document.getElementById("memberFullName").value = member?.fullName || "";
    document.getElementById("memberEmail").value = member?.email || "";
    document.getElementById("memberPassword").value = "";
    document.getElementById("memberPassword").required = !member;
    document.getElementById("memberPasswordHint").textContent = member ? "(opsional, kirim link reset)" : "(minimal 6 karakter)";
    document.getElementById("memberModal").classList.remove("hidden");
}

function bindAdminEvents() {
    document.getElementById("btnAdminTabPOS").onclick = () => setActiveTab("POS");
    document.getElementById("btnAdminTabAnalytics").onclick = () => setActiveTab("Analytics");
    document.getElementById("btnAdminTabCard").onclick = () => setActiveTab("Card");
    document.getElementById("btnAdminTabProducts").onclick = () => setActiveTab("Products");
    document.getElementById("btnAdminTabUsers").onclick = () => setActiveTab("Users");
    ["cardTemplateName", "cardBackgroundUrl", "cardBackgroundColor", "cardTextColor", "cardTextSize", "cardQrSize", "cardTemplateActive"].forEach((id) => {
        document.getElementById(id).addEventListener("input", readCardDraftForm);
    });
    document.getElementById("btnSaveCardTemplate").onclick = saveCardTemplate;
    document.getElementById("btnClearCardBackground").onclick = clearCardBackground;
    document.getElementById("cardBackgroundFile").addEventListener("change", readCardBackgroundFile);
    makeDraggable(document.getElementById("editorCardId"), "idPosition");
    makeDraggable(document.getElementById("editorCardName"), "namePosition");
    makeDraggable(document.getElementById("editorCardQr"), "qrPosition");
    if (!cardEditorResizeBound) {
        window.addEventListener("resize", renderCardEditor);
        cardEditorResizeBound = true;
    }
    renderCardEditor();
    document.getElementById("btnOpenGuestPOS").onclick = () => openPOSMode("guest");
    document.getElementById("btnOpenMemberPOS").onclick = () => openPOSMode("member");
    document.querySelectorAll("[data-pos-back]").forEach((button) => { button.onclick = closePOSMode; });
    document.getElementById("btnClosePOSNotification").onclick = () => document.getElementById("posNotificationModal").classList.add("hidden");
    document.getElementById("posNotificationModal").onclick = (event) => {
        if (event.target.id === "posNotificationModal") event.currentTarget.classList.add("hidden");
    };
    document.getElementById("btnScanMember").onclick = startMemberScanner;
    document.getElementById("btnStopScanMember").onclick = () => void stopMemberScanner();
    document.getElementById("posMemberId").addEventListener("input", (event) => {
        clearTimeout(memberLookupTimer);
        memberLookupTimer = setTimeout(() => void loadMemberDetails(event.target.value), 350);
    });
    document.getElementById("posRedeemProduct").addEventListener("change", updateRedeemStatus);
    [
        ["posGuestProduct", "posGuestQty", "posGuestPaid", "posGuestTotal", "posGuestChange"],
        ["posSelectProduct", "posQty", "posMemberPaid", "posMemberTotal", "posMemberChange"]
    ].forEach(([selectId, qtyId, paidId, totalId, changeId]) => {
        [selectId, qtyId, paidId].forEach((id) => document.getElementById(id).addEventListener("input", () => updateSaleSummary(selectId, qtyId, paidId, totalId, changeId)));
        document.getElementById(selectId).addEventListener("change", () => updateSaleSummary(selectId, qtyId, paidId, totalId, changeId));
    });
    document.getElementById("analyticsPeriod").addEventListener("change", renderAnalytics);
    document.getElementById("analyticsStart").addEventListener("change", renderAnalytics);
    document.getElementById("analyticsEnd").addEventListener("change", renderAnalytics);
    document.getElementById("analyticsMember").addEventListener("input", renderAnalytics);
    document.getElementById("tblProducts").onclick = (event) => {
        const button = event.target.closest("[data-edit-product]");
        if (button) openEditProductModal(button.dataset.editProduct);
    };
    document.getElementById("btnAddMember").onclick = () => openMemberModal();
    document.getElementById("btnCloseMemberModal").onclick = closeMemberModal;
    document.getElementById("memberModal").onclick = (event) => {
        if (event.target.id === "memberModal") closeMemberModal();
    };
    document.getElementById("tblUsers").onclick = (event) => {
        const button = event.target.closest("[data-edit-member]");
        if (button) openMemberModal(button.dataset.editMember);
        const deleteBtn = event.target.closest("[data-delete-member]");
        if (deleteBtn) openDeleteUserModal(deleteBtn.dataset.deleteMember);
    };
    document.getElementById("formMember").onsubmit = async (event) => {
        event.preventDefault();
        const memberDocId = document.getElementById("memberDocId").value;
        const fullName = document.getElementById("memberFullName").value.trim();
        const email = document.getElementById("memberEmail").value.trim();
        const password = document.getElementById("memberPassword").value;
        const existingMember = memberCache.get(memberDocId);
        const message = document.getElementById("memberFormMessage");
        if (!fullName || !email || (!memberDocId && password.length < 6) || (memberDocId && !existingMember?.memberId)) {
            message.textContent = "Nama, email, dan password minimal 6 karakter wajib diisi.";
            message.className = "min-h-5 text-center text-sm text-rose-300";
            return;
        }
        try {
            if (memberDocId) {
                await updateDoc(doc(db, "users", memberDocId), { fullName, email, role: "member" });
                if (password) await sendPasswordResetEmail(memberProvisioningAuth, email);
            } else {
                const credential = await createUserWithEmailAndPassword(memberProvisioningAuth, email, password);
                let generatedMemberId;
                do {
                    generatedMemberId = `MB-${Math.floor(100000 + Math.random() * 900000)}`;
                    const duplicate = await getDocs(query(collection(db, "users"), where("memberId", "==", generatedMemberId)));
                    if (duplicate.empty) break;
                } while (true);
                await addDoc(collection(db, "users"), { uid: credential.user.uid, fullName, email, memberId: generatedMemberId, points: 100, role: "member", tier: "SILVER", createdAt: serverTimestamp() });
                await signOut(memberProvisioningAuth);
            }
            closeMemberModal();
            showAdminMessage(memberDocId ? "Member berhasil diperbarui." : "Member berhasil ditambahkan dengan 100 poin.");
        } catch (error) {
            message.textContent = error.message;
            message.className = "min-h-5 text-center text-sm text-rose-300";
        }
    };
    document.getElementById("btnCloseEditProduct").onclick = closeEditProductModal;
    document.getElementById("btnCancelEditProduct").onclick = closeEditProductModal;
    document.getElementById("editProductModal").onclick = (event) => {
        if (event.target.id === "editProductModal") closeEditProductModal();
    };

    document.getElementById("formPOSGuestTransaction").onsubmit = async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const select = document.getElementById("posGuestProduct");
        const option = select.options[select.selectedIndex];
        const qty = Number(document.getElementById("posGuestQty").value);
        if (!option?.value || !Number.isInteger(qty) || qty < 1) return;
        const totalPrice = Number(option.dataset.price) * qty;
        const paid = Number(document.getElementById("posGuestPaid").value) || 0;
        if (paid < totalPrice) {
            showPOSActionStatus(`Uang kurang ${formatCurrency(totalPrice - paid)}.`, "error");
            return;
        }
        try {
            await addDoc(collection(db, "transactions"), {
                memberId: null,
                customerType: "guest",
                productName: option.dataset.name,
                qty,
                totalPrice,
                amountPaid: paid,
                changeAmount: paid - totalPrice,
                earnedPoints: 0,
                createdAt: serverTimestamp()
            });
            form.reset();
            showPOSActionStatus(`Pembelian umum berhasil. Total ${formatCurrency(totalPrice)}.`);
            showAdminMessage("Pembelian tanpa kartu berhasil disimpan.");
        } catch (error) {
            showPOSActionStatus(`Pembelian umum gagal: ${error.message}`, "error");
            showAdminMessage(`Pembelian gagal: ${error.message}`, "error");
        }
    };

    document.getElementById("formProduct").onsubmit = async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const name = document.getElementById("prodName").value.trim();
        const price = Number(document.getElementById("prodPrice").value);
        const points = Number(document.getElementById("prodPoints").value);
        const redeemPoints = Number(document.getElementById("prodRedeemPoints").value);
        if (!name || price < 0 || points < 0 || redeemPoints < 0) return;
        try {
            await addDoc(collection(db, "products"), { name, price, points, redeemPoints, createdAt: serverTimestamp() });
            form.reset();
            showAdminMessage("Barang berhasil disimpan.");
        } catch (error) {
            showAdminMessage(`Barang gagal disimpan: ${error.message}`, "error");
        }
    };

    document.getElementById("formEditProduct").onsubmit = async (event) => {
        event.preventDefault();
        const productId = document.getElementById("editProductId").value;
        const name = document.getElementById("editProdName").value.trim();
        const price = Number(document.getElementById("editProdPrice").value);
        const points = Number(document.getElementById("editProdPoints").value);
        const redeemPoints = Number(document.getElementById("editProdRedeemPoints").value);
        if (!productId || !name || price < 0 || points < 0 || redeemPoints < 0) return;
        try {
            await updateDoc(doc(db, "products", productId), { name, price, points, redeemPoints });
            closeEditProductModal();
            showAdminMessage("Menu berhasil diperbarui.");
        } catch (error) {
            setEditProductMessage(`Menu gagal diperbarui: ${error.message}`, "error");
        }
    };

    document.getElementById("formPOSTransaction").onsubmit = async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const memberId = document.getElementById("posMemberId").value.trim().toUpperCase();
        const select = document.getElementById("posSelectProduct");
        const option = select.options[select.selectedIndex];
        const qty = Number(document.getElementById("posQty").value);
        if (!memberId || !option?.value || !Number.isInteger(qty) || qty < 1) return;
        const totalPrice = Number(option.dataset.price) * qty;
        const paid = Number(document.getElementById("posMemberPaid").value) || 0;
        if (paid < totalPrice) {
            showPOSActionStatus(`Uang kurang ${formatCurrency(totalPrice - paid)}.`, "error");
            return;
        }
        const earnedPoints = Number(option.dataset.points) * qty;
        try {
            const userSnapshot = await getDocs(query(collection(db, "users"), where("memberId", "==", memberId)));
            if (userSnapshot.empty) {
                showPOSActionStatus("Pembelian gagal. Member ID tidak ditemukan.", "error");
                showAdminMessage("Member ID tidak ditemukan.", "error");
                return;
            }
            await updateDoc(userSnapshot.docs[0].ref, { points: increment(earnedPoints) });
            await addDoc(collection(db, "transactions"), {
                memberId,
                productName: option.dataset.name,
                qty,
                totalPrice,
                amountPaid: paid,
                changeAmount: paid - totalPrice,
                earnedPoints,
                createdAt: serverTimestamp()
            });
            form.reset();
            void loadMemberDetails(memberId);
            showPOSActionStatus(`Pembelian berhasil. Total ${formatCurrency(totalPrice)} menambah +${earnedPoints} poin.`);
            showAdminMessage(`Transaksi berhasil. Member mendapat +${earnedPoints} poin.`);
        } catch (error) {
            showPOSActionStatus(`Pembelian gagal: ${error.message}`, "error");
            showAdminMessage(`Transaksi gagal: ${error.message}`, "error");
        }
    };

    document.getElementById("formPOSRedeem").onsubmit = async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const memberId = document.getElementById("posMemberId").value.trim().toUpperCase();
        const select = document.getElementById("posRedeemProduct");
        const option = select.options[select.selectedIndex];
        const redeemPoints = Number(option?.dataset.redeemPoints);
        if (!memberId || !option?.value || !redeemPoints) {
            showPOSActionStatus("Redeem gagal. Scan member dan pilih hadiah terlebih dahulu.", "error");
            showAdminMessage("Scan atau isi ID member dan pilih hadiah redeem.", "error");
            return;
        }
        try {
            const userSnapshot = await getDocs(query(collection(db, "users"), where("memberId", "==", memberId)));
            if (userSnapshot.empty) {
                showAdminMessage("Member ID tidak ditemukan.", "error");
                return;
            }
            const userRef = userSnapshot.docs[0].ref;
            const transactionRef = doc(collection(db, "transactions"));
            await runTransaction(db, async (transaction) => {
                const userDoc = await transaction.get(userRef);
                const currentPoints = Number(userDoc.data()?.points || 0);
                if (currentPoints < redeemPoints) {
                    throw new Error(`Poin tidak cukup. Saldo member: ${currentPoints} poin.`);
                }
                transaction.update(userRef, { points: currentPoints - redeemPoints });
                transaction.set(transactionRef, {
                    memberId,
                    productName: option.dataset.name,
                    qty: 1,
                    totalPrice: 0,
                    earnedPoints: -redeemPoints,
                    transactionType: "redeem",
                    createdAt: serverTimestamp()
                });
            });
            form.reset();
            void loadMemberDetails(memberId);
            showPOSActionStatus(`Redeem berhasil. ${option.dataset.name} diberikan gratis dan ${redeemPoints} poin dipotong.`);
            showAdminMessage(`Redeem berhasil. ${option.dataset.name} diberikan gratis dan ${redeemPoints} poin dipotong.`);
        } catch (error) {
            showPOSActionStatus(`Redeem gagal: ${error.message}`, "error");
            showAdminMessage(`Redeem gagal: ${error.message}`, "error");
        }
    };
}

export function initAdminDashboard() {
    if (initialized) return;
    initialized = true;
    bindAdminEvents();
    setActiveTab("Analytics");
    const today = new Date().toISOString().slice(0, 10);
    document.getElementById("analyticsStart").value = today;
    document.getElementById("analyticsEnd").value = today;
    showAdminMessage("Admin dashboard siap. Selamat datang di SmartMember Pro.");
    subscribeToAnalytics();
    subscribeToCardTemplates();
    stopProducts = subscribeToProducts();
    stopUsers = subscribeToUsers();
}

export function stopAdminDashboard() {
    void stopMemberScanner();
    stopAnalyticsTransactions?.();
    stopAnalyticsScans?.();
    stopCardTemplates?.();
    stopAnalyticsTransactions = null;
    stopAnalyticsScans = null;
    stopCardTemplates = null;
    destroyAnalyticsCharts();
    stopProducts?.();
    stopUsers?.();
    stopProducts = null;
    stopUsers = null;
    initialized = false;
}
