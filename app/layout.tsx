import type {Metadata,Viewport} from "next";
import StoreShell from "./components/StoreShell";
import StoreSeo from "./components/StoreSeo";
import StoreTheme from "./components/StoreTheme";
import PwaRegister from "./components/PwaRegister";
import StickyCartBar from "./components/StickyCartBar";
import CartCustomization from "./components/CartCustomization";
import "./sticky-cart.css";
import "./globals.css";
import "./checkout.css";
import "./watermark.css";
import "./highlights.css";
import "./store-layout.css";

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
 return <html lang="ar" dir="rtl"><body><StoreSeo/><StoreTheme/><PwaRegister/><StoreShell>{children}</StoreShell><StickyCartBar/><CartCustomization/></body></html>
}


