import type {Metadata,Viewport} from "next";
import StoreSeo from "./components/StoreSeo";
import StoreTheme from "./components/StoreTheme";
import PwaRegister from "./components/PwaRegister";
import "./globals.css";
import "./checkout.css";
import "./watermark.css";
import "./highlights.css";

export const metadata:Metadata={
 title:{default:"منار بارتي ستور | Manar Party Store",template:"%s | Manar Store"},
 description:"قطع وإكسسوارات التوزيعات بالجملة والتجزئة",
 applicationName:"منار بارتي ستور | Manar Party Store",
 manifest:"/manifest.webmanifest",
 icons:{
  icon:[{url:"/favicon.png",type:"image/png",sizes:"192x192"}],
  apple:[{url:"/favicon.png",type:"image/png",sizes:"192x192"}]
 },
 appleWebApp:{capable:true,statusBarStyle:"default",title:"منار بارتي ستور | Manar Party Store"},
 formatDetection:{telephone:false}
};

export const viewport:Viewport={
 width:"device-width",
 initialScale:1,
 viewportFit:"cover",
 themeColor:"#b85f7d"
};

export default function RootLayout({children}:{children:React.ReactNode}){
 return <html lang="ar" dir="rtl"><body><StoreSeo/><StoreTheme/><PwaRegister/>{children}</body></html>
}
