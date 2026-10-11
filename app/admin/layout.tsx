import "./admin.css";
import type {Metadata} from "next";

export const metadata:Metadata={
 title:"Manar Store – لوحة التحكم",
 description:"لوحة تحكم Manar Store",
 applicationName:"Manar Store Admin",
 manifest:"/admin-manifest.webmanifest",
 icons:{
  icon:[{url:"/admin-icon.svg",type:"image/svg+xml"}],
  apple:[{url:"/admin-icon.svg",type:"image/svg+xml"}]
 },
 appleWebApp:{capable:true,statusBarStyle:"default",title:"Manar Store Admin"},
 robots:{index:false,follow:false}
};

export default function AdminLayout({children}:{children:React.ReactNode}){return children}

