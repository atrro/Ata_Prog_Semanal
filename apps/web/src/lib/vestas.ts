export const VESTAS_BLUE = "#004484";
export const VESTAS_BLUE_RGB: [number, number, number] = [0, 68, 132];

export type Logo = { data: string; width: number; height: number };

let cachedLogo: Promise<Logo | undefined> | undefined;

// O arquivo tem margens grandes; o recorte mantém apenas a marca para alinhar no cabeçalho.
export function loadLogo() {
  cachedLogo ??= (async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/vestas-logo.png`);
      if (!response.ok) throw new Error("logo");
      const bitmap = await createImageBitmap(await response.blob());
      const scale = bitmap.width / 900;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(880 * scale);
      canvas.height = Math.round(180 * scale);
      canvas.getContext("2d")?.drawImage(bitmap, 10 * scale, 160 * scale, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      return { data: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
    } catch { cachedLogo = undefined; return undefined; }
  })();
  return cachedLogo;
}
