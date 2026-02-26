export const ADMIN_PORTAL_ROLES = ['Administrator'];

export const hasAdminPortalAccess = (user) => {
  const role = String(user?.Role || user?.role || '').trim();
  return ADMIN_PORTAL_ROLES.includes(role) && Boolean(user?.Can_Access_Admin_Portal ?? true);
};

export const isGlobalAdmin = (user) => {
  if (!hasAdminPortalAccess(user)) return false;
  if (user?.Admin_Scope === 'GLOBAL') return true;
  if (user?.adminScope === 'GLOBAL') return true;
  return Boolean(user?.Is_Global_Admin || user?.isGlobalAdmin);
};

export const getAgencyId = (user) => {
  const agencyId = Number(
    user?.Agency_ID ??
    user?.agencyId ??
    user?.agency_id
  );
  return Number.isFinite(agencyId) ? agencyId : null;
};
