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
  icon:[{url:"/_store/favicon?v=1.2.2"}],
  apple:[{url:"/_store/favicon?v=1.2.2"}]
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


