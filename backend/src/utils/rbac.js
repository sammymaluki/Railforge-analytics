const ADMIN_PORTAL_ROLES = ['Administrator'];

const normalizeRole = (role) => String(role || '').trim();

const parseCsvEnv = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const SUPER_ADMIN_USERNAMES = parseCsvEnv(process.env.SUPER_ADMIN_USERNAMES).map((v) => v.toLowerCase());
const SUPER_ADMIN_EMAILS = parseCsvEnv(process.env.SUPER_ADMIN_EMAILS).map((v) => v.toLowerCase());
const SUPER_ADMIN_USER_IDS = parseCsvEnv(process.env.SUPER_ADMIN_USER_IDS)
  .map((v) => Number(v))
  .filter(Number.isFinite);

const hasAdminPortalAccess = (user) => {
  const role = normalizeRole(user?.Role || user?.role);
  return ADMIN_PORTAL_ROLES.includes(role);
};

const isGlobalAdmin = (user) => {
  if (!hasAdminPortalAccess(user)) return false;

  // Optional DB-backed flag if present in projection.
  if (user?.Is_Global_Admin === true || Number(user?.Is_Global_Admin) === 1) {
    return true;
  }

  const username = String(user?.Username || user?.username || '').toLowerCase();
  const email = String(user?.Email || user?.email || '').toLowerCase();
  const userId = Number(user?.User_ID || user?.userId || user?.user_id);

  if (username === 'admin' || userId === 1) return true;

  if (username && SUPER_ADMIN_USERNAMES.includes(username)) return true;
  if (email && SUPER_ADMIN_EMAILS.includes(email)) return true;
  if (Number.isFinite(userId) && SUPER_ADMIN_USER_IDS.includes(userId)) return true;

  return false;
};

const getAdminScope = (user) => {
  if (!hasAdminPortalAccess(user)) return null;
  return isGlobalAdmin(user) ? 'GLOBAL' : 'AGENCY';
};

const canAccessAgency = (user, agencyId) => {
  if (!Number.isFinite(Number(agencyId))) return false;
  if (isGlobalAdmin(user)) return true;
  return Number(user?.Agency_ID) === Number(agencyId);
};

module.exports = {
  ADMIN_PORTAL_ROLES,
  hasAdminPortalAccess,
  isGlobalAdmin,
  getAdminScope,
  canAccessAgency,
};
