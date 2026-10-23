import qrcode from 'qrcode-generator';
import { useMemo } from 'react';

/** QR em SVG gerado no próprio navegador: funciona sem internet e imprime nítido. */
export function CodigoQr({ texto, tamanho = 112 }: { texto: string; tamanho?: number }) {
  const svg = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(texto);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }, [texto]);

  return (
    <div
      role="img"
      aria-label="Código QR para conferir esta consulta"
      style={{ width: tamanho, height: tamanho, flex: 'none' }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
