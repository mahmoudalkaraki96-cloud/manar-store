import type { Metadata } from "next";
import "./globals.css";
import "./checkout.css";
export const metadata:Metadata={metadataBase:new URL("https://manar-store.mahmoud-alkaraki96.workers.dev"),title:"متجر منار | Manar Store",description:"تسوّق منتجات متجر منار بسهولة مع توصيل للضفة والقدس والداخل",openGraph:{title:"متجر منار | Manar Store",description:"تسوّق بسهولة مع توصيل سريع",type:"website",images:[{url:"/og.png",width:1200,height:630,alt:"متجر منار"}]},twitter:{card:"summary_large_image",title:"متجر منار | Manar Store",description:"تسوّق بسهولة مع توصيل سريع",images:["/og.png"]}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ar" dir="rtl"><body>{children}</body></html>}
