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

try {
    await loadComponent("components/auth-form.html", "appContent");
    await loadComponent("components/member-dashboard.html", "appContent");
    await loadComponent("components/admin-dashboard.html", "appContent");
    await import("./auth.js");
} catch (error) {
    console.error("Gagal memuat aplikasi:", error);
    const target = document.getElementById("appContent");
    if (target) target.innerHTML = '<p class="mx-auto mt-12 max-w-xl rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-center text-rose-300">Aplikasi gagal dimuat. Jalankan melalui Live Server atau HTTPS lalu coba lagi.</p>';
}
