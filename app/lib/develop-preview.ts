// Vercel production builds never expose the visual demo, even from develop.
export function isDevelopPreview() {
  return process.env.NODE_ENV === "development"
    || (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_GIT_COMMIT_REF === "develop");
}
