// scripts/generate-icon.js — Generate a 128x128 PNG icon for the OpenCode VSCode extension
// Uses sharp to render an enhanced SVG with gradient background

const sharp = require('sharp');
const path = require('path');

const SIZE = 128;

// Enhanced SVG with blue→purple gradient background and white layered prism icon
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <!-- Background gradient: deep blue → rich purple -->
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1a3a8a"/>
      <stop offset="50%" stop-color="#4338ca"/>
      <stop offset="100%" stop-color="#7c3aed"/>
    </linearGradient>
    <!-- Subtle inner glow -->
    <radialGradient id="glow" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.15)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
  </defs>

  <!-- Rounded rectangle background -->
  <rect width="${SIZE}" height="${SIZE}" rx="22" ry="22" fill="url(#bg)"/>
  <!-- Soft glow overlay -->
  <rect width="${SIZE}" height="${SIZE}" rx="22" ry="22" fill="url(#glow)"/>

  <!-- Layered diamond / prism shapes (scaled from the original 24-unit viewBox) -->
  <g transform="translate(${SIZE / 2}, ${SIZE / 2}) scale(4)" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <!-- Top layer: bright white -->
    <path d="M0 -10 L-10 -5 L0 0 L10 -5 Z" stroke="white" stroke-width="1.8" opacity="1"/>
    <!-- Middle layer -->
    <path d="M-10 0 L0 5 L10 0" stroke="white" stroke-width="1.8" opacity="0.75"/>
    <!-- Bottom layer -->
    <path d="M-10 5 L0 10 L10 5" stroke="white" stroke-width="1.8" opacity="0.50"/>
  </g>

  <!-- Small code brackets decoration -->
  <g fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="28,50 18,64 28,78"/>
    <polyline points="100,50 110,64 100,78"/>
  </g>
</svg>`;

async function main() {
  const outPath = path.join(__dirname, '..', 'media', 'icon.png');
  await sharp(Buffer.from(svg))
    .resize(SIZE, SIZE)
    .png()
    .toFile(outPath);

  const stats = require('fs').statSync(outPath);
  console.log(`Generated ${outPath} (${stats.size} bytes)`);
  if (stats.size < 1024) {
    console.error('WARNING: File is smaller than 1KB — may be invalid');
    process.exit(1);
  }
  console.log('Icon generation successful!');
}

main().catch(err => {
  console.error('Failed to generate icon:', err);
  process.exit(1);
});
