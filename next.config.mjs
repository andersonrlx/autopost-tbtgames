/** @type {import('next').NextConfig} */
const nextConfig = {
  // googleapis usa módulos nativos do Node — mantê-los externos ao bundle
  serverExternalPackages: ["googleapis"],
};

export default nextConfig;
