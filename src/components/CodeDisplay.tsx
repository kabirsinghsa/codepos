import { useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WashCode, getCodeStatus, WASH_OPTIONS } from '@/lib/codeGenerator';

// Newer codes carry their own per-site wash name
const washInfo = (code: WashCode) =>
  code.washName ? { name: code.washName } : (WASH_OPTIONS.find(w => w.id === code.washType) || { name: 'Wash' });
import { format } from 'date-fns';
import { Printer, Share2, CalendarClock, Check, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';

const statusStyles = {
  active: 'bg-success/10 text-success border-success/30',
  used: 'bg-muted text-muted-foreground border-border',
  expired: 'bg-destructive/10 text-destructive border-destructive/30',
};

const VEHICLE_LABELS: Record<string, string> = {
  any: 'Any vehicle',
  small_medium: 'Small/Medium',
  bakkie_suv: 'Bakkie/SUV',
  quantum: 'Quantum',
};

interface CodeDisplayProps {
  code: WashCode;
  onMarkUsed?: (id: string) => void;
  onExpiryUpdated?: (id: string, newExpiry: Date) => void;
  isAdmin?: boolean;
  businessPhone?: string;
  businessName?: string;
  receiptFooter?: string;
  siteName?: string;
}

function printReceipt(code: WashCode, businessPhone: string, businessName: string, receiptFooter: string, siteName: string) {
  const esc = (v: string) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
  const money = (n: number) => `R${Number(n).toFixed(2)}`;
  const wash = washInfo(code);
  // Build the QR fresh (black on white) so it prints even if the card's QR isn't on screen
  const qrSvg = renderToStaticMarkup(<QRCodeSVG value={code.code} size={190} level="M" includeMargin bgColor="#ffffff" fgColor="#000000" />);
  const vehicleLabel = code.vehicleType && code.vehicleType !== 'any' ? (VEHICLE_LABELS[code.vehicleType] || code.vehicleType) : '';
  const extras = code.selectedExtras || [];
  const extrasTotal = extras.reduce((sum, e) => sum + Number(e.price), 0);
  const washes = code.totalWashes || 1;
  const perWash = washes > 1 ? code.price / washes : code.price;
  const basePrice = Math.max(0, perWash - extrasTotal);
  const created = format(new Date(code.createdAt), 'dd/MM/yyyy HH:mm');
  const expires = format(new Date(code.expiresAt), 'dd/MM/yyyy HH:mm');
  const spaced = code.code.replace(/(\d{3})(\d{3})/, '$1 $2');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Wash code ${esc(code.code)}</title>
    <style>
      @page { margin: 0; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      html, body { background: #fff; }
      body { font-family: 'Courier New', Courier, monospace; color: #000; font-size: 12px; line-height: 1.35;
             width: 100%; max-width: 72mm; margin: 0 auto; padding: 3mm 2mm 6mm; }
      .center { text-align: center; }
      .site { font-size: 17px; font-weight: 900; text-transform: uppercase; word-wrap: break-word; }
      .biz { font-size: 11px; font-weight: 700; text-transform: uppercase; }
      .muted { font-size: 11px; }
      .sep { border-top: 1px dashed #000; margin: 6px 0; }
      .row { display: flex; justify-content: space-between; gap: 6px; }
      .wash { font-size: 15px; font-weight: 900; text-transform: uppercase; margin-top: 2px; }
      .qr { margin: 4px auto 0; width: 46mm; max-width: 100%; }
      .qr svg { width: 100%; height: auto; display: block; }
      .code { font-size: 26px; font-weight: 900; letter-spacing: 3px; margin-top: 2px; }
      .hint { font-size: 10px; }
      .total { font-size: 16px; font-weight: 900; }
      .footer { text-align: center; margin-top: 6px; font-size: 11px; }
    </style></head>
    <body>
      <div class="center">
        <div class="site">${esc(siteName || businessName)}</div>
        ${siteName ? `<div class="biz">${esc(businessName)}</div>` : ''}
        ${businessPhone ? `<div class="muted">Tel: ${esc(businessPhone)}</div>` : ''}
      </div>
      <div class="sep"></div>
      <div class="center">
        <div class="muted">WASH CODE</div>
        <div class="wash">${esc(wash.name)}</div>
        <div class="qr">${qrSvg}</div>
        <div class="code">${spaced}</div>
        <div class="hint">Scan the QR at the bay, or tap ENTER CODE and type the number</div>
      </div>
      <div class="sep"></div>
      ${vehicleLabel ? `<div class="row"><span>Vehicle</span><span>${esc(vehicleLabel)}</span></div>` : ''}
      <div class="row"><span>${esc(wash.name)}</span><span>${money(basePrice)}</span></div>
      ${extras.map(e => `<div class="row"><span>+ ${esc(e.name)}</span><span>${money(Number(e.price))}</span></div>`).join('')}
      ${washes > 1 ? `<div class="row"><span>Washes</span><span>${washes} x ${money(perWash)}</span></div>` : ''}
      <div class="sep"></div>
      <div class="row total"><span>TOTAL</span><span>${money(code.price)}</span></div>
      <div class="sep"></div>
      <div class="row muted"><span>Sold</span><span>${created}</span></div>
      <div class="row muted"><span>Valid until</span><span>${expires}</span></div>
      ${washes > 1 ? `<div class="row muted"><span>Used</span><span>${code.washesUsed}/${washes}</span></div>` : ''}
      <div class="sep"></div>
      <div class="footer">${esc(receiptFooter)}</div>
    </body></html>`;

  // Use iframe for reliable printing (avoids popup blockers)
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.top = '-10000px';
  iframe.style.left = '-10000px';
  iframe.style.width = '80mm';
  iframe.style.height = '200mm';   // a zero-height frame prints blank on some Android printers
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (iframeDoc) {
    iframeDoc.open();
    iframeDoc.write(html);
    iframeDoc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        const w = window.open('', '_blank', 'width=400,height=600');
        if (w) {
          w.document.write(html);
          w.document.close();
          setTimeout(() => { w.focus(); w.print(); setTimeout(() => w.close(), 1000); }, 300);
        }
      }
      setTimeout(() => { try { document.body.removeChild(iframe); } catch {} }, 3000);
    }, 500);
  }
}

export function CodeDisplay({ code, onMarkUsed, onExpiryUpdated, isAdmin = false, businessPhone = '000-000-0000', businessName = 'GES CODE CONTROLLER', receiptFooter = 'Scan QR code at the wash bay to start.', siteName = '' }: CodeDisplayProps) {
  const status = getCodeStatus(code);
  const wash = washInfo(code);
  const vehicleLabel = VEHICLE_LABELS[code.vehicleType || 'small_medium'] || code.vehicleType || '';
  const extras = code.selectedExtras || [];
  const [editingExpiry, setEditingExpiry] = useState(false);
  const [newExpiry, setNewExpiry] = useState('');
  const [saving, setSaving] = useState(false);

  const handleEditExpiry = () => {
    const d = new Date(code.expiresAt);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setNewExpiry(local);
    setEditingExpiry(true);
  };

  const handleSaveExpiry = async () => {
    if (!newExpiry) return;
    setSaving(true);
    const expiryDate = new Date(newExpiry);
    const { error } = await supabase
      .from('wash_codes')
      .update({ expires_at: expiryDate.toISOString() } as any)
      .eq('id', code.id);
    setSaving(false);
    if (error) {
      toast.error('Failed to update expiry');
    } else {
      toast.success('Expiry date updated');
      setEditingExpiry(false);
      onExpiryUpdated?.(code.id, expiryDate);
    }
  };

  return (
    <div className={`premium-card p-4 ${status === 'active' ? '!border-primary/20' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[9px] px-2 py-0.5 rounded-md border font-medium uppercase tracking-wider ${statusStyles[status]}`}>
            {status}
          </span>
          <span className="text-xs text-muted-foreground">{wash.name}</span>
          <span className="text-[10px] text-muted-foreground/70">• {vehicleLabel}</span>
          {code.totalWashes > 1 && (
            <span className="text-xs font-mono font-semibold text-primary">
              {code.washesUsed}/{code.totalWashes}
            </span>
          )}
          <span className="text-xs font-mono font-bold text-primary">R{code.price.toFixed(2)}</span>
        </div>
        <div className="flex items-center gap-1">
          {isAdmin && (
            <button onClick={handleEditExpiry} className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground" title="Change expiry">
              <CalendarClock className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={() => printReceipt(code, businessPhone, businessName, receiptFooter, siteName)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground" title="Print">
            <Printer className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              const appUrl = `${window.location.origin}/my-codes`;
              const w = washInfo(code);
              const message = `Your ${w.name} wash code is ready!\n\nCode: ${code.code}\nPrice: R${code.price.toFixed(2)}\n\nView: ${appUrl}`;
              if (navigator.share) {
                navigator.share({ title: 'Wash Code', text: message, url: appUrl });
              } else {
                const waUrl = `https://wa.me/${code.customerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
                window.open(waUrl, '_blank');
              }
            }}
            className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
            title="Share"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>
          {status === 'active' && onMarkUsed && (
            <button onClick={() => onMarkUsed(code.id)} className="text-[9px] font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-secondary uppercase tracking-wider">
              Mark Used
            </button>
          )}
        </div>
      </div>

      {editingExpiry && (
        <div className="flex items-center gap-2 mb-3 p-2 rounded-lg bg-secondary border border-border">
          <Input type="datetime-local" value={newExpiry} onChange={(e) => setNewExpiry(e.target.value)} className="text-xs font-mono bg-background border-border h-8 w-auto rounded-lg" />
          <button onClick={handleSaveExpiry} disabled={saving} className="p-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors" title="Save">
            <Check className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setEditingExpiry(false)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground" title="Cancel">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="flex items-center gap-4">
        <div data-qr-id={code.id} className={`p-2 rounded-lg bg-white ${status !== 'active' ? 'opacity-30' : ''}`}>
          <QRCodeSVG value={code.code} size={72} level="M" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="font-mono text-sm text-muted-foreground">{code.code}</span>
          {extras.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {extras.map((e, i) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-md bg-secondary text-muted-foreground border border-border">
                  {e.name} R{e.price}
                </span>
              ))}
            </div>
          )}
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground/60 font-mono">
            <span>{format(new Date(code.createdAt), 'dd/MM/yy HH:mm')}</span>
            <span>→ {format(new Date(code.expiresAt), 'dd/MM/yy HH:mm')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
