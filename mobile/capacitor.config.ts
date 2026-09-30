import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "edu.thesisfy.app",
  appName: "Thesisfy",
  webDir: "www",
  server: {
    url: process.env.THESISFY_URL || "https://thesisfy-mvp.vercel.app",
    cleartext: false,
  },
  ios: { contentInset: "automatic", backgroundColor: "#f9fafb" },
  android: { backgroundColor: "#f9fafb", allowMixedContent: false },
};

export default config;
