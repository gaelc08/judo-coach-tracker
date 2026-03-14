export function createInviteDebugTools({
  buildId,
  maskEmail,
  describeJwt,
  getCurrentUser,
  getCurrentSession,
  getCurrentAccessToken,
  getInviteDebugLast = () => window.__inviteDebugLast || null,
} = {}) {
  function collectInviteDebug({ token = getCurrentAccessToken?.(), inviteEmail, ...extra } = {}) {
    const currentUser = getCurrentUser?.() || null;
    const currentSession = getCurrentSession?.() || null;
    return {
      buildId,
      href: window.location.href,
      currentUserId: currentUser?.id || null,
      currentUserEmail: maskEmail(currentUser?.email),
      currentSessionUserId: currentSession?.user?.id || null,
      currentSessionEmail: maskEmail(currentSession?.user?.email),
      sessionExpiresAt: currentSession?.expires_at || null,
      jwt: describeJwt(token),
      ...extra,
      inviteEmail: maskEmail(inviteEmail)
    };
  }

  function getInviteDebugReport() {
    return [
      '=== INVITE DEBUG REPORT START ===',
      JSON.stringify({
        generatedAt: new Date().toISOString(),
        debug: getInviteDebugLast()
      }, null, 2),
      '=== INVITE DEBUG REPORT END ==='
    ].join('\n');
  }

  async function copyInviteDebugReport() {
    const report = getInviteDebugReport();
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(report);
      } catch (e) {
        console.warn('DEBUG invite report clipboard copy failed:', e);
      }
    }
    return report;
  }

  function installGlobalDebugApis() {
    window.__getInviteDebugReport = getInviteDebugReport;
    window.__copyInviteDebugReport = copyInviteDebugReport;
  }

  return {
    collectInviteDebug,
    getInviteDebugReport,
    copyInviteDebugReport,
    installGlobalDebugApis,
  };
}
