import type { ChatUser, Permission } from "./types.js";

const permissionRank: Record<Permission, number> = {
  everyone: 0, subscriber: 1, vip: 2, moderator: 3, broadcaster: 4,
};

export function hasPermission(user: ChatUser, required: Permission = "everyone"): boolean {
  if (required === "everyone") return true;
  let userRank = 0;
  for (const role of user.roles) userRank = Math.max(userRank, permissionRank[role]);
  return userRank >= permissionRank[required];
}
