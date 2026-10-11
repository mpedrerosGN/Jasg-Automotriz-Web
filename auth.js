(function () {
    async function requireAuth() {
        if (!window.jasgSupabase) return;
        const { data } = await window.jasgSupabase.auth.getSession();
        if (!data.session && !location.pathname.endsWith('login.html')) {
            location.href = 'login.html';
        }
    }
    window.jasgSignOut = async function () {
        await window.jasgSupabase.auth.signOut();
        location.href = 'login.html';
    };
    window.jasgRequireAuth = requireAuth;
    document.addEventListener('DOMContentLoaded', requireAuth);
})();
