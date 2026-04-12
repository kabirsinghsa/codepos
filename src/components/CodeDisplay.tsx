import { useState } from 'react';
import { WashCode, getCodeStatus, WASH_OPTIONS } from '@/lib/codeGenerator';
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

function printReceipt(code: WashCode, businessPhone: string, businessName: string, receiptFooter: string) {
  const wash = WASH_OPTIONS.find(w => w.id === code.washType)!;
  const printWindow = window.open('', '_blank', 'width=400,height=700');
  if (!printWindow) return;

  const qrSvg = document.querySelector(`[data-qr-id="${code.id}"]`)?.innerHTML || '';
  const vehicleLabel = VEHICLE_LABELS[code.vehicleType || 'small_medium'] || code.vehicleType || 'N/A';
  const extras = code.selectedExtras || [];
  const extrasTotal = extras.reduce((sum, e) => sum + e.price, 0);
  const basePrice = code.totalWashes > 1 ? (code.price / code.totalWashes) - extrasTotal : code.price - extrasTotal;

  const extrasHtml = extras.length > 0 ? extras.map(e =>
    `<div class="row"><span class="label">${e.name}</span><span>R${e.price.toFixed(2)}</span></div>`
  ).join('') : '';

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Wash Code Receipt</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Courier New', monospace; padding: 20px; max-width: 300px; margin: 0 auto; }
        .header { text-align: center; border-bottom: 2px dashed #333; padding-bottom: 12px; margin-bottom: 12px; }
        .header h1 { font-size: 18px; margin-bottom: 4px; }
        .header p { font-size: 11px; color: #666; }
        .qr-box { text-align: center; padding: 16px; margin: 16px 0; }
        .qr-box svg { width: 180px; height: 180px; }
        .qr-box .wash-type { font-size: 14px; margin-top: 8px; font-weight: bold; }
        .qr-box .code-text { font-size: 10px; color: #999; margin-top: 4px; font-family: monospace; }
        .details { margin: 12px 0; }
        .details .row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; border-bottom: 1px dotted #ccc; }
        .details .row .label { color: #666; }
        .extras-header { font-size: 11px; font-weight: bold; margin-top: 8px; margin-bottom: 4px; text-transform: uppercase; color: #333; }
        .price-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 16px; font-weight: bold; border-top: 2px solid #000; margin-top: 8px; }
        .footer { text-align: center; margin-top: 16px; padding-top: 12px; border-top: 2px dashed #333; font-size: 10px; color: #666; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${businessName}</h1>
        <p>Wash Code Receipt</p>
        <p style="margin-top:4px;">Tel: ${businessPhone}</p>
      </div>
      <div class="qr-box">
        ${qrSvg}
        <div class="wash-type">${wash.name}</div>
        <div class="code-text">${code.code}</div>
      </div>
      <div class="details">
        <div class="row"><span class="label">Vehicle:</span><span>${vehicleLabel}</span></div>
        <div class="row"><span class="label">Wash:</span><span>${wash.name} — R${basePrice > 0 ? basePrice.toFixed(2) : '0.00'}</span></div>
        <div class="row"><span class="label">Date:</span><span>${format(new Date(code.createdAt), 'dd/MM/yyyy HH:mm')}</span></div>
        <div class="row"><span class="label">Expires:</span><span>${format(new Date(code.expiresAt), 'dd/MM/yyyy HH:mm')}</span></div>
        ${code.totalWashes > 1 ? `<div class="row"><span class="label">Washes:</span><span>${code.washesUsed}/${code.totalWashes} used</span></div>` : ''}
      </div>
      ${extras.length > 0 ? `
        <div class="extras-header">Extras</div>
        <div class="details">${extrasHtml}</div>
      ` : ''}
      <div class="price-row">
        <span>TOTAL:</span>
        <span>R${code.price.toFixed(2)}</span>
      </div>
      <div class="footer">
        <p>${receiptFooter}</p>
        <p>Valid until ${format(new Date(code.expiresAt), 'dd/MM/yyyy HH:mm')}</p>
      </div>
    </body>
    </html>
  `);

  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

export function CodeDisplay({ code, onMarkUsed, onExpiryUpdated, isAdmin = false, businessPhone = '000-000-0000', businessName = 'BULLDOG CARWASH', receiptFooter = 'Scan QR code at the wash bay to start.' }: CodeDisplayProps) {
  const status = getCodeStatus(code);
  const wash = WASH_OPTIONS.find(w => w.id === code.washType)!;
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
          <button onClick={() => printReceipt(code, businessPhone, businessName, receiptFooter)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground" title="Print">
            <Printer className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              const appUrl = `${window.location.origin}/my-codes`;
              const w = WASH_OPTIONS.find(w => w.id === code.washType)!;
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
