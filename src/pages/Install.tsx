import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Smartphone, Check } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const Install = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua));

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setIsInstalled(true));

    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setIsInstalled(true);
    setDeferredPrompt(null);
  };

  if (isInstalled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full text-center">
          <CardHeader>
            <div className="mx-auto w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mb-4">
              <Check className="w-8 h-8 text-green-500" />
            </div>
            <CardTitle className="text-2xl">App Installed!</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              WashCode is installed on your device. You can find it on your home screen.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full text-center">
        <CardHeader>
          <div className="mx-auto w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mb-4">
            <Smartphone className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Install WashCode</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Install this app on your phone for quick access — works offline and feels like a native app!
          </p>

          {deferredPrompt ? (
            <Button onClick={handleInstall} size="lg" className="w-full gap-2">
              <Download className="w-5 h-5" />
              Install App
            </Button>
          ) : isIOS ? (
            <div className="bg-muted rounded-lg p-4 text-left space-y-2 text-sm">
              <p className="font-semibold">To install on iPhone/iPad:</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Tap the <strong>Share</strong> button (square with arrow)</li>
                <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
                <li>Tap <strong>"Add"</strong> to confirm</li>
              </ol>
            </div>
          ) : (
            <div className="bg-muted rounded-lg p-4 text-left space-y-2 text-sm">
              <p className="font-semibold">To install:</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Open browser menu (⋮ three dots)</li>
                <li>Tap <strong>"Install app"</strong> or <strong>"Add to Home Screen"</strong></li>
              </ol>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Install;
