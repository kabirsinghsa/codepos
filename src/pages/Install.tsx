import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Printer, ExternalLink, QrCode } from 'lucide-react';
import Footer from '@/components/Footer';

const Install = () => {
  const navigate = useNavigate();
  const currentUrl = window.location.origin;

  const qrLinks = [
    {
      title: 'Customer: My Wash Codes',
      subtitle: 'Customers scan this to view their purchased codes',
      url: `${currentUrl}/my-codes`,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10'
    },
    {
      title: 'Customer: Buy Package',
      subtitle: 'Scan to buy monthly unlimited wash packages',
      url: `${currentUrl}/buy-package`,
      color: 'text-orange-500',
      bg: 'bg-orange-500/10'
    },
    {
      title: 'Site 1: Kiosk Terminal',
      subtitle: 'Head Office tablet scanning station',
      url: `${currentUrl}/kiosk?site=Head%20Office&site_id=1`,
      color: 'text-primary',
      bg: 'bg-primary/10'
    },
    {
      title: 'Site 2: Kiosk Terminal',
      subtitle: 'Huddle tablet scanning station',
      url: `${currentUrl}/kiosk?site=Huddle&site_id=2`,
      color: 'text-primary',
      bg: 'bg-primary/10'
    },
    {
      title: 'Site 3: Kiosk Terminal',
      subtitle: 'Boksburg tablet scanning station',
      url: `${currentUrl}/kiosk?site=Boksburg&site_id=3`,
      color: 'text-primary',
      bg: 'bg-primary/10'
    }
  ];

  const handlePrint = (link: typeof qrLinks[0]) => {
    const printWindow = window.open('', '_blank', 'width=600,height=800');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Print QR Code - ${link.title}</title>
          <style>
            body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; text-align: center; }
            .container { padding: 40px; border: 4px solid #000; border-radius: 40px; max-width: 500px; }
            h1 { font-size: 32px; font-weight: 900; margin-bottom: 8px; text-transform: uppercase; }
            p { font-size: 18px; color: #666; margin-bottom: 40px; font-weight: bold; }
            .qr-placeholder { background: white; padding: 20px; display: inline-block; border: 2px solid #eee; margin-bottom: 30px; }
            .url { font-family: monospace; font-size: 14px; color: #999; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>GES CODE CONTROLLER</h1>
            <p>${link.subtitle}</p>
            <div id="qr-target" class="qr-placeholder"></div>
            <div class="url">${link.url}</div>
          </div>
          <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
          <script>
            new QRCode(document.getElementById("qr-target"), {
              text: "${link.url}",
              width: 300,
              height: 300
            });
            window.onload = () => { setTimeout(() => window.print(), 500); };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="min-h-screen bg-background font-sans">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="p-2 rounded-xl bg-primary/10 text-primary">
            <QrCode className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-black uppercase tracking-tight italic">System Installation & Deployment</h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {qrLinks.map((link, i) => (
            <Card key={i} className="overflow-hidden border-2 hover:border-primary/40 transition-all shadow-lg rounded-[2rem]">
              <CardHeader className={`${link.bg} border-b pb-6`}>
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <CardTitle className={`text-sm font-black uppercase tracking-widest ${link.color}`}>{link.title}</CardTitle>
                    <p className="text-xs text-muted-foreground font-medium">{link.subtitle}</p>
                  </div>
                  <div className={`p-3 rounded-2xl bg-background shadow-sm ${link.color}`}>
                    <QrCode className="w-5 h-5" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-8 flex flex-col items-center gap-6">
                <div className="p-4 bg-white rounded-3xl shadow-inner border-2 border-zinc-100">
                  <QRCodeSVG value={link.url} size={180} level="H" />
                </div>

                <div className="w-full space-y-2">
                  <p className="text-[10px] font-mono text-center text-muted-foreground break-all px-4">{link.url}</p>
                  <div className="grid grid-cols-2 gap-2 mt-4">
                    <Button variant="outline" size="sm" onClick={() => window.open(link.url, '_blank')} className="rounded-xl font-bold text-[10px] uppercase">
                      <ExternalLink className="w-3 h-3 mr-2" /> Visit
                    </Button>
                    <Button size="sm" onClick={() => handlePrint(link)} className="rounded-xl font-bold text-[10px] uppercase bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                      <Printer className="w-3 h-3 mr-2" /> Print Poster
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Install;
