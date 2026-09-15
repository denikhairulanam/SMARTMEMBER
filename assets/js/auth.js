import { auth, db } from "./firebase-config.js";
import {
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { initMemberDashboard, stopMemberDashboard } from "./member.js";
import { initAdminDashboard, stopAdminDashboard } from "./admin.js";

const elements = {
    authContainer: document.getElementById("authContainer"),
    memberDashboard: document.getElementById("memberDashboard"),
    adminDashboard: document.getElementById("adminDashboard"),
    topNavbar: document.getElementById("topNavbar"),
    formLogin: document.getElementById("formLogin"),
    formRegister: document.getElementById("formRegister"),
    tabLogin: document.getElementById("tabLogin"),
    tabRegister: document.getElementById("tabRegister"),
    logout: document.getElementById("btnLogout"),
    navName: document.getElementById("navUserName"),
    navEmail: document.getElementById("navUserEmail"),
    roleBadge: document.getElementById("userRoleBadge")
};

let activeUser = null;

function setBusy(form, busy) {
    const submit = form.querySelector("button[type='submit']");
    if (!submit) return;
    submit.disabled = busy;
    submit.classList.toggle("opacity-60", busy);
    submit.setAttribute("aria-busy", String(busy));
}

function showMessage(message, type = "info") {
    const color = type === "error" ? "text-rose-300" : "text-emerald-300";
    let messageEl = document.getElementById("authMessage");
    if (!messageEl) {
        messageEl = document.createElement("p");
        messageEl.id = "authMessage";
        messageEl.className = "mt-4 text-center text-sm";
        elements.authContainer.append(messageEl);
    }
    messageEl.className = `mt-4 text-center text-sm ${color}`;
    messageEl.textContent = message;
}

function switchAuthTab(tab) {
    const login = tab === "login";
    elements.formLogin.classList.toggle("hidden", !login);
    elements.formRegister.classList.toggle("hidden", login);
    elements.tabLogin.className = login
        ? "flex-1 py-2 text-center font-bold text-emerald-400 border-b-2 border-emerald-400"
        : "flex-1 py-2 text-center font-bold text-slate-400 hover:text-white";
    elements.tabRegister.className = login
        ? "flex-1 py-2 text-center font-bold text-slate-400 hover:text-white"
        : "flex-1 py-2 text-center font-bold text-emerald-400 border-b-2 border-emerald-400";
}

function showDashboard(user, profile) {
    const role = profile.role === "admin" ? "admin" : "member";
    elements.authContainer.classList.add("hidden");
    elements.topNavbar.classList.remove("hidden");
    elements.memberDashboard.classList.toggle("hidden", role !== "member");
    elements.adminDashboard.classList.toggle("hidden", role !== "admin");
    elements.navName.textContent = profile.fullName || user.displayName || "Member";
    elements.navEmail.textContent = user.email || "";
    elements.roleBadge.textContent = role;

    if (role === "admin") {
        stopMemberDashboard();
        initAdminDashboard();
    } else {
        stopAdminDashboard();
        initMemberDashboard(user, profile);
    }
}

function clearDashboard() {
    stopMemberDashboard();
    stopAdminDashboard();
    elements.authContainer.classList.remove("hidden");
    elements.topNavbar.classList.add("hidden");
    elements.memberDashboard.classList.add("hidden");
    elements.adminDashboard.classList.add("hidden");
}

async function getOrCreateProfile(user, fullName = user.displayName || "Member") {
    const userRef = doc(db, "users", user.uid);
    const profileSnapshot = await getDoc(userRef);
    if (profileSnapshot.exists()) return profileSnapshot.data();

    const profile = {
        uid: user.uid,
        fullName,
        email: user.email || "",
        role: "member",
        memberId: `MB-${Math.floor(100000 + Math.random() * 900000)}`,
        points: 100,
        tier: "SILVER",
        createdAt: serverTimestamp()
    };
    await setDoc(userRef, profile);
    return profile;
}

elements.tabLogin.addEventListener("click", () => switchAuthTab("login"));
elements.tabRegister.addEventListener("click", () => switchAuthTab("register"));

elements.formLogin.addEventListener("submit", async (event) => {
    event.preventDefault();
    setBusy(elements.formLogin, true);
    try {
        await signInWithEmailAndPassword(
            auth,
            document.getElementById("loginEmail").value.trim(),
            document.getElementById("loginPassword").value
        );
        elements.formLogin.reset();
    } catch (error) {
        showMessage(error.message, "error");
    } finally {
        setBusy(elements.formLogin, false);
    }
});

elements.formRegister.addEventListener("submit", async (event) => {
    event.preventDefault();
    setBusy(elements.formRegister, true);
    try {
        const fullName = document.getElementById("regName").value.trim();
        const email = document.getElementById("regEmail").value.trim();
        const password = document.getElementById("regPassword").value;
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(credential.user, { displayName: fullName });
        await getOrCreateProfile(credential.user, fullName);
        elements.formRegister.reset();
    } catch (error) {
        showMessage(error.message, "error");
    } finally {
        setBusy(elements.formRegister, false);
    }
});

elements.logout.addEventListener("click", async () => {
    await signOut(auth);
});

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        activeUser = null;
        clearDashboard();
        return;
    }
    activeUser = user;
    try {
        const profile = await getOrCreateProfile(user);
        if (activeUser?.uid === user.uid) showDashboard(user, profile);
    } catch (error) {
        showMessage(`Profil gagal dimuat: ${error.message}`, "error");
        await signOut(auth);
    }
});
