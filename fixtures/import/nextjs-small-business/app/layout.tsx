import { Footer } from "../components/Footer";
import { Header } from "../components/Header";
import "./styles.css";

export const metadata = { title: "Northstar Bicycle Repair" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><Header /><main>{children}</main><Footer /></body></html>;
}
