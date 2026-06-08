/**
 * Renderiza o logo BepeAI (mesmo SVG do LogoBrain) como PNG base64 via Canvas.
 * Incluído automaticamente em todo PDF gerado.
 */

let cached: string | null = null;

export async function getBepeLogoBase64(): Promise<string> {
  if (cached) return cached;

  return new Promise<string>((resolve) => {
    const size = 160;
    const svgStr = `
      <svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bgGrad" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#5B3DF5"/>
            <stop offset="100%" stop-color="#3B1DFF"/>
          </linearGradient>
        </defs>
        <rect x="40" y="40" width="432" height="432" rx="90" fill="url(#bgGrad)"/>
        <g stroke="white" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" fill="none">
          <path d="M210 150 C170 150 145 180 145 215 C120 220 105 245 105 275 C105 310 130 335 160 338 C165 375 190 395 220 395"/>
          <path d="M302 150 C342 150 367 180 367 215 C392 220 407 245 407 275 C407 310 382 335 352 338 C347 375 322 395 292 395"/>
          <path d="M256 130 L256 395"/>
          <line x1="175" y1="220" x2="220" y2="220"/>
          <circle cx="165" cy="220" r="8" fill="white" stroke="none"/>
          <line x1="165" y1="275" x2="220" y2="275"/>
          <circle cx="155" cy="275" r="8" fill="white" stroke="none"/>
          <line x1="180" y1="330" x2="220" y2="330"/>
          <circle cx="170" cy="330" r="8" fill="white" stroke="none"/>
          <line x1="292" y1="220" x2="337" y2="220"/>
          <circle cx="347" cy="220" r="8" fill="white" stroke="none"/>
          <line x1="292" y1="275" x2="347" y2="275"/>
          <circle cx="357" cy="275" r="8" fill="white" stroke="none"/>
          <line x1="292" y1="330" x2="332" y2="330"/>
          <circle cx="342" cy="330" r="8" fill="white" stroke="none"/>
        </g>
      </svg>`;

    const blob = new Blob([svgStr], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, size, size);
      URL.revokeObjectURL(url);
      cached = canvas.toDataURL('image/png');
      resolve(cached);
    };
    img.onerror = () => {
      // Fallback: badge simples se SVG falhar
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      const grad = ctx.createLinearGradient(0, 0, size, size);
      grad.addColorStop(0, '#5B3DF5');
      grad.addColorStop(1, '#3B1DFF');
      const r = size * 0.18;
      ctx.beginPath();
      ctx.moveTo(r, 0); ctx.lineTo(size - r, 0);
      ctx.quadraticCurveTo(size, 0, size, r);
      ctx.lineTo(size, size - r);
      ctx.quadraticCurveTo(size, size, size - r, size);
      ctx.lineTo(r, size);
      ctx.quadraticCurveTo(0, size, 0, size - r);
      ctx.lineTo(0, r);
      ctx.quadraticCurveTo(0, 0, r, 0);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `bold ${size * 0.55}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('B', size / 2, size / 2 + 2);
      cached = canvas.toDataURL('image/png');
      resolve(cached);
    };
    img.src = url;
  });
}
