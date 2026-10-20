// Netlify uses exit 0 to skip a build, 1 to continue.
process.exit((process.env.BRANCH || '').startsWith('pruebas/') ? 0 : 1);
