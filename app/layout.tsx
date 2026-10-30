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
import "./floating-actions.css";

export const metadata:Metadata={
 title:{default:"المتجر",template:"%s | المتجر"},
 description:"",
 applicationName:"المتجر",
 manifest:"/manifest.webmanifest",
 icons:{
  icon:[{url:"/store-icon.svg",type:"image/svg+xml",sizes:"any"}],
  apple:[{url:"/store-icon.svg",type:"image/svg+xml",sizes:"any"}]
 },
 appleWebApp:{capable:true,statusBarStyle:"default",title:"المتجر"},
 formatDetection:{telephone:false}
};

export const viewport:Viewport={
 width:"device-width",
 initialScale:1,
 viewportFit:"cover",
 themeColor:"#475569"
};

export default function RootLayout({children}:{children:React.ReactNode}){
 return <html lang="ar" dir="rtl"><body><StoreSeo/><StoreTheme/><PwaRegister/><StoreShell>{children}</StoreShell><StickyCartBar/><CartCustomization/></body></html>
}


