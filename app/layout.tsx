import type { Metadata } from "next";
import "./globals.css";
import "./checkout.css";
export const metadata:Metadata={title:"Online Store",description:"تسوّق بسهولة من متجرنا الإلكتروني",openGraph:{title:"Online Store",description:"تسوّق بسهولة من متجرنا الإلكتروني",type:"website"},twitter:{card:"summary_large_image",title:"Online Store",description:"تسوّق بسهولة من متجرنا الإلكتروني"}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ar" dir="rtl"><body>{children}</body></html>}
