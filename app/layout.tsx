import type {Metadata,Viewport} from "next";
import StoreTheme from "./components/StoreTheme";
import PwaRegister from "./components/PwaRegister";
import "./globals.css";
import "./checkout.css";
import "./watermark.css";
import "./highlights.css";

export const metadata:Metadata={
 title:{default:"Manar Store",template:"%s | Manar Store"},
 description:"متجر منار للتوزيعات وهدايا المناسبات",
 applicationName:"Manar Store",
 manifest:"/manifest.webmanifest",
 icons:{
  icon:[{url:"/media/products%2F2026-08-22%2F81d345a6-d59d-4bf3-9ab9-1440f95da7e7.webp",type:"image/webp"}],
  apple:[{url:"/media/products%2F2026-08-22%2F81d345a6-d59d-4bf3-9ab9-1440f95da7e7.webp",type:"image/webp"}]
 },
 appleWebApp:{capable:true,statusBarStyle:"default",title:"Manar Store"},
 formatDetection:{telephone:false}
};

export const viewport:Viewport={
 width:"device-width",
 initialScale:1,
 viewportFit:"cover",
 themeColor:"#b85f7d"
};

export default function RootLayout({children}:{children:React.ReactNode}){
 return <html lang="ar" dir="rtl"><body><StoreTheme/><PwaRegister/>{children}</body></html>
}
