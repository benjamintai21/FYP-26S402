export const MEMBER_ROLES = ['registered', 'premium'];
export const ALL_AUTH_ROLES = ['registered', 'premium', 'business', 'admin'];

export function homeForRole(role) {
  if (MEMBER_ROLES.includes(role)) return '/dashboard';
  if (role === 'business') return '/business';
  if (role === 'admin') return '/admin';
  return '/';
}
