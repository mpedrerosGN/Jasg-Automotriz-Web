(function () {
    const SUPABASE_URL = 'https://delhuizshmainbiiptsf.supabase.co';
    const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_S7HqFxfLPH-OYb2fOMHm4Q_k9blK-L7';
    if (window.supabase && window.supabase.createClient) {
        window.jasgSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    }
})();
