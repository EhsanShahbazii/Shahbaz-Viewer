/**
 * Utility to generate a valid PDF 1.4 document containing an embedded image.
 */
export function createPdfFromJpeg(jpegBuffer: Uint8Array, width: number, height: number): Uint8Array {
  const mediaW = width;
  const mediaH = height;

  const header = '%PDF-1.4\n';
  const obj1 = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  const obj2 = '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n';
  const obj3 = `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${mediaW} ${mediaH}] /Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n`;
  const streamContent = `q\n${mediaW} 0 0 ${mediaH} 0 0 cm\n/Im1 Do\nQ\n`;
  const obj4 = `4 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}endstream\nendobj\n`;
  const obj5Header = `5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBuffer.length} >>\nstream\n`;
  const obj5Footer = '\nendstream\nendobj\n';

  const o1 = header.length;
  const o2 = o1 + obj1.length;
  const o3 = o2 + obj2.length;
  const o4 = o3 + obj3.length;
  const o5 = o4 + obj4.length;
  const oEnd = o5 + obj5Header.length + jpegBuffer.length + obj5Footer.length;

  const xref =
    'xref\n0 6\n0000000000 65535 f \n' +
    `${String(o1).padStart(10, '0')} 00000 n \n` +
    `${String(o2).padStart(10, '0')} 00000 n \n` +
    `${String(o3).padStart(10, '0')} 00000 n \n` +
    `${String(o4).padStart(10, '0')} 00000 n \n` +
    `${String(o5).padStart(10, '0')} 00000 n \n`;
  const trailer = `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${oEnd}\n%%EOF\n`;

  const enc = new TextEncoder();
  const part1 = enc.encode(header + obj1 + obj2 + obj3 + obj4 + obj5Header);
  const part2 = jpegBuffer;
  const part3 = enc.encode(obj5Footer + xref + trailer);

  const totalLength = part1.length + part2.length + part3.length;
  const result = new Uint8Array(totalLength);
  result.set(part1, 0);
  result.set(part2, part1.length);
  result.set(part3, part1.length + part2.length);

  return result;
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}
