import type { ExpoConfig, ConfigContext } from "expo/config";
export default ({ config }: ConfigContext): ExpoConfig => {
  if (
    process.env.EAS_BUILD_PROFILE === "production" ||
    process.env.EAS_BUILD_PROFILE === "preview"
  ) {
    const api = process.env.EXPO_PUBLIC_API_URL;
    if (!api?.startsWith("https://"))
      throw new Error(
        "Set EXPO_PUBLIC_API_URL to the deployed HTTPS backend in the EAS build environment.",
      );
  }
  return {
    ...config,
    name: config.name || "Snap-a-Store",
    slug: config.slug || "snap-a-store",
  };
};
