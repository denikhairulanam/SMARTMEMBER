export async function loadComponent(path, targetElementId) {
    const response = await fetch(path);
    if (!response.ok) {
        throw new Error(`Komponen gagal dimuat (${response.status}): ${path}`);
    }
    const target = document.getElementById(targetElementId);
    if (!target) throw new Error(`Target komponen tidak ditemukan: #${targetElementId}`);
    target.insertAdjacentHTML("beforeend", await response.text());
}

window.loadComponent = loadComponent;

function initHomeQr() {
    const el = document.getElementById("homeQrPreview");
    if (!el || !window.QRCode) return;
    el.replaceChildren();
    new window.QRCode(el, { text: "MB-823419", width: 80, height: 80, colorDark: "#1C130E", colorLight: "#ffffff", correctLevel: window.QRCode.CorrectLevel.H });
}

function setActiveNav(which) {
    document.querySelectorAll(".nav-link").forEach((btn) => {
        const isActive = btn.dataset.nav === which;
        btn.classList.toggle("bg-[#1C130E]", isActive);
        btn.classList.toggle("text-[#FFF8EC]", isActive);
        if (!isActive) {
            btn.classList.remove("bg-[#1C130E]", "text-[#FFF8EC]");
        }
    });
}

function scrollToId(id) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function bindHomeNav() {
    const homePage = document.getElementById("homePage");
    const authContainer = document.getElementById("authContainer");
    const memberDashboard = document.getElementById("memberDashboard");
    const adminDashboard = document.getElementById("adminDashboard");

    function showHome() {
        if (adminDashboard && !adminDashboard.classList.contains("hidden")) return;
        if (memberDashboard && !memberDashboard.classList.contains("hidden")) return;
        if (homePage) homePage.classList.remove("hidden");
        if (authContainer) authContainer.classList.add("hidden");
        setActiveNav("home");
        window.scrollTo({ top: 0, behavior: "smooth" });
    }
    function showAuth() {
        if (adminDashboard && !adminDashboard.classList.contains("hidden")) return;
        if (memberDashboard && !memberDashboard.classList.contains("hidden")) return;
        if (homePage) homePage.classList.add("hidden");
        if (authContainer) {
            authContainer.classList.remove("hidden");
            authContainer.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        setActiveNav("auth");
    }
    function showMenu() {
        if (homePage) homePage.classList.remove("hidden");
        if (authContainer) authContainer.classList.add("hidden");
        setActiveNav("menu");
        scrollToId("homeMenuAnchor");
        if (!document.getElementById("homeMenuAnchor") && homePage) {
            const menuBlock = homePage.querySelector(".rounded-\\[28px\\].bg-\\[\\#1C130E\\]");
            if (menuBlock) menuBlock.scrollIntoView({ behavior: "smooth" });
        }
    }

    document.querySelectorAll("[data-nav='home']").forEach((b) => b.addEventListener("click", showHome));
    document.querySelectorAll("[data-nav='menu']").forEach((b) => b.addEventListener("click", showMenu));
    document.querySelectorAll("[data-nav='auth']").forEach((b) => b.addEventListener("click", showAuth));
    document.getElementById("brandHome")?.addEventListener("click", (e) => { e.preventDefault(); showHome(); });
    document.getElementById("btnHeaderAuth")?.addEventListener("click", () => {
        const isLogged = memberDashboard && !memberDashboard.classList.contains("hidden") || adminDashboard && !adminDashboard.classList.contains("hidden");
        if (isLogged) return;
        showAuth();
    });
    document.getElementById("btnHomeToRegister")?.addEventListener("click", showAuth);
    document.getElementById("btnHomeBottomRegister")?.addEventListener("click", showAuth);
    document.getElementById("btnHomeToMenu")?.addEventListener("click", showMenu);
    document.getElementById("btnHomeMenuCta")?.addEventListener("click", showMenu);
    document.getElementById("btnMobileNav")?.addEventListener("click", () => {
        document.getElementById("mobileNav")?.classList.toggle("hidden");
    });

    window.__warkopShowHome = showHome;
    window.__warkopShowAuth = showAuth;
}

try {
    await loadComponent("components/home.html", "appContent");
    await loadComponent("components/auth-form.html", "appContent");
    await loadComponent("components/member-dashboard.html", "appContent");
    await loadComponent("components/admin-dashboard.html", "appContent");
    const homeAnchor = document.querySelector("#homePage .rounded-\\[28px\\].bg-\\[\\#1C130E\\]");
    if (homeAnchor) homeAnchor.id = "homeMenuAnchor";
    initHomeQr();
    bindHomeNav();
    const targetAuth = document.getElementById("authContainer");
    if (targetAuth) targetAuth.classList.add("hidden");
    await import("./auth.js");
} catch (error) {
    console.error("Gagal memuat aplikasi:", error);
    const target = document.getElementById("appContent");
    if (target) target.innerHTML = '<p class="mx-auto mt-12 max-w-xl rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-center text-rose-300">Aplikasi gagal dimuat. Jalankan melalui Live Server atau HTTPS lalu coba lagi.</p>';
}
