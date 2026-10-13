(function () {
    const SUPABASE_URL = 'https://xxgqizzuxcvudcpxledg.supabase.co';
    const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_yRq_ChKj9E3Fh1wjXd5RkA_aExzGOpR';
    if (window.supabase && window.supabase.createClient) {
        window.jasgSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    }
})();
