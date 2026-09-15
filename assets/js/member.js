import { db } from "./firebase-config.js";
import {
    collection,
    doc,
    onSnapshot,
    query,
    where
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let stopTransactions = null;
let stopCardTemplate = null;
let currentMember = null;
let activeCardTemplate = null;
let cardResizeBound = false;

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
}[char]));

function formatDate(timestamp) {
    if (!timestamp?.toDate) return "Menunggu...";
    return timestamp.toDate().toLocaleDateString("id-ID", {
        day: "2-digit", month: "short", year: "numeric"
    });
}

function renderMemberCard(profile) {
    document.getElementById("cardMemberId").textContent = profile.memberId || "-";
    document.getElementById("cardName").textContent = profile.fullName || "Member";
    document.getElementById("cardPoints").textContent = `${profile.points || 0} Poin`;

    const qrContainer = document.getElementById("qrcode");
    qrContainer.replaceChildren();
    if (window.QRCode && profile.memberId) {
        new window.QRCode(qrContainer, {
            text: profile.memberId,
            width: 100,
            height: 100,
            colorDark: "#07111f",
            colorLight: "#ffffff",
            correctLevel: window.QRCode.CorrectLevel.H
        });
    }
    const qrImg = qrContainer.querySelector("img");
    if (qrImg) qrImg.style.backgroundColor = "#ffffff";

    applyCardTemplate(activeCardTemplate);
}

function applyCardTemplate(template) {
    if (!template) return;
    const card = document.getElementById("memberCardVisual");
    const id = document.getElementById("cardMemberId");
    const name = document.getElementById("cardName");
    const qr = document.getElementById("qrcode");
    const cardWidth = card.clientWidth || 380;
    const qrSize = Math.min(template.qrSize || 100, cardWidth * 0.22);
    const qrPercent = (qrSize / cardWidth) * 100;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    card.style.backgroundColor = template.backgroundColor || "#0f172a";
    card.style.backgroundImage = template.backgroundUrl ? `url("${template.backgroundUrl}")` : "";
    card.style.backgroundSize = "cover";
    card.style.backgroundPosition = "center";
    id.style.color = template.textColor || "";
    name.style.color = template.textColor || "";
    id.style.position = "absolute";
    name.style.position = "absolute";
    id.style.left = `${clamp(template.idPosition?.x ?? 8, 5, 72)}%`;
    id.style.top = `${template.idPosition?.y ?? 55}%`;
    name.style.left = `${clamp(template.namePosition?.x ?? 8, 5, 72)}%`;
    name.style.top = `${template.namePosition?.y ?? 68}%`;
    id.style.fontSize = `${Math.min(template.textSize || 14, cardWidth * 0.045)}px`;
    name.style.fontSize = `${Math.min(Math.max(10, (template.textSize || 14) + 4), cardWidth * 0.055)}px`;
    qr.style.position = "absolute";
    qr.style.left = `${clamp(template.qrPosition?.x ?? 75, 65, 94 - qrPercent)}%`;
    qr.style.top = `${template.qrPosition?.y ?? 28}%`;
    qr.style.right = "auto";
    qr.style.width = `${qrSize}px`;
    qr.style.height = `${qrSize}px`;
    qr.style.padding = "8px";
    qr.replaceChildren();
    if (window.QRCode && currentMember?.memberId) {
        new window.QRCode(qr, {
            text: currentMember.memberId,
            width: Math.max(20, qrSize - 16),
            height: Math.max(20, qrSize - 16),
            colorDark: "#07111f",
            colorLight: "#ffffff",
            correctLevel: window.QRCode.CorrectLevel.H
        });
    }
}

function subscribeToCardTemplate() {
    return onSnapshot(collection(db, "cardTemplates"), (snapshot) => {
        activeCardTemplate = snapshot.docs.map((item) => item.data()).find((template) => template.active) || null;
        const noTemplateMsg = document.getElementById("noTemplateMessage");
        if (!activeCardTemplate) {
            if (noTemplateMsg) noTemplateMsg.remove();
            const msg = document.createElement("div");
            msg.id = "noTemplateMessage";
            msg.className = "fixed inset-0 flex items-center justify-center bg-slate-950/90 backdrop-blur text-center z-50 text-slate-400";
            msg.textContent = "Belum ada template kartu. Silakan minta admin untuk membuat template.";
            document.body.appendChild(msg);
            document.getElementById("memberDashboard").classList.add("hidden");
        } else {
            if (noTemplateMsg) noTemplateMsg.remove();
            document.getElementById("memberDashboard").classList.remove("hidden");
            applyCardTemplate(activeCardTemplate);
        }
    }, (error) => console.error("Gagal memuat template kartu:", error));
}

function subscribeToProfile(userId) {
    return onSnapshot(
        doc(db, "users", userId),
        (profileSnapshot) => {
            if (profileSnapshot.exists()) {
                currentMember = { id: profileSnapshot.id, ...profileSnapshot.data() };
                renderMemberCard(currentMember);
            }
        },
        (error) => console.error("Gagal memantau profil member:", error)
    );
}

function subscribeToTransactions(memberId) {
    const transactionsQuery = query(
        collection(db, "transactions"),
        where("memberId", "==", memberId)
    );
    return onSnapshot(transactionsQuery, (snapshot) => {
        const tbody = document.getElementById("tblMemberTransactions");
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-500">Belum ada riwayat transaksi.</td></tr>';
            return;
        }
        tbody.innerHTML = [...snapshot.docs]
        .sort((a, b) => (b.data().createdAt?.seconds || 0) - (a.data().createdAt?.seconds || 0))
        .map((item) => {
            const transaction = item.data();
            return `<tr class="hover:bg-slate-800/30">
                <td class="p-3 text-slate-400">${formatDate(transaction.createdAt)}</td>
                <td class="p-3 text-white">${transaction.transactionType === "redeem" ? "Redeem: " : ""}${escapeHtml(transaction.productName)} <span class="text-slate-500">x${transaction.qty}</span></td>
                <td class="p-3">Rp ${(transaction.totalPrice || 0).toLocaleString("id-ID")}</td>
                <td class="p-3 font-bold ${transaction.earnedPoints < 0 ? "text-rose-300" : "text-emerald-400"}">${transaction.earnedPoints > 0 ? "+" : ""}${transaction.earnedPoints || 0}</td>
            </tr>`;
        }).join("");
    }, (error) => console.error("Gagal memuat transaksi:", error));
}

export function initMemberDashboard(user, profile) {
    stopMemberDashboard();
    currentMember = { id: user.uid, ...profile };
    renderMemberCard(currentMember);
    stopCardTemplate?.();
    stopCardTemplate = subscribeToCardTemplate();
    if (!cardResizeBound) {
        window.addEventListener("resize", () => applyCardTemplate(activeCardTemplate));
        cardResizeBound = true;
    }
    const profileStop = subscribeToProfile(user.uid);
    const transactionsStop = profile.memberId ? subscribeToTransactions(profile.memberId) : null;
    stopTransactions = () => {
        profileStop();
        transactionsStop?.();
        stopCardTemplate?.();
    };

    document.getElementById("btnDownloadCard").onclick = async () => {
        if (!window.html2canvas) return;
        const canvas = await window.html2canvas(document.getElementById("memberCardVisual"));
        const link = document.createElement("a");
        link.download = `${currentMember.memberId || "member-card"}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
    };
}

export function stopMemberDashboard() {
    stopTransactions?.();
    stopTransactions = null;
    stopCardTemplate?.();
    stopCardTemplate = null;
    currentMember = null;
    activeCardTemplate = null;
}
