import { db } from "./firebase-config.js";
import { 
    collection, 
    addDoc, 
    doc, 
    getDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const memberForm = document.getElementById("memberForm");
const cardSection = document.getElementById("cardSection");
const qrContainer = document.getElementById("qrcode");

// Fungsi Generate ID Member Unik
function generateMemberId() {
    const randomNum = Math.floor(100000 + Math.random() * 900000);
    return `MB-${randomNum}`;
}

// Handle Submit Form Simpan ke Firebase Firestore
memberForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const fullName = document.getElementById("fullName").value.trim();
    const email = document.getElementById("email").value.trim();
    const phone = document.getElementById("phone").value.trim();
    const memberId = generateMemberId();

    try {
        // 1. Simpan Data ke Koleksi 'members' di Firestore
        const docRef = await addDoc(collection(db, "members"), {
            memberId: memberId,
            fullName: fullName,
            email: email,
            phone: phone,
            points: 100, // Bonus poin registrasi awal
            tier: "SILVER",
            createdAt: serverTimestamp()
        });

        alert("Berhasil mendaftar! Member Card diterbitkan.");

        // 2. Tampilkan Kartu & QR Code
        renderMemberCard({
            memberId: memberId,
            fullName: fullName,
            points: 100,
            tier: "SILVER"
        });

        memberForm.reset();

    } catch (error) {
        console.error("Error menambah dokumen: ", error);
        alert("Gagal menyimpan data: " + error.message);
    }
});

// Fungsi untuk Memuat & Menampilkan Visual Member Card + QR Code
function renderMemberCard(data) {
    document.getElementById("cardMemberId").innerText = data.memberId;
    document.getElementById("cardName").innerText = data.fullName;
    document.getElementById("cardPoints").innerText = `${data.points} Poin`;
    document.getElementById("cardTier").innerText = data.tier;

    // Bersihkan QR Code lama jika ada
    qrContainer.innerHTML = "";

    // Generate QR Code Baru berdasarkan ID Member
    new QRCode(qrContainer, {
        text: data.memberId,
        width: 140,
        height: 140,
        colorDark : "#06090e",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
    });

    // Tampilkan Section Kartu
    cardSection.classList.remove("hidden");
}