import "./admin.css";
import "./admin-responsive.css";
import "./live-activity.css";
import type {Metadata} from "next";

export const metadata:Metadata={
 title:"لوحة إدارة المتجر",
 description:"لوحة إدارة المتجر",
 applicationName:"إدارة المتجر",
 manifest:"/admin-manifest.webmanifest",
 icons:{
  icon:[{url:"/_store/favicon?v=1.3.0"}],
  apple:[{url:"/_store/favicon?v=1.3.0"}]
 },
 appleWebApp:{capable:true,statusBarStyle:"default",title:"إدارة المتجر"},
 robots:{index:false,follow:false}
};

export default function AdminLayout({children}:{children:React.ReactNode}){return children}

