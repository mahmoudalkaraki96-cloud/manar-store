import StoreTheme from "./components/StoreTheme";
import CookieConsent from "./components/CookieConsent";
import "./globals.css";
import "./checkout.css";
import "./watermark.css";
import "./highlights.css";
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ar" dir="rtl"><body><StoreTheme/>{children}<CookieConsent/></body></html>}
