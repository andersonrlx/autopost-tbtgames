/** @type {import('next').NextConfig} */
const nextConfig = {
  // googleapis usa módulos nativos do Node — mantê-los externos ao bundle.
  // @ffmpeg-installer/ffmpeg empacota um binário estático por plataforma;
  // marcá-lo como externo evita que o bundler do Next tente processar o
  // binário como se fosse código JS, e ajuda o output file tracing a
  // incluir o arquivo correto na função serverless.
  serverExternalPackages: ["googleapis", "@ffmpeg-installer/ffmpeg"],
};

export default nextConfig;
