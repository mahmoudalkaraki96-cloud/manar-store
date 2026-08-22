import type { Metadata } from "next";
import "./globals.css";
import "./checkout.css";
export const metadata:Metadata={title:"Manar Store | توزيعات وهدايا",description:"متجر منار للتوزيعات والهدايا والتغليف وتنسيق المناسبات",other:{"codex-preview":"development"}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ar" dir="rtl"><body>{children}</body></html>}
