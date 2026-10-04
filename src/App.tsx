import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminRoute from "@/components/AdminRoute";
import ThemeSettings from "./pages/ThemeSettings";
import Index from "./pages/Index";
import Kiosk from "./pages/Kiosk";

import Reports from "./pages/Reports";
import UserManagement from "./pages/UserManagement";
import WashPricing from "./pages/WashPricing";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import MyCodes from "./pages/MyCodes";
import Packages from "./pages/Packages";
import Install from "./pages/Install";
import PosProducts from "./pages/PosProducts";
import Pos from "./pages/Pos";
import Sites from "./pages/Sites";
import Payments from "./pages/Payments";
import SiteWashes from "./pages/SiteWashes";
import BuyPackage from "./pages/BuyPackage";
import PackageOrders from "./pages/PackageOrders";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ThemeProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/kiosk" element={<Kiosk />} />
            <Route path="/buy-package" element={<BuyPackage />} />
            <Route path="/my-codes" element={<MyCodes />} />
            <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            
            <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
            <Route path="/users" element={<AdminRoute><UserManagement /></AdminRoute>} />
            <Route path="/payments" element={<AdminRoute><Payments /></AdminRoute>} />
            <Route path="/pricing" element={<AdminRoute><WashPricing /></AdminRoute>} />
            <Route path="/packages" element={<ProtectedRoute><Packages /></ProtectedRoute>} />
            <Route path="/pos" element={<ProtectedRoute><Pos /></ProtectedRoute>} />
            <Route path="/pos-products" element={<AdminRoute><PosProducts /></AdminRoute>} />
            <Route path="/sites" element={<ProtectedRoute><Sites /></ProtectedRoute>} />
            <Route path="/site-washes" element={<ProtectedRoute><SiteWashes /></ProtectedRoute>} />
            <Route path="/package-orders" element={<AdminRoute><PackageOrders /></AdminRoute>} />
            <Route path="/theme" element={<AdminRoute><ThemeSettings /></AdminRoute>} />
            <Route path="/install" element={<Install />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
