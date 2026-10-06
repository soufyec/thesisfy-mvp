import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "edu.thesisfic.app",
  appName: "Thesisfic",
  webDir: "www",
  server: {
    url: process.env.THESISFIC_URL || "https://thesisfy-mvp.vercel.app",
    cleartext: false,
  },
  ios: { contentInset: "automatic", backgroundColor: "#f9fafb" },
  android: { backgroundColor: "#f9fafb", allowMixedContent: false },
};

export default config;
