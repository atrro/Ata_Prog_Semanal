export const accessSessionKey = "wind-planner-access-v1";
const passwordDigest = "b53fc11cba7d968dfb51ac42531a8ec1f17ac23580f902dee3f8807780dbfc69";

export async function matchesAccessPassword(password: string): Promise<boolean> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
  const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  return hex === passwordDigest;
}