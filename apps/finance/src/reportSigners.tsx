import { useEffect, useState } from 'react';
import type jsPDF from 'jspdf';

export type Signer = { label: string; name: string; title: string };

const defaults: Signer[] = [
  { label: 'Prepared By', name: 'Ryan Stephen Cascalla', title: 'Finance / Clerk' },
  { label: 'Checked By', name: 'Alvin Asi', title: 'Operation Support' },
  { label: 'Approved By', name: 'Boss Sekon Kim', title: 'Managing Director / CEO' },
];
const storageKey = 'adk.report-signers';

export function useSigners() {
  const [signers, setSigners] = useState<Signer[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
      if (Array.isArray(saved) && saved.every(s => s && typeof s.label === 'string' &&
        typeof s.name === 'string' && typeof s.title === 'string')) return saved;
    } catch {
      // Use defaults if storage is unavailable or invalid.
    }
    return defaults;
  });
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(signers));
    } catch {
      setStorageError(true);
    }
  }, [signers]);
  return { signers, setSigners, storageError };
}

export function SignerEditor({ signers, setSigners, storageError }: ReturnType<typeof useSigners>) {
  return (
    <details className="print:hidden mx-4 my-4 border-2 border-black bg-white p-4 md:mx-10">
      <summary className="cursor-pointer font-black uppercase">Report sign-offs</summary>
      <p className="my-3 text-sm">Used in cash and bank exports. Changes are saved in this browser.</p>
      {storageError && <p role="alert">Browser storage is unavailable. Changes last until you close or reload this page.</p>}
      {signers.map((signer, index) => (
        <fieldset key={index} className="my-3 flex flex-wrap items-end gap-3 border border-slate-300 p-3">
          <legend className="px-1 text-sm font-bold">Signer {index + 1}</legend>
          {(['label', 'name', 'title'] as const).map((field, fieldIndex) => (
            <label key={field} className="flex min-w-36 flex-1 flex-col text-sm font-bold">
              {['Role label', 'Name', 'Job title'][fieldIndex]}
              <input className="border border-slate-400 p-2 font-normal" value={signer[field]} maxLength={100}
                onChange={event => setSigners(current => current.map((row, i) =>
                  i === index ? { ...row, [field]: event.target.value } : row
                ))}
              />
            </label>
          ))}
          <button type="button" className="border border-black px-3 py-2 text-sm"
            aria-label={'Remove signer ' + (index + 1)}
            onClick={() => setSigners(current => current.filter((_, i) => i !== index))}>Remove</button>
        </fieldset>
      ))}
      <button type="button" className="bg-black px-4 py-2 text-sm font-bold text-white"
        onClick={() => setSigners(current => [...current, { label: 'Verified By', name: '', title: '' }])}>Add signer</button>
    </details>
  );
}

export function ReportSignatures({ signers }: { signers: Signer[] }) {
  if (!signers.length) return null;
  return (
    <div className="mt-10 grid grid-cols-3 gap-x-6 gap-y-8 border-t border-slate-200 pt-6">
      {signers.map((signer, index) => (
        <div key={index} className="min-w-0 break-words">
          <div className="mb-10 text-xs font-bold uppercase text-slate-500">{signer.label}</div>
          <div className="border-t border-slate-400 pt-2 text-sm font-bold">{signer.name}</div>
          <div className="text-xs text-slate-500">{signer.title}</div>
        </div>
      ))}
    </div>
  );
}

export function drawReportSignatures(doc: jsPDF, signers: Signer[], startY: number) {
  const width = (doc.internal.pageSize.getWidth() - 48) / 3;
  const bottom = doc.internal.pageSize.getHeight() - 16;
  let y = startY;

  for (let index = 0; index < signers.length; index += 3) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const row = signers.slice(index, index + 3).map(signer => ({
      label: doc.splitTextToSize(signer.label.toUpperCase(), width) as string[],
      name: doc.splitTextToSize(signer.name, width) as string[],
      title: doc.splitTextToSize(signer.title, width) as string[],
    }));
    const labelHeight = Math.max(...row.map(s => s.label.length)) * 4;
    const height = labelHeight + 18 + Math.max(...row.map(s => s.name.length + s.title.length)) * 4;
    if (y + height > bottom) {
      doc.addPage();
      y = 24;
    }
    row.forEach((signer, column) => {
      const x = 14 + column * (width + 10);
      const lineY = y + labelHeight + 12;
      doc.setTextColor(100, 116, 139);
      doc.text(signer.label, x, y);
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.25);
      doc.line(x, lineY, x + width, lineY);
      doc.setTextColor(15, 23, 42);
      doc.text(signer.name, x, lineY + 5);
      doc.text(signer.title, x, lineY + 5 + signer.name.length * 4);
    });
    y += height + 8;
  }
}

export function signatureImageHtml(signers: Signer[]) {
  if (!signers.length) return '';
  const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return '<div style="margin:32px;padding-top:24px;border-top:1px solid #dce1e6;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;">' +
    signers.map(signer => '<div style="overflow-wrap:anywhere;">' +
      '<div style="font-size:14px;font-weight:bold;text-transform:uppercase;color:#737d87;margin-bottom:40px;">' + escape(signer.label) + '</div>' +
      '<div style="border-top:1px solid #94a3b8;padding-top:8px;font-weight:bold;">' + escape(signer.name) + '</div>' +
      '<div style="font-size:13px;color:#64748b;">' + escape(signer.title) + '</div></div>').join('') + '</div>';
}
