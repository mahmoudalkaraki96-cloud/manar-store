import StoreTheme from "./components/StoreTheme";
import "./globals.css";
import "./checkout.css";
import "./watermark.css";
import "./highlights.css";
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ar" dir="rtl"><body><StoreTheme/>{children}</body></html>}
